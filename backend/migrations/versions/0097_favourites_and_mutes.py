"""Favourites and mutes for team chat spaces.

Revision ID: 0097
Revises: 0096
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0097"
down_revision: str | None = "0096"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "team_space_favourites",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column(
            "tenant_id",
            sa.BigInteger,
            sa.ForeignKey("tenants.id"),
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
            "space_id",
            sa.BigInteger,
            sa.ForeignKey("team_spaces.id"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("user_id", "space_id", name="uq_team_space_favourites"),
    )
    op.create_table(
        "team_space_mutes",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column(
            "tenant_id",
            sa.BigInteger,
            sa.ForeignKey("tenants.id"),
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
            "space_id",
            sa.BigInteger,
            sa.ForeignKey("team_spaces.id"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("user_id", "space_id", name="uq_team_space_mutes"),
    )


def downgrade() -> None:
    op.drop_table("team_space_mutes")
    op.drop_table("team_space_favourites")
