from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
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
    PrimaryKeyConstraint,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from janus_api.core.db import Base


class CrmWorkspace(Base):
    __tablename__ = "crm_workspaces"
    __table_args__ = (
        UniqueConstraint("tenant_id", "slug", name="uq_crm_workspaces_tenant_slug"),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    slug: Mapped[str] = mapped_column(String(60))
    description: Mapped[str] = mapped_column(String(1000), default="", server_default="")
    pipeline_stages: Mapped[list[dict[str, object]]] = mapped_column(JSONB)
    win_stage: Mapped[str] = mapped_column(String(40), default="won", server_default="won")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CrmMember(Base):
    __tablename__ = "crm_members"
    __table_args__ = (
        UniqueConstraint("crm_id", "membership_id", name="uq_crm_members_crm_membership"),
        ForeignKeyConstraint(
            ["tenant_id", "membership_id"],
            ["memberships.tenant_id", "memberships.id"],
            ondelete="CASCADE",
            name="fk_crm_members_membership",
        ),
        CheckConstraint("role IN ('member', 'manager')", name="ck_crm_members_role"),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, index=True)
    crm_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("crm_workspaces.id", ondelete="CASCADE")
    )
    membership_id: Mapped[int] = mapped_column(BigInteger)
    role: Mapped[str] = mapped_column(String(20), default="member", server_default="member")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


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
        Index("ix_leads_tenant_crm", "tenant_id", "crm_id"),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, index=True)
    crm_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("crm_workspaces.id"))
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
        Index("ix_deals_tenant_crm", "tenant_id", "crm_id"),
        CheckConstraint("amount >= 0", name="deal_amount_nonnegative"),
        CheckConstraint("version > 0", name="deal_version_positive"),
        CheckConstraint(
            "stage != 'lost' OR (lost_category IS NOT NULL AND lost_at IS NOT NULL)",
            name="deal_lost_has_reason",
        ),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, index=True)
    crm_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("crm_workspaces.id"))
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


class Activity(Base):
    __tablename__ = "crm_activities"
    __table_args__ = (
        ForeignKeyConstraint(
            ["tenant_id", "lead_id"],
            ["leads.tenant_id", "leads.id"],
            name="fk_crm_activities_lead",
        ),
        ForeignKeyConstraint(
            ["tenant_id", "contact_id"],
            ["contacts.tenant_id", "contacts.id"],
            name="fk_crm_activities_contact",
        ),
        Index("ix_crm_activities_tenant_contact", "tenant_id", "contact_id"),
        Index("ix_crm_activities_tenant_lead", "tenant_id", "lead_id"),
        Index("ix_crm_activities_tenant_deal", "tenant_id", "deal_id"),
        CheckConstraint(
            "kind IN ('call', 'meeting', 'email', 'task', 'note')",
            name="ck_crm_activities_kind",
        ),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    kind: Mapped[str] = mapped_column(String(20))
    subject: Mapped[str] = mapped_column(String(500), default="", server_default="")
    description: Mapped[str] = mapped_column(Text, default="", server_default="")
    lead_id: Mapped[int | None] = mapped_column(BigInteger)
    deal_id: Mapped[int | None] = mapped_column(BigInteger)
    contact_id: Mapped[int] = mapped_column(BigInteger)
    owner_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    outcome: Mapped[str | None] = mapped_column(String(50))
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CrmTag(Base):
    __tablename__ = "crm_tags"
    __table_args__ = (UniqueConstraint("tenant_id", "name", name="uq_crm_tags_tenant_name"),)
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    name: Mapped[str] = mapped_column(String(50))
    color: Mapped[str] = mapped_column(String(7), default="#6b7280", server_default="#6b7280")


class LeadTag(Base):
    __tablename__ = "crm_lead_tags"
    __table_args__ = (
        PrimaryKeyConstraint("tenant_id", "lead_id", "tag_id"),
        ForeignKeyConstraint(
            ["tenant_id", "lead_id"],
            ["leads.tenant_id", "leads.id"],
            ondelete="CASCADE",
            name="fk_crm_lead_tags_lead",
        ),
    )
    id = None  # type: ignore[assignment]
    tenant_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    lead_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    tag_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("crm_tags.id", ondelete="CASCADE"),
        primary_key=True,
    )


class ContactTag(Base):
    __tablename__ = "crm_contact_tags"
    __table_args__ = (
        PrimaryKeyConstraint("tenant_id", "contact_id", "tag_id"),
        ForeignKeyConstraint(
            ["tenant_id", "contact_id"],
            ["contacts.tenant_id", "contacts.id"],
            ondelete="CASCADE",
            name="fk_crm_contact_tags_contact",
        ),
    )
    id = None  # type: ignore[assignment]
    tenant_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    contact_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    tag_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("crm_tags.id", ondelete="CASCADE"),
        primary_key=True,
    )


class CrmProduct(Base):
    __tablename__ = "crm_products"
    __table_args__ = (UniqueConstraint("tenant_id", "sku", name="uq_crm_products_sku"),)
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    name: Mapped[str] = mapped_column(String(200))
    sku: Mapped[str | None] = mapped_column(String(50))
    description: Mapped[str] = mapped_column(Text, default="", server_default="")
    unit_price: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal(0), server_default="0"
    )
    unit: Mapped[str] = mapped_column(String(20), default="unit", server_default="unit")
    tax_pct: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), default=Decimal(18), server_default="18"
    )
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DealItem(Base):
    __tablename__ = "crm_deal_items"
    __table_args__ = (
        ForeignKeyConstraint(
            ["tenant_id", "deal_id"],
            ["deals.tenant_id", "deals.id"],
            ondelete="CASCADE",
            name="fk_crm_deal_items_deal",
        ),
        Index("ix_crm_deal_items_deal", "tenant_id", "deal_id"),
        CheckConstraint("quantity > 0", name="ck_crm_deal_items_qty"),
        CheckConstraint("unit_price >= 0", name="ck_crm_deal_items_price"),
        CheckConstraint(
            "discount_pct >= 0 AND discount_pct <= 100",
            name="ck_crm_deal_items_discount",
        ),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger)
    deal_id: Mapped[int] = mapped_column(BigInteger)
    product_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("crm_products.id"))
    description: Mapped[str] = mapped_column(String(500), default="", server_default="")
    quantity: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), default=Decimal(1), server_default="1"
    )
    unit_price: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal(0), server_default="0"
    )
    discount_pct: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), default=Decimal(0), server_default="0"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CrmQuote(Base):
    __tablename__ = "crm_quotes"
    __table_args__ = (
        ForeignKeyConstraint(
            ["tenant_id", "deal_id"],
            ["deals.tenant_id", "deals.id"],
            name="fk_crm_quotes_deal",
        ),
        UniqueConstraint("tenant_id", "number", name="uq_crm_quotes_number"),
        CheckConstraint(
            "status IN ('draft', 'sent', 'accepted', 'rejected', 'expired')",
            name="ck_crm_quotes_status",
        ),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger)
    deal_id: Mapped[int] = mapped_column(BigInteger)
    number: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(20), default="draft", server_default="draft")
    valid_until: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str] = mapped_column(Text, default="", server_default="")
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal(0), server_default="0")
    created_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CrmQuoteItem(Base):
    __tablename__ = "crm_quote_items"
    quote_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("crm_quotes.id", ondelete="CASCADE"),
    )
    description: Mapped[str] = mapped_column(String(500))
    quantity: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), default=Decimal(1), server_default="1"
    )
    unit_price: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal(0), server_default="0"
    )
    discount_pct: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), default=Decimal(0), server_default="0"
    )
    tax_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal(0), server_default="0")


class LeadScore(Base):
    __tablename__ = "crm_lead_scores"
    __table_args__ = (
        ForeignKeyConstraint(
            ["tenant_id", "lead_id"],
            ["leads.tenant_id", "leads.id"],
            name="fk_crm_lead_scores_lead",
            ondelete="CASCADE",
        ),
        UniqueConstraint("tenant_id", "lead_id", name="uq_crm_lead_scores_tenant_lead"),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, index=True)
    lead_id: Mapped[int] = mapped_column(BigInteger)
    score: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    score_factors: Mapped[dict[str, object]] = mapped_column(
        JSON, default=dict, server_default="{}"
    )
    calculated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SalesTarget(Base):
    __tablename__ = "crm_sales_targets"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "owner_id",
            "period",
            name="uq_crm_sales_targets_tenant_owner_period",
        ),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, index=True)
    crm_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("crm_workspaces.id"))
    owner_id: Mapped[int | None] = mapped_column(BigInteger)
    period: Mapped[str] = mapped_column(String(7))
    target_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal(0), server_default="0"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CustomFieldDef(Base):
    __tablename__ = "crm_custom_field_defs"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "entity_type",
            "field_name",
            name="uq_crm_custom_field_defs_name",
        ),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, index=True)
    entity_type: Mapped[str] = mapped_column(String(20))
    field_name: Mapped[str] = mapped_column(String(100))
    field_type: Mapped[str] = mapped_column(String(20))
    field_options: Mapped[dict[str, object] | None] = mapped_column(JSON)
    required: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CustomFieldVal(Base):
    __tablename__ = "crm_custom_field_vals"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "field_def_id",
            "entity_type",
            "entity_id",
            name="uq_crm_custom_field_vals_unique",
        ),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, index=True)
    field_def_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("crm_custom_field_defs.id", ondelete="CASCADE")
    )
    entity_type: Mapped[str] = mapped_column(String(20))
    entity_id: Mapped[int] = mapped_column(BigInteger)
    value_text: Mapped[str | None] = mapped_column(Text)
    value_number: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    value_date: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CrmAttachment(Base):
    __tablename__ = "crm_attachments"
    __table_args__ = (Index("ix_crm_attachments_entity", "tenant_id", "entity_type", "entity_id"),)
    tenant_id: Mapped[int] = mapped_column(BigInteger)
    entity_type: Mapped[str] = mapped_column(String(20))
    entity_id: Mapped[int] = mapped_column(BigInteger)
    filename: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    storage_key: Mapped[str] = mapped_column(String(500))
    uploaded_by: Mapped[int] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class EmailTemplate(Base):
    __tablename__ = "crm_email_templates"
    tenant_id: Mapped[int] = mapped_column(BigInteger, index=True)
    name: Mapped[str] = mapped_column(String(200))
    subject: Mapped[str] = mapped_column(String(500), default="", server_default="")
    body_html: Mapped[str] = mapped_column(Text, default="", server_default="")
    variables: Mapped[list[str]] = mapped_column(JSON, default=list, server_default="[]")
    category: Mapped[str | None] = mapped_column(String(50))
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_by: Mapped[int] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class EmailSequence(Base):
    __tablename__ = "crm_email_sequences"
    tenant_id: Mapped[int] = mapped_column(BigInteger, index=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    steps: Mapped[list[dict[str, object]]] = mapped_column(JSON, default=list, server_default="[]")
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_by: Mapped[int] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class WebForm(Base):
    __tablename__ = "crm_web_forms"
    tenant_id: Mapped[int] = mapped_column(BigInteger, index=True)
    crm_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("crm_workspaces.id"))
    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    fields_config: Mapped[list[dict[str, object]]] = mapped_column(
        JSON, default=list, server_default="[]"
    )
    redirect_url: Mapped[str | None] = mapped_column(String(500))
    notify_email: Mapped[str | None] = mapped_column(String(254))
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    submission_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_by: Mapped[int] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DuplicateGroup(Base):
    __tablename__ = "crm_duplicate_groups"
    tenant_id: Mapped[int] = mapped_column(BigInteger, index=True)
    entity_type: Mapped[str] = mapped_column(String(20))
    match_field: Mapped[str] = mapped_column(String(50))
    match_value: Mapped[str] = mapped_column(String(500))
    entity_ids: Mapped[list[int]] = mapped_column(JSON, default=list, server_default="[]")
    status: Mapped[str] = mapped_column(String(20), default="pending", server_default="pending")
    merged_into_id: Mapped[int | None] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
