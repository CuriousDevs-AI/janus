"""Invoices, invoice lines, payments and credit notes on the server, in paise"""

import sqlalchemy as sa
from alembic import op

revision = "0024"
down_revision = "0023"

TENANT_TABLES = [
    "finance_invoices",
    "finance_invoice_lines",
    "finance_payments",
    "finance_credit_notes",
]


def _tenant_policy(table: str) -> None:
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY tenant_access ON {table} USING (tenant_id = app_tenant()) "
        "WITH CHECK (tenant_id = app_tenant())"
    )


def upgrade() -> None:
    op.create_table(
        "finance_invoices",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("number", sa.String(length=20), nullable=False),
        sa.Column("customer", sa.String(length=160), nullable=False),
        sa.Column("customer_company", sa.String(length=160), nullable=False),
        sa.Column("deal_ref", sa.String(length=80), nullable=True),
        sa.Column("invoice_date", sa.Date(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("same_state", sa.Boolean(), nullable=False),
        sa.Column("taxable_paise", sa.BigInteger(), nullable=False),
        sa.Column("cgst_paise", sa.BigInteger(), nullable=False),
        sa.Column("sgst_paise", sa.BigInteger(), nullable=False),
        sa.Column("igst_paise", sa.BigInteger(), nullable=False),
        sa.Column("total_paise", sa.BigInteger(), nullable=False),
        sa.Column("created_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_by_name", sa.String(length=160), nullable=False),
        sa.Column("idempotency_key", sa.String(length=80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "number"),
        sa.UniqueConstraint("tenant_id", "idempotency_key"),
        sa.CheckConstraint("taxable_paise >= 0 AND total_paise >= 0", name="ck_invoices_amounts"),
    )
    op.create_table(
        "finance_invoice_lines",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column(
            "invoice_id", sa.BigInteger(), sa.ForeignKey("finance_invoices.id"), nullable=False
        ),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("item", sa.String(length=200), nullable=False),
        sa.Column("hsn", sa.String(length=8), nullable=False),
        sa.Column("qty", sa.Numeric(12, 3), nullable=False),
        sa.Column("rate_paise", sa.BigInteger(), nullable=False),
        sa.Column("gst_rate", sa.Integer(), nullable=False),
        sa.UniqueConstraint("invoice_id", "position"),
        sa.CheckConstraint("qty > 0 AND rate_paise > 0", name="ck_invoice_lines_amounts"),
        sa.CheckConstraint("gst_rate >= 0 AND gst_rate <= 28", name="ck_invoice_lines_gst"),
    )
    op.create_table(
        "finance_payments",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column(
            "invoice_id", sa.BigInteger(), sa.ForeignKey("finance_invoices.id"), nullable=False
        ),
        sa.Column("amount_paise", sa.BigInteger(), nullable=False),
        sa.Column("method", sa.String(length=20), nullable=False),
        sa.Column("reference", sa.String(length=80), nullable=False),
        sa.Column("paid_on", sa.Date(), nullable=False),
        sa.Column("recorded_by_name", sa.String(length=160), nullable=False),
        sa.Column("idempotency_key", sa.String(length=80), nullable=False),
        sa.UniqueConstraint("tenant_id", "idempotency_key"),
        sa.CheckConstraint("amount_paise > 0", name="ck_payments_amount"),
        sa.CheckConstraint(
            "method IN ('UPI', 'Bank transfer', 'Cash', 'Cheque')", name="ck_payments_method"
        ),
    )
    op.create_table(
        "finance_credit_notes",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column(
            "invoice_id", sa.BigInteger(), sa.ForeignKey("finance_invoices.id"), nullable=False
        ),
        sa.Column("number", sa.String(length=20), nullable=False),
        sa.Column("kind", sa.String(length=12), nullable=False),
        sa.Column("amount_paise", sa.BigInteger(), nullable=False),
        sa.Column("reason", sa.String(length=300), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("noted_on", sa.Date(), nullable=False),
        sa.Column("ticket_ref", sa.String(length=64), nullable=True),
        sa.Column("created_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_by_name", sa.String(length=160), nullable=False),
        sa.Column("approved_by_name", sa.String(length=160), nullable=True),
        sa.Column("rejected_by_name", sa.String(length=160), nullable=True),
        sa.Column("rejected_reason", sa.String(length=300), nullable=True),
        sa.Column("idempotency_key", sa.String(length=80), nullable=False),
        sa.UniqueConstraint("tenant_id", "number"),
        sa.UniqueConstraint("tenant_id", "idempotency_key"),
        sa.CheckConstraint("amount_paise > 0", name="ck_credit_notes_amount"),
        sa.CheckConstraint("kind IN ('credit', 'write-off')", name="ck_credit_notes_kind"),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected')", name="ck_credit_notes_status"
        ),
    )
    for table in TENANT_TABLES:
        _tenant_policy(table)


def downgrade() -> None:
    for table in reversed(TENANT_TABLES):
        op.drop_table(table)
