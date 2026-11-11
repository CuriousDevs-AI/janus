from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    Numeric,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from janus_api.core.db import Base


class PortfolioDigest(Base):
    """One person's weekly Portfolio email: on or off, and when it is next due."""

    __tablename__ = "portfolio_digests"
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), unique=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    next_due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PortfolioTarget(Base):
    """A company's monthly target for one measure: leads, value won or money collected."""

    __tablename__ = "portfolio_targets"
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    metric: Mapped[str] = mapped_column(String(20))
    monthly: Mapped[Decimal] = mapped_column(Numeric(16, 2))
    updated_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ComplianceProfile(Base):
    """Which statutory filings apply to a company."""

    __tablename__ = "compliance_profiles"
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"), unique=True)
    gstin: Mapped[str | None] = mapped_column(String(15))
    gst_filing: Mapped[str] = mapped_column(String(10), default="none")
    tds: Mapped[bool] = mapped_column(Boolean, default=False)
    pf_esi: Mapped[bool] = mapped_column(Boolean, default=False)
    company: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ComplianceFiling(Base):
    """A filing marked done: its calendar key (gstr3b_2026-10) and the day it was filed."""

    __tablename__ = "compliance_filings"
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    item_key: Mapped[str] = mapped_column(String(40))
    filed_on: Mapped[date] = mapped_column(Date)
    filed_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    # The acknowledgement number the portal gave, when someone recorded it.
    acknowledgement: Mapped[str | None] = mapped_column(String(60))
    # What was paid with it, in paise, where someone recorded it: a TDS challan, for one.
    amount_paise: Mapped[int | None] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CompanyRegistration(Base):
    """A company's registration details: they decide which filings apply and what is missing."""

    __tablename__ = "company_registrations"
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"), unique=True)
    entity_type: Mapped[str | None] = mapped_column(String(20))
    legal_name: Mapped[str | None] = mapped_column(String(160))
    # CIN for a company, LLPIN for an LLP.
    cin: Mapped[str | None] = mapped_column(String(21))
    pan: Mapped[str | None] = mapped_column(String(10))
    tan: Mapped[str | None] = mapped_column(String(10))
    epf_code: Mapped[str | None] = mapped_column(String(30))
    esi_code: Mapped[str | None] = mapped_column(String(30))
    # Two-letter state code where professional tax is paid, such as KA or MH.
    pt_state: Mapped[str | None] = mapped_column(String(2))
    udyam: Mapped[str | None] = mapped_column(String(30))
    incorporated_on: Mapped[date | None] = mapped_column(Date)
    registered_address: Mapped[str | None] = mapped_column(String(400))
    website: Mapped[str | None] = mapped_column(String(200))
    email: Mapped[str | None] = mapped_column(String(320))
    phone: Mapped[str | None] = mapped_column(String(32))
    city: Mapped[str | None] = mapped_column(String(80))
    state: Mapped[str | None] = mapped_column(String(40))
    # The company's people: [{"name", "din", "roles": [director, founder, cofounder], "title"}]
    directors: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    updated_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PortfolioQuestion(Base):
    """One question a person asked Janus Intelligence across their companies, and its answer.

    Kept for the person alone: it is their memory for follow-ups and the record of what was sent to
    which model, with the figures it was given. They can clear it.
    """

    __tablename__ = "portfolio_questions"
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    # The company whose AI key answered; None for Janus rules.
    key_tenant_id: Mapped[int | None] = mapped_column(BigInteger)
    model: Mapped[str] = mapped_column(String(200))
    question: Mapped[str] = mapped_column(String(2000))
    answer: Mapped[str] = mapped_column(String(8000))
    sources: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    cost_usd: Mapped[Decimal | None] = mapped_column(Numeric(20, 10))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PortfolioKnowledge(Base):
    """What Janus knows about a company beyond its records: a fact the owner approved ("pays
    suppliers on the 20th"), or a passage of a document they added (a policy, a contract)."""

    __tablename__ = "portfolio_knowledge"
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    kind: Mapped[str] = mapped_column(String(10))
    # 'approved', or 'suggested' by Janus and waiting for the owner.
    status: Mapped[str] = mapped_column(String(10), default="approved")
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(String(4000))
    # A document is kept in passages; each passage is one row with its place in the document.
    document: Mapped[str | None] = mapped_column(String(40))
    passage: Mapped[int] = mapped_column(default=0)
    created_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PortfolioPreference(Base):
    """One person's Portfolio settings, kept on the server so every browser and phone agrees:
    which notifications they have read, what they snoozed in the Work inbox, and when a company
    turns red for them."""

    __tablename__ = "portfolio_preferences"
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), unique=True)
    read: Mapped[list[str]] = mapped_column(JSONB, default=list)
    snoozed: Mapped[dict[str, int]] = mapped_column(JSONB, default=dict)
    thresholds: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PortfolioAlert(Base):
    """One person's red alerts: an email when a company turns red, not only on Monday. `red` is
    the companies that were red at the last check, so a company that stays red is told once."""

    __tablename__ = "portfolio_alerts"
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), unique=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    red: Mapped[list[str]] = mapped_column(JSONB, default=list)
    next_check_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class CompanyDocument(Base):
    """A document a company must keep valid: a registration, licence, insurance policy or
    trademark, with its number and the day it expires, so renewals are not missed."""

    __tablename__ = "company_documents"
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    kind: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(160))
    number: Mapped[str | None] = mapped_column(String(80))
    issued_on: Mapped[date | None] = mapped_column(Date)
    expires_on: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(String(400))
    updated_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CustomerMerge(Base):
    """A customer name an owner said is the same as another, so it is counted once."""

    __tablename__ = "portfolio_customer_merges"
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    alias_key: Mapped[str] = mapped_column(String(160))
    alias: Mapped[str] = mapped_column(String(160))
    customer: Mapped[str] = mapped_column(String(160))
    merged_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CompanyDocumentFile(Base):
    """The file of a company document: a PDF or image up to 5 MB. Only the download reads `data`."""

    __tablename__ = "company_document_files"
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"), index=True)
    document_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("company_documents.id", ondelete="CASCADE"), unique=True
    )
    filename: Mapped[str] = mapped_column(String(200))
    content_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer)
    data: Mapped[bytes] = mapped_column(LargeBinary)
    uploaded_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
