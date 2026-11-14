"""The figures for each ready-made Business Report, from the company's own records.

They are read from the same summary the Portfolio shows (portfolio.summary), so a report, the
Portfolio and the email a schedule sends never disagree. A report the records cannot fill, or whose
records the person's role does not include, has no figures rather than made-up ones.
"""

import math
from decimal import Decimal
from typing import Literal
from urllib.parse import urlencode

from pydantic import BaseModel

from janus_api.portfolio import schemas as portfolio
from janus_api.portfolio.periods import inr

# Every report in the library, by id, with its name. The page lists them in this order.
NAMES: dict[str, str] = {
    "sales-summary": "Sales summary",
    "sales-pipeline": "Pipeline",
    "conversion-funnel": "Conversion funnel",
    "rep-performance": "Rep performance",
    "lead-sources": "Lead sources",
    "profit-loss": "Profit & Loss",
    "cash-flow": "Cash flow",
    "receivables-aging": "Receivables aging",
    "expenses": "Expenses",
    "gst-summary": "GST summary",
    "headcount": "Headcount",
    "attendance-leave": "Attendance & leave",
    "payroll-cost": "Payroll cost",
    "tickets-sla": "Tickets & SLA",
    "stock-levels": "Stock levels",
    "project-status": "Project status",
}


# The AI Agents: scheduled briefs that watch the business and email what they find. They are
# emailed like reports, but are not in the library.
AGENT_NAMES: dict[str, str] = {
    "health-brief": "Business health brief",
    "monthly-review": "Monthly business review",
}
ALL_NAMES = {**NAMES, **AGENT_NAMES}
SEVERITY = {"high": "Needs you now", "medium": "Needs you soon", "low": "Worth a look"}


class Row(BaseModel):
    label: str
    value: str
    before: str | None = None
    change: str | None = None
    href: str | None = None
    warn: bool = False


class Figures(BaseModel):
    covers: Literal["period", "now", "month"]
    rows: list[Row]
    note: str | None = None


def _n(value: str | None) -> Decimal:
    return Decimal(value or 0)


def _round(value: float) -> int:
    """Half up, as the page's Math.round does."""
    return math.floor(value + 0.5)


def change(current: Decimal | int, previous: Decimal | int) -> str:
    """The change against the same days before, in words a reader can check against the figures."""
    if previous == 0:
        return "Same as before" if current == 0 else "None in the same days before"
    percent = _round(float((Decimal(current) - Decimal(previous)) / Decimal(previous) * 100))
    if percent == 0:
        return "Same as before"
    return f"{'+' if percent > 0 else ''}{percent}% on the same days before"


def _day(iso: str) -> str:
    year, month, day = (int(part) for part in iso.split("-"))
    months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()
    return f"{day} {months[month - 1]} {year}"


def workspace(name: str, view: str, **extra: str) -> str:
    return f"/workspace/{name}?{urlencode({'view': view, 'workspace': name, **extra})}"


def _finance(view: str, **extra: str) -> str:
    return workspace("finance-accounting", view, **extra)


def _crm(path: str) -> str:
    return f"{path}?workspace=crm-sales"


def _money(label: str, now: str | None, before: str | None, href: str | None = None) -> Row:
    a, b = _n(now), _n(before)
    # A percentage on a loss or a nil base misleads (−250%), so a net figure moves by rupees.
    if b < 0 or (a < 0 < b):
        moved = "Same as before" if a == b else f"{'Up' if a > b else 'Down'} {inr(abs(a - b))}"
    else:
        moved = change(a, b)
    return Row(label=label, value=inr(a), before=inr(b), change=moved, href=href)


def _count(label: str, now: int, before: int, href: str | None = None) -> Row:
    return Row(
        label=label, value=str(now), before=str(before), change=change(now, before), href=href
    )


def _health(company: portfolio.CompanySummary) -> Figures:
    """What needs the owner today, then the figures behind a healthy business."""
    rows = [
        Row(label=SEVERITY[item.severity], value=item.text, warn=item.severity == "high")
        for item in company.attention[:6]
    ] or [Row(label="Needs you", value="Nothing urgent today")]
    books, owed, cash = company.books, company.money, company.cash
    if books:
        rows.append(
            _money("Sales this month so far", books.current.netSales, books.previous.netSales)
        )
    if owed:
        rows.append(
            Row(
                label="Customers owe",
                value=inr(owed.receivable),
                change=f"{inr(owed.overdue)} overdue on {owed.overdueInvoices} invoices",
                warn=_n(owed.overdue) > 0,
            )
        )
    if cash and cash.total is not None:
        runway = cash.runwayMonths
        rows.append(
            Row(
                label=f"Cash in the bank, {_day(cash.asOf)}",
                value=inr(cash.total),
                change=f"Lasts about {runway:g} months" if runway is not None else None,
            )
        )
    # Filings past due or due this week are already among what needs the owner, above.
    waiting = sum(item.count for item in company.approvals)
    if waiting:
        rows.append(Row(label="Waiting for a decision", value=f"{waiting} approvals"))
    return Figures(covers="now", rows=rows)


def _review(company: portfolio.CompanySummary) -> Figures:
    """The last full month against the month before: sales, money, customers and people."""
    now, before = company.period.current, company.period.previous
    books = company.books
    rows = [
        _count("Leads in", now.leads, before.leads),
        _count("Deals won", now.wonDeals, before.wonDeals),
        _money("Won value", now.wonValue, before.wonValue),
    ]
    if books:
        rows += [
            _money("Sales before GST", books.current.netSales, books.previous.netSales),
            _money("Collected", now.collected, before.collected),
            _money("Supplier bills", books.current.costs, books.previous.costs),
            _money(
                "Profit before salaries",
                books.current.profitBeforePayroll,
                books.previous.profitBeforePayroll,
            ),
        ]
    if company.customers:
        top = max(company.customers, key=lambda item: _n(item.current))
        rows.append(_money(f"Biggest customer: {top.name}", top.current, top.previous))
    if company.people:
        rows.append(Row(label="People", value=str(company.people.headcount)))
    for row in rows:
        if row.change:
            row.change = row.change.replace("the same days before", "the month before")
    return Figures(covers="period", rows=rows)


def _share(part: int, whole: int) -> str:
    return f"{part} · {_round(part * 100 / whole)}%" if whole else str(part)


def _funnel(funnel: portfolio.FunnelCompare | None) -> Figures | None:
    """How far this period's leads have got, beside the same days before."""
    if not funnel:
        return None
    now, before = funnel.current, funnel.previous

    def step(label: str, key: str) -> Row:
        current, previous = getattr(now, key), getattr(before, key)
        return Row(
            label=label,
            value=_share(current, now.leads),
            before=_share(previous, before.leads),
            href=_crm("/leads"),
        )

    won_rate = now.won * 100 / now.leads if now.leads else 0
    won_before = before.won * 100 / before.leads if before.leads else 0
    rows = [
        _count("Leads in", now.leads, before.leads, _crm("/leads")),
        step("Qualified or further", "qualified"),
        step("Proposal or further", "proposal"),
        step("Won", "won"),
        step("Lost", "lost"),
    ]
    rows[3].warn = bool(before.leads and now.leads and won_rate < won_before)
    return Figures(
        covers="period",
        rows=rows,
        note="Counts the leads that came in during the period by how far each has got by today, so"
        " a recent period has had less time to close.",
    )


def _reps(reps: list[portfolio.RepLine]) -> Figures | None:
    """Each lead owner's new leads, wins and open leads; leads nobody owns are flagged."""
    if not reps:
        return None
    rows = []
    for rep in reps:
        won = f"{rep.won} won · {inr(rep.wonValue)}" if rep.won else "none won"
        rows.append(
            Row(
                label=rep.name,
                value=f"{rep.leads} new · {won} · {rep.openLeads} open",
                href=_crm("/leads"),
                warn=not rep.assigned and rep.openLeads > 0,
            )
        )
    unowned = next((rep for rep in reps if not rep.assigned and rep.openLeads), None)
    return Figures(
        covers="period",
        rows=rows,
        note=(
            f"{unowned.openLeads} open"
            + (" lead has" if unowned.openLeads == 1 else " leads have")
            + " no owner, so nobody is answerable for following them up. Assign them in CRM."
            if unowned
            else "New leads and deals won are for the period; open leads are as of today."
        ),
    )


def figures(report: str, company: portfolio.CompanySummary) -> Figures | None:  # noqa: C901
    if report == "health-brief":
        return _health(company)
    if report == "monthly-review":
        return _review(company)
    now, before = company.period.current, company.period.previous
    books, owed = company.books, company.money
    if report == "sales-summary":
        rows = [
            _count("Leads in", now.leads, before.leads, _crm("/leads")),
            _count("Deals won", now.wonDeals, before.wonDeals, _crm("/deals")),
            _money("Won value", now.wonValue, before.wonValue, _crm("/deals")),
        ]
        if books:
            rows.append(
                _money(
                    "Sales before GST",
                    books.current.netSales,
                    books.previous.netSales,
                    _finance("invoices"),
                )
            )
        return Figures(covers="period", rows=rows)
    if report == "sales-pipeline":
        crm = company.crm
        return Figures(
            covers="now",
            rows=[
                Row(label="Open deals", value=str(crm.openDeals), href=_crm("/deals")),
                Row(label="Open pipeline", value=inr(crm.pipelineValue), href=_crm("/deals")),
                Row(label="Won, all time", value=f"{crm.wonDeals} · {inr(crm.wonValue)}"),
                Row(label="Lost, all time", value=str(crm.lostDeals)),
            ],
        )
    if report == "conversion-funnel":
        return _funnel(company.funnel)
    if report == "rep-performance":
        return _reps(company.reps)
    if report == "lead-sources":
        if not company.leadSources:
            return None
        ordered = sorted(company.leadSources, key=lambda item: -item.current)
        return Figures(
            covers="period",
            rows=[
                _count(
                    (item.source[:1].upper() + item.source[1:]).replace("_", " "),
                    item.current,
                    item.previous,
                    _crm("/leads"),
                )
                for item in ordered
            ],
        )
    if report == "profit-loss":
        if not books:
            return None
        cur, prev = books.current, books.previous
        profit = _money(
            "Profit before salaries",
            cur.profitBeforePayroll,
            prev.profitBeforePayroll,
            _finance("profit-loss"),
        )
        profit.warn = _n(cur.profitBeforePayroll) < 0
        rows = [
            _money("Sales before GST", cur.netSales, prev.netSales, _finance("invoices")),
            _money("Supplier bills", cur.costs, prev.costs, _finance("payables")),
            profit,
        ]
        if cur.salariesComplete:
            after = _money(
                "Profit after salaries",
                str(_n(cur.profitBeforePayroll) - _n(cur.salariesPosted)),
                str(_n(prev.profitBeforePayroll) - _n(prev.salariesPosted)),
            )
            after.warn = _n(cur.profitBeforePayroll) < _n(cur.salariesPosted)
            rows += [_money("Salaries posted", cur.salariesPosted, prev.salariesPosted), after]
        note = (
            None
            if cur.salariesComplete
            else "Salaries are not posted to the books for every month in this period, so profit"
            " after salaries is not shown."
        )
        return Figures(covers="period", rows=rows, note=note)
    if report == "cash-flow":
        if not books:
            return None
        cur, prev = books.current, books.previous
        net = _money(
            "Net cash flow",
            str(_n(cur.moneyIn) - _n(cur.moneyOut)),
            str(_n(prev.moneyIn) - _n(prev.moneyOut)),
        )
        net.warn = _n(cur.moneyIn) < _n(cur.moneyOut)
        rows = [
            _money("Money in", cur.moneyIn, prev.moneyIn, _finance("cash-flow")),
            _money("Money out", cur.moneyOut, prev.moneyOut, _finance("cash-flow")),
            net,
        ]
        cash = company.cash
        if cash and cash.total is not None:
            runway = cash.runwayMonths
            rows.append(
                Row(
                    label=f"Cash in the bank, {_day(cash.asOf)}",
                    value=inr(cash.total),
                    change=f"Lasts about {runway:g} months" if runway is not None else None,
                )
            )
        return Figures(covers="period", rows=rows)
    if report == "receivables-aging":
        if not owed:
            return None
        return Figures(
            covers="now",
            rows=[
                Row(
                    label="Customers owe", value=inr(owed.receivable), href=_finance("receivables")
                ),
                Row(
                    label="Overdue",
                    value=inr(owed.overdue),
                    change=f"{owed.overdueInvoices} invoices",
                    href=_finance("invoices", status="overdue"),
                    warn=_n(owed.overdue) > 0,
                ),
                Row(
                    label="Overdue up to 30 days",
                    value=inr(owed.ageing.days0to30),
                    href=_finance("receivables"),
                ),
                Row(
                    label="Overdue 31–60 days",
                    value=inr(owed.ageing.days31to60),
                    href=_finance("receivables", aging="31–60 days"),
                ),
                Row(
                    label="Overdue over 60 days",
                    value=inr(owed.ageing.over60),
                    href=_finance("receivables"),
                    warn=_n(owed.ageing.over60) > 0,
                ),
            ],
        )
    if report == "expenses":
        if not books or not owed:
            return None
        return Figures(
            covers="period",
            rows=[
                _money(
                    "Supplier bills",
                    books.current.costs,
                    books.previous.costs,
                    _finance("payables"),
                ),
                Row(label="You owe suppliers", value=inr(owed.payable), href=_finance("payables")),
                Row(
                    label="Bills past due",
                    value=inr(owed.payableLate),
                    href=_finance("payables"),
                    warn=_n(owed.payableLate) > 0,
                ),
                Row(
                    label="Bills due this week",
                    value=inr(owed.payableDueThisWeek),
                    href=_finance("payables"),
                ),
            ],
        )
    if report == "gst-summary":
        gst = company.gst
        if not gst:
            return None
        this, last = gst.thisMonth, gst.lastMonth

        def line(label: str, key: str) -> Row:
            return Row(label=label, value=inr(getattr(this, key)), before=inr(getattr(last, key)))

        payable = line("GST to pay", "payable")
        payable.href, payable.warn = _finance("gst"), _n(this.payable) > 0
        missing = (
            f" {this.billsWithoutGst} bills this month have no GST recorded."
            if this.billsWithoutGst
            else ""
        )
        return Figures(
            covers="month",
            note=f"{this.label} to date against {last.label}. A payable below zero is credit"
            f" carried forward.{missing}",
            rows=[
                line("GST on sales", "output"),
                line("GST on credit notes", "creditNotes"),
                line("Input credit on bills", "input"),
                line("Credit you cannot claim", "blocked"),
                payable,
            ],
        )
    if report == "headcount":
        people = company.people
        if not people:
            return None
        return Figures(
            covers="now",
            rows=[
                Row(
                    label="People",
                    value=str(people.headcount),
                    href=workspace("hr-people", "employees"),
                ),
                Row(label="On leave today", value=str(people.onLeaveToday)),
                Row(
                    label="Members who can sign in",
                    value=str(company.members),
                    href="/settings?tab=team",
                ),
            ],
        )
    if report == "attendance-leave":
        people = company.people
        if not people:
            return None
        return Figures(
            covers="now",
            rows=[
                Row(label="On leave today", value=str(people.onLeaveToday)),
                Row(
                    label="Leave waiting for approval",
                    value=str(people.pendingLeave),
                    href=workspace("hr-people", "leave"),
                    warn=people.pendingLeave > 0,
                ),
                Row(
                    label="Claims waiting",
                    value=str(people.pendingClaims),
                    change=inr(people.claimsValue) if people.claimsValue else None,
                ),
            ],
        )
    if report == "payroll-cost":
        people = company.people
        if not people or not people.monthlyPayroll:
            return None
        total = _n(people.monthlyPayroll)
        rows = [
            Row(
                label="Monthly gross pay",
                value=inr(total),
                href=workspace("hr-people", "employees"),
            ),
            Row(label="People on payroll", value=str(people.headcount)),
            Row(label="Average per person", value=inr(total / max(1, people.headcount))),
            Row(label="Per year", value=inr(total * 12)),
        ]
        payroll = company.payroll
        if payroll:
            rows.append(
                Row(
                    label=f"{payroll.label} salaries in the books",
                    value=inr(payroll.posted) if payroll.posted else "Not posted",
                    change=f"HR's salaries come to {inr(payroll.fromHr)}",
                    warn=not payroll.posted,
                )
            )
        return Figures(covers="now", rows=rows)
    if report == "tickets-sla":
        support = company.support
        if not support:
            return None

        def queues(show: str) -> str:
            return workspace("customer-support", "queues", show=show)

        return Figures(
            covers="now",
            rows=[
                Row(label="Open tickets", value=str(support.open), href=queues("all")),
                Row(
                    label="Urgent",
                    value=str(support.urgent),
                    href=queues("all"),
                    warn=support.urgent > 0,
                ),
                Row(
                    label="Escalated",
                    value=str(support.escalated),
                    href=queues("escalated"),
                    warn=support.escalated > 0,
                ),
                Row(
                    label="Open more than a week",
                    value=str(support.olderThanWeek),
                    href=queues("all"),
                    warn=support.olderThanWeek > 0,
                ),
            ],
        )
    if report == "stock-levels":
        stock = company.stock
        if not stock or not stock.items:
            return None
        rows = [
            Row(
                label="Items",
                value=str(stock.items),
                href=workspace("operations-inventory", "products"),
            ),
            Row(
                label="Below reorder level",
                value=str(stock.belowReorder),
                href=workspace("operations-inventory", "products", stock="low"),
                warn=stock.belowReorder > 0,
            ),
            Row(
                label="Batches expiring soon",
                value=str(stock.expiringBatches),
                warn=stock.expiringBatches > 0,
            ),
            Row(label="Dispatches on the way", value=str(stock.dispatchesInTransit)),
        ]
        if stock.stockValue is not None:
            rows.append(Row(label="Stock value", value=inr(stock.stockValue)))
        return Figures(covers="now", rows=rows)
    if report == "project-status":
        delivery = company.delivery
        if not delivery or not delivery.activeProjects:
            return None
        return Figures(
            covers="now",
            rows=[
                Row(
                    label="Active projects",
                    value=str(delivery.activeProjects),
                    href=workspace("projects-delivery", "projects"),
                ),
                Row(
                    label="Late",
                    value=str(delivery.lateProjects),
                    href=workspace("projects-delivery", "projects", health="late"),
                    warn=delivery.lateProjects > 0,
                ),
                Row(
                    label="Milestones overdue",
                    value=str(delivery.overdueMilestones),
                    warn=delivery.overdueMilestones > 0,
                ),
                Row(
                    label="Tasks overdue",
                    value=str(delivery.overdueTasks),
                    href=workspace("projects-delivery", "tasks", show="overdue"),
                    warn=delivery.overdueTasks > 0,
                ),
                Row(
                    label="Waiting for the customer to accept",
                    value=str(delivery.awaitingAcceptance),
                    change=inr(delivery.awaitingAcceptanceValue),
                ),
            ],
        )
    return None


def all_figures(company: portfolio.CompanySummary) -> dict[str, Figures]:
    """Every report the company's records fill, by id."""
    out: dict[str, Figures] = {}
    for report in NAMES:
        found = figures(report, company)
        if found is not None:
            out[report] = found
    return out
