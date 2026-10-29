"""Vendor bills on the server, held in paise.

A bill raised for a purchase order is checked against the goods received on that order (the
three-way match). It can be paid only when it matches, so the screen cannot pay a bill the goods
do not support. A payment locks its bill, checks what is still owed, and writes its audit row in
the same transaction. Every endpoint needs billing:manage.
"""

from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from janus_api.audit import service as audit
from janus_api.auth.service import Actor
from janus_api.core.deps import Db, request_ip, require
from janus_api.core.errors import ApiError
from janus_api.finance.models import FinanceBill, FinanceBillPayment
from janus_api.operations.models import OpsPoLine, OpsPurchaseOrder
from janus_api.rules.service import ensure_open, rules_for

router = APIRouter(prefix="/v1/finance", tags=["Finance"])
Billing = Annotated[Actor, Depends(require("billing:manage"))]

MAX_PAISE = 10**15
MIN_TOLERANCE_PAISE = 50
PaymentMethod = Literal["UPI", "Bank transfer", "Cash", "Cheque"]


class BillCreate(BaseModel):
    vendor: str = Field(min_length=2, max_length=160)
    vendor_bill_no: str = Field(min_length=2, max_length=80)
    bill_date: date
    due_date: date
    amount_paise: int = Field(gt=0, le=MAX_PAISE)
    po_key: str | None = Field(default=None, max_length=64)


class BillPaymentIn(BaseModel):
    amount_paise: int = Field(gt=0, le=MAX_PAISE)
    method: PaymentMethod
    reference: str = Field(min_length=3, max_length=80)
    paid_on: date


class BillPaymentOut(BaseModel):
    id: str
    amount_paise: int
    method: str
    reference: str
    paid_on: date
    recorded_by: str


class BillOut(BaseModel):
    id: str
    number: str
    vendor: str
    vendor_bill_no: str
    bill_date: date
    due_date: date
    amount_paise: int
    po_key: str | None
    match: str
    paid_paise: int
    due_paise: int
    created_by: str
    payments: list[BillPaymentOut]


def _round(value: Decimal) -> int:
    return int(value.quantize(Decimal(1), rounding=ROUND_HALF_UP))


async def _received_paise(db: Db, order: OpsPurchaseOrder) -> int:
    lines = (await db.scalars(select(OpsPoLine).where(OpsPoLine.po_id == order.id))).all()
    return sum(_round(line.received_qty * line.rate_paise) for line in lines)


def _match(bill_paise: int, received_paise: int, tolerance_percent: Decimal) -> str:
    """The three-way match: the bill against the goods received on its order."""
    if received_paise <= 0:
        return "goods not received"
    tolerance = max(MIN_TOLERANCE_PAISE, _round(Decimal(received_paise) * tolerance_percent / 100))
    if abs(bill_paise - received_paise) <= tolerance:
        return "matched"
    if bill_paise > received_paise:
        return "bill above goods received"
    return "goods above bill"


async def _order(db: Db, tenant_id: int, po_key: str) -> OpsPurchaseOrder | None:
    order: OpsPurchaseOrder | None = await db.scalar(
        select(OpsPurchaseOrder).where(
            OpsPurchaseOrder.tenant_id == tenant_id, OpsPurchaseOrder.po_key == po_key
        )
    )
    return order


async def _bill_out(db: Db, row: FinanceBill) -> BillOut:
    payments = (
        await db.scalars(
            select(FinanceBillPayment)
            .where(FinanceBillPayment.bill_id == row.id)
            .order_by(FinanceBillPayment.id)
        )
    ).all()
    paid = sum(payment.amount_paise for payment in payments)
    match = "no order"
    if row.po_key is not None:
        order = await _order(db, row.tenant_id, row.po_key)
        rules = await rules_for(db, row.tenant_id)
        match = (
            _match(
                row.amount_paise, await _received_paise(db, order), rules.match_tolerance_percent
            )
            if order
            else "no order"
        )
    return BillOut(
        id=str(row.id),
        number=row.number,
        vendor=row.vendor,
        vendor_bill_no=row.vendor_bill_no,
        bill_date=row.bill_date,
        due_date=row.due_date,
        amount_paise=row.amount_paise,
        po_key=row.po_key,
        match=match,
        paid_paise=paid,
        due_paise=max(0, row.amount_paise - paid),
        created_by=row.created_by_name,
        payments=[
            BillPaymentOut(
                id=str(payment.id),
                amount_paise=payment.amount_paise,
                method=payment.method,
                reference=payment.reference,
                paid_on=payment.paid_on,
                recorded_by=payment.recorded_by_name,
            )
            for payment in payments
        ],
    )


async def _bill(db: Db, tenant_id: int, bill_id: int, *, lock: bool = False) -> FinanceBill:
    query = select(FinanceBill).where(FinanceBill.tenant_id == tenant_id, FinanceBill.id == bill_id)
    if lock:
        query = query.with_for_update()
    row = await db.scalar(query)
    if row is None:
        raise ApiError("not_found", "Bill not found.", 404)
    return row


@router.get("/bills", response_model=list[BillOut])
async def list_bills(actor: Billing, db: Db) -> list[BillOut]:
    rows = (
        await db.scalars(
            select(FinanceBill)
            .where(FinanceBill.tenant_id == actor.session.tenant_id)
            .order_by(FinanceBill.id.desc())
        )
    ).all()
    return [await _bill_out(db, row) for row in rows]


@router.post("/bills", response_model=BillOut, status_code=201)
async def record_bill(
    data: BillCreate,
    actor: Billing,
    db: Db,
    request: Request,
    response: Response,
    idempotency_key: Annotated[str, Header(min_length=1, max_length=80)],
) -> BillOut:
    tenant_id = actor.session.tenant_id
    if data.due_date < data.bill_date:
        raise ApiError("due_before_bill", "The due date cannot be before the bill date.", 422)
    existing = await db.scalar(
        select(FinanceBill).where(
            FinanceBill.tenant_id == tenant_id, FinanceBill.idempotency_key == idempotency_key
        )
    )
    if existing is not None:
        response.status_code = 200
        return await _bill_out(db, existing)
    order = None
    if data.po_key is not None:
        order = await _order(db, tenant_id, data.po_key)
        if order is None:
            raise ApiError("po_not_found", "The purchase order was not found.", 422)
        if (
            _match(data.amount_paise, await _received_paise(db, order), Decimal(0))
            == "goods not received"
        ):
            raise ApiError(
                "goods_not_received",
                f"No goods have been received against {order.number} yet.",
                422,
            )
    await ensure_open(db, tenant_id, data.bill_date)
    count = await db.scalar(
        select(func.count()).select_from(FinanceBill).where(FinanceBill.tenant_id == tenant_id)
    )
    row = FinanceBill(
        tenant_id=tenant_id,
        number=f"BILL-{data.bill_date.year}-{101 + (count or 0):04d}",
        vendor=data.vendor.strip(),
        vendor_bill_no=data.vendor_bill_no.strip(),
        bill_date=data.bill_date,
        due_date=data.due_date,
        amount_paise=data.amount_paise,
        po_key=data.po_key,
        created_by=actor.user.id,
        created_by_name=actor.user.name,
        idempotency_key=idempotency_key,
    )
    db.add(row)
    await db.flush()
    audit.record(
        db,
        "finance.bill_recorded",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"bill": row.number, "amount_paise": data.amount_paise},
    )
    return await _bill_out(db, row)


@router.post("/bills/{bill_id}/payments", response_model=BillOut, status_code=201)
async def pay_bill(
    bill_id: int,
    data: BillPaymentIn,
    actor: Billing,
    db: Db,
    request: Request,
    response: Response,
    idempotency_key: Annotated[str, Header(min_length=1, max_length=80)],
) -> BillOut:
    tenant_id = actor.session.tenant_id
    row = await _bill(db, tenant_id, bill_id, lock=True)
    existing = await db.scalar(
        select(FinanceBillPayment).where(
            FinanceBillPayment.tenant_id == tenant_id,
            FinanceBillPayment.idempotency_key == idempotency_key,
        )
    )
    if existing is not None:
        if existing.bill_id != row.id or existing.amount_paise != data.amount_paise:
            raise ApiError(
                "idempotency_conflict",
                "This Idempotency-Key was used for a different request.",
                409,
            )
        response.status_code = 200
        return await _bill_out(db, row)
    if row.po_key is not None:
        order = await _order(db, tenant_id, row.po_key)
        rules = await rules_for(db, tenant_id)
        match = (
            _match(
                row.amount_paise, await _received_paise(db, order), rules.match_tolerance_percent
            )
            if order
            else "no order"
        )
        if match != "matched":
            raise ApiError(
                "payment_held",
                f"Payment is held: {row.number} does not match its order yet ({match}).",
                422,
            )
    await ensure_open(db, tenant_id, data.paid_on)
    paid = await db.scalar(
        select(func.coalesce(func.sum(FinanceBillPayment.amount_paise), 0)).where(
            FinanceBillPayment.bill_id == row.id
        )
    )
    due = row.amount_paise - int(paid or 0)
    if data.amount_paise > due:
        raise ApiError(
            "over_payment", f"Payment is more than the {due} paise still owed on {row.number}.", 422
        )
    db.add(
        FinanceBillPayment(
            tenant_id=tenant_id,
            bill_id=row.id,
            amount_paise=data.amount_paise,
            method=data.method,
            reference=data.reference.strip(),
            paid_on=data.paid_on,
            recorded_by_name=actor.user.name,
            idempotency_key=idempotency_key,
        )
    )
    await db.flush()
    audit.record(
        db,
        "finance.bill_paid",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"bill": row.number, "amount_paise": data.amount_paise, "method": data.method},
    )
    return await _bill_out(db, row)
