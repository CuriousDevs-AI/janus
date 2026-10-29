"""Invoices, payments and credit notes on the server, held in paise.

The server computes every invoice total and every amount still due, so the screen cannot send a
total that disagrees with its lines. A payment or credit note locks its invoice, checks what is
still due, and writes its row and audit entry in one transaction. A request carries an
Idempotency-Key, so a retry returns the first result and never books money twice. Every endpoint
needs billing:manage.
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
from janus_api.finance.models import (
    FinanceCreditNote,
    FinanceInvoice,
    FinanceInvoiceLine,
    FinancePayment,
)

router = APIRouter(prefix="/v1/finance", tags=["Finance"])
Billing = Annotated[Actor, Depends(require("billing:manage"))]

MAX_PAISE = 10**15
MAX_LINES = 50
PaymentMethod = Literal["UPI", "Bank transfer", "Cash", "Cheque"]


def _round(value: Decimal) -> int:
    return int(value.quantize(Decimal(1), rounding=ROUND_HALF_UP))


class LineIn(BaseModel):
    item: str = Field(min_length=2, max_length=200)
    hsn: str = Field(pattern=r"^\d{4,8}$")
    qty: Decimal = Field(gt=0, le=1_000_000, max_digits=12, decimal_places=3)
    rate_paise: int = Field(gt=0, le=MAX_PAISE)
    gst_rate: int = Field(ge=0, le=28)


class InvoiceCreate(BaseModel):
    customer: str = Field(min_length=2, max_length=160)
    customer_company: str = Field(default="", max_length=160)
    deal_ref: str | None = Field(default=None, max_length=80)
    invoice_date: date
    due_date: date
    same_state: bool
    lines: list[LineIn] = Field(min_length=1, max_length=MAX_LINES)


class PaymentIn(BaseModel):
    amount_paise: int = Field(gt=0, le=MAX_PAISE)
    method: PaymentMethod
    reference: str = Field(min_length=3, max_length=80)
    paid_on: date


class CreditNoteIn(BaseModel):
    amount_paise: int = Field(gt=0, le=MAX_PAISE)
    kind: Literal["credit", "write-off"]
    reason: str = Field(min_length=3, max_length=300)
    noted_on: date
    ticket_ref: str | None = Field(default=None, max_length=64)


class RejectIn(BaseModel):
    reason: str = Field(min_length=3, max_length=300)


class LineOut(BaseModel):
    item: str
    hsn: str
    qty: float
    rate_paise: int
    gst_rate: int


class PaymentOut(BaseModel):
    id: str
    amount_paise: int
    method: str
    reference: str
    paid_on: date
    recorded_by: str


class CreditNoteOut(BaseModel):
    id: str
    number: str
    kind: str
    amount_paise: int
    reason: str
    status: str
    noted_on: date
    ticket_ref: str | None
    created_by: str
    approved_by: str | None
    rejected_by: str | None
    rejected_reason: str | None


class InvoiceOut(BaseModel):
    id: str
    number: str
    customer: str
    customer_company: str
    deal_ref: str | None
    invoice_date: date
    due_date: date
    same_state: bool
    taxable_paise: int
    cgst_paise: int
    sgst_paise: int
    igst_paise: int
    total_paise: int
    paid_paise: int
    credited_paise: int
    due_paise: int
    created_by: str
    lines: list[LineOut]
    payments: list[PaymentOut]
    credit_notes: list[CreditNoteOut]


def _totals(lines: list[LineIn], same_state: bool) -> tuple[int, int, int, int]:
    """Taxable value, CGST, SGST and IGST in paise. An odd paisa of tax goes to SGST."""
    taxable = 0
    tax = 0
    for line in lines:
        line_taxable = _round(line.qty * line.rate_paise)
        taxable += line_taxable
        tax += _round(Decimal(line_taxable) * line.gst_rate / 100)
    if same_state:
        cgst = _round(Decimal(tax) / 2)
        return taxable, cgst, tax - cgst, 0
    return taxable, 0, 0, tax


async def _invoice(
    db: Db, tenant_id: int, invoice_id: int, *, lock: bool = False
) -> FinanceInvoice:
    query = select(FinanceInvoice).where(
        FinanceInvoice.tenant_id == tenant_id, FinanceInvoice.id == invoice_id
    )
    if lock:
        query = query.with_for_update()
    row = await db.scalar(query)
    if row is None:
        raise ApiError("not_found", "Invoice not found.", 404)
    return row


async def _credit_note(db: Db, tenant_id: int, note_id: int) -> FinanceCreditNote:
    row = await db.scalar(
        select(FinanceCreditNote)
        .where(FinanceCreditNote.tenant_id == tenant_id, FinanceCreditNote.id == note_id)
        .with_for_update()
    )
    if row is None:
        raise ApiError("not_found", "Credit note not found.", 404)
    return row


def _credited(notes: list[FinanceCreditNote], *, pending: bool) -> int:
    """Credit notes that reduce what is owed. Pending notes count when `pending` is set."""
    return sum(
        note.amount_paise
        for note in notes
        if note.status == "approved" or (pending and note.status == "pending")
    )


async def _invoice_out(db: Db, row: FinanceInvoice) -> InvoiceOut:
    lines = (
        await db.scalars(
            select(FinanceInvoiceLine)
            .where(FinanceInvoiceLine.invoice_id == row.id)
            .order_by(FinanceInvoiceLine.position)
        )
    ).all()
    payments = (
        await db.scalars(
            select(FinancePayment)
            .where(FinancePayment.invoice_id == row.id)
            .order_by(FinancePayment.id)
        )
    ).all()
    notes = (
        await db.scalars(
            select(FinanceCreditNote)
            .where(FinanceCreditNote.invoice_id == row.id)
            .order_by(FinanceCreditNote.id)
        )
    ).all()
    paid = sum(payment.amount_paise for payment in payments)
    credited = _credited(list(notes), pending=True)
    return InvoiceOut(
        id=str(row.id),
        number=row.number,
        customer=row.customer,
        customer_company=row.customer_company,
        deal_ref=row.deal_ref,
        invoice_date=row.invoice_date,
        due_date=row.due_date,
        same_state=row.same_state,
        taxable_paise=row.taxable_paise,
        cgst_paise=row.cgst_paise,
        sgst_paise=row.sgst_paise,
        igst_paise=row.igst_paise,
        total_paise=row.total_paise,
        paid_paise=paid,
        credited_paise=credited,
        due_paise=max(0, row.total_paise - paid - credited),
        created_by=row.created_by_name,
        lines=[
            LineOut(
                item=line.item,
                hsn=line.hsn,
                qty=float(line.qty),
                rate_paise=line.rate_paise,
                gst_rate=line.gst_rate,
            )
            for line in lines
        ],
        payments=[
            PaymentOut(
                id=str(payment.id),
                amount_paise=payment.amount_paise,
                method=payment.method,
                reference=payment.reference,
                paid_on=payment.paid_on,
                recorded_by=payment.recorded_by_name,
            )
            for payment in payments
        ],
        credit_notes=[_note_out(note) for note in notes],
    )


def _note_out(note: FinanceCreditNote) -> CreditNoteOut:
    return CreditNoteOut(
        id=str(note.id),
        number=note.number,
        kind=note.kind,
        amount_paise=note.amount_paise,
        reason=note.reason,
        status=note.status,
        noted_on=note.noted_on,
        ticket_ref=note.ticket_ref,
        created_by=note.created_by_name,
        approved_by=note.approved_by_name,
        rejected_by=note.rejected_by_name,
        rejected_reason=note.rejected_reason,
    )


async def _notes_of(db: Db, invoice_id: int) -> list[FinanceCreditNote]:
    return list(
        (
            await db.scalars(
                select(FinanceCreditNote).where(FinanceCreditNote.invoice_id == invoice_id)
            )
        ).all()
    )


async def _due(db: Db, row: FinanceInvoice) -> int:
    paid = await db.scalar(
        select(func.coalesce(func.sum(FinancePayment.amount_paise), 0)).where(
            FinancePayment.invoice_id == row.id
        )
    )
    credited = _credited(await _notes_of(db, row.id), pending=True)
    return row.total_paise - int(paid or 0) - credited


def _replayed(row_matches: bool) -> None:
    if not row_matches:
        raise ApiError(
            "idempotency_conflict", "This Idempotency-Key was used for a different request.", 409
        )


@router.get("/invoices", response_model=list[InvoiceOut])
async def list_invoices(actor: Billing, db: Db) -> list[InvoiceOut]:
    rows = await db.scalars(
        select(FinanceInvoice)
        .where(FinanceInvoice.tenant_id == actor.session.tenant_id)
        .order_by(FinanceInvoice.id.desc())
    )
    return [await _invoice_out(db, row) for row in rows.all()]


@router.post("/invoices", response_model=InvoiceOut, status_code=201)
async def create_invoice(
    data: InvoiceCreate,
    actor: Billing,
    db: Db,
    request: Request,
    response: Response,
    idempotency_key: Annotated[str, Header(min_length=1, max_length=80)],
) -> InvoiceOut:
    tenant_id = actor.session.tenant_id
    if data.due_date < data.invoice_date:
        raise ApiError("due_before_invoice", "The due date cannot be before the invoice date.", 422)
    taxable, cgst, sgst, igst = _totals(data.lines, data.same_state)
    existing = await db.scalar(
        select(FinanceInvoice).where(
            FinanceInvoice.tenant_id == tenant_id,
            FinanceInvoice.idempotency_key == idempotency_key,
        )
    )
    if existing is not None:
        _replayed(
            existing.customer == data.customer.strip()
            and existing.total_paise == taxable + cgst + sgst + igst
        )
        response.status_code = 200
        return await _invoice_out(db, existing)
    count = await db.scalar(
        select(func.count())
        .select_from(FinanceInvoice)
        .where(FinanceInvoice.tenant_id == tenant_id)
    )
    row = FinanceInvoice(
        tenant_id=tenant_id,
        number=f"INV-{data.invoice_date.year}-{101 + (count or 0):04d}",
        customer=data.customer.strip(),
        customer_company=data.customer_company.strip(),
        deal_ref=data.deal_ref,
        invoice_date=data.invoice_date,
        due_date=data.due_date,
        same_state=data.same_state,
        taxable_paise=taxable,
        cgst_paise=cgst,
        sgst_paise=sgst,
        igst_paise=igst,
        total_paise=taxable + cgst + sgst + igst,
        created_by=actor.user.id,
        created_by_name=actor.user.name,
        idempotency_key=idempotency_key,
    )
    db.add(row)
    await db.flush()
    for position, line in enumerate(data.lines):
        db.add(
            FinanceInvoiceLine(
                tenant_id=tenant_id,
                invoice_id=row.id,
                position=position,
                item=line.item.strip(),
                hsn=line.hsn,
                qty=line.qty,
                rate_paise=line.rate_paise,
                gst_rate=line.gst_rate,
            )
        )
    await db.flush()
    audit.record(
        db,
        "finance.invoice_created",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"invoice": row.number, "total_paise": row.total_paise},
    )
    return await _invoice_out(db, row)


@router.post("/invoices/{invoice_id}/payments", response_model=InvoiceOut, status_code=201)
async def record_payment(
    invoice_id: int,
    data: PaymentIn,
    actor: Billing,
    db: Db,
    request: Request,
    response: Response,
    idempotency_key: Annotated[str, Header(min_length=1, max_length=80)],
) -> InvoiceOut:
    tenant_id = actor.session.tenant_id
    row = await _invoice(db, tenant_id, invoice_id, lock=True)
    existing = await db.scalar(
        select(FinancePayment).where(
            FinancePayment.tenant_id == tenant_id,
            FinancePayment.idempotency_key == idempotency_key,
        )
    )
    if existing is not None:
        _replayed(existing.invoice_id == row.id and existing.amount_paise == data.amount_paise)
        response.status_code = 200
        return await _invoice_out(db, row)
    due = await _due(db, row)
    if data.amount_paise > due:
        raise ApiError("over_payment", "This payment is more than the amount still due.", 422)
    if due <= 0:
        raise ApiError("settled", "This invoice has nothing left to pay.", 422)
    db.add(
        FinancePayment(
            tenant_id=tenant_id,
            invoice_id=row.id,
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
        "finance.payment_recorded",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"invoice": row.number, "amount_paise": data.amount_paise, "method": data.method},
    )
    return await _invoice_out(db, row)


@router.post("/invoices/{invoice_id}/credit-notes", response_model=InvoiceOut, status_code=201)
async def raise_credit_note(
    invoice_id: int,
    data: CreditNoteIn,
    actor: Billing,
    db: Db,
    request: Request,
    response: Response,
    idempotency_key: Annotated[str, Header(min_length=1, max_length=80)],
) -> InvoiceOut:
    tenant_id = actor.session.tenant_id
    row = await _invoice(db, tenant_id, invoice_id, lock=True)
    existing = await db.scalar(
        select(FinanceCreditNote).where(
            FinanceCreditNote.tenant_id == tenant_id,
            FinanceCreditNote.idempotency_key == idempotency_key,
        )
    )
    if existing is not None:
        _replayed(
            existing.invoice_id == row.id
            and existing.amount_paise == data.amount_paise
            and existing.kind == data.kind
        )
        response.status_code = 200
        return await _invoice_out(db, row)
    notes = await _notes_of(db, row.id)
    if data.kind == "write-off":
        left = await _due(db, row)
        if data.amount_paise > left:
            raise ApiError(
                "over_write_off",
                "A write-off cannot be more than what the customer still owes.",
                422,
            )
    else:
        left = row.total_paise - _credited(notes, pending=True)
        if data.amount_paise > left:
            raise ApiError(
                "over_credit",
                "A credit note cannot be more than the invoice total left to credit.",
                422,
            )
    count = await db.scalar(
        select(func.count())
        .select_from(FinanceCreditNote)
        .where(FinanceCreditNote.tenant_id == tenant_id)
    )
    prefix = "WO" if data.kind == "write-off" else "CN"
    note = FinanceCreditNote(
        tenant_id=tenant_id,
        invoice_id=row.id,
        number=f"{prefix}-{row.invoice_date.year}-{101 + (count or 0):04d}",
        kind=data.kind,
        amount_paise=data.amount_paise,
        reason=data.reason.strip(),
        status="pending",
        noted_on=data.noted_on,
        ticket_ref=data.ticket_ref,
        created_by=actor.user.id,
        created_by_name=actor.user.name,
        idempotency_key=idempotency_key,
    )
    db.add(note)
    await db.flush()
    audit.record(
        db,
        "finance.credit_note_raised",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"note": note.number, "kind": data.kind, "amount_paise": data.amount_paise},
    )
    return await _invoice_out(db, row)


@router.post("/credit-notes/{note_id}/approve", response_model=InvoiceOut)
async def approve_credit_note(note_id: int, actor: Billing, db: Db, request: Request) -> InvoiceOut:
    tenant_id = actor.session.tenant_id
    note = await _credit_note(db, tenant_id, note_id)
    if note.status != "pending":
        raise ApiError("not_pending", "Only a pending credit note can be approved.", 409)
    if note.created_by == actor.user.id:
        raise ApiError(
            "self_approval", "The person who raised a credit note cannot approve it.", 403
        )
    note.status = "approved"
    note.approved_by_name = actor.user.name
    await db.flush()
    audit.record(
        db,
        "finance.credit_note_approved",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"note": note.number},
    )
    return await _invoice_out(db, await _invoice(db, tenant_id, note.invoice_id))


@router.post("/credit-notes/{note_id}/reject", response_model=InvoiceOut)
async def reject_credit_note(
    note_id: int, data: RejectIn, actor: Billing, db: Db, request: Request
) -> InvoiceOut:
    tenant_id = actor.session.tenant_id
    note = await _credit_note(db, tenant_id, note_id)
    if note.status != "pending":
        raise ApiError("not_pending", "Only a pending credit note can be rejected.", 409)
    if note.created_by == actor.user.id:
        raise ApiError(
            "self_approval", "The person who raised a credit note cannot reject it.", 403
        )
    note.status = "rejected"
    note.rejected_by_name = actor.user.name
    note.rejected_reason = data.reason.strip()
    await db.flush()
    audit.record(
        db,
        "finance.credit_note_rejected",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"note": note.number},
    )
    return await _invoice_out(db, await _invoice(db, tenant_id, note.invoice_id))
