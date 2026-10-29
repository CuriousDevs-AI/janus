from typing import Annotated

from fastapi import APIRouter, Header, Response
from pydantic import Field

from janus_api.core.deps import CurrentActor, Db
from janus_api.team import schemas, service

router = APIRouter(prefix="/v1/team", tags=["Team chat"])
IdempotencyKey = Annotated[str, Header(min_length=1, max_length=80)]
Limit = Annotated[int, Field(ge=1, le=100)]


@router.get("/channels", response_model=list[schemas.SpaceOut])
async def channels(actor: CurrentActor, db: Db) -> list[schemas.SpaceOut]:
    return await service.list_channels(db, actor)


@router.post("/channels", response_model=schemas.SpaceOut, status_code=201)
async def create_channel(data: schemas.ChannelIn, actor: CurrentActor, db: Db) -> schemas.SpaceOut:
    return await service.create_channel(db, actor, data)


@router.post("/channels/{space_id}/join", response_model=schemas.SpaceOut)
async def join(space_id: int, actor: CurrentActor, db: Db) -> schemas.SpaceOut:
    return await service.join_channel(db, actor, space_id)


@router.post("/channels/{space_id}/leave", response_model=schemas.SpaceOut)
async def leave(space_id: int, actor: CurrentActor, db: Db) -> schemas.SpaceOut:
    return await service.leave_channel(db, actor, space_id)


@router.get("/conversations", response_model=list[schemas.SpaceOut])
async def conversations(actor: CurrentActor, db: Db) -> list[schemas.SpaceOut]:
    return await service.list_conversations(db, actor)


@router.post("/conversations", response_model=schemas.SpaceOut, status_code=201)
async def open_conversation(
    data: schemas.DirectIn, actor: CurrentActor, db: Db, response: Response
) -> schemas.SpaceOut:
    space, created = await service.open_conversation(db, actor, data)
    if not created:
        response.status_code = 200
    return space


@router.get("/spaces/{space_id}/messages", response_model=list[schemas.MessageOut])
async def messages(
    space_id: int,
    actor: CurrentActor,
    db: Db,
    before_id: Annotated[int, Field(ge=0)] = 0,
    limit: Limit = 50,
) -> list[schemas.MessageOut]:
    return await service.list_messages(db, actor, space_id, before_id, limit)


@router.post("/spaces/{space_id}/messages", response_model=schemas.MessageOut, status_code=201)
async def post(
    space_id: int,
    data: schemas.MessageIn,
    actor: CurrentActor,
    db: Db,
    response: Response,
    idempotency_key: IdempotencyKey,
) -> schemas.MessageOut:
    message, created = await service.post_message(db, actor, space_id, data, idempotency_key)
    if not created:
        response.status_code = 200
    return message


@router.post("/spaces/{space_id}/read", status_code=204)
async def read(space_id: int, data: schemas.ReadIn, actor: CurrentActor, db: Db) -> Response:
    await service.mark_read(db, actor, space_id, data)
    return Response(status_code=204)


@router.get("/messages/{message_id}/replies", response_model=list[schemas.MessageOut])
async def replies(message_id: int, actor: CurrentActor, db: Db) -> list[schemas.MessageOut]:
    return await service.list_replies(db, actor, message_id)


@router.patch("/messages/{message_id}", response_model=schemas.MessageOut)
async def edit(
    message_id: int, data: schemas.MessageEdit, actor: CurrentActor, db: Db
) -> schemas.MessageOut:
    return await service.edit_message(db, actor, message_id, data)


@router.delete("/messages/{message_id}", response_model=schemas.MessageOut)
async def delete(message_id: int, actor: CurrentActor, db: Db) -> schemas.MessageOut:
    return await service.delete_message(db, actor, message_id)


@router.post("/messages/{message_id}/reactions", response_model=schemas.MessageOut)
async def add_reaction(
    message_id: int, data: schemas.ReactionIn, actor: CurrentActor, db: Db
) -> schemas.MessageOut:
    return await service.react(db, actor, message_id, data.emoji)


@router.post("/messages/{message_id}/reactions/remove", response_model=schemas.MessageOut)
async def remove_reaction(
    message_id: int, data: schemas.ReactionIn, actor: CurrentActor, db: Db
) -> schemas.MessageOut:
    return await service.unreact(db, actor, message_id, data.emoji)


@router.get("/people", response_model=list[schemas.PersonOut])
async def people(actor: CurrentActor, db: Db) -> list[schemas.PersonOut]:
    return await service.list_people(db, actor)
