"""What Customer Support tells other modules about one company: its open tickets.

Other modules read Support through these functions, never its tables. Each runs under the
company's own context (the caller sets it), so row-level security applies.
"""

from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.support.models import SupportTicket

CLOSED = ("resolved", "closed")


@dataclass(frozen=True)
class Tickets:
    open: int
    urgent: int
    escalated: int
    older_than_week: int


async def open_count(db: AsyncSession, tenant_id: int) -> int:
    """Tickets not yet resolved or closed."""
    count = await db.scalar(
        select(func.count(SupportTicket.id)).where(
            SupportTicket.tenant_id == tenant_id, SupportTicket.status.not_in(CLOSED)
        )
    )
    return int(count or 0)


async def tickets(db: AsyncSession, tenant_id: int, today: date) -> Tickets:
    """Open tickets, and how many of them are urgent, escalated or more than a week old."""
    open_ = and_(SupportTicket.tenant_id == tenant_id, SupportTicket.status.not_in(CLOSED))
    total = await db.scalar(select(func.count(SupportTicket.id)).where(open_))
    urgent = await db.scalar(
        select(func.count(SupportTicket.id)).where(
            open_, SupportTicket.priority.in_(("urgent", "high"))
        )
    )
    escalated = await db.scalar(
        select(func.count(SupportTicket.id)).where(open_, SupportTicket.status == "escalated")
    )
    old = await db.scalar(
        select(func.count(SupportTicket.id)).where(
            open_, SupportTicket.raised_on <= today - timedelta(days=7)
        )
    )
    return Tickets(
        open=int(total or 0),
        urgent=int(urgent or 0),
        escalated=int(escalated or 0),
        older_than_week=int(old or 0),
    )
