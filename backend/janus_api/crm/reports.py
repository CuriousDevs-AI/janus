"""CRM dashboard and reports: live stats, funnel, rep leaderboard, source breakdown."""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import Date, cast, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.crm import schemas
from janus_api.crm.models import Deal, Lead


def _ist_day(column: Any) -> Any:
    return cast(func.timezone("Asia/Kolkata", column), Date)


async def dashboard_stats(
    db: AsyncSession, tenant_id: int, crm_id: int | None = None
) -> schemas.DashboardStats:
    lead_f = [Lead.tenant_id == tenant_id]
    deal_f = [Deal.tenant_id == tenant_id]
    if crm_id is not None:
        lead_f.append(Lead.crm_id == crm_id)
        deal_f.append(Deal.crm_id == crm_id)
    total_leads = int(
        await db.scalar(select(func.count(Lead.id)).where(*lead_f)) or 0
    )
    today = datetime.now(UTC).date()
    new_today = int(
        await db.scalar(
            select(func.count(Lead.id)).where(
                *lead_f,
                _ist_day(Lead.created_at) == today,
            )
        )
        or 0
    )
    week_start = today - timedelta(days=today.weekday())
    new_week = int(
        await db.scalar(
            select(func.count(Lead.id)).where(
                *lead_f,
                _ist_day(Lead.created_at) >= week_start,
            )
        )
        or 0
    )

    deal_rows = (
        await db.execute(
            select(Deal.stage, func.count(Deal.id), func.coalesce(func.sum(Deal.amount), 0))
            .where(*deal_f)
            .group_by(Deal.stage)
        )
    ).all()
    stage_counts: dict[str, int] = {r[0]: int(r[1]) for r in deal_rows}
    stage_values: dict[str, Decimal] = {r[0]: Decimal(r[2]) for r in deal_rows}

    open_stages = [s for s in stage_counts if s not in ("won", "lost")]
    open_deals = sum(stage_counts[s] for s in open_stages)
    pipeline_value = sum((stage_values[s] for s in open_stages), Decimal(0))
    won_value = stage_values.get("won", Decimal(0))
    won_deals = stage_counts.get("won", 0)
    lost_deals = stage_counts.get("lost", 0)
    conversion = (won_deals / total_leads * 100) if total_leads > 0 else 0

    cycle_q = (
        select(func.avg(func.extract("epoch", Deal.updated_at - Lead.created_at) / 86400))
        .select_from(Deal)
        .join(Lead, (Lead.tenant_id == Deal.tenant_id) & (Lead.id == Deal.lead_id))
        .where(*deal_f, Deal.stage == "won")
    )
    cycle_row = await db.execute(cycle_q)
    avg_cycle = cycle_row.scalar()

    return schemas.DashboardStats(
        totalLeads=total_leads,
        newLeadsToday=new_today,
        newLeadsWeek=new_week,
        openDeals=open_deals,
        pipelineValue=format(pipeline_value, ".2f"),
        wonValue=format(won_value, ".2f"),
        wonDeals=won_deals,
        lostDeals=lost_deals,
        conversionRate=f"{conversion:.1f}",
        avgCycleDays=f"{avg_cycle:.1f}" if avg_cycle is not None else None,
    )


async def funnel_data(
    db: AsyncSession,
    tenant_id: int,
    days: int = 30,
    crm_id: int | None = None,
) -> list[schemas.FunnelData]:
    start = datetime.now(UTC).date() - timedelta(days=days)
    stage_order = [
        "new",
        "contacted",
        "qualified",
        "demo",
        "proposal",
        "negotiation",
        "approval",
        "won",
        "lost",
    ]
    lead_f = [Lead.tenant_id == tenant_id, _ist_day(Lead.created_at) >= start]
    deal_f = [Deal.tenant_id == tenant_id]
    if crm_id is not None:
        lead_f.append(Lead.crm_id == crm_id)
        deal_f.append(Deal.crm_id == crm_id)
    rows = (
        await db.execute(
            select(Lead.stage, func.count(Lead.id))
            .where(*lead_f)
            .group_by(Lead.stage)
        )
    ).all()
    stage_counts = {str(r[0]): int(r[1]) for r in rows}

    deal_values = (
        await db.execute(
            select(Deal.stage, func.coalesce(func.sum(Deal.amount), 0))
            .where(*deal_f)
            .group_by(Deal.stage)
        )
    ).all()
    stage_vals = {str(r[0]): Decimal(r[1]) for r in deal_values}

    return [
        schemas.FunnelData(
            stage=s,
            count=stage_counts.get(s, 0),
            value=format(stage_vals.get(s, Decimal(0)), ".2f"),
        )
        for s in stage_order
    ]


async def rep_performance(
    db: AsyncSession,
    tenant_id: int,
    days: int = 30,
    crm_id: int | None = None,
) -> list[schemas.RepPerformance]:
    start = datetime.now(UTC).date() - timedelta(days=days)
    lead_f = [Lead.tenant_id == tenant_id]
    deal_f = [Deal.tenant_id == tenant_id]
    if crm_id is not None:
        lead_f.append(Lead.crm_id == crm_id)
        deal_f.append(Deal.crm_id == crm_id)

    came_in = (
        await db.execute(
            select(Lead.owner_id, func.count(Lead.id))
            .where(*lead_f, _ist_day(Lead.created_at) >= start)
            .group_by(Lead.owner_id)
        )
    ).all()
    leads_map: dict[int | None, int] = {r[0]: int(r[1]) for r in came_in}

    open_now = (
        await db.execute(
            select(Lead.owner_id, func.count(Lead.id))
            .where(*lead_f, Lead.stage.not_in(("won", "lost")))
            .group_by(Lead.owner_id)
        )
    ).all()
    open_map: dict[int | None, int] = {r[0]: int(r[1]) for r in open_now}

    won_q = (
        await db.execute(
            select(Lead.owner_id, func.count(Deal.id), func.coalesce(func.sum(Deal.amount), 0))
            .join(Lead, (Lead.id == Deal.lead_id) & (Lead.tenant_id == Deal.tenant_id))
            .where(
                *deal_f,
                Deal.stage == "won",
                _ist_day(Deal.updated_at) >= start,
            )
            .group_by(Lead.owner_id)
        )
    ).all()
    won_map: dict[int | None, tuple[int, Decimal]] = {
        r[0]: (int(r[1]), Decimal(r[2])) for r in won_q
    }

    owners = leads_map.keys() | open_map.keys() | won_map.keys()
    named = [o for o in owners if o is not None]
    names: dict[int, str] = {}
    if named:
        name_rows = await db.execute(text("SELECT id, name FROM app_member_names()"))
        names = {int(r.id): str(r.name) for r in name_rows}

    result = []
    for owner in owners:
        leads_count = leads_map.get(owner, 0)
        won_count = won_map.get(owner, (0, Decimal(0)))[0]
        won_val = won_map.get(owner, (0, Decimal(0)))[1]
        total = leads_count
        conv = (won_count / total * 100) if total > 0 else 0
        result.append(
            schemas.RepPerformance(
                ownerId=str(owner) if owner is not None else None,
                name=names.get(owner, "A former member") if owner is not None else "Unassigned",
                leads=leads_count,
                wonDeals=won_count,
                wonValue=format(won_val, ".2f"),
                openLeads=open_map.get(owner, 0),
                conversionRate=f"{conv:.1f}",
            )
        )
    return sorted(result, key=lambda r: (-float(r.wonValue.replace(",", "")), -r.leads))


async def source_breakdown(
    db: AsyncSession,
    tenant_id: int,
    days: int = 30,
    crm_id: int | None = None,
) -> list[schemas.SourceBreakdown]:
    start = datetime.now(UTC).date() - timedelta(days=days)
    lead_f = [Lead.tenant_id == tenant_id, _ist_day(Lead.created_at) >= start]
    if crm_id is not None:
        lead_f.append(Lead.crm_id == crm_id)
    rows = (
        await db.execute(
            select(
                Lead.source,
                func.count(Lead.id),
                func.count(Deal.id).filter(Deal.stage == "won"),
                func.coalesce(func.sum(Deal.amount).filter(Deal.stage == "won"), 0),
            )
            .select_from(Lead)
            .outerjoin(Deal, (Deal.lead_id == Lead.id) & (Deal.tenant_id == Lead.tenant_id))
            .where(*lead_f)
            .group_by(Lead.source)
        )
    ).all()
    result = []
    for source, leads, won, won_val in rows:
        conv = (int(won) / int(leads) * 100) if int(leads) > 0 else 0
        src = str(source)
        result.append(
            schemas.SourceBreakdown(
                source=src,
                sourceLabel=schemas._SOURCE_LABELS.get(src, src.replace("_", " ").title()),
                leads=int(leads),
                won=int(won),
                wonValue=format(Decimal(won_val), ".2f"),
                conversionRate=f"{conv:.1f}",
            )
        )
    return sorted(result, key=lambda r: -r.leads)


async def daily_trend(
    db: AsyncSession,
    tenant_id: int,
    days: int = 30,
    crm_id: int | None = None,
) -> list[schemas.DailyPoint]:
    start = datetime.now(UTC).date() - timedelta(days=days)
    lead_day = _ist_day(Lead.created_at)
    lead_f = [Lead.tenant_id == tenant_id, lead_day >= start]
    deal_f = [Deal.tenant_id == tenant_id, Deal.stage == "won", _ist_day(Deal.updated_at) >= start]
    if crm_id is not None:
        lead_f.append(Lead.crm_id == crm_id)
        deal_f.append(Deal.crm_id == crm_id)
    lead_rows = (
        await db.execute(
            select(lead_day, func.count(Lead.id))
            .where(*lead_f)
            .group_by(lead_day)
        )
    ).all()
    leads_by_day: dict[date, int] = {r[0]: int(r[1]) for r in lead_rows}

    won_day = _ist_day(Deal.updated_at)
    won_rows = (
        await db.execute(
            select(won_day, func.count(Deal.id), func.coalesce(func.sum(Deal.amount), 0))
            .where(*deal_f)
            .group_by(won_day)
        )
    ).all()
    won_by_day: dict[date, tuple[int, Decimal]] = {
        r[0]: (int(r[1]), Decimal(r[2])) for r in won_rows
    }

    all_days = sorted(leads_by_day.keys() | won_by_day.keys())
    return [
        schemas.DailyPoint(
            date=str(d),
            leads=leads_by_day.get(d, 0),
            wonDeals=won_by_day.get(d, (0, Decimal(0)))[0],
            wonValue=format(won_by_day.get(d, (0, Decimal(0)))[1], ".2f"),
        )
        for d in all_days
    ]
