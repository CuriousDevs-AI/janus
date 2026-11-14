"""What CRM tells other modules about one company: its leads and deals, counted.

Other modules read CRM through these functions, never its tables. Each runs under the company's
own context (the caller sets it), so row-level security applies.
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import Date, cast, func, select, text
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


# Stages a lead has passed once it stands at each one; a lead's stage follows its deal's.
QUALIFIED_ON = ("qualified", "demo", "proposal", "negotiation", "approval", "won")
PROPOSAL_ON = ("proposal", "negotiation", "approval", "won")


@dataclass(frozen=True)
class Funnel:
    """Leads that came in between two days, by how far each has gone since."""

    leads: int
    qualified: int
    proposal: int
    won: int
    lost: int


async def funnel(db: AsyncSession, tenant_id: int, start: date, end: date) -> Funnel:
    """How far the leads that came in between two days, both included, have got by now."""
    rows = (
        await db.execute(
            select(Lead.stage, func.count(Lead.id))
            .where(Lead.tenant_id == tenant_id, _ist_day(Lead.created_at).between(start, end))
            .group_by(Lead.stage)
        )
    ).all()
    stages = {str(stage): int(count) for stage, count in rows}
    return Funnel(
        leads=sum(stages.values()),
        qualified=sum(stages.get(stage, 0) for stage in QUALIFIED_ON),
        proposal=sum(stages.get(stage, 0) for stage in PROPOSAL_ON),
        won=stages.get("won", 0),
        lost=stages.get("lost", 0),
    )


@dataclass(frozen=True)
class Rep:
    """One person's leads: those that came in between two days, and the deals they won then."""

    owner_id: int | None
    name: str
    leads: int
    won: int
    won_value: Decimal
    open_leads: int


async def reps(db: AsyncSession, tenant_id: int, start: date, end: date) -> list[Rep]:
    """Each lead owner's new leads and won deals between two days, and open leads now.

    Leads nobody owns are one line with owner_id None, so unassigned work shows too.
    """
    came_in = (
        select(Lead.owner_id, func.count(Lead.id))
        .where(Lead.tenant_id == tenant_id, _ist_day(Lead.created_at).between(start, end))
        .group_by(Lead.owner_id)
    )
    open_now = (
        select(Lead.owner_id, func.count(Lead.id))
        .where(Lead.tenant_id == tenant_id, Lead.stage.not_in(("won", "lost")))
        .group_by(Lead.owner_id)
    )
    # Deals keep no date of winning; their last change stands in, as in activity().
    won = (
        select(Lead.owner_id, func.count(Deal.id), func.coalesce(func.sum(Deal.amount), 0))
        .join(Lead, (Lead.id == Deal.lead_id) & (Lead.tenant_id == Deal.tenant_id))
        .where(
            Deal.tenant_id == tenant_id,
            Deal.stage == "won",
            _ist_day(Deal.updated_at).between(start, end),
        )
        .group_by(Lead.owner_id)
    )
    leads = {owner: int(count) for owner, count in (await db.execute(came_in)).all()}
    still_open = {owner: int(count) for owner, count in (await db.execute(open_now)).all()}
    wins = {
        owner: (int(count), Decimal(value)) for owner, count, value in (await db.execute(won)).all()
    }
    owners = leads.keys() | still_open.keys() | wins.keys()
    named = [owner for owner in owners if owner is not None]
    # Through app_member_names(): the worker, which also builds this report, cannot read users.
    names = (
        {
            int(row.id): str(row.name)
            for row in await db.execute(text("SELECT id, name FROM app_member_names()"))
        }
        if named
        else {}
    )
    out = [
        Rep(
            owner_id=owner,
            name=names.get(owner, "A former member") if owner is not None else "Nobody yet",
            leads=leads.get(owner, 0),
            won=wins.get(owner, (0, Decimal(0)))[0],
            won_value=wins.get(owner, (0, Decimal(0)))[1],
            open_leads=still_open.get(owner, 0),
        )
        for owner in owners
    ]
    return sorted(out, key=lambda rep: (rep.owner_id is None, -rep.won_value, -rep.leads, rep.name))
