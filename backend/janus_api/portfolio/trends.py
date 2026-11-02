"""Month by month figures for each company, for the Portfolio's charts.

Each company is read on its own, under its own context. Money is included only where the
person's role there holds portfolio:finance. The current month runs to today.
"""

from datetime import date, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.core.tenancy import set_context
from janus_api.crm import overview as crm
from janus_api.finance import overview as finance
from janus_api.org import overview as org
from janus_api.org import service as org_service
from janus_api.portfolio import schemas
from janus_api.portfolio.access import readable_companies
from janus_api.portfolio.periods import MONTHS, rupees, today_ist


def month_spans(today: date, count: int) -> list[tuple[date, date]]:
    """The last `count` calendar months, oldest first; the current one ends today."""
    spans = []
    year, month = today.year, today.month
    for _ in range(count):
        start = date(year, month, 1)
        following = date(year + (month == 12), month % 12 + 1, 1)
        spans.append((start, min(following - timedelta(days=1), today)))
        year, month = (year - 1, 12) if month == 1 else (year, month - 1)
    return spans[::-1]


async def trends(
    db: AsyncSession, user_id: int, current_tenant: int, months: int
) -> schemas.Trends:
    spans = month_spans(today_ist(), months)
    companies = []
    try:
        for tenant_id in await readable_companies(db, user_id):
            await set_context(db, user_id=user_id, tenant_id=tenant_id)
            _, role = await org_service.membership(db, user_id, tenant_id)
            company = await org.company(db, tenant_id)
            if company is None or "portfolio:read" not in role.permissions:
                continue
            money = "portfolio:finance" in role.permissions
            points = []
            for start, end in spans:
                sales = await crm.activity(db, tenant_id, start, end)
                kept = await finance.books(db, tenant_id, start, end) if money else None
                flow = await finance.flow(db, tenant_id, start, end) if money else None
                points.append(
                    schemas.TrendPoint(
                        month=f"{start:%Y-%m}",
                        leads=sales.leads,
                        wonDeals=sales.won_deals,
                        wonValue=rupees(sales.won_value),
                        netSales=rupees(kept.net_sales, paise=True) if kept else None,
                        costs=rupees(kept.costs, paise=True) if kept else None,
                        collected=rupees(flow.collected, paise=True) if flow else None,
                    )
                )
            companies.append(
                schemas.CompanyTrend(id=str(tenant_id), name=company.name, points=points)
            )
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
    return schemas.Trends(
        months=[f"{start:%Y-%m}" for start, _ in spans],
        labels=[f"{MONTHS[start.month - 1]} {str(start.year)[2:]}" for start, _ in spans],
        companies=companies,
    )
