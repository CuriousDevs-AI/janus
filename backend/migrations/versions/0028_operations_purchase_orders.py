"""Purchase orders and their lines on the server; goods received against them."""

import sqlalchemy as sa
from alembic import op

revision = "0028"
down_revision = "0027"

TABLES = ["ops_purchase_orders", "ops_po_lines"]


def upgrade() -> None:
    op.create_table(
        "ops_purchase_orders",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("po_key", sa.String(length=64), nullable=False),
        sa.Column("number", sa.String(length=20), nullable=False),
        sa.Column("vendor", sa.String(length=160), nullable=False),
        sa.Column("location_id", sa.Integer(), nullable=False),
        sa.Column("booked_on", sa.Date(), nullable=False),
        sa.Column("created_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_by_name", sa.String(length=160), nullable=False),
        sa.Column("idempotency_key", sa.String(length=80), nullable=False),
        sa.UniqueConstraint("tenant_id", "po_key"),
        sa.UniqueConstraint("tenant_id", "number"),
        sa.UniqueConstraint("tenant_id", "idempotency_key"),
    )
    op.create_table(
        "ops_po_lines",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column(
            "po_id", sa.BigInteger(), sa.ForeignKey("ops_purchase_orders.id"), nullable=False
        ),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.BigInteger(), sa.ForeignKey("ops_items.id"), nullable=False),
        sa.Column("qty", sa.Numeric(12, 3), nullable=False),
        sa.Column("rate_paise", sa.BigInteger(), nullable=False),
        sa.Column("received_qty", sa.Numeric(12, 3), nullable=False, server_default="0"),
        sa.UniqueConstraint("po_id", "position"),
        sa.CheckConstraint("qty > 0 AND rate_paise >= 0", name="ck_ops_po_lines_amounts"),
        sa.CheckConstraint(
            "received_qty >= 0 AND received_qty <= qty", name="ck_ops_po_lines_received"
        ),
    )
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_access ON {table} USING (tenant_id = app_tenant()) "
            "WITH CHECK (tenant_id = app_tenant())"
        )


def downgrade() -> None:
    for table in reversed(TABLES):
        op.drop_table(table)
