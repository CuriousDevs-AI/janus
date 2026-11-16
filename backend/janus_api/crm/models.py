from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from janus_api.core.db import Base


class Contact(Base):
    __tablename__ = "contacts"
    __table_args__ = (
        UniqueConstraint("tenant_id", "phone_e164"),
        UniqueConstraint("tenant_id", "email"),
        UniqueConstraint("tenant_id", "id"),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"), index=True)
    name: Mapped[str] = mapped_column(String(160), default="")
    phone_e164: Mapped[str | None] = mapped_column(String(16))
    email: Mapped[str | None] = mapped_column(String(320))
    company: Mapped[str] = mapped_column(String(200), default="")
    whatsapp_opt_in: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    do_not_contact: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    consent_source: Mapped[str | None] = mapped_column(String(80))
    consent_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Lead(Base):
    __tablename__ = "leads"
    __table_args__ = (
        UniqueConstraint("tenant_id", "receipt_id"),
        UniqueConstraint("tenant_id", "id"),
        ForeignKeyConstraint(["tenant_id", "contact_id"], ["contacts.tenant_id", "contacts.id"]),
        ForeignKeyConstraint(
            ["tenant_id", "receipt_id"], ["ingest_receipts.tenant_id", "ingest_receipts.id"]
        ),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, index=True)
    contact_id: Mapped[int] = mapped_column(BigInteger)
    receipt_id: Mapped[int] = mapped_column(BigInteger)
    source: Mapped[str] = mapped_column(String(30), default="webhook")
    stage: Mapped[str] = mapped_column(String(30), default="new")
    owner_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"), index=True)
    requirement: Mapped[str] = mapped_column(String(4000), default="")
    campaign: Mapped[str | None] = mapped_column(String(200))
    recording_reference: Mapped[str | None] = mapped_column(String(2048))
    recording_url: Mapped[str | None] = mapped_column(String(2048))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_activity_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    # When someone agreed to follow up next; a lead waiting for that day has not gone quiet.
    next_follow_up_on: Mapped[date | None] = mapped_column(Date)
    # Why it was lost, from a short list a manager can count, a note, and when.
    lost_category: Mapped[str | None] = mapped_column(String(30))
    lost_reason: Mapped[str] = mapped_column(String(1000), default="", server_default="")
    lost_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class LeadNote(Base):
    """What happened on a call or meeting with a lead, who wrote it, and the next follow-up set."""

    __tablename__ = "lead_notes"
    __table_args__ = (
        ForeignKeyConstraint(
            ["tenant_id", "lead_id"], ["leads.tenant_id", "leads.id"], ondelete="CASCADE"
        ),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, index=True)
    lead_id: Mapped[int] = mapped_column(BigInteger)
    author_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    body: Mapped[str] = mapped_column(String(2000))
    next_follow_up_on: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CustomerNote(Base):
    """A free-text note on a customer (contact) record, written by a team member."""

    __tablename__ = "customer_notes"
    __table_args__ = (
        ForeignKeyConstraint(
            ["tenant_id", "contact_id"],
            ["contacts.tenant_id", "contacts.id"],
            ondelete="CASCADE",
        ),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, index=True)
    contact_id: Mapped[int] = mapped_column(BigInteger)
    author_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    body: Mapped[str] = mapped_column(String(4000))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Deal(Base):
    __tablename__ = "deals"
    __table_args__ = (
        UniqueConstraint("tenant_id", "lead_id"),
        ForeignKeyConstraint(["tenant_id", "lead_id"], ["leads.tenant_id", "leads.id"]),
        Index("ix_deals_tenant_id_id", "tenant_id", "id"),
        CheckConstraint("amount >= 0", name="deal_amount_nonnegative"),
        CheckConstraint("version > 0", name="deal_version_positive"),
        CheckConstraint(
            "stage IN ('new', 'qualified', 'demo', 'proposal', "
            "'negotiation', 'approval', 'won', 'lost')",
            name="deal_stage",
        ),
        CheckConstraint(
            "stage != 'lost' OR (lost_category IS NOT NULL AND lost_at IS NOT NULL)",
            name="deal_lost_has_reason",
        ),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, index=True)
    lead_id: Mapped[int] = mapped_column(BigInteger)
    name: Mapped[str] = mapped_column(String(200))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    stage: Mapped[str] = mapped_column(String(30), default="new")
    expected_close_at: Mapped[date | None] = mapped_column(Date)
    lost_reason: Mapped[str] = mapped_column(String(1000), default="")
    lost_category: Mapped[str | None] = mapped_column(String(30))
    lost_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
