"""What CRM tells other modules about one company: its leads and deals, counted.

Other modules read CRM through these functions, never its tables. Each runs under the company's
own context (the caller sets it), so row-level security applies.
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import Date, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.crm.models import Deal, Lead


@dataclass(frozen=True)
class Pipeline:
    leads: int
    open_deals: int
    won_deals: int
    lost_deals: int
    pipeline_value: Decimal
    won_value: Decimal


@dataclass(frozen=True)
class Activity:
    leads: int
    won_deals: int
    won_value: Decimal


def _ist_day(column: Any) -> Any:
    """The India date of a timestamp column."""
    return cast(func.timezone("Asia/Kolkata", column), Date)


async def pipeline(db: AsyncSession, tenant_id: int) -> Pipeline:
    """All leads, and deals by where they stand: open, won or lost."""
    rows = (
        await db.execute(
            select(Deal.stage, func.count(Deal.id), func.coalesce(func.sum(Deal.amount), 0))
            .where(Deal.tenant_id == tenant_id)
            .group_by(Deal.stage)
        )
    ).all()
    counts: dict[str, int] = {row[0]: int(row[1]) for row in rows}
    values: dict[str, Decimal] = {row[0]: Decimal(row[2]) for row in rows}
    open_stages = [stage for stage in counts if stage not in ("won", "lost")]
    leads = await db.scalar(select(func.count(Lead.id)).where(Lead.tenant_id == tenant_id))
    return Pipeline(
        leads=int(leads or 0),
        open_deals=sum(counts[stage] for stage in open_stages),
        won_deals=counts.get("won", 0),
        lost_deals=counts.get("lost", 0),
        pipeline_value=sum((values[stage] for stage in open_stages), Decimal(0)),
        won_value=values.get("won", Decimal("0.00")),
    )


async def activity(db: AsyncSession, tenant_id: int, start: date, end: date) -> Activity:
    """Leads that came in and deals won between two days, both included, in India time."""
    leads = await db.scalar(
        select(func.count(Lead.id)).where(
            Lead.tenant_id == tenant_id, _ist_day(Lead.created_at).between(start, end)
        )
    )
    # Deals keep no date of winning. A won deal is rarely edited again,
    # so its last change stands in.
    won_count, won_value = (
        await db.execute(
            select(func.count(Deal.id), func.coalesce(func.sum(Deal.amount), 0)).where(
                Deal.tenant_id == tenant_id,
                Deal.stage == "won",
                _ist_day(Deal.updated_at).between(start, end),
            )
        )
    ).one()
    return Activity(leads=int(leads or 0), won_deals=int(won_count), won_value=Decimal(won_value))


async def leads_by_source(
    db: AsyncSession, tenant_id: int, start: date, end: date
) -> dict[str, int]:
    """Leads that came in between two days, by the channel they came from."""
    rows = (
        await db.execute(
            select(Lead.source, func.count(Lead.id))
            .where(Lead.tenant_id == tenant_id, _ist_day(Lead.created_at).between(start, end))
            .group_by(Lead.source)
        )
    ).all()
    return {str(source): int(count) for source, count in rows}


@dataclass(frozen=True)
class Day:
    leads: int
    won_deals: int
    won_value: Decimal


async def daily(db: AsyncSession, tenant_id: int, start: date, end: date) -> dict[date, Day]:
    """Leads in and deals won on each day between two days, both included, in India time. Days with
    nothing are left out."""
    lead_day = _ist_day(Lead.created_at)
    leads: dict[date, int] = {
        day: int(count)
        for day, count in (
            await db.execute(
                select(lead_day, func.count(Lead.id))
                .where(Lead.tenant_id == tenant_id, lead_day.between(start, end))
                .group_by(lead_day)
            )
        ).all()
    }
    won_day = _ist_day(Deal.updated_at)
    won = {
        day: (int(count), Decimal(value))
        for day, count, value in (
            await db.execute(
                select(won_day, func.count(Deal.id), func.coalesce(func.sum(Deal.amount), 0))
                .where(
                    Deal.tenant_id == tenant_id, Deal.stage == "won", won_day.between(start, end)
                )
                .group_by(won_day)
            )
        ).all()
    }
    return {
        day: Day(
            leads=int(leads.get(day, 0)),
            won_deals=won.get(day, (0, Decimal(0)))[0],
            won_value=won.get(day, (0, Decimal(0)))[1],
        )
        for day in leads.keys() | won.keys()
    }


@dataclass
class QuietLead:
    id: int
    name: str
    company: str | None
    stage: str
    days: int


# A lead still open with no call, message or stage change for this many days has gone quiet.
QUIET_DAYS = 3


async def quiet_leads(
    db: AsyncSession, tenant_id: int, today: date, limit: int = 5
) -> tuple[int, list[QuietLead]]:
    """Open leads nobody has touched for QUIET_DAYS or more: how many, and the longest-waiting."""
    from datetime import UTC, datetime, time, timedelta

    from janus_api.crm.models import Contact

    cutoff = datetime.combine(today - timedelta(days=QUIET_DAYS), time.max, UTC)
    quiet = (
        Lead.tenant_id == tenant_id,
        Lead.stage.not_in(("won", "lost")),
        Lead.last_activity_at <= cutoff,
    )
    count = await db.scalar(select(func.count(Lead.id)).where(*quiet))
    rows = await db.execute(
        select(Lead.id, Contact.name, Contact.company, Lead.stage, Lead.last_activity_at)
        .join(Contact, (Contact.id == Lead.contact_id) & (Contact.tenant_id == Lead.tenant_id))
        .where(*quiet)
        .order_by(Lead.last_activity_at)
        .limit(limit)
    )
    return int(count or 0), [
        QuietLead(
            id=row.id,
            name=row.name or "Unnamed lead",
            company=row.company,
            stage=row.stage,
            days=(today - row.last_activity_at.date()).days,
        )
        for row in rows
    ]
