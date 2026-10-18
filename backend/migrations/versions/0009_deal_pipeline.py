"""deal_pipeline"""

import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"


def upgrade() -> None:
    op.create_unique_constraint("leads_tenant_id_id_key", "leads", ["tenant_id", "id"])
    op.create_table(
        "deals",
        sa.Column("tenant_id", sa.BigInteger(), nullable=False),
        sa.Column("lead_id", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("stage", sa.String(length=30), nullable=False),
        sa.Column("expected_close_at", sa.Date(), nullable=True),
        sa.Column("lost_reason", sa.String(length=1000), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.CheckConstraint(
            "stage != 'lost' OR length(trim(lost_reason)) > 0", name="deal_lost_reason"
        ),
        sa.CheckConstraint(
            "stage IN ('new', 'qualified', 'demo', 'proposal', "
            "'negotiation', 'approval', 'won', 'lost')",
            name="deal_stage",
        ),
        sa.CheckConstraint("amount >= 0", name="deal_amount_nonnegative"),
        sa.CheckConstraint("version > 0", name="deal_version_positive"),
        sa.ForeignKeyConstraint(
            ["tenant_id", "lead_id"],
            ["leads.tenant_id", "leads.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "lead_id"),
    )
    op.create_index(op.f("ix_deals_tenant_id"), "deals", ["tenant_id"], unique=False)
    op.execute("ALTER TABLE deals ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE deals FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_only ON deals USING (tenant_id = app_tenant()) "
        "WITH CHECK (tenant_id = app_tenant())"
    )


def downgrade() -> None:
    op.drop_table("deals")
    op.drop_constraint("leads_tenant_id_id_key", "leads", type_="unique")
