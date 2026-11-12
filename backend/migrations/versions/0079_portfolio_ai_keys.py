"""AI keys kept by the Portfolio, for the account rather than one company.

An Owner adds a key once, for Janus Intelligence across their companies, and copies it into the
companies that should use it too; the companies it was copied into are kept with it, so a changed
key reaches them and revoking can take it back from them. The person's own rows, under row-level
security on app.user_id; the key is encrypted like a company's.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0079"
down_revision = "0078"


def upgrade() -> None:
    op.create_table(
        "portfolio_ai_keys",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("provider", sa.String(40), nullable=False),
        sa.Column("model", sa.String(200), nullable=False),
        sa.Column("secret_encrypted", sa.Text(), nullable=False),
        sa.Column("key_last_four", sa.String(4), nullable=False),
        sa.Column("copied_to", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("user_id", "provider"),
    )
    op.execute("ALTER TABLE portfolio_ai_keys ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE portfolio_ai_keys FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY own_rows ON portfolio_ai_keys "
        "USING (user_id = app_user()) WITH CHECK (user_id = app_user())"
    )
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON portfolio_ai_keys TO janus_app")


def downgrade() -> None:
    op.drop_table("portfolio_ai_keys")
