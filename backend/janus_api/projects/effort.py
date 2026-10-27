"""Typed hours, allocations and change requests for a project record.

Logging hours needs projects:manage or the person's own hours. Allocations and change decisions need
projects:manage. A change cannot be decided by the person who asked for it. Hours are capped at
12 a day per person, across all projects.
"""

from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import select

from janus_api.audit import service as audit
from janus_api.auth.service import Actor
from janus_api.core.deps import Db, request_ip, require
from janus_api.core.errors import ApiError
from janus_api.org.models import Membership
from janus_api.projects.effort_models import ProjectAllocation, ProjectChange, ProjectTimesheet
from janus_api.projects.planning import _project

router = APIRouter(prefix="/v1/project-records", tags=["Project effort"])
Manage = Annotated[Actor, Depends(require("projects:manage"))]


class TimesheetOut(BaseModel):
    user_id: str
    work_on: date
    hours: Decimal
    note: str


class HoursLog(BaseModel):
    user_id: str
    work_on: date
    hours: Decimal = Field(gt=0, le=12)
    note: str = Field(default="", max_length=300)


class AllocationSet(BaseModel):
    user_id: str
    percent: int = Field(ge=0, le=100)


class AllocationOut(BaseModel):
    user_id: str
    percent: int


class ChangeCreate(BaseModel):
    description: str = Field(min_length=5, max_length=300)
    budget_change: Decimal = Field(ge=Decimal("-999999999999"), le=Decimal("999999999999"))
    day_change: int = Field(ge=-3650, le=3650)


class ChangeOut(BaseModel):
    id: str
    description: str
    budget_change: Decimal
    day_change: int
    status: str
    requested_by: str
    decided_by: str | None


class ChangeDecision(BaseModel):
    approve: bool


async def _active_user(db: Db, tenant_id: int, user_id: str) -> int:
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


def _change_out(row: ProjectChange) -> ChangeOut:
    return ChangeOut(
        id=str(row.id),
        description=row.description,
        budget_change=row.budget_change,
        day_change=row.day_change,
        status=row.status,
        requested_by=str(row.requested_by),
        decided_by=str(row.decided_by) if row.decided_by else None,
    )


@router.post("/{project_key}/hours", response_model=TimesheetOut, status_code=201)
async def log_hours(
    project_key: str, data: HoursLog, actor: Manage, db: Db, request: Request
) -> TimesheetOut:
    tenant_id = actor.session.tenant_id
    project = await _project(db, tenant_id, project_key)
    user_id = await _active_user(db, tenant_id, data.user_id)
    already = (
        await db.scalars(
            select(ProjectTimesheet.hours).where(
                ProjectTimesheet.tenant_id == tenant_id,
                ProjectTimesheet.user_id == user_id,
                ProjectTimesheet.work_on == data.work_on,
            )
        )
    ).all()
    if sum(already) + data.hours > 12:
        raise ApiError("day_over_12", "A person cannot log more than 12 hours on one day.", 422)
    row = ProjectTimesheet(
        tenant_id=tenant_id,
        project_id=project.id,
        user_id=user_id,
        work_on=data.work_on,
        hours=data.hours,
        note=data.note.strip(),
        logged_by=actor.user.id,
    )
    db.add(row)
    await db.flush()
    audit.record(
        db,
        "project.hours_logged",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"project_key": project_key, "person": user_id},
    )
    return TimesheetOut(user_id=str(user_id), work_on=row.work_on, hours=row.hours, note=row.note)


@router.put("/{project_key}/allocations", response_model=AllocationOut)
async def set_allocation(
    project_key: str, data: AllocationSet, actor: Manage, db: Db, request: Request
) -> AllocationOut:
    tenant_id = actor.session.tenant_id
    project = await _project(db, tenant_id, project_key)
    user_id = await _active_user(db, tenant_id, data.user_id)
    row = await db.scalar(
        select(ProjectAllocation).where(
            ProjectAllocation.project_id == project.id,
            ProjectAllocation.user_id == user_id,
        )
    )
    if row is None:
        row = ProjectAllocation(
            tenant_id=tenant_id, project_id=project.id, user_id=user_id, percent=data.percent
        )
        db.add(row)
    else:
        row.percent = data.percent
    audit.record(
        db,
        "project.allocation_set",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"project_key": project_key, "person": user_id, "percent": data.percent},
    )
    await db.flush()
    return AllocationOut(user_id=str(user_id), percent=row.percent)


@router.post("/{project_key}/changes", response_model=ChangeOut, status_code=201)
async def request_change(
    project_key: str, data: ChangeCreate, actor: Manage, db: Db, request: Request
) -> ChangeOut:
    tenant_id = actor.session.tenant_id
    project = await _project(db, tenant_id, project_key)
    row = ProjectChange(
        tenant_id=tenant_id,
        project_id=project.id,
        description=data.description.strip(),
        budget_change=data.budget_change,
        day_change=data.day_change,
        status="pending",
        requested_by=actor.user.id,
    )
    db.add(row)
    await db.flush()
    audit.record(
        db,
        "project.change_requested",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"project_key": project_key, "change_id": row.id},
    )
    return _change_out(row)


@router.post("/{project_key}/changes/{change_id}/decision", response_model=ChangeOut)
async def decide_change(
    project_key: str,
    change_id: int,
    data: ChangeDecision,
    actor: Manage,
    db: Db,
    request: Request,
) -> ChangeOut:
    tenant_id = actor.session.tenant_id
    project = await _project(db, tenant_id, project_key)
    row = await db.scalar(
        select(ProjectChange).where(
            ProjectChange.project_id == project.id, ProjectChange.id == change_id
        )
    )
    if row is None:
        raise ApiError("not_found", "Change request not found.", 404)
    if row.status != "pending":
        raise ApiError("decided", "This change has already been decided.", 409)
    if row.requested_by == actor.user.id:
        raise ApiError("self_decision", "The person who asked for a change cannot decide it.", 403)
    row.status = "approved" if data.approve else "rejected"
    row.decided_by = actor.user.id
    audit.record(
        db,
        "project.change_decided",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"project_key": project_key, "change_id": change_id, "status": row.status},
    )
    await db.flush()
    return _change_out(row)
