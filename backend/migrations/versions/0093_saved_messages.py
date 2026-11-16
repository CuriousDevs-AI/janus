"""Saved messages and message-seen tracking.

Revision ID: 0093
Revises: 0092
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0093"
down_revision: str | None = "0092"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "team_saved_messages",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("user_id", sa.BigInteger, sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column(
            "message_id",
            sa.BigInteger,
            sa.ForeignKey("team_messages.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("saved_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "message_id", name="uq_team_saved_messages"),
    )


    op.create_table(
        "team_message_seen",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column(
            "message_id",
            sa.BigInteger,
            sa.ForeignKey("team_messages.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("user_id", sa.BigInteger, sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("seen_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("message_id", "user_id", name="uq_team_message_seen"),
    )


def downgrade() -> None:
    op.drop_table("team_message_seen")
    op.drop_table("team_saved_messages")
