"""Customer by customer, months from before a company kept its books in Janus, imported from a
party-wise sales report, so the Portfolio can say which customers were kept and which were lost.
Per company under row-level security.
"""

import sqlalchemy as sa
from alembic import op

revision = "0065"
down_revision = "0064"


def upgrade() -> None:
    op.create_table(
        "finance_history_customers",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("month", sa.Date(), nullable=False),
        sa.Column("customer", sa.String(160), nullable=False),
        sa.Column("sales_paise", sa.BigInteger(), nullable=False),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("imported_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("tenant_id", "month", "customer"),
        sa.CheckConstraint("extract(day FROM month) = 1", name="ck_history_customers_month"),
        sa.CheckConstraint("sales_paise >= 0", name="ck_history_customers_sales"),
        sa.CheckConstraint(
            "source IN ('tally', 'zoho', 'other')", name="ck_history_customers_source"
        ),
    )
    op.execute("ALTER TABLE finance_history_customers ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE finance_history_customers FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_access ON finance_history_customers "
        "USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant())"
    )
    op.execute("GRANT SELECT, INSERT, UPDATE ON finance_history_customers TO janus_app")


def downgrade() -> None:
    op.drop_table("finance_history_customers")
