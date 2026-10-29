"""Per-company period lock and approval and matching rules."""

import sqlalchemy as sa
from alembic import op

revision = "0032"
down_revision = "0031"


def upgrade() -> None:
    op.create_table(
        "company_rules",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("locked_through", sa.Date(), nullable=True),
        sa.Column(
            "adjustment_approval_value_paise",
            sa.BigInteger(),
            nullable=False,
            server_default="1000000",
        ),
        sa.Column("match_tolerance_percent", sa.Numeric(5, 2), nullable=False, server_default="2"),
        sa.UniqueConstraint("tenant_id", name="uq_company_rules_tenant"),
        sa.CheckConstraint(
            "adjustment_approval_value_paise >= 0", name="ck_company_rules_approval"
        ),
        sa.CheckConstraint(
            "match_tolerance_percent >= 0 AND match_tolerance_percent <= 10",
            name="ck_company_rules_tolerance",
        ),
    )
    op.execute("ALTER TABLE company_rules ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE company_rules FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_access ON company_rules USING (tenant_id = app_tenant()) "
        "WITH CHECK (tenant_id = app_tenant())"
    )


def downgrade() -> None:
    op.drop_table("company_rules")
