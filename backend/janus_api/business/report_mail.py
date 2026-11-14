"""Sending scheduled Business Reports: each recipient gets the report as their own role sees it.

Kept apart from the API routes so the worker can load it without the web app's sign-in code.
"""

import logging
from datetime import date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from janus_api.business.models import ReportSchedule
from janus_api.business.report_figures import NAMES, Figures, figures
from janus_api.core import email
from janus_api.core.config import get_settings
from janus_api.core.errors import ApiError
from janus_api.core.security import now
from janus_api.core.tenancy import set_context
from janus_api.portfolio import schemas as portfolio
from janus_api.portfolio.summary import summary

IST = ZoneInfo("Asia/Kolkata")
SEND_TIME = time(9, 0)
PERIOD_WORDS = {"month": "this month", "quarter": "this quarter", "fy": "this financial year"}


def next_due(frequency: str, after: datetime) -> datetime:
    """The next 9 in the morning in India strictly after `after`: tomorrow's, next Monday's or
    the 1st of next month's."""
    local = after.astimezone(IST)
    day = local.date()
    if frequency == "daily":
        candidate = day
    elif frequency == "weekly":
        candidate = day + timedelta(days=(0 - local.weekday()) % 7)
    else:
        candidate = date(day.year, day.month, 1)
    due = datetime.combine(candidate, SEND_TIME, IST)
    while due <= local:
        if frequency == "daily":
            candidate += timedelta(days=1)
        elif frequency == "weekly":
            candidate += timedelta(days=7)
        else:
            candidate = date(candidate.year + candidate.month // 12, candidate.month % 12 + 1, 1)
        due = datetime.combine(candidate, SEND_TIME, IST)
    return due


async def current(
    db: AsyncSession, user_id: int, tenant_id: int, period: str
) -> tuple[portfolio.CompanySummary, portfolio.Period] | None:
    """The business as this person's role sees it, or None where it cannot read the records."""
    # Imported here: loading it first, as the worker would, trips a circular import in sign-in.
    from janus_api.portfolio.access import readable_companies

    if tenant_id not in await readable_companies(db, user_id):
        return None
    view = await summary(db, user_id, tenant_id, None, period)
    await set_context(db, user_id=user_id, tenant_id=tenant_id)
    company = next((item for item in view.companies if item.id == str(tenant_id)), None)
    return (company, view.period) if company else None


def message(
    name: str, company: str, report: str, period: str, found: Figures | None
) -> tuple[str, str]:
    """The email: the report's figures as plain lines, and the link to the page."""
    title = NAMES[report]
    frontend = get_settings().frontend_url.rstrip("/")
    link = f"{frontend}/analytics?workspace=business&tab=library&report={report}&period={period}"
    lines = [f"Hello {name},", ""]
    assert found is not None
    if found.covers == "period":
        lines.append(
            f"{title} for {company}, {PERIOD_WORDS[period]}, against the same days before:"
        )
    elif found.covers == "month":
        lines.append(f"{title} for {company}, this month so far:")
    else:
        lines.append(f"{title} for {company}, as things stand this morning:")
    lines.append("")
    for row in found.rows:
        detail = f" (before: {row.before})" if row.before is not None else ""
        moved = f" · {row.change}" if row.change else ""
        flag = "  ← needs a look" if row.warn else ""
        lines.append(f"  {row.label}: {row.value}{detail}{moved}{flag}")
    if found.note:
        lines += ["", found.note]
    lines += [
        "",
        f"Open the report: {link}",
        "You get this because someone in your business scheduled it for you. Ask them, or an"
        " admin, to take you off it in Business Reports, Scheduled.",
    ]
    return f"{title} · {company}", "\n".join(lines)


async def deliver(db: AsyncSession, row: ReportSchedule, recipients: list[dict[str, Any]]) -> None:
    """Emails each recipient the report as their own role sees it, and records what happened."""
    problems: list[str] = []
    sent = 0
    for person in recipients:
        seen = await current(db, int(person["id"]), row.tenant_id, row.period)
        company = seen[0] if seen else None
        found = figures(row.report, company) if company else None
        if company is None or found is None:
            problems.append(f"{person['name']}: their role does not include these figures")
            continue
        subject, body = message(person["name"], company.name, row.report, row.period, found)
        try:
            await email.get_sender().send(person["email"], subject, body)
        except ApiError:
            problems.append(f"{person['name']}: the email could not be sent")
            continue
        sent += 1
    left = len(row.recipients) - len(recipients)
    if left:
        problems.append(f"{left} no longer in the business")
    await set_context(db, tenant_id=row.tenant_id)
    if sent:
        row.last_sent_at = now()
    row.last_problem = ("Not sent to " + "; ".join(problems) + ".")[:500] if problems else None
    if not sent and not problems:
        row.last_problem = "Nobody on it is still in the business."


async def run_once(factory: async_sessionmaker[AsyncSession]) -> bool:
    """Sends one due schedule. The claimed row stays locked until it is rescheduled."""
    async with factory() as db, db.begin():
        claim = (await db.execute(text("SELECT * FROM public.claim_report_schedule()"))).first()
        if claim is None:
            return False
        await set_context(db, tenant_id=claim.tenant_id)
        row = await db.get(ReportSchedule, claim.id)
        if row is None:
            raise RuntimeError("Claimed report schedule is missing")
        # Rescheduled whether or not it reached everyone, so a failure is not retried every second.
        row.next_due_at = next_due(row.frequency, now())
        await db.flush()
        try:
            # In a savepoint, so a failure while reading leaves the new due time in place.
            async with db.begin_nested():
                await deliver(db, row, list(claim.recipients))
        except Exception as error:
            await set_context(db, tenant_id=claim.tenant_id)
            row.last_problem = "Janus could not read the report when it was due."
            logging.getLogger("janus").error(
                '{"event": "report_schedule_failed", "exception_type": "%s"}',
                type(error).__name__,
            )
        return True
