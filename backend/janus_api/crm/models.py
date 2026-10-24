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


class Deal(Base):
    __tablename__ = "deals"
    __table_args__ = (
        UniqueConstraint("tenant_id", "lead_id"),
        ForeignKeyConstraint(["tenant_id", "lead_id"], ["leads.tenant_id", "leads.id"]),
        CheckConstraint("amount >= 0", name="deal_amount_nonnegative"),
        CheckConstraint("version > 0", name="deal_version_positive"),
        CheckConstraint(
            "stage IN ('new', 'qualified', 'demo', 'proposal', "
            "'negotiation', 'approval', 'won', 'lost')",
            name="deal_stage",
        ),
        CheckConstraint(
            "stage != 'lost' OR length(trim(lost_reason)) > 0", name="deal_lost_reason"
        ),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, index=True)
    lead_id: Mapped[int] = mapped_column(BigInteger)
    name: Mapped[str] = mapped_column(String(200))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    stage: Mapped[str] = mapped_column(String(30), default="new")
    expected_close_at: Mapped[date | None] = mapped_column(Date)
    lost_reason: Mapped[str] = mapped_column(String(1000), default="")
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
