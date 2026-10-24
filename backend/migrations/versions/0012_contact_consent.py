"""persist contact communication consent and suppression state"""

import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"


def upgrade() -> None:
    op.add_column(
        "contacts",
        sa.Column("whatsapp_opt_in", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.add_column(
        "contacts",
        sa.Column("do_not_contact", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.add_column("contacts", sa.Column("consent_source", sa.String(length=80), nullable=True))
    op.add_column(
        "contacts",
        sa.Column("consent_updated_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("contacts", "consent_updated_at")
    op.drop_column("contacts", "consent_source")
    op.drop_column("contacts", "do_not_contact")
    op.drop_column("contacts", "whatsapp_opt_in")
