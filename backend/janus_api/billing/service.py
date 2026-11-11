"""Reading and changing the account's plan, and its invoices.

The plan and invoices are the person's own rows (row-level security on app.user_id). No payment
provider is connected, so outside production a plan changes at once with nothing charged, and in
production it cannot be changed here yet. Invoices can be made only as samples, for testing.
"""

from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.service import record
from janus_api.billing import schemas
from janus_api.billing.models import AccountInvoice, AccountPlan
from janus_api.billing.plans import BY_ID, GST_RATE, PLANS, Plan
from janus_api.core.config import get_settings
from janus_api.core.errors import ApiError
from janus_api.core.security import now
from janus_api.core.tenancy import set_context
from janus_api.org import overview as org


def _today() -> date:
    return datetime.now(ZoneInfo("Asia/Kolkata")).date()


def _rupees(paise: int) -> str:
    return str((Decimal(paise) / 100).quantize(Decimal("0.01")))


def _add_month(day: date) -> date:
    """The same day next month, or that month's last day where it is shorter."""
    year, month = (day.year + 1, 1) if day.month == 12 else (day.year, day.month + 1)
    following = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    return min(date(year, month, 1) + timedelta(days=day.day - 1), following - timedelta(days=1))


def _plan_out(plan: Plan) -> schemas.PlanOut:
    return schemas.PlanOut(
        id=plan.id,
        name=plan.name,
        tagline=plan.tagline,
        price=None if plan.price_paise is None else _rupees(plan.price_paise),
        companies=plan.companies,
        logins=plan.logins,
        features=list(plan.features),
    )


def _changes_allowed() -> bool:
    return get_settings().environment != "production"


async def _usage(
    db: AsyncSession, user_id: int, current_tenant: int | None, owned: list[int]
) -> schemas.Usage:
    logins = 0
    try:
        for tenant_id in owned:
            await set_context(db, user_id=user_id, tenant_id=tenant_id)
            logins += await org.active_member_count(db, tenant_id)
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
    return schemas.Usage(companies=len(owned), logins=logins)


async def _row(db: AsyncSession, user_id: int) -> AccountPlan | None:
    row: AccountPlan | None = await db.scalar(
        select(AccountPlan).where(AccountPlan.user_id == user_id)
    )
    return row


async def view(db: AsyncSession, user_id: int, current_tenant: int | None) -> schemas.BillingOut:
    owned = await org.owned_tenants(db, user_id)
    row = await _row(db, user_id)
    invoices = (
        await db.scalars(
            select(AccountInvoice)
            .where(AccountInvoice.user_id == user_id)
            .order_by(AccountInvoice.period_start.desc())
        )
    ).all()
    return schemas.BillingOut(
        owner=bool(owned),
        plan=row.plan if row else "free",
        startedOn=row.started_on.isoformat() if row else None,
        renewsOn=row.renews_on.isoformat() if row and row.renews_on else None,
        usage=await _usage(db, user_id, current_tenant, owned),
        gstRate=GST_RATE,
        plans=[_plan_out(plan) for plan in PLANS],
        invoices=[
            schemas.InvoiceOut(
                number=item.number,
                plan=BY_ID[item.plan].name if item.plan in BY_ID else item.plan,
                issuedOn=item.issued_on.isoformat(),
                periodStart=item.period_start.isoformat(),
                periodEnd=item.period_end.isoformat(),
                amount=_rupees(item.amount_paise),
                gst=_rupees(item.gst_paise),
                total=_rupees(item.total_paise),
                status=item.status,
                paidOn=item.paid_on.isoformat() if item.paid_on else None,
                sample=item.sample,
            )
            for item in invoices
        ],
        canChange=bool(owned) and _changes_allowed(),
    )


async def change_plan(
    db: AsyncSession, user_id: int, current_tenant: int | None, plan_id: str, ip: str
) -> schemas.BillingOut:
    """Moves the account to another plan from today. Enterprise is set up with the Janus team."""
    if not await org.owned_tenants(db, user_id):
        raise ApiError("forbidden", "The plan belongs to the Owner of the companies.", 403)
    if plan_id == "enterprise":
        raise ApiError(
            "contact_sales", "Enterprise is set up with the Janus team, on agreed terms.", 409
        )
    if not _changes_allowed():
        raise ApiError(
            "payments_not_connected",
            "Payments are not connected yet, so the plan cannot be changed here.",
            409,
        )
    row = await _row(db, user_id)
    before = row.plan if row else "free"
    today = _today()
    if row is None:
        row = AccountPlan(user_id=user_id, plan=plan_id, started_on=today)
        db.add(row)
    row.plan, row.started_on, row.updated_at = plan_id, today, now()
    row.renews_on = None if plan_id == "free" else _add_month(today)
    record(
        db,
        "billing.plan_changed",
        user_id=user_id,
        ip=ip,
        details={"from": before, "to": plan_id},
    )
    await db.flush()
    return await view(db, user_id, current_tenant)


async def add_sample_invoices(
    db: AsyncSession, user_id: int, current_tenant: int | None, months: int, ip: str
) -> schemas.BillingOut:
    """Monthly invoices for the current paid plan over the months before, marked as samples, for
    testing the billing page. Refused in production. A month already invoiced is left alone."""
    if not _changes_allowed():
        raise ApiError("not_found", "Not found.", 404)
    row = await _row(db, user_id)
    plan = BY_ID.get(row.plan) if row else None
    if plan is None or not plan.price_paise:
        raise ApiError("no_paid_plan", "Sample invoices need a paid plan first.", 409)
    taken = set(
        (
            await db.scalars(
                select(AccountInvoice.period_start).where(AccountInvoice.user_id == user_id)
            )
        ).all()
    )
    count = len(taken)
    today = _today()
    start = today.replace(day=1)
    for back in range(months - 1, -1, -1):
        index = start.year * 12 + start.month - 1 - back
        period_start = date(index // 12, index % 12 + 1, 1)
        if period_start in taken:
            continue
        period_end = _add_month(period_start) - timedelta(days=1)
        count += 1
        amount = plan.price_paise
        gst = amount * GST_RATE // 100
        newest = back == 0
        db.add(
            AccountInvoice(
                user_id=user_id,
                number=f"JNS-{period_start.year}-{count:04d}",
                plan=plan.id,
                issued_on=period_start,
                period_start=period_start,
                period_end=period_end,
                amount_paise=amount,
                gst_paise=gst,
                total_paise=amount + gst,
                status="due" if newest else "paid",
                paid_on=None if newest else period_start + timedelta(days=2),
                sample=True,
            )
        )
    record(db, "billing.sample_invoices", user_id=user_id, ip=ip, details={"months": months})
    await db.flush()
    return await view(db, user_id, current_tenant)
