"""Project timelines: a project's shared conversation and record of what happened.

Only members can read or post on a timeline. Adding or removing members needs projects:manage.
Decisions are audited. System entries come from the modules through record_event,
never from people.
"""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import select

from janus_api.audit import service as audit
from janus_api.auth.models import User
from janus_api.auth.service import Actor
from janus_api.core.deps import CurrentActor, Db, request_ip, require
from janus_api.core.errors import ApiError
from janus_api.org.models import Membership
from janus_api.projects.summary import closure_summary
from janus_api.timeline import service
from janus_api.timeline.models import ProjectTimeline, ProjectTimelineEntry, ProjectTimelineMember

router = APIRouter(prefix="/v1/project-timelines", tags=["Project timelines"])
Manage = Annotated[Actor, Depends(require("projects:manage"))]


class TimelineCreate(BaseModel):
    project_key: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=3, max_length=160)


class TimelineOut(BaseModel):
    project_key: str
    name: str
    archived: bool
    members: int
    you_are_member: bool


class EntryCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    decision: bool = False


class EntryOut(BaseModel):
    id: str
    kind: str
    author: str | None
    body: str
    payload: dict
    created_at: datetime


class MemberAdd(BaseModel):
    user_id: str


class MemberOut(BaseModel):
    user_id: str
    name: str
    added_at: datetime


async def _member_count(db: Db, timeline: ProjectTimeline) -> int:
    return len(
        (
            await db.scalars(
                select(ProjectTimelineMember.id).where(
                    ProjectTimelineMember.timeline_id == timeline.id
                )
            )
        ).all()
    )


@router.post("", response_model=TimelineOut, status_code=201)
async def create_timeline(
    data: TimelineCreate, actor: Manage, db: Db, request: Request
) -> TimelineOut:
    tenant_id = actor.session.tenant_id
    existing = await db.scalar(
        select(ProjectTimeline).where(
            ProjectTimeline.tenant_id == tenant_id,
            ProjectTimeline.project_key == data.project_key,
        )
    )
    if existing is not None:
        await service.require_member(db, existing, actor.user.id)
        return TimelineOut(
            project_key=existing.project_key,
            name=existing.name,
            archived=existing.archived_at is not None,
            members=await _member_count(db, existing),
            you_are_member=True,
        )
    timeline = ProjectTimeline(
        tenant_id=tenant_id,
        project_key=data.project_key,
        name=data.name.strip(),
        created_by=actor.user.id,
    )
    db.add(timeline)
    await db.flush()
    db.add(
        ProjectTimelineMember(
            tenant_id=tenant_id,
            timeline_id=timeline.id,
            user_id=actor.user.id,
            added_by=actor.user.id,
        )
    )
    audit.record(
        db,
        "project_timeline.created",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"project_key": data.project_key},
    )
    await db.flush()
    return TimelineOut(
        project_key=timeline.project_key,
        name=timeline.name,
        archived=False,
        members=1,
        you_are_member=True,
    )


class DirectoryOut(BaseModel):
    user_id: str
    name: str


@router.get("/directory", response_model=list[DirectoryOut])
async def directory(actor: Manage, db: Db) -> list[DirectoryOut]:
    """Active people in this company, for choosing who joins a project. Names and IDs only."""
    rows = await db.execute(
        select(User.id, User.name)
        .join(Membership, Membership.user_id == User.id)
        .where(Membership.tenant_id == actor.session.tenant_id, Membership.status == "active")
        .order_by(User.name)
    )
    return [DirectoryOut(user_id=str(user_id), name=name) for user_id, name in rows.all()]


@router.get("/{project_key}", response_model=TimelineOut)
async def read_timeline(project_key: str, actor: CurrentActor, db: Db) -> TimelineOut:
    timeline = await service.timeline_for(db, actor.session.tenant_id, project_key)
    await service.require_member(db, timeline, actor.user.id)
    return TimelineOut(
        project_key=timeline.project_key,
        name=timeline.name,
        archived=timeline.archived_at is not None,
        members=await _member_count(db, timeline),
        you_are_member=True,
    )


@router.get("/{project_key}/entries", response_model=list[EntryOut])
async def list_entries(
    project_key: str,
    actor: CurrentActor,
    db: Db,
    after: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[EntryOut]:
    timeline = await service.timeline_for(db, actor.session.tenant_id, project_key)
    await service.require_member(db, timeline, actor.user.id)
    rows = await db.execute(
        select(ProjectTimelineEntry, User.name)
        .outerjoin(User, User.id == ProjectTimelineEntry.author_id)
        .where(
            ProjectTimelineEntry.timeline_id == timeline.id,
            ProjectTimelineEntry.id > after,
        )
        .order_by(ProjectTimelineEntry.id)
        .limit(limit)
    )
    return [
        EntryOut(
            id=str(entry.id),
            kind=entry.kind,
            author=author,
            body=entry.body,
            payload=entry.payload or {},
            created_at=entry.created_at,
        )
        for entry, author in rows.all()
    ]


@router.post("/{project_key}/archive", response_model=TimelineOut)
async def archive_timeline(
    project_key: str, actor: Manage, db: Db, request: Request
) -> TimelineOut:
    """Closes the timeline: nobody can post on it afterwards. The closing is written as a system
    entry, so the record of when and by whom the project closed stays with the conversation."""
    tenant_id = actor.session.tenant_id
    timeline = await service.timeline_for(db, tenant_id, project_key)
    await service.require_member(db, timeline, actor.user.id)
    if timeline.archived_at is not None:
        raise ApiError("already_archived", "This timeline is already closed.", 409)
    timeline.archived_at = datetime.now().astimezone()
    await db.flush()
    members = await _member_count(db, timeline)
    entries = len(
        (
            await db.scalars(
                select(ProjectTimelineEntry.id).where(
                    ProjectTimelineEntry.timeline_id == timeline.id
                )
            )
        ).all()
    )
    summary = await closure_summary(db, tenant_id, project_key)
    await service.record_event(
        db,
        tenant_id,
        project_key,
        "closed",
        f"Project closed by {actor.user.name}",
        {"members": members, "entries": entries, "by": actor.user.name, "summary": summary},
    )
    audit.record(
        db,
        "project_timeline.archived",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"project_key": project_key},
    )
    return TimelineOut(
        project_key=timeline.project_key,
        name=timeline.name,
        archived=True,
        members=members,
        you_are_member=True,
    )


@router.post("/{project_key}/entries", response_model=EntryOut, status_code=201)
async def post_entry(
    project_key: str, data: EntryCreate, actor: CurrentActor, db: Db, request: Request
) -> EntryOut:
    timeline = await service.timeline_for(db, actor.session.tenant_id, project_key)
    await service.require_member(db, timeline, actor.user.id)
    if timeline.archived_at is not None:
        raise ApiError("archived", "This project is closed, so its timeline is read only.", 409)
    body = data.body.strip()
    if not body:
        raise ApiError("empty", "Write something before sending.", 422)
    entry = ProjectTimelineEntry(
        tenant_id=actor.session.tenant_id,
        timeline_id=timeline.id,
        kind="decision" if data.decision else "message",
        author_id=actor.user.id,
        body=body,
        payload={},
    )
    db.add(entry)
    await db.flush()
    if data.decision:
        audit.record(
            db,
            "project_timeline.decision",
            user_id=actor.user.id,
            tenant_id=actor.session.tenant_id,
            ip=request_ip(request),
            details={"project_key": project_key, "entry_id": entry.id},
        )
    return EntryOut(
        id=str(entry.id),
        kind=entry.kind,
        author=actor.user.name,
        body=entry.body,
        payload={},
        created_at=entry.created_at,
    )


@router.get("/{project_key}/members", response_model=list[MemberOut])
async def list_members(project_key: str, actor: CurrentActor, db: Db) -> list[MemberOut]:
    timeline = await service.timeline_for(db, actor.session.tenant_id, project_key)
    await service.require_member(db, timeline, actor.user.id)
    rows = await db.execute(
        select(ProjectTimelineMember, User.name)
        .join(User, User.id == ProjectTimelineMember.user_id)
        .where(ProjectTimelineMember.timeline_id == timeline.id)
        .order_by(ProjectTimelineMember.id)
    )
    return [
        MemberOut(user_id=str(member.user_id), name=name, added_at=member.added_at)
        for member, name in rows.all()
    ]


@router.post("/{project_key}/members", response_model=MemberOut, status_code=201)
async def add_member(
    project_key: str, data: MemberAdd, actor: Manage, db: Db, request: Request
) -> MemberOut:
    tenant_id = actor.session.tenant_id
    timeline = await service.timeline_for(db, tenant_id, project_key)
    await service.require_member(db, timeline, actor.user.id)
    try:
        user_id = int(data.user_id)
    except ValueError as error:
        raise ApiError("invalid_user", "Choose a person from the company.", 422) from error
    active = await db.scalar(
        select(Membership.id).where(
            Membership.tenant_id == tenant_id,
            Membership.user_id == user_id,
            Membership.status == "active",
        )
    )
    if active is None:
        raise ApiError(
            "not_in_company", "That person is not an active member of this company.", 422
        )
    already = await db.scalar(
        select(ProjectTimelineMember.id).where(
            ProjectTimelineMember.timeline_id == timeline.id,
            ProjectTimelineMember.user_id == user_id,
        )
    )
    if already is not None:
        raise ApiError("already_member", "That person is already on this project.", 409)
    member = ProjectTimelineMember(
        tenant_id=tenant_id,
        timeline_id=timeline.id,
        user_id=user_id,
        added_by=actor.user.id,
    )
    db.add(member)
    audit.record(
        db,
        "project_timeline.member_added",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"project_key": project_key, "member_id": user_id},
    )
    await db.flush()
    name = await db.scalar(select(User.name).where(User.id == user_id))
    return MemberOut(user_id=str(user_id), name=name or "", added_at=member.added_at)


@router.delete("/{project_key}/members/{user_id}", status_code=204)
async def remove_member(
    project_key: str, user_id: int, actor: Manage, db: Db, request: Request
) -> None:
    tenant_id = actor.session.tenant_id
    timeline = await service.timeline_for(db, tenant_id, project_key)
    await service.require_member(db, timeline, actor.user.id)
    member = await db.scalar(
        select(ProjectTimelineMember).where(
            ProjectTimelineMember.timeline_id == timeline.id,
            ProjectTimelineMember.user_id == user_id,
        )
    )
    if member is None:
        raise ApiError("not_found", "That person is not on this project.", 404)
    await db.delete(member)
    audit.record(
        db,
        "project_timeline.member_removed",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"project_key": project_key, "member_id": user_id},
    )
