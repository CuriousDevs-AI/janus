"""Keep who an invoice was billed to, and Janus's own details, as they were the day it was issued.

A tax invoice is a record of the day it was made: changing the account's billing details later, or
Janus's own, must not rewrite invoices already issued. Invoices made before this keep both empty and
show the details as they are now, since what they were then was never kept.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0081"
down_revision = "0080"


def upgrade() -> None:
    op.add_column("account_invoices", sa.Column("bill_to", JSONB()))
    op.add_column("account_invoices", sa.Column("seller", JSONB()))


def downgrade() -> None:
    op.drop_column("account_invoices", "seller")
    op.drop_column("account_invoices", "bill_to")
