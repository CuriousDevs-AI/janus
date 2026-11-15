# ruff: noqa: E501  (error messages read better unbroken)
"""Finance records that used to live only in one browser: expenses and petty cash, bank movements
not in the books, bank statement lines and their reconciliation, opening cash and share capital,
month-end sign-offs and quarterly budget plans.

Amounts arrive and leave in rupees, as the Finance pages work in them, and are kept in paise. Every
change is refused inside a locked period, as invoices and bills are, and recorded in the audit log.
Every endpoint needs billing:manage.
"""

from datetime import date
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from janus_api.audit import service as audit
from janus_api.auth.service import Actor
from janus_api.core.deps import Db, request_ip, require
from janus_api.core.errors import ApiError
from janus_api.finance import service
from janus_api.finance.models import (
    FinanceBankLine,
    FinanceBankMovement,
    FinanceBillPayment,
    FinanceBudgetPlan,
    FinanceCloseReview,
    FinanceExpense,
    FinancePayment,
    FinancePettyCashTopUp,
    FinanceSettings,
)
from janus_api.rules.service import ensure_open

router = APIRouter(prefix="/v1/finance", tags=["Finance"])
Billing = Annotated[Actor, Depends(require("billing:manage"))]
CATEGORIES = ("Travel", "Office", "Utilities", "Repairs", "Other")
Rupees = Annotated[float, Field(gt=0, le=10**12)]


def _paise(rupees: float) -> int:
    return int((Decimal(str(rupees)) * 100).to_integral_value())


def _rupees(paise: int) -> float:
    return paise / 100


class ExpenseOut(BaseModel):
    id: str
    date: date
    category: str
    payee: str
    amount: float
    gstRate: int
    paidFrom: Literal["bank", "petty cash"]
    by: str


class TopUpOut(BaseModel):
    id: str
    date: date
    amount: float
    by: str


class MovementOut(BaseModel):
    id: str
    date: date
    description: str
    amount: float


class BankLineOut(BaseModel):
    id: str
    date: date
    description: str
    amount: float
    matchedKey: str | None


class PlanOut(BaseModel):
    lineId: str
    fiscalYear: str
    quarter: int
    planned: float


class BooksOut(BaseModel):
    expenses: list[ExpenseOut]
    pettyCashTopUps: list[TopUpOut]
    bankEntries: list[MovementOut]
    bankLines: list[BankLineOut]
    openingCash: float
    shareCapital: float
    closeReviews: list[str]
    plans: list[PlanOut]


async def _names(db: Db, ids: set[int]) -> dict[int, str]:
    from janus_api.auth.service import user_directory

    people = await user_directory(db, sorted(ids))
    return {key: value.name for key, value in people.items()}


@router.get("/books", response_model=BooksOut)
async def read_books(actor: Billing, db: Db) -> BooksOut:
    tenant = actor.session.tenant_id
    expenses = (
        await db.scalars(
            select(FinanceExpense)
            .where(FinanceExpense.tenant_id == tenant)
            .order_by(FinanceExpense.spent_on.desc(), FinanceExpense.id.desc())
        )
    ).all()
    top_ups = (
        await db.scalars(
            select(FinancePettyCashTopUp)
            .where(FinancePettyCashTopUp.tenant_id == tenant)
            .order_by(FinancePettyCashTopUp.topped_on.desc())
        )
    ).all()
    movements = (
        await db.scalars(
            select(FinanceBankMovement)
            .where(FinanceBankMovement.tenant_id == tenant)
            .order_by(FinanceBankMovement.moved_on.desc())
        )
    ).all()
    lines = (
        await db.scalars(
            select(FinanceBankLine)
            .where(FinanceBankLine.tenant_id == tenant)
            .order_by(FinanceBankLine.line_date.desc(), FinanceBankLine.position)
        )
    ).all()
    settings = await db.scalar(select(FinanceSettings).where(FinanceSettings.tenant_id == tenant))
    reviews = (
        await db.scalars(select(FinanceCloseReview).where(FinanceCloseReview.tenant_id == tenant))
    ).all()
    plans = (
        await db.scalars(select(FinanceBudgetPlan).where(FinanceBudgetPlan.tenant_id == tenant))
    ).all()
    names = await _names(
        db, {row.created_by for row in expenses} | {row.created_by for row in top_ups}
    )
    return BooksOut(
        expenses=[
            ExpenseOut(
                id=str(row.id),
                date=row.spent_on,
                category=row.category,
                payee=row.payee,
                amount=_rupees(row.amount_paise),
                gstRate=row.gst_rate,
                paidFrom=row.paid_from,
                by=names.get(row.created_by, "A former member"),
            )
            for row in expenses
        ],
        pettyCashTopUps=[
            TopUpOut(
                id=str(row.id),
                date=row.topped_on,
                amount=_rupees(row.amount_paise),
                by=names.get(row.created_by, "A former member"),
            )
            for row in top_ups
        ],
        bankEntries=[
            MovementOut(
                id=str(row.id),
                date=row.moved_on,
                description=row.description,
                amount=_rupees(row.amount_paise),
            )
            for row in movements
        ],
        bankLines=[
            BankLineOut(
                id=str(row.id),
                date=row.line_date,
                description=row.description,
                amount=_rupees(row.amount_paise),
                matchedKey=row.matched_key,
            )
            for row in lines
        ],
        openingCash=_rupees(settings.opening_cash_paise) if settings else 0,
        shareCapital=_rupees(settings.share_capital_paise) if settings else 0,
        closeReviews=[f"{row.month}:{row.item}" for row in reviews],
        plans=[
            PlanOut(
                lineId=row.line_key,
                fiscalYear=row.fiscal_year,
                quarter=row.quarter,
                planned=_rupees(row.planned_paise),
            )
            for row in plans
        ],
    )


class ExpenseIn(BaseModel):
    date: date
    category: str = Field(min_length=1, max_length=40)
    payee: str = Field(min_length=2, max_length=160)
    amount: Rupees
    gstRate: int = Field(ge=0, le=28)
    paidFrom: Literal["bank", "petty cash"]


async def _petty_cash(db: Db, tenant: int) -> int:
    added = await db.scalar(
        select(func.coalesce(func.sum(FinancePettyCashTopUp.amount_paise), 0)).where(
            FinancePettyCashTopUp.tenant_id == tenant
        )
    )
    spent = await db.scalar(
        select(func.coalesce(func.sum(FinanceExpense.amount_paise), 0)).where(
            FinanceExpense.tenant_id == tenant, FinanceExpense.paid_from == "petty cash"
        )
    )
    return int(added or 0) - int(spent or 0)


@router.post("/expenses", response_model=ExpenseOut, status_code=201)
async def add_expense(data: ExpenseIn, actor: Billing, db: Db, request: Request) -> ExpenseOut:
    tenant = actor.session.tenant_id
    if data.category not in CATEGORIES:
        raise ApiError("invalid_category", f"Choose one of: {', '.join(CATEGORIES)}.", 422)
    await ensure_open(db, tenant, data.date)
    amount = _paise(data.amount)
    if data.paidFrom == "petty cash":
        balance = await _petty_cash(db, tenant)
        if amount > balance:
            raise ApiError(
                "petty_cash_short",
                f"Petty cash has ₹{_rupees(balance):,.2f}. Top it up before paying ₹{data.amount:,.2f} from it.",
                422,
            )
    row = FinanceExpense(
        tenant_id=tenant,
        spent_on=data.date,
        category=data.category,
        payee=data.payee.strip(),
        amount_paise=amount,
        gst_rate=data.gstRate,
        paid_from=data.paidFrom,
        created_by=actor.user.id,
    )
    db.add(row)
    await db.flush()
    audit.record(
        db,
        "finance.expense_recorded",
        tenant_id=tenant,
        user_id=actor.user.id,
        ip=request_ip(request),
        details={"expense_id": row.id, "amount_paise": amount},
    )
    return ExpenseOut(
        id=str(row.id),
        date=row.spent_on,
        category=row.category,
        payee=row.payee,
        amount=data.amount,
        gstRate=row.gst_rate,
        paidFrom=data.paidFrom,
        by=actor.user.name,
    )


class DatedAmount(BaseModel):
    date: date
    amount: Rupees


@router.post("/petty-cash", response_model=TopUpOut, status_code=201)
async def top_up(data: DatedAmount, actor: Billing, db: Db, request: Request) -> TopUpOut:
    tenant = actor.session.tenant_id
    await ensure_open(db, tenant, data.date)
    row = FinancePettyCashTopUp(
        tenant_id=tenant,
        topped_on=data.date,
        amount_paise=_paise(data.amount),
        created_by=actor.user.id,
    )
    db.add(row)
    await db.flush()
    audit.record(
        db,
        "finance.petty_cash_topped_up",
        tenant_id=tenant,
        user_id=actor.user.id,
        ip=request_ip(request),
        details={"amount_paise": row.amount_paise},
    )
    return TopUpOut(id=str(row.id), date=row.topped_on, amount=data.amount, by=actor.user.name)


class MovementIn(BaseModel):
    date: date
    description: str = Field(min_length=2, max_length=200)
    amount: Annotated[float, Field(ge=-(10**12), le=10**12)]


@router.post("/bank-movements", response_model=MovementOut, status_code=201)
async def add_movement(data: MovementIn, actor: Billing, db: Db, request: Request) -> MovementOut:
    tenant = actor.session.tenant_id
    if data.amount == 0:
        raise ApiError("invalid_amount", "Enter an amount: + for money in, - for money out.", 422)
    await ensure_open(db, tenant, data.date)
    row = FinanceBankMovement(
        tenant_id=tenant,
        moved_on=data.date,
        description=data.description.strip(),
        amount_paise=_paise(data.amount),
        created_by=actor.user.id,
    )
    db.add(row)
    await db.flush()
    audit.record(
        db,
        "finance.bank_movement_recorded",
        tenant_id=tenant,
        user_id=actor.user.id,
        ip=request_ip(request),
        details={"amount_paise": row.amount_paise},
    )
    return MovementOut(
        id=str(row.id), date=row.moved_on, description=row.description, amount=data.amount
    )


class StatementIn(BaseModel):
    text: str = Field(min_length=1, max_length=500_000)


class StatementOut(BaseModel):
    imported: int
    skipped: int
    errors: list[str]


@router.post("/bank-lines/import", response_model=StatementOut)
async def import_statement(
    data: StatementIn, actor: Billing, db: Db, request: Request
) -> StatementOut:
    """Lines as "date,description,amount", + for money in and - for money out. A line already
    imported, here or from the Portfolio, is skipped."""
    errors: list[str] = []
    rows: list[service.BankRow] = []
    for index, raw in enumerate(line.strip() for line in data.text.splitlines()):
        if not raw:
            continue
        day, _, rest = raw.partition(",")
        description, _, amount = rest.rpartition(",")
        try:
            when = date.fromisoformat(day.strip())
        except ValueError:
            errors.append(f"Line {index + 1}: the date must be YYYY-MM-DD.")
            continue
        if len(description.strip()) < 2:
            errors.append(f"Line {index + 1}: add a description.")
            continue
        try:
            value = Decimal(amount.strip())
        except ArithmeticError:
            value = Decimal(0)
        if value == 0:
            errors.append(
                f"Line {index + 1}: the amount must be a number, + for money in and - for money out."
            )
            continue
        rows.append(
            service.BankRow(
                day=when,
                description=description.strip()[:300],
                amount_paise=int(value * 100),
                balance_paise=None,
            )
        )
    if not rows:
        return StatementOut(imported=0, skipped=0, errors=errors or ["Paste at least one line."])
    added, skipped = await service.import_bank_lines(
        db, actor.session.tenant_id, actor.user.id, "Bank account", rows, request_ip(request)
    )
    return StatementOut(imported=added, skipped=skipped, errors=errors)


class MatchIn(BaseModel):
    key: str | None = Field(default=None, max_length=120)


@router.put("/bank-lines/{line_id}/match", response_model=BankLineOut)
async def match_line(
    line_id: int, data: MatchIn, actor: Billing, db: Db, request: Request
) -> BankLineOut:
    tenant = actor.session.tenant_id
    line = await db.scalar(
        select(FinanceBankLine)
        .where(FinanceBankLine.tenant_id == tenant, FinanceBankLine.id == line_id)
        .with_for_update()
    )
    if line is None:
        raise ApiError("not_found", "Bank line not found.", 404)
    if data.key is not None:
        taken = await db.scalar(
            select(FinanceBankLine.id).where(
                FinanceBankLine.tenant_id == tenant,
                FinanceBankLine.matched_key == data.key,
                FinanceBankLine.id != line.id,
            )
        )
        if taken:
            raise ApiError(
                "already_matched", "That payment is already matched to another bank line.", 409
            )
        kind, _, rest = data.key.partition(":")
        record_id, _, payment_id = rest.partition(":")
        if not (record_id.isdigit() and payment_id.isdigit()):
            raise ApiError("invalid_match", "Choose a payment to match.", 422)
        if kind == "inv":
            paid = await db.scalar(
                select(FinancePayment.amount_paise).where(
                    FinancePayment.tenant_id == tenant,
                    FinancePayment.id == int(payment_id),
                    FinancePayment.invoice_id == int(record_id),
                )
            )
            if paid is None:
                raise ApiError("not_found", "Payment not found.", 404)
            if line.amount_paise <= 0:
                raise ApiError(
                    "wrong_direction", "A money-out line cannot match a customer payment.", 422
                )
            if line.amount_paise != paid:
                raise ApiError(
                    "amount_differs",
                    f"Amounts differ: the bank line is ₹{_rupees(line.amount_paise):,.2f} and the payment is ₹{_rupees(paid):,.2f}.",
                    422,
                )
        elif kind == "bill":
            paid = await db.scalar(
                select(FinanceBillPayment.amount_paise).where(
                    FinanceBillPayment.tenant_id == tenant,
                    FinanceBillPayment.id == int(payment_id),
                    FinanceBillPayment.bill_id == int(record_id),
                )
            )
            if paid is None:
                raise ApiError("not_found", "Payment not found.", 404)
            if line.amount_paise >= 0:
                raise ApiError(
                    "wrong_direction", "A money-in line cannot match a bill payment.", 422
                )
            if -line.amount_paise != paid:
                raise ApiError(
                    "amount_differs",
                    f"Amounts differ: the bank line is ₹{_rupees(-line.amount_paise):,.2f} and the payment is ₹{_rupees(paid):,.2f}.",
                    422,
                )
        else:
            raise ApiError("invalid_match", "Choose a payment to match.", 422)
    line.matched_key = data.key
    audit.record(
        db,
        "finance.bank_line_matched",
        tenant_id=tenant,
        user_id=actor.user.id,
        ip=request_ip(request),
        details={"line_id": line.id, "key": data.key or ""},
    )
    return BankLineOut(
        id=str(line.id),
        date=line.line_date,
        description=line.description,
        amount=_rupees(line.amount_paise),
        matchedKey=line.matched_key,
    )


class SettingsIn(BaseModel):
    openingCash: Annotated[float, Field(ge=0, le=10**12)] | None = None
    shareCapital: Annotated[float, Field(ge=0, le=10**12)] | None = None


@router.put("/settings", response_model=BooksOut)
async def save_settings(data: SettingsIn, actor: Billing, db: Db, request: Request) -> BooksOut:
    tenant = actor.session.tenant_id
    row = await db.scalar(
        select(FinanceSettings).where(FinanceSettings.tenant_id == tenant).with_for_update()
    )
    if row is None:
        row = FinanceSettings(tenant_id=tenant, opening_cash_paise=0, share_capital_paise=0)
        db.add(row)
    if data.openingCash is not None:
        row.opening_cash_paise = _paise(data.openingCash)
    if data.shareCapital is not None:
        row.share_capital_paise = _paise(data.shareCapital)
    await db.flush()
    audit.record(
        db,
        "finance.settings_saved",
        tenant_id=tenant,
        user_id=actor.user.id,
        ip=request_ip(request),
        details={
            "opening_cash_paise": row.opening_cash_paise,
            "share_capital_paise": row.share_capital_paise,
        },
    )
    return await read_books(actor, db)


class ReviewIn(BaseModel):
    month: str = Field(pattern=r"^\d{4}-\d{2}$")
    item: str = Field(min_length=1, max_length=40)


@router.post("/close-reviews", status_code=204)
async def review(data: ReviewIn, actor: Billing, db: Db, request: Request) -> None:
    tenant = actor.session.tenant_id
    known = await db.scalar(
        select(FinanceCloseReview.id).where(
            FinanceCloseReview.tenant_id == tenant,
            FinanceCloseReview.month == data.month,
            FinanceCloseReview.item == data.item,
        )
    )
    if known is None:
        db.add(
            FinanceCloseReview(
                tenant_id=tenant, month=data.month, item=data.item, reviewed_by=actor.user.id
            )
        )
        audit.record(
            db,
            "finance.close_reviewed",
            tenant_id=tenant,
            user_id=actor.user.id,
            ip=request_ip(request),
            details={"month": data.month, "item": data.item},
        )


class PlanIn(BaseModel):
    lineId: str = Field(min_length=1, max_length=80)
    fiscalYear: str = Field(pattern=r"^\d{4}-\d{2}$")
    quarter: int = Field(ge=1, le=4)
    planned: Annotated[float, Field(ge=0, le=10**12)]


@router.put("/budget-plans", response_model=PlanOut)
async def save_plan(data: PlanIn, actor: Billing, db: Db, request: Request) -> PlanOut:
    tenant = actor.session.tenant_id
    row = await db.scalar(
        select(FinanceBudgetPlan)
        .where(
            FinanceBudgetPlan.tenant_id == tenant,
            FinanceBudgetPlan.line_key == data.lineId,
            FinanceBudgetPlan.fiscal_year == data.fiscalYear,
            FinanceBudgetPlan.quarter == data.quarter,
        )
        .with_for_update()
    )
    if row is None:
        row = FinanceBudgetPlan(
            tenant_id=tenant,
            line_key=data.lineId,
            fiscal_year=data.fiscalYear,
            quarter=data.quarter,
            planned_paise=0,
        )
        db.add(row)
    row.planned_paise = _paise(data.planned)
    await db.flush()
    audit.record(
        db,
        "finance.budget_planned",
        tenant_id=tenant,
        user_id=actor.user.id,
        ip=request_ip(request),
        details={"line": data.lineId, "quarter": data.quarter, "planned_paise": row.planned_paise},
    )
    return PlanOut(
        lineId=row.line_key,
        fiscalYear=row.fiscal_year,
        quarter=row.quarter,
        planned=_rupees(row.planned_paise),
    )
