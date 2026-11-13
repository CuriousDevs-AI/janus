"""Customers an owner said are the same, per company, so one customer written two ways is counted
once in customers kept. Per company under row-level security.
"""

import sqlalchemy as sa
from alembic import op

revision = "0069"
down_revision = "0068"


def upgrade() -> None:
    op.create_table(
        "portfolio_customer_merges",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        # The name as written, matched without case, punctuation or "Pvt Ltd".
        sa.Column("alias_key", sa.String(160), nullable=False),
        sa.Column("alias", sa.String(160), nullable=False),
        # The customer it is counted as.
        sa.Column("customer", sa.String(160), nullable=False),
        sa.Column("merged_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("tenant_id", "alias_key"),
    )
    op.execute("ALTER TABLE portfolio_customer_merges ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE portfolio_customer_merges FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_access ON portfolio_customer_merges "
        "USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant())"
    )
    op.execute("GRANT SELECT, INSERT, DELETE ON portfolio_customer_merges TO janus_app")


def downgrade() -> None:
    op.drop_table("portfolio_customer_merges")
