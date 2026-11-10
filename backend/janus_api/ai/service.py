from datetime import datetime
from decimal import Decimal
from pathlib import Path

from cryptography.fernet import InvalidToken
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.ai import gateway, schemas
from janus_api.ai.models import AICredential, AIUsage
from janus_api.audit.service import record
from janus_api.core.config import get_settings
from janus_api.core.errors import ApiError
from janus_api.core.security import cipher, now
from janus_api.org.service import lock_workspace


def credential_out(row: AICredential) -> schemas.CredentialOut:
    return schemas.CredentialOut.model_validate(
        {
            "id": str(row.id),
            "provider": row.provider,
            "model": row.model,
            "keyLastFour": row.key_last_four,
            "baseUrl": row.base_url,
            "enabled": row.enabled,
            "createdAt": row.created_at,
            "updatedAt": row.updated_at,
        }
    )


async def list_credentials(db: AsyncSession) -> list[schemas.CredentialOut]:
    rows = await db.scalars(select(AICredential).order_by(AICredential.id))
    return [credential_out(row) for row in rows]


async def put_credential(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    provider: schemas.Provider,
    data: schemas.CredentialPut,
    ip: str,
) -> schemas.CredentialOut:
    await lock_workspace(db, tenant_id, user_id, "ai:manage")
    base_url = str(data.baseUrl).rstrip("/") if data.baseUrl else None
    validate_endpoint(provider, base_url)
    row = await db.scalar(select(AICredential).where(AICredential.provider == provider))
    if row is None:
        if data.apiKey is None:
            raise ApiError("api_key_required", "Provide an API key for this provider.", 422)
        row = AICredential(tenant_id=tenant_id, provider=provider)
        db.add(row)
    if data.apiKey is not None:
        key = data.apiKey.get_secret_value()
        row.secret_encrypted = cipher().encrypt(key.encode()).decode()
        row.key_last_four = key[-4:]
    row.model, row.base_url, row.enabled, row.updated_at = data.model, base_url, data.enabled, now()
    await db.flush()
    record(
        db,
        "ai.credential_saved",
        tenant_id=tenant_id,
        user_id=user_id,
        ip=ip,
        details={"provider": provider, "credential_id": row.id},
    )
    return credential_out(row)


def validate_endpoint(provider: str, base_url: str | None) -> None:
    if provider == "openai_compatible":
        allowed = {str(url).rstrip("/") for url in get_settings().ai_allowed_base_urls}
        if base_url is None or base_url not in allowed:
            raise ApiError(
                "ai_endpoint_not_allowed",
                "This custom AI endpoint is not enabled for this deployment.",
                422,
            )
    elif base_url is not None:
        raise ApiError("invalid_ai_endpoint", "Only custom providers accept a base URL.", 422)


async def get_credential(db: AsyncSession, provider: schemas.Provider) -> AICredential:
    row = await db.scalar(select(AICredential).where(AICredential.provider == provider))
    if row is None:
        raise ApiError("not_found", "AI provider is not configured.", 404)
    return row


async def delete_credential(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    provider: schemas.Provider,
    ip: str,
) -> None:
    await lock_workspace(db, tenant_id, user_id, "ai:manage")
    row = await get_credential(db, provider)
    await db.delete(row)
    record(
        db,
        "ai.credential_deleted",
        tenant_id=tenant_id,
        user_id=user_id,
        ip=ip,
        details={"provider": provider},
    )


async def complete(
    db: AsyncSession,
    provider: schemas.Provider,
    messages: list[schemas.Message],
    *,
    feature: str,
    max_tokens: int = 512,
) -> schemas.CompletionOut:
    row = await get_credential(db, provider)
    if not row.enabled:
        raise ApiError("ai_provider_disabled", "This AI provider is disabled.", 409)
    validate_endpoint(provider, row.base_url)
    try:
        key = cipher().decrypt(row.secret_encrypted.encode()).decode()
    except InvalidToken as error:
        raise ApiError(
            "encryption_unavailable", "AI credential cannot be decrypted.", 503
        ) from error
    return await gateway.complete(row, key, messages, feature=feature, max_tokens=max_tokens)


async def test_connection(db: AsyncSession, provider: schemas.Provider) -> schemas.CompletionOut:
    prompt = Path(__file__).with_name("prompts").joinpath("connection_test.txt").read_text()
    return await complete(
        db,
        provider,
        [schemas.Message(role="user", content=prompt)],
        feature="connection_test",
        max_tokens=64,
    )


async def list_usage(db: AsyncSession, after_id: int, limit: int) -> list[schemas.UsageOut]:
    rows = await db.scalars(
        select(AIUsage).where(AIUsage.id > after_id).order_by(AIUsage.id).limit(limit)
    )
    return [gateway.usage_out(row) for row in rows]


async def spent_since(db: AsyncSession, feature: str, since: datetime) -> Decimal:
    """What one feature has cost this company since a moment, in US dollars, as priced by the
    provider's published rates. Calls whose price is unknown count as nothing."""
    total = await db.scalar(
        select(func.coalesce(func.sum(AIUsage.cost_usd), 0)).where(
            AIUsage.feature == feature, AIUsage.created_at >= since
        )
    )
    return Decimal(total or 0)


async def converse(
    db: AsyncSession,
    provider: schemas.Provider,
    system: str,
    turns: list[tuple[str, str]],
    *,
    feature: str,
    max_tokens: int = 700,
) -> schemas.CompletionOut:
    """One answer from this company's model: a system prompt, then (role, text) turns, the last
    from the user. For other modules, which do not build provider messages themselves."""
    messages = [schemas.Message(role="system", content=system)]
    messages += [
        schemas.Message(role="user" if r == "user" else "assistant", content=t) for r, t in turns
    ]
    return await complete(db, provider, messages, feature=feature, max_tokens=max_tokens)


async def save_key(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    provider: str,
    fields: dict[str, object],
    ip: str,
) -> schemas.CredentialOut:
    """Saves a provider's model and key for this company from plain fields, for other modules;
    the same checks as the AI settings apply."""
    if provider not in ("openai", "anthropic", "gemini", "openai_compatible"):
        raise ApiError("not_found", "Unknown AI provider.", 404)
    try:
        data = schemas.CredentialPut.model_validate(fields)
    except ValidationError as error:
        message = error.errors()[0].get("msg", "Invalid AI settings.")
        raise ApiError("invalid_ai_settings", str(message), 422) from None
    return await put_credential(db, tenant_id, user_id, provider, data, ip)  # type: ignore[arg-type]
