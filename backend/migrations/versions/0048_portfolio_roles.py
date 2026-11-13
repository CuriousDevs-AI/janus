"""Portfolio access: who may see the Portfolio across a group's companies.

The Owner sees it, with money. Two new system roles let an Owner share it without handing over
the company: Group finance (the Portfolio with money, and reports) and Group analyst (the
Portfolio without money, and reports). A person holds the role in each company the Owner shares.
"""

import sqlalchemy as sa
from alembic import op

revision = "0048"
down_revision = "0047"

PORTFOLIO = ["portfolio:read", "portfolio:finance"]
ROLES = {
    "group_finance": ["portfolio:read", "portfolio:finance", "reports:read"],
    "group_analyst": ["portfolio:read", "reports:read"],
}


def upgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE roles SET permissions = ARRAY(SELECT DISTINCT unnest("
            "permissions || CAST(:new AS text[]))) WHERE tenant_id IS NULL AND name = 'owner'"
        ).bindparams(new=PORTFOLIO)
    )
    for name, permissions in ROLES.items():
        op.execute(
            sa.text(
                "INSERT INTO roles (tenant_id, name, permissions)"
                " VALUES (NULL, :name, :permissions)"
            ).bindparams(name=name, permissions=permissions)
        )


def downgrade() -> None:
    op.execute(
        sa.text(
            "DELETE FROM roles WHERE tenant_id IS NULL"
            " AND name IN ('group_finance', 'group_analyst')"
        )
    )
    op.execute(
        sa.text(
            "UPDATE roles SET permissions = ARRAY(SELECT unnest(permissions) "
            "EXCEPT SELECT unnest(CAST(:old AS text[]))) WHERE tenant_id IS NULL"
        ).bindparams(old=PORTFOLIO)
    )
