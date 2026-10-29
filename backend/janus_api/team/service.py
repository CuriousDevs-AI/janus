"""Team chat: channels the whole company can read, and direct conversations between two people.

Every member can read a channel and see who is in it. Posting in a channel needs a join. A direct
conversation is read and written only by its two members. Replies go one level deep, under the
message they answer. Sends are idempotent on the Idempotency-Key, so a retry never posts twice.
"""

from datetime import UTC, datetime

from sqlalchemy import Select, func, or_, select

from janus_api.auth.models import User
from janus_api.auth.service import Actor
from janus_api.core.deps import Db
from janus_api.core.errors import ApiError
from janus_api.org.models import Membership
from janus_api.team import schemas
from janus_api.team.models import (
    TeamAttachment,
    TeamMessage,
    TeamReaction,
    TeamSpace,
    TeamSpaceMember,
)

PREVIEW_CHARS = 80
MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_BODY_CHARS = 4000
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
# extension -> (the type we serve, the bytes it must start with, or None for text)
FILE_TYPES: dict[str, tuple[str, tuple[bytes, ...] | None]] = {
    "png": ("image/png", (b"\x89PNG\r\n\x1a\n",)),
    "jpg": ("image/jpeg", (b"\xff\xd8\xff",)),
    "gif": ("image/gif", (b"GIF87a", b"GIF89a")),
    "webp": ("image/webp", None),
    "pdf": ("application/pdf", (b"%PDF-",)),
    "docx": (DOCX, (b"PK\x03\x04",)),
    "xlsx": (XLSX, (b"PK\x03\x04",)),
    "csv": ("text/csv", None),
    "txt": ("text/plain", None),
}
IMAGE_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp"}


def _now() -> datetime:
    return datetime.now(UTC)


async def _space(db: Db, tenant_id: int, space_id: int) -> TeamSpace:
    space = await db.scalar(
        select(TeamSpace).where(TeamSpace.tenant_id == tenant_id, TeamSpace.id == space_id)
    )
    if space is None:
        raise ApiError("not_found", "Conversation not found.", 404)
    return space


async def _member(db: Db, space_id: int, user_id: int) -> TeamSpaceMember | None:
    return await db.scalar(
        select(TeamSpaceMember).where(
            TeamSpaceMember.space_id == space_id, TeamSpaceMember.user_id == user_id
        )
    )


async def _readable(db: Db, actor: Actor, space: TeamSpace) -> TeamSpaceMember | None:
    """A channel is readable by every member of the company. A direct conversation is not."""
    member = await _member(db, space.id, actor.user.id)
    if space.kind == "dm" and member is None:
        raise ApiError("not_found", "Conversation not found.", 404)
    return member


async def _postable(db: Db, actor: Actor, space: TeamSpace) -> TeamSpaceMember:
    member = await _member(db, space.id, actor.user.id)
    if space.kind == "dm" and member is None:
        raise ApiError("not_found", "Conversation not found.", 404)
    if member is None:
        raise ApiError("not_joined", "Join this channel to post in it.", 403)
    return member


async def _people(db: Db, user_ids: set[int]) -> dict[int, User]:
    if not user_ids:
        return {}
    rows = (await db.scalars(select(User).where(User.id.in_(user_ids)))).all()
    return {row.id: row for row in rows}


async def _space_out(db: Db, actor: Actor, space: TeamSpace) -> schemas.SpaceOut:
    member = await _member(db, space.id, actor.user.id)
    member_count = await db.scalar(
        select(func.count())
        .select_from(TeamSpaceMember)
        .where(TeamSpaceMember.space_id == space.id)
    )
    unread = 0
    if member is not None:
        unread = (
            await db.scalar(
                select(func.count())
                .select_from(TeamMessage)
                .where(
                    TeamMessage.space_id == space.id,
                    TeamMessage.id > member.last_read_id,
                    TeamMessage.author_id != actor.user.id,
                    TeamMessage.deleted_at.is_(None),
                )
            )
            or 0
        )
    peer = None
    if space.kind == "dm":
        other = await db.scalar(
            select(TeamSpaceMember.user_id).where(
                TeamSpaceMember.space_id == space.id, TeamSpaceMember.user_id != actor.user.id
            )
        )
        if other is not None:
            person = (await _people(db, {other}))[other]
            peer = schemas.PersonOut(id=person.id, name=person.name)
    last = await db.scalar(
        select(TeamMessage)
        .where(TeamMessage.space_id == space.id, TeamMessage.parent_id.is_(None))
        .order_by(TeamMessage.id.desc())
        .limit(1)
    )
    preview = None
    if last is not None:
        preview = "Message deleted" if last.deleted_at is not None else last.body[:PREVIEW_CHARS]
    return schemas.SpaceOut(
        id=str(space.id),
        kind=space.kind,
        name=space.name,
        topic=space.topic,
        memberCount=member_count or 0,
        joined=member is not None,
        unread=unread,
        peer=peer,
        lastMessageAt=last.created_at if last else None,
        lastMessagePreview=preview,
    )


async def _messages_out(db: Db, actor: Actor, rows: list[TeamMessage]) -> list[schemas.MessageOut]:
    if not rows:
        return []
    ids = [row.id for row in rows]
    people = await _people(db, {row.author_id for row in rows})
    replies = dict(
        (
            await db.execute(
                select(TeamMessage.parent_id, func.count())
                .where(TeamMessage.parent_id.in_(ids))
                .group_by(TeamMessage.parent_id)
            )
        ).all()
    )
    reactions: dict[int, list[schemas.ReactionOut]] = {}
    grouped = await db.execute(
        select(
            TeamReaction.message_id,
            TeamReaction.emoji,
            func.count(),
            func.bool_or(TeamReaction.user_id == actor.user.id),
        )
        .where(TeamReaction.message_id.in_(ids))
        .group_by(TeamReaction.message_id, TeamReaction.emoji)
        .order_by(TeamReaction.emoji)
    )
    for message_id, emoji, count, mine in grouped.all():
        reactions.setdefault(message_id, []).append(
            schemas.ReactionOut(emoji=emoji, count=count, mine=bool(mine))
        )
    attachments: dict[int, list[schemas.AttachmentOut]] = {}
    attached = await db.execute(
        select(
            TeamAttachment.id,
            TeamAttachment.message_id,
            TeamAttachment.filename,
            TeamAttachment.content_type,
            TeamAttachment.size_bytes,
        )
        .where(TeamAttachment.message_id.in_(ids))
        .order_by(TeamAttachment.id)
    )
    for row in attached.all():
        attachments.setdefault(row.message_id, []).append(
            schemas.AttachmentOut(
                id=str(row.id),
                filename=row.filename,
                contentType=row.content_type,
                sizeBytes=row.size_bytes,
                isImage=row.content_type in IMAGE_TYPES,
            )
        )
    out = []
    for row in rows:
        author = people[row.author_id]
        deleted = row.deleted_at is not None
        out.append(
            schemas.MessageOut(
                id=str(row.id),
                spaceId=str(row.space_id),
                parentId=str(row.parent_id) if row.parent_id else None,
                author=schemas.PersonOut(id=author.id, name=author.name),
                body=None if deleted else row.body,
                createdAt=row.created_at,
                editedAt=row.edited_at,
                deleted=deleted,
                mine=row.author_id == actor.user.id,
                replyCount=replies.get(row.id, 0),
                reactions=[] if deleted else reactions.get(row.id, []),
                attachments=[] if deleted else attachments.get(row.id, []),
            )
        )
    return out


async def list_channels(db: Db, actor: Actor) -> list[schemas.SpaceOut]:
    spaces = (
        await db.scalars(
            select(TeamSpace)
            .where(TeamSpace.tenant_id == actor.session.tenant_id, TeamSpace.kind == "channel")
            .order_by(TeamSpace.name)
        )
    ).all()
    return [await _space_out(db, actor, space) for space in spaces]


async def create_channel(db: Db, actor: Actor, data: schemas.ChannelIn) -> schemas.SpaceOut:
    tenant_id = actor.session.tenant_id
    taken = await db.scalar(
        select(TeamSpace.id).where(TeamSpace.tenant_id == tenant_id, TeamSpace.name == data.name)
    )
    if taken is not None:
        raise ApiError("channel_exists", f"A channel named #{data.name} already exists.", 409)
    space = TeamSpace(
        tenant_id=tenant_id,
        kind="channel",
        name=data.name,
        topic=data.topic.strip(),
        created_by=actor.user.id,
    )
    db.add(space)
    await db.flush()
    db.add(TeamSpaceMember(tenant_id=tenant_id, space_id=space.id, user_id=actor.user.id))
    await db.flush()
    return await _space_out(db, actor, space)


async def join_channel(db: Db, actor: Actor, space_id: int) -> schemas.SpaceOut:
    space = await _space(db, actor.session.tenant_id, space_id)
    if space.kind != "channel":
        raise ApiError("not_a_channel", "Only a channel can be joined.", 422)
    if await _member(db, space.id, actor.user.id) is None:
        db.add(TeamSpaceMember(tenant_id=space.tenant_id, space_id=space.id, user_id=actor.user.id))
        await db.flush()
    return await _space_out(db, actor, space)


async def leave_channel(db: Db, actor: Actor, space_id: int) -> schemas.SpaceOut:
    space = await _space(db, actor.session.tenant_id, space_id)
    if space.kind != "channel":
        raise ApiError("not_a_channel", "Only a channel can be left.", 422)
    member = await _member(db, space.id, actor.user.id)
    if member is not None:
        await db.delete(member)
        await db.flush()
    return await _space_out(db, actor, space)


async def list_conversations(db: Db, actor: Actor) -> list[schemas.SpaceOut]:
    mine = select(TeamSpaceMember.space_id).where(TeamSpaceMember.user_id == actor.user.id)
    spaces = (
        await db.scalars(
            select(TeamSpace).where(
                TeamSpace.tenant_id == actor.session.tenant_id,
                TeamSpace.kind == "dm",
                TeamSpace.id.in_(mine),
            )
        )
    ).all()
    outs = [await _space_out(db, actor, space) for space in spaces]
    epoch = datetime.min.replace(tzinfo=UTC)
    return sorted(outs, key=lambda item: item.lastMessageAt or epoch, reverse=True)


async def open_conversation(
    db: Db, actor: Actor, data: schemas.DirectIn
) -> tuple[schemas.SpaceOut, bool]:
    tenant_id = actor.session.tenant_id
    if data.user_id == actor.user.id:
        raise ApiError("self_conversation", "You cannot start a conversation with yourself.", 422)
    person = await db.scalar(
        select(Membership.id).where(
            Membership.tenant_id == tenant_id,
            Membership.user_id == data.user_id,
            Membership.status == "active",
        )
    )
    if person is None:
        raise ApiError("person_not_found", "That person is not a member of this company.", 404)
    mine = select(TeamSpaceMember.space_id).where(TeamSpaceMember.user_id == actor.user.id)
    theirs = select(TeamSpaceMember.space_id).where(TeamSpaceMember.user_id == data.user_id)
    existing = await db.scalar(
        select(TeamSpace).where(
            TeamSpace.tenant_id == tenant_id,
            TeamSpace.kind == "dm",
            TeamSpace.id.in_(mine),
            TeamSpace.id.in_(theirs),
        )
    )
    if existing is not None:
        return await _space_out(db, actor, existing), False
    space = TeamSpace(tenant_id=tenant_id, kind="dm", name=None, created_by=actor.user.id)
    db.add(space)
    await db.flush()
    db.add_all(
        [
            TeamSpaceMember(tenant_id=tenant_id, space_id=space.id, user_id=actor.user.id),
            TeamSpaceMember(tenant_id=tenant_id, space_id=space.id, user_id=data.user_id),
        ]
    )
    await db.flush()
    return await _space_out(db, actor, space), True


async def list_messages(
    db: Db, actor: Actor, space_id: int, before_id: int, limit: int
) -> list[schemas.MessageOut]:
    space = await _space(db, actor.session.tenant_id, space_id)
    await _readable(db, actor, space)
    query: Select = select(TeamMessage).where(
        TeamMessage.space_id == space.id, TeamMessage.parent_id.is_(None)
    )
    if before_id:
        query = query.where(TeamMessage.id < before_id)
    rows = (await db.scalars(query.order_by(TeamMessage.id.desc()).limit(limit))).all()
    return await _messages_out(db, actor, list(rows))


async def list_replies(db: Db, actor: Actor, message_id: int) -> list[schemas.MessageOut]:
    parent = await _message(db, actor.session.tenant_id, message_id)
    space = await _space(db, actor.session.tenant_id, parent.space_id)
    await _readable(db, actor, space)
    rows = (
        await db.scalars(
            select(TeamMessage)
            .where(TeamMessage.parent_id == parent.id)
            .order_by(TeamMessage.id.asc())
        )
    ).all()
    return await _messages_out(db, actor, list(rows))


async def _message(db: Db, tenant_id: int, message_id: int) -> TeamMessage:
    row = await db.scalar(
        select(TeamMessage).where(TeamMessage.tenant_id == tenant_id, TeamMessage.id == message_id)
    )
    if row is None:
        raise ApiError("not_found", "Message not found.", 404)
    return row


async def post_message(
    db: Db, actor: Actor, space_id: int, data: schemas.MessageIn, idempotency_key: str
) -> tuple[schemas.MessageOut, bool]:
    tenant_id = actor.session.tenant_id
    existing = await db.scalar(
        select(TeamMessage).where(
            TeamMessage.tenant_id == tenant_id,
            TeamMessage.author_id == actor.user.id,
            TeamMessage.idempotency_key == idempotency_key,
        )
    )
    if existing is not None:
        return (await _messages_out(db, actor, [existing]))[0], False
    space = await _space(db, tenant_id, space_id)
    sender = await _postable(db, actor, space)
    if data.parent_id is not None:
        parent = await db.scalar(
            select(TeamMessage).where(
                TeamMessage.tenant_id == tenant_id,
                TeamMessage.id == data.parent_id,
                TeamMessage.space_id == space.id,
            )
        )
        if parent is None:
            raise ApiError("parent_not_found", "The message you replied to is gone.", 422)
        if parent.parent_id is not None:
            raise ApiError("thread_depth", "Replies can only go one level deep.", 422)
    row = TeamMessage(
        tenant_id=tenant_id,
        space_id=space.id,
        parent_id=data.parent_id,
        author_id=actor.user.id,
        body=data.body,
        idempotency_key=idempotency_key,
    )
    db.add(row)
    await db.flush()
    sender.last_read_id = max(sender.last_read_id, row.id)
    await db.flush()
    return (await _messages_out(db, actor, [row]))[0], True


async def edit_message(
    db: Db, actor: Actor, message_id: int, data: schemas.MessageEdit
) -> schemas.MessageOut:
    row = await _message(db, actor.session.tenant_id, message_id)
    if row.author_id != actor.user.id:
        raise ApiError("not_author", "You can only edit your own messages.", 403)
    if row.deleted_at is not None:
        raise ApiError("message_deleted", "A deleted message cannot be edited.", 409)
    row.body = data.body
    row.edited_at = _now()
    await db.flush()
    return (await _messages_out(db, actor, [row]))[0]


async def delete_message(db: Db, actor: Actor, message_id: int) -> schemas.MessageOut:
    row = await _message(db, actor.session.tenant_id, message_id)
    if row.author_id != actor.user.id:
        raise ApiError("not_author", "You can only delete your own messages.", 403)
    if row.deleted_at is None:
        row.deleted_at = _now()
        await db.flush()
    return (await _messages_out(db, actor, [row]))[0]


async def react(db: Db, actor: Actor, message_id: int, emoji: str) -> schemas.MessageOut:
    row = await _message(db, actor.session.tenant_id, message_id)
    space = await _space(db, actor.session.tenant_id, row.space_id)
    await _postable(db, actor, space)
    if row.deleted_at is not None:
        raise ApiError("message_deleted", "A deleted message cannot take reactions.", 409)
    already = await db.scalar(
        select(TeamReaction.id).where(
            TeamReaction.message_id == row.id,
            TeamReaction.user_id == actor.user.id,
            TeamReaction.emoji == emoji,
        )
    )
    if already is None:
        db.add(
            TeamReaction(
                tenant_id=row.tenant_id, message_id=row.id, user_id=actor.user.id, emoji=emoji
            )
        )
        await db.flush()
    return (await _messages_out(db, actor, [row]))[0]


async def unreact(db: Db, actor: Actor, message_id: int, emoji: str) -> schemas.MessageOut:
    row = await _message(db, actor.session.tenant_id, message_id)
    space = await _space(db, actor.session.tenant_id, row.space_id)
    await _postable(db, actor, space)
    mine = await db.scalars(
        select(TeamReaction).where(
            TeamReaction.message_id == row.id,
            TeamReaction.user_id == actor.user.id,
            TeamReaction.emoji == emoji,
        )
    )
    for reaction in mine.all():
        await db.delete(reaction)
    await db.flush()
    return (await _messages_out(db, actor, [row]))[0]


async def mark_read(db: Db, actor: Actor, space_id: int, data: schemas.ReadIn) -> None:
    space = await _space(db, actor.session.tenant_id, space_id)
    member = await _readable(db, actor, space)
    if member is None:
        return
    member.last_read_id = max(member.last_read_id, data.last_message_id)
    await db.flush()


async def list_people(db: Db, actor: Actor) -> list[schemas.PersonOut]:
    """Everyone in the company who can be messaged. Any member can see this list."""
    rows = await db.execute(
        select(User.id, User.name)
        .join(Membership, Membership.user_id == User.id)
        .where(Membership.tenant_id == actor.session.tenant_id, Membership.status == "active")
        .order_by(User.name)
    )
    return [schemas.PersonOut(id=user_id, name=name) for user_id, name in rows.all()]


def _clean_name(raw: str | None) -> str:
    name = (raw or "").replace("\\", "/").rsplit("/", 1)[-1]
    name = "".join(char for char in name if char.isprintable()).strip()
    return name[:200] or "file"


def _checked_type(name: str, data: bytes) -> str:
    """The type we serve for this file. The browser's claimed type is ignored."""
    if len(data) > MAX_FILE_BYTES:
        raise ApiError("file_too_large", "Upload a file no larger than 5 MB.", 413)
    if not data:
        raise ApiError("file_empty", "The file is empty.", 422)
    extension = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if extension not in FILE_TYPES:
        raise ApiError(
            "file_type_not_allowed",
            "Send a PNG, JPEG, GIF, WebP, PDF, Word, Excel, CSV or text file.",
            422,
        )
    served, signatures = FILE_TYPES[extension]
    if signatures is None:
        if extension == "webp":
            if not (data[:4] == b"RIFF" and data[8:12] == b"WEBP"):
                raise ApiError("file_type_not_allowed", "That file is not a WebP image.", 422)
        else:
            try:
                text = data.decode("utf-8")
            except UnicodeDecodeError as error:
                raise ApiError(
                    "file_type_not_allowed", "That text file is not UTF-8.", 422
                ) from error
            if "\x00" in text:
                raise ApiError("file_type_not_allowed", "That text file is not plain text.", 422)
    elif not any(data.startswith(signature) for signature in signatures):
        raise ApiError(
            "file_type_not_allowed", f"That file is not a real {extension.upper()} file.", 422
        )
    return served


async def post_file(
    db: Db,
    actor: Actor,
    space_id: int,
    body: str,
    filename: str | None,
    data: bytes,
    idempotency_key: str,
) -> tuple[schemas.MessageOut, bool]:
    tenant_id = actor.session.tenant_id
    existing = await db.scalar(
        select(TeamMessage).where(
            TeamMessage.tenant_id == tenant_id,
            TeamMessage.author_id == actor.user.id,
            TeamMessage.idempotency_key == idempotency_key,
        )
    )
    if existing is not None:
        return (await _messages_out(db, actor, [existing]))[0], False
    space = await _space(db, tenant_id, space_id)
    sender = await _postable(db, actor, space)
    name = _clean_name(filename)
    served = _checked_type(name, data)
    caption = body.strip() or name
    if len(caption) > MAX_BODY_CHARS:
        raise ApiError("body_too_long", "A caption can be at most 4000 characters.", 422)
    row = TeamMessage(
        tenant_id=tenant_id,
        space_id=space.id,
        parent_id=None,
        author_id=actor.user.id,
        body=caption,
        idempotency_key=idempotency_key,
    )
    db.add(row)
    await db.flush()
    db.add(
        TeamAttachment(
            tenant_id=tenant_id,
            message_id=row.id,
            uploader_id=actor.user.id,
            filename=name,
            content_type=served,
            size_bytes=len(data),
            data=data,
        )
    )
    await db.flush()
    sender.last_read_id = max(sender.last_read_id, row.id)
    await db.flush()
    return (await _messages_out(db, actor, [row]))[0], True


async def get_attachment(db: Db, actor: Actor, attachment_id: int) -> TeamAttachment:
    attachment = await db.scalar(
        select(TeamAttachment).where(
            TeamAttachment.tenant_id == actor.session.tenant_id,
            TeamAttachment.id == attachment_id,
        )
    )
    if attachment is None:
        raise ApiError("not_found", "File not found.", 404)
    message = await _message(db, actor.session.tenant_id, attachment.message_id)
    if message.deleted_at is not None:
        raise ApiError("not_found", "File not found.", 404)
    space = await _space(db, actor.session.tenant_id, message.space_id)
    await _readable(db, actor, space)
    return attachment


def _like_pattern(term: str) -> str:
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


async def search(db: Db, actor: Actor, term: str, limit: int) -> list[schemas.SearchHit]:
    """Messages that contain the words, in channels and in the actor's own conversations."""
    tenant_id = actor.session.tenant_id
    my_spaces = select(TeamSpaceMember.space_id).where(TeamSpaceMember.user_id == actor.user.id)
    rows = (
        await db.scalars(
            select(TeamMessage)
            .join(TeamSpace, TeamSpace.id == TeamMessage.space_id)
            .where(
                TeamMessage.tenant_id == tenant_id,
                TeamMessage.deleted_at.is_(None),
                TeamMessage.body.ilike(_like_pattern(term), escape="\\"),
                or_(TeamSpace.kind == "channel", TeamSpace.id.in_(my_spaces)),
            )
            .order_by(TeamMessage.id.desc())
            .limit(limit)
        )
    ).all()
    if not rows:
        return []
    spaces = {
        space.id: space
        for space in (
            await db.scalars(
                select(TeamSpace).where(TeamSpace.id.in_({row.space_id for row in rows}))
            )
        ).all()
    }
    labels: dict[int, str] = {}
    for space in spaces.values():
        if space.kind == "channel":
            labels[space.id] = f"#{space.name}"
            continue
        other = await db.scalar(
            select(TeamSpaceMember.user_id).where(
                TeamSpaceMember.space_id == space.id, TeamSpaceMember.user_id != actor.user.id
            )
        )
        person = (await _people(db, {other}))[other] if other is not None else None
        labels[space.id] = person.name if person else "Direct message"
    messages = await _messages_out(db, actor, list(rows))
    return [
        schemas.SearchHit(
            message=item,
            spaceId=str(row.space_id),
            spaceLabel=labels[row.space_id],
            spaceKind=spaces[row.space_id].kind,
        )
        for row, item in zip(rows, messages, strict=True)
    ]
