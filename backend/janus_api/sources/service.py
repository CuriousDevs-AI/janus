from cryptography.fernet import InvalidToken
from sqlalchemy import func, select, true
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.service import record
from janus_api.core.config import get_settings
from janus_api.core.errors import ApiError, ProcessingError
from janus_api.core.security import cipher, now, random_token
from janus_api.crm.models import Lead
from janus_api.crm.service import capture
from janus_api.org.service import lock_workspace
from janus_api.sources import schemas
from janus_api.sources.models import IngestReceipt, RawEvent, SourceConnection
from janus_api.sources.presets import PRESETS, contact_payload, source_value, value_at


def webhook_secret(connection: SourceConnection) -> str:
    if connection.secret_encrypted is None:
        raise ApiError("invalid_source", "This source does not use webhook authentication.", 422)
    try:
        return cipher().decrypt(connection.secret_encrypted.encode()).decode()
    except InvalidToken as error:
        raise ApiError(
            "encryption_unavailable", "Source encryption key does not match.", 503
        ) from error


def connection_out(
    connection: SourceConnection, *, captured_leads: int = 0
) -> schemas.ConnectionOut:
    if connection.kind == "csv":
        url = f"/v1/sources/{connection.id}/imports"
    else:
        route = {"webhook": "webhooks", "embed": "forms", "api_key": "api", "oauth": "whatsapp"}[
            connection.kind
        ]
        url = f"/v1/ingest/{route}/{connection.public_key}"
    return schemas.ConnectionOut.model_validate(
        {
            "id": str(connection.id),
            "name": connection.name,
            "description": connection.description,
            "status": connection.status,
            "fieldMapping": connection.field_mapping,
            "webhookUrl": url if connection.kind == "webhook" else None,
            "ingestUrl": url,
            "connectionKind": connection.kind,
            "source": source_value(connection.kind, connection.preset),
            "preset": connection.preset,
            "allowedOrigins": connection.allowed_origins,
            "eventIdField": connection.event_id_field,
            "lastEventAt": connection.last_event_at,
            "capturedLeads": captured_leads,
        }
    )


async def connection_with_metrics(
    db: AsyncSession, connection: SourceConnection
) -> schemas.ConnectionOut:
    captured_leads = await db.scalar(
        select(func.count(Lead.id))
        .join(IngestReceipt, Lead.receipt_id == IngestReceipt.id)
        .where(
            Lead.tenant_id == connection.tenant_id,
            IngestReceipt.tenant_id == connection.tenant_id,
            IngestReceipt.connection_id == connection.id,
        )
    )
    return connection_out(connection, captured_leads=int(captured_leads or 0))


async def get_connection(db: AsyncSession, connection_id: int) -> SourceConnection:
    connection = await db.get(SourceConnection, connection_id)
    if connection is None:
        raise ApiError("not_found", "Source connection not found.", 404)
    return connection


async def list_connections(
    db: AsyncSession, after_id: int, limit: int
) -> list[schemas.ConnectionOut]:
    return [
        await connection_with_metrics(db, connection)
        for connection in (
            await db.scalars(
                select(SourceConnection)
                .where(SourceConnection.id > after_id, SourceConnection.kind != "manual")
                .order_by(SourceConnection.id)
                .limit(limit)
            )
        ).all()
    ]


async def create_connection(
    db: AsyncSession, tenant_id: int, user_id: int, data: schemas.ConnectionCreate, ip: str
) -> schemas.ConnectionSecret:
    await lock_workspace(db, tenant_id, user_id, "sources:manage")
    validate_settings(data)
    secret = random_token() if data.connectionKind == "webhook" else None
    connection = SourceConnection(
        tenant_id=tenant_id,
        name=data.name,
        description=data.description,
        kind=data.connectionKind,
        preset=data.preset,
        field_mapping=connection_mapping(data),
        allowed_origins=data.allowedOrigins,
        event_id_field=data.eventIdField or PRESETS[data.preset].event_id_field,
        public_key=random_token(),
        secret_encrypted=cipher().encrypt(secret.encode()).decode() if secret else None,
        owner_id=user_id,
    )
    db.add(connection)
    await db.flush()
    record(
        db,
        "source.created",
        user_id=user_id,
        tenant_id=tenant_id,
        ip=ip,
        details={"connection_id": connection.id},
    )
    return secret_out(connection, secret)


async def update_connection(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    connection_id: int,
    data: schemas.ConnectionUpdate,
    ip: str,
) -> schemas.ConnectionOut:
    await lock_workspace(db, tenant_id, user_id, "sources:manage")
    connection = await get_connection(db, connection_id)
    validate_settings(data)
    if data.connectionKind != connection.kind:
        raise ApiError("invalid_source", "Create a new source to change its connection kind.", 422)
    connection.name, connection.description, connection.status = (
        data.name,
        data.description,
        data.status,
    )
    connection.field_mapping = connection_mapping(data)
    connection.preset = data.preset
    connection.event_id_field = data.eventIdField or PRESETS[data.preset].event_id_field
    connection.allowed_origins = data.allowedOrigins
    record(
        db,
        "source.updated",
        user_id=user_id,
        tenant_id=tenant_id,
        ip=ip,
        details={"connection_id": connection.id},
    )
    return connection_out(connection)


async def rotate_secret(
    db: AsyncSession, tenant_id: int, user_id: int, connection_id: int, ip: str
) -> schemas.ConnectionSecret:
    await lock_workspace(db, tenant_id, user_id, "sources:manage")
    connection = await get_connection(db, connection_id)
    if connection.kind != "webhook":
        raise ApiError("invalid_source", "Only webhooks have signing secrets.", 422)
    secret = random_token()
    connection.secret_encrypted = cipher().encrypt(secret.encode()).decode()
    record(
        db,
        "source.secret_rotated",
        user_id=user_id,
        tenant_id=tenant_id,
        ip=ip,
        details={"connection_id": connection.id},
    )
    return secret_out(connection, secret)


async def list_events(
    db: AsyncSession,
    connection_id: int,
    after_id: int,
    limit: int,
    import_id: int | None = None,
) -> list[schemas.EventOut]:
    await get_connection(db, connection_id)
    rows = (
        await db.execute(
            select(IngestReceipt, RawEvent)
            .join(
                RawEvent,
                (RawEvent.receipt_id == IngestReceipt.id)
                & (RawEvent.received_day == IngestReceipt.received_day),
            )
            .where(
                IngestReceipt.connection_id == connection_id,
                IngestReceipt.id > after_id,
                true() if import_id is None else IngestReceipt.csv_import_id == import_id,
            )
            .order_by(IngestReceipt.id)
            .limit(limit)
        )
    ).all()
    return [
        schemas.EventOut.model_validate(
            {
                "id": str(receipt.id),
                "sourceId": str(connection_id),
                "receivedAt": event.received_at,
                "status": event.status,
                "result": event.result,
                "customerId": str(event.contact_id) if event.contact_id else None,
                "leadId": str(event.lead_id) if event.lead_id else None,
                "reason": event.error_code,
                "importId": str(receipt.csv_import_id) if receipt.csv_import_id else None,
                "rowNumber": receipt.row_number,
            }
        )
        for receipt, event in rows
    ]


async def get_event(db: AsyncSession, receipt_id: int) -> RawEvent:
    receipt = await db.get(IngestReceipt, receipt_id)
    if receipt is None:
        raise RuntimeError("Job receipt is missing")
    event = await db.scalar(
        select(RawEvent).where(
            RawEvent.receipt_id == receipt.id, RawEvent.received_day == receipt.received_day
        )
    )
    if event is None:
        raise RuntimeError("Job payload is missing")
    return event


def mapped_fields(
    payload: dict[str, object], mapping: list[dict[str, str]], *, flat: bool = False
) -> dict[str, str]:
    fields = {}
    for item in mapping:
        value = payload.get(item["rawField"]) if flat else value_at(payload, item["rawField"])
        if value is None or value == "":
            continue
        if not isinstance(value, str):
            raise ProcessingError("invalid_field_type")
        fields[item["mapsTo"]] = value.strip()
    return fields


async def process_event(db: AsyncSession, receipt_id: int) -> None:
    event = await get_event(db, receipt_id)
    if event.status == "processed":
        return
    if event.source == "whatsapp":
        from janus_api.whatsapp.ingest import process_event as process_whatsapp

        await process_whatsapp(db, event)
        event.status, event.processed_at, event.error_code = "processed", now(), None
        return
    contact_id, lead_id, result = await capture(
        db,
        event.tenant_id,
        receipt_id,
        mapped_fields(
            contact_payload(event.preset, event.payload),
            event.field_mapping,
            flat=event.source == "csv_import",
        ),
        event.owner_id,
        event.source,
    )
    event.contact_id, event.lead_id, event.result = contact_id, lead_id, result
    event.status, event.processed_at, event.error_code = "processed", now(), None


async def record_failure(db: AsyncSession, receipt_id: int, code: str, terminal: bool) -> None:
    event = await get_event(db, receipt_id)
    event.error_code = code
    if terminal:
        event.status = "failed"
        event.processed_at = now()
        record(
            db,
            "lead.capture_failed",
            tenant_id=event.tenant_id,
            details={"receipt_id": receipt_id, "reason": code},
        )


def connection_mapping(data: schemas.ConnectionCreate) -> list[dict[str, str]]:
    if data.fieldMapping is not None:
        return [item.model_dump() for item in data.fieldMapping]
    return [{"rawField": raw, "mapsTo": target} for raw, target in PRESETS[data.preset].mapping]


def validate_settings(data: schemas.ConnectionCreate) -> None:
    if get_settings().environment == "production" and any(
        not origin.startswith("https://") for origin in data.allowedOrigins
    ):
        raise ApiError("invalid_origin", "Production website origins must use HTTPS.", 422)


def secret_out(connection: SourceConnection, secret: str | None) -> schemas.ConnectionSecret:
    result = schemas.ConnectionSecret(
        **connection_out(connection).model_dump(), signingSecret=secret
    )
    if secret:
        result.callbackUrl = str(get_settings().public_api_url).rstrip("/") + result.ingestUrl
        if connection.preset not in {"custom", "google_ads_lead_form"}:
            result.callbackUrl += f"?token={secret}"
    return result


def list_presets() -> list[schemas.PresetOut]:
    return [
        schemas.PresetOut.model_validate(
            {
                "value": key,
                "label": preset.label,
                "group": preset.group,
                "fieldMapping": [
                    {"rawField": raw, "mapsTo": target} for raw, target in preset.mapping
                ],
                "eventIdField": preset.event_id_field,
                "instructions": preset.instructions,
                "documentationUrl": preset.documentation_url,
            }
        )
        for key, preset in PRESETS.items()
    ]
