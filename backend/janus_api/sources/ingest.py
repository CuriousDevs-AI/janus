import hashlib
import hmac
import json
import re
from time import time
from urllib.parse import parse_qsl

from fastapi import Request
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.core.errors import ApiError
from janus_api.core.security import now
from janus_api.core.tenancy import set_context
from janus_api.sources.models import IngestReceipt, RawEvent, SourceConnection
from janus_api.sources.presets import source_value, value_at
from janus_api.sources.schemas import ReceiptOut
from janus_api.sources.service import webhook_secret
from janus_api.worker.service import enqueue

MAX_PAYLOAD = 256 * 1024


async def read_body(request: Request) -> bytes:
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_PAYLOAD:
            raise ApiError("payload_too_large", "Payload exceeds 256 KB.", 413)
    return bytes(body)


def reject_constant(value: str) -> None:
    raise ValueError("Non-finite JSON number")


async def resolve_connection(db: AsyncSession, public_key: str, kind: str) -> SourceConnection:
    if not re.fullmatch(r"[A-Za-z0-9_-]{43}", public_key):
        raise ApiError("not_found", "Source not found.", 404)
    tenant_id = await db.scalar(text("SELECT public.webhook_tenant(:key)"), {"key": public_key})
    if tenant_id is None:
        raise ApiError("not_found", "Source not found.", 404)
    await set_context(db, tenant_id=int(tenant_id))
    connection = await db.scalar(
        select(SourceConnection).where(SourceConnection.public_key == public_key).with_for_update()
    )
    if connection is None or connection.status != "connected" or connection.kind != kind:
        raise ApiError("not_found", "Source not found.", 404)
    return connection


def event_key(value: object) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9._:-]{1,128}", value):
        raise ApiError(
            "invalid_event_id", "Provide a stable event ID (1–128 allowed characters).", 422
        )
    return value


async def receive(
    db: AsyncSession, public_key: str, request: Request
) -> tuple[ReceiptOut | None, int]:
    body = await read_body(request)
    connection = await resolve_connection(db, public_key, "webhook")
    secret = webhook_secret(connection)
    if connection.preset == "custom":
        if request.method != "POST":
            raise ApiError("method_not_allowed", "Custom webhooks require POST.", 405)
        timestamp = request.headers.get("X-Janus-Timestamp", "")
        key = request.headers.get("Idempotency-Key", "")
        if (
            not re.fullmatch(r"[0-9]{10,12}", timestamp)
            or abs(time() - int(timestamp)) > 300
            or not re.fullmatch(r"[A-Za-z0-9._:-]{1,128}", key)
        ):
            raise ApiError("invalid_signature", "Invalid webhook authentication.", 401)
        expected = (
            "sha256="
            + hmac.new(
                secret.encode(),
                timestamp.encode() + b"." + key.encode() + b"." + body,
                hashlib.sha256,
            ).hexdigest()
        )
        if not hmac.compare_digest(
            request.headers.get("X-Janus-Signature", "").encode(), expected.encode()
        ):
            raise ApiError("invalid_signature", "Invalid webhook authentication.", 401)
        return await store_event(db, connection, parse_json(body), body, key), 202
    if request.method == "GET":
        if connection.preset not in {"exotel", "knowlarity"}:
            raise ApiError("method_not_allowed", "This provider requires POST.", 405)
        if len(request.scope.get("query_string", b"")) > MAX_PAYLOAD:
            raise ApiError("payload_too_large", "Payload exceeds 256 KB.", 413)
        pairs = request.query_params.multi_items()
        if len({key for key, _ in pairs}) != len(pairs):
            raise ApiError("invalid_payload", "Duplicate query fields are not supported.", 422)
        payload: dict[str, object] = dict(pairs)
    elif (
        connection.preset in {"exotel", "knowlarity"}
        and request.headers.get("Content-Type", "").split(";")[0]
        == "application/x-www-form-urlencoded"
    ):
        try:
            pairs = parse_qsl(
                body.decode("utf-8"), keep_blank_values=True, errors="strict", max_num_fields=100
            )
            if len({key for key, _ in pairs}) != len(pairs):
                raise ValueError("Duplicate form fields")
            payload = dict(pairs)
        except ValueError as error:
            raise ApiError(
                "invalid_payload", "Provide valid form-encoded call fields.", 422
            ) from error
    else:
        payload = parse_json(body)
    supplied = (
        payload.get("google_key")
        if connection.preset == "google_ads_lead_form"
        else (request.headers.get("X-Janus-Token") or request.query_params.get("token"))
    )
    if not isinstance(supplied, str) or not hmac.compare_digest(supplied.encode(), secret.encode()):
        raise ApiError("invalid_signature", "Invalid webhook authentication.", 401)
    payload.pop("token", None)
    payload.pop("google_key", None)
    if connection.preset == "google_ads_lead_form":
        if not isinstance(payload.get("is_test", False), bool):
            raise ApiError("invalid_payload", "is_test must be a boolean.", 422)
        if payload.get("is_test"):
            return None, 200
    if connection.preset == "myoperator" and (
        payload.get("channel") != "call"
        or payload.get("event_type") != "call.end"
        or payload.get("direction") != "incoming"
    ):
        return None, 200
    if connection.preset in {"knowlarity", "tata_tele"}:
        field, expected_direction = (
            ("Call_Type", "Incoming")
            if connection.preset == "knowlarity"
            else ("direction", "inbound")
        )
        direction = payload.get(field)
        if direction is None:
            raise ApiError("invalid_payload", "Call direction is required.", 422)
        if direction != expected_direction:
            return None, 200
    provider_id = value_at(payload, connection.event_id_field or "event_id")
    if not isinstance(provider_id, str) or not provider_id.strip() or len(provider_id) > 1024:
        raise ApiError("invalid_event_id", "Provider event ID must be a non-empty string.", 422)
    # Provider IDs are opaque; hash them rather than imposing our HTTP-header character set.
    key = connection.preset + ":" + hashlib.sha256(provider_id.encode()).hexdigest()
    clean_body = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode()
    payload = parse_json(clean_body)
    result = await store_event(db, connection, payload, clean_body, key, strict_payload=False)
    return (None if connection.preset == "google_ads_lead_form" else result), 200


def parse_json(body: bytes) -> dict[str, object]:
    try:
        payload = json.loads(body, parse_constant=reject_constant)
        if not isinstance(payload, dict):
            raise ValueError("Expected object")
        # JSONB cannot store NUL/surrogates or non-finite numbers; reject before reserving a key.
        json.dumps(payload, ensure_ascii=False, allow_nan=False).encode("utf-8")
        pending: list[tuple[object, int]] = [(payload, 0)]
        while pending:
            value, depth = pending.pop()
            if depth > 32:
                raise ValueError("Payload is too deeply nested")
            if isinstance(value, str) and "\x00" in value:
                raise ValueError("NUL is not supported")
            if isinstance(value, dict):
                pending.extend((item, depth + 1) for pair in value.items() for item in pair)
            elif isinstance(value, list):
                pending.extend((item, depth + 1) for item in value)
    except (ValueError, RecursionError) as error:
        raise ApiError("invalid_payload", "Provide a valid JSON object.", 422) from error
    return dict(payload)


async def store_event(
    db: AsyncSession,
    connection: SourceConnection,
    payload: dict[str, object],
    body: bytes,
    key: str,
    *,
    strict_payload: bool = True,
    csv_import_id: int | None = None,
    row_number: int | None = None,
) -> ReceiptOut:
    received_at = now()
    receipt_id = await db.scalar(
        insert(IngestReceipt)
        .values(
            tenant_id=connection.tenant_id,
            connection_id=connection.id,
            idempotency_key=key,
            csv_import_id=csv_import_id,
            row_number=row_number,
            payload_hash=hashlib.sha256(body).hexdigest(),
            received_day=received_at.date(),
        )
        .on_conflict_do_nothing(index_elements=["tenant_id", "connection_id", "idempotency_key"])
        .returning(IngestReceipt.id)
    )
    if receipt_id is None:
        receipt = (
            await db.scalars(
                select(IngestReceipt).where(
                    IngestReceipt.connection_id == connection.id,
                    IngestReceipt.idempotency_key == key,
                )
            )
        ).one()
        if strict_payload and receipt.payload_hash != hashlib.sha256(body).hexdigest():
            raise ApiError(
                "idempotency_conflict", "This key was already used for a different payload.", 409
            )
        return ReceiptOut(id=str(receipt.id), duplicate=True)
    await db.execute(text("SELECT public.ensure_raw_event_partitions()"))
    db.add(
        RawEvent(
            tenant_id=connection.tenant_id,
            receipt_id=receipt_id,
            preset=connection.preset,
            source=source_value(connection.kind, connection.preset),
            received_day=received_at.date(),
            received_at=received_at,
            payload=payload,
            field_mapping=connection.field_mapping,
            owner_id=connection.owner_id,
        )
    )
    await enqueue(db, connection.tenant_id, receipt_id)
    connection.last_event_at = received_at
    return ReceiptOut(id=str(receipt_id), duplicate=False)
