"""server-side budget lines and their draws and releases, in paise"""

import sqlalchemy as sa
from alembic import op

revision = "0020"
down_revision = "0019"


def _tenant_rls(table: str) -> None:
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY tenant_access ON {table} USING (tenant_id = app_tenant()) "
        "WITH CHECK (tenant_id = app_tenant())"
    )


def upgrade() -> None:
    op.create_table(
        "finance_budget_lines",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("external_key", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("owner_name", sa.String(length=160), nullable=False),
        sa.Column("allocated_paise", sa.BigInteger(), nullable=False),
        sa.Column("drawn_paise", sa.BigInteger(), nullable=False, server_default="0"),
        sa.UniqueConstraint("tenant_id", "external_key"),
        sa.CheckConstraint("allocated_paise >= 0", name="ck_budget_allocated"),
        sa.CheckConstraint("drawn_paise >= 0", name="ck_budget_drawn"),
        sa.CheckConstraint("drawn_paise <= allocated_paise", name="ck_budget_within_allocation"),
    )
    _tenant_rls("finance_budget_lines")

    op.create_table(
        "finance_budget_movements",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column(
            "line_id", sa.BigInteger(), sa.ForeignKey("finance_budget_lines.id"), nullable=False
        ),
        sa.Column("amount_paise", sa.BigInteger(), nullable=False),
        sa.Column("note", sa.String(length=300), nullable=False, server_default=""),
        sa.Column("booked_on", sa.Date(), nullable=False),
        sa.Column("created_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("idempotency_key", sa.String(length=80), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("tenant_id", "idempotency_key"),
        sa.CheckConstraint("amount_paise <> 0", name="ck_movements_amount"),
    )
    _tenant_rls("finance_budget_movements")


def downgrade() -> None:
    op.drop_table("finance_budget_movements")
    op.drop_table("finance_budget_lines")
