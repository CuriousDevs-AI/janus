"""Add billing fields to contacts: payment_terms, credit_limit, gstin, place_of_supply.

Revision ID: 0115
Revises: 0114
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0115"
down_revision: str | None = "0114"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("contacts", sa.Column("payment_terms", sa.String(30), nullable=True))
    op.add_column("contacts", sa.Column("credit_limit", sa.BigInteger, nullable=True))
    op.add_column("contacts", sa.Column("gstin", sa.String(15), nullable=True))
    op.add_column("contacts", sa.Column("place_of_supply", sa.String(60), nullable=True))


def downgrade() -> None:
    op.drop_column("contacts", "place_of_supply")
    op.drop_column("contacts", "gstin")
    op.drop_column("contacts", "credit_limit")
    op.drop_column("contacts", "payment_terms")
