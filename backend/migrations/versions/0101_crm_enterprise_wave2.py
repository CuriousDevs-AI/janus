"""CRM enterprise wave 2: scoring, targets, custom fields, attachments, templates, sequences, web forms, duplicates.

Revision ID: 0101
Revises: 0100
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0101"
down_revision: str | None = "0100"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "crm_lead_scores",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, nullable=False, index=True),
        sa.Column("lead_id", sa.BigInteger, nullable=False),
        sa.Column("score", sa.Integer, nullable=False, server_default="0"),
        sa.Column("score_factors", sa.JSON, nullable=False, server_default="{}"),
        sa.Column(
            "calculated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id", "lead_id"],
            ["leads.tenant_id", "leads.id"],
            name="fk_crm_lead_scores_lead",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("tenant_id", "lead_id", name="uq_crm_lead_scores_tenant_lead"),
    )

    op.create_table(
        "crm_sales_targets",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, nullable=False, index=True),
        sa.Column("owner_id", sa.BigInteger, nullable=True),
        sa.Column("period", sa.String(7), nullable=False),
        sa.Column(
            "target_amount",
            sa.Numeric(14, 2),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "tenant_id",
            "owner_id",
            "period",
            name="uq_crm_sales_targets_tenant_owner_period",
        ),
    )

    op.create_table(
        "crm_custom_field_defs",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, nullable=False, index=True),
        sa.Column("entity_type", sa.String(20), nullable=False),
        sa.Column("field_name", sa.String(100), nullable=False),
        sa.Column("field_type", sa.String(20), nullable=False),
        sa.Column("field_options", sa.JSON, nullable=True),
        sa.Column("required", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "tenant_id",
            "entity_type",
            "field_name",
            name="uq_crm_custom_field_defs_name",
        ),
    )

    op.create_table(
        "crm_custom_field_vals",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, nullable=False, index=True),
        sa.Column(
            "field_def_id",
            sa.BigInteger,
            sa.ForeignKey("crm_custom_field_defs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("entity_type", sa.String(20), nullable=False),
        sa.Column("entity_id", sa.BigInteger, nullable=False),
        sa.Column("value_text", sa.Text, nullable=True),
        sa.Column("value_number", sa.Numeric(14, 2), nullable=True),
        sa.Column("value_date", sa.Date, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "tenant_id",
            "field_def_id",
            "entity_type",
            "entity_id",
            name="uq_crm_custom_field_vals_unique",
        ),
    )

    op.create_table(
        "crm_attachments",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, nullable=False),
        sa.Column("entity_type", sa.String(20), nullable=False),
        sa.Column("entity_id", sa.BigInteger, nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("content_type", sa.String(100), nullable=False),
        sa.Column("size_bytes", sa.BigInteger, nullable=False),
        sa.Column("storage_key", sa.String(500), nullable=False),
        sa.Column("uploaded_by", sa.BigInteger, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Index(
            "ix_crm_attachments_entity",
            "tenant_id",
            "entity_type",
            "entity_id",
        ),
    )

    op.create_table(
        "crm_email_templates",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("subject", sa.String(500), nullable=False, server_default=""),
        sa.Column("body_html", sa.Text, nullable=False, server_default=""),
        sa.Column("variables", sa.JSON, nullable=False, server_default="[]"),
        sa.Column("category", sa.String(50), nullable=True),
        sa.Column("active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_by", sa.BigInteger, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    op.create_table(
        "crm_email_sequences",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("steps", sa.JSON, nullable=False, server_default="[]"),
        sa.Column("active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_by", sa.BigInteger, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    op.create_table(
        "crm_web_forms",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False, unique=True),
        sa.Column("fields_config", sa.JSON, nullable=False, server_default="[]"),
        sa.Column("redirect_url", sa.String(500), nullable=True),
        sa.Column("notify_email", sa.String(254), nullable=True),
        sa.Column("active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("submission_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_by", sa.BigInteger, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    op.create_table(
        "crm_duplicate_groups",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, nullable=False, index=True),
        sa.Column("entity_type", sa.String(20), nullable=False),
        sa.Column("match_field", sa.String(50), nullable=False),
        sa.Column("match_value", sa.String(500), nullable=False),
        sa.Column("entity_ids", sa.JSON, nullable=False, server_default="[]"),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("merged_into_id", sa.BigInteger, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("crm_duplicate_groups")
    op.drop_table("crm_web_forms")
    op.drop_table("crm_email_sequences")
    op.drop_table("crm_email_templates")
    op.drop_table("crm_attachments")
    op.drop_table("crm_custom_field_vals")
    op.drop_table("crm_custom_field_defs")
    op.drop_table("crm_sales_targets")
    op.drop_table("crm_lead_scores")
