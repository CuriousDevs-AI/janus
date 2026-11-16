"""Add description column to support_tickets

Tickets created from the UI capture a free-text description of the issue.  Without this column,
the description typed at creation is lost on reload.
"""

import sqlalchemy as sa
from alembic import op

revision = "0089"
down_revision = "0088"


def upgrade() -> None:
    op.add_column("support_tickets", sa.Column("description", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("support_tickets", "description")
