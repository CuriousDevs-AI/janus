from typing import Annotated

from fastapi import APIRouter, Path, Response

from janus_api.core.deps import CurrentActor, Db
from janus_api.hr import schemas, service

router = APIRouter(prefix="/v1/hr", tags=["HR"])
Key = Annotated[str, Path(min_length=1, max_length=80, pattern=r"^[A-Za-z0-9_.:-]+$")]


@router.get("/records", response_model=schemas.RecordsOut)
async def records(actor: CurrentActor, db: Db) -> schemas.RecordsOut:
    return await service.list_records(db, actor)


@router.put("/records/{kind}/{key}", response_model=schemas.RecordOut)
async def save(
    kind: schemas.Kind, key: Key, body: schemas.RecordIn, actor: CurrentActor, db: Db
) -> schemas.RecordOut:
    return await service.save(db, actor, kind, key, body)


@router.delete("/records/{kind}/{key}", status_code=204)
async def delete(kind: schemas.Kind, key: Key, actor: CurrentActor, db: Db) -> Response:
    await service.delete(db, actor, kind, key)
    return Response(status_code=204)


@router.post("/records/seed", response_model=schemas.RecordsOut)
async def seed(body: schemas.BatchIn, actor: CurrentActor, db: Db) -> schemas.RecordsOut:
    return await service.seed(db, actor, body)
