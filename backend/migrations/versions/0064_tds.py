"""TDS: what a company deducts from supplier bills and salaries, and what it deposits.

A bill keeps the TDS deducted from it and its section; what is owed to the supplier is the bill
less that TDS. A salary posting keeps the TDS deducted from the month's salaries. A filing marked
done may keep the amount paid with it, so a TDS payment's challan can be set against what was
deducted.
"""

import sqlalchemy as sa
from alembic import op

revision = "0064"
down_revision = "0063"


def upgrade() -> None:
    op.add_column(
        "finance_bills", sa.Column("tds_paise", sa.BigInteger(), nullable=False, server_default="0")
    )
    op.add_column("finance_bills", sa.Column("tds_section", sa.String(10)))
    op.create_check_constraint(
        "ck_finance_bills_tds", "finance_bills", "tds_paise >= 0 AND tds_paise < amount_paise"
    )
    op.add_column(
        "finance_payroll_postings",
        sa.Column("tds_paise", sa.BigInteger(), nullable=False, server_default="0"),
    )
    op.create_check_constraint(
        "ck_payroll_tds", "finance_payroll_postings", "tds_paise >= 0 AND tds_paise < amount_paise"
    )
    op.add_column("compliance_filings", sa.Column("amount_paise", sa.BigInteger()))
    op.create_check_constraint(
        "ck_filings_amount", "compliance_filings", "amount_paise IS NULL OR amount_paise >= 0"
    )


def downgrade() -> None:
    op.drop_constraint("ck_filings_amount", "compliance_filings")
    op.drop_column("compliance_filings", "amount_paise")
    op.drop_constraint("ck_payroll_tds", "finance_payroll_postings")
    op.drop_column("finance_payroll_postings", "tds_paise")
    op.drop_constraint("ck_finance_bills_tds", "finance_bills")
    op.drop_column("finance_bills", "tds_section")
    op.drop_column("finance_bills", "tds_paise")
