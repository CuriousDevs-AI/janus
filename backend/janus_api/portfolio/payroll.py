"""A company's monthly payroll run, from the Portfolio: HR works out each person's pay and
deductions (hr.service.run_payroll), and posting a finished month keeps those payslips and records
the month's salaries and the TDS deducted from them in the books.

Totals are shown to everyone who may post salaries; each person's payslip only to people who
manage HR in that company, since pay is private.
"""

from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.core.errors import ApiError
from janus_api.core.tenancy import set_context
from janus_api.finance import service as finance_service
from janus_api.hr import service as hr
from janus_api.org import service as org_service
from janus_api.portfolio import schemas
from janus_api.portfolio.access import enter_company
from janus_api.portfolio.periods import rupees, today_ist


def _month(month: str) -> date:
    first = date.fromisoformat(f"{month}-01")
    if first >= today_ist().replace(day=1):
        raise ApiError("month_not_over", "Salaries are run once the month is over.", 422)
    return first


def _run_out(
    month: date, lines: list[hr.PayslipLine], kept: bool, sees_people: bool
) -> schemas.PayrollRunOut:
    old_regime = [line.name for line in lines if line.tds is None]
    notes = []
    if any(line.note and line.tds is not None for line in lines):
        notes.append(
            "Some months of this financial year had no payroll run in Janus. For people who pay "
            "income tax, those months count at the pay then in force, with their share of the tax "
            "taken as already deducted; check this against what was actually deducted."
        )
    if old_regime:
        notes.insert(
            0,
            f"TDS for {', '.join(old_regime)} (old tax regime) is left for your accountant and "
            "is not in the total.",
        )
    return schemas.PayrollRunOut(
        month=f"{month:%Y-%m}",
        label=f"{month:%b %Y}",
        kept=kept,
        headcount=len(lines),
        gross=rupees(sum(line.gross for line in lines)),
        pf=rupees(sum(line.pf for line in lines)),
        esi=rupees(sum(line.esi for line in lines)),
        pt=rupees(sum(line.pt for line in lines)),
        tds=rupees(sum(line.tds or 0 for line in lines)),
        net=rupees(sum(line.net for line in lines)),
        notes=notes,
        people=[
            schemas.PayslipOut(
                name=line.name,
                paidDays=line.paid_days,
                totalDays=line.total_days,
                gross=rupees(line.gross),
                pf=rupees(line.pf),
                esi=rupees(line.esi),
                pt=rupees(line.pt),
                tds=None if line.tds is None else rupees(line.tds),
                net=rupees(line.net),
                note=line.note or None,
            )
            for line in lines
        ]
        if sees_people
        else None,
    )


async def _sees_people(db: AsyncSession, user_id: int, tenant_id: int) -> bool:
    member, role = await org_service.membership(db, user_id, tenant_id)
    return "hr:manage" in org_service.permissions_of(member, role)


async def preview(
    db: AsyncSession, user_id: int, current_tenant: int | None, company_id: str, month: str
) -> schemas.PayrollRunOut:
    """The month's payroll: as it was run, or as it would be run now."""
    first = _month(month)
    try:
        tenant_id = await enter_company(db, user_id, company_id, "portfolio:finance")
        lines, kept = await hr.payroll_lines(db, tenant_id, first)
        return _run_out(first, lines, kept, await _sees_people(db, user_id, tenant_id))
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)


async def post(
    db: AsyncSession,
    user_id: int,
    user_name: str,
    current_tenant: int | None,
    company_id: str,
    month: str,
    ip: str | None,
) -> bool:
    """Runs the month (once) and posts its salaries and their TDS to the books (once)."""
    first = _month(month)
    try:
        tenant_id = await enter_company(db, user_id, company_id, "portfolio:finance")
        lines = await hr.run_payroll(db, tenant_id, first, user_id)
        if not lines:
            raise ApiError("no_salaries", "No one was on the payroll that month.", 422)
        return await finance_service.post_payroll(
            db,
            tenant_id,
            user_id,
            user_name,
            month=first,
            amount_paise=sum(line.gross for line in lines) * 100,
            headcount=len(lines),
            ip=ip,
            tds_paise=sum(line.tds or 0 for line in lines) * 100,
        )
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
