"""A username for each login, chosen at signup.

Optional, so people who joined before, or join from an invitation, keep working without one.
Stored in lower case, 3 to 30 letters, digits, dots or underscores, and unique across Janus, so it
can stand in for the email when signing in.
"""

import sqlalchemy as sa
from alembic import op

revision = "0051"
down_revision = "0050"


def upgrade() -> None:
    op.add_column("users", sa.Column("username", sa.String(30), nullable=True))
    op.create_check_constraint("ck_users_username", "users", "username ~ '^[a-z0-9._]{3,30}$'")
    op.create_index("uq_users_username", "users", ["username"], unique=True)


def downgrade() -> None:
    op.drop_index("uq_users_username", table_name="users")
    op.drop_constraint("ck_users_username", "users", type_="check")
    op.drop_column("users", "username")
