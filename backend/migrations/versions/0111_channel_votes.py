"""Store user votes and feature requests for upcoming lead-source channels.

Revision ID: 0111
Revises: 0110
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0111"
down_revision: str | None = "0110"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "channel_votes",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("user_id", sa.BigInteger, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("channel", sa.String(120), nullable=False),
        sa.Column("notify", sa.Boolean, server_default="false", nullable=False),
        sa.Column("requested", sa.Boolean, server_default="false", nullable=False),
        sa.Column("request_message", sa.String(1000), server_default="", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("tenant_id", "user_id", "channel", name="uq_channel_votes_tenant_user_channel"),
    )
    op.execute("GRANT SELECT, INSERT, UPDATE ON channel_votes TO janus_app")
    op.execute("GRANT USAGE ON SEQUENCE channel_votes_id_seq TO janus_app")


def downgrade() -> None:
    op.execute("REVOKE ALL ON channel_votes FROM janus_app")
    op.execute("REVOKE USAGE ON SEQUENCE channel_votes_id_seq FROM janus_app")
    op.drop_table("channel_votes")
