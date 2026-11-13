"""Bank statement lines a company imports, so the Portfolio can show cash in the bank and how
long it lasts. Per company under row-level security; the worker reads them for red alerts.
"""

import sqlalchemy as sa
from alembic import op

revision = "0060"
down_revision = "0059"


def upgrade() -> None:
    op.create_table(
        "finance_bank_lines",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("account", sa.String(80), nullable=False),
        sa.Column("line_date", sa.Date(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(300), nullable=False),
        sa.Column("amount_paise", sa.BigInteger(), nullable=False),
        sa.Column("balance_paise", sa.BigInteger()),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("imported_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("tenant_id", "fingerprint"),
    )
    op.create_index(
        "ix_finance_bank_lines_account", "finance_bank_lines", ["tenant_id", "account", "line_date"]
    )
    op.execute("ALTER TABLE finance_bank_lines ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE finance_bank_lines FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_access ON finance_bank_lines "
        "USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant())"
    )
    op.execute("GRANT SELECT, INSERT, DELETE ON finance_bank_lines TO janus_app")
    op.execute("GRANT SELECT ON finance_bank_lines TO janus_worker")


def downgrade() -> None:
    op.drop_table("finance_bank_lines")
