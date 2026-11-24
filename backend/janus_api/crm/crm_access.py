"""CRM workspace visibility: which CRMs an actor may see."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.crm.models import CrmMember, CrmWorkspace
from janus_api.org.models import Membership


async def visible_crm_ids(
    db: AsyncSession, tenant_id: int, user_id: int, permissions: list[str]
) -> list[int] | None:
    """CRM IDs this user may access, or None for all (admin/owner with leads:read_all)."""
    if "leads:read_all" in permissions:
        return None
    membership_id = await db.scalar(
        select(Membership.id).where(
            Membership.tenant_id == tenant_id,
            Membership.user_id == user_id,
            Membership.status == "active",
        )
    )
    if membership_id is None:
        return []
    rows = (
        await db.execute(
            select(CrmMember.crm_id).where(
                CrmMember.tenant_id == tenant_id,
                CrmMember.membership_id == membership_id,
            )
        )
    ).scalars().all()
    if not rows:
        default = await db.scalar(
            select(CrmWorkspace.id).where(
                CrmWorkspace.tenant_id == tenant_id, CrmWorkspace.is_default.is_(True)
            )
        )
        return [default] if default else []
    return list(rows)


async def can_access_crm(
    db: AsyncSession, tenant_id: int, user_id: int, permissions: list[str], crm_id: int
) -> bool:
    ids = await visible_crm_ids(db, tenant_id, user_id, permissions)
    if ids is None:
        return True
    return crm_id in ids
