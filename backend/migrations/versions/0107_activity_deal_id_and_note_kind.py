"""Add deal_id column to crm_activities and allow 'note' kind.

Revision ID: 0107
Revises: 0106
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0107"
down_revision: str | None = "0106"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("crm_activities", sa.Column("deal_id", sa.BigInteger(), nullable=True))
    op.create_index("ix_crm_activities_tenant_deal", "crm_activities", ["tenant_id", "deal_id"])

    op.drop_constraint("ck_crm_activities_kind", "crm_activities", type_="check")
    op.create_check_constraint(
        "ck_crm_activities_kind",
        "crm_activities",
        "kind IN ('call', 'meeting', 'email', 'task', 'note')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_crm_activities_kind", "crm_activities", type_="check")
    op.create_check_constraint(
        "ck_crm_activities_kind",
        "crm_activities",
        "kind IN ('call', 'meeting', 'email', 'task')",
    )
    op.drop_index("ix_crm_activities_tenant_deal", "crm_activities")
    op.drop_column("crm_activities", "deal_id")
