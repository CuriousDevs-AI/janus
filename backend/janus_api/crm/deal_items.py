"""Deal line items: products and services on a deal, whose total feeds the deal amount."""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.service import record
from janus_api.core.errors import ApiError
from janus_api.crm import schemas
from janus_api.crm.models import CrmProduct, Deal, DealItem


def _line_total(item: DealItem) -> Decimal:
    gross = item.quantity * item.unit_price
    return (gross * (100 - item.discount_pct) / 100).quantize(Decimal("0.01"))


def _out(item: DealItem, product_name: str | None = None) -> schemas.DealItemOut:
    return schemas.DealItemOut(
        id=str(item.id),
        productId=str(item.product_id) if item.product_id else None,
        productName=product_name,
        description=item.description,
        quantity=format(item.quantity, ".2f"),
        unitPrice=format(item.unit_price, ".2f"),
        discountPct=format(item.discount_pct, ".2f"),
        lineTotal=format(_line_total(item), ".2f"),
        createdAt=item.created_at,
    )


async def list_items(
    db: AsyncSession,
    tenant_id: int,
    deal_id: int,
) -> list[schemas.DealItemOut]:
    rows = (
        await db.execute(
            select(DealItem, CrmProduct.name)
            .outerjoin(CrmProduct, CrmProduct.id == DealItem.product_id)
            .where(DealItem.tenant_id == tenant_id, DealItem.deal_id == deal_id)
            .order_by(DealItem.id)
        )
    ).all()
    return [_out(item, pname) for item, pname in rows]


async def _recalc(db: AsyncSession, tenant_id: int, deal_id: int) -> None:
    items = (
        await db.scalars(
            select(DealItem).where(
                DealItem.tenant_id == tenant_id,
                DealItem.deal_id == deal_id,
            )
        )
    ).all()
    total = sum((_line_total(i) for i in items), Decimal(0))
    deal = await db.scalar(
        select(Deal).where(Deal.tenant_id == tenant_id, Deal.id == deal_id).with_for_update()
    )
    if deal:
        deal.amount = total
        await db.flush()


async def add_item(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    deal_id: int,
    data: schemas.DealItemIn,
) -> schemas.DealItemOut:
    deal = await db.scalar(select(Deal).where(Deal.tenant_id == tenant_id, Deal.id == deal_id))
    if deal is None:
        raise ApiError("not_found", "Deal not found.", 404)

    product_name: str | None = None
    product_id: int | None = int(data.productId) if data.productId else None
    if product_id:
        product = await db.scalar(
            select(CrmProduct).where(
                CrmProduct.tenant_id == tenant_id,
                CrmProduct.id == product_id,
            )
        )
        if product is None:
            raise ApiError("not_found", "Product not found.", 404)
        product_name = product.name

    item = DealItem(
        tenant_id=tenant_id,
        deal_id=deal_id,
        product_id=product_id,
        description=data.description.strip(),
        quantity=data.quantity,
        unit_price=data.unitPrice,
        discount_pct=data.discountPct,
    )
    db.add(item)
    await db.flush()
    await _recalc(db, tenant_id, deal_id)
    record(
        db,
        "deal.item_added",
        user_id=user_id,
        tenant_id=tenant_id,
        details={"deal_id": deal_id, "item_id": item.id},
    )
    return _out(item, product_name)


async def update_item(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    deal_id: int,
    item_id: int,
    data: schemas.DealItemUpdate,
) -> schemas.DealItemOut:
    item = await db.scalar(
        select(DealItem)
        .where(
            DealItem.tenant_id == tenant_id,
            DealItem.deal_id == deal_id,
            DealItem.id == item_id,
        )
        .with_for_update()
    )
    if item is None:
        raise ApiError("not_found", "Deal item not found.", 404)
    if data.description is not None:
        item.description = data.description.strip()
    if data.quantity is not None:
        item.quantity = data.quantity
    if data.unitPrice is not None:
        item.unit_price = data.unitPrice
    if data.discountPct is not None:
        item.discount_pct = data.discountPct
    await db.flush()
    await _recalc(db, tenant_id, deal_id)
    record(
        db,
        "deal.item_updated",
        user_id=user_id,
        tenant_id=tenant_id,
        details={"deal_id": deal_id, "item_id": item.id},
    )
    product_name = None
    if item.product_id:
        p = await db.get(CrmProduct, item.product_id)
        product_name = p.name if p else None
    return _out(item, product_name)


async def remove_item(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    deal_id: int,
    item_id: int,
) -> None:
    item = await db.scalar(
        select(DealItem).where(
            DealItem.tenant_id == tenant_id,
            DealItem.deal_id == deal_id,
            DealItem.id == item_id,
        )
    )
    if item is None:
        raise ApiError("not_found", "Deal item not found.", 404)
    await db.delete(item)
    await db.flush()
    await _recalc(db, tenant_id, deal_id)
    record(
        db,
        "deal.item_removed",
        user_id=user_id,
        tenant_id=tenant_id,
        details={"deal_id": deal_id, "item_id": item_id},
    )
