"""Admins read the company's figures: Janus Intelligence, the department AI chats and the Portfolio.

An admin already sees every invoice, bill and salary in the workspaces, yet Janus told them their
role did not include the company's figures. They now read this company's figures, money included,
like a company administrator. Sharing a company with other people stays the Owner's.
"""

from alembic import op

revision = "0083"
down_revision = "0082"


def upgrade() -> None:
    op.execute(
        "UPDATE roles SET permissions = ARRAY(SELECT DISTINCT unnest("
        "permissions || ARRAY['portfolio:read', 'portfolio:finance']) ORDER BY 1)"
        " WHERE tenant_id IS NULL AND name = 'admin'"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE roles SET permissions = array_remove(array_remove(permissions,"
        " 'portfolio:read'), 'portfolio:finance') WHERE tenant_id IS NULL AND name = 'admin'"
    )
