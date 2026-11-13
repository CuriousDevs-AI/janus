"""What other modules may ask Projects."""

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.projects import summary


async def closure_summary(
    db: AsyncSession, tenant_id: int, project_key: str
) -> dict[str, Any] | None:
    """A project's plan against what happened, for its closure report; None if there is none."""
    return await summary.closure_summary(db, tenant_id, project_key)
