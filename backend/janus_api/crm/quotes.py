"""CRM quotes: formal price quotations generated from deal line items."""

from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.service import record
from janus_api.auth.models import User
from janus_api.core.errors import ApiError
from janus_api.crm import schemas
from janus_api.crm.models import CrmQuote, CrmQuoteItem, Deal, DealItem


def _item_out(qi: CrmQuoteItem) -> schemas.QuoteItemOut:
    gross = qi.quantity * qi.unit_price
    after_discount = gross * (100 - qi.discount_pct) / 100
    return schemas.QuoteItemOut(
        id=str(qi.id),
        description=qi.description,
        quantity=format(qi.quantity, ".2f"),
        unitPrice=format(qi.unit_price, ".2f"),
        discountPct=format(qi.discount_pct, ".2f"),
        taxPct=format(qi.tax_pct, ".2f"),
        lineTotal=format(after_discount.quantize(Decimal("0.01")), ".2f"),
    )


def _out(
    q: CrmQuote,
    items: list[CrmQuoteItem],
    creator_name: str | None = None,
) -> schemas.QuoteOut:
    return schemas.QuoteOut(
        id=str(q.id),
        dealId=str(q.deal_id),
        number=q.number,
        status=q.status,
        validUntil=q.valid_until,
        notes=q.notes,
        total=format(q.total, ".2f"),
        createdBy=str(q.created_by) if q.created_by else None,
        createdByName=creator_name,
        items=[_item_out(qi) for qi in items],
        createdAt=q.created_at,
    )


async def list_quotes(
    db: AsyncSession,
    tenant_id: int,
    *,
    deal_id: int | None = None,
) -> list[schemas.QuoteOut]:
    query = select(CrmQuote).where(CrmQuote.tenant_id == tenant_id)
    if deal_id is not None:
        query = query.where(CrmQuote.deal_id == deal_id)
    quotes = (await db.scalars(query.order_by(CrmQuote.created_at.desc()))).all()
    result: list[schemas.QuoteOut] = []
    for q in quotes:
        items = (
            await db.scalars(
                select(CrmQuoteItem).where(CrmQuoteItem.quote_id == q.id).order_by(CrmQuoteItem.id)
            )
        ).all()
        creator = await db.get(User, q.created_by) if q.created_by else None
        result.append(_out(q, list(items), creator.name if creator else None))
    return result


async def _next_number(db: AsyncSession, tenant_id: int) -> str:
    count = await db.scalar(select(func.count(CrmQuote.id)).where(CrmQuote.tenant_id == tenant_id))
    return f"Q-{(count or 0) + 1:04d}"


async def create_quote(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    deal_id: int,
    data: schemas.QuoteCreateIn,
) -> schemas.QuoteOut:
    deal = await db.scalar(select(Deal).where(Deal.tenant_id == tenant_id, Deal.id == deal_id))
    if deal is None:
        raise ApiError("not_found", "Deal not found.", 404)

    deal_items = (
        await db.scalars(
            select(DealItem)
            .where(
                DealItem.tenant_id == tenant_id,
                DealItem.deal_id == deal_id,
            )
            .order_by(DealItem.id)
        )
    ).all()

    number = await _next_number(db, tenant_id)
    total = Decimal(0)
    quote_items: list[CrmQuoteItem] = []

    for di in deal_items:
        gross = di.quantity * di.unit_price
        after_discount = (gross * (100 - di.discount_pct) / 100).quantize(Decimal("0.01"))
        total += after_discount
        quote_items.append(
            CrmQuoteItem(
                description=di.description,
                quantity=di.quantity,
                unit_price=di.unit_price,
                discount_pct=di.discount_pct,
                tax_pct=Decimal(0),
            )
        )

    q = CrmQuote(
        tenant_id=tenant_id,
        deal_id=deal_id,
        number=number,
        valid_until=data.validUntil,
        notes=data.notes.strip(),
        total=total,
        created_by=user_id,
    )
    db.add(q)
    await db.flush()

    for qi in quote_items:
        qi.quote_id = q.id
        db.add(qi)
    await db.flush()

    record(
        db,
        "quote.created",
        user_id=user_id,
        tenant_id=tenant_id,
        details={"quote_id": q.id, "deal_id": deal_id, "number": number},
    )
    creator = await db.get(User, user_id)
    return _out(q, quote_items, creator.name if creator else None)


async def get_quote(
    db: AsyncSession,
    tenant_id: int,
    quote_id: int,
) -> schemas.QuoteOut:
    q = await db.scalar(
        select(CrmQuote).where(CrmQuote.tenant_id == tenant_id, CrmQuote.id == quote_id)
    )
    if q is None:
        raise ApiError("not_found", "Quote not found.", 404)
    items = (
        await db.scalars(
            select(CrmQuoteItem).where(CrmQuoteItem.quote_id == q.id).order_by(CrmQuoteItem.id)
        )
    ).all()
    creator = await db.get(User, q.created_by) if q.created_by else None
    return _out(q, list(items), creator.name if creator else None)


async def update_quote_status(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    quote_id: int,
    data: schemas.QuoteStatusUpdate,
) -> schemas.QuoteOut:
    q = await db.scalar(
        select(CrmQuote)
        .where(CrmQuote.tenant_id == tenant_id, CrmQuote.id == quote_id)
        .with_for_update()
    )
    if q is None:
        raise ApiError("not_found", "Quote not found.", 404)
    q.status = data.status
    await db.flush()
    record(
        db,
        "quote.status_changed",
        user_id=user_id,
        tenant_id=tenant_id,
        details={"quote_id": q.id, "status": data.status},
    )
    items = (
        await db.scalars(
            select(CrmQuoteItem).where(CrmQuoteItem.quote_id == q.id).order_by(CrmQuoteItem.id)
        )
    ).all()
    creator = await db.get(User, q.created_by) if q.created_by else None
    return _out(q, list(items), creator.name if creator else None)
