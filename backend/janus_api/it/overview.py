"""What IT tells other modules about one company. Other modules read IT through these functions,
never its tables. Each runs under the company's own context, so row-level security applies."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.it.models import ITChange


async def pending_changes(db: AsyncSession, tenant_id: int) -> int:
    """IT changes waiting for a decision."""
    count = await db.scalar(
        select(func.count(ITChange.id)).where(
            ITChange.tenant_id == tenant_id, ITChange.status == "pending"
        )
    )
    return int(count or 0)
