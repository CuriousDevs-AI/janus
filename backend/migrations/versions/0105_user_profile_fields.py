"""Add bio, title and status_text to users for server-side profile storage.

Revision ID: 0105
Revises: 0104
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0105"
down_revision: str | None = "0104"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("bio", sa.String(500), nullable=True))
    op.add_column("users", sa.Column("title", sa.String(120), nullable=True))
    op.add_column("users", sa.Column("status_text", sa.String(200), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "status_text")
    op.drop_column("users", "title")
    op.drop_column("users", "bio")
