"""Workspace access on top of a member's role: a Finance agent's billing:manage, an IT engineer's
settings:manage. Kept on the membership; only permissions the application lists as grantable count.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY

revision = "0067"
down_revision = "0066"


def upgrade() -> None:
    op.add_column(
        "memberships",
        sa.Column("extra_permissions", ARRAY(sa.String()), nullable=False, server_default="{}"),
    )


def downgrade() -> None:
    op.drop_column("memberships", "extra_permissions")
