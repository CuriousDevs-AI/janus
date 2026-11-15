"""The worker reads customer history and customer-name merges for the owner's figures.

The weekly email and red alerts are built by the worker from the same company summary the
Portfolio shows, which now counts customers: churn, repeat buyers and the largest customer's share.
Those come from invoices, which the worker already reads, and from customer-wise months imported
from Tally or Zoho Books and the names an owner merged, which it could not. Row-level security
still limits it to the company it is working for.
"""

from alembic import op

revision = "0088"
down_revision = "0087"

TABLES = ("finance_history_customers", "portfolio_customer_merges")


def upgrade() -> None:
    for table in TABLES:
        op.execute(f"GRANT SELECT ON {table} TO janus_worker")


def downgrade() -> None:
    for table in TABLES:
        op.execute(f"REVOKE SELECT ON {table} FROM janus_worker")
