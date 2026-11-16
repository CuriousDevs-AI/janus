"""A customer's account with the business, on their CRM page: what Finance invoiced them, what
they paid and what they still owe.

Read through Finance's overview, never its tables. Someone who handles money (Finance, the Owner,
an admin) sees the amounts and the latest invoices; a salesperson who can see the customer is
told only whether invoices are overdue, so nobody promises more credit to a customer who has not
paid, without the amounts being shown to them.
"""

from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.crm import schemas, service
from janus_api.crm.models import Deal, Lead
from janus_api.finance import overview as finance

IST = ZoneInfo("Asia/Kolkata")
MONEY = frozenset({"billing:manage", "portfolio:finance"})


def _rupees(paise: int) -> str:
    return f"{paise / 100:.2f}"


async def account(
    db: AsyncSession, tenant_id: int, user_id: int, permissions: list[str], contact_id: int
) -> schemas.CustomerAccountOut:
    # Raises not found where this person cannot see the customer.
    contact = await service.get_contact(db, tenant_id, user_id, permissions, contact_id)
    deals = await db.scalars(
        select(Deal.id)
        .join(Lead, (Lead.tenant_id == Deal.tenant_id) & (Lead.id == Deal.lead_id))
        .where(Deal.tenant_id == tenant_id, Lead.contact_id == contact_id)
    )
    found = await finance.customer_account(
        db,
        tenant_id,
        {str(deal) for deal in deals.all()},
        [contact.company, contact.name],
        datetime.now(IST).date(),
    )
    full = bool(MONEY & set(permissions))
    if found is None:
        return schemas.CustomerAccountOut(full=full, invoices=0)
    if not full:
        return schemas.CustomerAccountOut(
            full=False,
            invoices=found.invoices,
            overdueInvoices=found.overdue_invoices,
            oldestOverdueDays=found.oldest_overdue_days,
        )
    return schemas.CustomerAccountOut(
        full=True,
        invoices=found.invoices,
        overdueInvoices=found.overdue_invoices,
        oldestOverdueDays=found.oldest_overdue_days,
        invoiced=_rupees(found.invoiced),
        paid=_rupees(found.paid),
        credited=_rupees(found.credited),
        due=_rupees(found.due),
        overdue=_rupees(found.overdue),
        lastInvoiceOn=found.last_invoice_on,
        latest=[
            schemas.AccountInvoiceOut(
                id=str(item.id),
                number=item.number,
                invoiceDate=item.invoice_date,
                dueDate=item.due_date,
                total=_rupees(item.total),
                due=_rupees(item.due),
            )
            for item in found.latest
        ],
    )
