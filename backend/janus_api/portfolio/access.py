"""Who sees the Portfolio: entering a company from it, and an Owner sharing it with co-owners and
the two group roles."""

from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.service import record
from janus_api.auth.service import user_directory, user_id_for_email
from janus_api.core.errors import ApiError
from janus_api.core.tenancy import set_context
from janus_api.org import overview as org
from janus_api.org import service as org_service
from janus_api.portfolio import schemas

# The roles the Portfolio is shared with, and those an Owner or Portfolio administrator can take
# away again here (a co-owner's ownership is changed company by company).
ACCESS_ROLES = (
    "owner",
    "group_admin",
    "company_admin",
    "finance_manager",
    "operations_manager",
    "group_finance",
    "group_analyst",
)
GROUP_ROLES = ACCESS_ROLES[1:]
# Roles only an Owner of the company gives: they own it, or share the Portfolio themselves.
OWNER_GIVES = ("owner", "group_admin")


async def readable_companies(db: AsyncSession, user_id: int) -> list[int]:
    """The companies whose Portfolio this person may see: owned, or shared by an Owner."""
    return await org.tenants_with_permission(db, user_id, "portfolio:read")


async def enter_company(db: AsyncSession, user_id: int, company_id: str, need: str) -> int:
    """Moves the session's context into one company and checks the person's role there.

    `need` is "owner" or a permission. The caller returns the context to its own company.
    """
    if not company_id.isdigit():
        raise ApiError("not_found", "Company not found.", 404)
    tenant_id = int(company_id)
    if tenant_id not in await readable_companies(db, user_id):
        raise ApiError("not_found", "Company not found.", 404)
    await set_context(db, user_id=user_id, tenant_id=tenant_id)
    _, role = await org_service.membership(db, user_id, tenant_id)
    allowed = role.name == "owner" if need == "owner" else need in role.permissions
    if not allowed:
        raise ApiError("forbidden", "Your role in this company cannot change this.", 403)
    return tenant_id


async def _shareable(db: AsyncSession, user_id: int, wanted: list[str]) -> list[int]:
    """The companies to share: those asked for, in all of which this person must be an Owner or
    Portfolio administrator, or every such company when none is named."""
    mine = await org.tenants_with_permission(db, user_id, "portfolio:share")
    if not mine:
        raise ApiError(
            "forbidden", "Only an Owner or Portfolio administrator can share the Portfolio.", 403
        )
    if not wanted:
        return mine
    ids = {int(item) for item in wanted if item.isdigit()}
    if len(ids) != len(set(wanted)) or not ids <= set(mine):
        raise ApiError("forbidden", "You can share only companies you own or administer.", 403)
    return sorted(ids)


async def _is_owner(db: AsyncSession, user_id: int, tenant_id: int) -> bool:
    _, role = await org_service.membership(db, user_id, tenant_id)
    return bool(role.name == "owner")


async def list_access(db: AsyncSession, user_id: int, current_tenant: int) -> schemas.AccessList:
    """Everyone who holds, or is invited to, a Portfolio role in a company this Owner owns."""
    people: dict[str, schemas.AccessPerson] = {}
    try:
        for tenant_id in await org.tenants_with_permission(db, user_id, "portfolio:share"):
            await set_context(db, user_id=user_id, tenant_id=tenant_id)
            company = await org.company(db, tenant_id)
            if company is None:
                continue
            members = await org.members_in_roles(db, tenant_id, ACCESS_ROLES, leave_out=user_id)
            profiles = await user_directory(db, [member for member, _ in members])
            for member, role in members:
                profile = profiles[member]
                person = people.setdefault(
                    profile.email,
                    schemas.AccessPerson(email=profile.email, name=profile.name, companies=[]),
                )
                person.companies.append(
                    schemas.AccessCompany(
                        id=str(tenant_id), name=company.name, role=role, status="active"
                    )
                )
            for email, role in await org.open_invitations(db, tenant_id, ACCESS_ROLES):
                person = people.setdefault(
                    email, schemas.AccessPerson(email=email, name=None, companies=[])
                )
                person.companies.append(
                    schemas.AccessCompany(
                        id=str(tenant_id), name=company.name, role=role, status="invited"
                    )
                )
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
    return schemas.AccessList(people=sorted(people.values(), key=lambda person: person.email))


async def grant_access(
    db: AsyncSession, user_id: int, current_tenant: int, data: schemas.AccessGrant, ip: str
) -> schemas.AccessResult:
    """Invites the person into each chosen company with the role. A company where they are already a
    member, or already invited, is skipped with the reason; the others still go out."""
    done: list[str] = []
    skipped: list[schemas.AccessSkipped] = []
    try:
        for tenant_id in await _shareable(db, user_id, data.companies):
            await set_context(db, user_id=user_id, tenant_id=tenant_id)
            company = await org.company(db, tenant_id)
            name = company.name if company else str(tenant_id)
            if data.role in OWNER_GIVES and not await _is_owner(db, user_id, tenant_id):
                skipped.append(
                    schemas.AccessSkipped(company=name, reason="Only its Owner can give that role.")
                )
                continue
            try:
                await org_service.create_invitation(
                    db, tenant_id, user_id, str(data.email), data.role, ip
                )
            except ApiError as error:
                skipped.append(schemas.AccessSkipped(company=name, reason=error.message))
                continue
            done.append(name)
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
    return schemas.AccessResult(done=done, skipped=skipped)


async def remove_access(
    db: AsyncSession, user_id: int, current_tenant: int, data: schemas.AccessRemove, ip: str
) -> schemas.AccessResult:
    """Takes the person's group role away in every company this Owner owns, and withdraws open
    Portfolio invitations. A co-owner stays: ownership is changed company by company."""
    address = str(data.email).casefold()
    done: list[str] = []
    skipped: list[schemas.AccessSkipped] = []
    try:
        for tenant_id in await _shareable(db, user_id, []):
            await set_context(db, user_id=user_id, tenant_id=tenant_id)
            tenant = await org_service.lock_workspace(db, tenant_id, user_id, "members:manage")
            changed = False
            person = await user_id_for_email(db, address)
            role = (
                await org.active_role(db, tenant_id, person)
                if person is not None and person != user_id
                else None
            )
            # A Portfolio administrator is removed by an Owner only.
            removable = GROUP_ROLES if await _is_owner(db, user_id, tenant_id) else GROUP_ROLES[1:]
            membership_id = (
                await org_service.disable_role_membership(db, tenant_id, person, removable)
                if person is not None and role in removable
                else None
            )
            if membership_id is not None:
                changed = True
                record(
                    db,
                    "portfolio.access_removed",
                    user_id=user_id,
                    tenant_id=tenant_id,
                    ip=ip,
                    details={"membership_id": membership_id},
                )
            elif role == "owner":
                skipped.append(
                    schemas.AccessSkipped(
                        company=tenant.name, reason="Co-owner: change ownership in the company."
                    )
                )
            for invitation_id in await org_service.revoke_open_invitations(
                db, tenant_id, address, ACCESS_ROLES
            ):
                changed = True
                record(
                    db,
                    "invitation.revoked",
                    user_id=user_id,
                    tenant_id=tenant_id,
                    ip=ip,
                    details={"invitation_id": invitation_id},
                )
            if changed:
                done.append(tenant.name)
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
    return schemas.AccessResult(done=done, skipped=skipped)
