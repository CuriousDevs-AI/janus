"""Each company's monthly targets for leads, value won and money collected."""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.service import record
from janus_api.core.security import now
from janus_api.core.tenancy import set_context
from janus_api.portfolio import schemas
from janus_api.portfolio.access import enter_company
from janus_api.portfolio.models import PortfolioTarget


async def targets_view(db: AsyncSession, tenant_id: int, *, money: bool) -> schemas.Targets:
    rows: dict[str, Decimal] = {
        metric: monthly
        for metric, monthly in (
            await db.execute(
                select(PortfolioTarget.metric, PortfolioTarget.monthly).where(
                    PortfolioTarget.tenant_id == tenant_id
                )
            )
        ).all()
    }

    def value(metric: str) -> str | None:
        return str(rows[metric]) if metric in rows else None

    return schemas.Targets(
        leads=value("leads"),
        wonValue=value("won_value"),
        collected=value("collected") if money else None,
    )


async def set_targets(
    db: AsyncSession,
    user_id: int,
    current_tenant: int,
    company_id: str,
    data: schemas.TargetsUpdate,
    ip: str,
) -> schemas.Targets:
    """Sets or clears the company's monthly targets. Only its Owner sets them."""
    try:
        tenant_id = await enter_company(db, user_id, company_id, "owner")
        for metric, value in (
            ("leads", data.leads),
            ("won_value", data.wonValue),
            ("collected", data.collected),
        ):
            row = await db.scalar(
                select(PortfolioTarget).where(
                    PortfolioTarget.tenant_id == tenant_id, PortfolioTarget.metric == metric
                )
            )
            if value is None:
                if row is not None:
                    await db.delete(row)
            elif row is None:
                db.add(
                    PortfolioTarget(
                        tenant_id=tenant_id, metric=metric, monthly=value, updated_by=user_id
                    )
                )
            else:
                row.monthly, row.updated_by, row.updated_at = value, user_id, now()
        record(db, "portfolio.targets_set", user_id=user_id, tenant_id=tenant_id, ip=ip)
        await db.flush()
        result = await targets_view(db, tenant_id, money=True)
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
    return result
