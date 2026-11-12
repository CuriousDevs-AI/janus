"""Moving down a plan: archiving what no longer fits, and refunding the unused days.

A membership can now be `archived`: kept, but closed, like `disabled`, and brought back when the
plan has room again. Archiving a company archives every membership in it, its Owner's included,
so nobody can open it and its records stay as they are. Each invoice keeps the Razorpay payment it
was paid with, so a refund goes back to that payment. A payment keeps the companies its buyer chose
to keep, for a move down settled by Razorpay's webhook. Refunds are the person's own rows.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0078"
down_revision = "0077"


def upgrade() -> None:
    op.drop_constraint("memberships_status_check", "memberships", type_="check")
    op.create_check_constraint(
        "memberships_status_check", "memberships", "status IN ('active', 'disabled', 'archived')"
    )
    op.add_column("account_invoices", sa.Column("payment_id", sa.String(40)))
    op.add_column(
        "account_payments",
        sa.Column("keep", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
    )
    op.create_table(
        "account_refunds",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("invoice", sa.String(20), nullable=False),
        sa.Column("plan", sa.String(20), nullable=False),
        sa.Column("days_unused", sa.Integer(), nullable=False),
        sa.Column("days_total", sa.Integer(), nullable=False),
        sa.Column("amount_paise", sa.BigInteger(), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("razorpay_refund_id", sa.String(40)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint(
            "status IN ('refunded', 'test', 'failed')", name="ck_account_refunds_status"
        ),
        sa.CheckConstraint("amount_paise >= 0", name="ck_account_refunds_amount"),
    )
    op.execute("ALTER TABLE account_refunds ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE account_refunds FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY own_rows ON account_refunds "
        "USING (user_id = app_user()) WITH CHECK (user_id = app_user())"
    )
    op.execute("GRANT SELECT, INSERT, UPDATE ON account_refunds TO janus_app")


def downgrade() -> None:
    op.drop_table("account_refunds")
    op.drop_column("account_payments", "keep")
    op.drop_column("account_invoices", "payment_id")
    op.execute("UPDATE memberships SET status = 'disabled' WHERE status = 'archived'")
    op.drop_constraint("memberships_status_check", "memberships", type_="check")
    op.create_check_constraint(
        "memberships_status_check", "memberships", "status IN ('active', 'disabled')"
    )
