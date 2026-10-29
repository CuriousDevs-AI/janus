"""Vendor bills and their payments on the server, in paise, matched to purchase orders."""

import sqlalchemy as sa
from alembic import op

revision = "0030"
down_revision = "0029"

TABLES = ["finance_bills", "finance_bill_payments"]


def upgrade() -> None:
    op.create_table(
        "finance_bills",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("number", sa.String(length=20), nullable=False),
        sa.Column("vendor", sa.String(length=160), nullable=False),
        sa.Column("vendor_bill_no", sa.String(length=80), nullable=False),
        sa.Column("bill_date", sa.Date(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("amount_paise", sa.BigInteger(), nullable=False),
        sa.Column("po_key", sa.String(length=64), nullable=True),
        sa.Column("created_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_by_name", sa.String(length=160), nullable=False),
        sa.Column("idempotency_key", sa.String(length=80), nullable=False),
        sa.UniqueConstraint("tenant_id", "number"),
        sa.UniqueConstraint("tenant_id", "idempotency_key"),
        sa.CheckConstraint("amount_paise > 0", name="ck_finance_bills_amount"),
        sa.CheckConstraint("due_date >= bill_date", name="ck_finance_bills_dates"),
    )
    op.create_table(
        "finance_bill_payments",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("bill_id", sa.BigInteger(), sa.ForeignKey("finance_bills.id"), nullable=False),
        sa.Column("amount_paise", sa.BigInteger(), nullable=False),
        sa.Column("method", sa.String(length=20), nullable=False),
        sa.Column("reference", sa.String(length=80), nullable=False),
        sa.Column("paid_on", sa.Date(), nullable=False),
        sa.Column("recorded_by_name", sa.String(length=160), nullable=False),
        sa.Column("idempotency_key", sa.String(length=80), nullable=False),
        sa.UniqueConstraint("tenant_id", "idempotency_key"),
        sa.CheckConstraint("amount_paise > 0", name="ck_finance_bill_payments_amount"),
        sa.CheckConstraint(
            "method IN ('UPI', 'Bank transfer', 'Cash', 'Cheque')",
            name="ck_finance_bill_payments_method",
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
