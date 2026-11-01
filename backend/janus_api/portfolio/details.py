"""What each company's own screens hold beyond sales and money: people, stock, delivery, support and
the approvals waiting, and from all of it the list of what needs attention and a health status.

Every function runs under the company's own context (the caller sets it), so row-level security
applies. Money (payroll, claim amounts, stock value) is read only when the person's role there
includes it.
"""

from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import Numeric, and_, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.business.models import AutomationExecution
from janus_api.finance.models import FinanceCreditNote, FinanceFundRequest
from janus_api.hr.models import HrRecord
from janus_api.it.models import ITChange
from janus_api.operations.models import (
    OpsAdjustment,
    OpsBatch,
    OpsDispatch,
    OpsItem,
    OpsMovement,
    OpsRequisition,
)
from janus_api.portfolio import schemas
from janus_api.projects.effort_models import ProjectChange
from janus_api.projects.models import Project
from janus_api.projects.planning_models import ProjectMilestone, ProjectTask
from janus_api.support.models import SupportTicket
from janus_api.vault.models import VendorBankAccount

OPEN_TICKETS = ("resolved", "closed")
PENDING_LEAVE = ("pending", "needs_clarification")
PENDING_CLAIMS = ("submitted", "manager_review", "hr_review")
HR = "/workspace/hr-people"
# Each kind of approval named for one.
ONE = {
    "leave": "Leave request",
    "claims": "Expense claim",
    "funds": "Fund request",
    "credit_notes": "Credit note",
    "vendor_banks": "Supplier bank detail",
    "stock_adjustments": "Stock adjustment",
    "requisitions": "Purchase requisition",
    "project_changes": "Project change",
    "it_changes": "IT change",
    "workflow_runs": "Workflow run",
}
FINANCE = "/workspace/finance-accounting"


def _rupees(value: Decimal | int, *, paise: bool = False) -> str:
    amount = Decimal(value) / 100 if paise else Decimal(value)
    return str(amount.quantize(Decimal("0.01")))


async def people(db: AsyncSession, tenant_id: int, today: date, *, money: bool) -> schemas.People:
    """From the HR records the company keeps on the server. Payroll and claim amounts need money."""
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
    return schemas.People(
        headcount=int(headcount or 0),
        onLeaveToday=int(on_leave or 0),
        pendingLeave=int(pending_leave or 0),
        pendingClaims=int(claim_count),
        monthlyPayroll=_rupees(payroll or 0) if money else None,
        claimsValue=_rupees(claim_value) if money else None,
    )


async def stock(db: AsyncSession, tenant_id: int, today: date, *, money: bool) -> schemas.Stock:
    """Stock on hand is the sum of movements; an item is low when that sum is at or under its
    reorder level. A batch expires soon when it still holds stock and expires within 30 days."""
    on_hand = (
        select(OpsMovement.item_id, func.sum(OpsMovement.qty).label("qty"))
        .where(OpsMovement.tenant_id == tenant_id)
        .group_by(OpsMovement.item_id)
        .subquery()
    )
    items = (
        await db.execute(
            select(OpsItem.reorder_level, OpsItem.rate_paise, func.coalesce(on_hand.c.qty, 0))
            .outerjoin(on_hand, on_hand.c.item_id == OpsItem.id)
            .where(OpsItem.tenant_id == tenant_id)
        )
    ).all()
    low = sum(1 for level, _, qty in items if Decimal(qty) <= Decimal(level) and Decimal(level) > 0)
    value = sum((Decimal(qty) * rate for _, rate, qty in items if Decimal(qty) > 0), Decimal(0))
    batch_stock = (
        select(
            OpsMovement.item_id,
            OpsMovement.batch_no,
            func.sum(OpsMovement.qty).label("qty"),
        )
        .where(OpsMovement.tenant_id == tenant_id, OpsMovement.batch_no.is_not(None))
        .group_by(OpsMovement.item_id, OpsMovement.batch_no)
        .subquery()
    )
    expiring = await db.scalar(
        select(func.count(OpsBatch.id))
        .join(
            batch_stock,
            and_(
                batch_stock.c.item_id == OpsBatch.item_id,
                batch_stock.c.batch_no == OpsBatch.batch_no,
            ),
        )
        .where(
            OpsBatch.tenant_id == tenant_id,
            batch_stock.c.qty > 0,
            OpsBatch.expiry <= today + timedelta(days=30),
        )
    )
    in_transit = await db.scalar(
        select(func.count(OpsDispatch.id)).where(
            OpsDispatch.tenant_id == tenant_id, OpsDispatch.status == "dispatched"
        )
    )
    return schemas.Stock(
        items=len(items),
        belowReorder=low,
        expiringBatches=int(expiring or 0),
        dispatchesInTransit=int(in_transit or 0),
        stockValue=_rupees(value, paise=True) if money else None,
    )


async def delivery(db: AsyncSession, tenant_id: int, today: date) -> schemas.Delivery:
    """Late projects, milestones and tasks past due, and work done but not yet accepted."""
    active = await db.scalar(
        select(func.count(Project.id)).where(
            Project.tenant_id == tenant_id, Project.status == "active"
        )
    )
    late = await db.scalar(
        select(func.count(Project.id)).where(
            Project.tenant_id == tenant_id,
            Project.status.in_(("active", "on hold")),
            Project.end_on < today,
        )
    )
    overdue_milestones = await db.scalar(
        select(func.count(ProjectMilestone.id)).where(
            ProjectMilestone.tenant_id == tenant_id,
            ProjectMilestone.status == "planned",
            ProjectMilestone.due_on < today,
        )
    )
    awaiting = (
        await db.execute(
            select(
                func.count(ProjectMilestone.id), func.coalesce(func.sum(ProjectMilestone.amount), 0)
            ).where(ProjectMilestone.tenant_id == tenant_id, ProjectMilestone.status == "done")
        )
    ).one()
    overdue_tasks = await db.scalar(
        select(func.count(ProjectTask.id)).where(
            ProjectTask.tenant_id == tenant_id,
            ProjectTask.status != "done",
            ProjectTask.due_on < today,
        )
    )
    return schemas.Delivery(
        activeProjects=int(active or 0),
        lateProjects=int(late or 0),
        overdueMilestones=int(overdue_milestones or 0),
        overdueTasks=int(overdue_tasks or 0),
        awaitingAcceptance=int(awaiting[0]),
        awaitingAcceptanceValue=_rupees(awaiting[1]),
    )


async def support(db: AsyncSession, tenant_id: int, today: date) -> schemas.Support:
    open_ = and_(SupportTicket.tenant_id == tenant_id, SupportTicket.status.not_in(OPEN_TICKETS))
    total = await db.scalar(select(func.count(SupportTicket.id)).where(open_))
    urgent = await db.scalar(
        select(func.count(SupportTicket.id)).where(
            open_, SupportTicket.priority.in_(("urgent", "high"))
        )
    )
    escalated = await db.scalar(
        select(func.count(SupportTicket.id)).where(open_, SupportTicket.status == "escalated")
    )
    old = await db.scalar(
        select(func.count(SupportTicket.id)).where(
            open_, SupportTicket.raised_on <= today - timedelta(days=7)
        )
    )
    return schemas.Support(
        open=int(total or 0),
        urgent=int(urgent or 0),
        escalated=int(escalated or 0),
        olderThanWeek=int(old or 0),
    )


async def approvals(
    db: AsyncSession, tenant_id: int, people_: schemas.People
) -> list[schemas.Approval]:
    """Everything in the company waiting on a decision, by kind, with where to decide it."""

    async def count(model: Any, *conditions: Any) -> int:
        query = select(func.count(model.id)).where(model.tenant_id == tenant_id, *conditions)
        return int(await db.scalar(query) or 0)

    found = [
        (
            "leave",
            "Leave requests",
            people_.pendingLeave,
            f"{HR}?view=approvals&workspace=hr-people",
        ),
        (
            "claims",
            "Expense claims",
            people_.pendingClaims,
            f"{HR}?view=expenses&workspace=hr-people",
        ),
        (
            "funds",
            "Fund requests",
            await count(
                FinanceFundRequest, FinanceFundRequest.status.in_(("pending", "awaiting_finance"))
            ),
            f"{FINANCE}?view=funds&workspace=finance-accounting",
        ),
        (
            "credit_notes",
            "Credit notes",
            await count(FinanceCreditNote, FinanceCreditNote.status == "pending"),
            f"{FINANCE}?view=credit-notes&workspace=finance-accounting",
        ),
        (
            "vendor_banks",
            "Supplier bank details",
            await count(VendorBankAccount, VendorBankAccount.status == "pending"),
            f"{FINANCE}?view=approvals&workspace=finance-accounting",
        ),
        (
            "stock_adjustments",
            "Stock adjustments",
            await count(OpsAdjustment, OpsAdjustment.status == "pending"),
            "/workspace/operations-inventory?workspace=operations-inventory",
        ),
        (
            "requisitions",
            "Purchase requisitions",
            await count(OpsRequisition, OpsRequisition.status == "pending"),
            "/workspace/operations-inventory?workspace=operations-inventory",
        ),
        (
            "project_changes",
            "Project changes",
            await count(ProjectChange, ProjectChange.status == "pending"),
            "/workspace/projects-delivery?workspace=projects-delivery",
        ),
        (
            "it_changes",
            "IT changes",
            await count(ITChange, ITChange.status == "pending"),
            "/workspace/it-infrastructure?workspace=it-infrastructure",
        ),
        (
            "workflow_runs",
            "Workflow runs",
            await count(AutomationExecution, AutomationExecution.status == "pending_approval"),
            "/approvals",
        ),
    ]
    return [
        schemas.Approval(kind=kind, label=label, one=ONE[kind], count=number, to=to)
        for kind, label, number, to in found
        if number
    ]


def attention(
    money: schemas.MoneySummary | None,
    approvals_: list[schemas.Approval],
    delivery_: schemas.Delivery,
    support_: schemas.Support,
    stock_: schemas.Stock,
    dues: list[schemas.ComplianceDue],
) -> list[schemas.AttentionItem]:
    """What needs the owner, most urgent first. Every line can be checked against a figure on the
    page, and opens the screen where it is dealt with."""
    items: list[schemas.AttentionItem] = []

    def add(severity: str, text: str, to: str) -> None:
        items.append(schemas.AttentionItem(severity=severity, text=text, to=to))

    if money and money.overdueInvoices:
        late = Decimal(money.ageing.over60) > 0
        add(
            "high" if late else "medium",
            f"₹{Decimal(money.overdue):,.0f} overdue from customers on {money.overdueInvoices}"
            f" invoice{'' if money.overdueInvoices == 1 else 's'}"
            + (f", ₹{Decimal(money.ageing.over60):,.0f} over 60 days" if late else ""),
            f"{FINANCE}?view=receivables&workspace=finance-accounting",
        )
    if money and Decimal(money.payableDueThisWeek) > 0:
        add(
            "medium",
            f"₹{Decimal(money.payableDueThisWeek):,.0f} of supplier bills due within 7 days",
            f"{FINANCE}?view=payables&workspace=finance-accounting",
        )
    waiting = sum(item.count for item in approvals_)
    if waiting:
        add(
            "high" if waiting > 5 else "medium",
            f"{_count(waiting, 'approval')} waiting: "
            + ", ".join(
                _count(item.count, item.one.lower(), item.label.lower()) for item in approvals_
            ),
            approvals_[0].to,
        )
    if delivery_.lateProjects:
        add(
            "high",
            f"{delivery_.lateProjects} project{'' if delivery_.lateProjects == 1 else 's'}"
            " past the end date",
            "/workspace/projects-delivery?workspace=projects-delivery",
        )
    if delivery_.overdueMilestones:
        add(
            "medium",
            f"{delivery_.overdueMilestones} milestone"
            f"{'' if delivery_.overdueMilestones == 1 else 's'} past due",
            "/workspace/projects-delivery?workspace=projects-delivery",
        )
    if support_.urgent or support_.escalated:
        add(
            "high",
            f"{support_.urgent} urgent or high-priority ticket"
            f"{'' if support_.urgent == 1 else 's'} open, {support_.escalated} escalated",
            "/tickets?workspace=customer-support",
        )
    elif support_.olderThanWeek:
        add(
            "medium",
            f"{support_.olderThanWeek} ticket"
            f"{'' if support_.olderThanWeek == 1 else 's'} open for more than a week",
            "/tickets?workspace=customer-support",
        )
    if stock_.belowReorder:
        add(
            "medium",
            f"{stock_.belowReorder} item{'' if stock_.belowReorder == 1 else 's'}"
            " at or under the reorder level",
            "/workspace/operations-inventory?workspace=operations-inventory",
        )
    if stock_.expiringBatches:
        add(
            "medium",
            f"{stock_.expiringBatches} batch{'' if stock_.expiringBatches == 1 else 'es'}"
            " with stock expiring within 30 days",
            "/workspace/operations-inventory?workspace=operations-inventory",
        )
    # One line each for overdue and due this week, so a company that has just set up its
    # calendar is not flooded with every filing of the last 90 days.
    unfiled = [due for due in dues if due.status == "overdue"]
    if unfiled:
        oldest = unfiled[0]
        add(
            "high",
            f"{_count(len(unfiled), 'filing')} overdue, the oldest {oldest.label} for"
            f" {oldest.period} (due {_day(oldest.dueOn)})",
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


def _count(number: int, one: str, many: str | None = None) -> str:
    return f"{number} {one if number == 1 else many or one + 's'}"


def _day(iso: str) -> str:
    value = date.fromisoformat(iso)
    return f"{value.day} {value:%b}"


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
