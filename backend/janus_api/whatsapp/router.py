from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy import select

from janus_api.auth.schemas import Identifier
from janus_api.auth.service import Actor
from janus_api.core.deps import Db, request_ip, require
from janus_api.whatsapp import ingest, meta, schemas, service
from janus_api.whatsapp.models import WhatsAppConnection

router = APIRouter(prefix="/v1", tags=["WhatsApp"])
Manager = Annotated[Actor, Depends(require("sources:manage"))]
Reader = Annotated[Actor, Depends(require("leads:read_own"))]
Sender = Annotated[Actor, Depends(require("leads:write"))]
Limit = Annotated[int, Query(ge=1, le=100)]
BeforeId = Annotated[int, Query(ge=0, le=2**63 - 1)]


@router.get("/whatsapp/connection", response_model=schemas.ConnectionOut | None)
async def connection(actor: Reader, db: Db) -> schemas.ConnectionOut | None:
    row = await db.scalar(select(WhatsAppConnection))
    return await service.connection_out(db, row) if row else None


@router.put("/whatsapp/connection", response_model=schemas.ConnectionOut)
async def configure(
    data: schemas.ConnectionInput, actor: Manager, db: Db, request: Request
) -> schemas.ConnectionOut:
    return await service.configure(db, actor, data, request_ip(request))


@router.get("/whatsapp/templates", response_model=list[schemas.TemplateOut])
async def templates(actor: Sender, db: Db) -> list[schemas.TemplateOut]:
    row = await service.ensure_ready(db)
    return await meta.templates(row.waba_id, service.decrypt(row.access_token_encrypted))


@router.get("/whatsapp/conversations", response_model=list[schemas.ConversationOut])
async def conversations(
    actor: Reader, db: Db, before_id: BeforeId = 0, limit: Limit = 50
) -> list[schemas.ConversationOut]:
    return await service.conversations(db, actor, before_id=before_id, limit=limit)


@router.post("/whatsapp/conversations", response_model=schemas.ConversationOut)
async def open_conversation(
    data: schemas.OpenConversation, actor: Sender, db: Db
) -> schemas.ConversationOut:
    return await service.open_conversation(db, actor, data.contactId)


@router.get(
    "/whatsapp/contacts/{contact_id}/conversation", response_model=schemas.ConversationOut | None
)
async def contact_conversation(
    contact_id: Identifier, actor: Reader, db: Db
) -> schemas.ConversationOut | None:
    """The WhatsApp conversation with this contact, or null when the contact has not messaged."""
    rows = await service.conversations(db, actor, limit=1, contact_id=int(contact_id))
    return rows[0] if rows else None


@router.get("/whatsapp/conversations/{conversation_id}", response_model=schemas.ConversationOut)
async def conversation(
    conversation_id: Identifier, actor: Reader, db: Db
) -> schemas.ConversationOut:
    await service.get_conversation(db, actor, conversation_id)
    return (await service.conversations(db, actor, conversation_id=conversation_id))[0]


@router.get(
    "/whatsapp/conversations/{conversation_id}/messages", response_model=list[schemas.MessageOut]
)
async def messages(
    conversation_id: Identifier, actor: Reader, db: Db, before_id: BeforeId = 0, limit: Limit = 50
) -> list[schemas.MessageOut]:
    return await service.messages(db, actor, conversation_id, before_id, limit)


@router.post(
    "/whatsapp/conversations/{conversation_id}/messages",
    response_model=schemas.MessageOut,
    status_code=202,
)
async def send(
    conversation_id: Identifier,
    data: schemas.SendMessage,
    actor: Sender,
    db: Db,
    request: Request,
    idempotency_key: Annotated[str, Header(max_length=128)] = "",
) -> schemas.MessageOut:
    return await service.queue_message(
        db, actor, conversation_id, data, idempotency_key, request_ip(request)
    )


@router.get("/ingest/whatsapp/{key}", response_class=PlainTextResponse)
async def verify(key: str, db: Db, request: Request) -> str:
    return await ingest.verify(db, key, request)


@router.post("/ingest/whatsapp/{key}")
async def receive(key: str, db: Db, request: Request) -> dict[str, str]:
    await ingest.receive(db, key, request)
    return {"status": "received"}
