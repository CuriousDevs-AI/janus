"""What Finance tells other modules about one company: what customers owe, what is owed to
suppliers, money in and out over a period, and what waits for a decision. Amounts are in paise.

Other modules read Finance through these functions, never its tables. Each runs under the
company's own context (the caller sets it), so row-level security applies.
"""

from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.finance.models import (
    FinanceBill,
    FinanceBillPayment,
    FinanceCreditNote,
    FinanceFundRequest,
    FinanceInvoice,
    FinancePayment,
)


@dataclass(frozen=True)
class Money:
    receivable: int
    overdue: int
    overdue_invoices: int
    # What is overdue by how late it is: 1-30 days, 31-60 days, over 60 days.
    late_0_30: int
    late_31_60: int
    late_over_60: int
    payable: int
    # Unpaid bills past their due date, and those due within 7 days including the late ones.
    payable_late: int
    payable_due_this_week: int


@dataclass(frozen=True)
class Flow:
    invoiced: int
    collected: int


async def money(db: AsyncSession, tenant_id: int, today: date) -> Money:
    """What customers owe and what is owed to suppliers.

    An approved credit note reduces what a customer owes; a pending one does not yet.
    """
    paid = (
        select(FinancePayment.invoice_id, func.sum(FinancePayment.amount_paise).label("paise"))
        .where(FinancePayment.tenant_id == tenant_id)
        .group_by(FinancePayment.invoice_id)
        .subquery()
    )
    credited = (
        select(
            FinanceCreditNote.invoice_id, func.sum(FinanceCreditNote.amount_paise).label("paise")
        )
        .where(FinanceCreditNote.tenant_id == tenant_id, FinanceCreditNote.status == "approved")
        .group_by(FinanceCreditNote.invoice_id)
        .subquery()
    )
    invoices = (
        await db.execute(
            select(
                FinanceInvoice.due_date,
                FinanceInvoice.total_paise
                - func.coalesce(paid.c.paise, 0)
                - func.coalesce(credited.c.paise, 0),
            )
            .outerjoin(paid, paid.c.invoice_id == FinanceInvoice.id)
            .outerjoin(credited, credited.c.invoice_id == FinanceInvoice.id)
            .where(FinanceInvoice.tenant_id == tenant_id)
        )
    ).all()
    receivable = overdue = count = 0
    buckets = [0, 0, 0]
    for due, balance in invoices:
        balance = int(balance)
        if balance <= 0:
            continue
        receivable += balance
        late = (today - due).days
        if late > 0:
            overdue += balance
            count += 1
            buckets[0 if late <= 30 else 1 if late <= 60 else 2] += balance
    bill_paid = (
        select(FinanceBillPayment.bill_id, func.sum(FinanceBillPayment.amount_paise).label("paise"))
        .where(FinanceBillPayment.tenant_id == tenant_id)
        .group_by(FinanceBillPayment.bill_id)
        .subquery()
    )
    bills = (
        await db.execute(
            select(
                FinanceBill.due_date, FinanceBill.amount_paise - func.coalesce(bill_paid.c.paise, 0)
            )
            .outerjoin(bill_paid, bill_paid.c.bill_id == FinanceBill.id)
            .where(FinanceBill.tenant_id == tenant_id)
        )
    ).all()
    week = today + timedelta(days=7)
    return Money(
        receivable=receivable,
        overdue=overdue,
        overdue_invoices=count,
        late_0_30=buckets[0],
        late_31_60=buckets[1],
        late_over_60=buckets[2],
        payable=sum(max(0, int(balance)) for _, balance in bills),
        payable_late=sum(max(0, int(balance)) for due, balance in bills if due < today),
        payable_due_this_week=sum(max(0, int(balance)) for due, balance in bills if due <= week),
    )


async def flow(db: AsyncSession, tenant_id: int, start: date, end: date) -> Flow:
    """Invoiced and collected between two days, both included."""
    invoiced = await db.scalar(
        select(func.coalesce(func.sum(FinanceInvoice.total_paise), 0)).where(
            FinanceInvoice.tenant_id == tenant_id, FinanceInvoice.invoice_date.between(start, end)
        )
    )
    collected = await db.scalar(
        select(func.coalesce(func.sum(FinancePayment.amount_paise), 0)).where(
            FinancePayment.tenant_id == tenant_id, FinancePayment.paid_on.between(start, end)
        )
    )
    return Flow(invoiced=int(invoiced or 0), collected=int(collected or 0))


async def pending_approvals(db: AsyncSession, tenant_id: int) -> dict[str, int]:
    """Fund requests and credit notes waiting for a decision."""
    funds = await db.scalar(
        select(func.count(FinanceFundRequest.id)).where(
            FinanceFundRequest.tenant_id == tenant_id,
            FinanceFundRequest.status.in_(("pending", "awaiting_finance")),
        )
    )
    credit_notes = await db.scalar(
        select(func.count(FinanceCreditNote.id)).where(
            FinanceCreditNote.tenant_id == tenant_id, FinanceCreditNote.status == "pending"
        )
    )
    return {"funds": int(funds or 0), "credit_notes": int(credit_notes or 0)}


@dataclass(frozen=True)
class Books:
    """What the books say about a span of days, in paise."""

    # Invoiced before GST, less approved credit notes.
    net_sales: int
    # Supplier bills before the GST recorded in them, plus approved write-offs.
    costs: int
    # What was paid to suppliers.
    paid_out: int


async def books(db: AsyncSession, tenant_id: int, start: date, end: date) -> Books:
    """Sales, costs and money paid out between two days, both included."""
    taxable = await db.scalar(
        select(func.coalesce(func.sum(FinanceInvoice.taxable_paise), 0)).where(
            FinanceInvoice.tenant_id == tenant_id, FinanceInvoice.invoice_date.between(start, end)
        )
    )
    notes: dict[str, int] = {
        str(kind): int(amount)
        for kind, amount in (
            await db.execute(
                select(
                    FinanceCreditNote.kind,
                    func.coalesce(func.sum(FinanceCreditNote.amount_paise), 0),
                )
                .where(
                    FinanceCreditNote.tenant_id == tenant_id,
                    FinanceCreditNote.status == "approved",
                    FinanceCreditNote.noted_on.between(start, end),
                )
                .group_by(FinanceCreditNote.kind)
            )
        ).all()
    }
    bills = await db.scalar(
        select(func.coalesce(func.sum(FinanceBill.amount_paise - FinanceBill.gst_paise), 0)).where(
            FinanceBill.tenant_id == tenant_id, FinanceBill.bill_date.between(start, end)
        )
    )
    paid = await db.scalar(
        select(func.coalesce(func.sum(FinanceBillPayment.amount_paise), 0)).where(
            FinanceBillPayment.tenant_id == tenant_id,
            FinanceBillPayment.paid_on.between(start, end),
        )
    )
    return Books(
        net_sales=int(taxable or 0) - int(notes.get("credit", 0)),
        costs=int(bills or 0) + int(notes.get("write-off", 0)),
        paid_out=int(paid or 0),
    )


async def sales_by_customer(
    db: AsyncSession, tenant_id: int, start: date, end: date
) -> dict[str, int]:
    """Invoiced before GST between two days, by customer: the company's name where the invoice
    has one, otherwise the person's."""
    name = func.coalesce(func.nullif(FinanceInvoice.customer_company, ""), FinanceInvoice.customer)
    rows = (
        await db.execute(
            select(name, func.sum(FinanceInvoice.taxable_paise))
            .where(
                FinanceInvoice.tenant_id == tenant_id,
                FinanceInvoice.invoice_date.between(start, end),
            )
            .group_by(name)
        )
    ).all()
    return {str(customer): int(amount or 0) for customer, amount in rows}


async def costs_by_vendor(
    db: AsyncSession, tenant_id: int, start: date, end: date
) -> dict[str, int]:
    """Supplier bills before their recorded GST, between two days, by vendor."""
    rows = (
        await db.execute(
            select(FinanceBill.vendor, func.sum(FinanceBill.amount_paise - FinanceBill.gst_paise))
            .where(FinanceBill.tenant_id == tenant_id, FinanceBill.bill_date.between(start, end))
            .group_by(FinanceBill.vendor)
        )
    ).all()
    return {str(vendor): int(amount or 0) for vendor, amount in rows}
