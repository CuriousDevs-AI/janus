"""One timeline of what happened across every company a person sees in the Portfolio.

Each company is read on its own, under its own context. Only events that mean something to an
owner are shown, in plain words. For a role with money, a money event names its document, the
customer or supplier and the amount; for a role without money, money events are left out. Several
events of one kind by one person close together read as one line ("raised 6 invoices, ₹4.2L"), and
edits and reversals are marked.
"""

from datetime import timedelta
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit import overview as audit
from janus_api.auth.service import user_directory
from janus_api.core.security import now
from janus_api.core.tenancy import set_context
from janus_api.org import overview as org
from janus_api.org import service as org_service
from janus_api.portfolio import schemas
from janus_api.portfolio.access import readable_companies
from janus_api.portfolio.periods import inr

PER_COMPANY, MOST = 80, 300

# What each event says, and the area it belongs to. Money areas are hidden without money.
EVENTS: dict[str, tuple[str, str]] = {
    "lead.captured": ("Sales", "captured a lead"),
    "deal.created": ("Sales", "opened a deal"),
    "deal.updated": ("Sales", "updated a deal"),
    "csv.imported": ("Sales", "imported leads from a file"),
    "finance.invoice_created": ("Finance", "raised an invoice"),
    "finance.payment_recorded": ("Finance", "recorded a customer payment"),
    "finance.bill_recorded": ("Finance", "recorded a supplier bill"),
    "finance.bill_paid": ("Finance", "paid a supplier bill"),
    "finance.credit_note_raised": ("Finance", "raised a credit note"),
    "finance.credit_note_approved": ("Finance", "approved a credit note"),
    "finance.credit_note_rejected": ("Finance", "rejected a credit note"),
    "finance.fund_requested": ("Finance", "asked for funds"),
    "finance.fund_owner_approved": ("Finance", "approved a fund request"),
    "finance.fund_finance_approved": ("Finance", "released requested funds"),
    "finance.fund_rejected": ("Finance", "turned down a fund request"),
    "finance.budget_line_created": ("Finance", "added a budget line"),
    "vendor_bank.requested": ("Finance", "submitted supplier bank details"),
    "vendor_bank.approved": ("Finance", "approved supplier bank details"),
    "vendor_bank.rejected": ("Finance", "rejected supplier bank details"),
    "operations.requisition_raised": ("Operations", "raised a purchase requisition"),
    "operations.requisition_approved": ("Operations", "approved a purchase requisition"),
    "operations.requisition_rejected": ("Operations", "rejected a purchase requisition"),
    "operations.purchase_order_raised": ("Operations", "raised a purchase order"),
    "operations.goods_received": ("Operations", "received goods"),
    "operations.dispatch_booked": ("Operations", "booked a dispatch"),
    "operations.dispatch_delivered": ("Operations", "marked a dispatch delivered"),
    "operations.adjustment_requested": ("Operations", "asked for a stock adjustment"),
    "operations.adjustment_approved": ("Operations", "approved a stock adjustment"),
    "operations.transfer_sent": ("Operations", "sent a stock transfer"),
    "operations.count_recorded": ("Operations", "recorded a stock count"),
    "project.created": ("Projects", "created a project"),
    "project.status_changed": ("Projects", "changed a project's status"),
    "project.milestone_created": ("Projects", "added a milestone"),
    "project.change_requested": ("Projects", "asked for a project change"),
    "project.change_decided": ("Projects", "decided a project change"),
    "support.ticket_created": ("Support", "opened a support ticket"),
    "support.ticket_assigned": ("Support", "assigned a support ticket"),
    "support.ticket_resolved": ("Support", "resolved a support ticket"),
    "it.change_requested": ("IT", "asked for an IT change"),
    "it.change_decided": ("IT", "decided an IT change"),
    "it.change_completed": ("IT", "completed an IT change"),
    "invitation.created": ("People", "invited someone"),
    "auth.invitation_accepted": ("People", "joined the company"),
    "membership.updated": ("People", "changed someone's role or access"),
    "team.created": ("People", "created a team"),
    "business.workspace_created": ("Setup", "switched on a workspace"),
    "business.automation_published": ("Setup", "published a workflow"),
    "company.rules_changed": ("Setup", "changed the company's rules"),
    "portfolio.company_created": ("Portfolio", "added this company"),
    "portfolio.company_updated": ("Portfolio", "changed the company's name or details"),
    "portfolio.targets_set": ("Portfolio", "set monthly targets"),
    "portfolio.compliance_plan_set": ("Compliance", "changed which filings apply"),
    "portfolio.registration_set": ("Compliance", "updated the registration details"),
    "portfolio.filing_marked": ("Compliance", "recorded a filing as done"),
    "portfolio.filing_unmarked": ("Compliance", "reopened a filing"),
    "portfolio.access_removed": ("People", "removed someone's Portfolio access"),
}
MONEY_AREAS = {"Finance"}
# The plural for a burst: "raised 6 invoices".
PLURAL: dict[str, str] = {
    "lead.captured": "captured {n} leads",
    "deal.created": "opened {n} deals",
    "deal.updated": "updated {n} deals",
    "finance.invoice_created": "raised {n} invoices",
    "finance.payment_recorded": "recorded {n} customer payments",
    "finance.bill_recorded": "recorded {n} supplier bills",
    "finance.bill_paid": "paid {n} supplier bills",
    "finance.credit_note_raised": "raised {n} credit notes",
    "operations.goods_received": "received goods {n} times",
    "operations.dispatch_booked": "booked {n} dispatches",
    "support.ticket_created": "opened {n} support tickets",
    "support.ticket_resolved": "resolved {n} support tickets",
    "project.milestone_created": "added {n} milestones",
    "invitation.created": "invited {n} people",
}
CHANGES = {
    "deal.updated",
    "membership.updated",
    "company.rules_changed",
    "portfolio.company_updated",
    "portfolio.compliance_plan_set",
    "portfolio.registration_set",
    "project.status_changed",
}
REVERSALS = {
    "finance.credit_note_raised",
    "finance.credit_note_approved",
    "portfolio.filing_unmarked",
    "portfolio.access_removed",
    "finance.fund_rejected",
}
# Events this close together, of one kind by one person in one company, read as one line.
BURST = timedelta(minutes=30)


def _paise(details: dict[str, str | int | bool]) -> int | None:
    value = details.get("amount_paise", details.get("total_paise"))
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _detail(details: dict[str, str | int | bool]) -> str | None:
    number = next(
        (str(details[key]) for key in ("invoice", "bill", "note") if details.get(key)), None
    )
    party = next((str(details[key]) for key in ("customer", "vendor") if details.get(key)), None)
    parts = [part for part in (number, party) if part]
    return " · ".join(parts) or None


async def activity(
    db: AsyncSession, user_id: int, current_tenant: int, days: int
) -> schemas.ActivityList:
    since = now() - timedelta(days=days)
    found: list[tuple[int, str, audit.Event]] = []
    try:
        for tenant_id in await readable_companies(db, user_id):
            await set_context(db, user_id=user_id, tenant_id=tenant_id)
            _, role = await org_service.membership(db, user_id, tenant_id)
            company = await org.company(db, tenant_id)
            if company is None or "portfolio:read" not in role.permissions:
                continue
            money = "portfolio:finance" in role.permissions
            kinds = [
                action for action, (area, _) in EVENTS.items() if money or area not in MONEY_AREAS
            ]
            for event in await audit.recent(db, tenant_id, kinds, since, PER_COMPANY):
                found.append((tenant_id, company.name, event))
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
    found.sort(key=lambda entry: entry[2].at, reverse=True)
    found = found[:MOST]
    people = await user_directory(db, sorted({e.user_id for _, _, e in found if e.user_id}))
    items: list[schemas.ActivityItem] = []
    # For each line, the event kind and its paise, while bursts are added up.
    actions: list[str] = []
    totals: list[int | None] = []
    for tenant_id, name, event in found:
        area, text = EVENTS[event.action]
        who = people[event.user_id].name if event.user_id in people else "Janus"
        money = area in MONEY_AREAS
        paise = _paise(event.details) if money else None
        last = items[-1] if items else None
        if (
            last is not None
            and event.action in PLURAL
            and last.companyId == str(tenant_id)
            and last.who == who
            and last.area == area
            and actions[-1] == event.action
            and last.at - event.at <= BURST
        ):
            last.count += 1
            last.text = PLURAL[event.action].format(n=last.count)
            last.detail = None
            if paise is not None and totals[-1] is not None:
                totals[-1] = (totals[-1] or 0) + paise
            else:
                totals[-1] = None
            continue
        item = schemas.ActivityItem(
            companyId=str(tenant_id),
            company=name,
            at=event.at,
            area=area,
            who=who,
            text=text,
            detail=_detail(event.details) if money else None,
            flag="change"
            if event.action in CHANGES
            else "reversal"
            if event.action in REVERSALS
            else None,
        )
        items.append(item)
        actions.append(event.action)
        totals.append(paise)
    for item, paise in zip(items, totals, strict=True):
        if paise is not None:
            item.amount = inr(Decimal(paise) / 100)
    return schemas.ActivityList(days=days, items=items)
