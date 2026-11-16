"""Hooks that connect HR and Projects to Team Chat auto-channels.

Called from the HR and Projects routers after a save, as a background task
so the caller is never slowed down.
"""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.auth.models import User
from janus_api.hr.models import HrRecord
from janus_api.team import service as team_service

log = logging.getLogger(__name__)


async def sync_department_channels(db: AsyncSession, tenant_id: int, actor_user_id: int) -> None:
    """Read the org.departments config, create/update a channel per active department."""
    dept_row = await db.scalar(
        select(HrRecord).where(
            HrRecord.tenant_id == tenant_id,
            HrRecord.kind == "config",
            HrRecord.key == "org.departments",
        )
    )
    if dept_row is None:
        return
    departments: list[dict[str, object]] = (dept_row.data or {}).get("value", [])
    if not departments:
        return

    emps = (
        await db.scalars(
            select(HrRecord).where(HrRecord.tenant_id == tenant_id, HrRecord.kind == "employee")
        )
    ).all()
    users = (await db.scalars(select(User))).all()
    user_by_email: dict[str, User] = {u.email.lower(): u for u in users if u.email}

    dept_users: dict[str, set[int]] = {}
    for emp in emps:
        data = emp.data or {}
        dept_name = data.get("department", "")
        status = data.get("status", "active")
        email = (data.get("email") or "").lower()
        if status == "archived" or not dept_name or not email:
            continue
        user = user_by_email.get(email)
        if user is not None:
            dept_users.setdefault(dept_name, set()).add(user.id)

    for dept in departments:
        if not dept.get("active", True):
            continue
        dept_id = str(dept.get("id", ""))
        dept_name = str(dept.get("name", ""))
        if not dept_id or not dept_name:
            continue
        try:
            await team_service.ensure_source_channel(
                db, tenant_id, actor_user_id, "department", dept_id, dept_name
            )
            user_ids = dept_users.get(dept_name, set())
            if user_ids:
                await team_service.sync_source_members(
                    db, tenant_id, "department", dept_id, user_ids
                )
        except Exception:
            log.debug("department channel sync failed for %s", dept_id, exc_info=True)

    await db.commit()


async def sync_project_channel(
    db: AsyncSession, tenant_id: int, actor_user_id: int, project_key: str, project_name: str
) -> None:
    """Create a channel for a project and add the creator."""
    try:
        await team_service.ensure_source_channel(
            db, tenant_id, actor_user_id, "project", project_key, project_name
        )
        await db.commit()
    except Exception:
        log.debug("project channel sync failed for %s", project_key, exc_info=True)
