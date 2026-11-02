"""What HR tells other modules about one company: its people, who is on leave, and the leave and
expense claims waiting for a decision.

Other modules read HR through these functions, never its tables. Each runs under the company's own
context (the caller sets it), so row-level security applies.
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import Numeric, and_, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.hr.models import HrRecord

PENDING_LEAVE = ("pending", "needs_clarification")
PENDING_CLAIMS = ("submitted", "manager_review", "hr_review")


@dataclass(frozen=True)
class People:
    headcount: int
    on_leave_today: int
    pending_leave: int
    pending_claims: int
    monthly_payroll: Decimal
    claims_value: Decimal


async def people(db: AsyncSession, tenant_id: int, today: date) -> People:
    """From the HR records the company keeps on the server."""
    field = HrRecord.data["status"].astext
    employees = and_(HrRecord.tenant_id == tenant_id, HrRecord.kind == "employee")
    active = and_(employees, or_(field.is_(None), field != "archived"))
    headcount = await db.scalar(select(func.count(HrRecord.id)).where(active))
    payroll = await db.scalar(
        select(
            func.coalesce(func.sum(cast(HrRecord.data["salaryMonthly"].astext, Numeric)), 0)
        ).where(active)
    )
    leave = and_(HrRecord.tenant_id == tenant_id, HrRecord.kind == "leave")
    pending_leave = await db.scalar(
        select(func.count(HrRecord.id)).where(leave, field.in_(PENDING_LEAVE))
    )
    today_text = today.isoformat()
    on_leave = await db.scalar(
        select(func.count(HrRecord.id)).where(
            leave,
            field == "approved",
            HrRecord.data["from"].astext <= today_text,
            HrRecord.data["to"].astext >= today_text,
        )
    )
    claims = and_(
        HrRecord.tenant_id == tenant_id, HrRecord.kind == "expense", field.in_(PENDING_CLAIMS)
    )
    claim_count, claim_value = (
        await db.execute(
            select(
                func.count(HrRecord.id),
                func.coalesce(func.sum(cast(HrRecord.data["amount"].astext, Numeric)), 0),
            ).where(claims)
        )
    ).one()
    return People(
        headcount=int(headcount or 0),
        on_leave_today=int(on_leave or 0),
        pending_leave=int(pending_leave or 0),
        pending_claims=int(claim_count),
        monthly_payroll=Decimal(payroll or 0),
        claims_value=Decimal(claim_value),
    )
