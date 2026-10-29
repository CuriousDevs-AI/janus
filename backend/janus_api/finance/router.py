"""Budget lines and their draws and releases, held on the server in paise.

The server is the only place a budget balance changes. A draw or release locks its budget line,
checks what is left, writes the movement and updates the balance in one transaction. A request
carries an Idempotency-Key, so a retry returns the first result and never moves money twice.
Every endpoint needs billing:manage.
"""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select

from janus_api.audit import service as audit
from janus_api.auth.service import Actor
from janus_api.core.deps import Db, request_ip, require
from janus_api.core.errors import ApiError
from janus_api.finance.models import FinanceBudgetLine, FinanceBudgetMovement
from janus_api.rules.service import ensure_open

router = APIRouter(prefix="/v1/finance", tags=["Finance"])
Billing = Annotated[Actor, Depends(require("billing:manage"))]

MAX_PAISE = 10**15


class BudgetLineCreate(BaseModel):
    external_key: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=2, max_length=160)
    owner_name: str = Field(min_length=2, max_length=160)
    allocated_paise: int = Field(ge=0, le=MAX_PAISE)


class MovementRequest(BaseModel):
    amount_paise: int = Field(gt=0, le=MAX_PAISE)
    note: str = Field(default="", max_length=300)
    booked_on: date


class BudgetLineOut(BaseModel):
    external_key: str
    name: str
    owner_name: str
    allocated_paise: int
    drawn_paise: int
    remaining_paise: int


class MovementOut(BaseModel):
    id: str
    line_key: str
    amount_paise: int
    note: str
    booked_on: date
    budget: BudgetLineOut


def _line_out(row: FinanceBudgetLine) -> BudgetLineOut:
    return BudgetLineOut(
        external_key=row.external_key,
        name=row.name,
        owner_name=row.owner_name,
        allocated_paise=row.allocated_paise,
        drawn_paise=row.drawn_paise,
        remaining_paise=row.allocated_paise - row.drawn_paise,
    )


async def _line(db: Db, tenant_id: int, key: str, *, lock: bool) -> FinanceBudgetLine:
    query = select(FinanceBudgetLine).where(
        FinanceBudgetLine.tenant_id == tenant_id, FinanceBudgetLine.external_key == key
    )
    if lock:
        query = query.with_for_update()
    row = await db.scalar(query)
    if row is None:
        raise ApiError("not_found", "Budget line not found.", 404)
    return row


@router.get("/budget-lines", response_model=list[BudgetLineOut])
async def list_budget_lines(actor: Billing, db: Db) -> list[BudgetLineOut]:
    rows = await db.scalars(
        select(FinanceBudgetLine)
        .where(FinanceBudgetLine.tenant_id == actor.session.tenant_id)
        .order_by(FinanceBudgetLine.id)
    )
    return [_line_out(row) for row in rows.all()]


@router.post("/budget-lines", response_model=BudgetLineOut, status_code=201)
async def create_budget_line(
    data: BudgetLineCreate, actor: Billing, db: Db, request: Request
) -> BudgetLineOut:
    tenant_id = actor.session.tenant_id
    if await db.scalar(
        select(FinanceBudgetLine.id).where(
            FinanceBudgetLine.tenant_id == tenant_id,
            FinanceBudgetLine.external_key == data.external_key,
        )
    ):
        raise ApiError("already_exists", "A budget line with this key already exists.", 409)
    row = FinanceBudgetLine(
        tenant_id=tenant_id,
        external_key=data.external_key,
        name=data.name.strip(),
        owner_name=data.owner_name.strip(),
        allocated_paise=data.allocated_paise,
        drawn_paise=0,
    )
    db.add(row)
    await db.flush()
    audit.record(
        db,
        "finance.budget_line_created",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"line": data.external_key, "allocated_paise": data.allocated_paise},
    )
    return _line_out(row)


async def _move(
    *,
    kind: str,
    sign: int,
    key: str,
    data: MovementRequest,
    idempotency_key: str,
    actor: Actor,
    db: Db,
    request: Request,
    response: Response,
) -> MovementOut:
    """A draw or release moves drawn; an allocation moves allocated."""
    tenant_id = actor.session.tenant_id
    line = await _line(db, tenant_id, key, lock=True)
    amount = sign * data.amount_paise

    existing = await db.scalar(
        select(FinanceBudgetMovement).where(
            FinanceBudgetMovement.tenant_id == tenant_id,
            FinanceBudgetMovement.idempotency_key == idempotency_key,
        )
    )
    if existing is not None:
        if existing.line_id != line.id or existing.amount_paise != amount or existing.kind != kind:
            raise ApiError(
                "idempotency_conflict", "This key was already used for a different request.", 409
            )
        response.status_code = 200
        return _movement_out(existing, line)

    await ensure_open(db, tenant_id, data.booked_on)
    if kind == "draw":
        if data.amount_paise > line.allocated_paise - line.drawn_paise:
            raise ApiError(
                "insufficient_budget", "There is not enough left on this budget line.", 422
            )
        line.drawn_paise += amount
    elif kind == "release":
        if data.amount_paise > line.drawn_paise:
            raise ApiError("insufficient_drawn", "More is being released than has been drawn.", 422)
        line.drawn_paise += amount
    else:
        line.allocated_paise += amount

    movement = FinanceBudgetMovement(
        tenant_id=tenant_id,
        line_id=line.id,
        kind=kind,
        amount_paise=amount,
        note=data.note.strip(),
        booked_on=data.booked_on,
        created_by=actor.user.id,
        idempotency_key=idempotency_key,
    )
    db.add(movement)
    await db.flush()
    audit.record(
        db,
        f"finance.budget_{kind}",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"line": key, "amount_paise": amount},
    )
    response.status_code = 201
    return _movement_out(movement, line)


def _movement_out(movement: FinanceBudgetMovement, line: FinanceBudgetLine) -> MovementOut:
    return MovementOut(
        id=str(movement.id),
        line_key=line.external_key,
        amount_paise=movement.amount_paise,
        note=movement.note,
        booked_on=movement.booked_on,
        budget=_line_out(line),
    )


IdempotencyKey = Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=80)]


@router.post("/budget-lines/{key}/draws", response_model=MovementOut, status_code=201)
async def draw_budget(
    key: str,
    data: MovementRequest,
    actor: Billing,
    db: Db,
    request: Request,
    response: Response,
    idempotency_key: IdempotencyKey,
) -> MovementOut:
    return await _move(
        kind="draw",
        sign=1,
        key=key,
        data=data,
        idempotency_key=idempotency_key,
        actor=actor,
        db=db,
        request=request,
        response=response,
    )


@router.post("/budget-lines/{key}/releases", response_model=MovementOut, status_code=201)
async def release_budget(
    key: str,
    data: MovementRequest,
    actor: Billing,
    db: Db,
    request: Request,
    response: Response,
    idempotency_key: IdempotencyKey,
) -> MovementOut:
    return await _move(
        kind="release",
        sign=-1,
        key=key,
        data=data,
        idempotency_key=idempotency_key,
        actor=actor,
        db=db,
        request=request,
        response=response,
    )


@router.post("/budget-lines/{key}/allocations", response_model=MovementOut, status_code=201)
async def allocate_budget(
    key: str,
    data: MovementRequest,
    actor: Billing,
    db: Db,
    request: Request,
    response: Response,
    idempotency_key: IdempotencyKey,
) -> MovementOut:
    """Adds money to a line's allocation, for example when a fund request is approved."""
    return await _move(
        kind="allocation",
        sign=1,
        key=key,
        data=data,
        idempotency_key=idempotency_key,
        actor=actor,
        db=db,
        request=request,
        response=response,
    )
