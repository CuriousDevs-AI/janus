# ruff: noqa: E501  (the advice is prose; its sentences read better unbroken)
"""Janus as a business advisor: what it sees in one company's own figures, why that matters to an
owner, what to do this week, and a 30-day plan with a target the figures can confirm later.

Plain rules over the same company summary the Portfolio, the reports and the scheduled emails read,
so the Advisor page, Ask Janus and the morning brief always say the same thing. Written from how
small Indian businesses run: cash first, then collections, compliance, follow-up and the team.
Nothing here is guessed or forecast.
"""

from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

from janus_api.portfolio import schemas as portfolio
from janus_api.portfolio.periods import inr

Area = Literal["sales", "money", "compliance", "team", "operations"]
Severity = Literal["high", "medium", "low"]
AREA_NAMES: dict[str, str] = {
    "sales": "Sales",
    "money": "Money",
    "compliance": "Compliance",
    "team": "Team",
    "operations": "Operations",
}
_ORDER = {"high": 0, "medium": 1, "low": 2}


class Measure(BaseModel):
    """The figure a plan step moves: what it is now and the target, for checking later."""

    label: str
    now: float
    target: float
    better: Literal["lower", "higher"]
    money: bool = False


class Finding(BaseModel):
    # Stable, so a plan step committed to today can be checked again next week.
    id: str
    area: Area
    severity: Severity
    title: str
    sees: str
    matters: str
    action: str
    href: str
    plan: str
    measure: Measure


class AreaStatus(BaseModel):
    area: Area
    status: Literal["red", "amber", "green"]
    reason: str


class AdvisorOut(BaseModel):
    company: str
    areas: list[AreaStatus]
    findings: list[Finding]


def _n(value: str | None) -> Decimal:
    return Decimal(value or 0)


def _plural(count: int, one: str, many: str | None = None) -> str:
    return f"{count} {one if count == 1 else (many or one + 's')}"


def _crm(path: str) -> str:
    return f"{path}?workspace=crm-sales"


def _finance(view: str) -> str:
    return f"/workspace/finance-accounting?view={view}&workspace=finance-accounting"


def findings(company: portfolio.CompanySummary) -> list[Finding]:  # noqa: C901
    """Everything Janus would raise with the owner of this company, most serious first."""
    out: list[Finding] = []
    now, before = company.period.current, company.period.previous
    money, books = company.money, company.books.current if company.books else None
    compliance_page = f"/portfolio?view=compliance&company={company.id}"

    # Money: cash runway, won work not invoiced, overdue customers, losses, one big customer.
    runway = company.cash.runwayMonths if company.cash else None
    if runway is not None and runway < 3:
        out.append(
            Finding(
                id="cash-runway",
                area="money",
                severity="high" if runway < 1.5 else "medium",
                title="Cash runs short",
                sees=f"Cash in the bank covers about {runway:g} month{'' if runway == 1 else 's'} of spending.",
                matters="A business with less than three months of cash has no room for a late customer"
                " or a slow month; most small businesses that close run out of cash, not profit.",
                action="List every payment due in the next 30 days, collect the oldest overdue invoices"
                " first, and hold spending that can wait.",
                href=_finance("cash-flow"),
                plan="Lift cash to cover three months of spending.",
                measure=Measure(label="months of cash", now=runway, target=3, better="higher"),
            )
        )
    if money and books and _n(now.wonValue) > 0 and _n(books.netSales) == 0:
        out.append(
            Finding(
                id="won-not-invoiced",
                area="money",
                severity="high",
                title="Won deals are not invoiced",
                sees=f"Deals worth {inr(now.wonValue)} were won this period, but no invoice has been raised.",
                matters="Until it is invoiced, won work is not a sale: nobody owes you for it, no GST is"
                " accounted, and the clock to get paid has not started.",
                action="Raise the invoices for this period's won deals in Finance & Accounting.",
                href=_finance("invoices"),
                plan="Invoice every won deal within a day of winning it.",
                measure=Measure(
                    label="won but not invoiced",
                    now=float(_n(now.wonValue)),
                    target=0,
                    better="lower",
                    money=True,
                ),
            )
        )
    if money and _n(money.overdue) > 0:
        share = (
            round(_n(money.overdue) / _n(money.receivable) * 100) if _n(money.receivable) else 100
        )
        out.append(
            Finding(
                id="overdue-receivables",
                area="money",
                severity="high" if share >= 30 else "medium",
                title="Customers are paying late",
                sees=f"{inr(money.overdue)} is overdue on {_plural(money.overdueInvoices, 'invoice')},"
                f" {share}% of what customers owe.",
                matters="Money owed past its due date is cash you have already earned and are lending"
                " your customers for free; the older it gets, the less of it comes in.",
                action="Call the three largest overdue customers this week and agree a date for each.",
                href=_finance("receivables"),
                plan="Halve the overdue amount in 30 days.",
                measure=Measure(
                    label="overdue",
                    now=float(_n(money.overdue)),
                    target=float(round(_n(money.overdue) / 2)),
                    better="lower",
                    money=True,
                ),
            )
        )
    if books and _n(books.netSales) > 0 and _n(books.profitBeforePayroll) < 0:
        out.append(
            Finding(
                id="loss",
                area="money",
                severity="high",
                title="Selling at a loss",
                sees=f"Supplier bills of {inr(books.costs)} are more than sales of {inr(books.netSales)}"
                " this period, before salaries.",
                matters="More sales at today's prices would deepen the loss: the gap is in pricing or in"
                " costs, not in volume.",
                action="Check the margin on your three biggest sales and the three biggest bills; raise"
                " prices or cut the cost that does not pay back.",
                href=_finance("profit-loss"),
                plan="Bring the period back to a profit before salaries.",
                measure=Measure(
                    label="profit before salaries",
                    now=float(_n(books.profitBeforePayroll)),
                    target=0,
                    better="higher",
                    money=True,
                ),
            )
        )
    sales = sum((_n(item.current) for item in company.customers), Decimal(0))
    top = max(company.customers, key=lambda item: _n(item.current), default=None)
    if (
        top
        and sales > 0
        and len(company.customers) > 1
        and _n(top.current) / sales >= Decimal("0.4")
    ):
        share = round(_n(top.current) / sales * 100)
        out.append(
            Finding(
                id="customer-concentration",
                area="money",
                severity="medium",
                title="One customer carries the business",
                sees=f"{top.name} is {share}% of this period's sales.",
                matters="If one customer leaves, pays late or asks for a lower price, the whole business"
                " feels it at once.",
                action="Pick two more customers like your best one and put them in the pipeline this month.",
                href=_crm("/leads"),
                plan=f"Bring {top.name} under 40% of sales.",
                measure=Measure(
                    label=f"% of sales from {top.name}", now=share, target=40, better="lower"
                ),
            )
        )
    if not money:
        out.append(
            Finding(
                id="no-books",
                area="money",
                severity="medium",
                title="Money is not in Janus",
                sees="Janus has no invoices, payments or bills for this company, or your role does not"
                " include them.",
                matters="Without the books, Janus cannot tell you who owes you, whether you make a"
                " profit, or how long your cash lasts.",
                action="Switch on Finance & Accounting and record this month's invoices and bills.",
                href="/settings?tab=workspace&view=workspaces&workspace=business&activate=finance-accounting",
                plan="Keep this month's invoices and bills in Janus.",
                measure=Measure(label="books in Janus", now=0, target=1, better="higher"),
            )
        )

    # Compliance: nothing tracked, filings missed, registration gaps.
    if not company.complianceSetUp:
        out.append(
            Finding(
                id="compliance-off",
                area="compliance",
                severity="high",
                title="No filings are tracked",
                sees="Janus does not know which returns this company files, so it cannot warn you"
                " before a due date.",
                matters="A missed GST, TDS or PF return costs a late fee every day and interest on the"
                " tax, and repeated misses can block input credit or invite a notice.",
                action="Choose what the company files (GST, TDS, PF and the rest) so each due date is tracked.",
                href=compliance_page,
                plan="Track every filing the company owes.",
                measure=Measure(label="filings tracked", now=0, target=1, better="higher"),
            )
        )
    late = [item for item in company.compliance if item.status == "overdue"]
    if late:
        named = ", ".join(f"{item.label} for {item.period}" for item in late[:3])
        out.append(
            Finding(
                id="filings-overdue",
                area="compliance",
                severity="high",
                title="Filings are past due",
                sees=f"{_plural(len(late), 'filing')} past due: {named}.",
                matters="Late fees and interest grow each day a return is late, and a late GSTR-1 holds"
                " up your customers' input credit.",
                action="File the oldest one first, then mark it filed in Compliance.",
                href=compliance_page,
                plan="Clear every past-due filing.",
                measure=Measure(label="filings past due", now=len(late), target=0, better="lower"),
            )
        )
    gaps = [item for item in company.complianceGaps if item.kind == "missing"]
    if gaps:
        missing = ", ".join(item.text.rstrip(".") for item in gaps[:4])
        out.append(
            Finding(
                id="registration-gaps",
                area="compliance",
                severity="low",
                title="Registration details are missing",
                sees=f"Missing: {missing}.",
                matters="Janus decides which filings apply from the entity type, PAN and"
                " registrations; with gaps it can miss one.",
                action="Fill in the company's legal details in Business Settings.",
                href="/settings?tab=workspace&view=settings&workspace=business",
                plan="Complete the company's legal details.",
                measure=Measure(label="details missing", now=len(gaps), target=0, better="lower"),
            )
        )

    # Sales: follow-up, ownership, conversion, lead flow, a pipeline on one deal.
    quiet = company.crm.quietLeads
    if quiet > 0:
        out.append(
            Finding(
                id="quiet-leads",
                area="sales",
                severity="high" if quiet >= 3 else "medium",
                title="Leads are going cold",
                sees=f"{_plural(quiet, 'open lead')} had no call, message or move for 3 days or more.",
                matters="An enquiry answered within a day is far likelier to buy than one answered after"
                " a week; a quiet lead is usually a lost one.",
                action="Call each quiet lead today, or close the ones that are not real.",
                href=_crm("/leads"),
                plan="No open lead goes 3 days without a follow-up.",
                measure=Measure(label="quiet leads", now=quiet, target=0, better="lower"),
            )
        )
    unowned = sum(rep.openLeads for rep in company.reps if not rep.assigned)
    if unowned > 0:
        out.append(
            Finding(
                id="unowned-leads",
                area="team",
                severity="medium",
                title="Leads have no owner",
                sees=f"{_plural(unowned, 'open lead')} belong{'s' if unowned == 1 else ''} to nobody.",
                matters="A lead everyone can see and nobody owns is a lead nobody calls.",
                action="Give each open lead an owner in CRM & Sales.",
                href=_crm("/leads"),
                plan="Every open lead has an owner.",
                measure=Measure(label="leads with no owner", now=unowned, target=0, better="lower"),
            )
        )
    funnel = company.funnel.current if company.funnel else None
    if funnel and funnel.leads >= 5 and round(funnel.won / funnel.leads * 100) < 15:
        rate = round(funnel.won / funnel.leads * 100)
        out.append(
            Finding(
                id="low-conversion",
                area="sales",
                severity="medium",
                title="Few leads become sales",
                sees=f"{funnel.won} of this period's {funnel.leads} leads have been won ({rate}%);"
                f" {funnel.lost} lost.",
                matters="Winning more of the leads you already pay for is the cheapest growth there is.",
                action="Read the lost reasons on this period's lost deals and fix the most common one"
                " (price, speed or fit).",
                href=_crm("/deals"),
                plan="Raise conversion to 20% of leads.",
                measure=Measure(label="% of leads won", now=rate, target=20, better="higher"),
            )
        )
    if before.leads >= 5 and now.leads < before.leads * 0.7:
        out.append(
            Finding(
                id="lead-drop",
                area="sales",
                severity="medium",
                title="Fewer leads are coming in",
                sees=f"{now.leads} leads this period against {before.leads} in the same days before.",
                matters="Fewer enquiries today are fewer sales next month.",
                action="Check which channel fell in the Lead sources report and restart it.",
                href="/analytics?workspace=business&tab=library&report=lead-sources",
                plan=f"Get back to {before.leads} leads a period.",
                measure=Measure(
                    label="leads this period", now=now.leads, target=before.leads, better="higher"
                ),
            )
        )
    if company.crm.openDeals == 1 and _n(company.crm.pipelineValue) > 0:
        out.append(
            Finding(
                id="thin-pipeline",
                area="sales",
                severity="low",
                title="The pipeline rests on one deal",
                sees=f"Your whole open pipeline is one deal worth {inr(company.crm.pipelineValue)}.",
                matters="If that deal slips, next month has nothing behind it.",
                action="Turn two more of this period's leads into deals with a value and a close date.",
                href=_crm("/deals"),
                plan="Keep at least three open deals.",
                measure=Measure(label="open deals", now=1, target=3, better="higher"),
            )
        )

    # Team and operations.
    if company.members <= 1:
        out.append(
            Finding(
                id="single-person",
                area="team",
                severity="low",
                title="Only one person can sign in",
                sees="You are the only member of this company in Janus.",
                matters="If you are away or lose access to your email, nobody can approve, invoice or"
                " answer customers.",
                action="Invite a trusted partner or manager as an Admin.",
                href="/settings?tab=team&workspace=business",
                plan="Have a second person who can run the business in Janus.",
                measure=Measure(
                    label="people who can sign in", now=company.members, target=2, better="higher"
                ),
            )
        )
    support = company.support
    if support and (support.urgent > 0 or support.olderThanWeek > 0):
        out.append(
            Finding(
                id="support-backlog",
                area="operations",
                severity="high" if support.urgent else "medium",
                title="Customers are waiting on support",
                sees=f"{_plural(support.urgent, 'urgent ticket')} and"
                f" {_plural(support.olderThanWeek, 'ticket')} open for over a week.",
                matters="An unanswered complaint is the most common reason a customer does not buy again.",
                action="Answer the urgent tickets today and give each week-old one a reply and a date.",
                href="/tickets?workspace=customer-support",
                plan="No ticket waits more than a week.",
                measure=Measure(
                    label="week-old tickets", now=support.olderThanWeek, target=0, better="lower"
                ),
            )
        )
    if company.stock and company.stock.belowReorder > 0:
        out.append(
            Finding(
                id="low-stock",
                area="operations",
                severity="medium",
                title="Stock is running low",
                sees=f"{_plural(company.stock.belowReorder, 'item')} at or under the reorder level.",
                matters="Running out of a selling item loses the sale and often the customer.",
                action="Raise purchase orders for the items under their reorder level.",
                href="/workspace/operations-inventory?view=inventory&workspace=operations-inventory",
                plan="No item under its reorder level.",
                measure=Measure(
                    label="items under reorder",
                    now=company.stock.belowReorder,
                    target=0,
                    better="lower",
                ),
            )
        )
    if company.delivery and company.delivery.lateProjects > 0:
        out.append(
            Finding(
                id="late-projects",
                area="operations",
                severity="medium",
                title="Projects are running late",
                sees=f"{_plural(company.delivery.lateProjects, 'project')} past the end date,"
                f" {_plural(company.delivery.overdueTasks, 'task')} overdue.",
                matters="Late delivery delays the invoice that depends on it and strains the customer.",
                action="Agree a new date with each late project's customer and the one task that unblocks it.",
                href="/workspace/projects-delivery?view=projects&workspace=projects-delivery",
                plan="No project past its end date.",
                measure=Measure(
                    label="late projects",
                    now=company.delivery.lateProjects,
                    target=0,
                    better="lower",
                ),
            )
        )
    return sorted(out, key=lambda item: _ORDER[item.severity])


def areas(found: list[Finding]) -> list[AreaStatus]:
    """How each area stands: the worst finding in it, or on track."""
    out = []
    for area in AREA_NAMES:
        worst = next((item for item in found if item.area == area), None)
        status: Literal["red", "amber", "green"] = (
            "green" if worst is None else "red" if worst.severity == "high" else "amber"
        )
        out.append(
            AreaStatus(
                area=area, status=status, reason=worst.title if worst else "Nothing here needs you."
            )
        )
    return out


def advise(company: portfolio.CompanySummary) -> AdvisorOut:
    found = findings(company)
    return AdvisorOut(company=company.name, areas=areas(found), findings=found)
