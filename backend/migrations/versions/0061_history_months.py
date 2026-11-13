"""Months from before a company kept its books in Janus, imported from Tally, Zoho Books or
another system, so growth against last year can be shown from the start. Per company under
row-level security.
"""

import sqlalchemy as sa
from alembic import op

revision = "0061"
down_revision = "0060"


def upgrade() -> None:
    op.create_table(
        "finance_history_months",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("month", sa.Date(), nullable=False),
        sa.Column("sales_paise", sa.BigInteger(), nullable=False),
        sa.Column("costs_paise", sa.BigInteger(), nullable=False),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("imported_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("tenant_id", "month"),
        sa.CheckConstraint("extract(day FROM month) = 1", name="ck_history_month"),
        sa.CheckConstraint("source IN ('tally', 'zoho', 'other')", name="ck_history_source"),
    )
    op.execute("ALTER TABLE finance_history_months ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE finance_history_months FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_access ON finance_history_months "
        "USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant())"
    )
    op.execute("GRANT SELECT, INSERT, UPDATE ON finance_history_months TO janus_app")


def downgrade() -> None:
    op.drop_table("finance_history_months")
