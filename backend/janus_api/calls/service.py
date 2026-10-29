import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.auth.models import User
from janus_api.auth.service import Actor
from janus_api.calls import schemas
from janus_api.calls.models import CustomerCall, CustomerCallSignal
from janus_api.core.config import get_settings
from janus_api.core.errors import ApiError
from janus_api.core.tenancy import set_context
from janus_api.crm.models import Contact, Lead
from janus_api.crm.service import visible_owners
from janus_api.org.models import Tenant
from janus_api.team.service import ice_for

LINK_MINUTES = 30
LIVE_HOURS = 3
LIST_LIMIT = 50


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _now() -> datetime:
    return datetime.now(UTC)


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _status(call: CustomerCall) -> str:
    if call.status == "ringing" and call.expires_at and call.expires_at <= _now():
        return "expired"
    return call.status


def _out(call: CustomerCall, agent_name: str) -> schemas.CallOut:
    return schemas.CallOut(
        id=str(call.id),
        contactId=str(call.contact_id),
        agentId=str(call.agent_id),
        agentName=agent_name,
        method=call.method,
        direction=call.direction,
        status=_status(call),
        outcome=call.outcome,
        durationSeconds=call.duration_seconds,
        notes=call.notes,
        expiresAt=_iso(call.expires_at),
        startedAt=_iso(call.started_at),
        endedAt=_iso(call.ended_at),
        createdAt=_iso(call.created_at) or "",
    )


async def _agent_name(db: AsyncSession, user_id: int) -> str:
    return await db.scalar(select(User.name).where(User.id == user_id)) or "Your agent"


async def _contact(db: AsyncSession, actor: Actor, contact_id: int) -> Contact:
    """The contact, if this person can see one of its leads; the same rule as the contact page."""
    tenant_id = actor.session.tenant_id
    owners = await visible_owners(db, tenant_id, actor.user.id, actor.permissions)
    visible = select(Lead.id).where(Lead.contact_id == Contact.id, Lead.tenant_id == tenant_id)
    if owners is not None:
        visible = visible.where(Lead.owner_id.in_(owners))
    contact = await db.scalar(
        select(Contact).where(
            Contact.id == contact_id, Contact.tenant_id == tenant_id, visible.exists()
        )
    )
    if contact is None:
        raise ApiError("not_found", "Contact not found.", 404)
    return contact


async def list_calls(db: AsyncSession, actor: Actor, contact_id: int) -> list[schemas.CallOut]:
    await _contact(db, actor, contact_id)
    rows = await db.execute(
        select(CustomerCall, User.name)
        .join(User, User.id == CustomerCall.agent_id)
        .where(CustomerCall.contact_id == contact_id)
        .order_by(CustomerCall.created_at.desc(), CustomerCall.id.desc())
        .limit(LIST_LIMIT)
    )
    return [_out(call, name) for call, name in rows.all()]


async def log_call(
    db: AsyncSession, actor: Actor, contact_id: int, data: schemas.LogCallIn
) -> schemas.CallOut:
    contact = await _contact(db, actor, contact_id)
    call = CustomerCall(
        tenant_id=actor.session.tenant_id,
        contact_id=contact.id,
        agent_id=actor.user.id,
        method="phone",
        direction=data.direction,
        status="logged",
        outcome=data.outcome,
        duration_seconds=data.duration_seconds if data.outcome == "connected" else None,
        notes=data.notes.strip(),
    )
    db.add(call)
    await db.flush()
    await db.refresh(call)
    return _out(call, actor.user.name)


async def start_browser_call(
    db: AsyncSession, actor: Actor, contact_id: int
) -> schemas.BrowserCallOut:
    contact = await _contact(db, actor, contact_id)
    if contact.do_not_contact:
        raise ApiError("do_not_contact", "This contact asked not to be contacted.", 422)
    token = secrets.token_urlsafe(32)
    call = CustomerCall(
        tenant_id=actor.session.tenant_id,
        contact_id=contact.id,
        agent_id=actor.user.id,
        method="browser",
        direction="outbound",
        status="ringing",
        token_hash=_hash(token),
        expires_at=_now() + timedelta(minutes=LINK_MINUTES),
    )
    db.add(call)
    await db.flush()
    await db.refresh(call)
    link = f"{get_settings().frontend_url.rstrip('/')}/call/{token}"
    return schemas.BrowserCallOut(call=_out(call, actor.user.name), link=link)


async def _own_call(db: AsyncSession, actor: Actor, call_id: int) -> CustomerCall:
    """A call this person made. Only its agent runs, ends or edits it."""
    call = await db.scalar(
        select(CustomerCall)
        .where(CustomerCall.id == call_id, CustomerCall.tenant_id == actor.session.tenant_id)
        .with_for_update()
    )
    if call is None or call.agent_id != actor.user.id:
        raise ApiError("not_found", "Call not found.", 404)
    return call


async def update_call(
    db: AsyncSession, actor: Actor, call_id: int, data: schemas.CallUpdate
) -> schemas.CallOut:
    call = await _own_call(db, actor, call_id)
    if data.outcome is not None:
        if call.status in ("ringing", "live"):
            raise ApiError("call_in_progress", "End the call before setting its outcome.", 409)
        call.outcome = data.outcome
    if data.notes is not None:
        call.notes = data.notes.strip()
    await db.flush()
    return _out(call, actor.user.name)


async def _finish(db: AsyncSession, call: CustomerCall) -> None:
    if call.status in ("ended", "logged"):
        return
    now = _now()
    call.status = "ended"
    call.ended_at = now
    if call.started_at:
        call.duration_seconds = min(int((now - call.started_at).total_seconds()), 86400)
        call.outcome = call.outcome or "connected"
    else:
        call.outcome = call.outcome or "no_answer"
    await db.execute(delete(CustomerCallSignal).where(CustomerCallSignal.call_id == call.id))
    await db.flush()


async def end_call(db: AsyncSession, actor: Actor, call_id: int) -> schemas.CallOut:
    call = await _own_call(db, actor, call_id)
    await _finish(db, call)
    return _out(call, actor.user.name)


def _open(call: CustomerCall) -> None:
    if _status(call) not in ("ringing", "live"):
        raise ApiError("call_closed", "This call has ended.", 410)


async def _signal(db: AsyncSession, call: CustomerCall, side: str, data: schemas.SignalIn) -> None:
    _open(call)
    db.add(
        CustomerCallSignal(
            tenant_id=call.tenant_id,
            call_id=call.id,
            from_side=side,
            kind=data.kind,
            payload=data.payload,
        )
    )
    await db.flush()


async def agent_signal(
    db: AsyncSession, actor: Actor, call_id: int, data: schemas.SignalIn
) -> None:
    await _signal(db, await _own_call(db, actor, call_id), "agent", data)


async def agent_call(db: AsyncSession, actor: Actor, call_id: int) -> CustomerCall:
    call = await db.scalar(
        select(CustomerCall).where(
            CustomerCall.id == call_id, CustomerCall.tenant_id == actor.session.tenant_id
        )
    )
    if call is None or call.agent_id != actor.user.id:
        raise ApiError("not_found", "Call not found.", 404)
    return call


async def call_state(db: AsyncSession, call_id: int) -> dict[str, str | None] | None:
    call = await db.scalar(select(CustomerCall).where(CustomerCall.id == call_id))
    if call is None:
        return None
    return {"status": _status(call), "guestJoinedAt": _iso(call.guest_joined_at)}


async def signals_for(
    db: AsyncSession, call_id: int, side: str, after: int
) -> list[schemas.SignalOut]:
    """The messages the other side sent after `after`, oldest first."""
    rows = await db.scalars(
        select(CustomerCallSignal)
        .where(
            CustomerCallSignal.call_id == call_id,
            CustomerCallSignal.from_side != side,
            CustomerCallSignal.id > after,
        )
        .order_by(CustomerCallSignal.id)
        .limit(100)
    )
    return [
        schemas.SignalOut(id=str(item.id), kind=item.kind, payload=item.payload) for item in rows
    ]


# The customer's side. They have no account: the link is their only key, and it opens one call.


async def guest_call(db: AsyncSession, token: str, lock: bool = False) -> CustomerCall:
    if not 20 <= len(token) <= 100:
        raise ApiError("call_not_found", "This call link is not valid or has ended.", 404)
    hashed = _hash(token)
    tenant_id = await db.scalar(text("SELECT customer_call_tenant(:hashed)"), {"hashed": hashed})
    if tenant_id is None:
        raise ApiError("call_not_found", "This call link is not valid or has ended.", 404)
    await set_context(db, tenant_id=tenant_id)
    query = select(CustomerCall).where(CustomerCall.token_hash == hashed)
    call = await db.scalar(query.with_for_update() if lock else query)
    if call is None:
        raise ApiError("call_not_found", "This call link is not valid or has ended.", 404)
    return call


async def guest_view(db: AsyncSession, token: str) -> schemas.GuestCallOut:
    call = await guest_call(db, token)
    company = await db.scalar(select(Tenant.name).where(Tenant.id == call.tenant_id)) or ""
    return schemas.GuestCallOut(
        company=company,
        agentName=await _agent_name(db, call.agent_id),
        status=_status(call),
        ice=ice_for(f"guest-{call.id}"),
    )


async def guest_join(db: AsyncSession, token: str) -> None:
    call = await guest_call(db, token, lock=True)
    _open(call)
    now = _now()
    if call.status == "ringing":
        call.status = "live"
        call.started_at = now
        call.expires_at = now + timedelta(hours=LIVE_HOURS)
    call.guest_joined_at = now
    # A fresh join, such as after a reload, starts the connection again from nothing.
    await db.execute(delete(CustomerCallSignal).where(CustomerCallSignal.call_id == call.id))
    await db.flush()


async def guest_signal(db: AsyncSession, token: str, data: schemas.SignalIn) -> None:
    call = await guest_call(db, token, lock=True)
    if call.status != "live":
        raise ApiError("not_joined", "Join the call first.", 409)
    await _signal(db, call, "guest", data)


async def guest_leave(db: AsyncSession, token: str) -> None:
    await _finish(db, await guest_call(db, token, lock=True))
