from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import Date, cast, func, select
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
from janus_api.portfolio import compliance, details, schemas
from janus_api.portfolio.models import ComplianceFiling, ComplianceProfile, PortfolioTarget
from janus_api.support.models import SupportTicket

# A login may own this many companies, so a runaway script cannot create tenants without end.
MAX_COMPANIES = 20
CLOSED_TICKETS = ("resolved", "closed")


MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()


def _months_back(day: date, months: int) -> date:
    index = day.year * 12 + day.month - 1 - months
    return date(index // 12, index % 12 + 1, 1)


def period_for(key: str, today: date) -> schemas.Period:
    """The period to date, and the same number of days at the start of the period before it.

    Quarters and years follow the Indian financial year, which starts on 1 April. Comparing to date
    against the same days before keeps a half-finished month from looking like a fall.
    """
    if key == "week":
        # The seven days ending today, against the seven before: what the weekly digest reports.
        start = today - timedelta(days=6)
        before = start - timedelta(days=7)
        label = "Last 7 days"
    elif key == "fy":
        start = date(today.year if today.month >= 4 else today.year - 1, 4, 1)
        before = date(start.year - 1, 4, 1)
        label = f"FY {start.year}-{str(start.year + 1)[2:]}"
    elif key == "quarter":
        start = date(today.year, (today.month - 1) // 3 * 3 + 1, 1)
        before = _months_back(start, 3)
        quarter = (start.month - 4) % 12 // 3 + 1
        label = f"Q{quarter} ({MONTHS[start.month - 1]}-{MONTHS[(start.month + 1) % 12]})"
    else:
        start = today.replace(day=1)
        before = _months_back(start, 1)
        label = f"{MONTHS[start.month - 1]} {start.year}"
    elapsed = (today - start).days + 1
    return schemas.Period(
        key=key,
        label=label,
        start=start.isoformat(),
        end=today.isoformat(),
        previousStart=before.isoformat(),
        # Inclusive, like end: the same count of days into the period before, never past its end.
        previousEnd=(min(before + timedelta(days=elapsed), start) - timedelta(days=1)).isoformat(),
    )


def _ist_day(column: Any) -> Any:
    """The India date of a timestamp column."""
    return cast(func.timezone("Asia/Kolkata", column), Date)


async def period_figures(
    db: AsyncSession, tenant_id: int, start: date, end: date, *, money: bool
) -> schemas.PeriodFigures:
    """What happened between two days, both included, in India time."""
    leads = await db.scalar(
        select(func.count(Lead.id)).where(
            Lead.tenant_id == tenant_id, _ist_day(Lead.created_at).between(start, end)
        )
    )
    # Deals keep no date of winning. A won deal is rarely edited again,
    # so its last change stands in.
    won_count, won_value = (
        await db.execute(
            select(func.count(Deal.id), func.coalesce(func.sum(Deal.amount), 0)).where(
                Deal.tenant_id == tenant_id,
                Deal.stage == "won",
                _ist_day(Deal.updated_at).between(start, end),
            )
        )
    ).one()
    invoiced = collected = None
    if money:
        invoiced = rupees(
            int(
                await db.scalar(
                    select(func.coalesce(func.sum(FinanceInvoice.total_paise), 0)).where(
                        FinanceInvoice.tenant_id == tenant_id,
                        FinanceInvoice.invoice_date.between(start, end),
                    )
                )
                or 0
            )
        )
        collected = rupees(
            int(
                await db.scalar(
                    select(func.coalesce(func.sum(FinancePayment.amount_paise), 0)).where(
                        FinancePayment.tenant_id == tenant_id,
                        FinancePayment.paid_on.between(start, end),
                    )
                )
                or 0
            )
        )
    return schemas.PeriodFigures(
        leads=int(leads or 0),
        wonDeals=int(won_count),
        wonValue=str(Decimal(won_value).quantize(Decimal("0.01"))),
        invoiced=invoiced,
        collected=collected,
    )


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
    return schemas.MoneySummary(
        receivable=rupees(receivable),
        overdue=rupees(overdue),
        overdueInvoices=count,
        ageing=schemas.Ageing(
            days0to30=rupees(buckets[0]), days31to60=rupees(buckets[1]), over60=rupees(buckets[2])
        ),
        payable=rupees(payable),
        payableDueThisWeek=rupees(due_soon),
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
    db: AsyncSession,
    tenant: Tenant,
    current: bool,
    today: date,
    period: schemas.Period,
    *,
    money: bool,
    detail: bool = True,
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
    out = schemas.CompanySummary(
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
        period=schemas.PeriodCompare(
            current=await period_figures(
                db, tenant.id, date.fromisoformat(period.start), today, money=money
            ),
            previous=await period_figures(
                db,
                tenant.id,
                date.fromisoformat(period.previousStart),
                date.fromisoformat(period.previousEnd),
                money=money,
            ),
        ),
    )
    if not detail:
        return out
    staff = await details.people(db, tenant.id, today, money=money)
    stock = await details.stock(db, tenant.id, today, money=money)
    delivery = await details.delivery(db, tenant.id, today)
    support = await details.support(db, tenant.id, today)
    waiting = await details.approvals(db, tenant.id, staff)
    plan, dues = await compliance_view(db, tenant.id, today)
    out.people, out.stock, out.delivery, out.support = staff, stock, delivery, support
    out.approvals, out.compliancePlan, out.compliance = waiting, plan, dues
    out.targets = await targets_view(db, tenant.id, money=money)
    out.attention = details.attention(out.money, waiting, delivery, support, stock, dues)
    out.health = details.health(out.attention)
    return out


async def compliance_view(
    db: AsyncSession, tenant_id: int, today: date
) -> tuple[schemas.CompliancePlan, list[schemas.ComplianceDue]]:
    """The filing plan, and its dues from 90 days back to 30 ahead, marked filed or not."""
    profile = await db.scalar(
        select(ComplianceProfile).where(ComplianceProfile.tenant_id == tenant_id)
    )
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
    first, last = compliance.window(today)
    rules = compliance.Profile(profile.gst_filing, profile.tds, profile.pf_esi, profile.company)
    return plan, [
        schemas.ComplianceDue(
            key=due.key,
            label=due.label,
            period=due.period,
            area=due.area,
            dueOn=due.due_on.isoformat(),
            status=compliance.status(due.due_on, due.key in filed, today),
            filedOn=filed[due.key].isoformat() if due.key in filed else None,
            to="/portfolio?view=compliance",
        )
        for due in compliance.dues(rules, first, last)
    ]


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


async def summary(
    db: AsyncSession,
    user_id: int,
    current_tenant: int | None,
    ip: str | None,
    period_key: str = "month",
    today: date | None = None,
    *,
    detail: bool = True,
) -> schemas.PortfolioSummary:
    """Every company whose Portfolio this person may see: those they own, and those an Owner shared.

    Each is read on its own, under its own context, never across companies. Money is included only
    where the person's role there holds portfolio:finance.
    """
    companies = []
    # The digest reads as of the end of the week it reports; the page reads as of today.
    today = today or today_ist()
    period = period_for(period_key, today)
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
                    period,
                    money="portfolio:finance" in role.permissions,
                    detail=detail,
                )
            )
            record(db, "portfolio.company_read", user_id=user_id, tenant_id=tenant_id, ip=ip)
    finally:
        # Flushes the audit rows under the last company, then returns to the session's own company.
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
    return schemas.PortfolioSummary(period=period, companies=companies)


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


async def _enter(db: AsyncSession, user_id: int, company_id: str, need: str) -> int:
    """Moves the session's context into one company and checks the person's role there.

    `need` is "owner" or a permission. The caller returns the context to its own company.
    """
    if not company_id.isdigit():
        raise ApiError("not_found", "Company not found.", 404)
    tenant_id = int(company_id)
    if tenant_id not in await member_tenants(db, user_id, "portfolio:read"):
        raise ApiError("not_found", "Company not found.", 404)
    await set_context(db, user_id=user_id, tenant_id=tenant_id)
    _, role = await org.membership(db, user_id, tenant_id)
    allowed = role.name == "owner" if need == "owner" else need in role.permissions
    if not allowed:
        raise ApiError("forbidden", "Your role in this company cannot change this.", 403)
    return tenant_id


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
        tenant_id = await _enter(db, user_id, company_id, "owner")
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
        tenant_id = await _enter(db, user_id, company_id, "portfolio:finance")
        row = await db.scalar(
            select(ComplianceProfile).where(ComplianceProfile.tenant_id == tenant_id)
        )
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
        tenant_id = await _enter(db, user_id, company_id, "portfolio:finance")
        today = today_ist()
        if filed_on is not None and filed_on > today:
            raise ApiError("invalid_date", "A filing cannot be marked done in the future.", 422)
        profile = await db.scalar(
            select(ComplianceProfile).where(ComplianceProfile.tenant_id == tenant_id)
        )
        rules = (
            compliance.Profile(profile.gst_filing, profile.tds, profile.pf_esi, profile.company)
            if profile
            else None
        )
        known = rules and any(
            due.key == key
            for due in compliance.dues(
                rules, today - timedelta(days=400), today + timedelta(days=60)
            )
        )
        if not known:
            raise ApiError("not_found", "That filing is not in this company's calendar.", 404)
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
