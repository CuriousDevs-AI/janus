"""budget allocations: approved fund requests add to a line's allocation, recorded as movements"""

import sqlalchemy as sa
from alembic import op

revision = "0021"
down_revision = "0020"


def upgrade() -> None:
    op.add_column(
        "finance_budget_movements",
        sa.Column("kind", sa.String(length=12), nullable=False, server_default="draw"),
    )
    op.execute("UPDATE finance_budget_movements SET kind = 'release' WHERE amount_paise < 0")
    op.create_check_constraint(
        "ck_movements_kind",
        "finance_budget_movements",
        "kind IN ('draw', 'release', 'allocation')",
    )
    op.create_check_constraint(
        "ck_movements_sign",
        "finance_budget_movements",
        "(kind = 'release' AND amount_paise < 0)"
        " OR (kind IN ('draw', 'allocation') AND amount_paise > 0)",
    )


def downgrade() -> None:
    op.drop_constraint("ck_movements_sign", "finance_budget_movements", type_="check")
    op.drop_constraint("ck_movements_kind", "finance_budget_movements", type_="check")
    op.drop_column("finance_budget_movements", "kind")
