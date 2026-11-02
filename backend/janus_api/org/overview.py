"""What the organisation module tells other modules: which companies a person may enter, who holds
which role in a company, and the invitations still open.

Other modules read companies, memberships, roles and invitations through these functions, never
their tables. Memberships are read under the person's own context, which RLS allows for their own
rows; everything about one company is read under that company's context, which the caller sets.
"""

from dataclasses import dataclass
from datetime import date
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.core.security import now
from janus_api.org.models import Invitation, Membership, Role, Tenant


@dataclass(frozen=True)
class Company:
    id: int
    name: str
    industry: str
    company_size: str
    # The day it was created, in India.
    created_on: date


async def company(db: AsyncSession, tenant_id: int) -> Company | None:
    tenant = await db.get(Tenant, tenant_id)
    if tenant is None:
        return None
    return Company(
        id=tenant.id,
        name=tenant.name,
        industry=tenant.industry,
        company_size=tenant.company_size,
        created_on=tenant.created_at.astimezone(ZoneInfo("Asia/Kolkata")).date(),
    )


async def tenants_with_permission(db: AsyncSession, user_id: int, permission: str) -> list[int]:
    """The companies where this person's active role holds the permission."""
    return list(
        (
            await db.scalars(
                select(Membership.tenant_id)
                .join(Role, Role.id == Membership.role_id)
                .where(
                    Membership.user_id == user_id,
                    Membership.status == "active",
                    Role.permissions.contains([permission]),
                )
                .order_by(Membership.tenant_id)
            )
        ).all()
    )


async def owned_tenants(db: AsyncSession, user_id: int) -> list[int]:
    """The companies where this person is an active Owner."""
    return list(
        (
            await db.scalars(
                select(Membership.tenant_id)
                .join(Role, Role.id == Membership.role_id)
                .where(
                    Membership.user_id == user_id,
                    Membership.status == "active",
                    Role.tenant_id.is_(None),
                    Role.name == "owner",
                )
                .order_by(Membership.tenant_id)
            )
        ).all()
    )


async def active_member_count(db: AsyncSession, tenant_id: int) -> int:
    count = await db.scalar(
        select(func.count(Membership.id)).where(
            Membership.tenant_id == tenant_id, Membership.status == "active"
        )
    )
    return int(count or 0)


async def active_role(db: AsyncSession, tenant_id: int, user_id: int) -> str | None:
    """The name of the person's active role in the company, or None."""
    name: str | None = await db.scalar(
        select(Role.name)
        .join(Membership, Membership.role_id == Role.id)
        .where(
            Membership.tenant_id == tenant_id,
            Membership.user_id == user_id,
            Membership.status == "active",
        )
    )
    return name


async def members_in_roles(
    db: AsyncSession, tenant_id: int, roles: tuple[str, ...], *, leave_out: int
) -> list[tuple[int, str]]:
    """Active members holding one of the system roles, as (user id, role name), leaving one out."""
    rows = (
        await db.execute(
            select(Membership.user_id, Role.name)
            .join(Role, Role.id == Membership.role_id)
            .where(
                Membership.tenant_id == tenant_id,
                Membership.user_id != leave_out,
                Membership.status == "active",
                Role.tenant_id.is_(None),
                Role.name.in_(roles),
            )
        )
    ).all()
    return [(int(user_id), name) for user_id, name in rows]


async def open_invitations(
    db: AsyncSession, tenant_id: int, roles: tuple[str, ...]
) -> list[tuple[str, str]]:
    """Unused, unwithdrawn, unexpired invitations to one of the system roles, as (email, role)."""
    rows = (
        await db.execute(
            select(Invitation.email, Role.name)
            .join(Role, Role.id == Invitation.role_id)
            .where(
                Invitation.tenant_id == tenant_id,
                Invitation.used_at.is_(None),
                Invitation.revoked_at.is_(None),
                Invitation.expires_at > now(),
                Role.tenant_id.is_(None),
                Role.name.in_(roles),
            )
        )
    ).all()
    return [(email, name) for email, name in rows]
