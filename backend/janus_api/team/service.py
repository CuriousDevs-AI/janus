"""Team chat: channels the whole company can read, and direct conversations between two people.

Every member can read a channel and see who is in it. Posting in a channel needs a join. A direct
conversation is read and written only by its two members. Replies go one level deep, under the
message they answer. Sends are idempotent on the Idempotency-Key, so a retry never posts twice.
"""

import base64
import hashlib
import hmac
import time
from datetime import UTC, datetime, timedelta

from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.dialects.postgresql import insert

from janus_api.auth.models import User
from janus_api.auth.service import Actor
from janus_api.core.config import get_settings
from janus_api.core.deps import Db
from janus_api.core.errors import ApiError
from janus_api.org import service as org_service
from janus_api.team import schemas
from janus_api.team.models import (
    TeamAttachment,
    TeamCallEvent,
    TeamMessage,
    TeamMessageSeen,
    TeamReaction,
    TeamResponse,
    TeamSavedMessage,
    TeamSignal,
    TeamSpace,
    TeamSpaceMember,
    TeamVoicePresence,
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
    found: TeamSpaceMember | None = await db.scalar(
        select(TeamSpaceMember).where(
            TeamSpaceMember.space_id == space_id, TeamSpaceMember.user_id == user_id
        )
    )
    return found


async def _readable(db: Db, actor: Actor, space: TeamSpace) -> TeamSpaceMember | None:
    """Channels are readable by every member of the company. A conversation is not."""
    member = await _member(db, space.id, actor.user.id)
    if space.kind in ("dm", "group") and member is None:
        raise ApiError("not_found", "Conversation not found.", 404)
    return member


ANNOUNCER = "announcements:post"
ANNOUNCEMENTS = "announcements"
EVENT_ANSWERS = ("going", "maybe", "no")


def _announcer(actor: Actor) -> bool:
    return ANNOUNCER in actor.permissions


async def _postable(db: Db, actor: Actor, space: TeamSpace) -> TeamSpaceMember:
    if space.announcements and not _announcer(actor):
        raise ApiError("announcers_only", "Only people who make announcements can post here.", 403)
    member = await _member(db, space.id, actor.user.id)
    if space.kind in ("dm", "group") and member is None:
        raise ApiError("not_found", "Conversation not found.", 404)
    if member is None:
        raise ApiError("not_joined", "Join this channel to post in it.", 403)
    return member


async def _people(db: Db, user_ids: set[int]) -> dict[int, User]:
    if not user_ids:
        return {}
    rows = (await db.scalars(select(User).where(User.id.in_(user_ids)))).all()
    return {row.id: row for row in rows}


async def _others(db: Db, actor: Actor, space: TeamSpace) -> list[schemas.PersonOut]:
    """The other members of a conversation, by name."""
    rows = (
        await db.execute(
            select(User.id, User.name)
            .join(TeamSpaceMember, TeamSpaceMember.user_id == User.id)
            .where(TeamSpaceMember.space_id == space.id, TeamSpaceMember.user_id != actor.user.id)
            .order_by(User.name)
        )
    ).all()
    return [schemas.PersonOut(id=user_id, name=name) for user_id, name in rows]


def _title(space: TeamSpace, others: list[schemas.PersonOut]) -> str:
    if space.kind == "channel":
        return f"#{space.name}"
    if space.kind == "voice":
        return space.name or "Voice"
    if space.kind == "dm":
        return others[0].name if others else "Direct message"
    if not others:
        return "Group"
    names = [person.name for person in others]
    extra = len(names) - 3
    return ", ".join(names[:3]) + (f" +{extra}" if extra > 0 else "")


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
    others = [] if space.kind in ("channel", "voice") else await _others(db, actor, space)
    peer = others[0] if space.kind == "dm" and others else None
    last = await db.scalar(
        select(TeamMessage)
        .where(TeamMessage.space_id == space.id, TeamMessage.parent_id.is_(None))
        .order_by(TeamMessage.id.desc())
        .limit(1)
    )
    preview = None
    if last is not None:
        preview = "Message deleted" if last.deleted_at is not None else _preview(last)
    return schemas.SpaceOut(
        id=str(space.id),
        kind=space.kind,
        name=space.name,
        title=_title(space, others),
        topic=space.topic,
        memberCount=member_count or 0,
        joined=member is not None,
        unread=unread,
        peer=peer,
        lastMessageAt=last.created_at if last else None,
        lastMessagePreview=preview,
        inCall=await call_people(db, space.id),
        announcements=space.announcements,
        canPost=not space.announcements or _announcer(actor),
        private=space.private,
    )


async def _spaces_out(db: Db, actor: Actor, spaces: list[TeamSpace]) -> list[schemas.SpaceOut]:
    """Batch version of _space_out: loads related data in a few queries, not per space."""
    if not spaces:
        return []
    space_ids = [space.id for space in spaces]

    # 1. Member lookup for actor: which spaces has this user joined?
    members_rows = (
        await db.scalars(
            select(TeamSpaceMember).where(
                TeamSpaceMember.space_id.in_(space_ids),
                TeamSpaceMember.user_id == actor.user.id,
            )
        )
    ).all()
    members: dict[int, TeamSpaceMember] = {m.space_id: m for m in members_rows}

    # 2. Member counts per space
    mc_rows = (
        await db.execute(
            select(TeamSpaceMember.space_id, func.count())
            .where(TeamSpaceMember.space_id.in_(space_ids))
            .group_by(TeamSpaceMember.space_id)
        )
    ).all()
    member_counts: dict[int, int] = {sid: cnt for sid, cnt in mc_rows}

    # 3. Unread counts: for each joined space, count messages after last_read_id
    unread_map: dict[int, int] = {}
    joined_spaces = [(sid, m) for sid, m in members.items()]
    if joined_spaces:
        conditions = [
            and_(
                TeamMessage.space_id == sid,
                TeamMessage.id > m.last_read_id,
            )
            for sid, m in joined_spaces
        ]
        unread_rows = (
            await db.execute(
                select(TeamMessage.space_id, func.count())
                .where(
                    or_(*conditions),
                    TeamMessage.author_id != actor.user.id,
                    TeamMessage.deleted_at.is_(None),
                )
                .group_by(TeamMessage.space_id)
            )
        ).all()
        unread_map = {sid: cnt for sid, cnt in unread_rows}

    # 4. Last message per space (top-level only)
    last_msg_sub = (
        select(
            TeamMessage.space_id,
            func.max(TeamMessage.id).label("max_id"),
        )
        .where(
            TeamMessage.space_id.in_(space_ids),
            TeamMessage.parent_id.is_(None),
        )
        .group_by(TeamMessage.space_id)
        .subquery()
    )
    last_msgs_rows = (
        await db.scalars(
            select(TeamMessage).join(
                last_msg_sub,
                and_(
                    TeamMessage.id == last_msg_sub.c.max_id,
                    TeamMessage.space_id == last_msg_sub.c.space_id,
                ),
            )
        )
    ).all()
    last_msgs: dict[int, TeamMessage] = {m.space_id: m for m in last_msgs_rows}

    # 5. Others for DM/group spaces (batch load all members of non-channel spaces)
    dm_group_ids = [s.id for s in spaces if s.kind in ("dm", "group")]
    others_map: dict[int, list[schemas.PersonOut]] = {sid: [] for sid in dm_group_ids}
    if dm_group_ids:
        other_rows = (
            await db.execute(
                select(TeamSpaceMember.space_id, User.id, User.name)
                .join(User, User.id == TeamSpaceMember.user_id)
                .where(
                    TeamSpaceMember.space_id.in_(dm_group_ids),
                    TeamSpaceMember.user_id != actor.user.id,
                )
                .order_by(User.name)
            )
        ).all()
        for sid, uid, uname in other_rows:
            others_map[sid].append(schemas.PersonOut(id=uid, name=uname))

    # 6. Call presence per space (batch)
    call_rows = (
        await db.execute(
            select(TeamVoicePresence, User.name)
            .join(User, User.id == TeamVoicePresence.user_id)
            .where(
                TeamVoicePresence.space_id.in_(space_ids),
                TeamVoicePresence.seen_at > _now() - CALL_STALE,
            )
            .order_by(TeamVoicePresence.joined_at, TeamVoicePresence.id)
        )
    ).all()
    call_map: dict[int, list[schemas.CallPersonOut]] = {sid: [] for sid in space_ids}
    for row, name in call_rows:
        call_map[row.space_id].append(
            schemas.CallPersonOut(
                id=row.user_id,
                name=name,
                muted=row.muted,
                deafened=row.deafened,
                sharing=row.sharing,
            )
        )

    # Build outputs
    out: list[schemas.SpaceOut] = []
    for space in spaces:
        member = members.get(space.id)
        others = others_map.get(space.id, [])
        peer = others[0] if space.kind == "dm" and others else None
        last = last_msgs.get(space.id)
        preview = None
        if last is not None:
            preview = "Message deleted" if last.deleted_at is not None else _preview(last)
        out.append(
            schemas.SpaceOut(
                id=str(space.id),
                kind=space.kind,
                name=space.name,
                title=_title(space, others),
                topic=space.topic,
                memberCount=member_counts.get(space.id, 0),
                joined=member is not None,
                unread=unread_map.get(space.id, 0),
                peer=peer,
                lastMessageAt=last.created_at if last else None,
                lastMessagePreview=preview,
                inCall=call_map.get(space.id, []),
                announcements=space.announcements,
                canPost=not space.announcements or _announcer(actor),
                private=space.private,
            )
        )
    return out


def _preview(row: TeamMessage) -> str:
    meta = row.meta or {}
    labels = {
        "announcement": "📣 ",
        "kudos": "🎉 Kudos: ",
        "poll": "📊 Poll: ",
        "event": "📅 ",
        "meeting": "📅 Meeting: ",
    }
    text = meta.get("title") or row.body
    return (labels.get(row.kind, "") + text)[:PREVIEW_CHARS]


async def _posts_out(db: Db, actor: Actor, rows: list[TeamMessage]) -> dict[int, dict[str, object]]:
    """The extra fields of each post: who kudos are for, poll results, who is going to an event."""
    posts = [row for row in rows if row.kind != "text" and row.deleted_at is None]
    if not posts:
        return {}
    answers: dict[int, list[tuple[int, str]]] = {}
    asked = [row.id for row in posts if row.kind in ("poll", "event", "meeting")]
    if asked:
        found = await db.execute(
            select(TeamResponse.message_id, TeamResponse.user_id, TeamResponse.value).where(
                TeamResponse.message_id.in_(asked)
            )
        )
        for message_id, user_id, value in found.all():
            answers.setdefault(message_id, []).append((user_id, value))
    named = await _people(
        db, {int(row.meta["to"]) for row in posts if row.kind == "kudos" and row.meta}
    )
    out: dict[int, dict[str, object]] = {}
    for row in posts:
        meta = row.meta or {}
        given = answers.get(row.id, [])
        mine = next((value for user_id, value in given if user_id == actor.user.id), None)
        extra: dict[str, object] = {"title": meta.get("title") or None}
        if row.kind == "kudos" and meta.get("to") in named:
            person = named[meta["to"]]
            extra["kudos"] = schemas.KudosOut(
                to=schemas.PersonOut(id=person.id, name=person.name), value=meta.get("value", "")
            )
        elif row.kind == "poll":
            closes = datetime.fromisoformat(meta["closes_at"]) if meta.get("closes_at") else None
            anon = bool(meta.get("anonymous"))
            extra["poll"] = schemas.PollOut(
                options=[
                    schemas.PollOptionOut(
                        id=option["id"],
                        text=option["text"],
                        votes=sum(1 for _, value in given if value == option["id"]),
                    )
                    for option in meta.get("options", [])
                ],
                myVote=mine,
                total=len(given),
                closesAt=closes,
                closed=bool(closes and closes <= _now()),
                anonymous=anon,
            )
        elif row.kind == "event":
            extra["event"] = schemas.EventOut(
                startsAt=datetime.fromisoformat(meta["starts_at"]),
                place=meta.get("place", ""),
                going=sum(1 for _, value in given if value == "going"),
                maybe=sum(1 for _, value in given if value == "maybe"),
                declined=sum(1 for _, value in given if value == "no"),
                mine=mine,
            )
        elif row.kind == "meeting":
            join_url = f"/team?space={row.space_id}&meeting={row.id}&workspace=team-chat"
            extra["meeting"] = schemas.MeetingOut(
                startsAt=datetime.fromisoformat(meta["starts_at"]),
                durationMinutes=meta.get("duration_minutes", 30),
                agenda=meta.get("agenda", ""),
                going=sum(1 for _, value in given if value == "going"),
                maybe=sum(1 for _, value in given if value == "maybe"),
                declined=sum(1 for _, value in given if value == "no"),
                mine=mine,
                joinUrl=join_url,
            )
        out[row.id] = extra
    return out


async def _messages_out(db: Db, actor: Actor, rows: list[TeamMessage]) -> list[schemas.MessageOut]:
    if not rows:
        return []
    ids = [row.id for row in rows]
    people = await _people(db, {row.author_id for row in rows})
    replies: dict[int | None, int] = {
        parent: count
        for parent, count in (
            await db.execute(
                select(TeamMessage.parent_id, func.count())
                .where(TeamMessage.parent_id.in_(ids))
                .group_by(TeamMessage.parent_id)
            )
        ).all()
    }
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
    for attached_row in attached.all():
        attachments.setdefault(attached_row.message_id, []).append(
            schemas.AttachmentOut(
                id=str(attached_row.id),
                filename=attached_row.filename,
                contentType=attached_row.content_type,
                sizeBytes=attached_row.size_bytes,
                isImage=attached_row.content_type in IMAGE_TYPES,
            )
        )
    posts = await _posts_out(db, actor, rows)
    pinner_ids = {row.pinned_by for row in rows if row.pinned_by is not None}
    pinners = await _people(db, pinner_ids) if pinner_ids else {}
    saved_ids: set[int] = set(
        (
            await db.scalars(
                select(TeamSavedMessage.message_id).where(
                    TeamSavedMessage.user_id == actor.user.id,
                    TeamSavedMessage.message_id.in_(ids),
                )
            )
        ).all()
    )
    out = []
    for row in rows:
        author = people[row.author_id]
        deleted = row.deleted_at is not None
        pinner = pinners.get(row.pinned_by) if row.pinned_by else None
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
                kind=row.kind,
                pinned=row.pinned_at is not None,
                pinnedBy=schemas.PersonOut(id=pinner.id, name=pinner.name) if pinner else None,
                saved=row.id in saved_ids,
                **posts.get(row.id, {}),
            )
        )
    return out


async def _announcements_space(db: Db, actor: Actor) -> TeamSpace:
    """The company's announcements channel, made the first time anyone opens Team Chat.

    Everyone is in it, so it counts unread for everyone; a channel already named #announcements
    becomes it.
    """
    tenant_id = actor.session.tenant_id
    space = await db.scalar(
        select(TeamSpace).where(TeamSpace.tenant_id == tenant_id, TeamSpace.announcements)
    )
    if space is None:
        # Two people can open Team Chat at once: the second insert does nothing, and the row lock
        # makes the second wait for the first to mark the channel, then see it marked.
        await db.execute(
            insert(TeamSpace)
            .values(
                tenant_id=tenant_id,
                kind="channel",
                name=ANNOUNCEMENTS,
                topic="Official news from the company",
                created_by=actor.user.id,
            )
            .on_conflict_do_nothing(index_elements=["tenant_id", "name"])
        )
        space = await db.scalar(
            select(TeamSpace)
            .where(TeamSpace.tenant_id == tenant_id, TeamSpace.name == ANNOUNCEMENTS)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        assert space is not None
        if not space.announcements:
            space.kind = "channel"
            space.announcements = True
            await db.flush()
    # The same person in two tabs joins once.
    await db.execute(
        insert(TeamSpaceMember)
        .values(tenant_id=tenant_id, space_id=space.id, user_id=actor.user.id)
        .on_conflict_do_nothing(index_elements=["space_id", "user_id"])
    )
    return space


async def list_channels(db: Db, actor: Actor) -> list[schemas.SpaceOut]:
    await _announcements_space(db, actor)
    my_spaces = select(TeamSpaceMember.space_id).where(TeamSpaceMember.user_id == actor.user.id)
    spaces = (
        await db.scalars(
            select(TeamSpace)
            .where(
                TeamSpace.tenant_id == actor.session.tenant_id,
                TeamSpace.kind.in_(["channel", "voice"]),
                or_(TeamSpace.private.is_(False), TeamSpace.id.in_(my_spaces)),
            )
            .order_by(TeamSpace.announcements.desc(), TeamSpace.kind, TeamSpace.name)
        )
    ).all()
    return await _spaces_out(db, actor, list(spaces))


async def create_channel(db: Db, actor: Actor, data: schemas.ChannelIn) -> schemas.SpaceOut:
    tenant_id = actor.session.tenant_id
    taken = await db.scalar(
        select(TeamSpace.id).where(TeamSpace.tenant_id == tenant_id, TeamSpace.name == data.name)
    )
    if taken is not None:
        raise ApiError("channel_exists", f"A channel named #{data.name} already exists.", 409)
    space = TeamSpace(
        tenant_id=tenant_id,
        kind="voice" if data.voice else "channel",
        name=data.name,
        topic=data.topic.strip(),
        private=data.private,
        created_by=actor.user.id,
    )
    db.add(space)
    await db.flush()
    db.add(TeamSpaceMember(tenant_id=tenant_id, space_id=space.id, user_id=actor.user.id))
    await db.flush()
    return await _space_out(db, actor, space)


async def join_channel(db: Db, actor: Actor, space_id: int) -> schemas.SpaceOut:
    space = await _space(db, actor.session.tenant_id, space_id)
    if space.kind not in ("channel", "voice"):
        raise ApiError("not_a_channel", "Only a channel can be joined.", 422)
    if space.private and await _member(db, space.id, actor.user.id) is None:
        raise ApiError("private_channel", "This channel is private. Ask a member to add you.", 403)
    if await _member(db, space.id, actor.user.id) is None:
        db.add(TeamSpaceMember(tenant_id=space.tenant_id, space_id=space.id, user_id=actor.user.id))
        await db.flush()
    return await _space_out(db, actor, space)


async def leave_channel(db: Db, actor: Actor, space_id: int) -> schemas.SpaceOut:
    space = await _space(db, actor.session.tenant_id, space_id)
    if space.kind not in ("channel", "voice"):
        raise ApiError("not_a_channel", "Only a channel can be left.", 422)
    if space.announcements:
        raise ApiError("announcements_stay", "Everyone stays in announcements.", 422)
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
                TeamSpace.kind.in_(["dm", "group"]),
                TeamSpace.id.in_(mine),
            )
        )
    ).all()
    outs = await _spaces_out(db, actor, list(spaces))
    epoch = datetime.min.replace(tzinfo=UTC)
    return sorted(outs, key=lambda item: item.lastMessageAt or epoch, reverse=True)


async def open_conversation(
    db: Db, actor: Actor, data: schemas.DirectIn
) -> tuple[schemas.SpaceOut, bool]:
    """One person makes a direct conversation; two or more make a group."""
    tenant_id = actor.session.tenant_id
    people = set(data.user_ids) | ({data.user_id} if data.user_id else set())
    if not people:
        raise ApiError("no_people", "Choose at least one person.", 422)
    if actor.user.id in people:
        raise ApiError("self_conversation", "You cannot start a conversation with yourself.", 422)
    active = await org_service.active_user_ids(db, tenant_id, people)
    if active != people:
        raise ApiError("person_not_found", "That person is not a member of this company.", 404)
    everyone = people | {actor.user.id}
    kind = "dm" if len(people) == 1 else "group"
    mine = select(TeamSpaceMember.space_id).where(TeamSpaceMember.user_id == actor.user.id)
    candidates = (
        await db.scalars(
            select(TeamSpace).where(
                TeamSpace.tenant_id == tenant_id,
                TeamSpace.kind == kind,
                TeamSpace.id.in_(mine),
            )
        )
    ).all()
    for candidate in candidates:
        members = set(
            (
                await db.scalars(
                    select(TeamSpaceMember.user_id).where(TeamSpaceMember.space_id == candidate.id)
                )
            ).all()
        )
        if members == everyone:
            return await _space_out(db, actor, candidate), False
    space = TeamSpace(tenant_id=tenant_id, kind=kind, name=None, created_by=actor.user.id)
    db.add(space)
    await db.flush()
    db.add_all(
        [TeamSpaceMember(tenant_id=tenant_id, space_id=space.id, user_id=user) for user in everyone]
    )
    await db.flush()
    return await _space_out(db, actor, space), True


async def list_messages(
    db: Db, actor: Actor, space_id: int, before_id: int, limit: int
) -> list[schemas.MessageOut]:
    space = await _space(db, actor.session.tenant_id, space_id)
    await _readable(db, actor, space)
    query: Select[tuple[TeamMessage]] = select(TeamMessage).where(
        TeamMessage.space_id == space.id, TeamMessage.parent_id.is_(None)
    )
    if before_id:
        query = query.where(TeamMessage.id < before_id)
    rows = (await db.scalars(query.order_by(TeamMessage.id.desc()).limit(limit))).all()
    return await _messages_out(db, actor, list(rows))


async def list_replies(
    db: Db, actor: Actor, message_id: int, limit: int = 50
) -> list[schemas.MessageOut]:
    parent = await _message(db, actor.session.tenant_id, message_id)
    space = await _space(db, actor.session.tenant_id, parent.space_id)
    await _readable(db, actor, space)
    rows = (
        await db.scalars(
            select(TeamMessage)
            .where(TeamMessage.parent_id == parent.id)
            .order_by(TeamMessage.id.asc())
            .limit(limit)
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
        kind="announcement" if space.announcements and data.parent_id is None else "text",
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
    people = await org_service.active_people(db, actor.session.tenant_id)
    return [schemas.PersonOut(id=user_id, name=name) for user_id, name, _ in people]


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
                or_(
                    and_(TeamSpace.kind == "channel", TeamSpace.private.is_(False)),
                    TeamSpace.id.in_(my_spaces),
                ),
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
        others = [] if space.kind in ("channel", "voice") else await _others(db, actor, space)
        labels[space.id] = _title(space, others)
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


# ---- Voice calls ---------------------------------------------------------------------------------

# A person drops out of a call when their stream has not refreshed them for this long.
CALL_STALE = timedelta(seconds=20)
SIGNAL_TTL = timedelta(minutes=2)


async def _call_space(db: Db, actor: Actor, space_id: int) -> TeamSpace:
    """Any conversation can hold a call. A group or DM call is for its members only."""
    space = await _space(db, actor.session.tenant_id, space_id)
    await _readable(db, actor, space)
    return space


async def call_people(db: Db, space_id: int) -> list[schemas.CallPersonOut]:
    """Who is in the call now, oldest first."""
    rows = (
        await db.execute(
            select(TeamVoicePresence, User.name)
            .join(User, User.id == TeamVoicePresence.user_id)
            .where(
                TeamVoicePresence.space_id == space_id,
                TeamVoicePresence.seen_at > _now() - CALL_STALE,
            )
            .order_by(TeamVoicePresence.joined_at, TeamVoicePresence.id)
        )
    ).all()
    return [
        schemas.CallPersonOut(
            id=row.user_id,
            name=name,
            muted=row.muted,
            deafened=row.deafened,
            sharing=row.sharing,
        )
        for row, name in rows
    ]


async def _presence(db: Db, space_id: int, user_id: int) -> TeamVoicePresence | None:
    found: TeamVoicePresence | None = await db.scalar(
        select(TeamVoicePresence).where(
            TeamVoicePresence.space_id == space_id,
            TeamVoicePresence.user_id == user_id,
            TeamVoicePresence.seen_at > _now() - CALL_STALE,
        )
    )
    return found


async def join_call(db: Db, actor: Actor, space_id: int) -> schemas.CallOut:
    """Joins this call, and leaves any other call the person was in."""
    tenant_id = actor.session.tenant_id
    space = await _call_space(db, actor, space_id)
    others = await db.scalars(
        select(TeamVoicePresence).where(
            TeamVoicePresence.tenant_id == tenant_id,
            TeamVoicePresence.user_id == actor.user.id,
        )
    )
    current = None
    for row in others.all():
        if row.space_id == space.id:
            current = row
        else:
            await db.delete(row)
    fresh = current is None or current.seen_at <= _now() - CALL_STALE
    if current is None:
        db.add(TeamVoicePresence(tenant_id=tenant_id, space_id=space.id, user_id=actor.user.id))
    else:
        if fresh:
            # Back after dropping out: a fresh join, not a share left running.
            current.joined_at = _now()
            current.muted = current.deafened = current.sharing = False
        current.seen_at = _now()
    if fresh:
        # Messages from an earlier call here describe connections that no longer exist; a new
        # stream would replay them and break the new connection.
        await _clear_signals(db, space.id, actor.user.id)
        db.add(
            TeamCallEvent(
                tenant_id=tenant_id,
                space_id=space.id,
                user_id=actor.user.id,
                action="join",
            )
        )
    await db.flush()
    return schemas.CallOut(spaceId=str(space.id), participants=await call_people(db, space.id))


async def leave_call(db: Db, actor: Actor, space_id: int) -> schemas.CallOut:
    space = await _call_space(db, actor, space_id)
    rows = await db.scalars(
        select(TeamVoicePresence).where(
            TeamVoicePresence.space_id == space.id, TeamVoicePresence.user_id == actor.user.id
        )
    )
    was_present = False
    for row in rows.all():
        was_present = True
        await db.delete(row)
    await _clear_signals(db, space.id, actor.user.id)
    if was_present:
        db.add(
            TeamCallEvent(
                tenant_id=actor.session.tenant_id,
                space_id=space.id,
                user_id=actor.user.id,
                action="leave",
            )
        )
    await db.flush()
    return schemas.CallOut(spaceId=str(space.id), participants=await call_people(db, space.id))


async def _clear_signals(db: Db, space_id: int, user_id: int) -> None:
    """Drops call messages to or from this person in this conversation."""
    rows = await db.scalars(
        select(TeamSignal).where(
            TeamSignal.space_id == space_id,
            or_(TeamSignal.to_user == user_id, TeamSignal.from_user == user_id),
        )
    )
    for row in rows.all():
        await db.delete(row)


async def set_call_state(
    db: Db, actor: Actor, space_id: int, data: schemas.VoiceStateIn
) -> schemas.CallOut:
    space = await _call_space(db, actor, space_id)
    row = await _presence(db, space.id, actor.user.id)
    if row is None:
        raise ApiError("not_in_call", "Join the call first.", 409)
    was_sharing = row.sharing
    row.muted, row.deafened, row.sharing = data.muted, data.deafened, data.sharing
    row.seen_at = _now()
    if data.sharing != was_sharing:
        db.add(
            TeamCallEvent(
                tenant_id=actor.session.tenant_id,
                space_id=space.id,
                user_id=actor.user.id,
                action="share_on" if data.sharing else "share_off",
            )
        )
    await db.flush()
    return schemas.CallOut(spaceId=str(space.id), participants=await call_people(db, space.id))


async def call(db: Db, actor: Actor, space_id: int) -> schemas.CallOut:
    space = await _call_space(db, actor, space_id)
    return schemas.CallOut(spaceId=str(space.id), participants=await call_people(db, space.id))


async def send_signal(db: Db, actor: Actor, space_id: int, data: schemas.SignalIn) -> None:
    """Relays a WebRTC message. Both people must be in this call."""
    tenant_id = actor.session.tenant_id
    space = await _call_space(db, actor, space_id)
    if await _presence(db, space.id, actor.user.id) is None:
        raise ApiError("not_in_call", "Join the call first.", 409)
    if await _presence(db, space.id, data.to_user_id) is None:
        raise ApiError("peer_not_in_call", "That person is not in this call.", 409)
    db.add(
        TeamSignal(
            tenant_id=tenant_id,
            space_id=space.id,
            from_user=actor.user.id,
            to_user=data.to_user_id,
            kind=data.kind,
            payload=data.payload,
        )
    )
    await db.flush()


async def signals_for(db: Db, user_id: int, space_id: int, after: int) -> list[schemas.SignalOut]:
    rows = (
        await db.scalars(
            select(TeamSignal)
            .where(
                TeamSignal.space_id == space_id,
                TeamSignal.to_user == user_id,
                TeamSignal.id > after,
            )
            .order_by(TeamSignal.id)
            .limit(200)
        )
    ).all()
    return [
        schemas.SignalOut(
            id=str(row.id), fromUserId=row.from_user, kind=row.kind, payload=row.payload
        )
        for row in rows
    ]


async def signals(db: Db, actor: Actor, space_id: int, after: int) -> list[schemas.SignalOut]:
    space = await _call_space(db, actor, space_id)
    if await _presence(db, space.id, actor.user.id) is None:
        raise ApiError("not_in_call", "Join the call first.", 409)
    return await signals_for(db, actor.user.id, space.id, after)


async def touch_presence(db: Db, user_id: int, space_id: int) -> bool:
    """Keeps a person in the call while their stream is open. False when they have left."""
    row = await _presence(db, space_id, user_id)
    if row is None:
        return False
    row.seen_at = _now()
    await db.flush()
    return True


async def prune_call(db: Db, space_id: int) -> None:
    stale = await db.scalars(
        select(TeamVoicePresence).where(
            TeamVoicePresence.space_id == space_id,
            TeamVoicePresence.seen_at <= _now() - CALL_STALE,
        )
    )
    for row in stale.all():
        await db.delete(row)
    old = await db.scalars(
        select(TeamSignal).where(
            TeamSignal.space_id == space_id, TeamSignal.created_at <= _now() - SIGNAL_TTL
        )
    )
    for signal in old.all():
        await db.delete(signal)
    await db.flush()


def ice_config(actor: Actor) -> schemas.IceConfigOut:
    return ice_for(str(actor.user.id))


def ice_for(label: str) -> schemas.IceConfigOut:
    """STUN and TURN servers for a call. TURN credentials last turn_ttl_seconds and name the person.

    This is coturn's REST scheme: the username is "<expiry>:<user id>" and the password is an
    HMAC-SHA1 of it under the shared secret, so the TURN server checks it without a database.
    """
    settings = get_settings()
    servers: list[schemas.IceServerOut] = []
    if settings.stun_list:
        servers.append(schemas.IceServerOut(urls=settings.stun_list))
    secret = settings.turn_secret.get_secret_value()
    relay = bool(settings.turn_list and secret)
    if relay:
        username = f"{int(time.time()) + settings.turn_ttl_seconds}:{label}"
        digest = hmac.new(secret.encode(), username.encode(), hashlib.sha1).digest()
        servers.append(
            schemas.IceServerOut(
                urls=settings.turn_list,
                username=username,
                credential=base64.b64encode(digest).decode(),
            )
        )
    return schemas.IceConfigOut(
        iceServers=servers,
        # Relay-only needs a TURN server; without one it would stop every call connecting.
        iceTransportPolicy=settings.ice_transport_policy if relay else "all",
        ttlSeconds=settings.turn_ttl_seconds,
    )


# Posts: announcements, kudos, polls and events, which sit in the conversation like messages.


async def _active_member(db: Db, tenant_id: int, user_id: int) -> bool:
    return await org_service.active_member(db, tenant_id, user_id)


async def create_post(
    db: Db, actor: Actor, space_id: int, data: schemas.PostIn, idempotency_key: str
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
    meta: dict[str, object] = {"title": data.title.strip()} if data.title.strip() else {}
    if data.kind == "announcement":
        if not _announcer(actor):
            raise ApiError(
                "announcers_only", "Only people who make announcements can post one.", 403
            )
        if space.kind in ("dm", "group"):
            raise ApiError("announce_in_channel", "Post announcements in a channel.", 422)
    elif data.kind == "kudos":
        if data.kudos_to is None or data.kudos_to == actor.user.id:
            raise ApiError("kudos_to", "Choose a teammate to thank.", 422)
        if not await _active_member(db, tenant_id, data.kudos_to):
            raise ApiError("person_not_found", "That person is not a member of this company.", 404)
        meta |= {"to": data.kudos_to, "value": data.kudos_value.strip()}
    elif data.kind == "poll":
        options = [option for option in dict.fromkeys(data.options) if option]
        if len(options) < 2:
            raise ApiError("poll_options", "A poll needs at least two different options.", 422)
        if data.closes_at and data.closes_at <= _now():
            raise ApiError("poll_closes", "Pick a closing time in the future.", 422)
        meta |= {
            "options": [{"id": str(index + 1), "text": text} for index, text in enumerate(options)],
            "closes_at": data.closes_at.isoformat() if data.closes_at else None,
            "anonymous": data.anonymous,
        }
    elif data.kind == "event":
        if data.starts_at is None:
            raise ApiError("event_time", "Pick when the event starts.", 422)
        meta |= {"starts_at": data.starts_at.isoformat(), "place": data.place.strip()}
    elif data.kind == "meeting":
        if data.starts_at is None:
            raise ApiError("meeting_time", "Pick when the meeting starts.", 422)
        meta |= {
            "starts_at": data.starts_at.isoformat(),
            "duration_minutes": data.duration_minutes,
            "agenda": data.agenda.strip(),
        }
    row = TeamMessage(
        tenant_id=tenant_id,
        space_id=space.id,
        author_id=actor.user.id,
        body=data.body,
        kind=data.kind,
        meta=meta or None,
        idempotency_key=idempotency_key,
    )
    db.add(row)
    await db.flush()
    sender.last_read_id = max(sender.last_read_id, row.id)
    await db.flush()
    return (await _messages_out(db, actor, [row]))[0], True


async def respond(
    db: Db, actor: Actor, message_id: int, data: schemas.RespondIn
) -> schemas.MessageOut:
    row = await _message(db, actor.session.tenant_id, message_id)
    space = await _space(db, actor.session.tenant_id, row.space_id)
    await _readable(db, actor, space)
    meta = row.meta or {}
    if row.deleted_at is not None or row.kind not in ("poll", "event", "meeting"):
        raise ApiError("not_answerable", "Only polls, events and meetings take answers.", 422)
    if row.kind == "poll":
        closes = meta.get("closes_at")
        if closes and datetime.fromisoformat(str(closes)) <= _now():
            raise ApiError("poll_closed", "This poll has closed.", 409)
        if data.value not in {option["id"] for option in meta.get("options", [])}:
            raise ApiError("poll_option", "That option is not in the poll.", 422)
    elif row.kind in ("event", "meeting") and data.value not in EVENT_ANSWERS:
        raise ApiError("event_answer", "Answer going, maybe or no.", 422)
    answer = await db.scalar(
        select(TeamResponse)
        .where(TeamResponse.message_id == row.id, TeamResponse.user_id == actor.user.id)
        .with_for_update()
    )
    if answer is None:
        db.add(
            TeamResponse(
                tenant_id=row.tenant_id, message_id=row.id, user_id=actor.user.id, value=data.value
            )
        )
    else:
        answer.value = data.value
        answer.updated_at = _now()
    await db.flush()
    return (await _messages_out(db, actor, [row]))[0]


async def latest_announcements(
    db: Db, actor: Actor, after: int, limit: int
) -> list[schemas.AnnouncementOut]:
    """Announcements newer than `after`, newest first, for the alert every page shows."""
    rows = (
        await db.scalars(
            select(TeamMessage)
            .join(TeamSpace, TeamSpace.id == TeamMessage.space_id)
            .where(
                TeamMessage.tenant_id == actor.session.tenant_id,
                TeamMessage.kind == "announcement",
                TeamMessage.deleted_at.is_(None),
                TeamMessage.id > after,
                TeamSpace.kind.in_(["channel", "voice"]),
            )
            .order_by(TeamMessage.id.desc())
            .limit(limit)
        )
    ).all()
    people = await _people(db, {row.author_id for row in rows})
    return [
        schemas.AnnouncementOut(
            id=str(row.id),
            spaceId=str(row.space_id),
            title=(row.meta or {}).get("title") or None,
            body=row.body,
            author=schemas.PersonOut(id=row.author_id, name=people[row.author_id].name),
            createdAt=row.created_at,
        )
        for row in rows
    ]


async def mark_seen(db: Db, actor: Actor, message_id: int) -> dict[str, object]:
    """Mark a message (typically an announcement) as seen by the current user."""
    row = await _message(db, actor.session.tenant_id, message_id)
    space = await _space(db, actor.session.tenant_id, row.space_id)
    await _readable(db, actor, space)
    existing = await db.scalar(
        select(TeamMessageSeen).where(
            TeamMessageSeen.message_id == row.id,
            TeamMessageSeen.user_id == actor.user.id,
        )
    )
    if existing is None:
        db.add(
            TeamMessageSeen(
                tenant_id=actor.session.tenant_id,
                message_id=row.id,
                user_id=actor.user.id,
            )
        )
        await db.flush()
    total = await db.scalar(
        select(func.count())
        .select_from(TeamSpaceMember)
        .where(TeamSpaceMember.space_id == row.space_id)
    )
    seen = await db.scalar(
        select(func.count())
        .select_from(TeamMessageSeen)
        .where(TeamMessageSeen.message_id == row.id)
    )
    return {"seen": seen or 0, "total": total or 0}


async def seen_by(db: Db, actor: Actor, message_id: int) -> list[dict[str, object]]:
    """List who has seen a message (for admin/HR use)."""
    row = await _message(db, actor.session.tenant_id, message_id)
    results = (
        await db.execute(
            select(TeamMessageSeen.user_id, TeamMessageSeen.seen_at)
            .where(TeamMessageSeen.message_id == row.id)
            .order_by(TeamMessageSeen.seen_at)
        )
    ).all()
    people = await _people(db, {r.user_id for r in results})
    return [
        {
            "userId": r.user_id,
            "name": people[r.user_id].name if r.user_id in people else "Unknown",
            "seenAt": r.seen_at.isoformat(),
        }
        for r in results
    ]


MAX_PINS = 50


async def pin_message(db: Db, actor: Actor, message_id: int) -> schemas.MessageOut:
    row = await _message(db, actor.session.tenant_id, message_id)
    space = await _space(db, actor.session.tenant_id, row.space_id)
    await _postable(db, actor, space)
    if row.deleted_at is not None:
        raise ApiError("message_deleted", "A deleted message cannot be pinned.", 409)
    if row.pinned_at is not None:
        return (await _messages_out(db, actor, [row]))[0]
    count = await db.scalar(
        select(func.count())
        .select_from(TeamMessage)
        .where(TeamMessage.space_id == space.id, TeamMessage.pinned_at.isnot(None))
    )
    if (count or 0) >= MAX_PINS:
        raise ApiError(
            "too_many_pins",
            f"A channel can have at most {MAX_PINS} pinned messages.",
            422,
        )
    row.pinned_at = _now()
    row.pinned_by = actor.user.id
    await db.flush()
    return (await _messages_out(db, actor, [row]))[0]


async def unpin_message(db: Db, actor: Actor, message_id: int) -> schemas.MessageOut:
    row = await _message(db, actor.session.tenant_id, message_id)
    space = await _space(db, actor.session.tenant_id, row.space_id)
    await _postable(db, actor, space)
    row.pinned_at = None
    row.pinned_by = None
    await db.flush()
    return (await _messages_out(db, actor, [row]))[0]


async def pinned_messages(db: Db, actor: Actor, space_id: int) -> list[schemas.MessageOut]:
    space = await _space(db, actor.session.tenant_id, space_id)
    await _readable(db, actor, space)
    rows = (
        await db.scalars(
            select(TeamMessage)
            .where(TeamMessage.space_id == space.id, TeamMessage.pinned_at.isnot(None))
            .order_by(TeamMessage.pinned_at.desc())
            .limit(MAX_PINS)
        )
    ).all()
    return await _messages_out(db, actor, list(rows))


async def save_message(db: Db, actor: Actor, message_id: int) -> schemas.MessageOut:
    row = await _message(db, actor.session.tenant_id, message_id)
    space = await _space(db, actor.session.tenant_id, row.space_id)
    await _readable(db, actor, space)
    existing = await db.scalar(
        select(TeamSavedMessage).where(
            TeamSavedMessage.user_id == actor.user.id,
            TeamSavedMessage.message_id == row.id,
        )
    )
    if existing is None:
        db.add(
            TeamSavedMessage(
                tenant_id=actor.session.tenant_id,
                user_id=actor.user.id,
                message_id=row.id,
            )
        )
        await db.flush()
    return (await _messages_out(db, actor, [row]))[0]


async def unsave_message(db: Db, actor: Actor, message_id: int) -> schemas.MessageOut:
    row = await _message(db, actor.session.tenant_id, message_id)
    saved = await db.scalar(
        select(TeamSavedMessage).where(
            TeamSavedMessage.user_id == actor.user.id,
            TeamSavedMessage.message_id == row.id,
        )
    )
    if saved is not None:
        await db.delete(saved)
        await db.flush()
    return (await _messages_out(db, actor, [row]))[0]


async def saved_messages(db: Db, actor: Actor, limit: int = 50) -> list[schemas.MessageOut]:
    saved_ids = (
        await db.scalars(
            select(TeamSavedMessage.message_id)
            .where(TeamSavedMessage.user_id == actor.user.id)
            .order_by(TeamSavedMessage.saved_at.desc())
            .limit(limit)
        )
    ).all()
    if not saved_ids:
        return []
    rows = (await db.scalars(select(TeamMessage).where(TeamMessage.id.in_(saved_ids)))).all()
    order = {mid: idx for idx, mid in enumerate(saved_ids)}
    rows = sorted(rows, key=lambda r: order.get(r.id, 0))
    return await _messages_out(db, actor, list(rows))


async def forward_message(
    db: Db,
    actor: Actor,
    message_id: int,
    to_space_id: int,
    idempotency_key: str,
) -> schemas.MessageOut:
    original = await _message(db, actor.session.tenant_id, message_id)
    orig_space = await _space(db, actor.session.tenant_id, original.space_id)
    await _readable(db, actor, orig_space)
    target = await _space(db, actor.session.tenant_id, to_space_id)
    sender = await _postable(db, actor, target)
    label = f"#{orig_space.name}" if orig_space.name else "a conversation"
    body = f"[Forwarded from {label}]\n{original.body}"
    row = TeamMessage(
        tenant_id=actor.session.tenant_id,
        space_id=target.id,
        author_id=actor.user.id,
        body=body[:MAX_BODY_CHARS],
        kind="text",
        idempotency_key=idempotency_key,
    )
    db.add(row)
    await db.flush()
    sender.last_read_id = max(sender.last_read_id, row.id)
    await db.flush()
    return (await _messages_out(db, actor, [row]))[0]


async def my_threads(db: Db, actor: Actor, limit: int = 30) -> list[schemas.MessageOut]:
    """Thread roots the user has replied in, ordered by latest activity."""
    tenant_id = actor.session.tenant_id
    reply_alias = TeamMessage.__table__.alias("reply")
    parent_ids_q = (
        select(TeamMessage.parent_id)
        .where(
            TeamMessage.tenant_id == tenant_id,
            TeamMessage.author_id == actor.user.id,
            TeamMessage.parent_id.isnot(None),
        )
        .distinct()
        .subquery()
    )
    latest = (
        select(
            reply_alias.c.parent_id,
            func.max(reply_alias.c.created_at).label("last_activity"),
        )
        .where(reply_alias.c.parent_id.in_(select(parent_ids_q)))
        .group_by(reply_alias.c.parent_id)
        .subquery()
    )
    roots = (
        await db.scalars(
            select(TeamMessage)
            .join(latest, TeamMessage.id == latest.c.parent_id)
            .where(TeamMessage.tenant_id == tenant_id)
            .order_by(latest.c.last_activity.desc())
            .limit(limit)
        )
    ).all()
    return await _messages_out(db, actor, list(roots))


async def add_member(db: Db, actor: Actor, space_id: int, user_id: int) -> schemas.SpaceOut:
    space = await _space(db, actor.session.tenant_id, space_id)
    if space.kind not in ("channel", "voice"):
        raise ApiError("not_a_channel", "Members can only be added to channels.", 422)
    if await _member(db, space.id, actor.user.id) is None:
        raise ApiError("not_joined", "Join this channel first.", 403)
    if not await _active_member(db, actor.session.tenant_id, user_id):
        raise ApiError("person_not_found", "That person is not a member of this company.", 404)
    existing = await _member(db, space.id, user_id)
    if existing is None:
        db.add(TeamSpaceMember(tenant_id=space.tenant_id, space_id=space.id, user_id=user_id))
        await db.flush()
    return await _space_out(db, actor, space)


async def remove_member(db: Db, actor: Actor, space_id: int, user_id: int) -> schemas.SpaceOut:
    space = await _space(db, actor.session.tenant_id, space_id)
    if space.kind not in ("channel", "voice"):
        raise ApiError("not_a_channel", "Members can only be removed from channels.", 422)
    if space.announcements:
        raise ApiError("announcements_stay", "Everyone stays in announcements.", 422)
    if space.created_by != actor.user.id:
        raise ApiError("not_creator", "Only the channel creator can remove members.", 403)
    member = await _member(db, space.id, user_id)
    if member is not None:
        await db.delete(member)
        await db.flush()
    return await _space_out(db, actor, space)


async def call_history(
    db: Db, actor: Actor, space_id: int, limit: int = 50
) -> list[schemas.CallEventOut]:
    space = await _call_space(db, actor, space_id)
    rows = (
        await db.execute(
            select(TeamCallEvent, User.name)
            .join(User, User.id == TeamCallEvent.user_id)
            .where(TeamCallEvent.space_id == space.id)
            .order_by(TeamCallEvent.id.desc())
            .limit(limit)
        )
    ).all()
    return [
        schemas.CallEventOut(
            id=str(event.id),
            userId=event.user_id,
            userName=name,
            action=event.action,
            createdAt=event.created_at,
        )
        for event, name in rows
    ]


async def ensure_source_channel(
    db: Db, tenant_id: int, user_id: int, source_kind: str, source_id: str, name: str
) -> TeamSpace:
    """Find or create the channel linked to a department or project."""
    space = await db.scalar(
        select(TeamSpace).where(
            TeamSpace.tenant_id == tenant_id,
            TeamSpace.source_kind == source_kind,
            TeamSpace.source_id == source_id,
        )
    )
    if space is not None:
        return space
    channel_name = name.lower().replace(" ", "-")[:40]
    channel_name = "".join(c for c in channel_name if c.isalnum() or c == "-").strip("-") or "group"
    existing = await db.scalar(
        select(TeamSpace.id).where(TeamSpace.tenant_id == tenant_id, TeamSpace.name == channel_name)
    )
    if existing is not None:
        channel_name = f"{channel_name}-{source_id}"[:40]
    space = TeamSpace(
        tenant_id=tenant_id,
        kind="channel",
        name=channel_name,
        topic=f"Auto-created for {source_kind}: {name}",
        source_kind=source_kind,
        source_id=source_id,
        created_by=user_id,
    )
    db.add(space)
    await db.flush()
    db.add(TeamSpaceMember(tenant_id=tenant_id, space_id=space.id, user_id=user_id))
    await db.flush()
    return space


async def sync_source_members(
    db: Db, tenant_id: int, source_kind: str, source_id: str, user_ids: set[int]
) -> None:
    """Ensure exactly these users are members of the source-linked channel."""
    space = await db.scalar(
        select(TeamSpace).where(
            TeamSpace.tenant_id == tenant_id,
            TeamSpace.source_kind == source_kind,
            TeamSpace.source_id == source_id,
        )
    )
    if space is None:
        return
    current = set(
        (
            await db.scalars(
                select(TeamSpaceMember.user_id).where(TeamSpaceMember.space_id == space.id)
            )
        ).all()
    )
    to_add = user_ids - current
    to_remove = current - user_ids - {space.created_by}
    for uid in to_add:
        db.add(TeamSpaceMember(tenant_id=tenant_id, space_id=space.id, user_id=uid))
    if to_remove:
        remove_rows = await db.scalars(
            select(TeamSpaceMember).where(
                TeamSpaceMember.space_id == space.id,
                TeamSpaceMember.user_id.in_(to_remove),
            )
        )
        for row in remove_rows.all():
            await db.delete(row)
    if to_add or to_remove:
        await db.flush()


async def mail_for(db: Db, actor: Actor, message: schemas.MessageOut) -> list[tuple[str, str, str]]:
    """The emails a new post sends, as (to, subject, body).

    An announcement goes to everyone who can read it: the whole company for a channel. Kudos go to
    the person thanked. Other posts send no email.
    """
    link = (
        f"{get_settings().frontend_url.rstrip('/')}/team?space={message.spaceId}"
        "&workspace=team-chat"
    )
    tenant_id = actor.session.tenant_id
    if message.kind == "announcement":
        rows = [
            (email,)
            for user_id, _, email in await org_service.active_people(db, tenant_id)
            if user_id != actor.user.id
        ]
        subject = f"Announcement: {message.title or (message.body or '')[:60]}"
        text = (
            f"{actor.user.name} posted an announcement.\n\n"
            + (f"{message.title}\n\n" if message.title else "")
            + f"{message.body}\n\nOpen it in Team Chat: {link}\n"
        )
        return [(email, subject, text) for (email,) in rows if email]
    if message.kind == "kudos" and message.kudos:
        email = await db.scalar(select(User.email).where(User.id == message.kudos.to.id))
        value = f" for {message.kudos.value}" if message.kudos.value else ""
        text = f"{actor.user.name} gave you kudos{value}:\n\n{message.body}\n\nSee it: {link}\n"
        return [(email, f"{actor.user.name} gave you kudos", text)] if email else []
    if message.kind == "meeting" and message.meeting:
        members = (
            await db.execute(
                select(User.email)
                .join(TeamSpaceMember, TeamSpaceMember.user_id == User.id)
                .where(
                    TeamSpaceMember.space_id == int(message.spaceId),
                    User.id != actor.user.id,
                )
            )
        ).all()
        agenda = f"\n\nAgenda:\n{message.meeting.agenda}" if message.meeting.agenda else ""
        meeting_subject = f"Meeting: {message.title or (message.body or '')[:60]}"
        text = (
            f"{actor.user.name} scheduled a meeting.\n\n"
            + (f"{message.title}\n\n" if message.title else "")
            + f"{message.body}{agenda}\n\nRSVP and join: {link}\n"
        )
        return [(addr, meeting_subject, text) for (addr,) in members if addr]
    return []
