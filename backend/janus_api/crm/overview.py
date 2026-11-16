"""What CRM tells other modules about one company: its leads and deals, counted.

Other modules read CRM through these functions, never its tables. Each runs under the company's
own context (the caller sets it), so row-level security applies.
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import Date, cast, func, or_, select, text
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
        # Someone agreed to follow up on a later day: not quiet until that day has passed.
        or_(Lead.next_follow_up_on.is_(None), Lead.next_follow_up_on < today),
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


@dataclass
class DueFollowUp:
    id: int
    name: str
    on: date


async def follow_ups(
    db: AsyncSession, tenant_id: int, today: date, limit: int = 5
) -> tuple[int, int, list[DueFollowUp]]:
    """Open leads whose follow-up is today, and those whose day has passed: counts, and the
    earliest few."""
    from janus_api.crm.models import Contact

    due = (
        Lead.tenant_id == tenant_id,
        Lead.stage.not_in(("won", "lost")),
        Lead.next_follow_up_on.is_not(None),
        Lead.next_follow_up_on <= today,
    )
    rows = (
        await db.execute(
            select(Lead.next_follow_up_on, func.count(Lead.id))
            .where(*due)
            .group_by(Lead.next_follow_up_on)
        )
    ).all()
    today_count = sum(int(count) for day, count in rows if day == today)
    overdue = sum(int(count) for day, count in rows if day < today)
    earliest = await db.execute(
        select(Lead.id, Contact.name, Lead.next_follow_up_on)
        .join(Contact, (Contact.id == Lead.contact_id) & (Contact.tenant_id == Lead.tenant_id))
        .where(*due)
        .order_by(Lead.next_follow_up_on, Lead.id)
        .limit(limit)
    )
    return (
        today_count,
        overdue,
        [
            DueFollowUp(id=row.id, name=row.name or "Unnamed lead", on=row.next_follow_up_on)
            for row in earliest
        ],
    )


async def won_deals(
    db: AsyncSession, tenant_id: int, start: date, end: date
) -> list[tuple[int, str, Decimal]]:
    """Deals won between two days, both included: id, name and value."""
    rows = await db.execute(
        select(Deal.id, Deal.name, Deal.amount).where(
            Deal.tenant_id == tenant_id,
            Deal.stage == "won",
            _ist_day(Deal.updated_at).between(start, end),
        )
    )
    return [(int(row.id), str(row.name), Decimal(row.amount)) for row in rows]


LOST_LABELS = {
    "price": "Price too high",
    "competitor": "Went with a competitor",
    "no_budget": "No budget",
    "no_response": "Stopped responding",
    "timing": "Not the right time",
    "not_a_fit": "Not a fit",
    "other": "Other",
}


@dataclass(frozen=True)
class LostReason:
    """Leads lost between two days for one reason, and the value of the deals lost with them."""

    category: str
    label: str
    count: int
    value: Decimal


async def lost_reasons(
    db: AsyncSession, tenant_id: int, start: date, end: date
) -> list[LostReason]:
    """Why leads were lost between two days, both included, the most common reason first."""
    rows = (
        await db.execute(
            select(
                Lead.lost_category,
                func.count(Lead.id),
                func.coalesce(func.sum(Deal.amount), 0),
            )
            .select_from(Lead)
            .outerjoin(Deal, (Deal.tenant_id == Lead.tenant_id) & (Deal.lead_id == Lead.id))
            .where(
                Lead.tenant_id == tenant_id,
                Lead.stage == "lost",
                _ist_day(func.coalesce(Lead.lost_at, Lead.last_activity_at)).between(start, end),
            )
            .group_by(Lead.lost_category)
        )
    ).all()
    # Leads lost before reasons were kept have none; they count as "other".
    counts: dict[str, tuple[int, Decimal]] = {}
    for category, count, value in rows:
        key = str(category) if category in LOST_LABELS else "other"
        before = counts.get(key, (0, Decimal(0)))
        counts[key] = (before[0] + int(count), before[1] + Decimal(value))
    reasons = [
        LostReason(category=key, label=LOST_LABELS[key], count=count, value=value)
        for key, (count, value) in counts.items()
    ]
    return sorted(reasons, key=lambda reason: (-reason.count, -reason.value, reason.category))


@dataclass(frozen=True)
class Closed:
    """Deals closed between two days: won and lost, the value won, and the average days a won
    deal took from the enquiry coming in."""

    won: int
    lost: int
    won_value: Decimal
    cycle_days: float | None


async def closed(db: AsyncSession, tenant_id: int, start: date, end: date) -> Closed:
    """Deals won, by the day they were won, and lost, by the day lost, between two days."""
    won_row = (
        await db.execute(
            select(
                func.count(Deal.id),
                func.coalesce(func.sum(Deal.amount), 0),
                func.avg(func.extract("epoch", Deal.updated_at - Lead.created_at) / 86400),
            )
            .select_from(Deal)
            .join(Lead, (Lead.tenant_id == Deal.tenant_id) & (Lead.id == Deal.lead_id))
            .where(
                Deal.tenant_id == tenant_id,
                Deal.stage == "won",
                _ist_day(Deal.updated_at).between(start, end),
            )
        )
    ).one()
    lost = await db.scalar(
        select(func.count(Deal.id)).where(
            Deal.tenant_id == tenant_id,
            Deal.stage == "lost",
            _ist_day(func.coalesce(Deal.lost_at, Deal.updated_at)).between(start, end),
        )
    )
    return Closed(
        won=int(won_row[0]),
        lost=int(lost or 0),
        won_value=Decimal(won_row[1]),
        cycle_days=float(won_row[2]) if won_row[2] is not None else None,
    )
