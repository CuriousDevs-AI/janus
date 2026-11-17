"""Custom pipeline stages: allow any lowercase slug as a deal stage.

Revision ID: 0103
Revises: 0102
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0103"
down_revision: str | None = "0102"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("deal_stage", "deals", type_="check")
    op.create_check_constraint(
        "deal_stage",
        "deals",
        "stage ~ '^[a-z][a-z0-9_-]{0,39}$'",
    )


def downgrade() -> None:
    op.drop_constraint("deal_stage", "deals", type_="check")
    op.create_check_constraint(
        "deal_stage",
        "deals",
        "stage IN ('new', 'qualified', 'demo', 'proposal', "
        "'negotiation', 'approval', 'won', 'lost')",
    )
