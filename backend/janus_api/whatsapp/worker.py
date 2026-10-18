from datetime import timedelta

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from janus_api.audit.service import record
from janus_api.core.config import get_settings
from janus_api.core.errors import ApiError
from janus_api.core.security import now
from janus_api.core.tenancy import set_context
from janus_api.org.service import membership
from janus_api.sources.models import SourceConnection
from janus_api.whatsapp import meta
from janus_api.whatsapp.models import Conversation, Message, WhatsAppConnection
from janus_api.whatsapp.service import decrypt


async def run_once(factory: async_sessionmaker[AsyncSession]) -> bool:
    async with factory() as db, db.begin():
        claim = (await db.execute(text("SELECT * FROM public.claim_whatsapp_message()"))).first()
        if claim is None:
            return False
        await set_context(db, tenant_id=claim.tenant_id)
        message = await db.get(Message, claim.id)
        assert message is not None
        if message.status == "sending":
            # A crash after handing the request to Meta is ambiguous. Never resend automatically.
            message.status, message.error_code = "unknown", "send_result_unknown"
            return True
        account = (
            await db.scalars(
                select(WhatsAppConnection).where(
                    WhatsAppConnection.connection_id == message.connection_id
                )
            )
        ).one()
        thread = await db.get(Conversation, message.conversation_id)
        assert thread is not None
        try:
            if not get_settings().meta_graph_version:
                raise ApiError("meta_not_configured", "WhatsApp is not configured on this worker.")
            status = await db.scalar(
                select(SourceConnection.status).where(SourceConnection.id == message.connection_id)
            )
            if status != "connected" or not account.webhook_verified_at:
                raise ApiError("whatsapp_not_ready", "Connection is not ready.")
            if message.sender_id is None:
                raise ApiError("sender_inactive", "Sender is missing.")
            _, role = await membership(db, message.sender_id, claim.tenant_id)
            if "leads:write" not in role.permissions:
                raise ApiError("sender_forbidden", "Sender no longer has send permission.")
            if message.kind == "text" and (
                thread.last_inbound_at is None
                or thread.last_inbound_at + timedelta(hours=24) <= now()
            ):
                raise ApiError("template_required", "The reply window has closed.")
            token = decrypt(account.access_token_encrypted)
        except ApiError as error:
            message.status, message.error_code = "failed", error.code
            return True
        message.status, message.started_at = "sending", now()
        tenant_id, message_id = claim.tenant_id, message.id
        phone_id, payload = account.phone_number_id, message.payload
    # Commit the claim BEFORE the network request. A worker restart cannot duplicate a send.
    provider_id = None
    status = "unknown"
    error_code: str | None = "send_result_unknown"
    try:
        result = await meta.request("POST", f"{phone_id}/messages", token, payload=payload)
        sent = result.get("messages", [])
        if (
            isinstance(sent, list)
            and sent
            and isinstance(sent[0], dict)
            and isinstance(sent[0].get("id"), str)
            and 1 <= len(sent[0]["id"]) <= 512
        ):
            provider_id, status, error_code = sent[0]["id"], "accepted", None
    except ApiError as error:
        error_code = error.code
        status = "unknown" if error.status >= 500 else "failed"
    except Exception:
        # Timeouts / lost responses do not prove failure; wait for a signed status webhook.
        pass
    async with factory() as db, db.begin():
        await set_context(db, tenant_id=tenant_id)
        message = await db.scalar(select(Message).where(Message.id == message_id).with_for_update())
        assert message is not None
        if provider_id:
            if message.provider_id and message.provider_id != provider_id:
                raise RuntimeError("WhatsApp provider ID mismatch")
            message.provider_id = provider_id
        # A signed webhook may already have advanced the delivery status.
        if message.status in {"sending", "unknown"}:
            message.status, message.error_code = status, error_code
        record(
            db,
            "whatsapp.send_attempted",
            tenant_id=tenant_id,
            details={
                "message_id": message_id,
                "requested_by": message.sender_id,
                "status": message.status,
                "error_code": message.error_code,
            },
        )
    return True
