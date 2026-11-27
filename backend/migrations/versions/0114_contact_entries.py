"""Add contact_entries table for feedback and issues.

Revision ID: 0114
Revises: 0113
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0114"
down_revision: str | None = "0113"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "contact_entries",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, nullable=False, index=True),
        sa.Column("contact_id", sa.BigInteger, nullable=False),
        sa.Column("entry_type", sa.String(20), nullable=False),
        sa.Column("subject", sa.String(300), nullable=False, server_default=""),
        sa.Column("body", sa.Text, nullable=False, server_default=""),
        sa.Column("status", sa.String(20), nullable=False, server_default="received"),
        sa.Column("priority", sa.String(20), nullable=False, server_default="normal"),
        sa.Column("assigned_to", sa.String(160), nullable=True),
        sa.Column("created_by", sa.String(160), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_contact_entries_contact",
        "contact_entries",
        ["tenant_id", "contact_id"],
    )


def downgrade() -> None:
    op.drop_table("contact_entries")
