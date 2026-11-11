"""The account's plan and invoices. A plan belongs to a person's login and covers every company they
own, so both tables are keyed by user and kept under row-level security on app.user_id, like the
weekly Portfolio email setting.
"""

import sqlalchemy as sa
from alembic import op

revision = "0076"
down_revision = "0075"

PLANS = "'free', 'startup', 'growth', 'enterprise'"


def upgrade() -> None:
    op.create_table(
        "account_plans",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("plan", sa.String(20), nullable=False),
        sa.Column("started_on", sa.Date(), nullable=False),
        sa.Column("renews_on", sa.Date()),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("user_id"),
        sa.CheckConstraint(f"plan IN ({PLANS})", name="ck_account_plans_plan"),
    )
    op.create_table(
        "account_invoices",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("number", sa.String(20), nullable=False),
        sa.Column("plan", sa.String(20), nullable=False),
        sa.Column("issued_on", sa.Date(), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("amount_paise", sa.BigInteger(), nullable=False),
        sa.Column("gst_paise", sa.BigInteger(), nullable=False),
        sa.Column("total_paise", sa.BigInteger(), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("paid_on", sa.Date()),
        sa.Column("sample", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("user_id", "number"),
        sa.UniqueConstraint("user_id", "period_start"),
        sa.CheckConstraint("status IN ('paid', 'due')", name="ck_account_invoices_status"),
        sa.CheckConstraint(
            "amount_paise >= 0 AND gst_paise >= 0 AND total_paise = amount_paise + gst_paise",
            name="ck_account_invoices_amounts",
        ),
    )
    for table in ("account_plans", "account_invoices"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY own_rows ON {table} "
            "USING (user_id = app_user()) WITH CHECK (user_id = app_user())"
        )
        # Granted here rather than left to default privileges, which not every database has.
        op.execute(f"GRANT SELECT, INSERT, UPDATE ON {table} TO janus_app")


def downgrade() -> None:
    op.drop_table("account_invoices")
    op.drop_table("account_plans")
