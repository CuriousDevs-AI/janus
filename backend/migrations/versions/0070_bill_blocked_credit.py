"""Supplier bills whose GST cannot be taken as input credit (Section 17(5) of the CGST Act: food,
motor vehicles, personal use and the like), so GST to pay does not count it.
"""

import sqlalchemy as sa
from alembic import op

revision = "0070"
down_revision = "0069"


def upgrade() -> None:
    op.add_column(
        "finance_bills",
        sa.Column("itc_blocked", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("finance_bills", "itc_blocked")
