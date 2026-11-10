"""Six Portfolio roles, each held company by company so its scope is the companies shared:

Portfolio owner (the Owner), Portfolio administrator (sees everything with money and shares the
Portfolio, without owning the companies), Company administrator (runs one company and sees it on
the Portfolio), Finance manager (money, bills and approvals), Operations manager (stock, projects
and approvals, no money), and Read-only (Group analyst). Group finance stays for people it was
already shared with. `portfolio:share` lets an Owner or Portfolio administrator share it.
"""

import sqlalchemy as sa
from alembic import op

revision = "0062"
down_revision = "0061"

ROLES = {
    "group_admin": [
        "members:manage",
        "portfolio:finance",
        "portfolio:read",
        "portfolio:share",
        "reports:read",
    ],
    "finance_manager": [
        "approvals:manage",
        "billing:manage",
        "portfolio:finance",
        "portfolio:read",
        "reports:read",
    ],
    "operations_manager": [
        "approvals:manage",
        "portfolio:read",
        "projects:manage",
        "reports:read",
        "stock:adjust",
    ],
}


def upgrade() -> None:
    op.execute(
        "UPDATE roles SET permissions = ARRAY(SELECT DISTINCT unnest("
        "permissions || ARRAY['portfolio:share'])) WHERE tenant_id IS NULL AND name = 'owner'"
    )
    for name, permissions in ROLES.items():
        op.execute(
            sa.text(
                "INSERT INTO roles (tenant_id, name, permissions) VALUES (NULL, :name, :permissions)"
            ).bindparams(name=name, permissions=permissions)
        )
    # A company administrator: the admin's permissions and the company on the Portfolio.
    op.execute(
        "INSERT INTO roles (tenant_id, name, permissions) SELECT NULL, 'company_admin', "
        "ARRAY(SELECT DISTINCT unnest(permissions || ARRAY['portfolio:read', 'portfolio:finance'])"
        " ORDER BY 1) FROM roles WHERE tenant_id IS NULL AND name = 'admin'"
    )


def downgrade() -> None:
    op.execute(
        "DELETE FROM roles WHERE tenant_id IS NULL AND name IN "
        "('group_admin', 'company_admin', 'finance_manager', 'operations_manager')"
    )
    op.execute(
        "UPDATE roles SET permissions = array_remove(permissions, 'portfolio:share')"
        " WHERE tenant_id IS NULL AND name = 'owner'"
    )
