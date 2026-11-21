"""Message seen tracking for team chat.

Revision ID: 0098
Revises: 0097
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0098"
down_revision: str | None = "0097"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 0093 already creates this table; a database built from scratch has it by now, so this only
    # adds it where 0093 ran before the table was part of it.
    if sa.inspect(op.get_bind()).has_table("team_message_seen"):
        return
    op.create_table(
        "team_message_seen",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column(
            "tenant_id",
            sa.BigInteger,
            sa.ForeignKey("tenants.id"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "message_id",
            sa.BigInteger,
            sa.ForeignKey("team_messages.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "user_id",
            sa.BigInteger,
            sa.ForeignKey("users.id"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "seen_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("message_id", "user_id", name="uq_team_message_seen"),
    )


def downgrade() -> None:
    # 0093's downgrade drops the table.
    pass
