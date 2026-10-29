"""Item master, batches, stock movements and adjustments on the server"""

import sqlalchemy as sa
from alembic import op

revision = "0025"
down_revision = "0024"

TABLES = ["ops_items", "ops_batches", "ops_movements", "ops_adjustments"]


def upgrade() -> None:
    op.create_table(
        "ops_items",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("item_key", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("sku", sa.String(length=64), nullable=False),
        sa.Column("unit", sa.String(length=20), nullable=False),
        sa.Column("hsn", sa.String(length=8), nullable=False),
        sa.Column("rate_paise", sa.BigInteger(), nullable=False),
        sa.Column("gst_rate", sa.Integer(), nullable=False),
        sa.Column("reorder_level", sa.Numeric(12, 3), nullable=False),
        sa.Column("track_batch", sa.Boolean(), nullable=False),
        sa.UniqueConstraint("tenant_id", "item_key"),
        sa.UniqueConstraint("tenant_id", "sku"),
        sa.CheckConstraint("rate_paise >= 0", name="ck_ops_items_rate"),
        sa.CheckConstraint("gst_rate >= 0 AND gst_rate <= 28", name="ck_ops_items_gst"),
    )
    op.create_table(
        "ops_batches",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("batch_key", sa.String(length=64), nullable=False),
        sa.Column("item_id", sa.BigInteger(), sa.ForeignKey("ops_items.id"), nullable=False),
        sa.Column("batch_no", sa.String(length=64), nullable=False),
        sa.Column("expiry", sa.Date(), nullable=False),
        sa.UniqueConstraint("tenant_id", "batch_key"),
        sa.UniqueConstraint("tenant_id", "item_id", "batch_no"),
    )
    op.create_table(
        "ops_movements",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("move_key", sa.String(length=64), nullable=False),
        sa.Column("item_id", sa.BigInteger(), sa.ForeignKey("ops_items.id"), nullable=False),
        sa.Column("location_id", sa.Integer(), nullable=False),
        sa.Column("batch_no", sa.String(length=64), nullable=True),
        sa.Column("kind", sa.String(length=12), nullable=False),
        sa.Column("qty", sa.Numeric(12, 3), nullable=False),
        sa.Column("reason", sa.String(length=300), nullable=False),
        sa.Column("booked_on", sa.Date(), nullable=False),
        sa.Column("recorded_by_name", sa.String(length=160), nullable=False),
        sa.Column("idempotency_key", sa.String(length=80), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "move_key"),
        sa.UniqueConstraint("tenant_id", "idempotency_key"),
        sa.CheckConstraint("qty <> 0", name="ck_ops_movements_qty"),
        sa.CheckConstraint("kind IN ('receipt', 'adjustment')", name="ck_ops_movements_kind"),
        sa.CheckConstraint(
            "(kind = 'receipt' AND qty > 0) OR kind = 'adjustment'", name="ck_ops_movements_sign"
        ),
    )
    op.create_table(
        "ops_adjustments",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("item_id", sa.BigInteger(), sa.ForeignKey("ops_items.id"), nullable=False),
        sa.Column("location_id", sa.Integer(), nullable=False),
        sa.Column("batch_no", sa.String(length=64), nullable=True),
        sa.Column("qty", sa.Numeric(12, 3), nullable=False),
        sa.Column("reason", sa.String(length=300), nullable=False),
        sa.Column("value_paise", sa.BigInteger(), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("booked_on", sa.Date(), nullable=False),
        sa.Column("requested_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("requested_by_name", sa.String(length=160), nullable=False),
        sa.Column("approved_by_name", sa.String(length=160), nullable=True),
        sa.Column("rejected_by_name", sa.String(length=160), nullable=True),
        sa.Column("rejected_reason", sa.String(length=300), nullable=True),
        sa.Column("idempotency_key", sa.String(length=80), nullable=False),
        sa.UniqueConstraint("tenant_id", "idempotency_key"),
        sa.CheckConstraint("qty <> 0", name="ck_ops_adjustments_qty"),
        sa.CheckConstraint("value_paise >= 0", name="ck_ops_adjustments_value"),
        sa.CheckConstraint(
            "status IN ('pending', 'applied', 'rejected')", name="ck_ops_adjustments_status"
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
