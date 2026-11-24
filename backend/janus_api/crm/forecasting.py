"""Sales forecasting: targets, weighted pipeline, rep attainment."""

from decimal import Decimal

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.service import record
from janus_api.core.security import now
from janus_api.crm import schemas
from janus_api.crm.models import Deal, Lead, SalesTarget

STAGE_PROBABILITY: dict[str, Decimal] = {
    "new": Decimal("0.05"),
    "qualified": Decimal("0.20"),
    "demo": Decimal("0.40"),
    "proposal": Decimal("0.60"),
    "negotiation": Decimal("0.75"),
    "approval": Decimal("0.90"),
}


def _fmt(d: Decimal | int) -> str:
    return format(d, ".2f")


async def set_target(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    data: schemas.TargetIn,
    crm_id: int | None = None,
) -> schemas.TargetOut:
    owner_id = int(data.ownerId) if data.ownerId else None
    existing = await db.scalar(
        select(SalesTarget).where(
            SalesTarget.tenant_id == tenant_id,
            SalesTarget.owner_id == owner_id if owner_id else SalesTarget.owner_id.is_(None),
            SalesTarget.period == data.period,
        )
    )
    if existing:
        existing.target_amount = data.targetAmount
        existing.updated_at = now()
        await db.flush()
        t = existing
    else:
        t = SalesTarget(
            tenant_id=tenant_id,
            owner_id=owner_id,
            period=data.period,
            target_amount=data.targetAmount,
            crm_id=crm_id,
        )
        db.add(t)
        await db.flush()

    record(
        db,
        "crm.target.set",
        user_id=user_id,
        tenant_id=tenant_id,
        details={"period": data.period, "amount": str(data.targetAmount)},
    )

    return schemas.TargetOut(
        id=str(t.id),
        ownerId=str(t.owner_id) if t.owner_id else None,
        period=t.period,
        targetAmount=_fmt(t.target_amount),
        createdAt=t.created_at,
    )


async def list_targets(
    db: AsyncSession,
    tenant_id: int,
    period: str | None = None,
    crm_id: int | None = None,
) -> list[schemas.TargetOut]:
    q = select(SalesTarget).where(SalesTarget.tenant_id == tenant_id)
    if crm_id is not None:
        q = q.where(SalesTarget.crm_id == crm_id)
    if period:
        q = q.where(SalesTarget.period == period)
    q = q.order_by(SalesTarget.period.desc(), SalesTarget.owner_id)
    rows = (await db.execute(q)).scalars().all()

    owner_ids = [r.owner_id for r in rows if r.owner_id]
    names: dict[int, str] = {}
    if owner_ids:
        name_rows = await db.execute(text("SELECT id, name FROM app_member_names()"))
        names = {int(r.id): str(r.name) for r in name_rows}

    return [
        schemas.TargetOut(
            id=str(t.id),
            ownerId=str(t.owner_id) if t.owner_id else None,
            ownerName=names.get(t.owner_id, "Unknown") if t.owner_id else "Team",
            period=t.period,
            targetAmount=_fmt(t.target_amount),
            createdAt=t.created_at,
        )
        for t in rows
    ]


async def get_forecast(
    db: AsyncSession,
    tenant_id: int,
    period: str,
    crm_id: int | None = None,
) -> schemas.ForecastOut:
    from calendar import monthrange
    from datetime import datetime as dt
    from zoneinfo import ZoneInfo

    y, m = int(period.split("-")[0]), int(period.split("-")[1])
    utc = ZoneInfo("UTC")
    month_start = dt(y, m, 1, tzinfo=utc)
    last_day = monthrange(y, m)[1]
    month_end = dt(y, m, last_day, 23, 59, 59, tzinfo=utc)

    target_f = [SalesTarget.tenant_id == tenant_id, SalesTarget.period == period]
    deal_f = [Deal.tenant_id == tenant_id]
    if crm_id is not None:
        target_f.append(SalesTarget.crm_id == crm_id)
        deal_f.append(Deal.crm_id == crm_id)
    target_row = await db.scalar(
        select(func.coalesce(func.sum(SalesTarget.target_amount), 0)).where(*target_f)
    )
    target_amount = Decimal(target_row) if target_row else Decimal(0)

    deal_rows = (
        await db.execute(
            select(Deal.stage, Deal.amount).where(
                *deal_f,
                Deal.stage.not_in(["won", "lost"]),
            )
        )
    ).all()
    weighted = Decimal(0)
    stage_buckets: dict[str, list[Decimal]] = {}
    for row in deal_rows:
        amt = Decimal(str(row.amount))
        prob = STAGE_PROBABILITY.get(row.stage, Decimal("0.10"))
        weighted += amt * prob
        stage_buckets.setdefault(row.stage, []).append(amt)

    stage_breakdown = [
        schemas.StageBreakdownItem(
            stage=s,
            count=len(amounts),
            value=_fmt(sum(amounts)),
            weight=float(STAGE_PROBABILITY.get(s, Decimal("0.10"))),
            weightedValue=_fmt(sum(a * STAGE_PROBABILITY.get(s, Decimal("0.10")) for a in amounts)),
        )
        for s, amounts in stage_buckets.items()
    ]

    won_f = [Deal.stage == "won", Deal.updated_at >= month_start, Deal.updated_at <= month_end]
    won_total = Decimal(
        await db.scalar(
            select(func.coalesce(func.sum(Deal.amount), 0)).where(*deal_f, *won_f)
        )
        or 0
    )

    gap = target_amount - won_total
    return schemas.ForecastOut(
        period=period,
        targetAmount=_fmt(target_amount),
        weightedPipeline=_fmt(weighted),
        wonToDate=_fmt(won_total),
        gap=_fmt(max(Decimal(0), gap)),
        stageBreakdown=stage_breakdown,
    )


async def rep_attainment(
    db: AsyncSession,
    tenant_id: int,
    period: str,
    crm_id: int | None = None,
) -> list[schemas.RepAttainmentOut]:
    year, month = period.split("-")
    month_start = f"{year}-{month}-01"
    month_end = f"{year}-{month}-31"

    target_f = [
        SalesTarget.tenant_id == tenant_id,
        SalesTarget.period == period,
        SalesTarget.owner_id.is_not(None),
    ]
    if crm_id is not None:
        target_f.append(SalesTarget.crm_id == crm_id)
    targets = (
        (await db.execute(select(SalesTarget).where(*target_f)))
        .scalars()
        .all()
    )

    if not targets:
        return []

    owner_ids = [t.owner_id for t in targets if t.owner_id]
    names: dict[int, str] = {}
    if owner_ids:
        name_rows = await db.execute(text("SELECT id, name FROM app_member_names()"))
        names = {int(r.id): str(r.name) for r in name_rows}

    deal_base = [Deal.tenant_id == tenant_id]
    if crm_id is not None:
        deal_base.append(Deal.crm_id == crm_id)

    result = []
    for t in targets:
        if not t.owner_id:
            continue
        won = Decimal(
            await db.scalar(
                select(func.coalesce(func.sum(Deal.amount), 0))
                .select_from(Deal)
                .join(Lead, (Lead.id == Deal.lead_id) & (Lead.tenant_id == Deal.tenant_id))
                .where(
                    *deal_base,
                    Deal.stage == "won",
                    Lead.owner_id == t.owner_id,
                    Deal.updated_at >= month_start,
                    Deal.updated_at <= month_end + " 23:59:59",
                )
            )
            or 0
        )

        pipeline_rows = (
            await db.execute(
                select(Deal.stage, Deal.amount)
                .select_from(Deal)
                .join(Lead, (Lead.id == Deal.lead_id) & (Lead.tenant_id == Deal.tenant_id))
                .where(
                    *deal_base,
                    Deal.stage.not_in(["won", "lost"]),
                    Lead.owner_id == t.owner_id,
                )
            )
        ).all()
        weighted = sum(
            Decimal(str(r.amount)) * STAGE_PROBABILITY.get(r.stage, Decimal("0.10"))
            for r in pipeline_rows
        )

        pct = (won / t.target_amount * 100) if t.target_amount > 0 else Decimal(0)

        result.append(
            schemas.RepAttainmentOut(
                ownerId=str(t.owner_id),
                name=names.get(t.owner_id, "Unknown"),
                targetAmount=_fmt(t.target_amount),
                wonAmount=_fmt(won),
                attainmentPct=f"{pct:.1f}",
                weightedPipeline=_fmt(weighted),
            )
        )

    return sorted(result, key=lambda r: -float(r.attainmentPct))
