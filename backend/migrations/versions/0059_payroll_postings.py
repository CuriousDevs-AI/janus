"""A month's salaries posted to a company's books, from HR's monthly salaries, so profit after
salaries is recorded. One posting per company and month, under row-level security; the worker
reads it for red alerts.
"""

import sqlalchemy as sa
from alembic import op

revision = "0059"
down_revision = "0058"


def upgrade() -> None:
    op.create_table(
        "finance_payroll_postings",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("month", sa.Date(), nullable=False),
        sa.Column("amount_paise", sa.BigInteger(), nullable=False),
        sa.Column("headcount", sa.Integer(), nullable=False),
        sa.Column("posted_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("posted_by_name", sa.String(160), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("tenant_id", "month"),
        sa.CheckConstraint("amount_paise > 0 AND headcount >= 0", name="ck_payroll_amounts"),
        sa.CheckConstraint("extract(day FROM month) = 1", name="ck_payroll_month"),
    )
    op.execute("ALTER TABLE finance_payroll_postings ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE finance_payroll_postings FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_access ON finance_payroll_postings "
        "USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant())"
    )
    op.execute("GRANT SELECT, INSERT ON finance_payroll_postings TO janus_app")
    op.execute("GRANT SELECT ON finance_payroll_postings TO janus_worker")


def downgrade() -> None:
    op.drop_table("finance_payroll_postings")
