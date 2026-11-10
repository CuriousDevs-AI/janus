"""Opening balances: what customers owed, and what was owed to suppliers, when a company moved to
Janus. They are invoices and bills marked as opening: owed, aged and paid like any other, but not
sales or costs, and numbered in their own series (OB-, OBB-) so the invoice series stays
continuous.
"""

import sqlalchemy as sa
from alembic import op

revision = "0066"
down_revision = "0065"


def upgrade() -> None:
    for table in ("finance_invoices", "finance_bills"):
        op.add_column(
            table, sa.Column("opening", sa.Boolean(), nullable=False, server_default=sa.false())
        )


def downgrade() -> None:
    for table in ("finance_invoices", "finance_bills"):
        op.drop_column(table, "opening")
