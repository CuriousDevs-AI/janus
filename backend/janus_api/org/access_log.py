"""Who got into the business, and who changed it: the audit log's access events, in words.

Everything here is already recorded as it happens (members, invitations, teams); this only reads it
back for the Owner and the people who manage members, with names instead of ids.
"""

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.models import AuditLog
from janus_api.org import schemas
from janus_api.org.models import Invitation, Membership, Role, Team

ACTIONS = (
    "invitation.created",
    "invitation.resent",
    "invitation.revoked",
    "auth.invitation_accepted",
    "membership.updated",
    "membership.workspace_access_set",
    "team.created",
    "team.updated",
    "team.deleted",
    "team.member_added",
    "team.member_removed",
)
ROLE_WORDS = {
    "owner": "Owner",
    "admin": "Admin",
    "manager": "Manager",
    "agent": "Agent",
    "group_finance": "Group finance",
    "group_analyst": "Read-only",
    "group_admin": "Portfolio administrator",
    "company_admin": "Company administrator",
    "finance_manager": "Finance manager",
    "operations_manager": "Operations manager",
}
ACCESS_WORDS = {
    "billing:manage": "Finance",
    "stock:adjust": "Stock",
    "projects:manage": "Projects",
    "settings:manage": "Settings and IT",
    "approvals:manage": "Approvals",
    "reports:read": "Reports",
}


def _whose(name: str) -> str:
    return f"{name}'" if name.endswith("s") else f"{name}'s"


def _id(details: dict[str, Any], key: str) -> int | None:
    value = details.get(key)
    return int(value) if isinstance(value, int | str) and str(value).isdigit() else None


async def access_log(
    db: AsyncSession, tenant_id: int, limit: int = 100
) -> list[schemas.AccessEvent]:
    from janus_api.auth.service import user_directory

    rows = (
        await db.scalars(
            select(AuditLog)
            .where(AuditLog.tenant_id == tenant_id, AuditLog.action.in_(ACTIONS))
            .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
            .limit(limit)
        )
    ).all()
    members = {
        m.id: m.user_id
        for m in await db.scalars(select(Membership).where(Membership.tenant_id == tenant_id))
    }
    invites = {
        row.id: (row.email, row.name)
        for row in await db.execute(
            select(Invitation.id, Invitation.email, Role.name)
            .join(Role, Role.id == Invitation.role_id)
            .where(Invitation.tenant_id == tenant_id)
        )
    }
    teams = {
        t.id: t.name for t in await db.scalars(select(Team).where(Team.tenant_id == tenant_id))
    }
    people = await user_directory(
        db, list({*members.values(), *(row.user_id for row in rows if row.user_id)})
    )

    def person(user_id: int | None) -> str:
        return people[user_id].name if user_id in people else "Someone no longer here"

    def member(details: dict[str, Any]) -> str:
        return person(members.get(_id(details, "membership_id") or 0))

    def team(details: dict[str, Any]) -> str:
        found = teams.get(_id(details, "team_id") or 0)
        return f"the {found} team" if found else "a team since deleted"

    def invite(details: dict[str, Any]) -> str:
        email, role = invites.get(_id(details, "invitation_id") or 0, ("someone", ""))
        return f"{email} as {ROLE_WORDS.get(role, role)}" if role else email

    out: list[schemas.AccessEvent] = []
    for row in rows:
        d, who = row.details or {}, person(row.user_id)
        match row.action:
            case "invitation.created":
                text, kind = f"invited {invite(d)}", "invitation"
            case "invitation.resent":
                text, kind = f"sent the invitation again to {invite(d)}", "invitation"
            case "invitation.revoked":
                text, kind = f"cancelled the invitation to {invite(d)}", "invitation"
            case "auth.invitation_accepted":
                text, kind = "accepted an invitation and joined", "sign_in"
            case "membership.updated":
                role = ROLE_WORDS.get(str(d.get("role", "")), str(d.get("role", "")))
                text = (
                    f"switched off {member(d)}"
                    if d.get("status") == "disabled"
                    else f"set {_whose(member(d))} role to {role}"
                )
                kind = "member"
            case "membership.workspace_access_set":
                given = [ACCESS_WORDS.get(p, p) for p in str(d.get("permissions", "")).split(",")]
                extra = ", ".join(p for p in given if p and p != "none") or "nothing extra"
                text, kind = f"gave {member(d)} access to {extra}", "member"
            case "team.created":
                text, kind = f"created {team(d)}", "team"
            case "team.updated":
                text, kind = f"renamed or described {team(d)}", "team"
            case "team.deleted":
                text, kind = "deleted a team", "team"
            case "team.member_added":
                text, kind = f"added {member(d)} to {team(d)}", "team"
            case _:
                text, kind = f"removed {member(d)} from {team(d)}", "team"
        out.append(schemas.AccessEvent(at=row.created_at, actor=who, text=text, kind=kind))
    return out
