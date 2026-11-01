"""Monthly targets and the statutory compliance calendar, per company.

A target is a monthly figure for leads, value won or money collected. The compliance profile says
which filings apply to the company (GST monthly or quarterly, TDS, PF and ESI, a company's ROC and
tax filings); due dates come from the statutory calendar in code, and each filing marked done is
kept. All three tables are per company under row-level security.
"""

import sqlalchemy as sa
from alembic import op

revision = "0050"
down_revision = "0049"

TABLES = ("portfolio_targets", "compliance_profiles", "compliance_filings")


def upgrade() -> None:
    op.create_table(
        "portfolio_targets",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("metric", sa.String(20), nullable=False),
        sa.Column("monthly", sa.Numeric(16, 2), nullable=False),
        sa.Column("updated_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("tenant_id", "metric"),
        sa.CheckConstraint(
            "metric IN ('leads', 'won_value', 'collected')", name="ck_targets_metric"
        ),
        sa.CheckConstraint("monthly >= 0", name="ck_targets_monthly"),
    )
    op.create_table(
        "compliance_profiles",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("gstin", sa.String(15)),
        sa.Column("gst_filing", sa.String(10), nullable=False, server_default="none"),
        sa.Column("tds", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("pf_esi", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("company", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("updated_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("tenant_id"),
        sa.CheckConstraint(
            "gst_filing IN ('none', 'monthly', 'quarterly')", name="ck_compliance_gst_filing"
        ),
        sa.CheckConstraint(
            "gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$'",
            name="ck_compliance_gstin",
        ),
    )
    op.create_table(
        "compliance_filings",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("item_key", sa.String(40), nullable=False),
        sa.Column("filed_on", sa.Date(), nullable=False),
        sa.Column("filed_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("tenant_id", "item_key"),
    )
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_access ON {table} "
            "USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant())"
        )
        # Granted here rather than left to default privileges, which not every database has.
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO janus_app")


def downgrade() -> None:
    for table in reversed(TABLES):
        op.drop_table(table)
