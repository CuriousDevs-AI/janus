"""Sales between a person's own companies, linked by record.

An invoice one company raises to another of the person's companies is matched with the bill the
other recorded for it: same supplier name, and the invoice's number as the supplier's invoice
number. Where the bill is missing, the person can record it in the buying company in one step, with
the invoice's amount and GST, so both sides of the group agree. Only companies whose money the
person sees take part; recording the bill needs their role there to manage billing.
"""

from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.core.errors import ApiError
from janus_api.core.names import party_key
from janus_api.core.tenancy import set_context
from janus_api.finance import overview as finance
from janus_api.finance import service as finance_service
from janus_api.org import overview as org
from janus_api.org import service as org_service
from janus_api.portfolio import schemas
from janus_api.portfolio.access import enter_company, readable_companies
from janus_api.portfolio.compliance.due_dates import register_start
from janus_api.portfolio.periods import rupees, today_ist


async def _money_companies(db: AsyncSession, user_id: int) -> dict[int, tuple[str, bool]]:
    """The companies whose money this person sees: their name, and whether they may record bills."""
    out: dict[int, tuple[str, bool]] = {}
    for tenant_id in await readable_companies(db, user_id):
        await set_context(db, user_id=user_id, tenant_id=tenant_id)
        _, role = await org_service.membership(db, user_id, tenant_id)
        company = await org.company(db, tenant_id)
        if company and "portfolio:finance" in role.permissions:
            out[tenant_id] = (company.name, "billing:manage" in role.permissions)
    return out


async def links(
    db: AsyncSession, user_id: int, current_tenant: int | None
) -> list[schemas.IntercompanyLink]:
    """Every invoice between the person's companies since 1 April last year, with its bill."""
    since = register_start(today_ist())
    found: list[schemas.IntercompanyLink] = []
    try:
        companies = await _money_companies(db, user_id)
        by_name = {party_key(name): tenant for tenant, (name, _) in companies.items()}
        for seller, (seller_name, _) in companies.items():
            others = [name for tenant, (name, _) in companies.items() if tenant != seller]
            if not others:
                continue
            await set_context(db, user_id=user_id, tenant_id=seller)
            invoices = await finance.invoices_to(db, seller, others, since)
            for buyer in {by_name[party_key(i.customer)] for i in invoices}:
                buyer_name, can_bill = companies[buyer]
                theirs = [i for i in invoices if by_name[party_key(i.customer)] == buyer]
                await set_context(db, user_id=user_id, tenant_id=buyer)
                bills = await finance.bills_for_invoices(db, buyer, seller_name, theirs)
                found += [
                    schemas.IntercompanyLink(
                        sellerId=str(seller),
                        seller=seller_name,
                        buyerId=str(buyer),
                        buyer=buyer_name,
                        invoice=invoice.number,
                        invoiceDate=invoice.invoice_date.isoformat(),
                        amount=rupees(invoice.total, paise=True),
                        gst=rupees(invoice.gst, paise=True),
                        bill=bills[invoice.number].number if invoice.number in bills else None,
                        billProbable=invoice.number in bills
                        and not bills[invoice.number].by_number,
                        canRecord=can_bill,
                    )
                    for invoice in theirs
                ]
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
    found.sort(key=lambda link: (link.bill is not None, link.invoiceDate), reverse=False)
    return found


async def record_bill(
    db: AsyncSession,
    user_id: int,
    user_name: str,
    current_tenant: int | None,
    data: schemas.IntercompanyRecord,
    ip: str | None,
) -> schemas.IntercompanyLink:
    """Records, in the buying company, the bill for an invoice one of the person's companies raised
    to it."""
    try:
        companies = await _money_companies(db, user_id)
        seller = int(data.sellerId) if data.sellerId.isdigit() else -1
        if seller not in companies:
            raise ApiError("not_found", "Company not found.", 404)
        seller_name = companies[seller][0]
        await set_context(db, user_id=user_id, tenant_id=seller)
        others = [name for tenant, (name, _) in companies.items() if tenant != seller]
        since = register_start(today_ist()) - timedelta(days=366)
        invoice = next(
            (
                i
                for i in await finance.invoices_to(db, seller, others, since)
                if i.number == data.invoice
            ),
            None,
        )
        if invoice is None:
            raise ApiError("not_found", "That invoice is not to one of your companies.", 404)
        buyer = next(
            tenant
            for tenant, (name, _) in companies.items()
            if party_key(name) == party_key(invoice.customer)
        )
        await enter_company(db, user_id, str(buyer), "billing:manage")
        key = f"intercompany:{seller}:{invoice.number}"
        recorded = await finance.bills_for_invoices(db, buyer, seller_name, [invoice])
        # A retry of this same request gets the bill it recorded; any other bill for the invoice
        # means it is already in the books.
        if invoice.number in recorded and not await finance_service.bill_with_key(db, buyer, key):
            raise ApiError(
                "already_recorded",
                f"{companies[buyer][0]} already has {recorded[invoice.number].number} for this "
                "invoice"
                + ("" if recorded[invoice.number].by_number else " (the same amount, days apart)")
                + ", so it is not recorded twice.",
                409,
            )
        number = await finance_service.record_bill(
            db,
            buyer,
            user_id,
            user_name,
            vendor=seller_name,
            vendor_bill_no=invoice.number,
            bill_date=invoice.invoice_date,
            due_date=invoice.due_date,
            amount_paise=invoice.total,
            gst_paise=invoice.gst,
            idempotency_key=key,
            ip=ip,
        )
        return schemas.IntercompanyLink(
            sellerId=str(seller),
            seller=seller_name,
            buyerId=str(buyer),
            buyer=companies[buyer][0],
            invoice=invoice.number,
            invoiceDate=invoice.invoice_date.isoformat(),
            amount=rupees(invoice.total, paise=True),
            gst=rupees(invoice.gst, paise=True),
            bill=number,
            canRecord=True,
        )
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
