"""Day by day, week by week or month by month figures for each company, for the Portfolio's charts.

Each company is read on its own, under its own context. Money is included only where the
person's role there holds portfolio:finance. The current day, week or month runs to today.
"""

from datetime import date, timedelta
from decimal import Decimal
from typing import Literal

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


Unit = Literal["day", "week", "month"]


def spans_for(unit: Unit, today: date, count: int) -> list[tuple[date, date]]:
    """The last `count` days, weeks (Monday to Sunday) or calendar months, oldest first. The
    current one ends today."""
    if unit == "month":
        return month_spans(today, count)
    if unit == "week":
        monday = today - timedelta(days=today.weekday())
        return [
            (
                monday - timedelta(weeks=back),
                min(monday - timedelta(weeks=back) + timedelta(days=6), today),
            )
            for back in range(count - 1, -1, -1)
        ]
    return [(today - timedelta(days=back),) * 2 for back in range(count - 1, -1, -1)]


def label_for(unit: Unit, start: date) -> str:
    if unit == "month":
        return f"{MONTHS[start.month - 1]} {str(start.year)[2:]}"
    return f"{start.day} {MONTHS[start.month - 1]}"


async def trends(
    db: AsyncSession, user_id: int, current_tenant: int, unit: Unit, count: int
) -> schemas.Trends:
    """Each company's leads, deals won, sales, costs and collections for every day, week or month
    in the range. Two grouped reads per module per company, whatever the range."""
    spans = spans_for(unit, today_ist(), count)
    first, last = spans[0][0], spans[-1][1]
    companies = []
    try:
        for tenant_id in await readable_companies(db, user_id):
            await set_context(db, user_id=user_id, tenant_id=tenant_id)
            _, role = await org_service.membership(db, user_id, tenant_id)
            company = await org.company(db, tenant_id)
            if company is None or "portfolio:read" not in role.permissions:
                continue
            money = "portfolio:finance" in role.permissions
            sales_days = await crm.daily(db, tenant_id, first, last)
            money_days = await finance.daily(db, tenant_id, first, last) if money else {}
            # Months from before the books were kept in Janus, where it has none of its own.
            earlier = (
                await finance.history(db, tenant_id, first, last)
                if money and unit == "month"
                else {}
            )
            points = []
            for start, end in spans:
                days = [d for d in sales_days if start <= d <= end]
                books = [v for d, v in money_days.items() if start <= d <= end]
                past = (
                    earlier.get(start) if not any(v.net_sales or v.costs for v in books) else None
                )
                if past is not None:
                    points.append(
                        schemas.TrendPoint(
                            month=f"{start:%Y-%m}",
                            leads=sum(sales_days[d].leads for d in days),
                            wonDeals=sum(sales_days[d].won_deals for d in days),
                            wonValue=rupees(
                                sum((sales_days[d].won_value for d in days), Decimal(0))
                            ),
                            netSales=rupees(past[0], paise=True),
                            costs=rupees(past[1], paise=True),
                            collected=None,
                            imported=True,
                        )
                    )
                    continue
                points.append(
                    schemas.TrendPoint(
                        month=start.isoformat() if unit != "month" else f"{start:%Y-%m}",
                        leads=sum(sales_days[d].leads for d in days),
                        wonDeals=sum(sales_days[d].won_deals for d in days),
                        wonValue=rupees(sum((sales_days[d].won_value for d in days), Decimal(0))),
                        netSales=rupees(sum(v.net_sales for v in books), paise=True)
                        if money
                        else None,
                        costs=rupees(sum(v.costs for v in books), paise=True) if money else None,
                        collected=rupees(sum(v.collected for v in books), paise=True)
                        if money
                        else None,
                    )
                )
            companies.append(
                schemas.CompanyTrend(id=str(tenant_id), name=company.name, points=points)
            )
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
    return schemas.Trends(
        unit=unit,
        months=[start.isoformat() if unit != "month" else f"{start:%Y-%m}" for start, _ in spans],
        labels=[label_for(unit, start) for start, _ in spans],
        companies=companies,
    )
