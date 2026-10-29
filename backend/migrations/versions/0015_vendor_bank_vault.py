"""vendor bank accounts, stored encrypted, with a request and a separate approval"""

import sqlalchemy as sa
from alembic import op

revision = "0015"
down_revision = "0014"


def upgrade() -> None:
    op.create_table(
        "vendor_bank_accounts",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("vendor_id", sa.String(length=80), nullable=False),
        sa.Column("vendor_name", sa.String(length=160), nullable=False),
        sa.Column("holder", sa.String(length=160), nullable=False),
        sa.Column("account_last4", sa.String(length=4), nullable=False),
        sa.Column("account_ciphertext", sa.Text(), nullable=False),
        sa.Column("ifsc", sa.String(length=11), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("requested_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("approved_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_vendor_bank_accounts_tenant_id", "vendor_bank_accounts", ["tenant_id"])
    op.execute("ALTER TABLE vendor_bank_accounts ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE vendor_bank_accounts FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_access ON vendor_bank_accounts USING (tenant_id = app_tenant()) "
        "WITH CHECK (tenant_id = app_tenant())"
    )


def downgrade() -> None:
    op.drop_table("vendor_bank_accounts")
