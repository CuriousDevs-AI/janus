"""What Finance tells other modules about one company: what customers owe, what is owed to
suppliers, money in and out over a period, and what waits for a decision. Amounts are in paise.

Other modules read Finance through these functions, never its tables. Each runs under the
company's own context (the caller sets it), so row-level security applies.
"""

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

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


@dataclass(frozen=True)
class DayMoney:
    """One day, in paise: sales before GST less credit notes, costs before GST plus write-offs,
    and money collected from customers."""

    net_sales: int = 0
    costs: int = 0
    collected: int = 0


async def daily(db: AsyncSession, tenant_id: int, start: date, end: date) -> dict[date, DayMoney]:
    """The books day by day between two days, both included. Days with nothing are left out."""
    days: dict[date, dict[str, int]] = {}

    def add(rows: Any, key: str, sign: int = 1) -> None:
        for day, amount in rows:
            days.setdefault(day, {"net_sales": 0, "costs": 0, "collected": 0})[key] += sign * int(
                amount or 0
            )

    add(
        (
            await db.execute(
                select(FinanceInvoice.invoice_date, func.sum(FinanceInvoice.taxable_paise))
                .where(
                    FinanceInvoice.tenant_id == tenant_id,
                    FinanceInvoice.invoice_date.between(start, end),
                )
                .group_by(FinanceInvoice.invoice_date)
            )
        ).all(),
        "net_sales",
    )
    for kind, key, sign in (("credit", "net_sales", -1), ("write-off", "costs", 1)):
        add(
            (
                await db.execute(
                    select(FinanceCreditNote.noted_on, func.sum(FinanceCreditNote.amount_paise))
                    .where(
                        FinanceCreditNote.tenant_id == tenant_id,
                        FinanceCreditNote.status == "approved",
                        FinanceCreditNote.kind == kind,
                        FinanceCreditNote.noted_on.between(start, end),
                    )
                    .group_by(FinanceCreditNote.noted_on)
                )
            ).all(),
            key,
            sign,
        )
    add(
        (
            await db.execute(
                select(
                    FinanceBill.bill_date,
                    func.sum(FinanceBill.amount_paise - FinanceBill.gst_paise),
                )
                .where(
                    FinanceBill.tenant_id == tenant_id, FinanceBill.bill_date.between(start, end)
                )
                .group_by(FinanceBill.bill_date)
            )
        ).all(),
        "costs",
    )
    add(
        (
            await db.execute(
                select(FinancePayment.paid_on, func.sum(FinancePayment.amount_paise))
                .where(
                    FinancePayment.tenant_id == tenant_id,
                    FinancePayment.paid_on.between(start, end),
                )
                .group_by(FinancePayment.paid_on)
            )
        ).all(),
        "collected",
    )
    return {day: DayMoney(**values) for day, values in days.items()}


@dataclass(frozen=True)
class Gst:
    """GST in the books for a span of days, in paise: charged on invoices, and recorded on supplier
    bills (input credit). Credit notes keep no GST of their own, so they are not taken off."""

    output: int
    input: int
    # Supplier bills in the span recorded without their GST.
    bills_without_gst: int


async def gst(db: AsyncSession, tenant_id: int, start: date, end: date) -> Gst:
    output = await db.scalar(
        select(
            func.coalesce(
                func.sum(
                    FinanceInvoice.cgst_paise
                    + FinanceInvoice.sgst_paise
                    + FinanceInvoice.igst_paise
                ),
                0,
            )
        ).where(
            FinanceInvoice.tenant_id == tenant_id, FinanceInvoice.invoice_date.between(start, end)
        )
    )
    paid, missing = (
        await db.execute(
            select(
                func.coalesce(func.sum(FinanceBill.gst_paise), 0),
                func.count(FinanceBill.id).filter(FinanceBill.gst_paise == 0),
            ).where(FinanceBill.tenant_id == tenant_id, FinanceBill.bill_date.between(start, end))
        )
    ).one()
    return Gst(output=int(output or 0), input=int(paid or 0), bills_without_gst=int(missing or 0))


@dataclass(frozen=True)
class InvoiceRef:
    """One invoice, in paise, as another module needs it to match a bill to it."""

    number: str
    customer: str
    invoice_date: date
    due_date: date
    gst: int
    total: int


async def invoices_to(
    db: AsyncSession, tenant_id: int, names: list[str], since: date
) -> list[InvoiceRef]:
    """Invoices since a day to customers with one of these names (the customer's company, or the
    customer where no company is given), compared without case."""
    wanted = [name.strip().casefold() for name in names]
    party = func.lower(
        func.coalesce(func.nullif(FinanceInvoice.customer_company, ""), FinanceInvoice.customer)
    )
    rows = await db.execute(
        select(
            FinanceInvoice.number,
            func.coalesce(
                func.nullif(FinanceInvoice.customer_company, ""), FinanceInvoice.customer
            ),
            FinanceInvoice.invoice_date,
            FinanceInvoice.due_date,
            FinanceInvoice.cgst_paise + FinanceInvoice.sgst_paise + FinanceInvoice.igst_paise,
            FinanceInvoice.total_paise,
        )
        .where(
            FinanceInvoice.tenant_id == tenant_id,
            FinanceInvoice.invoice_date >= since,
            func.trim(party).in_(wanted),
        )
        .order_by(FinanceInvoice.invoice_date.desc(), FinanceInvoice.id.desc())
        .limit(500)
    )
    return [
        InvoiceRef(
            number=number,
            customer=customer,
            invoice_date=day,
            due_date=due,
            gst=int(gst),
            total=int(total),
        )
        for number, customer, day, due, gst, total in rows.all()
    ]


async def bills_for_invoices(
    db: AsyncSession, tenant_id: int, vendor: str, numbers: list[str]
) -> dict[str, str]:
    """Of these supplier invoice numbers from one supplier, those already recorded as bills: the
    supplier's invoice number and Janus's own bill number."""
    if not numbers:
        return {}
    rows = await db.execute(
        select(FinanceBill.vendor_bill_no, FinanceBill.number).where(
            FinanceBill.tenant_id == tenant_id,
            func.lower(func.trim(FinanceBill.vendor)) == vendor.strip().casefold(),
            FinanceBill.vendor_bill_no.in_(numbers),
        )
    )
    return {str(supplier_no): str(own) for supplier_no, own in rows.all()}
