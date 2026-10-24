import hashlib
import json
import re
from datetime import timedelta

from cryptography.fernet import InvalidToken
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.service import record
from janus_api.auth.service import Actor
from janus_api.core.config import get_settings
from janus_api.core.errors import ApiError
from janus_api.core.security import cipher, digest, now, random_token
from janus_api.crm.models import Contact, Lead
from janus_api.crm.service import get_contact, visible_owners
from janus_api.org.service import lock_workspace
from janus_api.sources.models import SourceConnection
from janus_api.whatsapp import meta, schemas
from janus_api.whatsapp.models import Conversation, Message, WhatsAppConnection


def decrypt(value: str) -> str:
    try:
        return cipher().decrypt(value.encode()).decode()
    except InvalidToken as error:
        raise ApiError(
            "encryption_unavailable", "WhatsApp credentials could not be decrypted.", 503
        ) from error


async def connection(db: AsyncSession) -> WhatsAppConnection:
    row = await db.scalar(select(WhatsAppConnection))
    if row is None:
        raise ApiError(
            "whatsapp_not_connected", "Connect WhatsApp Business in Lead Sources first.", 404
        )
    return row


async def connection_out(
    db: AsyncSession, row: WhatsAppConnection, token: str | None = None
) -> schemas.ConnectionOut:
    source = await db.get(SourceConnection, row.connection_id)
    assert source is not None
    return schemas.ConnectionOut(
        id=str(source.id),
        wabaId=row.waba_id,
        phoneNumberId=row.phone_number_id,
        displayPhone=row.display_phone,
        verifiedName=row.verified_name,
        status=source.status,
        callbackUrl=f"{str(get_settings().public_api_url).rstrip('/')}/v1/ingest/whatsapp/{source.public_key}",
        webhookVerifiedAt=row.webhook_verified_at,
        verifyToken=token,
    )


async def configure(
    db: AsyncSession, actor: Actor, data: schemas.ConnectionInput, ip: str
) -> schemas.ConnectionOut:
    tenant_id = actor.session.tenant_id
    await lock_workspace(db, tenant_id, actor.user.id, "sources:manage")
    row = await db.scalar(select(WhatsAppConnection))
    if row and (row.phone_number_id != data.phoneNumberId or row.waba_id != data.wabaId):
        raise ApiError(
            "number_change_unsupported",
            "This workspace already has a WhatsApp number. Number migration is not supported yet.",
            409,
        )
    phones = await meta.request(
        "GET",
        f"{data.wabaId}/phone_numbers",
        data.accessToken.get_secret_value(),
        params={"fields": "id,display_phone_number,verified_name", "limit": "100"},
    )
    phone = next(
        (
            p
            for p in phones.get("data", [])
            if isinstance(p, dict) and p.get("id") == data.phoneNumberId
        ),
        None,
    )
    if phone is None:
        raise ApiError(
            "phone_not_found",
            "This phone number was not found in the supplied WhatsApp Business Account.",
            422,
        )
    if row:
        source = await db.get(SourceConnection, row.connection_id)
        assert source is not None
    else:
        source = SourceConnection(
            tenant_id=tenant_id,
            name="WhatsApp Business",
            description="Meta WhatsApp Cloud API",
            kind="oauth",
            preset="custom",
            field_mapping=[],
            public_key=random_token(),
            secret_encrypted=None,
            owner_id=actor.user.id,
            allowed_origins=[],
        )
        db.add(source)
        await db.flush()
        row = WhatsAppConnection(
            tenant_id=tenant_id,
            connection_id=source.id,
            waba_id=data.wabaId,
            phone_number_id=data.phoneNumberId,
        )
        db.add(row)
    verify_token = random_token()
    source.status = "available"
    row.access_token_encrypted = (
        cipher().encrypt(data.accessToken.get_secret_value().encode()).decode()
    )
    row.app_secret_encrypted = cipher().encrypt(data.appSecret.get_secret_value().encode()).decode()
    row.verify_token_hash = digest(verify_token)
    row.webhook_verified_at = None
    row.display_phone = str(phone.get("display_phone_number", ""))[:80]
    row.verified_name = str(phone.get("verified_name", ""))[:200]
    await db.flush()
    record(
        db,
        "whatsapp.configured",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=ip,
        details={"connection_id": source.id},
    )
    return await connection_out(db, row, verify_token)


async def ensure_ready(db: AsyncSession) -> WhatsAppConnection:
    row = await connection(db)
    status = await db.scalar(
        select(SourceConnection.status).where(SourceConnection.id == row.connection_id)
    )
    if status != "connected" or not row.webhook_verified_at:
        raise ApiError(
            "whatsapp_not_ready", "Verify the WhatsApp callback in Meta before sending.", 409
        )
    return row


async def get_or_create_conversation(
    db: AsyncSession, tenant_id: int, connection_id: int, contact_id: int
) -> Conversation:
    await db.execute(
        insert(Conversation)
        .values(tenant_id=tenant_id, connection_id=connection_id, contact_id=contact_id)
        .on_conflict_do_nothing(index_elements=["tenant_id", "connection_id", "contact_id"])
    )
    return (
        await db.scalars(
            select(Conversation)
            .where(
                Conversation.connection_id == connection_id, Conversation.contact_id == contact_id
            )
            .with_for_update()
        )
    ).one()


async def open_conversation(
    db: AsyncSession, actor: Actor, contact_id: int
) -> schemas.ConversationOut:
    contact = await get_contact(
        db, actor.session.tenant_id, actor.user.id, actor.permissions, contact_id
    )
    if not contact.phone:
        raise ApiError(
            "phone_required", "This customer needs a phone number before using WhatsApp.", 422
        )
    row = await ensure_ready(db)
    thread = await get_or_create_conversation(
        db, actor.session.tenant_id, row.connection_id, contact_id
    )
    return (await conversations(db, actor, conversation_id=thread.id))[0]


async def conversations(
    db: AsyncSession,
    actor: Actor,
    *,
    before_id: int = 0,
    limit: int = 50,
    conversation_id: int | None = None,
) -> list[schemas.ConversationOut]:
    owners = await visible_owners(db, actor.session.tenant_id, actor.user.id, actor.permissions)
    visible = select(Lead.id).where(
        Lead.contact_id == Conversation.contact_id, Lead.tenant_id == actor.session.tenant_id
    )
    if owners is not None:
        visible = visible.where(Lead.owner_id.in_(owners))
    query = (
        select(Conversation, Contact)
        .join(Contact, Contact.id == Conversation.contact_id)
        .where(visible.exists())
    )
    if conversation_id is not None:
        query = query.where(Conversation.id == conversation_id)
    if before_id:
        query = query.where(Conversation.id < before_id)
    rows = (await db.execute(query.order_by(Conversation.id.desc()).limit(limit))).all()
    return [
        schemas.ConversationOut(
            id=str(c.id),
            contactId=str(p.id),
            name=p.name,
            phone=p.phone_e164,
            company=p.company,
            whatsappOptIn=p.whatsapp_opt_in,
            doNotContact=p.do_not_contact,
            consentSource=p.consent_source,
            consentUpdatedAt=p.consent_updated_at,
            lastMessageAt=c.last_message_at,
            lastInboundAt=c.last_inbound_at,
            replyWindowEndsAt=c.last_inbound_at + timedelta(hours=24)
            if c.last_inbound_at
            else None,
        )
        for c, p in rows
    ]


async def get_conversation(db: AsyncSession, actor: Actor, conversation_id: int) -> Conversation:
    if not await conversations(db, actor, conversation_id=conversation_id):
        raise ApiError("not_found", "Conversation not found.", 404)
    row = await db.get(Conversation, conversation_id)
    assert row is not None
    return row


def message_out(row: Message) -> schemas.MessageOut:
    return schemas.MessageOut(
        id=str(row.id),
        direction=row.direction,
        kind=row.kind,
        body=row.body,
        status=row.status,
        errorCode=row.error_code,
        createdAt=row.created_at,
    )


async def messages(
    db: AsyncSession, actor: Actor, conversation_id: int, before_id: int, limit: int
) -> list[schemas.MessageOut]:
    await get_conversation(db, actor, conversation_id)
    query = select(Message).where(Message.conversation_id == conversation_id)
    if before_id:
        query = query.where(Message.id < before_id)
    rows = (await db.scalars(query.order_by(Message.id.desc()).limit(limit))).all()
    return [message_out(row) for row in reversed(rows)]


async def queue_message(
    db: AsyncSession,
    actor: Actor,
    conversation_id: int,
    data: schemas.SendMessage,
    key: str,
    ip: str,
) -> schemas.MessageOut:
    if not actor.user.email_verified_at:
        raise ApiError("email_unverified", "Verify your email before sending messages.", 403)
    if not re.fullmatch(r"[A-Za-z0-9._:-]{1,128}", key):
        raise ApiError("idempotency_required", "Provide a stable Idempotency-Key.", 422)
    thread = await get_conversation(db, actor, conversation_id)
    # Serialize only this conversation while reserving the outgoing idempotency key.
    await db.refresh(thread, with_for_update=True)
    fingerprint = hashlib.sha256(json.dumps(data.model_dump(), sort_keys=True).encode()).hexdigest()
    existing = await db.scalar(
        select(Message).where(Message.conversation_id == thread.id, Message.client_key == key)
    )
    if existing:
        if existing.request_hash != fingerprint:
            raise ApiError("idempotency_conflict", "This key was used for another message.", 409)
        return message_out(existing)
    row = await ensure_ready(db)
    contact = await db.get(Contact, thread.contact_id)
    assert contact is not None
    if not contact.phone_e164:
        raise ApiError("phone_required", "The customer has no phone number.", 422)
    if contact.do_not_contact:
        raise ApiError(
            "do_not_contact",
            "This customer is suppressed from outbound communication.",
            409,
        )
    if data.kind == "template" and not contact.whatsapp_opt_in:
        raise ApiError(
            "whatsapp_opt_in_required",
            "Record WhatsApp opt-in before sending a template message.",
            409,
        )
    body = data.body.strip()
    payload: dict[str, object] = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": contact.phone_e164.lstrip("+"),
        "type": data.kind,
    }
    if data.kind == "text":
        if thread.last_inbound_at is None or thread.last_inbound_at + timedelta(hours=24) <= now():
            raise ApiError(
                "template_required",
                "Use an approved template outside the 24-hour reply window.",
                422,
            )
        payload["text"] = {"body": body, "preview_url": False}
    else:
        options = await meta.templates(
            row.waba_id, decrypt(row.access_token_encrypted), name=data.templateName
        )
        template = next(
            (t for t in options if t.name == data.templateName and t.language == data.language),
            None,
        )
        if template is None or template.parameterCount != len(data.parameters):
            raise ApiError(
                "template_unavailable",
                "Choose an approved text template and fill every parameter.",
                422,
            )
        # Single substitution pass: parameter text cannot introduce another placeholder.
        body = re.sub(r"\{\{(\d+)\}\}", lambda m: data.parameters[int(m[1]) - 1], template.body)
        body = "\n".join(filter(None, [template.header, body, template.footer]))
        if len(body) > 12000:
            raise ApiError("message_too_long", "The rendered template is too long.", 422)
        payload["template"] = {
            "name": template.name,
            "language": {"code": template.language},
            **(
                {
                    "components": [
                        {
                            "type": "body",
                            "parameters": [{"type": "text", "text": p} for p in data.parameters],
                        }
                    ]
                }
                if data.parameters
                else {}
            ),
        }
    callback = random_token()
    payload["biz_opaque_callback_data"] = callback
    message = Message(
        tenant_id=actor.session.tenant_id,
        connection_id=thread.connection_id,
        conversation_id=thread.id,
        direction="outbound",
        kind=data.kind,
        body=body,
        payload=payload,
        callback_token=callback,
        client_key=key,
        request_hash=fingerprint,
        sender_id=actor.user.id,
        status="queued",
    )
    db.add(message)
    thread.last_message_at = now()
    await db.flush()
    record(
        db,
        "whatsapp.message_queued",
        user_id=actor.user.id,
        tenant_id=actor.session.tenant_id,
        ip=ip,
        details={
            "message_id": message.id,
            "conversation_id": thread.id,
            "opt_in_confirmed": data.optInConfirmed,
        },
    )
    return message_out(message)
