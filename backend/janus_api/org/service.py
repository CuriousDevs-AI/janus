from datetime import timedelta

from sqlalchemy import delete, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.service import record
from janus_api.core.email import send_token
from janus_api.core.errors import ApiError
from janus_api.core.security import digest, now, random_token
from janus_api.core.tenancy import set_context
from janus_api.org import schemas
from janus_api.org.models import Invitation, Membership, Role, Team, TeamMember, Tenant
from janus_api.org.schemas import TenantOut

PERMISSIONS = {
    "leads:read_own",
    "leads:read_team",
    "leads:read_all",
    "leads:write",
    "leads:assign",
    "members:manage",
    "roles:manage",
    "sources:manage",
    "ai:manage",
    "settings:manage",
    "billing:manage",
}
SYSTEM_ROLES = {
    "owner": sorted(PERMISSIONS),
    "admin": sorted(PERMISSIONS - {"billing:manage"}),
    "manager": ["leads:read_own", "leads:read_team", "leads:write", "leads:assign"],
    "agent": ["leads:read_own", "leads:write"],
}


async def create_workspace(db: AsyncSession, user_id: int, name: str) -> int:
    result = await db.scalar(text("SELECT create_workspace(:name)"), {"name": name})
    tenant_id = int(result)
    await set_context(db, user_id=user_id, tenant_id=tenant_id)
    return tenant_id


async def membership(db: AsyncSession, user_id: int, tenant_id: int) -> tuple[Membership, Role]:
    result = (
        await db.execute(
            select(Membership, Role)
            .join(Role, Role.id == Membership.role_id)
            .where(
                Membership.user_id == user_id,
                Membership.tenant_id == tenant_id,
                Membership.status == "active",
            )
        )
    ).first()
    if not result:
        raise ApiError("membership_inactive", "No active membership in this workspace.", 403)
    return result[0], result[1]


async def list_workspaces(
    db: AsyncSession, user_id: int, current_tenant: int | None
) -> list[TenantOut]:
    memberships = list(
        (
            await db.scalars(
                select(Membership)
                .where(Membership.user_id == user_id)
                .order_by(Membership.tenant_id)
            )
        ).all()
    )
    output = []
    for member in memberships:
        await set_context(db, user_id=user_id, tenant_id=member.tenant_id)
        tenant = await db.get(Tenant, member.tenant_id)
        role = await db.get(Role, member.role_id)
        if tenant and role:
            output.append(
                TenantOut(
                    id=str(tenant.id),
                    name=tenant.name,
                    timezone=tenant.timezone,
                    role=role.name,
                    status=member.status,
                )
            )
    await set_context(db, user_id=user_id, tenant_id=current_tenant)
    return output


async def first_workspace(db: AsyncSession, user_id: int) -> int:
    tenant_id = await db.scalar(
        select(Membership.tenant_id)
        .where(Membership.user_id == user_id, Membership.status == "active")
        .order_by(Membership.id)
        .limit(1)
    )
    if tenant_id is None:
        raise ApiError("membership_inactive", "No active workspace membership.", 403)
    return tenant_id


async def disable_memberships_for_deletion(db: AsyncSession, user_id: int) -> None:
    memberships = list(
        (
            await db.scalars(
                select(Membership)
                .where(Membership.user_id == user_id)
                .order_by(Membership.tenant_id)
            )
        ).all()
    )
    for member in memberships:
        await set_context(db, user_id=user_id, tenant_id=member.tenant_id)
        await db.scalar(select(Tenant).where(Tenant.id == member.tenant_id).with_for_update())
        # A concurrent role change may have completed while waiting for the tenant lock.
        await db.refresh(member)
        role = await db.get(Role, member.role_id)
        if role and role.name == "owner" and member.status == "active":
            await ensure_other_owner(db, member.tenant_id, member.id)
        member.status = "disabled"
        await db.flush()
    await set_context(db, user_id=user_id)


async def create_invitation(
    db: AsyncSession, tenant_id: int, user_id: int, email: str, role_name: str, ip: str
) -> dict[str, str]:
    await lock_workspace(db, tenant_id, user_id, "members:manage")
    role = await system_role(db, role_name)
    _, caller_role = await membership(db, user_id, tenant_id)
    if role_name == "owner" and caller_role.name != "owner":
        raise ApiError("forbidden", "Only an Owner can invite another Owner.", 403)
    await check_invitee(db, tenant_id, email.casefold())
    token = random_token()
    invite = Invitation(
        tenant_id=tenant_id,
        email=email.casefold(),
        role_id=role.id,
        inviter_id=user_id,
        token_hash=digest(token),
        expires_at=now() + timedelta(days=7),
    )
    db.add(invite)
    await db.flush()
    await send_token(invite.email, "invite", token)
    record(
        db,
        "invitation.created",
        tenant_id=tenant_id,
        user_id=user_id,
        ip=ip,
        details={"invitation_id": invite.id},
    )
    return {"id": str(invite.id), "message": "Invitation sent."}


async def check_invitee(
    db: AsyncSession,
    tenant_id: int,
    address: str,
    *,
    exclude_id: int = 0,
) -> None:
    from janus_api.auth.service import user_id_for_email

    existing_user = await user_id_for_email(db, address)
    if existing_user and await db.scalar(
        select(Membership.id).where(
            Membership.tenant_id == tenant_id, Membership.user_id == existing_user
        )
    ):
        raise ApiError(
            "already_member",
            "This person is already a member; manage their existing membership.",
            409,
        )
    pending = await db.scalar(
        select(Invitation.id).where(
            Invitation.tenant_id == tenant_id,
            Invitation.id != exclude_id,
            Invitation.email == address,
            Invitation.used_at.is_(None),
            Invitation.revoked_at.is_(None),
            Invitation.expires_at > now(),
        )
    )
    if pending:
        raise ApiError(
            "invitation_pending", "An invitation is already pending. Resend or revoke it.", 409
        )


async def find_invitation(db: AsyncSession, token: str, *, lock: bool = False) -> Invitation:
    token_hash = digest(token)
    tenant_id = await db.scalar(text("SELECT invitation_tenant(:hash)"), {"hash": token_hash})
    if tenant_id is None:
        raise ApiError("invalid_token", "Invalid or expired invitation.", 400)
    actor = await db.scalar(text("SELECT app_user()"))
    await set_context(db, tenant_id=int(tenant_id), user_id=actor)
    if lock:
        # Use the same tenant -> invitation lock order as resend/revoke.
        await db.scalar(select(Tenant).where(Tenant.id == tenant_id).with_for_update())
    statement = select(Invitation).where(
        Invitation.token_hash == token_hash,
        Invitation.used_at.is_(None),
        Invitation.revoked_at.is_(None),
        Invitation.expires_at > now(),
    )
    if lock:
        statement = statement.with_for_update()
    invite = await db.scalar(statement)
    if invite is None:
        raise ApiError("invalid_token", "Invalid or expired invitation.", 400)
    return invite


async def invitation_labels(db: AsyncSession, invite: Invitation) -> tuple[str, str]:
    tenant, role = await db.get(Tenant, invite.tenant_id), await db.get(Role, invite.role_id)
    if not tenant or not role:
        raise ApiError("invalid_token", "Invalid invitation.")
    return tenant.name, role.name


async def accept_membership(db: AsyncSession, invite: Invitation, user_id: int) -> None:
    await set_context(db, tenant_id=invite.tenant_id, user_id=user_id)
    await db.scalar(select(Tenant).where(Tenant.id == invite.tenant_id).with_for_update())
    existing = await db.scalar(
        select(Membership).where(
            Membership.tenant_id == invite.tenant_id, Membership.user_id == user_id
        )
    )
    if existing and existing.status != "active":
        raise ApiError(
            "membership_inactive", "A workspace administrator must reactivate membership.", 403
        )
    if not existing:
        db.add(Membership(tenant_id=invite.tenant_id, user_id=user_id, role_id=invite.role_id))
    invite.used_at = now()
    await db.flush()


async def update_membership(
    db: AsyncSession,
    tenant_id: int,
    actor_id: int,
    member_id: int,
    data: schemas.MembershipUpdate,
    ip: str,
) -> schemas.MemberOut:
    await lock_workspace(db, tenant_id, actor_id, "members:manage")
    member = await db.scalar(
        select(Membership).where(Membership.id == member_id, Membership.tenant_id == tenant_id)
    )
    if member is None:
        raise ApiError("not_found", "Member not found.", 404)
    _, actor_role = await membership(db, actor_id, tenant_id)
    role = await db.get(Role, member.role_id)
    assert role is not None
    next_role = await system_role(db, data.role) if data.role is not None else role
    if data.role is not None and "roles:manage" not in actor_role.permissions:
        raise ApiError("forbidden", "You do not have permission to change roles.", 403)
    if "owner" in (role.name, next_role.name) and actor_role.name != "owner":
        raise ApiError("forbidden", "Only an Owner can change ownership or another Owner.", 403)
    next_status = data.status or member.status
    if (
        role.name == "owner"
        and member.status == "active"
        and (next_role.name != "owner" or next_status != "active")
    ):
        await ensure_other_owner(db, tenant_id, member.id)
    if next_status == "active":
        from janus_api.auth.service import account_is_active

        if not await account_is_active(db, member.user_id):
            raise ApiError("account_deleted", "A deleted account cannot be reactivated.", 409)
    member.role_id, member.status = next_role.id, next_status
    record(
        db,
        "membership.updated",
        tenant_id=tenant_id,
        user_id=actor_id,
        ip=ip,
        details={"membership_id": member.id, "status": next_status, "role": next_role.name},
    )
    return (await member_outputs(db, [(member, next_role)]))[0]


async def lock_workspace(
    db: AsyncSession,
    tenant_id: int,
    actor_id: int,
    permission: str,
) -> Tenant:
    tenant = await db.scalar(select(Tenant).where(Tenant.id == tenant_id).with_for_update())
    if tenant is None:
        raise ApiError("not_found", "Workspace not found.", 404)
    # Permissions may have changed while waiting for a concurrent workspace mutation.
    _, role = await membership(db, actor_id, tenant_id)
    if permission not in role.permissions:
        raise ApiError("forbidden", "You do not have permission for this action.", 403)
    return tenant


async def system_role(db: AsyncSession, name: str) -> Role:
    role = await db.scalar(select(Role).where(Role.name == name, Role.tenant_id.is_(None)))
    if role is None:
        raise ApiError("invalid_role", "Unknown system role.", 422)
    return role


async def ensure_other_owner(db: AsyncSession, tenant_id: int, member_id: int) -> None:
    count = await db.scalar(
        select(func.count())
        .select_from(Membership)
        .join(Role)
        .where(
            Membership.tenant_id == tenant_id,
            Role.name == "owner",
            Membership.status == "active",
            Membership.id != member_id,
        )
    )
    if not count:
        raise ApiError("last_owner", "A workspace must retain an active Owner.", 409)


def workspace_out(tenant: Tenant) -> schemas.WorkspaceOut:
    return schemas.WorkspaceOut(
        id=str(tenant.id),
        name=tenant.name,
        industry=tenant.industry,
        companySize=tenant.company_size,
        timezone=tenant.timezone,
        businessHours=schemas.BusinessHours(**tenant.business_hours),
        defaultChannel=tenant.default_channel,
    )


async def get_workspace(db: AsyncSession, tenant_id: int) -> schemas.WorkspaceOut:
    tenant = await db.get(Tenant, tenant_id)
    if tenant is None:
        raise ApiError("not_found", "Workspace not found.", 404)
    return workspace_out(tenant)


async def update_workspace(
    db: AsyncSession,
    tenant_id: int,
    actor_id: int,
    data: schemas.WorkspaceUpdate,
    ip: str,
) -> schemas.WorkspaceOut:
    tenant = await lock_workspace(db, tenant_id, actor_id, "settings:manage")
    fields = {
        "companySize": "company_size",
        "businessHours": "business_hours",
        "defaultChannel": "default_channel",
    }
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(tenant, fields.get(key, key), value)
    record(
        db,
        "workspace.updated",
        tenant_id=tenant_id,
        user_id=actor_id,
        ip=ip,
        details={"fields": ",".join(sorted(data.model_fields_set))},
    )
    return workspace_out(tenant)


async def member_outputs(
    db: AsyncSession,
    rows: list[tuple[Membership, Role]],
) -> list[schemas.MemberOut]:
    from janus_api.auth.service import user_directory

    profiles = await user_directory(db, [member.user_id for member, _ in rows])
    return [
        schemas.MemberOut(
            id=str(member.id),
            user_id=str(member.user_id),
            name=profiles[member.user_id].name,
            email=profiles[member.user_id].email,
            avatar_url=profiles[member.user_id].avatar_url,
            role=role.name,
            status=member.status,
        )
        for member, role in rows
    ]


async def list_members(
    db: AsyncSession,
    tenant_id: int,
    after_id: int,
    limit: int,
) -> list[schemas.MemberOut]:
    rows = (
        await db.execute(
            select(Membership, Role)
            .join(Role)
            .where(
                Membership.tenant_id == tenant_id,
                Membership.id > after_id,
            )
            .order_by(Membership.id)
            .limit(limit)
        )
    ).all()
    return await member_outputs(db, [(member, role) for member, role in rows])


async def list_roles(db: AsyncSession) -> list[schemas.RoleOut]:
    roles = (await db.scalars(select(Role).where(Role.tenant_id.is_(None)).order_by(Role.id))).all()
    return [
        schemas.RoleOut(id=str(role.id), name=role.name, permissions=role.permissions)
        for role in roles
    ]


async def list_invitations(
    db: AsyncSession,
    tenant_id: int,
    after_id: int,
    limit: int,
) -> list[schemas.PendingInvitationOut]:
    rows = (
        await db.execute(
            select(Invitation, Role.name)
            .join(Role)
            .where(
                Invitation.tenant_id == tenant_id,
                Invitation.id > after_id,
                Invitation.used_at.is_(None),
                Invitation.revoked_at.is_(None),
                Invitation.expires_at > now(),
            )
            .order_by(Invitation.id)
            .limit(limit)
        )
    ).all()
    return [
        schemas.PendingInvitationOut(
            id=str(invite.id),
            email=invite.email,
            role=role,
            inviter_id=str(invite.inviter_id),
            created_at=invite.created_at,
            expires_at=invite.expires_at,
            last_sent_at=invite.last_sent_at,
        )
        for invite, role in rows
    ]


async def manage_invitation(
    db: AsyncSession,
    tenant_id: int,
    actor_id: int,
    invitation_id: int,
    ip: str,
    *,
    resend: bool,
) -> schemas.InvitationReceipt:
    await lock_workspace(db, tenant_id, actor_id, "members:manage")
    invite = await db.scalar(
        select(Invitation)
        .where(
            Invitation.id == invitation_id,
            Invitation.tenant_id == tenant_id,
            Invitation.used_at.is_(None),
            Invitation.revoked_at.is_(None),
        )
        .with_for_update()
    )
    if invite is None:
        raise ApiError("not_found", "Pending invitation not found.", 404)
    _, actor_role = await membership(db, actor_id, tenant_id)
    role = await db.get(Role, invite.role_id)
    if role and role.name == "owner" and actor_role.name != "owner":
        raise ApiError("forbidden", "Only an Owner can manage an Owner invitation.", 403)
    if resend:
        await check_invitee(db, tenant_id, invite.email, exclude_id=invite.id)
        if invite.last_sent_at > now() - timedelta(seconds=60):
            raise ApiError("rate_limited", "Wait one minute before resending.", 429)
        token = random_token()
        invite.token_hash = digest(token)
        invite.expires_at = now() + timedelta(days=7)
        invite.last_sent_at = now()
        await send_token(invite.email, "invite", token)
    else:
        invite.revoked_at = now()
    record(
        db,
        "invitation.resent" if resend else "invitation.revoked",
        tenant_id=tenant_id,
        user_id=actor_id,
        ip=ip,
        details={"invitation_id": invite.id},
    )
    return schemas.InvitationReceipt(
        id=str(invite.id), message="Invitation sent." if resend else "Invitation revoked."
    )


async def get_team(db: AsyncSession, tenant_id: int, team_id: int) -> Team:
    team = await db.scalar(select(Team).where(Team.id == team_id, Team.tenant_id == tenant_id))
    if team is None:
        raise ApiError("not_found", "Team not found.", 404)
    return team


def team_output(team: Team, member_count: int) -> schemas.TeamOut:
    return schemas.TeamOut(
        id=str(team.id), name=team.name, description=team.description, member_count=member_count
    )


async def team_count(db: AsyncSession, team_id: int) -> int:
    return int(
        await db.scalar(
            select(func.count())
            .select_from(TeamMember)
            .join(Membership, Membership.id == TeamMember.membership_id)
            .where(TeamMember.team_id == team_id, Membership.status == "active")
        )
        or 0
    )


async def list_teams(
    db: AsyncSession, tenant_id: int, after_id: int, limit: int
) -> list[schemas.TeamOut]:
    counts = (
        select(TeamMember.team_id.label("team_id"), func.count().label("total"))
        .join(Membership, Membership.id == TeamMember.membership_id)
        .where(Membership.status == "active")
        .group_by(TeamMember.team_id)
        .subquery()
    )
    rows = (
        await db.execute(
            select(Team, func.coalesce(counts.c.total, 0))
            .outerjoin(counts, counts.c.team_id == Team.id)
            .where(Team.tenant_id == tenant_id, Team.id > after_id)
            .order_by(Team.id)
            .limit(limit)
        )
    ).all()
    return [team_output(team, count) for team, count in rows]


async def create_team(
    db: AsyncSession,
    tenant_id: int,
    actor_id: int,
    data: schemas.TeamCreate,
    ip: str,
) -> schemas.TeamOut:
    await lock_workspace(db, tenant_id, actor_id, "members:manage")
    team = Team(tenant_id=tenant_id, **data.model_dump())
    db.add(team)
    await db.flush()
    record(
        db,
        "team.created",
        tenant_id=tenant_id,
        user_id=actor_id,
        ip=ip,
        details={"team_id": team.id},
    )
    return team_output(team, 0)


async def update_team(
    db: AsyncSession,
    tenant_id: int,
    actor_id: int,
    team_id: int,
    data: schemas.TeamUpdate,
    ip: str,
) -> schemas.TeamOut:
    await lock_workspace(db, tenant_id, actor_id, "members:manage")
    team = await get_team(db, tenant_id, team_id)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(team, key, value)
    record(
        db,
        "team.updated",
        tenant_id=tenant_id,
        user_id=actor_id,
        ip=ip,
        details={"team_id": team.id, "fields": ",".join(sorted(data.model_fields_set))},
    )
    return team_output(team, await team_count(db, team.id))


async def delete_team(
    db: AsyncSession, tenant_id: int, actor_id: int, team_id: int, ip: str
) -> None:
    await lock_workspace(db, tenant_id, actor_id, "members:manage")
    team = await get_team(db, tenant_id, team_id)
    await db.delete(team)
    record(
        db,
        "team.deleted",
        tenant_id=tenant_id,
        user_id=actor_id,
        ip=ip,
        details={"team_id": team_id},
    )


async def list_team_members(
    db: AsyncSession,
    tenant_id: int,
    team_id: int,
    after_id: int,
    limit: int,
) -> list[schemas.MemberOut]:
    await get_team(db, tenant_id, team_id)
    rows = (
        await db.execute(
            select(Membership, Role)
            .join(Role)
            .join(TeamMember, TeamMember.membership_id == Membership.id)
            .where(
                TeamMember.team_id == team_id,
                Membership.tenant_id == tenant_id,
                Membership.status == "active",
                Membership.id > after_id,
            )
            .order_by(Membership.id)
            .limit(limit)
        )
    ).all()
    return await member_outputs(db, [(member, role) for member, role in rows])


async def add_team_member(
    db: AsyncSession,
    tenant_id: int,
    actor_id: int,
    team_id: int,
    member_id: int,
    ip: str,
) -> None:
    await lock_workspace(db, tenant_id, actor_id, "members:manage")
    await get_team(db, tenant_id, team_id)
    member = await db.scalar(
        select(Membership).where(
            Membership.id == member_id,
            Membership.tenant_id == tenant_id,
        )
    )
    if member is None:
        raise ApiError("not_found", "Member not found.", 404)
    if member.status != "active":
        raise ApiError("membership_inactive", "Only active members can join a team.", 409)
    if await db.scalar(
        select(TeamMember.id).where(
            TeamMember.team_id == team_id,
            TeamMember.membership_id == member_id,
        )
    ):
        return
    db.add(TeamMember(tenant_id=tenant_id, team_id=team_id, membership_id=member_id))
    record(
        db,
        "team.member_added",
        tenant_id=tenant_id,
        user_id=actor_id,
        ip=ip,
        details={"team_id": team_id, "membership_id": member_id},
    )


async def remove_team_member(
    db: AsyncSession,
    tenant_id: int,
    actor_id: int,
    team_id: int,
    member_id: int,
    ip: str,
) -> None:
    await lock_workspace(db, tenant_id, actor_id, "members:manage")
    await get_team(db, tenant_id, team_id)
    removed = await db.scalar(
        delete(TeamMember)
        .where(
            TeamMember.tenant_id == tenant_id,
            TeamMember.team_id == team_id,
            TeamMember.membership_id == member_id,
        )
        .returning(TeamMember.id)
    )
    if removed is None:
        raise ApiError("not_found", "Team member not found.", 404)
    record(
        db,
        "team.member_removed",
        tenant_id=tenant_id,
        user_id=actor_id,
        ip=ip,
        details={"team_id": team_id, "membership_id": member_id},
    )


async def active_member(db: AsyncSession, tenant_id: int, user_id: int) -> bool:
    return bool(
        await db.scalar(
            select(Membership.id).where(
                Membership.tenant_id == tenant_id,
                Membership.user_id == user_id,
                Membership.status == "active",
            )
        )
    )


async def teammate_user_ids(db: AsyncSession, tenant_id: int, user_id: int) -> list[int]:
    own_teams = (
        select(TeamMember.team_id)
        .join(Membership, Membership.id == TeamMember.membership_id)
        .where(
            Membership.tenant_id == tenant_id,
            Membership.user_id == user_id,
            Membership.status == "active",
        )
    )
    return list(
        (
            await db.scalars(
                select(Membership.user_id)
                .join(TeamMember, TeamMember.membership_id == Membership.id)
                .where(
                    Membership.tenant_id == tenant_id,
                    Membership.status == "active",
                    TeamMember.team_id.in_(own_teams),
                )
                .distinct()
            )
        ).all()
    )
