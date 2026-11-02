"""What Business Management tells other modules about one company. Other modules read it through
these functions, never its tables. Each runs under the company's own context, so row-level
security applies."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.business.models import AutomationExecution


async def pending_workflow_runs(db: AsyncSession, tenant_id: int) -> int:
    """Workflow runs waiting for someone to approve them."""
    count = await db.scalar(
        select(func.count(AutomationExecution.id)).where(
            AutomationExecution.tenant_id == tenant_id,
            AutomationExecution.status == "pending_approval",
        )
    )
    return int(count or 0)
