"""Fund requests on the server. Approval allocates the money to the budget line at once.

A request up to ₹50,000 is approved by its owner, which allocates the money at once. A larger one is
approved by its owner and then by finance. The person who asked cannot approve it, and the finance
approver must be a different person from the owner's approver. Every step needs billing:manage.
"""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from janus_api.audit import service as audit
from janus_api.auth.service import Actor
from janus_api.core.deps import Db, request_ip, require
from janus_api.core.errors import ApiError
from janus_api.finance.models import FinanceBudgetLine, FinanceFundRequest
from janus_api.finance.router import MovementRequest, _move

router = APIRouter(prefix="/v1/finance", tags=["Finance"])
Billing = Annotated[Actor, Depends(require("billing:manage"))]

MAX_PAISE = 10**15
# A request above this (₹50,000) also needs finance's approval after the owner's.
OWNER_LIMIT_PAISE = 5_000_000


class FundRequestIn(BaseModel):
    key: str = Field(min_length=1, max_length=64)
    purpose: str = Field(min_length=3, max_length=200)
    amount_paise: int = Field(gt=0, le=MAX_PAISE)
    budget_line_key: str = Field(min_length=1, max_length=80)


class FundRejectIn(BaseModel):
    reason: str = Field(min_length=3, max_length=300)


class FundRequestOut(BaseModel):
    id: str
    number: str
    purpose: str
    amount_paise: int
    budget_line_key: str
    status: str
    requested_by: str
    owner_approved_by: str | None
    finance_approved_by: str | None
    rejected_by: str | None
    rejected_reason: str | None
    raised_on: date


def _out(row: FinanceFundRequest) -> FundRequestOut:
    return FundRequestOut(
        id=row.req_key,
        number=row.number,
        purpose=row.purpose,
        amount_paise=row.amount_paise,
        budget_line_key=row.budget_line_key,
        status=row.status,
        requested_by=row.requested_by_name,
        owner_approved_by=row.owner_approved_by_name,
        finance_approved_by=row.finance_approved_by_name,
        rejected_by=row.rejected_by_name,
        rejected_reason=row.rejected_reason,
        raised_on=row.raised_on,
    )


async def _fund(db: Db, tenant_id: int, key: str, *, lock: bool = False) -> FinanceFundRequest:
    query = select(FinanceFundRequest).where(
        FinanceFundRequest.tenant_id == tenant_id, FinanceFundRequest.req_key == key
    )
    if lock:
        query = query.with_for_update()
    row = await db.scalar(query)
    if row is None:
        raise ApiError("not_found", "Fund request not found.", 404)
    return row


async def _allocate(db: Db, actor: Actor, row: FinanceFundRequest, request: Request) -> None:
    """Adds the money to its budget line. Keyed on the request, so it happens once."""
    await _move(
        kind="allocation",
        sign=1,
        key=row.budget_line_key,
        data=MovementRequest(
            amount_paise=row.amount_paise,
            note=f"{row.number}: {row.purpose}",
            booked_on=row.raised_on,
        ),
        idempotency_key=f"fund-{row.req_key}"[:80],
        actor=actor,
        db=db,
        request=request,
        response=Response(),
    )


@router.get("/fund-requests", response_model=list[FundRequestOut])
async def list_fund_requests(actor: Billing, db: Db) -> list[FundRequestOut]:
    rows = (
        await db.scalars(
            select(FinanceFundRequest)
            .where(FinanceFundRequest.tenant_id == actor.session.tenant_id)
            .order_by(FinanceFundRequest.id.desc())
        )
    ).all()
    return [_out(row) for row in rows]


@router.post("/fund-requests", response_model=FundRequestOut, status_code=201)
async def raise_fund_request(
    data: FundRequestIn,
    actor: Billing,
    db: Db,
    request: Request,
    response: Response,
    idempotency_key: Annotated[str, Header(min_length=1, max_length=80)],
) -> FundRequestOut:
    tenant_id = actor.session.tenant_id
    existing = await db.scalar(
        select(FinanceFundRequest).where(
            FinanceFundRequest.tenant_id == tenant_id,
            FinanceFundRequest.idempotency_key == idempotency_key,
        )
    )
    if existing is not None:
        response.status_code = 200
        return _out(existing)
    line = await db.scalar(
        select(FinanceBudgetLine.id).where(
            FinanceBudgetLine.tenant_id == tenant_id,
            FinanceBudgetLine.external_key == data.budget_line_key,
        )
    )
    if line is None:
        raise ApiError("budget_line_not_found", "Choose the budget line for this request.", 422)
    count = await db.scalar(
        select(func.count())
        .select_from(FinanceFundRequest)
        .where(FinanceFundRequest.tenant_id == tenant_id)
    )
    row = FinanceFundRequest(
        tenant_id=tenant_id,
        req_key=data.key,
        number=f"FR-{date.today().year}-{101 + (count or 0):04d}",
        purpose=data.purpose.strip(),
        amount_paise=data.amount_paise,
        budget_line_key=data.budget_line_key,
        status="pending",
        requested_by=actor.user.id,
        requested_by_name=actor.user.name,
        raised_on=date.today(),
        idempotency_key=idempotency_key,
    )
    db.add(row)
    await db.flush()
    audit.record(
        db,
        "finance.fund_requested",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"request": row.number, "amount_paise": data.amount_paise},
    )
    return _out(row)


@router.post("/fund-requests/{key}/owner-approve", response_model=FundRequestOut)
async def owner_approve(key: str, actor: Billing, db: Db, request: Request) -> FundRequestOut:
    tenant_id = actor.session.tenant_id
    row = await _fund(db, tenant_id, key, lock=True)
    if row.status != "pending":
        raise ApiError("not_pending", "This request is not waiting for the owner.", 409)
    if row.requested_by == actor.user.id:
        raise ApiError("self_approval", "You cannot approve your own request.", 403)
    row.owner_approved_by = actor.user.id
    row.owner_approved_by_name = actor.user.name
    if row.amount_paise > OWNER_LIMIT_PAISE:
        row.status = "awaiting_finance"
    else:
        # The money is allocated before the approval is recorded, in the same transaction.
        await _allocate(db, actor, row, request)
        row.status = "approved"
    await db.flush()
    audit.record(
        db,
        "finance.fund_owner_approved",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"request": row.number, "status": row.status},
    )
    return _out(row)


@router.post("/fund-requests/{key}/finance-approve", response_model=FundRequestOut)
async def finance_approve(key: str, actor: Billing, db: Db, request: Request) -> FundRequestOut:
    tenant_id = actor.session.tenant_id
    row = await _fund(db, tenant_id, key, lock=True)
    if row.status != "awaiting_finance":
        raise ApiError("not_awaiting_finance", "This request is not waiting for finance.", 409)
    if row.requested_by == actor.user.id:
        raise ApiError("self_approval", "You cannot approve your own request.", 403)
    if row.owner_approved_by == actor.user.id:
        raise ApiError(
            "same_approver",
            "The approver must be a different person from the owner's approval.",
            403,
        )
    await _allocate(db, actor, row, request)
    row.status = "approved"
    row.finance_approved_by_name = actor.user.name
    await db.flush()
    audit.record(
        db,
        "finance.fund_finance_approved",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"request": row.number},
    )
    return _out(row)


@router.post("/fund-requests/{key}/reject", response_model=FundRequestOut)
async def reject_fund_request(
    key: str, data: FundRejectIn, actor: Billing, db: Db, request: Request
) -> FundRequestOut:
    tenant_id = actor.session.tenant_id
    row = await _fund(db, tenant_id, key, lock=True)
    if row.status not in ("pending", "awaiting_finance"):
        raise ApiError("not_open", "Only a request that is still waiting can be rejected.", 409)
    if row.requested_by == actor.user.id:
        raise ApiError("self_approval", "You cannot reject your own request.", 403)
    row.status = "rejected"
    row.rejected_by_name = actor.user.name
    row.rejected_reason = data.reason.strip()
    await db.flush()
    audit.record(
        db,
        "finance.fund_rejected",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"request": row.number},
    )
    return _out(row)
