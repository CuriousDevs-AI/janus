"""What Operations tells other modules about one company: its stock, and the stock adjustments and
purchase requisitions waiting for a decision.

Other modules read Operations through these functions, never its tables. Each runs under the
company's own context (the caller sets it), so row-level security applies.
"""

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.operations.models import (
    OpsAdjustment,
    OpsBatch,
    OpsDispatch,
    OpsItem,
    OpsMovement,
    OpsRequisition,
)


@dataclass(frozen=True)
class Stock:
    items: int
    below_reorder: int
    expiring_batches: int
    dispatches_in_transit: int
    # Paise, valued at each item's rate.
    stock_value: Decimal


async def stock(db: AsyncSession, tenant_id: int, today: date) -> Stock:
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
    return Stock(
        items=len(items),
        below_reorder=low,
        expiring_batches=int(expiring or 0),
        dispatches_in_transit=int(in_transit or 0),
        stock_value=value,
    )


async def pending_approvals(db: AsyncSession, tenant_id: int) -> dict[str, int]:
    """Stock adjustments and purchase requisitions waiting for a decision."""
    adjustments = await db.scalar(
        select(func.count(OpsAdjustment.id)).where(
            OpsAdjustment.tenant_id == tenant_id, OpsAdjustment.status == "pending"
        )
    )
    requisitions = await db.scalar(
        select(func.count(OpsRequisition.id)).where(
            OpsRequisition.tenant_id == tenant_id, OpsRequisition.status == "pending"
        )
    )
    return {"stock_adjustments": int(adjustments or 0), "requisitions": int(requisitions or 0)}
