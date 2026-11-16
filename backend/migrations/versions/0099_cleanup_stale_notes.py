"""Clean up stale __notes__ space from earlier code.

Revision ID: 0099
Revises: 0098
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0099"
down_revision: str | None = "0098"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "DELETE FROM team_space_members WHERE space_id IN "
        "(SELECT id FROM team_spaces WHERE name LIKE '__notes%')"
    )
    op.execute("DELETE FROM team_spaces WHERE name LIKE '__notes%'")


def downgrade() -> None:
    pass
