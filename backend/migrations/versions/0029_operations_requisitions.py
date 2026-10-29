"""Requisitions to buy: approved against a budget line on the server, then ordered."""

import sqlalchemy as sa
from alembic import op

revision = "0029"
down_revision = "0028"


def upgrade() -> None:
    op.create_table(
        "ops_requisitions",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("req_key", sa.String(length=64), nullable=False),
        sa.Column("number", sa.String(length=20), nullable=False),
        sa.Column("item_id", sa.BigInteger(), sa.ForeignKey("ops_items.id"), nullable=False),
        sa.Column("qty", sa.Numeric(12, 3), nullable=False),
        sa.Column("estimated_rate_paise", sa.BigInteger(), nullable=False),
        sa.Column("location_id", sa.Integer(), nullable=False),
        sa.Column("budget_line_key", sa.String(length=80), nullable=False),
        sa.Column("reason", sa.String(length=300), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("requested_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("requested_by_name", sa.String(length=160), nullable=False),
        sa.Column("decided_by_name", sa.String(length=160), nullable=True),
        sa.Column("rejected_reason", sa.String(length=300), nullable=True),
        sa.Column("po_key", sa.String(length=64), nullable=True),
        sa.Column("raised_on", sa.Date(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=80), nullable=False),
        sa.UniqueConstraint("tenant_id", "req_key"),
        sa.UniqueConstraint("tenant_id", "number"),
        sa.UniqueConstraint("tenant_id", "idempotency_key"),
        sa.CheckConstraint(
            "qty > 0 AND estimated_rate_paise >= 0", name="ck_ops_requisitions_amounts"
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected', 'ordered')",
            name="ck_ops_requisitions_status",
        ),
    )
    op.execute("ALTER TABLE ops_requisitions ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE ops_requisitions FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_access ON ops_requisitions USING (tenant_id = app_tenant()) "
        "WITH CHECK (tenant_id = app_tenant())"
    )


def downgrade() -> None:
    op.drop_table("ops_requisitions")
