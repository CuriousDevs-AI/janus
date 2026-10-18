from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.models import AuditLog


def record(
    db: AsyncSession,
    action: str,
    *,
    user_id: int | None = None,
    tenant_id: int | None = None,
    ip: str | None = None,
    details: dict[str, str | int | bool] | None = None,
) -> None:
    db.add(
        AuditLog(action=action, user_id=user_id, tenant_id=tenant_id, ip=ip, details=details or {})
    )
