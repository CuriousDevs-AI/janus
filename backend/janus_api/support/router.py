"""Support tickets on the server: number, status, assignee and resolution.

Each step needs leads:read_team, the permission of the Customer Support workspace, so the people
who can open Support (owners, admins, managers) can work its tickets. Creating a ticket is
idempotent on its external key, so a retry after a dropped response books it once. Every change
writes an audit row in the same transaction.
"""

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select

from janus_api.audit import service as audit
from janus_api.auth.service import Actor
from janus_api.core.deps import Db, request_ip, require
from janus_api.core.errors import ApiError
from janus_api.support.models import SupportTicket

router = APIRouter(prefix="/v1/support", tags=["Support"])
Work = Annotated[Actor, Depends(require("leads:read_team"))]

Status = Literal["open", "ai_handling", "waiting_customer", "escalated", "in_progress", "closed"]
AnyStatus = Literal[
    "open", "ai_handling", "waiting_customer", "escalated", "in_progress", "resolved", "closed"
]
Priority = Literal["low", "medium", "high", "urgent"]
CLOSED = {"resolved", "closed"}


class TicketCreate(BaseModel):
    external_key: str = Field(min_length=1, max_length=64)
    number: str = Field(min_length=2, max_length=20)
    subject: str = Field(min_length=3, max_length=200)
    priority: Priority
    status: AnyStatus = "open"


class TicketStatusChange(BaseModel):
    status: Status


class TicketAssign(BaseModel):
    assignee: str | None = Field(default=None, max_length=64)


class TicketResolve(BaseModel):
    reason: str | None = Field(default=None, max_length=300)


class TicketOut(BaseModel):
    id: str
    external_key: str
    number: str
    subject: str
    priority: str
    status: str
    assignee: str | None
    resolution: str | None
    raised_on: date


def _out(row: SupportTicket) -> TicketOut:
    return TicketOut(
        id=str(row.id),
        external_key=row.external_key,
        number=row.number,
        subject=row.subject,
        priority=row.priority,
        status=row.status,
        assignee=row.assignee,
        resolution=row.resolution,
        raised_on=row.raised_on,
    )


async def _ticket(db: Db, tenant_id: int, key: str, *, lock: bool = False) -> SupportTicket:
    query = select(SupportTicket).where(
        SupportTicket.tenant_id == tenant_id, SupportTicket.external_key == key
    )
    if lock:
        query = query.with_for_update()
    row = await db.scalar(query)
    if row is None:
        raise ApiError("not_found", "Ticket not found.", 404)
    return row


@router.get("/tickets", response_model=list[TicketOut])
async def list_tickets(actor: Work, db: Db) -> list[TicketOut]:
    rows = await db.scalars(
        select(SupportTicket)
        .where(SupportTicket.tenant_id == actor.session.tenant_id)
        .order_by(SupportTicket.id.desc())
    )
    return [_out(row) for row in rows.all()]


@router.post("/tickets", response_model=TicketOut, status_code=201)
async def create_ticket(
    data: TicketCreate, actor: Work, db: Db, request: Request, response: Response
) -> TicketOut:
    tenant_id = actor.session.tenant_id
    existing = await db.scalar(
        select(SupportTicket).where(
            SupportTicket.tenant_id == tenant_id, SupportTicket.external_key == data.external_key
        )
    )
    if existing is not None:
        # A retry of a ticket already booked returns it as it is.
        response.status_code = 200
        return _out(existing)
    row = SupportTicket(
        tenant_id=tenant_id,
        external_key=data.external_key,
        number=data.number,
        subject=data.subject.strip(),
        priority=data.priority,
        status=data.status,
        opened_by=actor.user.id,
        raised_on=date.today(),
    )
    db.add(row)
    await db.flush()
    audit.record(
        db,
        "support.ticket_created",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"ticket": row.number, "priority": data.priority},
    )
    return _out(row)


@router.post("/tickets/{key}/status", response_model=TicketOut)
async def change_status(
    key: str, data: TicketStatusChange, actor: Work, db: Db, request: Request
) -> TicketOut:
    tenant_id = actor.session.tenant_id
    row = await _ticket(db, tenant_id, key, lock=True)
    row.status = data.status
    await db.flush()
    audit.record(
        db,
        "support.ticket_status_changed",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"ticket": row.number, "status": data.status},
    )
    return _out(row)


@router.post("/tickets/{key}/assign", response_model=TicketOut)
async def assign_ticket(
    key: str, data: TicketAssign, actor: Work, db: Db, request: Request
) -> TicketOut:
    tenant_id = actor.session.tenant_id
    row = await _ticket(db, tenant_id, key, lock=True)
    row.assignee = data.assignee
    await db.flush()
    audit.record(
        db,
        "support.ticket_assigned",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"ticket": row.number, "assignee": data.assignee or "unassigned"},
    )
    return _out(row)


@router.post("/tickets/{key}/resolve", response_model=TicketOut)
async def resolve_ticket(
    key: str, data: TicketResolve, actor: Work, db: Db, request: Request
) -> TicketOut:
    tenant_id = actor.session.tenant_id
    row = await _ticket(db, tenant_id, key, lock=True)
    if row.status in CLOSED:
        raise ApiError("already_resolved", "This ticket is already resolved or closed.", 409)
    row.status = "resolved"
    row.resolution = (data.reason or "").strip() or None
    await db.flush()
    audit.record(
        db,
        "support.ticket_resolved",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"ticket": row.number},
    )
    return _out(row)
