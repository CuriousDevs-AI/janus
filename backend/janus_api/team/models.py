from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from janus_api.core.db import Base


class TeamSpace(Base):
    """A channel the whole company can see, or a direct conversation between two members.

    A channel has a name and is open to every member of the company; a member joins it to post.
    A direct conversation has no name and only its two members can read it.
    """

    __tablename__ = "team_spaces"
    __table_args__ = (
        UniqueConstraint("tenant_id", "name", name="uq_team_spaces_name"),
        CheckConstraint("kind IN ('channel', 'dm', 'group', 'voice')", name="ck_team_spaces_kind"),
        CheckConstraint(
            "(kind IN ('channel', 'voice') AND name IS NOT NULL) "
            "OR (kind IN ('dm', 'group') AND name IS NULL)",
            name="ck_team_spaces_name_by_kind",
        ),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"), index=True)
    kind: Mapped[str] = mapped_column(String(10))
    name: Mapped[str | None] = mapped_column(String(40))
    topic: Mapped[str] = mapped_column(String(200), server_default="")
    created_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TeamSpaceMember(Base):
    """Who is in a space, and the last message they have read there."""

    __tablename__ = "team_space_members"
    __table_args__ = (UniqueConstraint("space_id", "user_id", name="uq_team_space_members"),)
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"), index=True)
    space_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("team_spaces.id"), index=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), index=True)
    last_read_id: Mapped[int] = mapped_column(BigInteger, server_default="0")
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TeamMessage(Base):
    """A message in a space. A reply has `parent_id`, the message it belongs to in a thread."""

    __tablename__ = "team_messages"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "author_id", "idempotency_key", name="uq_team_messages_idempotency"
        ),
        CheckConstraint("char_length(body) BETWEEN 1 AND 4000", name="ck_team_messages_body"),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"), index=True)
    space_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("team_spaces.id"), index=True)
    parent_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("team_messages.id"))
    author_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    body: Mapped[str] = mapped_column(Text)
    idempotency_key: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class TeamReaction(Base):
    __tablename__ = "team_reactions"
    __table_args__ = (UniqueConstraint("message_id", "user_id", "emoji", name="uq_team_reactions"),)
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"), index=True)
    message_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("team_messages.id"), index=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    emoji: Mapped[str] = mapped_column(String(16))


class TeamAttachment(Base):
    """A file posted with a message. The bytes stay in the row, under row-level security.

    The list views never read `data`; only the download does.
    """

    __tablename__ = "team_attachments"
    __table_args__ = (
        CheckConstraint("size_bytes BETWEEN 1 AND 5242880", name="ck_team_attachments_size"),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"), index=True)
    message_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("team_messages.id"), index=True)
    uploader_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    filename: Mapped[str] = mapped_column(String(200))
    content_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    data: Mapped[bytes] = mapped_column(LargeBinary)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TeamVoicePresence(Base):
    """Who is in a voice channel's call. A row goes stale when its stream stops refreshing it."""

    __tablename__ = "team_voice_presence"
    __table_args__ = (UniqueConstraint("space_id", "user_id", name="uq_team_voice_presence"),)
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"), index=True)
    space_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("team_spaces.id"), index=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), index=True)
    muted: Mapped[bool] = mapped_column(Boolean, server_default="false")
    deafened: Mapped[bool] = mapped_column(Boolean, server_default="false")
    sharing: Mapped[bool] = mapped_column(Boolean, server_default="false")
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TeamSignal(Base):
    """A WebRTC message from one person in a call to another: an offer, an answer or a candidate."""

    __tablename__ = "team_signals"
    __table_args__ = (
        CheckConstraint("kind IN ('offer', 'answer', 'ice', 'bye')", name="ck_team_signals_kind"),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"), index=True)
    space_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("team_spaces.id"), index=True)
    from_user: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    to_user: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), index=True)
    kind: Mapped[str] = mapped_column(String(10))
    payload: Mapped[dict[str, object]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
