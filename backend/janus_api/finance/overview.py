"""What Finance tells other modules about one company: what customers owe, what is owed to
suppliers, money in and out over a period, and what waits for a decision. Amounts are in paise.

Other modules read Finance through these functions, never its tables. Each runs under the
company's own context (the caller sets it), so row-level security applies.
"""

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from sqlalchemy import Numeric, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.core.names import document_key, party_key
from janus_api.finance.models import (
    FinanceBankLine,
    FinanceBill,
    FinanceBillPayment,
    FinanceCreditNote,
    FinanceFundRequest,
    FinanceHistoryCustomer,
    FinanceHistoryMonth,
    FinanceInvoice,
    FinancePayment,
    FinancePayrollPosting,
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
    # Still unpaid more than nine months after the invoice date: for an exporter, the time FEMA
    # allows for export money to come in.
    unpaid_9_months: int
    unpaid_9_months_invoices: int


@dataclass(frozen=True)
class Flow:
    invoiced: int
    collected: int
    # Invoices raised in the span, leaving out opening balances: the number of bills a store cut.
    invoices: int


def months_before(day: date, months: int) -> date:
    """The same day `months` earlier, or the month's last day where that month is shorter."""
    index = day.year * 12 + day.month - 1 - months
    year, month = index // 12, index % 12 + 1
    following = date(year + month // 12, month % 12 + 1, 1)
    return min(
        day.replace(year=year, month=month, day=1) + timedelta(days=day.day - 1),
        following - timedelta(days=1),
    )


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
                FinanceInvoice.invoice_date,
                FinanceInvoice.total_paise
                - func.coalesce(paid.c.paise, 0)
                - func.coalesce(credited.c.paise, 0),
            )
            .outerjoin(paid, paid.c.invoice_id == FinanceInvoice.id)
            .outerjoin(credited, credited.c.invoice_id == FinanceInvoice.id)
            .where(FinanceInvoice.tenant_id == tenant_id)
        )
    ).all()
    receivable = overdue = count = old = old_count = 0
    buckets = [0, 0, 0]
    nine_months_ago = months_before(today, 9)
    for due, raised, balance in invoices:
        balance = int(balance)
        if balance <= 0:
            continue
        receivable += balance
        if raised < nine_months_ago:
            old += balance
            old_count += 1
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
                FinanceBill.due_date,
                # Owed to the supplier: the bill less its TDS, which goes to the government.
                FinanceBill.amount_paise
                - FinanceBill.tds_paise
                - func.coalesce(bill_paid.c.paise, 0),
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
        unpaid_9_months=old,
        unpaid_9_months_invoices=old_count,
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
    raised = await db.scalar(
        select(func.count(FinanceInvoice.id)).where(
            FinanceInvoice.tenant_id == tenant_id,
            FinanceInvoice.opening.is_(False),
            FinanceInvoice.invoice_date.between(start, end),
        )
    )
    return Flow(
        invoiced=int(invoiced or 0), collected=int(collected or 0), invoices=int(raised or 0)
    )


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
            FinanceInvoice.tenant_id == tenant_id,
            FinanceInvoice.opening.is_(False),
            FinanceInvoice.invoice_date.between(start, end),
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
            FinanceBill.tenant_id == tenant_id,
            FinanceBill.opening.is_(False),
            FinanceBill.bill_date.between(start, end),
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
                FinanceInvoice.opening.is_(False),
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
            .where(
                FinanceBill.tenant_id == tenant_id,
                FinanceBill.opening.is_(False),
                FinanceBill.bill_date.between(start, end),
            )
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
                    FinanceInvoice.opening.is_(False),
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
                    FinanceBill.tenant_id == tenant_id,
                    FinanceBill.opening.is_(False),
                    FinanceBill.bill_date.between(start, end),
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
    """GST in the books for a span of days, in paise: charged on invoices, taken off by approved
    credit notes (their share of the invoice's GST; write-offs give no GST back), and recorded on
    supplier bills, split into input credit and credit blocked under Section 17(5)."""

    output: int
    credit_notes: int
    input: int
    blocked: int
    # Supplier bills in the span recorded without their GST.
    bills_without_gst: int

    @property
    def net(self) -> int:
        """Output less credit notes and input credit, before credit carried in; below zero is
        credit left over."""
        return self.output - self.credit_notes - self.input


async def _gst_by_month(
    db: AsyncSession, tenant_id: int, start: date | None, end: date
) -> dict[date, Gst]:
    """The GST figures month by month, from `start` (or the first books) to `end`."""

    def span(column: Any) -> Any:
        return column <= end if start is None else column.between(start, end)

    figures: dict[date, dict[str, int]] = {}

    def add(month: Any, **values: Any) -> None:
        day = month.date() if hasattr(month, "date") else month
        row = figures.setdefault(
            day, {"output": 0, "credit": 0, "input": 0, "blocked": 0, "bare": 0}
        )
        for key, value in values.items():
            row[key] += int(value or 0)

    invoice_gst = FinanceInvoice.cgst_paise + FinanceInvoice.sgst_paise + FinanceInvoice.igst_paise
    month = func.date_trunc("month", FinanceInvoice.invoice_date)
    for first, paise in (
        await db.execute(
            select(month, func.sum(invoice_gst))
            .where(
                FinanceInvoice.tenant_id == tenant_id,
                FinanceInvoice.opening.is_(False),
                span(FinanceInvoice.invoice_date),
            )
            .group_by(month)
        )
    ).all():
        add(first, output=paise)
    month = func.date_trunc("month", FinanceCreditNote.noted_on)
    share = func.round(
        FinanceCreditNote.amount_paise
        * invoice_gst.cast(Numeric)
        / func.nullif(FinanceInvoice.total_paise, 0)
    )
    for first, paise in (
        await db.execute(
            select(month, func.sum(share))
            .join(FinanceInvoice, FinanceInvoice.id == FinanceCreditNote.invoice_id)
            .where(
                FinanceCreditNote.tenant_id == tenant_id,
                FinanceCreditNote.status == "approved",
                FinanceCreditNote.kind == "credit",
                FinanceInvoice.opening.is_(False),
                span(FinanceCreditNote.noted_on),
            )
            .group_by(month)
        )
    ).all():
        add(first, credit=paise)
    month = func.date_trunc("month", FinanceBill.bill_date)
    for first, taken, blocked, bare in (
        await db.execute(
            select(
                month,
                func.sum(FinanceBill.gst_paise).filter(FinanceBill.itc_blocked.is_(False)),
                func.sum(FinanceBill.gst_paise).filter(FinanceBill.itc_blocked.is_(True)),
                func.count(FinanceBill.id).filter(FinanceBill.gst_paise == 0),
            )
            .where(
                FinanceBill.tenant_id == tenant_id,
                FinanceBill.opening.is_(False),
                span(FinanceBill.bill_date),
            )
            .group_by(month)
        )
    ).all():
        add(first, input=taken, blocked=blocked, bare=bare)
    return {
        day: Gst(
            output=row["output"],
            credit_notes=row["credit"],
            input=row["input"],
            blocked=row["blocked"],
            bills_without_gst=row["bare"],
        )
        for day, row in figures.items()
    }


async def gst(db: AsyncSession, tenant_id: int, start: date, end: date) -> Gst:
    months = (await _gst_by_month(db, tenant_id, start, end)).values()
    return Gst(
        output=sum(m.output for m in months),
        credit_notes=sum(m.credit_notes for m in months),
        input=sum(m.input for m in months),
        blocked=sum(m.blocked for m in months),
        bills_without_gst=sum(m.bills_without_gst for m in months),
    )


async def gst_carried(db: AsyncSession, tenant_id: int, before: date) -> int:
    """Input credit left over from the months before `before` (a month's first day), carried
    into it: each month's credit beyond its GST charged is used against the next month's."""
    carry = 0
    months = await _gst_by_month(db, tenant_id, None, before - timedelta(days=1))
    for first in sorted(months):
        carry = max(0, carry - months[first].net)
    return carry


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
    customer where no company is given), matched as `party_key` matches them."""
    wanted = {party_key(name) for name in names}
    party = func.coalesce(func.nullif(FinanceInvoice.customer_company, ""), FinanceInvoice.customer)
    recent = (
        FinanceInvoice.tenant_id == tenant_id,
        FinanceInvoice.opening.is_(False),
        FinanceInvoice.invoice_date >= since,
    )
    parties = [
        str(name)
        for name in (await db.scalars(select(party).where(*recent).distinct())).all()
        if party_key(str(name)) in wanted
    ]
    if not parties:
        return []
    rows = await db.execute(
        select(
            FinanceInvoice.number,
            party,
            FinanceInvoice.invoice_date,
            FinanceInvoice.due_date,
            FinanceInvoice.cgst_paise + FinanceInvoice.sgst_paise + FinanceInvoice.igst_paise,
            FinanceInvoice.total_paise,
        )
        .where(*recent, party.in_(parties))
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


@dataclass(frozen=True)
class BillMatch:
    """The buyer's bill for a supplier invoice: Janus's bill number, and whether it was found by
    the invoice number (or only by the same amount within a few days of the invoice)."""

    number: str
    by_number: bool


# A bill for the same amount this many days either side of an invoice is probably it.
PROBABLE_DAYS = 10


async def bills_for_invoices(
    db: AsyncSession, tenant_id: int, vendor: str, invoices: list[InvoiceRef]
) -> dict[str, BillMatch]:
    """Of these invoices from one supplier, those already recorded as bills, by invoice number
    without case or separators, or else by the same amount within PROBABLE_DAYS of the invoice;
    each bill is matched to one invoice only. Keyed by the supplier's invoice number."""
    if not invoices:
        return {}
    vendors = [
        str(name)
        for name in (
            await db.scalars(
                select(FinanceBill.vendor)
                .where(FinanceBill.tenant_id == tenant_id, FinanceBill.opening.is_(False))
                .distinct()
            )
        ).all()
        if party_key(str(name)) == party_key(vendor)
    ]
    if not vendors:
        return {}
    first = min(invoice.invoice_date for invoice in invoices) - timedelta(days=PROBABLE_DAYS)
    bills = (
        await db.execute(
            select(
                FinanceBill.number,
                FinanceBill.vendor_bill_no,
                FinanceBill.bill_date,
                FinanceBill.amount_paise,
            ).where(
                FinanceBill.tenant_id == tenant_id,
                FinanceBill.opening.is_(False),
                FinanceBill.vendor.in_(vendors),
                FinanceBill.bill_date >= first,
            )
        )
    ).all()
    found: dict[str, BillMatch] = {}
    used: set[str] = set()
    by_key = {document_key(str(row.vendor_bill_no)): row for row in bills}
    for invoice in invoices:
        row = by_key.get(document_key(invoice.number))
        if row is not None:
            found[invoice.number] = BillMatch(number=str(row.number), by_number=True)
            used.add(str(row.number))
    for invoice in invoices:
        if invoice.number in found:
            continue
        near = sorted(
            (
                row
                for row in bills
                if str(row.number) not in used
                and int(row.amount_paise) == invoice.total
                and abs((row.bill_date - invoice.invoice_date).days) <= PROBABLE_DAYS
            ),
            key=lambda row: abs((row.bill_date - invoice.invoice_date).days),
        )
        if near:
            found[invoice.number] = BillMatch(number=str(near[0].number), by_number=False)
            used.add(str(near[0].number))
    return found


async def payroll_posted(
    db: AsyncSession, tenant_id: int, start: date, end: date
) -> dict[date, int]:
    """Salaries posted for the months that fall between two days, in paise, by month."""
    rows = await db.execute(
        select(FinancePayrollPosting.month, FinancePayrollPosting.amount_paise).where(
            FinancePayrollPosting.tenant_id == tenant_id,
            FinancePayrollPosting.month.between(start.replace(day=1), end),
        )
    )
    return {month: int(amount) for month, amount in rows.all()}


@dataclass(frozen=True)
class AccountCash:
    account: str
    # The balance after the newest line that gives one, in paise; None without a balance column.
    balance: int | None
    as_of: date


@dataclass(frozen=True)
class Cash:
    accounts: list[AccountCash]
    # Money out less money in over the 90 days before the newest line, per month, in paise;
    # zero or less when more came in than went out.
    monthly_burn: int


async def cash(db: AsyncSession, tenant_id: int) -> Cash | None:
    """Cash in the bank from imported statements; None when none was imported."""
    accounts = list(
        await db.scalars(
            select(FinanceBankLine.account)
            .where(FinanceBankLine.tenant_id == tenant_id)
            .group_by(FinanceBankLine.account)
            .order_by(FinanceBankLine.account)
        )
    )
    if not accounts:
        return None
    found: list[AccountCash] = []
    newest = date.min
    for account in accounts:
        line = (
            await db.execute(
                select(FinanceBankLine.balance_paise, FinanceBankLine.line_date)
                .where(
                    FinanceBankLine.tenant_id == tenant_id,
                    FinanceBankLine.account == account,
                    FinanceBankLine.balance_paise.is_not(None),
                )
                .order_by(FinanceBankLine.line_date.desc(), FinanceBankLine.position.desc())
                .limit(1)
            )
        ).first()
        last_day = await db.scalar(
            select(func.max(FinanceBankLine.line_date)).where(
                FinanceBankLine.tenant_id == tenant_id, FinanceBankLine.account == account
            )
        )
        newest = max(newest, last_day or date.min)
        found.append(
            AccountCash(
                account=account,
                balance=int(line[0]) if line else None,
                as_of=line[1] if line else (last_day or date.min),
            )
        )
    net = await db.scalar(
        select(func.coalesce(func.sum(FinanceBankLine.amount_paise), 0)).where(
            FinanceBankLine.tenant_id == tenant_id,
            FinanceBankLine.line_date > newest - timedelta(days=90),
        )
    )
    return Cash(accounts=found, monthly_burn=round(-int(net or 0) / 3))


async def history(
    db: AsyncSession, tenant_id: int, start: date, end: date
) -> dict[date, tuple[int, int]]:
    """Imported months between two days: (sales, costs) in paise, by the month's first day."""
    rows = await db.execute(
        select(
            FinanceHistoryMonth.month,
            FinanceHistoryMonth.sales_paise,
            FinanceHistoryMonth.costs_paise,
        ).where(
            FinanceHistoryMonth.tenant_id == tenant_id,
            FinanceHistoryMonth.month.between(start.replace(day=1), end),
        )
    )
    return {month: (int(sales), int(costs)) for month, sales, costs in rows.all()}


@dataclass(frozen=True)
class Tds:
    """TDS deducted between two days, in paise: from supplier bills (by bill date) and from salaries
    posted for months in the span."""

    on_bills: int
    on_salaries: int
    # Bills in the span with TDS, by section: {"194C": paise}.
    by_section: dict[str, int]


async def tds(db: AsyncSession, tenant_id: int, start: date, end: date) -> Tds:
    sections = {
        str(section): int(paise)
        for section, paise in (
            await db.execute(
                select(FinanceBill.tds_section, func.sum(FinanceBill.tds_paise))
                .where(
                    FinanceBill.tenant_id == tenant_id,
                    FinanceBill.opening.is_(False),
                    FinanceBill.bill_date.between(start, end),
                    FinanceBill.tds_paise > 0,
                )
                .group_by(FinanceBill.tds_section)
            )
        ).all()
    }
    salaries = await db.scalar(
        select(func.coalesce(func.sum(FinancePayrollPosting.tds_paise), 0)).where(
            FinancePayrollPosting.tenant_id == tenant_id,
            FinancePayrollPosting.month.between(start.replace(day=1), end),
        )
    )
    return Tds(on_bills=sum(sections.values()), on_salaries=int(salaries or 0), by_section=sections)


async def customer_months(
    db: AsyncSession, tenant_id: int, start: date, end: date
) -> tuple[dict[str, dict[date, int]], bool]:
    """Sales before GST by customer and month between two days, in paise: from invoices, and from
    imported customer history for months with no invoices in Janus. Also says whether any imported
    month was used."""
    name = func.coalesce(func.nullif(FinanceInvoice.customer_company, ""), FinanceInvoice.customer)
    month = func.date_trunc("month", FinanceInvoice.invoice_date)
    out: dict[str, dict[date, int]] = {}
    own: set[date] = set()
    for customer, first, paise in (
        await db.execute(
            select(name, month, func.sum(FinanceInvoice.taxable_paise))
            .where(
                FinanceInvoice.tenant_id == tenant_id,
                FinanceInvoice.opening.is_(False),
                FinanceInvoice.invoice_date.between(start, end),
            )
            .group_by(name, month)
        )
    ).all():
        day = first.date() if hasattr(first, "date") else first
        own.add(day)
        out.setdefault(str(customer), {})[day] = int(paise or 0)
    used = False
    for customer, day, paise in (
        await db.execute(
            select(
                FinanceHistoryCustomer.customer,
                FinanceHistoryCustomer.month,
                FinanceHistoryCustomer.sales_paise,
            ).where(
                FinanceHistoryCustomer.tenant_id == tenant_id,
                FinanceHistoryCustomer.month.between(start.replace(day=1), end),
            )
        )
    ).all():
        if day in own:
            continue
        used = True
        bucket = out.setdefault(str(customer), {})
        bucket[day] = bucket.get(day, 0) + int(paise)
    return out, used
