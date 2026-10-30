"""HR permissions. Owners and admins run HR, managers see and approve for their team.

Every member's own HR (hr:self) comes with the membership in code, not from a role.
"""

import sqlalchemy as sa
from alembic import op

revision = "0040"
down_revision = "0039"

HR_ALL = ["hr:self", "hr:read", "hr:team", "hr:approve", "hr:manage"]
HR_MANAGER = ["hr:team", "hr:approve"]

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
    op.execute(sa.text(ADD_TO_ROLES.format(names="'owner', 'admin'")).bindparams(new=HR_ALL))
    op.execute(sa.text(ADD_TO_ROLES.format(names="'manager'")).bindparams(new=HR_MANAGER))


def downgrade() -> None:
    op.execute(sa.text(REMOVE_FROM_ROLES).bindparams(old=HR_ALL))
