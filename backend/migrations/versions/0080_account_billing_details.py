"""Who a Janus invoice is billed to: the Owner's legal name, GSTIN and state, asked once.

A GST tax invoice names the buyer's legal name and GSTIN and the place of supply, so the buyer's CA
can claim the input credit. The place of supply is the buyer's state: the GSTIN's first two digits,
or the state chosen when there is no GSTIN. The rows are the person's own.
"""

import sqlalchemy as sa
from alembic import op

revision = "0080"
down_revision = "0079"


def upgrade() -> None:
    op.create_table(
        "account_billing_details",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("legal_name", sa.String(160), nullable=False),
        sa.Column("gstin", sa.String(15)),
        sa.Column("state_code", sa.String(2), nullable=False),
        sa.Column("address", sa.String(400)),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("user_id", name="uq_account_billing_details_user"),
        sa.CheckConstraint(
            "gstin IS NULL OR substr(gstin, 1, 2) = state_code",
            name="ck_account_billing_details_state",
        ),
    )
    op.execute("ALTER TABLE account_billing_details ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE account_billing_details FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY own_rows ON account_billing_details "
        "USING (user_id = app_user()) WITH CHECK (user_id = app_user())"
    )
    op.execute("GRANT SELECT, INSERT, UPDATE ON account_billing_details TO janus_app")


def downgrade() -> None:
    op.drop_table("account_billing_details")
