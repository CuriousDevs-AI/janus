"""CRM product catalog: items a company sells, used as line items on deals and quotes."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.service import record
from janus_api.core.errors import ApiError
from janus_api.crm import schemas
from janus_api.crm.models import CrmProduct


def _out(p: CrmProduct) -> schemas.ProductOut:
    return schemas.ProductOut(
        id=str(p.id),
        name=p.name,
        sku=p.sku,
        description=p.description,
        unitPrice=format(p.unit_price, ".2f"),
        unit=p.unit,
        taxPct=format(p.tax_pct, ".2f"),
        active=p.active,
        createdAt=p.created_at,
    )


async def list_products(
    db: AsyncSession,
    tenant_id: int,
    *,
    active_only: bool = True,
) -> list[schemas.ProductOut]:
    query = select(CrmProduct).where(CrmProduct.tenant_id == tenant_id)
    if active_only:
        query = query.where(CrmProduct.active.is_(True))
    rows = await db.scalars(query.order_by(CrmProduct.name))
    return [_out(p) for p in rows.all()]


async def create_product(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    data: schemas.ProductIn,
) -> schemas.ProductOut:
    p = CrmProduct(
        tenant_id=tenant_id,
        name=data.name.strip(),
        sku=data.sku.strip() if data.sku else None,
        description=data.description.strip(),
        unit_price=data.unitPrice,
        unit=data.unit.strip(),
        tax_pct=data.taxPct,
    )
    db.add(p)
    await db.flush()
    record(
        db,
        "product.created",
        user_id=user_id,
        tenant_id=tenant_id,
        details={"product_id": p.id, "name": p.name},
    )
    return _out(p)


async def update_product(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    product_id: int,
    data: schemas.ProductUpdate,
) -> schemas.ProductOut:
    p = await db.scalar(
        select(CrmProduct)
        .where(CrmProduct.tenant_id == tenant_id, CrmProduct.id == product_id)
        .with_for_update()
    )
    if p is None:
        raise ApiError("not_found", "Product not found.", 404)
    if data.name is not None:
        p.name = data.name.strip()
    if data.sku is not None:
        p.sku = data.sku.strip() or None
    if data.description is not None:
        p.description = data.description.strip()
    if data.unitPrice is not None:
        p.unit_price = data.unitPrice
    if data.unit is not None:
        p.unit = data.unit.strip()
    if data.taxPct is not None:
        p.tax_pct = data.taxPct
    if data.active is not None:
        p.active = data.active
    await db.flush()
    record(
        db,
        "product.updated",
        user_id=user_id,
        tenant_id=tenant_id,
        details={"product_id": p.id, "name": p.name},
    )
    return _out(p)


async def delete_product(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    product_id: int,
) -> None:
    p = await db.scalar(
        select(CrmProduct)
        .where(CrmProduct.tenant_id == tenant_id, CrmProduct.id == product_id)
        .with_for_update()
    )
    if p is None:
        raise ApiError("not_found", "Product not found.", 404)
    p.active = False
    await db.flush()
    record(
        db,
        "product.deactivated",
        user_id=user_id,
        tenant_id=tenant_id,
        details={"product_id": p.id, "name": p.name},
    )
