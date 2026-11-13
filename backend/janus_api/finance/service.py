"""What other modules may ask Finance to do, with the same checks as Finance's own screens."""

import hashlib
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit import service as audit
from janus_api.core.errors import ApiError
from janus_api.core.money import inr_exact
from janus_api.finance.models import (
    FinanceBankLine,
    FinanceBill,
    FinanceBillPayment,
    FinanceBudgetLine,
    FinanceCreditNote,
    FinanceHistoryCustomer,
    FinanceHistoryMonth,
    FinanceInvoice,
    FinancePayment,
    FinancePayrollPosting,
)
from janus_api.rules.service import ensure_open


async def bill_with_key(db: AsyncSession, tenant_id: int, idempotency_key: str) -> str | None:
    """The number of the bill recorded with this key, if one was."""
    found = await db.scalar(
        select(FinanceBill.number).where(
            FinanceBill.tenant_id == tenant_id, FinanceBill.idempotency_key == idempotency_key
        )
    )
    return None if found is None else str(found)


async def record_bill(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    user_name: str,
    *,
    vendor: str,
    vendor_bill_no: str,
    bill_date: date,
    due_date: date,
    amount_paise: int,
    gst_paise: int,
    idempotency_key: str,
    ip: str | None,
) -> str:
    """Records a supplier bill in this company (the caller is in its context and has checked the
    person may record bills) and returns its number. Asking twice with one key records it once."""
    existing = await db.scalar(
        select(FinanceBill.number).where(
            FinanceBill.tenant_id == tenant_id, FinanceBill.idempotency_key == idempotency_key
        )
    )
    if existing is not None:
        return str(existing)
    if amount_paise <= 0 or not 0 <= gst_paise < amount_paise:
        raise ApiError("invalid_bill", "The bill's amount or GST is not valid.", 422)
    if due_date < bill_date:
        due_date = bill_date
    await ensure_open(db, tenant_id, bill_date)
    count = await db.scalar(
        select(func.count()).select_from(FinanceBill).where(FinanceBill.tenant_id == tenant_id)
    )
    row = FinanceBill(
        tenant_id=tenant_id,
        number=f"BILL-{bill_date.year}-{101 + (count or 0):04d}",
        vendor=vendor.strip()[:160],
        vendor_bill_no=vendor_bill_no.strip()[:80],
        bill_date=bill_date,
        due_date=due_date,
        amount_paise=amount_paise,
        gst_paise=gst_paise,
        created_by=user_id,
        created_by_name=user_name,
        idempotency_key=idempotency_key[:80],
    )
    db.add(row)
    await db.flush()
    audit.record(
        db,
        "finance.bill_recorded",
        user_id=user_id,
        tenant_id=tenant_id,
        ip=ip,
        details={"bill": row.number, "amount_paise": amount_paise, "vendor": row.vendor},
    )
    return row.number


async def post_payroll(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    user_name: str,
    *,
    month: date,
    amount_paise: int,
    headcount: int,
    ip: str | None,
    tds_paise: int = 0,
) -> bool:
    """Posts a month's salaries to the books (the caller is in the company's context and has
    checked the person may). False when that month was posted already: a posting is not changed."""
    month = month.replace(day=1)
    if amount_paise <= 0:
        raise ApiError("no_salaries", "There are no salaries on record to post.", 422)
    if not 0 <= tds_paise < amount_paise:
        raise ApiError("invalid_tds", "TDS on salaries must be less than the salaries.", 422)
    exists = await db.scalar(
        select(FinancePayrollPosting.id).where(
            FinancePayrollPosting.tenant_id == tenant_id, FinancePayrollPosting.month == month
        )
    )
    if exists is not None:
        return False
    next_month = (month.replace(day=28) + timedelta(days=4)).replace(day=1)
    await ensure_open(db, tenant_id, next_month - timedelta(days=1))
    db.add(
        FinancePayrollPosting(
            tenant_id=tenant_id,
            month=month,
            amount_paise=amount_paise,
            tds_paise=tds_paise,
            headcount=headcount,
            posted_by=user_id,
            posted_by_name=user_name,
        )
    )
    await db.flush()
    audit.record(
        db,
        "finance.payroll_posted",
        user_id=user_id,
        tenant_id=tenant_id,
        ip=ip,
        details={"month": month.isoformat(), "amount_paise": amount_paise, "tds_paise": tds_paise},
    )
    return True


@dataclass(frozen=True)
class BankRow:
    day: date
    description: str
    amount_paise: int
    balance_paise: int | None


async def import_bank_lines(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    account: str,
    rows: list[BankRow],
    ip: str | None,
) -> tuple[int, int]:
    """Adds a statement's lines to the company's bank account (the caller is in its context and
    has checked the person may). Lines already imported are skipped. Returns (added, skipped)."""
    if not 1 <= len(rows) <= 5000:
        raise ApiError("invalid_statement", "A statement has 1 to 5,000 lines.", 422)
    account = account.strip()[:80] or "Bank account"
    prints = []
    for position, row in enumerate(rows):
        key = f"{account}|{row.day}|{row.description}|{row.amount_paise}|{row.balance_paise}"
        prints.append((position, row, hashlib.sha256(key.encode()).hexdigest()))
    known = set(
        await db.scalars(
            select(FinanceBankLine.fingerprint).where(
                FinanceBankLine.tenant_id == tenant_id,
                FinanceBankLine.fingerprint.in_([p for _, _, p in prints]),
            )
        )
    )
    added = 0
    for position, row, fingerprint in prints:
        if fingerprint in known:
            continue
        known.add(fingerprint)
        db.add(
            FinanceBankLine(
                tenant_id=tenant_id,
                account=account,
                line_date=row.day,
                position=position,
                description=row.description.strip()[:300],
                amount_paise=row.amount_paise,
                balance_paise=row.balance_paise,
                fingerprint=fingerprint,
                imported_by=user_id,
            )
        )
        added += 1
    await db.flush()
    audit.record(
        db,
        "finance.bank_statement_imported",
        user_id=user_id,
        tenant_id=tenant_id,
        ip=ip,
        details={"account": account, "added": added, "skipped": len(rows) - added},
    )
    return added, len(rows) - added


async def import_history(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    source: str,
    months: list[tuple[date, int, int]],
    ip: str | None,
) -> int:
    """Saves imported months (first day, sales, costs in paise), replacing a month imported
    before. The caller is in the company's context and has checked the person may."""
    if not 1 <= len(months) <= 120:
        raise ApiError("invalid_history", "Import 1 to 120 months at a time.", 422)
    for month, sales, costs in months:
        if sales < 0 or costs < 0:
            raise ApiError("invalid_history", "Sales and costs cannot be negative.", 422)
        row = await db.scalar(
            select(FinanceHistoryMonth).where(
                FinanceHistoryMonth.tenant_id == tenant_id,
                FinanceHistoryMonth.month == month.replace(day=1),
            )
        )
        if row is None:
            row = FinanceHistoryMonth(tenant_id=tenant_id, month=month.replace(day=1))
            db.add(row)
        row.sales_paise, row.costs_paise, row.source, row.imported_by = (
            sales,
            costs,
            source,
            user_id,
        )
    await db.flush()
    audit.record(
        db,
        "finance.history_imported",
        user_id=user_id,
        tenant_id=tenant_id,
        ip=ip,
        details={"source": source, "months": len(months)},
    )
    return len(months)


async def import_customer_history(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    source: str,
    rows: list[tuple[date, str, int]],
    ip: str | None,
) -> int:
    """Saves imported months customer by customer (first day, customer, sales in paise), adding up
    rows for one customer and month and replacing an earlier import of them. The caller is in the
    company's context and has checked the person may."""
    if not 1 <= len(rows) <= 20000:
        raise ApiError("invalid_history", "Import 1 to 20,000 rows at a time.", 422)
    totals: dict[tuple[date, str], int] = {}
    for month, customer, paise in rows:
        name = customer.strip()[:160]
        if not name or paise < 0:
            raise ApiError(
                "invalid_history", "Each row needs a customer and sales of 0 or more.", 422
            )
        key = (month.replace(day=1), name)
        totals[key] = totals.get(key, 0) + paise
    for (month, name), paise in totals.items():
        row = await db.scalar(
            select(FinanceHistoryCustomer).where(
                FinanceHistoryCustomer.tenant_id == tenant_id,
                FinanceHistoryCustomer.month == month,
                FinanceHistoryCustomer.customer == name,
            )
        )
        if row is None:
            row = FinanceHistoryCustomer(tenant_id=tenant_id, month=month, customer=name)
            db.add(row)
        row.sales_paise, row.source, row.imported_by = paise, source, user_id
    await db.flush()
    audit.record(
        db,
        "finance.customer_history_imported",
        user_id=user_id,
        tenant_id=tenant_id,
        ip=ip,
        details={"source": source, "rows": len(totals)},
    )
    return len(totals)


@dataclass(frozen=True)
class OpeningRow:
    party: str
    amount_paise: int
    due: date


async def record_openings(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    user_name: str,
    *,
    as_of: date,
    customers: list[OpeningRow],
    suppliers: list[OpeningRow],
    ip: str | None,
) -> tuple[int, int]:
    """Records what customers owed and what was owed to suppliers on the day the company moved to
    Janus, as opening invoices and bills dated that day. A party's opening balance is recorded once:
    asking again for the same party and day changes nothing. Returns (invoices, bills) added."""
    if len(customers) + len(suppliers) > 2000:
        raise ApiError("invalid_opening", "Import up to 2,000 opening balances at a time.", 422)
    await ensure_open(db, tenant_id, as_of)
    added = [0, 0]
    for kind, rows in (("customer", customers), ("supplier", suppliers)):
        for row in rows:
            name = row.party.strip()[:160]
            if len(name) < 2 or row.amount_paise <= 0:
                raise ApiError("invalid_opening", "Each balance needs a name and an amount.", 422)
            key = _opening_key(as_of, name)
            model = FinanceInvoice if kind == "customer" else FinanceBill
            if await db.scalar(
                select(model.id).where(model.tenant_id == tenant_id, model.idempotency_key == key)
            ):
                continue
            count = await db.scalar(
                select(func.count())
                .select_from(model)
                .where(model.tenant_id == tenant_id, model.opening.is_(True))
            )
            due = max(row.due, as_of)
            if kind == "customer":
                db.add(
                    FinanceInvoice(
                        tenant_id=tenant_id,
                        number=f"OB-{as_of.year}-{1 + (count or 0):04d}",
                        customer=name,
                        customer_company=name,
                        invoice_date=as_of,
                        due_date=due,
                        same_state=True,
                        taxable_paise=row.amount_paise,
                        cgst_paise=0,
                        sgst_paise=0,
                        igst_paise=0,
                        total_paise=row.amount_paise,
                        opening=True,
                        created_by=user_id,
                        created_by_name=user_name,
                        idempotency_key=key,
                    )
                )
                added[0] += 1
            else:
                db.add(
                    FinanceBill(
                        tenant_id=tenant_id,
                        number=f"OBB-{as_of.year}-{1 + (count or 0):04d}",
                        vendor=name,
                        vendor_bill_no="Opening balance",
                        bill_date=as_of,
                        due_date=due,
                        amount_paise=row.amount_paise,
                        gst_paise=0,
                        opening=True,
                        created_by=user_id,
                        created_by_name=user_name,
                        idempotency_key=key,
                    )
                )
                added[1] += 1
            await db.flush()
    audit.record(
        db,
        "finance.opening_balances_recorded",
        user_id=user_id,
        tenant_id=tenant_id,
        ip=ip,
        details={"as_of": as_of.isoformat(), "invoices": added[0], "bills": added[1]},
    )
    return added[0], added[1]


@dataclass(frozen=True)
class OpeningBalance:
    key: str
    kind: str
    party: str
    as_of: date
    due: date
    amount_paise: int
    settled_paise: int
    credit_notes: int


def _opening_key(as_of: date, name: str) -> str:
    return f"opening:{as_of}:{hashlib.sha256(name.casefold().encode()).hexdigest()[:40]}"


async def _invoice_settled(db: AsyncSession, invoice_id: int) -> tuple[int, int]:
    """Paise paid or credited on an invoice, and how many credit notes (any status) it has."""
    paid = await db.scalar(
        select(func.coalesce(func.sum(FinancePayment.amount_paise), 0)).where(
            FinancePayment.invoice_id == invoice_id
        )
    )
    credited = await db.scalar(
        select(func.coalesce(func.sum(FinanceCreditNote.amount_paise), 0)).where(
            FinanceCreditNote.invoice_id == invoice_id, FinanceCreditNote.status == "approved"
        )
    )
    notes = await db.scalar(select(func.count()).where(FinanceCreditNote.invoice_id == invoice_id))
    return int(paid or 0) + int(credited or 0), int(notes or 0)


async def _bill_settled(db: AsyncSession, bill_id: int) -> int:
    paid = await db.scalar(
        select(func.coalesce(func.sum(FinanceBillPayment.amount_paise), 0)).where(
            FinanceBillPayment.bill_id == bill_id
        )
    )
    return int(paid or 0)


async def _opening_out(db: AsyncSession, row: FinanceInvoice | FinanceBill) -> OpeningBalance:
    if isinstance(row, FinanceInvoice):
        settled, notes = await _invoice_settled(db, row.id)
        return OpeningBalance(
            key=f"customer-{row.id}",
            kind="customer",
            party=row.customer,
            as_of=row.invoice_date,
            due=row.due_date,
            amount_paise=row.total_paise,
            settled_paise=settled,
            credit_notes=notes,
        )
    return OpeningBalance(
        key=f"supplier-{row.id}",
        kind="supplier",
        party=row.vendor,
        as_of=row.bill_date,
        due=row.due_date,
        amount_paise=row.amount_paise,
        settled_paise=await _bill_settled(db, row.id),
        credit_notes=0,
    )


async def list_openings(db: AsyncSession, tenant_id: int) -> list[OpeningBalance]:
    """Every opening balance the company recorded, customers first, by name."""
    invoices = (
        await db.scalars(
            select(FinanceInvoice)
            .where(FinanceInvoice.tenant_id == tenant_id, FinanceInvoice.opening.is_(True))
            .order_by(FinanceInvoice.customer, FinanceInvoice.id)
        )
    ).all()
    bills = (
        await db.scalars(
            select(FinanceBill)
            .where(FinanceBill.tenant_id == tenant_id, FinanceBill.opening.is_(True))
            .order_by(FinanceBill.vendor, FinanceBill.id)
        )
    ).all()
    rows: list[FinanceInvoice | FinanceBill] = [*invoices, *bills]
    return [await _opening_out(db, row) for row in rows]


async def _opening_row(db: AsyncSession, tenant_id: int, key: str) -> FinanceInvoice | FinanceBill:
    kind, _, raw_id = key.partition("-")
    row: FinanceInvoice | FinanceBill | None = None
    if raw_id.isdigit() and kind == "customer":
        row = await db.scalar(
            select(FinanceInvoice)
            .where(
                FinanceInvoice.tenant_id == tenant_id,
                FinanceInvoice.id == int(raw_id),
                FinanceInvoice.opening.is_(True),
            )
            .with_for_update()
        )
    elif raw_id.isdigit() and kind == "supplier":
        row = await db.scalar(
            select(FinanceBill)
            .where(
                FinanceBill.tenant_id == tenant_id,
                FinanceBill.id == int(raw_id),
                FinanceBill.opening.is_(True),
            )
            .with_for_update()
        )
    if row is None:
        raise ApiError("opening_not_found", "That opening balance was not found.", 404)
    return row


async def change_opening(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    key: str,
    *,
    party: str,
    amount_paise: int,
    due: date,
    ip: str | None,
) -> OpeningBalance:
    """Corrects an opening balance's name, amount or due day. It cannot drop below what has
    already been paid or credited against it."""
    row = await _opening_row(db, tenant_id, key)
    current = await _opening_out(db, row)
    await ensure_open(db, tenant_id, current.as_of)
    name = party.strip()[:160]
    if len(name) < 2 or amount_paise <= 0:
        raise ApiError("invalid_opening", "Each balance needs a name and an amount.", 422)
    if amount_paise < current.settled_paise:
        raise ApiError(
            "opening_below_settled",
            f"{inr_exact(current.settled_paise)} has already been paid or credited against "
            "this balance, so it cannot be less than that.",
            409,
        )
    if due < current.as_of:
        raise ApiError("invalid_opening", "It cannot fall due before the opening day.", 422)
    new_key = _opening_key(current.as_of, name)
    model = type(row)
    if new_key != row.idempotency_key and await db.scalar(
        select(model.id).where(model.tenant_id == tenant_id, model.idempotency_key == new_key)
    ):
        raise ApiError(
            "opening_exists",
            f"{name} already has an opening balance for that day; change that one instead.",
            409,
        )
    row.idempotency_key = new_key
    row.due_date = due
    if isinstance(row, FinanceInvoice):
        row.customer = row.customer_company = name
        row.taxable_paise = row.total_paise = amount_paise
    else:
        row.vendor = name
        row.amount_paise = amount_paise
    await db.flush()
    audit.record(
        db,
        "finance.opening_balance_changed",
        user_id=user_id,
        tenant_id=tenant_id,
        ip=ip,
        details={
            "number": row.number,
            "from_party": current.party,
            "from_paise": current.amount_paise,
            "from_due": str(current.due),
            "to_party": name,
            "to_paise": amount_paise,
            "to_due": str(due),
        },
    )
    return await _opening_out(db, row)


async def remove_opening(
    db: AsyncSession, tenant_id: int, user_id: int, key: str, *, ip: str | None
) -> None:
    """Removes an opening balance recorded by mistake. One that has been paid or has a credit
    note stays: it is part of the books, and is settled instead."""
    row = await _opening_row(db, tenant_id, key)
    current = await _opening_out(db, row)
    await ensure_open(db, tenant_id, current.as_of)
    if current.settled_paise or current.credit_notes:
        raise ApiError(
            "opening_in_use",
            "Payments or credit notes are recorded against this balance, so it stays in the "
            "books. Change its amount instead.",
            409,
        )
    await db.delete(row)
    await db.flush()
    audit.record(
        db,
        "finance.opening_balance_removed",
        user_id=user_id,
        tenant_id=tenant_id,
        ip=ip,
        details={"number": row.number, "party": current.party, "paise": current.amount_paise},
    )


async def budget_left(db: AsyncSession, tenant_id: int, budget_line_key: str) -> int | None:
    """Paise still undrawn on a budget line, or None when the company has no such line."""
    line = await db.scalar(
        select(FinanceBudgetLine).where(
            FinanceBudgetLine.tenant_id == tenant_id,
            FinanceBudgetLine.external_key == budget_line_key,
        )
    )
    return None if line is None else line.allocated_paise - line.drawn_paise
