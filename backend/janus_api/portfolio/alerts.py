"""Red alerts: an email, and a notification on every browser the person allowed them on, when
one of their companies turns red, as soon as the worker sees it, not only in Monday's email.
Owners have them on unless they turn them off (`add_owner_defaults`).

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
from janus_api.push import service as push

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
        "Owners get this email when a company turns red. Turn it off on the Portfolio's"
        " Notifications page.",
    ]
    return f"{names} turned red", "\n".join(lines)


def notification(turned: list[schemas.CompanySummary]) -> dict[str, str]:
    """The browser notification: who turned red and the first reason, opening the Overview."""
    first = turned[0]
    reason = first.health.reasons[0] if first.health and first.health.reasons else ""
    more = f" and {len(turned) - 1} more" if len(turned) > 1 else ""
    return {
        "title": f"{first.name}{more} turned red",
        "body": reason or "Open the Portfolio to see why.",
        "url": "/portfolio?view=overview",
        "tag": "portfolio-red",
    }


async def add_owner_defaults(factory: async_sessionmaker[AsyncSession]) -> int:
    """Turns the weekly email and red alerts on for owners who have never chosen; returns how
    many settings were added."""
    async with factory() as db, db.begin():
        added = await db.scalar(text("SELECT public.add_owner_portfolio_defaults()"))
        return int(added or 0)


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
            browsers = await push.send_to_user(
                db, claim.user_id, [int(c.id) for c in view.companies], notification(turned)
            )
            await set_context(db, user_id=claim.user_id)
            record(
                db,
                "portfolio.alert_sent",
                user_id=claim.user_id,
                details={"companies": len(turned), "browsers": browsers},
            )
        row.red = [c.id for c in red]
        row.checked_at = now()
        return True
