"""From a company's figures, the list of what needs the owner and a health status. Pure functions:
every line can be checked against a figure on the page, and opens the screen where it is dealt
with."""

from datetime import date
from decimal import Decimal

from janus_api.portfolio import schemas
from janus_api.portfolio.periods import inr

FINANCE = "/workspace/finance-accounting"
PROJECTS = "/workspace/projects-delivery?workspace=projects-delivery"
OPERATIONS = "/workspace/operations-inventory?workspace=operations-inventory"
TICKETS = "/tickets?workspace=customer-support"


def _count(number: int, one: str, many: str | None = None) -> str:
    return f"{number} {one if number == 1 else many or one + 's'}"


def _day(iso: str) -> str:
    value = date.fromisoformat(iso)
    return f"{value.day} {value:%b}"


def attention(
    money: schemas.MoneySummary | None,
    approvals: list[schemas.Approval],
    delivery: schemas.Delivery,
    support: schemas.Support,
    stock: schemas.Stock,
    dues: list[schemas.ComplianceDue],
    limits: schemas.Thresholds | None = None,
) -> list[schemas.AttentionItem]:
    """What needs the owner, most urgent first, red where the person's thresholds say."""
    limits = limits or schemas.Thresholds()
    items: list[schemas.AttentionItem] = []

    def add(severity: str, text: str, to: str) -> None:
        items.append(schemas.AttentionItem(severity=severity, text=text, to=to))

    if money and money.overdueInvoices and Decimal(money.overdue) >= limits.overdueMinimum:
        ageing = money.ageing
        # Ageing is kept in 30-day buckets, so "over 30" is the two older buckets together.
        old = Decimal(ageing.over60)
        if limits.overdueRedAfterDays == 30:
            old += Decimal(ageing.days31to60)
        days = limits.overdueRedAfterDays
        add(
            "high" if old > 0 else "medium",
            f"{inr(money.overdue)} overdue from customers on {money.overdueInvoices}"
            f" invoice{'' if money.overdueInvoices == 1 else 's'}"
            + (f", {inr(old)} over {days} days" if old > 0 else ""),
            f"{FINANCE}?view=receivables&workspace=finance-accounting",
        )
    bills_late, bills_week = (
        Decimal(money.payableLate) if money else 0,
        Decimal(money.payableDueThisWeek) if money else 0,
    )
    if money and bills_late > 0:
        add(
            "high" if bills_late * 100 >= bills_week * limits.lateBillsRedShare else "medium",
            f"{inr(bills_late)} of supplier bills already late"
            + (
                f", {inr(bills_week - bills_late)} more due within 7 days"
                if bills_week > bills_late
                else ""
            ),
            f"{FINANCE}?view=payables&workspace=finance-accounting",
        )
    elif money and bills_week > 0:
        add(
            "medium",
            f"{inr(bills_week)} of supplier bills due within 7 days",
            f"{FINANCE}?view=payables&workspace=finance-accounting",
        )
    waiting = sum(item.count for item in approvals)
    if waiting:
        add(
            "high" if waiting > limits.approvalsRedAbove else "medium",
            f"{_count(waiting, 'approval')} waiting: "
            + ", ".join(
                _count(item.count, item.one.lower(), item.label.lower()) for item in approvals
            ),
            approvals[0].to,
        )
    if delivery.lateProjects:
        add(
            "high",
            f"{delivery.lateProjects} project{'' if delivery.lateProjects == 1 else 's'}"
            " past the end date",
            PROJECTS,
        )
    if delivery.overdueMilestones:
        add(
            "medium",
            f"{delivery.overdueMilestones} milestone"
            f"{'' if delivery.overdueMilestones == 1 else 's'} past due",
            PROJECTS,
        )
    if support.urgent or support.escalated:
        add(
            "high",
            f"{support.urgent} urgent or high-priority ticket"
            f"{'' if support.urgent == 1 else 's'} open, {support.escalated} escalated",
            TICKETS,
        )
    elif support.olderThanWeek:
        add(
            "medium",
            f"{support.olderThanWeek} ticket"
            f"{'' if support.olderThanWeek == 1 else 's'} open for more than a week",
            TICKETS,
        )
    if stock.belowReorder:
        add(
            "medium",
            f"{stock.belowReorder} item{'' if stock.belowReorder == 1 else 's'}"
            " at or under the reorder level",
            OPERATIONS,
        )
    if stock.expiringBatches:
        add(
            "medium",
            f"{stock.expiringBatches} batch{'' if stock.expiringBatches == 1 else 'es'}"
            " with stock expiring within 30 days",
            OPERATIONS,
        )
    # One line each for overdue and due this week, so a company that has just set up its
    # calendar is not flooded with every filing of the last 90 days.
    unfiled = [due for due in dues if due.status == "overdue"]
    if unfiled:
        oldest = unfiled[0]
        add(
            "high",
            f"{_count(len(unfiled), 'filing')} past due and not recorded as filed, the oldest"
            f" {oldest.label} for {oldest.period} (due {_day(oldest.dueOn)})",
            oldest.to,
        )
    soon = [due for due in dues if due.status == "due_soon"]
    if soon:
        add(
            "medium",
            f"{_count(len(soon), 'filing')} due this week: "
            + ", ".join(f"{due.label} for {due.period} on {_day(due.dueOn)}" for due in soon),
            soon[0].to,
        )
    order = {"high": 0, "medium": 1, "low": 2}
    return sorted(items, key=lambda item: order[item.severity])


def health(items: list[schemas.AttentionItem]) -> schemas.Health:
    """Red with anything high, amber with anything medium, green otherwise; the reasons are the
    attention lines behind it."""
    high = [item.text for item in items if item.severity == "high"]
    medium = [item.text for item in items if item.severity == "medium"]
    if high:
        return schemas.Health(status="red", reasons=high)
    if medium:
        return schemas.Health(status="amber", reasons=medium)
    return schemas.Health(status="green", reasons=[])


def with_line(
    items: list[schemas.AttentionItem], severity: str, text: str, to: str
) -> list[schemas.AttentionItem]:
    """Adds one more line, keeping the most urgent first."""
    line = schemas.AttentionItem(severity=severity, text=text, to=to)
    order = {"high": 0, "medium": 1, "low": 2}
    return sorted([*items, line], key=lambda item: order[item.severity])


def with_loss(
    items: list[schemas.AttentionItem], after_salaries: Decimal, *, estimate: bool = True
) -> list[schemas.AttentionItem]:
    """Adds the line for a period that loses money once salaries are counted: an estimate from
    HR's monthly salaries, or recorded where the period's salaries are posted."""
    return with_line(
        items,
        "high",
        f"Losing {'about ' if estimate else ''}{inr(abs(after_salaries))} this period once"
        f" salaries are counted ({'estimate' if estimate else 'salaries posted'})",
        f"{FINANCE}?view=overview&workspace=finance-accounting",
    )
