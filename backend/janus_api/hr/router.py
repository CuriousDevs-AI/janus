from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Path, Response

from janus_api.core.db import session_factory
from janus_api.core.deps import CurrentActor, Db
from janus_api.core.tenancy import set_context
from janus_api.hr import schemas, service
from janus_api.team import hooks as team_hooks

router = APIRouter(prefix="/v1/hr", tags=["HR"])
Key = Annotated[str, Path(min_length=1, max_length=80, pattern=r"^[A-Za-z0-9_.:-]+$")]


@router.get("/records", response_model=schemas.RecordsOut)
async def records(actor: CurrentActor, db: Db) -> schemas.RecordsOut:
    return await service.list_records(db, actor)


async def _sync_dept_channels(tenant_id: int, user_id: int) -> None:
    async with session_factory()() as db:
        await set_context(db, tenant_id=tenant_id, user_id=user_id)
        await team_hooks.sync_department_channels(db, tenant_id, user_id)


@router.put("/records/{kind}/{key}", response_model=schemas.RecordOut)
async def save(
    kind: schemas.Kind,
    key: Key,
    body: schemas.RecordIn,
    actor: CurrentActor,
    db: Db,
    background: BackgroundTasks,
) -> schemas.RecordOut:
    result = await service.save(db, actor, kind, key, body)
    if kind == "config" and key == "org.departments":
        background.add_task(_sync_dept_channels, actor.session.tenant_id, actor.user.id)
    if kind == "employee":
        background.add_task(_sync_dept_channels, actor.session.tenant_id, actor.user.id)
    return result


@router.delete("/records/{kind}/{key}", status_code=204)
async def delete(kind: schemas.Kind, key: Key, actor: CurrentActor, db: Db) -> Response:
    await service.delete(db, actor, kind, key)
    return Response(status_code=204)


@router.post("/records/seed", response_model=schemas.RecordsOut)
async def seed(body: schemas.BatchIn, actor: CurrentActor, db: Db) -> schemas.RecordsOut:
    return await service.seed(db, actor, body)
