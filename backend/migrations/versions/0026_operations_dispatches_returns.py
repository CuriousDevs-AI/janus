"""Dispatches with challans, and returns, on the server. Dispatch and return stock movements."""

import sqlalchemy as sa
from alembic import op

revision = "0026"
down_revision = "0025"

TABLES = ["ops_dispatches", "ops_dispatch_lines", "ops_returns"]


def upgrade() -> None:
    op.execute("ALTER TABLE ops_movements DROP CONSTRAINT ck_ops_movements_kind")
    op.execute("ALTER TABLE ops_movements DROP CONSTRAINT ck_ops_movements_sign")
    op.execute(
        "ALTER TABLE ops_movements ADD CONSTRAINT ck_ops_movements_kind "
        "CHECK (kind IN ('receipt', 'adjustment', 'dispatch', 'return'))"
    )
    op.execute(
        "ALTER TABLE ops_movements ADD CONSTRAINT ck_ops_movements_sign CHECK ("
        "(kind IN ('receipt', 'return') AND qty > 0) OR (kind = 'dispatch' AND qty < 0) "
        "OR kind = 'adjustment')"
    )
    op.create_table(
        "ops_dispatches",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("number", sa.String(length=20), nullable=False),
        sa.Column("challan_no", sa.String(length=20), nullable=False),
        sa.Column("location_id", sa.Integer(), nullable=False),
        sa.Column("customer", sa.String(length=160), nullable=False),
        sa.Column("customer_company", sa.String(length=160), nullable=False),
        sa.Column("deal_ref", sa.String(length=80), nullable=True),
        sa.Column("transporter", sa.String(length=160), nullable=True),
        sa.Column("lr_number", sa.String(length=60), nullable=True),
        sa.Column("status", sa.String(length=12), nullable=False),
        sa.Column("picked_by", sa.String(length=160), nullable=True),
        sa.Column("packed_by", sa.String(length=160), nullable=True),
        sa.Column("shipped_by", sa.String(length=160), nullable=True),
        sa.Column("proof", sa.String(length=300), nullable=True),
        sa.Column("delivered_by", sa.String(length=160), nullable=True),
        sa.Column("booked_on", sa.Date(), nullable=False),
        sa.Column("created_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_by_name", sa.String(length=160), nullable=False),
        sa.Column("idempotency_key", sa.String(length=80), nullable=False),
        sa.UniqueConstraint("tenant_id", "number"),
        sa.UniqueConstraint("tenant_id", "idempotency_key"),
        sa.CheckConstraint(
            "status IN ('dispatched', 'delivered')", name="ck_ops_dispatches_status"
        ),
    )
    op.create_table(
        "ops_dispatch_lines",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column(
            "dispatch_id", sa.BigInteger(), sa.ForeignKey("ops_dispatches.id"), nullable=False
        ),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.BigInteger(), sa.ForeignKey("ops_items.id"), nullable=False),
        sa.Column("batch_no", sa.String(length=64), nullable=True),
        sa.Column("qty", sa.Numeric(12, 3), nullable=False),
        sa.Column("rate_paise", sa.BigInteger(), nullable=False),
        sa.UniqueConstraint("dispatch_id", "position"),
        sa.CheckConstraint("qty > 0 AND rate_paise >= 0", name="ck_ops_dispatch_lines_amounts"),
    )
    op.create_table(
        "ops_returns",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("number", sa.String(length=20), nullable=False),
        sa.Column(
            "dispatch_id", sa.BigInteger(), sa.ForeignKey("ops_dispatches.id"), nullable=False
        ),
        sa.Column("item_id", sa.BigInteger(), sa.ForeignKey("ops_items.id"), nullable=False),
        sa.Column("batch_no", sa.String(length=64), nullable=True),
        sa.Column("qty", sa.Numeric(12, 3), nullable=False),
        sa.Column("reason", sa.String(length=300), nullable=False),
        sa.Column("status", sa.String(length=12), nullable=False),
        sa.Column("condition", sa.String(length=10), nullable=True),
        sa.Column("location_id", sa.Integer(), nullable=False),
        sa.Column("raised_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("raised_by_name", sa.String(length=160), nullable=False),
        sa.Column("inspected_by_name", sa.String(length=160), nullable=True),
        sa.Column("idempotency_key", sa.String(length=80), nullable=False),
        sa.UniqueConstraint("tenant_id", "number"),
        sa.UniqueConstraint("tenant_id", "idempotency_key"),
        sa.CheckConstraint("qty > 0", name="ck_ops_returns_qty"),
        sa.CheckConstraint("status IN ('authorised', 'inspected')", name="ck_ops_returns_status"),
        sa.CheckConstraint(
            "condition IS NULL OR condition IN ('good', 'damaged')", name="ck_ops_returns_condition"
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
    op.execute("ALTER TABLE ops_movements DROP CONSTRAINT ck_ops_movements_sign")
    op.execute("ALTER TABLE ops_movements DROP CONSTRAINT ck_ops_movements_kind")
    op.execute(
        "ALTER TABLE ops_movements ADD CONSTRAINT ck_ops_movements_kind "
        "CHECK (kind IN ('receipt', 'adjustment'))"
    )
    op.execute(
        "ALTER TABLE ops_movements ADD CONSTRAINT ck_ops_movements_sign "
        "CHECK ((kind = 'receipt' AND qty > 0) OR kind = 'adjustment')"
    )
