"""Portfolio logos: server-side company logo storage.

Revision ID: 0104
Revises: 0103
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0104"
down_revision: str | None = "0103"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "portfolio_logos",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column(
            "tenant_id",
            sa.BigInteger,
            sa.ForeignKey("tenants.id"),
            nullable=False,
            unique=True,
        ),
        sa.Column("content_type", sa.String(40), nullable=False),
        sa.Column("data", sa.LargeBinary, nullable=False),
        sa.Column(
            "uploaded_by", sa.BigInteger, sa.ForeignKey("users.id"), nullable=False
        ),
        sa.Column(
            "uploaded_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.execute(
        "ALTER TABLE portfolio_logos ENABLE ROW LEVEL SECURITY"
    )


def downgrade() -> None:
    op.drop_table("portfolio_logos")
