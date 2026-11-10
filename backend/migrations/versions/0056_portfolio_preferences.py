"""Each person's Portfolio settings on the server: notifications read, Work inbox items snoozed,
and the thresholds at which a company turns red for them. Row-level security on app.user_id. The
worker reads them for the weekly email, which uses the same thresholds as the page.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0056"
down_revision = "0055"


def upgrade() -> None:
    op.create_table(
        "portfolio_preferences",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("read", JSONB(), nullable=False, server_default="[]"),
        sa.Column("snoozed", JSONB(), nullable=False, server_default="{}"),
        sa.Column("thresholds", JSONB(), nullable=False, server_default="{}"),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("user_id"),
    )
    op.execute("ALTER TABLE portfolio_preferences ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE portfolio_preferences FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY own_preferences ON portfolio_preferences "
        "USING (user_id = app_user()) WITH CHECK (user_id = app_user())"
    )
    op.execute("GRANT SELECT, INSERT, UPDATE ON portfolio_preferences TO janus_app")
    op.execute("GRANT SELECT ON portfolio_preferences TO janus_worker")


def downgrade() -> None:
    op.drop_table("portfolio_preferences")
