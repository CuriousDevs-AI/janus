import asyncio
import json
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.auth.schemas import Identifier
from janus_api.auth.service import Actor
from janus_api.calls import schemas, service
from janus_api.core.db import session_factory
from janus_api.core.deps import Db, require
from janus_api.core.errors import ApiError
from janus_api.core.tenancy import set_context

router = APIRouter(prefix="/v1", tags=["Customer calls"])
public = APIRouter(prefix="/v1/public/calls", tags=["Customer calls"])
Reader = Annotated[Actor, Depends(require("leads:read_own"))]
Writer = Annotated[Actor, Depends(require("leads:write"))]


@router.get("/contacts/{contact_id}/calls", response_model=list[schemas.CallOut])
async def calls(contact_id: Identifier, actor: Reader, db: Db) -> list[schemas.CallOut]:
    return await service.list_calls(db, actor, contact_id)


@router.post("/contacts/{contact_id}/calls", response_model=schemas.CallOut, status_code=201)
async def log_call(
    contact_id: Identifier, data: schemas.LogCallIn, actor: Writer, db: Db
) -> schemas.CallOut:
    return await service.log_call(db, actor, contact_id, data)


@router.post(
    "/contacts/{contact_id}/calls/browser", response_model=schemas.BrowserCallOut, status_code=201
)
async def start_browser_call(
    contact_id: Identifier, actor: Writer, db: Db
) -> schemas.BrowserCallOut:
    return await service.start_browser_call(db, actor, contact_id)


@router.patch("/calls/{call_id}", response_model=schemas.CallOut)
async def update_call(
    call_id: Identifier, data: schemas.CallUpdate, actor: Writer, db: Db
) -> schemas.CallOut:
    return await service.update_call(db, actor, call_id, data)


@router.post("/calls/{call_id}/end", response_model=schemas.CallOut)
async def end_call(call_id: Identifier, actor: Writer, db: Db) -> schemas.CallOut:
    return await service.end_call(db, actor, call_id)


@router.post("/calls/{call_id}/signal", status_code=204)
async def agent_signal(
    call_id: Identifier, data: schemas.SignalIn, actor: Writer, db: Db
) -> Response:
    await service.agent_signal(db, actor, call_id, data)
    return Response(status_code=204)


STREAM_SECONDS = 300.0
POLL_SECONDS = 0.4
HEARTBEAT_SECONDS = 15.0


async def _events(
    request: Request,
    enter: Callable[[AsyncSession], Awaitable[int]],
    side: str,
    after: int,
) -> AsyncIterator[str]:
    """The call's state when it changes, and the other side's WebRTC messages.

    It ends after STREAM_SECONDS, or when the call ends, and the browser reconnects with
    Last-Event-ID, so no message is missed or repeated.
    """
    last = after
    snapshot = ""
    quiet = 0.0
    started = time.monotonic()
    yield "retry: 2000\n\n"
    while time.monotonic() - started < STREAM_SECONDS:
        if await request.is_disconnected():
            return
        try:
            async with session_factory()() as db:
                call_id = await enter(db)
                state = await service.call_state(db, call_id)
                fresh = await service.signals_for(db, call_id, side, last)
                await db.commit()
        except ApiError:
            state = None
        if state is None:
            yield 'event: state\ndata: {"status": "ended"}\n\n'
            return
        for item in fresh:
            last = int(item.id)
            yield f"id: {item.id}\nevent: signal\ndata: {item.model_dump_json()}\n\n"
        current = json.dumps(state)
        if current != snapshot:
            snapshot = current
            yield f"event: state\ndata: {current}\n\n"
        if state["status"] in ("ended", "expired"):
            return
        quiet = 0.0 if fresh else quiet + POLL_SECONDS
        if quiet >= HEARTBEAT_SECONDS:
            yield ": keep-alive\n\n"
            quiet = 0.0
        await asyncio.sleep(POLL_SECONDS)


def _resume(request: Request, after: int) -> int:
    resume = request.headers.get("last-event-id", "")
    return int(resume) if resume.isdigit() else after


def _stream(events: AsyncIterator[str]) -> StreamingResponse:
    return StreamingResponse(
        events,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/calls/{call_id}/stream")
async def agent_stream(
    call_id: Identifier,
    request: Request,
    actor: Writer,
    db: Db,
    after: int = Query(default=0, ge=0),
) -> StreamingResponse:
    await service.agent_call(db, actor, call_id)
    tenant_id, user_id = actor.session.tenant_id, actor.user.id

    async def enter(session: AsyncSession) -> int:
        await set_context(session, tenant_id=tenant_id, user_id=user_id)
        return call_id

    return _stream(_events(request, enter, "agent", _resume(request, after)))


# The customer's side: no account, the link's token is the key.


@public.get("/{token}", response_model=schemas.GuestCallOut)
async def guest_view(token: str, db: Db) -> schemas.GuestCallOut:
    return await service.guest_view(db, token)


@public.post("/{token}/join", status_code=204)
async def guest_join(token: str, db: Db) -> Response:
    await service.guest_join(db, token)
    return Response(status_code=204)


@public.post("/{token}/signal", status_code=204)
async def guest_signal(token: str, data: schemas.SignalIn, db: Db) -> Response:
    await service.guest_signal(db, token, data)
    return Response(status_code=204)


@public.post("/{token}/leave", status_code=204)
async def guest_leave(token: str, db: Db) -> Response:
    await service.guest_leave(db, token)
    return Response(status_code=204)


@public.get("/{token}/stream")
async def guest_stream(
    token: str, request: Request, db: Db, after: int = Query(default=0, ge=0)
) -> StreamingResponse:
    call = await service.guest_call(db, token)
    call_id = call.id

    async def enter(session: AsyncSession) -> int:
        await service.guest_call(session, token)
        return call_id

    return _stream(_events(request, enter, "guest", _resume(request, after)))
