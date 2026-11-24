"""Set leads that have a deal to stage='converted', separating lead and deal pipelines.

Revision ID: 0106
Revises: 0105
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0106"
down_revision: str | None = "0105"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "UPDATE leads SET stage = 'converted'"
        " WHERE id IN (SELECT lead_id FROM deals)"
        " AND stage NOT IN ('converted', 'lost')"
    )


def downgrade() -> None:
    pass
