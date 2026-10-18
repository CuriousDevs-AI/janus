import hashlib
import hmac
import json
from datetime import UTC, datetime

from fastapi import Request
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.core.errors import ApiError, ProcessingError
from janus_api.core.security import digest, now
from janus_api.core.tenancy import set_context
from janus_api.crm.models import Contact, Lead
from janus_api.crm.service import capture, normalize_phone
from janus_api.sources.ingest import parse_json, read_body, store_event
from janus_api.sources.models import IngestReceipt, RawEvent, SourceConnection
from janus_api.whatsapp.models import Message, WhatsAppConnection
from janus_api.whatsapp.service import decrypt, get_or_create_conversation


async def resolve(db: AsyncSession, key: str) -> tuple[SourceConnection, WhatsAppConnection]:
    tenant_id = await db.scalar(text("SELECT public.whatsapp_tenant(:key)"), {"key": key})
    if not tenant_id:
        raise ApiError("not_found", "WhatsApp callback not found.", 404)
    await set_context(db, tenant_id=int(tenant_id))
    source = (
        await db.scalars(
            select(SourceConnection).where(
                SourceConnection.public_key == key, SourceConnection.kind == "oauth"
            )
        )
    ).one()
    account = (
        await db.scalars(
            select(WhatsAppConnection).where(WhatsAppConnection.connection_id == source.id)
        )
    ).one()
    return source, account


async def verify(db: AsyncSession, key: str, request: Request) -> str:
    source, account = await resolve(db, key)
    supplied = request.query_params.get("hub.verify_token", "")
    challenge = request.query_params.get("hub.challenge", "")
    if (
        request.query_params.get("hub.mode") != "subscribe"
        or not supplied
        or len(challenge) > 256
        or not challenge
        or not hmac.compare_digest(digest(supplied), account.verify_token_hash)
    ):
        raise ApiError("invalid_verification", "Invalid WhatsApp verification.", 403)
    account.webhook_verified_at = now()
    source.status = "connected"
    return challenge


async def receive(db: AsyncSession, key: str, request: Request) -> None:
    body = await read_body(request)
    source, account = await resolve(db, key)
    signature = (
        "sha256="
        + hmac.new(decrypt(account.app_secret_encrypted).encode(), body, hashlib.sha256).hexdigest()
    )
    if not hmac.compare_digest(
        signature.encode(), request.headers.get("X-Hub-Signature-256", "").encode()
    ):
        raise ApiError("invalid_signature", "Invalid WhatsApp signature.", 401)
    if source.status != "connected":
        raise ApiError("whatsapp_not_ready", "Verify the WhatsApp callback first.", 409)
    payload = parse_json(body)
    if payload.get("object") != "whatsapp_business_account":
        raise ApiError("invalid_payload", "Expected a WhatsApp Business Account webhook.", 422)
    entries = payload.get("entry", [])
    if not isinstance(entries, list):
        raise ApiError("invalid_payload", "Invalid WhatsApp entries.", 422)
    for entry in entries:
        if not isinstance(entry, dict) or entry.get("id") != account.waba_id:
            continue
        changes = entry.get("changes", [])
        if not isinstance(changes, list):
            continue
        for change in changes:
            if not isinstance(change, dict) or change.get("field") != "messages":
                continue
            value = change.get("value", {})
            if (
                not isinstance(value, dict)
                or not isinstance(value.get("metadata"), dict)
                or value["metadata"].get("phone_number_id") != account.phone_number_id
            ):
                continue
            for kind, collection in (("message", "messages"), ("status", "statuses")):
                items = value.get(collection, [])
                if not isinstance(items, list):
                    raise ApiError("invalid_payload", "Invalid WhatsApp message list.", 422)
                for item in items:
                    if (
                        not isinstance(item, dict)
                        or not isinstance(item.get("id"), str)
                        or not 1 <= len(item["id"]) <= 512
                    ):
                        raise ApiError("invalid_payload", "WhatsApp message ID is required.", 422)
                    identity = (
                        item["id"]
                        if kind == "message"
                        else json.dumps([item["id"], item.get("status"), item.get("timestamp")])
                    )
                    event: dict[str, object] = {
                        "kind": kind,
                        "item": item,
                        "contacts": value.get("contacts", []),
                    }
                    event_body = json.dumps(event, ensure_ascii=False).encode()
                    await store_event(
                        db,
                        source,
                        event,
                        event_body,
                        f"wa:{kind}:" + hashlib.sha256(identity.encode()).hexdigest(),
                        strict_payload=False,
                    )


def event_time(value: object) -> datetime:
    try:
        if not isinstance(value, str) or not value.isdigit():
            raise ValueError
        timestamp = datetime.fromtimestamp(int(value), UTC)
        return min(timestamp, now())
    except (ValueError, OverflowError, OSError) as error:
        raise ProcessingError("invalid_whatsapp_timestamp") from error


async def process_event(db: AsyncSession, event: RawEvent) -> None:
    receipt = await db.get(IngestReceipt, event.receipt_id)
    assert receipt is not None
    item = event.payload.get("item")
    if not isinstance(item, dict):
        raise ProcessingError("invalid_whatsapp_message")
    if event.payload.get("kind") == "status":
        await apply_status(db, receipt.connection_id, item)
        event.result = "delivery_update"
        return
    sender = item.get("from")
    if not isinstance(sender, str) or not sender.isdigit():
        raise ProcessingError("whatsapp_phone_required")
    phone = normalize_phone("+" + sender)
    received_at = event_time(item.get("timestamp"))
    name = ""
    contacts = event.payload.get("contacts", [])
    if isinstance(contacts, list):
        for entry in contacts:
            if (
                isinstance(entry, dict)
                and entry.get("wa_id") == sender
                and isinstance(entry.get("profile"), dict)
            ):
                name = str(entry["profile"].get("name", ""))[:160]
    kind = str(item.get("type", "unknown"))[:30]
    content = item.get(kind, {})
    body = ""
    if isinstance(content, dict):
        if kind == "text":
            body = str(content.get("body", ""))
        elif kind == "button":
            body = str(content.get("text", ""))
        elif kind == "interactive":
            reply = content.get("button_reply") or content.get("list_reply")
            if isinstance(reply, dict):
                body = str(reply.get("title", ""))
        else:
            body = str(content.get("caption", ""))
    if not body:
        body = f"[{kind} message received; this message type cannot be displayed yet]"
    # Same lock as ordinary lead capture: a WhatsApp reply reuses its customer and lead.
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
        {"key": f"crm:{event.tenant_id}"},
    )
    contact = await db.scalar(select(Contact).where(Contact.phone_e164 == phone))
    lead = (
        await db.scalar(
            select(Lead).where(Lead.contact_id == contact.id).order_by(Lead.id.desc()).limit(1)
        )
        if contact
        else None
    )
    if contact and lead:
        contact_id, lead_id, result = contact.id, lead.id, "merged"
        lead.last_activity_at = now()
    else:
        contact_id, lead_id, result = await capture(
            db,
            event.tenant_id,
            event.receipt_id,
            {"phone": phone or "", "name": name},
            event.owner_id,
            "whatsapp",
        )
    thread = await get_or_create_conversation(
        db, event.tenant_id, receipt.connection_id, contact_id
    )
    thread.last_inbound_at = max(thread.last_inbound_at or received_at, received_at)
    thread.last_message_at = max(thread.last_message_at, received_at)
    db.add(
        Message(
            tenant_id=event.tenant_id,
            connection_id=receipt.connection_id,
            conversation_id=thread.id,
            direction="inbound",
            kind=kind,
            body=body[:12000],
            payload=item,
            provider_id=item["id"],
            status="received",
            created_at=received_at,
        )
    )
    event.contact_id, event.lead_id, event.result = contact_id, lead_id, result


async def apply_status(db: AsyncSession, connection_id: int, item: dict[str, object]) -> None:
    status = item.get("status")
    if status not in {"sent", "delivered", "read", "failed"}:
        return
    callback = item.get("biz_opaque_callback_data")
    query = select(Message).where(
        Message.connection_id == connection_id, Message.direction == "outbound"
    )
    if isinstance(callback, str) and callback:
        query = query.where(Message.callback_token == callback)
    else:
        query = query.where(Message.provider_id == item["id"])
    message = await db.scalar(query.with_for_update())
    if message is None:  # Messages sent outside Janus are not part of our outbox.
        return
    if message.provider_id and message.provider_id != item["id"]:
        raise ProcessingError("whatsapp_message_id_conflict")
    recipient = item.get("recipient_id")
    if recipient and recipient != message.payload.get("to"):
        raise ProcessingError("whatsapp_recipient_conflict")
    timestamp = event_time(item.get("timestamp"))
    message.provider_id = str(item["id"])
    rank = {"failed": 1, "sent": 1, "delivered": 2, "read": 3}
    if status == "failed":
        if message.status in {"delivered", "read"} or (
            message.status_at and timestamp < message.status_at
        ):
            return
        errors = item.get("errors")
        code = (
            errors[0].get("code")
            if isinstance(errors, list) and errors and isinstance(errors[0], dict)
            else None
        )
        message.error_code = f"meta_{code}" if isinstance(code, int) else "meta_delivery_failed"
    elif rank[str(status)] <= rank.get(message.status, 0):
        return
    else:
        message.error_code = None
    message.status, message.status_at = str(status), timestamp
