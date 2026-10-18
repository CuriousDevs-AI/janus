import re

from fastapi import Request
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.service import record
from janus_api.core.errors import ApiError
from janus_api.core.security import digest, now, random_token
from janus_api.core.tenancy import set_context
from janus_api.org.service import lock_workspace
from janus_api.sources import schemas
from janus_api.sources.ingest import event_key, parse_json, read_body, store_event
from janus_api.sources.models import ApiKey, SourceConnection
from janus_api.sources.service import get_connection


def key_out(key: ApiKey) -> schemas.ApiKeyOut:
    return schemas.ApiKeyOut(
        id=str(key.id),
        name=key.name,
        prefix=key.prefix,
        scopes=key.scopes,
        expiresAt=key.expires_at,
        revokedAt=key.revoked_at,
        lastUsedAt=key.last_used_at,
        createdAt=key.created_at,
    )


async def create_key(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    connection_id: int,
    data: schemas.ApiKeyCreate,
    ip: str,
) -> schemas.ApiKeySecret:
    await lock_workspace(db, tenant_id, user_id, "sources:manage")
    connection = await get_connection(db, connection_id)
    if connection.kind != "api_key":
        raise ApiError("invalid_source", "API keys belong to REST API sources.", 422)
    token = "janus_" + random_token()
    key = ApiKey(
        tenant_id=tenant_id,
        connection_id=connection_id,
        name=data.name,
        key_hash=digest(token),
        prefix=token[:14],
        scopes=data.scopes,
        expires_at=data.expiresAt,
    )
    db.add(key)
    await db.flush()
    record(
        db,
        "api_key.created",
        tenant_id=tenant_id,
        user_id=user_id,
        ip=ip,
        details={"connection_id": connection_id, "key_id": key.id},
    )
    return schemas.ApiKeySecret(**key_out(key).model_dump(), key=token)


async def list_keys(
    db: AsyncSession, connection_id: int, after_id: int, limit: int
) -> list[schemas.ApiKeyOut]:
    await get_connection(db, connection_id)
    return [
        key_out(key)
        for key in (
            await db.scalars(
                select(ApiKey)
                .where(ApiKey.connection_id == connection_id, ApiKey.id > after_id)
                .order_by(ApiKey.id)
                .limit(limit)
            )
        ).all()
    ]


async def revoke_key(
    db: AsyncSession, tenant_id: int, user_id: int, connection_id: int, key_id: int, ip: str
) -> None:
    await lock_workspace(db, tenant_id, user_id, "sources:manage")
    await get_connection(db, connection_id)
    key = await db.scalar(
        select(ApiKey)
        .where(ApiKey.id == key_id, ApiKey.connection_id == connection_id)
        .with_for_update()
    )
    if key is None:
        raise ApiError("not_found", "API key not found.", 404)
    if key.revoked_at is None:
        key.revoked_at = now()
        record(
            db,
            "api_key.revoked",
            tenant_id=tenant_id,
            user_id=user_id,
            ip=ip,
            details={"connection_id": connection_id, "key_id": key.id},
        )


async def receive(db: AsyncSession, public_key: str, request: Request) -> schemas.ReceiptOut:
    body = await read_body(request)
    authorization = request.headers.get("Authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not re.fullmatch(r"janus_[A-Za-z0-9_-]{43}", token):
        raise ApiError("invalid_api_key", "Invalid or expired API key.", 401)
    tenant_id = await db.scalar(
        text("SELECT public.api_key_tenant(:hash)"), {"hash": digest(token)}
    )
    if tenant_id is None:
        raise ApiError("invalid_api_key", "Invalid or expired API key.", 401)
    await set_context(db, tenant_id=int(tenant_id))
    key = (await db.scalars(select(ApiKey).where(ApiKey.key_hash == digest(token)))).one()
    connection = await db.scalar(
        select(SourceConnection)
        .where(SourceConnection.id == key.connection_id, SourceConnection.public_key == public_key)
        .with_for_update()
    )
    if connection is None or connection.kind != "api_key" or connection.status != "connected":
        raise ApiError("forbidden", "This API key cannot ingest into this source.", 403)
    await db.refresh(key, with_for_update=True)
    if (
        key.revoked_at
        or (key.expires_at and key.expires_at <= now())
        or "leads:ingest" not in key.scopes
    ):
        raise ApiError("invalid_api_key", "Invalid or expired API key.", 401)
    receipt = await store_event(
        db, connection, parse_json(body), body, event_key(request.headers.get("Idempotency-Key"))
    )
    key.last_used_at = now()
    return receipt
