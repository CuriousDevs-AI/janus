from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from janus_api.core.db import Base


class WhatsAppConnection(Base):
    __tablename__ = "whatsapp_connections"
    __table_args__ = (
        UniqueConstraint("tenant_id"),
        UniqueConstraint("connection_id"),
        UniqueConstraint("phone_number_id"),
        ForeignKeyConstraint(
            ["tenant_id", "connection_id"],
            ["source_connections.tenant_id", "source_connections.id"],
        ),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger)
    connection_id: Mapped[int] = mapped_column(BigInteger)
    waba_id: Mapped[str] = mapped_column(String(40))
    phone_number_id: Mapped[str] = mapped_column(String(40))
    display_phone: Mapped[str] = mapped_column(String(80))
    verified_name: Mapped[str] = mapped_column(String(200))
    access_token_encrypted: Mapped[str] = mapped_column(String)
    app_secret_encrypted: Mapped[str] = mapped_column(String)
    verify_token_hash: Mapped[str] = mapped_column(String(64))
    webhook_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Conversation(Base):
    __tablename__ = "whatsapp_conversations"
    __table_args__ = (
        UniqueConstraint("tenant_id", "connection_id", "contact_id"),
        UniqueConstraint("tenant_id", "connection_id", "id"),
        ForeignKeyConstraint(
            ["tenant_id", "connection_id"],
            ["source_connections.tenant_id", "source_connections.id"],
        ),
        ForeignKeyConstraint(["tenant_id", "contact_id"], ["contacts.tenant_id", "contacts.id"]),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, index=True)
    connection_id: Mapped[int] = mapped_column(BigInteger)
    contact_id: Mapped[int] = mapped_column(BigInteger)
    status: Mapped[str] = mapped_column(String(20), server_default="open")
    assigned_user_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    unread_count: Mapped[int] = mapped_column(Integer, server_default="0")
    priority: Mapped[str] = mapped_column(String(10), server_default="normal")
    last_message_body: Mapped[str | None] = mapped_column(String(200))
    last_inbound_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_message_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class ConversationNote(Base):
    __tablename__ = "conversation_notes"
    tenant_id: Mapped[int] = mapped_column(BigInteger, index=True)
    conversation_id: Mapped[int] = mapped_column(BigInteger, index=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    body: Mapped[str] = mapped_column(String(4000))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ConversationTag(Base):
    __tablename__ = "conversation_tags"
    __table_args__ = (UniqueConstraint("tenant_id", "name"),)
    tenant_id: Mapped[int] = mapped_column(BigInteger, index=True)
    name: Mapped[str] = mapped_column(String(50))
    color: Mapped[str] = mapped_column(String(20), server_default="gray")


class ConversationTagLink(Base):
    __tablename__ = "conversation_tag_links"
    __table_args__ = (UniqueConstraint("conversation_id", "tag_id"),)
    tenant_id: Mapped[int] = mapped_column(BigInteger)
    conversation_id: Mapped[int] = mapped_column(BigInteger, index=True)
    tag_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("conversation_tags.id", ondelete="CASCADE")
    )


class QuickReply(Base):
    __tablename__ = "quick_replies"
    tenant_id: Mapped[int] = mapped_column(BigInteger, index=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(100))
    body: Mapped[str] = mapped_column(String(4096))
    shared: Mapped[bool] = mapped_column(Boolean, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Message(Base):
    __tablename__ = "whatsapp_messages"
    __table_args__ = (
        UniqueConstraint("connection_id", "provider_id"),
        UniqueConstraint("tenant_id", "conversation_id", "client_key"),
        UniqueConstraint("callback_token"),
        ForeignKeyConstraint(
            ["tenant_id", "connection_id", "conversation_id"],
            [
                "whatsapp_conversations.tenant_id",
                "whatsapp_conversations.connection_id",
                "whatsapp_conversations.id",
            ],
        ),
        CheckConstraint("direction IN ('inbound', 'outbound')"),
        CheckConstraint(
            "status IN ('received', 'queued', 'sending', 'accepted', 'sent', "
            "'delivered', 'read', 'failed', 'unknown')"
        ),
        Index("ix_whatsapp_outbox", "id", postgresql_where=text("status IN ('queued', 'sending')")),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, index=True)
    connection_id: Mapped[int] = mapped_column(BigInteger)
    conversation_id: Mapped[int] = mapped_column(BigInteger, index=True)
    direction: Mapped[str] = mapped_column(String(10))
    kind: Mapped[str] = mapped_column(String(30))
    body: Mapped[str] = mapped_column(String(12000))
    payload: Mapped[dict[str, object]] = mapped_column(JSONB)
    provider_id: Mapped[str | None] = mapped_column(String(512))
    callback_token: Mapped[str | None] = mapped_column(String(64))
    client_key: Mapped[str | None] = mapped_column(String(128))
    request_hash: Mapped[str | None] = mapped_column(String(64))
    sender_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(20))
    error_code: Mapped[str | None] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
