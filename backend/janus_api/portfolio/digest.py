"""The weekly Portfolio digest: one email on Monday morning with each company's week.

A person turns it on or off for themselves. The worker sends it from the same summary the Portfolio
page shows, read company by company under each company's own context, so the email never says more
than the person could see on the page.
"""

from datetime import date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from janus_api.audit.service import record
from janus_api.core import email
from janus_api.core.config import get_settings
from janus_api.core.errors import ApiError
from janus_api.core.security import now
from janus_api.core.tenancy import set_context
from janus_api.portfolio import schemas
from janus_api.portfolio.models import PortfolioDigest
from janus_api.portfolio.service import member_tenants, summary, today_ist

IST = ZoneInfo("Asia/Kolkata")
# Monday, 9 in the morning in India.
SEND_DAY, SEND_TIME = 0, time(9, 0)


def next_due(after: datetime) -> datetime:
    """The first Monday 9:00 in India strictly after the given moment."""
    local = after.astimezone(IST)
    days = (SEND_DAY - local.weekday()) % 7
    due = datetime.combine(local.date() + timedelta(days=days), SEND_TIME, IST)
    return due if due > local else due + timedelta(days=7)


async def _row(db: AsyncSession, user_id: int) -> PortfolioDigest | None:
    row: PortfolioDigest | None = await db.scalar(
        select(PortfolioDigest).where(PortfolioDigest.user_id == user_id)
    )
    return row


async def get_setting(db: AsyncSession, user_id: int) -> schemas.DigestOut:
    row = await _row(db, user_id)
    eligible = bool(await member_tenants(db, user_id, "portfolio:read"))
    return schemas.DigestOut(
        enabled=bool(row and row.enabled and eligible),
        eligible=eligible,
        nextDueAt=row.next_due_at if row and row.enabled and eligible else None,
        lastSentAt=row.last_sent_at if row else None,
    )


async def set_setting(
    db: AsyncSession, user_id: int, tenant_id: int, enabled: bool, ip: str
) -> schemas.DigestOut:
    if enabled and not await member_tenants(db, user_id, "portfolio:read"):
        raise ApiError("forbidden", "The digest is for people who see a Portfolio.", 403)
    row = await _row(db, user_id)
    if row is None:
        row = PortfolioDigest(user_id=user_id, enabled=enabled, next_due_at=next_due(now()))
        db.add(row)
    else:
        row.enabled = enabled
        if enabled:
            row.next_due_at = next_due(now())
    record(
        db,
        "portfolio.digest_turned_on" if enabled else "portfolio.digest_turned_off",
        user_id=user_id,
        tenant_id=tenant_id,
        ip=ip,
    )
    await db.flush()
    return await get_setting(db, user_id)


def day(iso: str) -> str:
    """2026-10-26 as 26 Oct 2026."""
    value = date.fromisoformat(iso)
    return f"{value.day} {value:%b} {value.year}"


def inr(value: str | Decimal | None) -> str:
    """Rupees the way the Portfolio page writes them: ₹12,500, ₹4.2L, ₹1.3Cr."""
    amount = Decimal(value or 0)
    for size, unit in ((Decimal(10**7), "Cr"), (Decimal(10**5), "L")):
        if abs(amount) >= size:
            return f"₹{(amount / size).quantize(Decimal('0.1'), ROUND_HALF_UP).normalize():f}{unit}"
    whole = int(amount.quantize(Decimal(1), ROUND_HALF_UP))
    digits = str(abs(whole))
    head, tail = digits[:-3], digits[-3:]
    groups = [head[max(0, end - 2) : end] for end in range(len(head), 0, -2)][::-1]
    return f"₹{'-' if whole < 0 else ''}{','.join([*groups, tail]) if head else tail}"


async def build(
    db: AsyncSession, user_id: int, name: str, current_tenant: int | None, ip: str | None
) -> schemas.DigestPreview | None:
    """The email for the last full week, Monday to Sunday, or None when the person sees no company.

    Sent on Monday morning, the week is the seven days ending yesterday.
    """
    week = await summary(db, user_id, current_tenant, ip, "week", today_ist() - timedelta(days=1))
    if not week.companies:
        return None
    period = week.period
    lines = [
        f"Hello {name},",
        "",
        f"Here is the week across your companies, {day(period.start)} to {day(period.end)},"
        f" compared with {day(period.previousStart)} to {day(period.previousEnd)}.",
    ]
    for company in week.companies:
        current, before = company.period.current, company.period.previous
        lines += [
            "",
            company.name,
            f"  Leads in: {current.leads} ({before.leads} the week before)",
            f"  Deals won: {current.wonDeals}, worth {inr(current.wonValue)}"
            f" ({inr(before.wonValue)} the week before)",
            f"  Open pipeline: {inr(company.crm.pipelineValue)} in {company.crm.openDeals} deals",
            f"  Open support tickets: {company.openTickets}",
        ]
        if company.money is not None:
            money = company.money
            lines += [
                f"  Customers owe: {inr(money.receivable)}, of which {inr(money.overdue)} is"
                f" overdue on {money.overdueInvoices} invoice"
                f"{'' if money.overdueInvoices == 1 else 's'}",
                f"  Bills due in the next 7 days: {inr(money.payableDueThisWeek)}",
                f"  Collected: {inr(current.collected)} ({inr(before.collected)} the week before)",
            ]
    frontend = get_settings().frontend_url.rstrip("/")
    lines += [
        "",
        f"Open the Portfolio: {frontend}/portfolio?view=overview",
        "You get this email every Monday. Turn it off on the Portfolio's Overview.",
    ]
    subject = f"Your week across {len(week.companies)} compan" + (
        "y" if len(week.companies) == 1 else "ies"
    )
    return schemas.DigestPreview(subject=subject, body="\n".join(lines))


async def run_once(factory: async_sessionmaker[AsyncSession]) -> bool:
    """Sends one due digest. The claimed row stays locked until it is rescheduled."""
    async with factory() as db, db.begin():
        claim = (await db.execute(text("SELECT * FROM public.claim_portfolio_digest()"))).first()
        if claim is None:
            return False
        await set_context(db, user_id=claim.user_id)
        row = await _row(db, claim.user_id)
        if row is None:
            raise RuntimeError("Claimed digest is missing")
        message = await build(db, claim.user_id, claim.name, None, None)
        # Rescheduled whether or not there was anything to say, so an empty week is not retried.
        row.next_due_at = next_due(now())
        if message is not None:
            try:
                await email.get_sender().send(claim.email, message.subject, message.body)
            except ApiError:
                # Mail is down: try again in an hour rather than every second.
                row.next_due_at = now() + timedelta(hours=1)
                return True
            row.last_sent_at = now()
            record(db, "portfolio.digest_sent", user_id=claim.user_id)
        return True
