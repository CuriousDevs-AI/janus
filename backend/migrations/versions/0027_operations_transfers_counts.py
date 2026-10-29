"""Stock transfers between locations, and physical counts, on the server."""

import sqlalchemy as sa
from alembic import op

revision = "0027"
down_revision = "0026"

TABLES = ["ops_transfers", "ops_counts", "ops_count_lines"]


def upgrade() -> None:
    op.execute("ALTER TABLE ops_movements DROP CONSTRAINT ck_ops_movements_kind")
    op.execute("ALTER TABLE ops_movements DROP CONSTRAINT ck_ops_movements_sign")
    op.execute(
        "ALTER TABLE ops_movements ADD CONSTRAINT ck_ops_movements_kind CHECK (kind IN ("
        "'receipt', 'adjustment', 'dispatch', 'return', 'transfer_out', 'transfer_in'))"
    )
    op.execute(
        "ALTER TABLE ops_movements ADD CONSTRAINT ck_ops_movements_sign CHECK ("
        "(kind IN ('receipt', 'return', 'transfer_in') AND qty > 0)"
        " OR (kind IN ('dispatch', 'transfer_out') AND qty < 0) OR kind = 'adjustment')"
    )
    op.create_table(
        "ops_transfers",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("number", sa.String(length=20), nullable=False),
        sa.Column("item_id", sa.BigInteger(), sa.ForeignKey("ops_items.id"), nullable=False),
        sa.Column("batch_no", sa.String(length=64), nullable=True),
        sa.Column("qty", sa.Numeric(12, 3), nullable=False),
        sa.Column("from_location_id", sa.Integer(), nullable=False),
        sa.Column("to_location_id", sa.Integer(), nullable=False),
        sa.Column("transporter", sa.String(length=160), nullable=False),
        sa.Column("lr_number", sa.String(length=60), nullable=True),
        sa.Column("status", sa.String(length=12), nullable=False),
        sa.Column("booked_on", sa.Date(), nullable=False),
        sa.Column("sent_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("sent_by_name", sa.String(length=160), nullable=False),
        sa.Column("received_by_name", sa.String(length=160), nullable=True),
        sa.Column("idempotency_key", sa.String(length=80), nullable=False),
        sa.UniqueConstraint("tenant_id", "number"),
        sa.UniqueConstraint("tenant_id", "idempotency_key"),
        sa.CheckConstraint("qty > 0", name="ck_ops_transfers_qty"),
        sa.CheckConstraint("from_location_id <> to_location_id", name="ck_ops_transfers_locations"),
        sa.CheckConstraint("status IN ('in transit', 'received')", name="ck_ops_transfers_status"),
    )
    op.create_table(
        "ops_counts",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("number", sa.String(length=20), nullable=False),
        sa.Column("location_id", sa.Integer(), nullable=False),
        sa.Column("booked_on", sa.Date(), nullable=False),
        sa.Column("counted_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("counted_by_name", sa.String(length=160), nullable=False),
        sa.Column("idempotency_key", sa.String(length=80), nullable=False),
        sa.UniqueConstraint("tenant_id", "number"),
        sa.UniqueConstraint("tenant_id", "idempotency_key"),
    )
    op.create_table(
        "ops_count_lines",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("count_id", sa.BigInteger(), sa.ForeignKey("ops_counts.id"), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.BigInteger(), sa.ForeignKey("ops_items.id"), nullable=False),
        sa.Column("batch_no", sa.String(length=64), nullable=True),
        sa.Column("system_qty", sa.Numeric(12, 3), nullable=False),
        sa.Column("counted_qty", sa.Numeric(12, 3), nullable=False),
        sa.Column("variance", sa.Numeric(12, 3), nullable=False),
        sa.UniqueConstraint("count_id", "position"),
        sa.CheckConstraint("counted_qty >= 0", name="ck_ops_count_lines_counted"),
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
        "CHECK (kind IN ('receipt', 'adjustment', 'dispatch', 'return'))"
    )
    op.execute(
        "ALTER TABLE ops_movements ADD CONSTRAINT ck_ops_movements_sign CHECK ("
        "(kind IN ('receipt', 'return') AND qty > 0) OR (kind = 'dispatch' AND qty < 0) "
        "OR kind = 'adjustment')"
    )
