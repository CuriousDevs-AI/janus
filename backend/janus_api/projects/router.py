"""Project records on the server: the typed source for each project's key facts.

Creating, listing and changing a project's status need projects:manage. A project that is done
cannot be reopened, so its history stays fixed. The owner must be an active member of the company.
"""

from datetime import date
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select

from janus_api.audit import service as audit
from janus_api.auth.service import Actor
from janus_api.core.deps import Db, request_ip, require
from janus_api.core.errors import ApiError
from janus_api.org.models import Membership
from janus_api.projects.models import Project

router = APIRouter(prefix="/v1/project-records", tags=["Project records"])
Manage = Annotated[Actor, Depends(require("projects:manage"))]

Status = Literal["planned", "active", "on hold", "done"]


class ProjectCreate(BaseModel):
    external_key: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=3, max_length=160)
    client: str = Field(min_length=1, max_length=160)
    owner_user_id: str | None = None
    status: Status = "planned"
    budget: Decimal = Field(ge=0, le=Decimal("999999999999"))
    start_on: date
    end_on: date

    @model_validator(mode="after")
    def dates_in_order(self) -> "ProjectCreate":
        if self.end_on < self.start_on:
            raise ValueError("The end date cannot be before the start date.")
        return self


class StatusChange(BaseModel):
    status: Status


class ProjectOut(BaseModel):
    external_key: str
    name: str
    client: str
    owner_user_id: str | None
    status: str
    budget: Decimal
    start_on: date
    end_on: date


def _out(row: Project) -> ProjectOut:
    return ProjectOut(
        external_key=row.external_key,
        name=row.name,
        client=row.client,
        owner_user_id=str(row.owner_user_id) if row.owner_user_id else None,
        status=row.status,
        budget=row.budget,
        start_on=row.start_on,
        end_on=row.end_on,
    )


@router.get("", response_model=list[ProjectOut])
async def list_projects(actor: Manage, db: Db) -> list[ProjectOut]:
    rows = await db.scalars(
        select(Project).where(Project.tenant_id == actor.session.tenant_id).order_by(Project.id)
    )
    return [_out(row) for row in rows.all()]


@router.post("", response_model=ProjectOut, status_code=201)
async def create_project(
    data: ProjectCreate, actor: Manage, db: Db, request: Request
) -> ProjectOut:
    tenant_id = actor.session.tenant_id
    if await db.scalar(
        select(Project.id).where(
            Project.tenant_id == tenant_id, Project.external_key == data.external_key
        )
    ):
        raise ApiError("already_exists", "A project with this key already exists.", 409)
    owner_id: int | None = None
    if data.owner_user_id is not None:
        try:
            owner_id = int(data.owner_user_id)
        except ValueError as error:
            raise ApiError("invalid_owner", "Choose an owner from the company.", 422) from error
        active = await db.scalar(
            select(Membership.id).where(
                Membership.tenant_id == tenant_id,
                Membership.user_id == owner_id,
                Membership.status == "active",
            )
        )
        if active is None:
            raise ApiError(
                "owner_not_in_company", "That owner is not an active member of the company.", 422
            )
    row = Project(
        tenant_id=tenant_id,
        external_key=data.external_key,
        name=data.name.strip(),
        client=data.client.strip(),
        owner_user_id=owner_id,
        status=data.status,
        budget=data.budget,
        start_on=data.start_on,
        end_on=data.end_on,
        created_by=actor.user.id,
    )
    db.add(row)
    await db.flush()
    audit.record(
        db,
        "project.created",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"external_key": data.external_key},
    )
    return _out(row)


@router.patch("/{external_key}", response_model=ProjectOut)
async def change_status(
    external_key: str, data: StatusChange, actor: Manage, db: Db, request: Request
) -> ProjectOut:
    tenant_id = actor.session.tenant_id
    row = await db.scalar(
        select(Project).where(Project.tenant_id == tenant_id, Project.external_key == external_key)
    )
    if row is None:
        raise ApiError("not_found", "Project not found.", 404)
    if row.status == "done" and data.status != "done":
        raise ApiError("closed", "A closed project cannot be reopened.", 409)
    previous = row.status
    row.status = data.status
    audit.record(
        db,
        "project.status_changed",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"external_key": external_key, "from": previous, "to": data.status},
    )
    await db.flush()
    return _out(row)
