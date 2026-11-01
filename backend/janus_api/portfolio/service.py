from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.service import record
from janus_api.core.errors import ApiError
from janus_api.core.security import now
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
from janus_api.org.models import Invitation, Membership, Role, Tenant
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


async def member_tenants(db: AsyncSession, user_id: int, permission: str) -> list[int]:
    """The companies where this person's active role holds the permission.

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
                    Role.permissions.contains([permission]),
                )
                .order_by(Membership.tenant_id)
            )
        ).all()
    )


async def owned_tenants(db: AsyncSession, user_id: int) -> list[int]:
    """The companies where this person is an active Owner."""
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
    db: AsyncSession, tenant: Tenant, current: bool, today: date, *, money: bool
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
        money=await money_summary(db, tenant.id, today) if money else None,
    )


async def summary(
    db: AsyncSession, user_id: int, current_tenant: int, ip: str
) -> schemas.PortfolioSummary:
    """Every company whose Portfolio this person may see: those they own, and those an Owner shared.

    Each is read on its own, under its own context, never across companies. Money is included only
    where the person's role there holds portfolio:finance.
    """
    companies = []
    today = today_ist()
    try:
        for tenant_id in await member_tenants(db, user_id, "portfolio:read"):
            await set_context(db, user_id=user_id, tenant_id=tenant_id)
            # Re-check the role under this company's context before reading anything.
            _, role = await org.membership(db, user_id, tenant_id)
            tenant = await db.get(Tenant, tenant_id)
            if "portfolio:read" not in role.permissions or tenant is None:
                continue
            companies.append(
                await company_summary(
                    db,
                    tenant,
                    tenant_id == current_tenant,
                    today,
                    money="portfolio:finance" in role.permissions,
                )
            )
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


ACCESS_ROLES = ("owner", "group_finance", "group_analyst")


async def _owned_targets(db: AsyncSession, user_id: int, wanted: list[str]) -> list[int]:
    owned = await owned_tenants(db, user_id)
    if not owned:
        raise ApiError("forbidden", "Only an Owner can share the Portfolio.", 403)
    if not wanted:
        return owned
    ids = {int(item) for item in wanted if item.isdigit()}
    if len(ids) != len(set(wanted)) or not ids <= set(owned):
        raise ApiError("forbidden", "You can share only companies you own.", 403)
    return sorted(ids)


async def list_access(db: AsyncSession, user_id: int, current_tenant: int) -> schemas.AccessList:
    """Everyone who holds, or is invited to, a Portfolio role in a company this Owner owns."""
    from janus_api.auth.service import user_directory

    people: dict[str, schemas.AccessPerson] = {}
    try:
        for tenant_id in await owned_tenants(db, user_id):
            await set_context(db, user_id=user_id, tenant_id=tenant_id)
            tenant = await db.get(Tenant, tenant_id)
            if tenant is None:
                continue
            members = (
                await db.execute(
                    select(Membership, Role.name)
                    .join(Role, Role.id == Membership.role_id)
                    .where(
                        Membership.tenant_id == tenant_id,
                        Membership.user_id != user_id,
                        Membership.status == "active",
                        Role.tenant_id.is_(None),
                        Role.name.in_(ACCESS_ROLES),
                    )
                )
            ).all()
            profiles = await user_directory(db, [member.user_id for member, _ in members])
            for member, role in members:
                profile = profiles[member.user_id]
                person = people.setdefault(
                    profile.email,
                    schemas.AccessPerson(email=profile.email, name=profile.name, companies=[]),
                )
                person.companies.append(
                    schemas.AccessCompany(
                        id=str(tenant_id), name=tenant.name, role=role, status="active"
                    )
                )
            invites = (
                await db.execute(
                    select(Invitation.email, Role.name)
                    .join(Role, Role.id == Invitation.role_id)
                    .where(
                        Invitation.tenant_id == tenant_id,
                        Invitation.used_at.is_(None),
                        Invitation.revoked_at.is_(None),
                        Invitation.expires_at > now(),
                        Role.tenant_id.is_(None),
                        Role.name.in_(ACCESS_ROLES),
                    )
                )
            ).all()
            for email, role in invites:
                person = people.setdefault(
                    email, schemas.AccessPerson(email=email, name=None, companies=[])
                )
                person.companies.append(
                    schemas.AccessCompany(
                        id=str(tenant_id), name=tenant.name, role=role, status="invited"
                    )
                )
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
    return schemas.AccessList(people=sorted(people.values(), key=lambda person: person.email))


async def grant_access(
    db: AsyncSession, user_id: int, current_tenant: int, data: schemas.AccessGrant, ip: str
) -> schemas.AccessResult:
    """Invites the person into each chosen company with the role. A company where they are already a
    member, or already invited, is skipped with the reason; the others still go out."""
    done: list[str] = []
    skipped: list[schemas.AccessSkipped] = []
    try:
        for tenant_id in await _owned_targets(db, user_id, data.companies):
            await set_context(db, user_id=user_id, tenant_id=tenant_id)
            tenant = await db.get(Tenant, tenant_id)
            name = tenant.name if tenant else str(tenant_id)
            try:
                await org.create_invitation(db, tenant_id, user_id, str(data.email), data.role, ip)
            except ApiError as error:
                skipped.append(schemas.AccessSkipped(company=name, reason=error.message))
                continue
            done.append(name)
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
    return schemas.AccessResult(done=done, skipped=skipped)


async def remove_access(
    db: AsyncSession, user_id: int, current_tenant: int, data: schemas.AccessRemove, ip: str
) -> schemas.AccessResult:
    """Takes the person's group role away in every company this Owner owns, and withdraws open
    Portfolio invitations. A co-owner stays: ownership is changed company by company."""
    from janus_api.auth.service import user_id_for_email

    address = str(data.email).casefold()
    done: list[str] = []
    skipped: list[schemas.AccessSkipped] = []
    try:
        for tenant_id in await _owned_targets(db, user_id, []):
            await set_context(db, user_id=user_id, tenant_id=tenant_id)
            tenant = await org.lock_workspace(db, tenant_id, user_id, "members:manage")
            changed = False
            person = await user_id_for_email(db, address)
            row = (
                (
                    await db.execute(
                        select(Membership, Role.name)
                        .join(Role, Role.id == Membership.role_id)
                        .where(
                            Membership.tenant_id == tenant_id,
                            Membership.user_id == person,
                            Membership.status == "active",
                        )
                    )
                ).first()
                if person is not None and person != user_id
                else None
            )
            if row is not None and row[1] in ("group_finance", "group_analyst"):
                row[0].status = "disabled"
                changed = True
                record(
                    db,
                    "portfolio.access_removed",
                    user_id=user_id,
                    tenant_id=tenant_id,
                    ip=ip,
                    details={"membership_id": row[0].id},
                )
            elif row is not None and row[1] == "owner":
                skipped.append(
                    schemas.AccessSkipped(
                        company=tenant.name, reason="Co-owner: change ownership in the company."
                    )
                )
            invites = (
                await db.scalars(
                    select(Invitation)
                    .join(Role, Role.id == Invitation.role_id)
                    .where(
                        Invitation.tenant_id == tenant_id,
                        Invitation.email == address,
                        Invitation.used_at.is_(None),
                        Invitation.revoked_at.is_(None),
                        Role.tenant_id.is_(None),
                        Role.name.in_(ACCESS_ROLES),
                    )
                )
            ).all()
            for invite in invites:
                invite.revoked_at = now()
                changed = True
                record(
                    db,
                    "invitation.revoked",
                    user_id=user_id,
                    tenant_id=tenant_id,
                    ip=ip,
                    details={"invitation_id": invite.id},
                )
            if changed:
                done.append(tenant.name)
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
    return schemas.AccessResult(done=done, skipped=skipped)
