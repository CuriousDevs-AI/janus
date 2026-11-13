"""The GST inside a supplier bill.

A bill's amount stays what the supplier asked for, GST included. The GST part is recorded beside
it so that costs can be compared with sales, which are counted before GST. Bills recorded before
this keep 0, meaning the GST in them is not known.
"""

import sqlalchemy as sa
from alembic import op

revision = "0054"
down_revision = "0053"


def upgrade() -> None:
    op.add_column(
        "finance_bills",
        sa.Column("gst_paise", sa.BigInteger(), nullable=False, server_default="0"),
    )
    op.create_check_constraint(
        "ck_finance_bills_gst", "finance_bills", "gst_paise >= 0 AND gst_paise < amount_paise"
    )


def downgrade() -> None:
    op.drop_constraint("ck_finance_bills_gst", "finance_bills", type_="check")
    op.drop_column("finance_bills", "gst_paise")
