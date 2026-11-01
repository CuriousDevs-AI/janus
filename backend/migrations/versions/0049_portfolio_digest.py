"""Weekly Portfolio digest: an email to each person who sees a Portfolio, if they keep it on.

Each person's setting is theirs alone (row-level security on app.user_id). The worker claims one
due digest at a time through a function that returns only the recipient's name and email, then
reads each company under that company's context, so it gets read access to the few more tables
the Portfolio summary needs and nothing else.
"""

import sqlalchemy as sa
from alembic import op

revision = "0049"
down_revision = "0048"

READ = (
    "tenants",
    "deals",
    "finance_invoices",
    "finance_payments",
    "finance_credit_notes",
    "finance_bills",
    "finance_bill_payments",
)


def upgrade() -> None:
    op.create_table(
        "portfolio_digests",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("next_due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_sent_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index(
        "ix_portfolio_digests_due",
        "portfolio_digests",
        ["next_due_at"],
        postgresql_where=sa.text("enabled"),
    )
    op.execute("ALTER TABLE portfolio_digests ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE portfolio_digests FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY own_digest ON portfolio_digests "
        "USING (user_id = app_user()) WITH CHECK (user_id = app_user())"
    )
    # Granted here rather than left to default privileges, which not every database has.
    op.execute("GRANT SELECT, INSERT, UPDATE ON portfolio_digests TO janus_app")
    op.execute("GRANT SELECT, UPDATE ON portfolio_digests TO janus_worker")
    op.execute(f"GRANT SELECT ON {', '.join(READ)} TO janus_worker")
    op.execute("""CREATE FUNCTION public.claim_portfolio_digest()
      RETURNS TABLE(user_id bigint, email text, name text)
      LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
      SELECT d.user_id, u.email::text, u.name::text FROM public.portfolio_digests d
      JOIN public.users u ON u.id = d.user_id AND u.deleted_at IS NULL
      WHERE d.enabled AND d.next_due_at <= now()
      ORDER BY d.next_due_at LIMIT 1 FOR UPDATE OF d SKIP LOCKED
    $$""")
    op.execute("REVOKE ALL ON FUNCTION public.claim_portfolio_digest() FROM PUBLIC")
    op.execute("GRANT EXECUTE ON FUNCTION public.claim_portfolio_digest() TO janus_worker")


def downgrade() -> None:
    op.execute("DROP FUNCTION public.claim_portfolio_digest()")
    op.execute(f"REVOKE SELECT ON {', '.join(READ)} FROM janus_worker")
    op.drop_table("portfolio_digests")
