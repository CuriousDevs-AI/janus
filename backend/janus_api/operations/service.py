"""What other modules may ask Operations: the goods received against a purchase order."""

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.operations.models import OpsPoLine, OpsPurchaseOrder


@dataclass(frozen=True)
class ReceivedOrder:
    number: str
    received_paise: int


async def received_order(db: AsyncSession, tenant_id: int, po_key: str) -> ReceivedOrder | None:
    """A purchase order's number and the value of the goods received on it, or None if missing."""
    order = await db.scalar(
        select(OpsPurchaseOrder).where(
            OpsPurchaseOrder.tenant_id == tenant_id, OpsPurchaseOrder.po_key == po_key
        )
    )
    if order is None:
        return None
    lines = (await db.scalars(select(OpsPoLine).where(OpsPoLine.po_id == order.id))).all()
    received = sum(
        int((line.received_qty * line.rate_paise).quantize(Decimal(1), rounding=ROUND_HALF_UP))
        for line in lines
    )
    return ReceivedOrder(number=order.number, received_paise=received)
