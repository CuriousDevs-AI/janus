"""Typed milestones and tasks for a project record on the server."""

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import select

from janus_api.audit import service as audit
from janus_api.auth.service import Actor
from janus_api.core.deps import Db, request_ip, require
from janus_api.core.errors import ApiError
from janus_api.org.models import Membership
from janus_api.projects.models import Project
from janus_api.projects.planning_models import ProjectMilestone, ProjectTask

router = APIRouter(prefix="/v1/project-records", tags=["Project planning"])
Manage = Annotated[Actor, Depends(require("projects:manage"))]

MilestoneStatus = Literal["planned", "done", "accepted"]
TaskStatus = Literal["todo", "doing", "done"]


class MilestoneCreate(BaseModel):
    external_key: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=3, max_length=160)
    due_on: date
    amount: Decimal = Field(default=Decimal("0"), ge=0, le=Decimal("999999999999"))


class MilestoneOut(BaseModel):
    external_key: str
    name: str
    due_on: date
    amount: Decimal
    status: str
    completed_by: str | None
    accepted_by: str | None
    accepted_at: datetime | None


class TaskCreate(BaseModel):
    external_key: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=3, max_length=200)
    milestone_key: str | None = None
    assignee_user_id: str | None = None
    due_on: date


class TaskOut(BaseModel):
    external_key: str
    title: str
    milestone_key: str | None
    assignee_user_id: str | None
    due_on: date
    status: str


class StatusChange(BaseModel):
    status: TaskStatus | MilestoneStatus


async def _project(db: Db, tenant_id: int, project_key: str) -> Project:
    row = await db.scalar(
        select(Project).where(Project.tenant_id == tenant_id, Project.external_key == project_key)
    )
    if row is None:
        raise ApiError("not_found", "Project not found.", 404)
    return row


async def _active_member(db: Db, tenant_id: int, user_id: str | None) -> int | None:
    if user_id is None:
        return None
    try:
        value = int(user_id)
    except ValueError as error:
        raise ApiError("invalid_user", "Choose a person from the company.", 422) from error
    active = await db.scalar(
        select(Membership.id).where(
            Membership.tenant_id == tenant_id,
            Membership.user_id == value,
            Membership.status == "active",
        )
    )
    if active is None:
        raise ApiError("not_in_company", "That person is not an active member of the company.", 422)
    return value


@router.post("/{project_key}/milestones", response_model=MilestoneOut, status_code=201)
async def create_milestone(
    project_key: str, data: MilestoneCreate, actor: Manage, db: Db, request: Request
) -> MilestoneOut:
    tenant_id = actor.session.tenant_id
    project = await _project(db, tenant_id, project_key)
    if await db.scalar(
        select(ProjectMilestone.id).where(
            ProjectMilestone.tenant_id == tenant_id,
            ProjectMilestone.external_key == data.external_key,
        )
    ):
        raise ApiError("already_exists", "A milestone with this key already exists.", 409)
    row = ProjectMilestone(
        tenant_id=tenant_id,
        project_id=project.id,
        external_key=data.external_key,
        name=data.name.strip(),
        due_on=data.due_on,
        amount=data.amount,
        status="planned",
    )
    db.add(row)
    await db.flush()
    audit.record(
        db,
        "project.milestone_created",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"project_key": project_key, "milestone": data.external_key},
    )
    return _milestone_out(row, None, None)


def _milestone_out(
    row: ProjectMilestone, completed: str | None, accepted: str | None
) -> MilestoneOut:
    return MilestoneOut(
        external_key=row.external_key,
        name=row.name,
        due_on=row.due_on,
        amount=row.amount,
        status=row.status,
        completed_by=completed,
        accepted_by=accepted,
        accepted_at=row.accepted_at,
    )


@router.get("/{project_key}/milestones", response_model=list[MilestoneOut])
async def list_milestones(project_key: str, actor: Manage, db: Db) -> list[MilestoneOut]:
    project = await _project(db, actor.session.tenant_id, project_key)
    rows = await db.scalars(
        select(ProjectMilestone)
        .where(ProjectMilestone.project_id == project.id)
        .order_by(ProjectMilestone.due_on, ProjectMilestone.id)
    )
    return [_milestone_out(row, None, None) for row in rows.all()]


@router.post("/{project_key}/milestones/{milestone_key}/status", response_model=MilestoneOut)
async def move_milestone(
    project_key: str,
    milestone_key: str,
    data: StatusChange,
    actor: Manage,
    db: Db,
    request: Request,
) -> MilestoneOut:
    """Planned to done, then done to accepted by someone else. Accepted is final."""
    tenant_id = actor.session.tenant_id
    project = await _project(db, tenant_id, project_key)
    row = await db.scalar(
        select(ProjectMilestone).where(
            ProjectMilestone.project_id == project.id,
            ProjectMilestone.external_key == milestone_key,
        )
    )
    if row is None:
        raise ApiError("not_found", "Milestone not found.", 404)
    target = data.status
    if target == "done":
        if row.status != "planned":
            raise ApiError(
                "bad_transition", "Only a planned milestone can be marked complete.", 409
            )
        row.status = "done"
        row.completed_by = actor.user.id
    elif target == "accepted":
        if row.status != "done":
            raise ApiError(
                "bad_transition", "Mark the milestone complete before it is accepted.", 409
            )
        if row.completed_by == actor.user.id:
            raise ApiError(
                "self_acceptance", "The person who completed the milestone cannot accept it.", 403
            )
        row.status = "accepted"
        row.accepted_by = actor.user.id
        row.accepted_at = datetime.now().astimezone()
    else:
        raise ApiError("bad_transition", "A milestone moves to done or accepted.", 422)
    audit.record(
        db,
        "project.milestone_moved",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"project_key": project_key, "milestone": milestone_key, "to": target},
    )
    await db.flush()
    return _milestone_out(
        row,
        str(row.completed_by) if row.completed_by else None,
        str(row.accepted_by) if row.accepted_by else None,
    )


@router.post("/{project_key}/tasks", response_model=TaskOut, status_code=201)
async def create_task(
    project_key: str, data: TaskCreate, actor: Manage, db: Db, request: Request
) -> TaskOut:
    tenant_id = actor.session.tenant_id
    project = await _project(db, tenant_id, project_key)
    milestone_id: int | None = None
    if data.milestone_key is not None:
        milestone = await db.scalar(
            select(ProjectMilestone).where(
                ProjectMilestone.project_id == project.id,
                ProjectMilestone.external_key == data.milestone_key,
            )
        )
        if milestone is None:
            raise ApiError("not_found", "Milestone not found on this project.", 404)
        milestone_id = milestone.id
    assignee = await _active_member(db, tenant_id, data.assignee_user_id)
    if await db.scalar(
        select(ProjectTask.id).where(
            ProjectTask.tenant_id == tenant_id, ProjectTask.external_key == data.external_key
        )
    ):
        raise ApiError("already_exists", "A task with this key already exists.", 409)
    row = ProjectTask(
        tenant_id=tenant_id,
        project_id=project.id,
        milestone_id=milestone_id,
        external_key=data.external_key,
        title=data.title.strip(),
        assignee_user_id=assignee,
        due_on=data.due_on,
        status="todo",
    )
    db.add(row)
    await db.flush()
    audit.record(
        db,
        "project.task_created",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"project_key": project_key, "task": data.external_key},
    )
    return TaskOut(
        external_key=row.external_key,
        title=row.title,
        milestone_key=data.milestone_key,
        assignee_user_id=str(assignee) if assignee else None,
        due_on=row.due_on,
        status=row.status,
    )


@router.get("/{project_key}/tasks", response_model=list[TaskOut])
async def list_tasks(project_key: str, actor: Manage, db: Db) -> list[TaskOut]:
    project = await _project(db, actor.session.tenant_id, project_key)
    rows = await db.scalars(
        select(ProjectTask).where(ProjectTask.project_id == project.id).order_by(ProjectTask.id)
    )
    milestone_keys = {
        m.id: m.external_key
        for m in (
            await db.scalars(
                select(ProjectMilestone).where(ProjectMilestone.project_id == project.id)
            )
        ).all()
    }
    return [
        TaskOut(
            external_key=row.external_key,
            title=row.title,
            milestone_key=milestone_keys.get(row.milestone_id),
            assignee_user_id=str(row.assignee_user_id) if row.assignee_user_id else None,
            due_on=row.due_on,
            status=row.status,
        )
        for row in rows.all()
    ]


@router.post("/{project_key}/tasks/{task_key}/status", response_model=TaskOut)
async def move_task(
    project_key: str, task_key: str, data: StatusChange, actor: Manage, db: Db, request: Request
) -> TaskOut:
    tenant_id = actor.session.tenant_id
    project = await _project(db, tenant_id, project_key)
    row = await db.scalar(
        select(ProjectTask).where(
            ProjectTask.project_id == project.id, ProjectTask.external_key == task_key
        )
    )
    if row is None:
        raise ApiError("not_found", "Task not found.", 404)
    if data.status not in ("todo", "doing", "done"):
        raise ApiError("bad_transition", "A task is to do, doing or done.", 422)
    row.status = data.status
    audit.record(
        db,
        "project.task_moved",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"project_key": project_key, "task": task_key, "to": data.status},
    )
    await db.flush()
    return TaskOut(
        external_key=row.external_key,
        title=row.title,
        milestone_key=None,
        assignee_user_id=str(row.assignee_user_id) if row.assignee_user_id else None,
        due_on=row.due_on,
        status=row.status,
    )
