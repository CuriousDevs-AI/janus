"""The company's audit trail, read back for its Owner and administrators in words.

Everything is already recorded as it happens (audit.service.record). Reading a page and refreshing a
sign-in are left out: they are thousands of rows a day and say nothing about who changed what.
"""

from typing import Any, Literal

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.models import AuditLog

Area = Literal["sign-in", "sales", "money", "people", "workflows", "settings", "support", "other"]
# Reads and token refreshes: recorded for security, not shown as changes.
QUIET = ("portfolio.company_read", "auth.refresh")
WORDS = {
    "auth.login": "Signed in",
    "auth.login_failed": "Sign-in failed",
    "auth.logout": "Signed out",
    "auth.signup": "Created the account",
    "auth.email_verified": "Confirmed their email",
    "auth.tenant_switched": "Switched company",
    "auth.invitation_accepted": "Accepted an invitation",
    "auth.password_changed": "Changed their password",
    "lead.captured": "A lead came in",
    "deal.created": "Created a deal",
    "deal.updated": "Updated a deal",
    "business.automation_created": "Created a workflow",
    "business.automation_published": "Switched a workflow on",
    "business.automation_run_finished": "A workflow ran",
    "business.automation_approved": "Approved a workflow run",
    "business.export_downloaded": "Downloaded all records",
    "invitation.created": "Invited someone",
    "invitation.revoked": "Cancelled an invitation",
    "membership.updated": "Changed someone's role or access",
    "membership.workspace_access_set": "Changed someone's workspace access",
}
AREAS: dict[str, Area] = {
    "auth": "sign-in",
    "lead": "sales",
    "deal": "sales",
    "crm": "sales",
    "contact": "sales",
    "finance": "money",
    "billing": "money",
    "invitation": "people",
    "membership": "people",
    "team": "people",
    "hr": "people",
    "business": "settings",
    "portfolio": "settings",
    "org": "settings",
    "ai": "settings",
    "support": "support",
}


class AuditEvent(BaseModel):
    id: str
    at: str
    area: Area
    what: str
    action: str
    who: str | None
    ip: str | None


def _words(action: str) -> str:
    if action in WORDS:
        return WORDS[action]
    record, _, name = action.partition(".")
    name = name.replace("_", " ")
    # "lead.updated" says what changed only with its record: "Lead updated", not "Updated".
    if " " not in name:
        name = f"{record.replace('_', ' ')} {name}"
    return name[:1].upper() + name[1:]


def _area(action: str) -> Area:
    if action.startswith("business.automation"):
        return "workflows"
    return AREAS.get(action.split(".", 1)[0], "other")


async def events(
    db: AsyncSession, tenant_id: int, area: Area | None, before: int | None, limit: int
) -> list[AuditEvent]:
    from janus_api.auth.service import user_directory

    query = select(AuditLog).where(AuditLog.tenant_id == tenant_id, AuditLog.action.not_in(QUIET))
    if before:
        query = query.where(AuditLog.id < before)
    # Filtering by area happens in Python, so fetch more than one page's worth to fill it.
    rows = (
        await db.scalars(query.order_by(AuditLog.id.desc()).limit(limit * (5 if area else 1)))
    ).all()
    picked = [row for row in rows if area is None or _area(row.action) == area][:limit]
    people: dict[int, Any] = await user_directory(
        db, sorted({row.user_id for row in picked if row.user_id})
    )
    return [
        AuditEvent(
            id=str(row.id),
            at=row.created_at.isoformat(),
            area=_area(row.action),
            what=_words(row.action),
            action=row.action,
            who=people[row.user_id].name if row.user_id in people else None,
            ip=row.ip,
        )
        for row in picked
    ]
