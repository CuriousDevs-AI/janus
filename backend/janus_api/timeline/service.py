"""Project timelines: membership checks and the one writer the modules use for system events."""

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.core.errors import ApiError
from janus_api.timeline.models import ProjectTimeline, ProjectTimelineEntry, ProjectTimelineMember

EVENT_KINDS = {"milestone", "change", "money", "budget", "closed", "system"}


async def timeline_for(db: AsyncSession, tenant_id: int, project_key: str) -> ProjectTimeline:
    timeline = await db.scalar(
        select(ProjectTimeline).where(
            ProjectTimeline.tenant_id == tenant_id, ProjectTimeline.project_key == project_key
        )
    )
    if timeline is None:
        raise ApiError("not_found", "Timeline not found.", 404)
    return timeline


async def require_member(db: AsyncSession, timeline: ProjectTimeline, user_id: int) -> None:
    """Non-members get the same 404 as a missing timeline, so a project's existence stays hidden."""
    member = await db.scalar(
        select(ProjectTimelineMember.id).where(
            ProjectTimelineMember.timeline_id == timeline.id,
            ProjectTimelineMember.user_id == user_id,
        )
    )
    if member is None:
        raise ApiError("not_found", "Timeline not found.", 404)


async def record_event(
    db: AsyncSession,
    tenant_id: int,
    project_key: str,
    kind: str,
    text: str,
    payload: dict[str, Any] | None = None,
) -> ProjectTimelineEntry | None:
    """Writes a system entry when something happens, such as a milestone accepted or a budget
    line crossed. A no-op when the project has no timeline yet, so a module never fails
    because of the timeline. People cannot create events through the API."""
    if kind not in EVENT_KINDS:
        raise ValueError(f"Unknown event kind: {kind}")
    timeline = await db.scalar(
        select(ProjectTimeline).where(
            ProjectTimeline.tenant_id == tenant_id, ProjectTimeline.project_key == project_key
        )
    )
    if timeline is None:
        return None
    entry = ProjectTimelineEntry(
        tenant_id=tenant_id,
        timeline_id=timeline.id,
        kind="event",
        author_id=None,
        body=f"{kind}: {text}"[:4000],
        payload={"event": kind, **(payload or {})},
    )
    db.add(entry)
    await db.flush()
    return entry
