import asyncio
import logging
import time
from collections.abc import AsyncIterator
from typing import Annotated
from urllib.parse import quote

from fastapi import (
    APIRouter,
    BackgroundTasks,
    File,
    Form,
    Header,
    Query,
    Request,
    Response,
    UploadFile,
)
from fastapi.responses import StreamingResponse
from pydantic import Field

from janus_api.core import email
from janus_api.core.db import session_factory
from janus_api.core.deps import CurrentActor, Db
from janus_api.core.errors import ApiError
from janus_api.core.tenancy import set_context
from janus_api.push import service as push
from janus_api.team import schemas, service

router = APIRouter(prefix="/v1/team", tags=["Team chat"])
log = logging.getLogger(__name__)
IdempotencyKey = Annotated[str, Header(min_length=1, max_length=80)]
Limit = Annotated[int, Field(ge=1, le=100)]
MAX_UPLOAD = 5 * 1024 * 1024


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
    background: BackgroundTasks,
) -> schemas.MessageOut:
    message, created = await service.post_message(db, actor, space_id, data, idempotency_key)
    if not created:
        response.status_code = 200
    else:
        await _mail_after(db, actor, message, background)
    return message


async def _send_mail(mail: list[tuple[str, str, str]]) -> None:
    """Sends a post's emails after the response, so a slow mail server never holds up the chat."""
    sender = email.get_sender()
    for recipient, subject, body in mail:
        try:
            await sender.send(recipient, subject, body)
        except Exception:  # one bad address or a mail outage must not stop the rest
            log.warning("team post email failed", exc_info=True)


async def _mail_after(
    db: Db, actor: CurrentActor, message: schemas.MessageOut, background: BackgroundTasks
) -> None:
    """After a new post: its emails, and a push to the browsers of the people it is for."""
    mail = await service.mail_for(db, actor, message)
    if mail:
        background.add_task(_send_mail, mail)
    url = f"/team?space={message.spaceId}&workspace=team-chat"
    if message.kind == "announcement":
        background.add_task(
            push.send_to_people,
            actor.session.tenant_id,
            None,
            actor.user.id,
            {
                "title": message.title or "New announcement",
                "body": f"{actor.user.name}: {(message.body or '')[:180]}",
                "url": url,
                "tag": f"announcement-{message.id}",
            },
        )
    elif message.kind == "kudos" and message.kudos:
        background.add_task(
            push.send_to_people,
            actor.session.tenant_id,
            [message.kudos.to.id],
            actor.user.id,
            {
                "title": f"{actor.user.name} gave you kudos",
                "body": (message.body or "")[:180],
                "url": url,
                "tag": f"kudos-{message.id}",
            },
        )


@router.post("/spaces/{space_id}/posts", response_model=schemas.MessageOut, status_code=201)
async def post_kind(
    space_id: int,
    data: schemas.PostIn,
    actor: CurrentActor,
    db: Db,
    response: Response,
    idempotency_key: IdempotencyKey,
    background: BackgroundTasks,
) -> schemas.MessageOut:
    message, created = await service.create_post(db, actor, space_id, data, idempotency_key)
    if not created:
        response.status_code = 200
    else:
        await _mail_after(db, actor, message, background)
    return message


@router.post("/messages/{message_id}/respond", response_model=schemas.MessageOut)
async def respond(
    message_id: int, data: schemas.RespondIn, actor: CurrentActor, db: Db
) -> schemas.MessageOut:
    return await service.respond(db, actor, message_id, data)


@router.get("/announcements", response_model=list[schemas.AnnouncementOut])
async def announcements(
    actor: CurrentActor, db: Db, after: Annotated[int, Query(ge=0)] = 0
) -> list[schemas.AnnouncementOut]:
    return await service.latest_announcements(db, actor, after, 5)


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


@router.post("/spaces/{space_id}/files", response_model=schemas.MessageOut, status_code=201)
async def upload(
    space_id: int,
    actor: CurrentActor,
    db: Db,
    response: Response,
    idempotency_key: IdempotencyKey,
    file: Annotated[UploadFile, File()],
    body: Annotated[str, Form()] = "",
) -> schemas.MessageOut:
    data = await file.read(MAX_UPLOAD + 1)
    message, created = await service.post_file(
        db, actor, space_id, body, file.filename, data, idempotency_key
    )
    if not created:
        response.status_code = 200
    return message


@router.get("/attachments/{attachment_id}")
async def download(attachment_id: int, actor: CurrentActor, db: Db) -> Response:
    attachment = await service.get_attachment(db, actor, attachment_id)
    image = attachment.content_type in service.IMAGE_TYPES
    disposition = "inline" if image else "attachment"
    name = quote(attachment.filename)
    return Response(
        content=attachment.data,
        media_type=attachment.content_type,
        headers={
            # Images show inline; everything else downloads. Nothing is sniffed into another type.
            "Content-Disposition": f"{disposition}; filename*=UTF-8''{name}",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-cache",
        },
    )


@router.get("/search", response_model=list[schemas.SearchHit])
async def find_messages(
    actor: CurrentActor,
    db: Db,
    q: str = Query(min_length=2, max_length=100),
    limit: Limit = 20,
) -> list[schemas.SearchHit]:
    return await service.search(db, actor, q.strip(), limit)


# ---- Voice calls -------------------------------------------------------------------------------


@router.get("/ice-servers", response_model=schemas.IceConfigOut)
async def ice_servers(actor: CurrentActor) -> schemas.IceConfigOut:
    return service.ice_config(actor)


@router.get("/voice/{space_id}", response_model=schemas.CallOut)
async def call(space_id: int, actor: CurrentActor, db: Db) -> schemas.CallOut:
    return await service.call(db, actor, space_id)


@router.post("/voice/{space_id}/join", response_model=schemas.CallOut)
async def join_call(space_id: int, actor: CurrentActor, db: Db) -> schemas.CallOut:
    return await service.join_call(db, actor, space_id)


@router.post("/voice/{space_id}/leave", response_model=schemas.CallOut)
async def leave_call(space_id: int, actor: CurrentActor, db: Db) -> schemas.CallOut:
    return await service.leave_call(db, actor, space_id)


@router.post("/voice/{space_id}/state", response_model=schemas.CallOut)
async def call_state(
    space_id: int, data: schemas.VoiceStateIn, actor: CurrentActor, db: Db
) -> schemas.CallOut:
    return await service.set_call_state(db, actor, space_id, data)


@router.post("/voice/{space_id}/signal", status_code=204)
async def signal(space_id: int, data: schemas.SignalIn, actor: CurrentActor, db: Db) -> Response:
    await service.send_signal(db, actor, space_id, data)
    return Response(status_code=204)


@router.get("/voice/{space_id}/signals", response_model=list[schemas.SignalOut])
async def signals(
    space_id: int,
    actor: CurrentActor,
    db: Db,
    after: int = Query(default=0, ge=0),
) -> list[schemas.SignalOut]:
    return await service.signals(db, actor, space_id, after)


CALL_STREAM_SECONDS = 300.0
CALL_POLL_SECONDS = 0.4
CALL_TOUCH_SECONDS = 5.0
CALL_PRUNE_SECONDS = 30.0
CALL_HEARTBEAT_SECONDS = 15.0


async def _call_events(
    request: Request, tenant_id: int, user_id: int, space_id: int, after: int
) -> AsyncIterator[str]:
    """Pushes who is in the call when it changes, and the WebRTC messages for this person.

    The stream keeps the person in the call; when it stops, they drop out after a short while. It
    ends after CALL_STREAM_SECONDS and the browser reconnects with Last-Event-ID, so no message is
    missed or repeated.
    """
    last = after
    snapshot = ""
    started = time.monotonic()
    touched = pruned = 0.0
    quiet = 0.0
    yield "retry: 2000\n\n"
    while time.monotonic() - started < CALL_STREAM_SECONDS:
        if await request.is_disconnected():
            return
        now = time.monotonic()
        try:
            async with session_factory()() as db:
                await set_context(db, tenant_id=tenant_id, user_id=user_id)
                if now - touched >= CALL_TOUCH_SECONDS:
                    if not await service.touch_presence(db, user_id, space_id):
                        await db.commit()
                        yield "event: closed\ndata: {}\n\n"
                        return
                    touched = now
                if now - pruned >= CALL_PRUNE_SECONDS:
                    await service.prune_call(db, space_id)
                    pruned = now
                fresh = await service.signals_for(db, user_id, space_id, last)
                people = await service.call_people(db, space_id)
                await db.commit()
        except ApiError:
            yield "event: closed\ndata: {}\n\n"
            return
        for item in fresh:
            last = int(item.id)
            yield f"id: {item.id}\nevent: signal\ndata: {item.model_dump_json()}\n\n"
        current = schemas.CallOut(spaceId=str(space_id), participants=people).model_dump_json()
        if current != snapshot:
            snapshot = current
            yield f"event: presence\ndata: {current}\n\n"
        quiet = 0.0 if fresh else quiet + CALL_POLL_SECONDS
        if quiet >= CALL_HEARTBEAT_SECONDS:
            yield ": keep-alive\n\n"
            quiet = 0.0
        await asyncio.sleep(CALL_POLL_SECONDS)


@router.get("/voice/{space_id}/stream")
async def call_stream(
    space_id: int,
    request: Request,
    actor: CurrentActor,
    db: Db,
    after: int = Query(default=0, ge=0),
) -> StreamingResponse:
    """Server-sent events for a call. Join the call first."""
    await service.signals(db, actor, space_id, 0)
    resume = request.headers.get("last-event-id", "")
    start = int(resume) if resume.isdigit() else after
    return StreamingResponse(
        _call_events(request, actor.session.tenant_id, actor.user.id, space_id, start),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
