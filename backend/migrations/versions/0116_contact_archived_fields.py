"""Add archived_at and archived_by to contacts.

Revision ID: 0116
Revises: 0115
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0116"
down_revision: str | None = "0115"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("contacts", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("contacts", sa.Column("archived_by", sa.BigInteger, sa.ForeignKey("users.id"), nullable=True))


def downgrade() -> None:
    op.drop_column("contacts", "archived_by")
    op.drop_column("contacts", "archived_at")
