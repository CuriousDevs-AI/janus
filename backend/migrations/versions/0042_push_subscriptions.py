"""Web Push: the browsers that asked for notifications, per person and company."""

import sqlalchemy as sa
from alembic import op

revision = "0042"
down_revision = "0041"


def upgrade() -> None:
    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("endpoint", sa.Text(), nullable=False, unique=True),
        sa.Column("p256dh", sa.String(200), nullable=False),
        sa.Column("auth", sa.String(100), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_push_subscriptions_tenant_id", "push_subscriptions", ["tenant_id"])
    op.create_index("ix_push_subscriptions_user_id", "push_subscriptions", ["user_id"])
    op.execute("ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE push_subscriptions FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_access ON push_subscriptions USING (tenant_id = app_tenant()) "
        "WITH CHECK (tenant_id = app_tenant())"
    )


def downgrade() -> None:
    op.drop_table("push_subscriptions")
