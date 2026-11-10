"""The Portfolio itself: every company a person may see, each read on its own under its own context.

Portfolio owns no business records. It asks each module for its figures through that module's
`overview` functions and puts them side by side; it never reads another module's tables.
"""

from datetime import date, timedelta
from decimal import Decimal
from typing import NamedTuple

from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.service import record
from janus_api.business import overview as business
from janus_api.core.tenancy import set_context
from janus_api.crm import overview as crm
from janus_api.finance import overview as finance
from janus_api.hr import overview as hr
from janus_api.it import overview as it
from janus_api.operations import overview as operations
from janus_api.org import overview as org
from janus_api.org import service as org_service
from janus_api.portfolio import attention, preferences, schemas
from janus_api.portfolio.access import readable_companies
from janus_api.portfolio.compliance import plan as compliance_plan
from janus_api.portfolio.compliance.plan import compliance_view
from janus_api.portfolio.periods import period_for, rupees, today_ist
from janus_api.portfolio.targets import targets_view
from janus_api.projects import overview as projects
from janus_api.support import overview as support
from janus_api.vault import overview as vault


class Trade(NamedTuple):
    """A company's sales by customer and bills by vendor, in the period and the same days before,
    kept while the summary is built so sales between the companies can be taken out."""

    sales_now: dict[str, int]
    bills_now: dict[str, int]
    sales_before: dict[str, int]
    bills_before: dict[str, int]


HR = "/workspace/hr-people"
FINANCE = "/workspace/finance-accounting"
# Each kind of approval: its name for many and for one, and where it is decided.
APPROVALS: dict[str, tuple[str, str, str]] = {
    "leave": ("Leave requests", "Leave request", f"{HR}?view=approvals&workspace=hr-people"),
    "claims": ("Expense claims", "Expense claim", f"{HR}?view=expenses&workspace=hr-people"),
    "funds": (
        "Fund requests",
        "Fund request",
        f"{FINANCE}?view=funds&workspace=finance-accounting",
    ),
    "credit_notes": (
        "Credit notes",
        "Credit note",
        f"{FINANCE}?view=credit-notes&workspace=finance-accounting",
    ),
    "vendor_banks": (
        "Supplier bank details",
        "Supplier bank detail",
        f"{FINANCE}?view=approvals&workspace=finance-accounting",
    ),
    "stock_adjustments": (
        "Stock adjustments",
        "Stock adjustment",
        "/workspace/operations-inventory?workspace=operations-inventory",
    ),
    "requisitions": (
        "Purchase requisitions",
        "Purchase requisition",
        "/workspace/operations-inventory?workspace=operations-inventory",
    ),
    "project_changes": (
        "Project changes",
        "Project change",
        "/workspace/projects-delivery?workspace=projects-delivery",
    ),
    "it_changes": (
        "IT changes",
        "IT change",
        "/workspace/it-infrastructure?workspace=it-infrastructure",
    ),
    "workflow_runs": ("Workflow runs", "Workflow run", "/approvals"),
}


async def period_figures(
    db: AsyncSession, tenant_id: int, start: date, end: date, *, money: bool
) -> schemas.PeriodFigures:
    """What happened between two days, both included, in India time."""
    sales = await crm.activity(db, tenant_id, start, end)
    flow = await finance.flow(db, tenant_id, start, end) if money else None
    return schemas.PeriodFigures(
        leads=sales.leads,
        wonDeals=sales.won_deals,
        wonValue=rupees(sales.won_value),
        invoiced=rupees(flow.invoiced, paise=True) if flow else None,
        collected=rupees(flow.collected, paise=True) if flow else None,
    )


async def money_summary(db: AsyncSession, tenant_id: int, today: date) -> schemas.MoneySummary:
    owed = await finance.money(db, tenant_id, today)
    return schemas.MoneySummary(
        receivable=rupees(owed.receivable, paise=True),
        overdue=rupees(owed.overdue, paise=True),
        overdueInvoices=owed.overdue_invoices,
        ageing=schemas.Ageing(
            days0to30=rupees(owed.late_0_30, paise=True),
            days31to60=rupees(owed.late_31_60, paise=True),
            over60=rupees(owed.late_over_60, paise=True),
        ),
        payable=rupees(owed.payable, paise=True),
        payableLate=rupees(owed.payable_late, paise=True),
        payableDueThisWeek=rupees(owed.payable_due_this_week, paise=True),
    )


async def approvals(db: AsyncSession, tenant_id: int, staff: hr.People) -> list[schemas.Approval]:
    """Everything in the company waiting on a decision, by kind, with where to decide it."""
    counts = {
        "leave": staff.pending_leave,
        "claims": staff.pending_claims,
        **await finance.pending_approvals(db, tenant_id),
        "vendor_banks": await vault.pending_bank_details(db, tenant_id),
        **await operations.pending_approvals(db, tenant_id),
        "project_changes": await projects.pending_changes(db, tenant_id),
        "it_changes": await it.pending_changes(db, tenant_id),
        "workflow_runs": await business.pending_workflow_runs(db, tenant_id),
    }
    return [
        schemas.Approval(kind=kind, label=label, one=one, count=counts[kind], to=to)
        for kind, (label, one, to) in APPROVALS.items()
        if counts[kind]
    ]


async def company_summary(
    db: AsyncSession,
    company: org.Company,
    current: bool,
    today: date,
    period: schemas.Period,
    *,
    money: bool,
    detail: bool = True,
    trade: dict[int, Trade] | None = None,
    limits: schemas.Thresholds | None = None,
) -> schemas.CompanySummary:
    """One company's headline numbers, and with `detail` its operating view.

    The caller has set this company's context, so row-level security applies to every query.
    """
    tenant_id = company.id
    sales = await crm.pipeline(db, tenant_id)
    out = schemas.CompanySummary(
        id=str(tenant_id),
        name=company.name,
        industry=company.industry,
        companySize=company.company_size,
        createdAt=company.created_on.isoformat(),
        current=current,
        members=await org.active_member_count(db, tenant_id),
        openTickets=await support.open_count(db, tenant_id),
        crm=schemas.CrmSummary(
            leads=sales.leads,
            openDeals=sales.open_deals,
            wonDeals=sales.won_deals,
            lostDeals=sales.lost_deals,
            pipelineValue=str(sales.pipeline_value),
            wonValue=str(sales.won_value),
        ),
        money=await money_summary(db, tenant_id, today) if money else None,
        period=schemas.PeriodCompare(
            current=await period_figures(
                db, tenant_id, date.fromisoformat(period.start), today, money=money
            ),
            previous=await period_figures(
                db,
                tenant_id,
                date.fromisoformat(period.previousStart),
                date.fromisoformat(period.previousEnd),
                money=money,
            ),
        ),
    )
    if not detail:
        return out
    # Payroll, claim amounts and stock value are money: shown only where the role includes it.
    staff = await hr.people(db, tenant_id, today)
    goods = await operations.stock(db, tenant_id, today)
    work = await projects.delivery(db, tenant_id, today)
    tickets = await support.tickets(db, tenant_id, today)
    out.people = schemas.People(
        headcount=staff.headcount,
        onLeaveToday=staff.on_leave_today,
        pendingLeave=staff.pending_leave,
        pendingClaims=staff.pending_claims,
        monthlyPayroll=rupees(staff.monthly_payroll) if money else None,
        claimsValue=rupees(staff.claims_value) if money else None,
    )
    out.stock = schemas.Stock(
        items=goods.items,
        belowReorder=goods.below_reorder,
        expiringBatches=goods.expiring_batches,
        dispatchesInTransit=goods.dispatches_in_transit,
        stockValue=rupees(goods.stock_value, paise=True) if money else None,
    )
    out.delivery = schemas.Delivery(
        activeProjects=work.active_projects,
        lateProjects=work.late_projects,
        overdueMilestones=work.overdue_milestones,
        overdueTasks=work.overdue_tasks,
        awaitingAcceptance=work.awaiting_acceptance,
        awaitingAcceptanceValue=rupees(work.awaiting_acceptance_value),
    )
    out.support = schemas.Support(
        open=tickets.open,
        urgent=tickets.urgent,
        escalated=tickets.escalated,
        olderThanWeek=tickets.older_than_week,
    )
    out.approvals = await approvals(db, tenant_id, staff)
    out.compliancePlan, out.compliance = await compliance_view(db, tenant_id, today)
    out.registration = await compliance_plan.registration(db, tenant_id)
    out.complianceGaps = compliance_plan.gaps(
        out.compliancePlan, out.registration, staff.headcount, staff.monthly_payroll > 0
    )
    out.targets = await targets_view(db, tenant_id, money=money)
    out.attention = attention.attention(
        out.money, out.approvals, out.delivery, out.support, out.stock, out.compliance, limits
    )
    # A company tracking no filings is not "up to date": it is not set up. With people on its
    # payroll, TDS and PF or ESI usually apply, so that is urgent.
    out.complianceSetUp = compliance_plan.set_up(out.compliancePlan, out.registration)
    everything, since = await compliance_plan.register(db, tenant_id, today)
    out.unfiledCount = sum(due.status == "overdue" for due in everything)
    out.unfiledSince = since.isoformat()
    if money and out.compliancePlan.gstFiling != "none":
        out.gst = await gst_position(db, tenant_id, today, out.compliancePlan.gstin)
    if not out.complianceSetUp and (staff.headcount or sales.leads or out.money):
        out.attention = attention.with_line(
            out.attention,
            "high" if staff.headcount else "medium",
            "Compliance not set up: no filings are tracked"
            + (f" for {staff.headcount} people on the payroll" if staff.headcount else ""),
            "/portfolio?view=compliance",
        )
    out.health = attention.health(out.attention)
    span_now = date.fromisoformat(period.start), today
    span_before = date.fromisoformat(period.previousStart), date.fromisoformat(period.previousEnd)
    channels_now = await crm.leads_by_source(db, tenant_id, *span_now)
    channels_before = await crm.leads_by_source(db, tenant_id, *span_before)
    out.leadSources = sorted(
        (
            schemas.SourceMove(
                source=source,
                current=channels_now.get(source, 0),
                previous=channels_before.get(source, 0),
            )
            for source in channels_now.keys() | channels_before.keys()
        ),
        key=lambda item: (-max(item.current, item.previous), item.source),
    )
    if money:
        out.books = schemas.BooksCompare(
            current=await books_for(db, tenant_id, *span_now),
            previous=await books_for(db, tenant_id, *span_before),
        )
        # Salaries are not booked yet, so a company can show a profit on its bills and still lose
        # money once its people are paid. Estimate the period's salaries from the monthly ones on
        # record and say so when that turns the period into a loss.
        if staff.headcount and staff.monthly_payroll > 0:
            days = (span_now[1] - span_now[0]).days + 1
            salaries = staff.monthly_payroll * days / Decimal("30.44")
            after = Decimal(out.books.current.profitBeforePayroll) - salaries
            if after < 0:
                out.attention = attention.with_loss(out.attention, after)
                out.health = attention.health(out.attention)
        sales_now = await finance.sales_by_customer(db, tenant_id, *span_now)
        sales_before = await finance.sales_by_customer(db, tenant_id, *span_before)
        # The customers who moved most, so a change in sales can be explained by name.
        out.customers = [
            schemas.CustomerMove(
                name=name,
                current=rupees(sales_now.get(name, 0), paise=True),
                previous=rupees(sales_before.get(name, 0), paise=True),
            )
            for name in sorted(
                sales_now.keys() | sales_before.keys(),
                key=lambda name: -max(sales_now.get(name, 0), sales_before.get(name, 0)),
            )[:8]
        ]
        if trade is not None:
            trade[tenant_id] = Trade(
                sales_now,
                await finance.costs_by_vendor(db, tenant_id, *span_now),
                sales_before,
                await finance.costs_by_vendor(db, tenant_id, *span_before),
            )
    return out


async def gst_month(db: AsyncSession, tenant_id: int, first: date, last: date) -> schemas.GstMonth:
    figures = await finance.gst(db, tenant_id, first, last)
    return schemas.GstMonth(
        month=f"{first:%Y-%m}",
        label=f"{first:%b %Y}",
        output=rupees(figures.output, paise=True),
        input=rupees(figures.input, paise=True),
        payable=rupees(figures.output - figures.input, paise=True),
        billsWithoutGst=figures.bills_without_gst,
    )


async def gst_position(
    db: AsyncSession, tenant_id: int, today: date, gstin: str | None
) -> schemas.GstPosition:
    """GST for last month (what GSTR-3B pays on the 20th) and this month so far, per GSTIN; a
    company has one GSTIN in Janus."""
    this_start = today.replace(day=1)
    last_end = this_start - timedelta(days=1)
    return schemas.GstPosition(
        gstin=gstin,
        lastMonth=await gst_month(db, tenant_id, last_end.replace(day=1), last_end),
        thisMonth=await gst_month(db, tenant_id, this_start, today),
    )


async def books_for(db: AsyncSession, tenant_id: int, start: date, end: date) -> schemas.Books:
    kept = await finance.books(db, tenant_id, start, end)
    flow = await finance.flow(db, tenant_id, start, end)
    return schemas.Books(
        netSales=rupees(kept.net_sales, paise=True),
        costs=rupees(kept.costs, paise=True),
        profitBeforePayroll=rupees(kept.net_sales - kept.costs, paise=True),
        moneyIn=rupees(flow.collected, paise=True),
        moneyOut=rupees(kept.paid_out, paise=True),
    )


def intercompany(companies: list[schemas.CompanySummary], trade: dict[int, Trade]) -> None:
    """Marks each company's sales to, and bills from, the other companies shown together, in the
    period and in the same days before, by matching the name on the invoice or bill to a company's
    name. Only companies whose money the person sees take part, so no total reveals a company they
    cannot see. Both periods are matched the same way, so a group growth rate compares like with
    like."""
    names = {item.name.strip().casefold(): item for item in companies if int(item.id) in trade}
    for item in companies:
        if int(item.id) not in trade:
            continue
        own = item.name.strip().casefold()

        def ours(amounts: dict[str, int], own: str = own) -> dict[str, int]:
            return {
                name: amount
                for name, amount in amounts.items()
                if name.strip().casefold() in names and name.strip().casefold() != own
            }

        books = trade[int(item.id)]
        sold, bought = ours(books.sales_now), ours(books.bills_now)
        item.intercompany = schemas.Intercompany(
            sales=rupees(sum(sold.values()), paise=True),
            purchases=rupees(sum(bought.values()), paise=True),
            salesBefore=rupees(sum(ours(books.sales_before).values()), paise=True),
            purchasesBefore=rupees(sum(ours(books.bills_before).values()), paise=True),
            partners=sorted({names[name.strip().casefold()].name for name in [*sold, *bought]}),
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
    trade: dict[int, Trade] = {}
    # The digest reads as of the end of the week it reports; the page reads as of today.
    today = today or today_ist()
    period = period_for(period_key, today)
    # When a company turns red is this person's own setting.
    await set_context(db, user_id=user_id, tenant_id=current_tenant)
    limits = (await preferences.read(db, user_id)).thresholds
    try:
        for tenant_id in await readable_companies(db, user_id):
            await set_context(db, user_id=user_id, tenant_id=tenant_id)
            # Re-check the role under this company's context before reading anything.
            _, role = await org_service.membership(db, user_id, tenant_id)
            company = await org.company(db, tenant_id)
            if "portfolio:read" not in role.permissions or company is None:
                continue
            companies.append(
                await company_summary(
                    db,
                    company,
                    tenant_id == current_tenant,
                    today,
                    period,
                    money="portfolio:finance" in role.permissions,
                    detail=detail,
                    trade=trade,
                    limits=limits,
                )
            )
            record(db, "portfolio.company_read", user_id=user_id, tenant_id=tenant_id, ip=ip)
    finally:
        # Flushes the audit rows under the last company, then returns to the session's own company.
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
    intercompany(companies, trade)
    return schemas.PortfolioSummary(period=period, companies=companies)
