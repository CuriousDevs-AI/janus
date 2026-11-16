"""IT change requests on the server. Each step needs settings:manage, as the IT screen checks.

The requester cannot approve their own change, a change is decided once, and only an approved change
can be carried out. Every step writes an audit row in the same transaction as the change.
"""

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from janus_api.audit import service as audit
from janus_api.auth.models import User
from janus_api.auth.service import Actor
from janus_api.core.deps import Db, request_ip, require
from janus_api.core.errors import ApiError
from janus_api.it.models import ITChange

router = APIRouter(prefix="/v1/it", tags=["IT"])
Manage = Annotated[Actor, Depends(require("settings:manage"))]
Limit = Annotated[int, Query(ge=1, le=100)]
AfterId = Annotated[int, Query(ge=0, le=2**63 - 1)]


class ChangeCreate(BaseModel):
    title: str = Field(min_length=5, max_length=200)
    risk: Literal["low", "medium", "high"]


class ChangeDecision(BaseModel):
    approve: bool


class ChangeOut(BaseModel):
    id: str
    number: str
    title: str
    risk: str
    status: str
    requested_by: str
    decided_by: str | None
    raised_on: date


async def _names(db: Db, ids: set[int]) -> dict[int, str]:
    if not ids:
        return {}
    rows = await db.execute(select(User.id, User.name).where(User.id.in_(ids)))
    return {row.id: row.name for row in rows.all()}


def _out(row: ITChange, names: dict[int, str]) -> ChangeOut:
    return ChangeOut(
        id=str(row.id),
        number=row.number,
        title=row.title,
        risk=row.risk,
        status=row.status,
        requested_by=names.get(row.requested_by, "Unknown"),
        decided_by=names.get(row.decided_by) if row.decided_by else None,
        raised_on=row.raised_on,
    )


async def _out_single(db: Db, row: ITChange) -> ChangeOut:
    """Resolve names for a single change (used after create/update)."""
    ids = {row.requested_by} | ({row.decided_by} if row.decided_by else set())
    names = await _names(db, ids)
    return _out(row, names)


async def _change(db: Db, tenant_id: int, change_id: int, *, lock: bool = False) -> ITChange:
    query = select(ITChange).where(ITChange.tenant_id == tenant_id, ITChange.id == change_id)
    if lock:
        query = query.with_for_update()
    row = await db.scalar(query)
    if row is None:
        raise ApiError("not_found", "Change not found.", 404)
    return row


@router.get("/changes", response_model=list[ChangeOut])
async def list_changes(
    actor: Manage, db: Db, after_id: AfterId = 0, limit: Limit = 50
) -> list[ChangeOut]:
    query = (
        select(ITChange)
        .where(ITChange.tenant_id == actor.session.tenant_id)
        .order_by(ITChange.id.desc())
        .limit(limit)
    )
    if after_id:
        query = query.where(ITChange.id < after_id)
    rows = (await db.scalars(query)).all()
    # Batch-resolve all user ids in one query instead of per-row.
    all_ids: set[int] = set()
    for row in rows:
        all_ids.add(row.requested_by)
        if row.decided_by:
            all_ids.add(row.decided_by)
    names = await _names(db, all_ids)
    return [_out(row, names) for row in rows]


@router.post("/changes", response_model=ChangeOut, status_code=201)
async def request_change(data: ChangeCreate, actor: Manage, db: Db, request: Request) -> ChangeOut:
    tenant_id = actor.session.tenant_id
    # The number follows the count of changes in this company, as the screen always has.
    count = await db.scalar(
        select(func.count()).select_from(ITChange).where(ITChange.tenant_id == tenant_id)
    )
    row = ITChange(
        tenant_id=tenant_id,
        number=f"CHG-{1002 + (count or 0)}",
        title=data.title.strip(),
        risk=data.risk,
        status="pending",
        requested_by=actor.user.id,
        raised_on=date.today(),
    )
    db.add(row)
    await db.flush()
    audit.record(
        db,
        "it.change_requested",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"change": row.number, "risk": data.risk},
    )
    return await _out_single(db, row)


@router.post("/changes/{change_id}/decision", response_model=ChangeOut)
async def decide_change(
    change_id: int, data: ChangeDecision, actor: Manage, db: Db, request: Request
) -> ChangeOut:
    tenant_id = actor.session.tenant_id
    row = await _change(db, tenant_id, change_id, lock=True)
    if row.status != "pending":
        raise ApiError("decided", "Only a pending change can be decided.", 409)
    if row.requested_by == actor.user.id:
        raise ApiError("self_decision", "The person who asked for a change cannot decide it.", 403)
    row.status = "approved" if data.approve else "rejected"
    row.decided_by = actor.user.id
    await db.flush()
    audit.record(
        db,
        "it.change_decided",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"change": row.number, "status": row.status},
    )
    return await _out_single(db, row)


@router.post("/changes/{change_id}/complete", response_model=ChangeOut)
async def complete_change(change_id: int, actor: Manage, db: Db, request: Request) -> ChangeOut:
    tenant_id = actor.session.tenant_id
    row = await _change(db, tenant_id, change_id, lock=True)
    if row.status != "approved":
        raise ApiError("not_approved", "Only an approved change can be carried out.", 409)
    row.status = "done"
    await db.flush()
    audit.record(
        db,
        "it.change_completed",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"change": row.number},
    )
    return await _out_single(db, row)
