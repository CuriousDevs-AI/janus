from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.service import record
from janus_api.core.errors import ApiError
from janus_api.core.tenancy import set_context
from janus_api.crm.models import Deal, Lead
from janus_api.finance.models import (
    FinanceBill,
    FinanceBillPayment,
    FinanceCreditNote,
    FinanceInvoice,
    FinancePayment,
)
from janus_api.org import service as org
from janus_api.org.models import Membership, Role, Tenant
from janus_api.portfolio import schemas
from janus_api.support.models import SupportTicket

# A login may own this many companies, so a runaway script cannot create tenants without end.
MAX_COMPANIES = 20
CLOSED_TICKETS = ("resolved", "closed")


def today_ist() -> date:
    return datetime.now(ZoneInfo("Asia/Kolkata")).date()


def rupees(paise: int) -> str:
    return str((Decimal(paise) / 100).quantize(Decimal("0.01")))


async def money_summary(db: AsyncSession, tenant_id: int, today: date) -> schemas.MoneySummary:
    """What customers owe and what is owed to suppliers.

    An approved credit note reduces what a customer owes; a pending one does not yet.
    """
    paid = (
        select(FinancePayment.invoice_id, func.sum(FinancePayment.amount_paise).label("paise"))
        .where(FinancePayment.tenant_id == tenant_id)
        .group_by(FinancePayment.invoice_id)
        .subquery()
    )
    credited = (
        select(
            FinanceCreditNote.invoice_id, func.sum(FinanceCreditNote.amount_paise).label("paise")
        )
        .where(FinanceCreditNote.tenant_id == tenant_id, FinanceCreditNote.status == "approved")
        .group_by(FinanceCreditNote.invoice_id)
        .subquery()
    )
    invoices = (
        await db.execute(
            select(
                FinanceInvoice.due_date,
                FinanceInvoice.total_paise
                - func.coalesce(paid.c.paise, 0)
                - func.coalesce(credited.c.paise, 0),
            )
            .outerjoin(paid, paid.c.invoice_id == FinanceInvoice.id)
            .outerjoin(credited, credited.c.invoice_id == FinanceInvoice.id)
            .where(FinanceInvoice.tenant_id == tenant_id)
        )
    ).all()
    receivable = overdue = count = 0
    buckets = [0, 0, 0]
    for due, balance in invoices:
        balance = int(balance)
        if balance <= 0:
            continue
        receivable += balance
        late = (today - due).days
        if late > 0:
            overdue += balance
            count += 1
            buckets[0 if late <= 30 else 1 if late <= 60 else 2] += balance
    bill_paid = (
        select(FinanceBillPayment.bill_id, func.sum(FinanceBillPayment.amount_paise).label("paise"))
        .where(FinanceBillPayment.tenant_id == tenant_id)
        .group_by(FinanceBillPayment.bill_id)
        .subquery()
    )
    bills = (
        await db.execute(
            select(
                FinanceBill.due_date, FinanceBill.amount_paise - func.coalesce(bill_paid.c.paise, 0)
            )
            .outerjoin(bill_paid, bill_paid.c.bill_id == FinanceBill.id)
            .where(FinanceBill.tenant_id == tenant_id)
        )
    ).all()
    payable = sum(max(0, int(balance)) for _, balance in bills)
    week = today + timedelta(days=7)
    due_soon = sum(max(0, int(balance)) for due, balance in bills if due <= week)
    month = today.replace(day=1)
    last_month = (month - timedelta(days=1)).replace(day=1)

    async def collected(start: date, end: date) -> int:
        return int(
            await db.scalar(
                select(func.coalesce(func.sum(FinancePayment.amount_paise), 0)).where(
                    FinancePayment.tenant_id == tenant_id,
                    FinancePayment.paid_on >= start,
                    FinancePayment.paid_on < end,
                )
            )
            or 0
        )

    return schemas.MoneySummary(
        receivable=rupees(receivable),
        overdue=rupees(overdue),
        overdueInvoices=count,
        ageing=schemas.Ageing(
            days0to30=rupees(buckets[0]), days31to60=rupees(buckets[1]), over60=rupees(buckets[2])
        ),
        payable=rupees(payable),
        payableDueThisWeek=rupees(due_soon),
        collectedThisMonth=rupees(await collected(month, today + timedelta(days=1))),
        collectedLastMonth=rupees(await collected(last_month, month)),
    )


async def owned_tenants(db: AsyncSession, user_id: int) -> list[int]:
    """The companies where this person is an active Owner.

    Memberships are read under the person's own context, which RLS allows for their own rows.
    """
    return list(
        (
            await db.scalars(
                select(Membership.tenant_id)
                .join(Role, Role.id == Membership.role_id)
                .where(
                    Membership.user_id == user_id,
                    Membership.status == "active",
                    Role.tenant_id.is_(None),
                    Role.name == "owner",
                )
                .order_by(Membership.tenant_id)
            )
        ).all()
    )


async def company_summary(
    db: AsyncSession, tenant: Tenant, current: bool, today: date
) -> schemas.CompanySummary:
    """One company's headline numbers.

    The caller has set this company's context, so row-level security applies to every query.
    """
    rows = (
        await db.execute(
            select(Deal.stage, func.count(Deal.id), func.coalesce(func.sum(Deal.amount), 0))
            .where(Deal.tenant_id == tenant.id)
            .group_by(Deal.stage)
        )
    ).all()
    counts: dict[str, int] = {row[0]: int(row[1]) for row in rows}
    values: dict[str, Decimal] = {row[0]: Decimal(row[2]) for row in rows}
    open_stages = [stage for stage in counts if stage not in ("won", "lost")]
    leads = await db.scalar(select(func.count(Lead.id)).where(Lead.tenant_id == tenant.id))
    members = await db.scalar(
        select(func.count(Membership.id)).where(
            Membership.tenant_id == tenant.id, Membership.status == "active"
        )
    )
    tickets = await db.scalar(
        select(func.count(SupportTicket.id)).where(
            SupportTicket.tenant_id == tenant.id, SupportTicket.status.not_in(CLOSED_TICKETS)
        )
    )
    return schemas.CompanySummary(
        id=str(tenant.id),
        name=tenant.name,
        industry=tenant.industry,
        createdAt=tenant.created_at.astimezone(ZoneInfo("Asia/Kolkata")).date().isoformat(),
        current=current,
        members=int(members or 0),
        openTickets=int(tickets or 0),
        crm=schemas.CrmSummary(
            leads=int(leads or 0),
            openDeals=sum(counts[stage] for stage in open_stages),
            wonDeals=counts.get("won", 0),
            lostDeals=counts.get("lost", 0),
            pipelineValue=str(sum((values[stage] for stage in open_stages), Decimal(0))),
            wonValue=str(values.get("won", Decimal("0.00"))),
        ),
        money=await money_summary(db, tenant.id, today),
    )


async def summary(
    db: AsyncSession, user_id: int, current_tenant: int, ip: str
) -> schemas.PortfolioSummary:
    """Every company the person owns.

    Each is read on its own, under its own context, never across companies.
    """
    companies = []
    today = today_ist()
    try:
        for tenant_id in await owned_tenants(db, user_id):
            await set_context(db, user_id=user_id, tenant_id=tenant_id)
            # Re-check the Owner membership under this company's context before reading anything.
            _, role = await org.membership(db, user_id, tenant_id)
            tenant = await db.get(Tenant, tenant_id)
            if role.name != "owner" or tenant is None:
                continue
            companies.append(await company_summary(db, tenant, tenant_id == current_tenant, today))
            record(db, "portfolio.company_read", user_id=user_id, tenant_id=tenant_id, ip=ip)
    finally:
        # Flushes the audit rows under the last company, then returns to the session's own company.
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
    return schemas.PortfolioSummary(companies=companies)


async def create_company(
    db: AsyncSession, user_id: int, current_tenant: int, data: schemas.CompanyCreate, ip: str
) -> schemas.CompanyOut:
    """A new company with this person as its Owner.

    Only an Owner of the current company may add one.
    """
    owned = await owned_tenants(db, user_id)
    if current_tenant not in owned:
        raise ApiError("forbidden", "Only an Owner can add a company.", 403)
    if len(owned) >= MAX_COMPANIES:
        raise ApiError("company_limit", f"One login can own up to {MAX_COMPANIES} companies.", 409)
    try:
        tenant_id = await org.create_workspace(db, user_id, data.name)
        tenant = await db.get(Tenant, tenant_id)
        assert tenant is not None
        tenant.industry = data.industry
        record(
            db,
            "portfolio.company_created",
            user_id=user_id,
            tenant_id=tenant_id,
            ip=ip,
            details={"from_tenant": current_tenant},
        )
        out = schemas.CompanyOut(id=str(tenant.id), name=tenant.name, industry=tenant.industry)
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
    return out
