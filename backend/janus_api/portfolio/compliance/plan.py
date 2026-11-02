"""Which filings apply to a company, and marking them filed."""

from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.service import record
from janus_api.core.errors import ApiError
from janus_api.core.security import now
from janus_api.core.tenancy import set_context
from janus_api.portfolio import schemas
from janus_api.portfolio.access import enter_company
from janus_api.portfolio.compliance import due_dates
from janus_api.portfolio.models import ComplianceFiling, ComplianceProfile
from janus_api.portfolio.periods import today_ist


def _rules(profile: ComplianceProfile) -> due_dates.Profile:
    return due_dates.Profile(profile.gst_filing, profile.tds, profile.pf_esi, profile.company)


async def _profile(db: AsyncSession, tenant_id: int) -> ComplianceProfile | None:
    row: ComplianceProfile | None = await db.scalar(
        select(ComplianceProfile).where(ComplianceProfile.tenant_id == tenant_id)
    )
    return row


async def compliance_view(
    db: AsyncSession, tenant_id: int, today: date
) -> tuple[schemas.CompliancePlan, list[schemas.ComplianceDue]]:
    """The filing plan, and its dues from 90 days back to 30 ahead, marked filed or not."""
    profile = await _profile(db, tenant_id)
    if profile is None:
        return schemas.CompliancePlan(), []
    plan = schemas.CompliancePlan(
        gstin=profile.gstin,
        gstFiling=profile.gst_filing,
        tds=profile.tds,
        pfEsi=profile.pf_esi,
        company=profile.company,
    )
    filed: dict[str, date] = {
        key: day
        for key, day in (
            await db.execute(
                select(ComplianceFiling.item_key, ComplianceFiling.filed_on).where(
                    ComplianceFiling.tenant_id == tenant_id
                )
            )
        ).all()
    }
    first, last = due_dates.window(today)
    return plan, [
        schemas.ComplianceDue(
            key=due.key,
            label=due.label,
            period=due.period,
            area=due.area,
            dueOn=due.due_on.isoformat(),
            status=due_dates.status(due.due_on, due.key in filed, today),
            filedOn=filed[due.key].isoformat() if due.key in filed else None,
            to="/portfolio?view=compliance",
        )
        for due in due_dates.dues(_rules(profile), first, last)
    ]


async def set_compliance_plan(
    db: AsyncSession,
    user_id: int,
    current_tenant: int,
    company_id: str,
    plan: schemas.CompliancePlan,
    ip: str,
) -> schemas.CompliancePlan:
    """Says which filings apply. The Owner or someone with money (Group finance) sets it."""
    try:
        tenant_id = await enter_company(db, user_id, company_id, "portfolio:finance")
        row = await _profile(db, tenant_id)
        if row is None:
            row = ComplianceProfile(tenant_id=tenant_id, updated_by=user_id)
            db.add(row)
        row.gstin, row.gst_filing, row.tds = plan.gstin, plan.gstFiling, plan.tds
        row.pf_esi, row.company, row.updated_by, row.updated_at = (
            plan.pfEsi,
            plan.company,
            user_id,
            now(),
        )
        record(db, "portfolio.compliance_plan_set", user_id=user_id, tenant_id=tenant_id, ip=ip)
        await db.flush()
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
    return plan


async def mark_filing(
    db: AsyncSession,
    user_id: int,
    current_tenant: int,
    company_id: str,
    key: str,
    filed_on: date | None,
    ip: str,
) -> None:
    """Marks a filing done on a day, or (with no day) takes the mark back. The key must be one of
    the company's own dues, so nothing else can be recorded."""
    try:
        tenant_id = await enter_company(db, user_id, company_id, "portfolio:finance")
        today = today_ist()
        if filed_on is not None and filed_on > today:
            raise ApiError("invalid_date", "A filing cannot be marked done in the future.", 422)
        profile = await _profile(db, tenant_id)
        known = profile is not None and any(
            due.key == key
            for due in due_dates.dues(
                _rules(profile), today - timedelta(days=400), today + timedelta(days=60)
            )
        )
        if not known:
            raise ApiError("not_found", "That filing is not in this company's due_dates.", 404)
        row = await db.scalar(
            select(ComplianceFiling).where(
                ComplianceFiling.tenant_id == tenant_id, ComplianceFiling.item_key == key
            )
        )
        if filed_on is None:
            if row is not None:
                await db.delete(row)
        elif row is None:
            db.add(
                ComplianceFiling(
                    tenant_id=tenant_id, item_key=key, filed_on=filed_on, filed_by=user_id
                )
            )
        else:
            row.filed_on, row.filed_by = filed_on, user_id
        record(
            db,
            "portfolio.filing_marked" if filed_on else "portfolio.filing_unmarked",
            user_id=user_id,
            tenant_id=tenant_id,
            ip=ip,
            details={"item": key},
        )
        await db.flush()
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
