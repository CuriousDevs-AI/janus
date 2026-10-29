"""Fund requests on the server; approval allocates the money to the budget line."""

import sqlalchemy as sa
from alembic import op

revision = "0031"
down_revision = "0030"


def upgrade() -> None:
    op.create_table(
        "finance_fund_requests",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("req_key", sa.String(length=64), nullable=False),
        sa.Column("number", sa.String(length=20), nullable=False),
        sa.Column("purpose", sa.String(length=200), nullable=False),
        sa.Column("amount_paise", sa.BigInteger(), nullable=False),
        sa.Column("budget_line_key", sa.String(length=80), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("requested_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("requested_by_name", sa.String(length=160), nullable=False),
        sa.Column("owner_approved_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("owner_approved_by_name", sa.String(length=160), nullable=True),
        sa.Column("finance_approved_by_name", sa.String(length=160), nullable=True),
        sa.Column("rejected_by_name", sa.String(length=160), nullable=True),
        sa.Column("rejected_reason", sa.String(length=300), nullable=True),
        sa.Column("raised_on", sa.Date(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=80), nullable=False),
        sa.UniqueConstraint("tenant_id", "req_key"),
        sa.UniqueConstraint("tenant_id", "number"),
        sa.UniqueConstraint("tenant_id", "idempotency_key"),
        sa.CheckConstraint("amount_paise > 0", name="ck_fund_requests_amount"),
        sa.CheckConstraint(
            "status IN ('pending', 'awaiting_finance', 'approved', 'rejected')",
            name="ck_fund_requests_status",
        ),
    )
    op.execute("ALTER TABLE finance_fund_requests ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE finance_fund_requests FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_access ON finance_fund_requests USING (tenant_id = app_tenant()) "
        "WITH CHECK (tenant_id = app_tenant())"
    )


def downgrade() -> None:
    op.drop_table("finance_fund_requests")
