"""Enterprise CRM: activities, tags, products, deal items, quotes.

Revision ID: 0100
Revises: 0099
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0100"
down_revision: str | None = "0099"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_unique_constraint(
        "deals_tenant_id_id_key", "deals", ["tenant_id", "id"],
    )

    op.create_table(
        "crm_activities",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("subject", sa.String(500), nullable=False, server_default=""),
        sa.Column("description", sa.Text, nullable=False, server_default=""),
        sa.Column("lead_id", sa.BigInteger, nullable=True),
        sa.Column("contact_id", sa.BigInteger, nullable=False),
        sa.Column("owner_id", sa.BigInteger, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("outcome", sa.String(50), nullable=True),
        sa.Column("duration_seconds", sa.Integer, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id", "lead_id"],
            ["leads.tenant_id", "leads.id"],
            name="fk_crm_activities_lead",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id", "contact_id"],
            ["contacts.tenant_id", "contacts.id"],
            name="fk_crm_activities_contact",
        ),
        sa.CheckConstraint(
            "kind IN ('call', 'meeting', 'email', 'task')",
            name="ck_crm_activities_kind",
        ),
    )
    op.create_index(
        "ix_crm_activities_tenant_contact",
        "crm_activities",
        ["tenant_id", "contact_id"],
    )
    op.create_index(
        "ix_crm_activities_tenant_lead",
        "crm_activities",
        ["tenant_id", "lead_id"],
    )

    op.create_table(
        "crm_tags",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("color", sa.String(7), nullable=False, server_default="#6b7280"),
        sa.UniqueConstraint("tenant_id", "name", name="uq_crm_tags_tenant_name"),
    )

    op.create_table(
        "crm_lead_tags",
        sa.Column("tenant_id", sa.BigInteger, nullable=False),
        sa.Column("lead_id", sa.BigInteger, nullable=False),
        sa.Column(
            "tag_id",
            sa.BigInteger,
            sa.ForeignKey("crm_tags.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("tenant_id", "lead_id", "tag_id"),
        sa.ForeignKeyConstraint(
            ["tenant_id", "lead_id"],
            ["leads.tenant_id", "leads.id"],
            ondelete="CASCADE",
            name="fk_crm_lead_tags_lead",
        ),
    )

    op.create_table(
        "crm_contact_tags",
        sa.Column("tenant_id", sa.BigInteger, nullable=False),
        sa.Column("contact_id", sa.BigInteger, nullable=False),
        sa.Column(
            "tag_id",
            sa.BigInteger,
            sa.ForeignKey("crm_tags.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("tenant_id", "contact_id", "tag_id"),
        sa.ForeignKeyConstraint(
            ["tenant_id", "contact_id"],
            ["contacts.tenant_id", "contacts.id"],
            ondelete="CASCADE",
            name="fk_crm_contact_tags_contact",
        ),
    )

    op.create_table(
        "crm_products",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("sku", sa.String(50), nullable=True),
        sa.Column("description", sa.Text, nullable=False, server_default=""),
        sa.Column(
            "unit_price",
            sa.Numeric(14, 2),
            nullable=False,
            server_default="0",
        ),
        sa.Column("unit", sa.String(20), nullable=False, server_default="unit"),
        sa.Column(
            "tax_pct",
            sa.Numeric(5, 2),
            nullable=False,
            server_default="18",
        ),
        sa.Column("active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("tenant_id", "sku", name="uq_crm_products_sku"),
    )

    op.create_table(
        "crm_deal_items",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, nullable=False),
        sa.Column("deal_id", sa.BigInteger, nullable=False),
        sa.Column(
            "product_id",
            sa.BigInteger,
            sa.ForeignKey("crm_products.id"),
            nullable=True,
        ),
        sa.Column("description", sa.String(500), nullable=False, server_default=""),
        sa.Column(
            "quantity",
            sa.Numeric(10, 2),
            nullable=False,
            server_default="1",
        ),
        sa.Column("unit_price", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column(
            "discount_pct",
            sa.Numeric(5, 2),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id", "deal_id"],
            ["deals.tenant_id", "deals.id"],
            ondelete="CASCADE",
            name="fk_crm_deal_items_deal",
        ),
        sa.CheckConstraint("quantity > 0", name="ck_crm_deal_items_qty"),
        sa.CheckConstraint("unit_price >= 0", name="ck_crm_deal_items_price"),
        sa.CheckConstraint(
            "discount_pct >= 0 AND discount_pct <= 100",
            name="ck_crm_deal_items_discount",
        ),
    )
    op.create_index(
        "ix_crm_deal_items_deal",
        "crm_deal_items",
        ["tenant_id", "deal_id"],
    )

    op.create_table(
        "crm_quotes",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, nullable=False),
        sa.Column("deal_id", sa.BigInteger, nullable=False),
        sa.Column("number", sa.String(30), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("valid_until", sa.Date, nullable=True),
        sa.Column("notes", sa.Text, nullable=False, server_default=""),
        sa.Column("total", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column(
            "created_by",
            sa.BigInteger,
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id", "deal_id"],
            ["deals.tenant_id", "deals.id"],
            name="fk_crm_quotes_deal",
        ),
        sa.UniqueConstraint("tenant_id", "number", name="uq_crm_quotes_number"),
        sa.CheckConstraint(
            "status IN ('draft', 'sent', 'accepted', 'rejected', 'expired')",
            name="ck_crm_quotes_status",
        ),
    )

    op.create_table(
        "crm_quote_items",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column(
            "quote_id",
            sa.BigInteger,
            sa.ForeignKey("crm_quotes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column(
            "quantity",
            sa.Numeric(10, 2),
            nullable=False,
            server_default="1",
        ),
        sa.Column("unit_price", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column(
            "discount_pct",
            sa.Numeric(5, 2),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "tax_pct",
            sa.Numeric(5, 2),
            nullable=False,
            server_default="0",
        ),
        sa.CheckConstraint("quantity > 0", name="ck_crm_quote_items_qty"),
    )


def downgrade() -> None:
    op.drop_table("crm_quote_items")
    op.drop_table("crm_quotes")
    op.drop_index("ix_crm_deal_items_deal")
    op.drop_table("crm_deal_items")
    op.drop_table("crm_products")
    op.drop_table("crm_contact_tags")
    op.drop_table("crm_lead_tags")
    op.drop_table("crm_tags")
    op.drop_index("ix_crm_activities_tenant_lead")
    op.drop_index("ix_crm_activities_tenant_contact")
    op.drop_table("crm_activities")
    op.drop_constraint("deals_tenant_id_id_key", "deals")
