"""User presence, custom status, and DND.

Revision ID: 0095
Revises: 0094
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0095"
down_revision: str | None = "0094"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "team_presence",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("user_id", sa.BigInteger, sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("status", sa.String(10), server_default="offline", nullable=False),
        sa.Column("status_text", sa.String(100), server_default="", nullable=False),
        sa.Column("status_emoji", sa.String(16), server_default="", nullable=False),
        sa.Column("dnd", sa.Boolean, server_default="false", nullable=False),
        sa.Column("last_active", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("tenant_id", "user_id", name="uq_team_presence"),
    )


def downgrade() -> None:
    op.drop_table("team_presence")
