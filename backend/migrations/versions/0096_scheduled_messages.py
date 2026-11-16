"""Scheduled messages for send-later.

Revision ID: 0096
Revises: 0095
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0096"
down_revision: str | None = "0095"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "team_scheduled_messages",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column(
            "tenant_id",
            sa.BigInteger,
            sa.ForeignKey("tenants.id"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "space_id",
            sa.BigInteger,
            sa.ForeignKey("team_spaces.id"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "author_id",
            sa.BigInteger,
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column(
            "send_at",
            sa.DateTime(timezone=True),
            nullable=False,
            index=True,
        ),
        sa.Column("sent", sa.Boolean, server_default="false", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "char_length(body) BETWEEN 1 AND 4000", name="ck_scheduled_body"
        ),
    )


def downgrade() -> None:
    op.drop_table("team_scheduled_messages")
