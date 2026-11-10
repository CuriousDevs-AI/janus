"""Red alerts: an email to a person when one of their companies turns red, as soon as the worker
sees it, not only in Monday's email.

The worker checks each person who has alerts on about once an hour, with the same summary and the
same thresholds as their Portfolio page, read company by company under each company's own context.
It remembers which companies were red, so a company that stays red is told once; one that turns
green and red again is told again. The first check only takes note, so turning alerts on does not
send a burst of old news.
"""

from datetime import timedelta

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from janus_api.audit.service import record
from janus_api.core import email
from janus_api.core.config import get_settings
from janus_api.core.errors import ApiError
from janus_api.core.security import now
from janus_api.core.tenancy import set_context
from janus_api.portfolio import schemas
from janus_api.portfolio.models import PortfolioAlert
from janus_api.portfolio.summary import summary

EVERY = timedelta(hours=1)


async def _row(db: AsyncSession, user_id: int) -> PortfolioAlert | None:
    row: PortfolioAlert | None = await db.scalar(
        select(PortfolioAlert).where(PortfolioAlert.user_id == user_id)
    )
    return row


async def get_setting(db: AsyncSession, user_id: int) -> bool:
    row = await _row(db, user_id)
    return bool(row and row.enabled)


async def set_setting(db: AsyncSession, user_id: int, enabled: bool, ip: str | None) -> bool:
    row = await _row(db, user_id)
    if row is None:
        row = PortfolioAlert(user_id=user_id, enabled=enabled, next_check_at=now(), red=[])
        db.add(row)
    else:
        row.enabled = enabled
        if enabled:
            # Start afresh: what is red now is noted, not sent.
            row.checked_at, row.red, row.next_check_at = None, [], now()
    record(
        db,
        "portfolio.alerts_turned_on" if enabled else "portfolio.alerts_turned_off",
        user_id=user_id,
        ip=ip,
    )
    await db.flush()
    return enabled


def message(name: str, turned: list[schemas.CompanySummary]) -> tuple[str, str]:
    frontend = get_settings().frontend_url.rstrip("/")
    names = ", ".join(company.name for company in turned)
    lines = [f"Hello {name},", ""]
    for company in turned:
        reasons = company.health.reasons if company.health else []
        lines += [f"{company.name} needs you now:", *[f"  - {reason}" for reason in reasons], ""]
    lines += [
        f"Open the Portfolio: {frontend}/portfolio?view=overview",
        "You get this email when a company turns red. Turn it off on the Portfolio's"
        " Notifications page.",
    ]
    return f"{names} turned red", "\n".join(lines)


async def run_once(factory: async_sessionmaker[AsyncSession]) -> bool:
    """Checks one person whose check is due. The claimed row stays locked until it is updated."""
    async with factory() as db, db.begin():
        claim = (await db.execute(text("SELECT * FROM public.claim_portfolio_alert()"))).first()
        if claim is None:
            return False
        await set_context(db, user_id=claim.user_id)
        row = await _row(db, claim.user_id)
        if row is None:
            raise RuntimeError("Claimed alert is missing")
        view = await summary(db, claim.user_id, None, None, "month")
        red = [c for c in view.companies if c.health and c.health.status == "red"]
        turned = [c for c in red if c.id not in row.red]
        first = row.checked_at is None
        row.next_check_at = now() + EVERY
        if turned and not first:
            subject, body = message(claim.name, turned)
            try:
                await email.get_sender().send(claim.email, subject, body)
            except ApiError:
                # Mail is down: try again in ten minutes, and tell the same news then.
                row.next_check_at = now() + timedelta(minutes=10)
                return True
            row.last_sent_at = now()
            record(
                db,
                "portfolio.alert_sent",
                user_id=claim.user_id,
                details={"companies": len(turned)},
            )
        row.red = [c.id for c in red]
        row.checked_at = now()
        return True
