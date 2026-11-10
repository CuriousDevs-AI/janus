"""Posting a month's salaries to a company's books from HR's monthly salaries.

Janus has no payroll run: HR keeps each person's monthly salary. Posting a month records the total
of those salaries, as they stand now, as that month's salary expense, so profit after salaries is
recorded rather than estimated. A month is posted once; past months use today's salaries, which the
page says before posting.
"""

from datetime import date
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.core.errors import ApiError
from janus_api.core.tenancy import set_context
from janus_api.finance import service as finance_service
from janus_api.hr import overview as hr
from janus_api.portfolio.access import enter_company
from janus_api.portfolio.periods import today_ist


async def post(
    db: AsyncSession,
    user_id: int,
    user_name: str,
    current_tenant: int | None,
    company_id: str,
    month: str,
    ip: str | None,
    tds: Decimal = Decimal(0),
) -> bool:
    first = date.fromisoformat(f"{month}-01")
    if first >= today_ist().replace(day=1):
        raise ApiError("month_not_over", "Salaries are posted once the month is over.", 422)
    try:
        tenant_id = await enter_company(db, user_id, company_id, "portfolio:finance")
        staff = await hr.people(db, tenant_id, today_ist())
        return await finance_service.post_payroll(
            db,
            tenant_id,
            user_id,
            user_name,
            month=first,
            amount_paise=int(staff.monthly_payroll * 100),
            headcount=staff.headcount,
            ip=ip,
            tds_paise=int(tds * 100),
        )
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
