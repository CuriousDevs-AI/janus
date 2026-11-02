"""One timeline of what happened across every company a person sees in the Portfolio.

Each company is read on its own, under its own context. Only events that mean something to an
owner are shown, in plain words, without amounts; money events are left out for a role without
money.
"""

from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit import overview as audit
from janus_api.auth.service import user_directory
from janus_api.core.security import now
from janus_api.core.tenancy import set_context
from janus_api.org import overview as org
from janus_api.org import service as org_service
from janus_api.portfolio import schemas
from janus_api.portfolio.access import readable_companies

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
            actions = [
                action for action, (area, _) in EVENTS.items() if money or area not in MONEY_AREAS
            ]
            for event in await audit.recent(db, tenant_id, actions, since, PER_COMPANY):
                found.append((tenant_id, company.name, event))
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
    found.sort(key=lambda entry: entry[2].at, reverse=True)
    found = found[:MOST]
    people = await user_directory(db, sorted({e.user_id for _, _, e in found if e.user_id}))
    items = []
    for tenant_id, name, event in found:
        area, text = EVENTS[event.action]
        who = people[event.user_id].name if event.user_id in people else "Janus"
        items.append(
            schemas.ActivityItem(
                companyId=str(tenant_id),
                company=name,
                at=event.at,
                area=area,
                who=who,
                text=text,
            )
        )
    return schemas.ActivityList(days=days, items=items)
