"""What the audit trail tells other modules: one company's recent events.

Read under the company's own context (the caller sets it), so row-level security applies.
"""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.models import AuditLog


@dataclass(frozen=True)
class Event:
    action: str
    user_id: int | None
    at: datetime


async def recent(
    db: AsyncSession, tenant_id: int, actions: list[str], since: datetime, limit: int
) -> list[Event]:
    """The company's newest events of these kinds since a moment, newest first."""
    rows = (
        await db.execute(
            select(AuditLog.action, AuditLog.user_id, AuditLog.created_at)
            .where(
                AuditLog.tenant_id == tenant_id,
                AuditLog.action.in_(actions),
                AuditLog.created_at >= since,
            )
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
        )
    ).all()
    return [Event(action=action, user_id=user, at=at) for action, user, at in rows]
