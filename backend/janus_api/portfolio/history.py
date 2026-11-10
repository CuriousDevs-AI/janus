"""Importing months from before a company kept its books in Janus (Tally, Zoho Books or another
system), so the charts and growth against last year have a history from the start. The page reads
a monthly summary CSV in the browser and sends month, sales and costs."""

from datetime import date
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.core.errors import ApiError
from janus_api.core.tenancy import set_context
from janus_api.finance import service as finance_service
from janus_api.portfolio import schemas
from janus_api.portfolio.access import enter_company
from janus_api.portfolio.periods import today_ist


async def import_months(
    db: AsyncSession,
    user_id: int,
    current_tenant: int | None,
    company_id: str,
    data: schemas.HistoryIn,
    ip: str | None,
) -> int:
    this_month = today_ist().replace(day=1)
    months = []
    for row in data.months:
        first = date.fromisoformat(f"{row.month}-01")
        if first >= this_month:
            raise ApiError("month_not_over", "Only finished months can be imported.", 422)
        months.append(
            (
                first,
                int(Decimal(row.sales) * 100),
                int(Decimal(row.costs) * 100),
            )
        )
    try:
        tenant_id = await enter_company(db, user_id, company_id, "portfolio:finance")
        return await finance_service.import_history(db, tenant_id, user_id, data.source, months, ip)
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)


async def import_customers(
    db: AsyncSession,
    user_id: int,
    current_tenant: int | None,
    company_id: str,
    data: schemas.CustomerHistoryIn,
    ip: str | None,
) -> int:
    this_month = today_ist().replace(day=1)
    rows = []
    for row in data.rows:
        first = date.fromisoformat(f"{row.month}-01")
        if first >= this_month:
            raise ApiError("month_not_over", "Only finished months can be imported.", 422)
        rows.append((first, row.customer, int(Decimal(row.sales) * 100)))
    try:
        tenant_id = await enter_company(db, user_id, company_id, "portfolio:finance")
        return await finance_service.import_customer_history(
            db, tenant_id, user_id, data.source, rows, ip
        )
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)


async def record_openings(
    db: AsyncSession,
    user_id: int,
    user_name: str,
    current_tenant: int | None,
    company_id: str,
    data: schemas.OpeningIn,
    ip: str | None,
) -> schemas.OpeningOut:
    """Opening balances, recorded in Finance as opening invoices and bills, by a role that may
    record bills there."""
    if data.asOf > today_ist():
        raise ApiError("invalid_date", "The opening day cannot be in the future.", 422)

    def rows(items: list[schemas.OpeningRowIn]) -> list[finance_service.OpeningRow]:
        return [
            finance_service.OpeningRow(
                party=item.name,
                amount_paise=int(Decimal(item.amount) * 100),
                due=item.dueOn or data.asOf,
            )
            for item in items
        ]

    try:
        tenant_id = await enter_company(db, user_id, company_id, "billing:manage")
        invoices, bills = await finance_service.record_openings(
            db,
            tenant_id,
            user_id,
            user_name,
            as_of=data.asOf,
            customers=rows(data.customers),
            suppliers=rows(data.suppliers),
            ip=ip,
        )
        return schemas.OpeningOut(invoices=invoices, bills=bills)
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
