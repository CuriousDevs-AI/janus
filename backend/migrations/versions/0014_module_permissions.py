"""module permissions for stock and projects, granted to the roles the screens use"""

import sqlalchemy as sa
from alembic import op

revision = "0014"
down_revision = "0013"

NEW_PERMISSIONS = ["stock:adjust", "projects:manage"]

ADD_TO_ROLES = (
    "UPDATE roles SET permissions = ARRAY(SELECT DISTINCT unnest("
    "permissions || CAST(:new AS text[]))) "
    "WHERE tenant_id IS NULL AND name IN ({names})"
)
REMOVE_FROM_ROLES = (
    "UPDATE roles SET permissions = ARRAY(SELECT unnest(permissions) "
    "EXCEPT SELECT unnest(CAST(:old AS text[]))) "
    "WHERE tenant_id IS NULL"
)


def upgrade() -> None:
    # Owners and admins hold every permission but billing. Managers run stock and projects.
    for names in ("'owner', 'admin'", "'manager'"):
        op.execute(
            sa.text(ADD_TO_ROLES.format(names=names)).bindparams(new=NEW_PERMISSIONS)
        )


def downgrade() -> None:
    op.execute(sa.text(REMOVE_FROM_ROLES).bindparams(old=NEW_PERMISSIONS))
