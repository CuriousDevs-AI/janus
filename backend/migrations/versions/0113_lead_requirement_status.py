"""Add requirement_status to leads.

Revision ID: 0113
Revises: 0112
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0113"
down_revision: str | None = "0112"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "leads",
        sa.Column(
            "requirement_status",
            sa.String(20),
            server_default="received",
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("leads", "requirement_status")
