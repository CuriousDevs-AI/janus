"""Red alerts: an email to a person when one of their companies turns red.

Each person's setting is theirs alone (row-level security on app.user_id). The worker claims one
due check at a time through a function that returns only the person's name and email, then reads
the Portfolio company by company under each company's own context, the same as the page. Health
needs the operating view, so the worker gets read access to the tables behind it; row-level
security still limits each read to the one company in context.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0057"
down_revision = "0056"

# The tables the Portfolio's operating view and health read that the worker was not granted before
# (leads, projects, tasks, tickets and the books it already reads).
READ = (
    "hr_records",
    "ops_items",
    "ops_batches",
    "ops_movements",
    "ops_adjustments",
    "ops_dispatches",
    "ops_requisitions",
    "project_milestones",
    "project_change_requests",
    "it_changes",
    "finance_fund_requests",
    "vendor_bank_accounts",
    "compliance_profiles",
    "compliance_filings",
    "company_registrations",
    "portfolio_targets",
)


def upgrade() -> None:
    op.create_table(
        "portfolio_alerts",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("red", JSONB(), nullable=False, server_default="[]"),
        sa.Column("next_check_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("checked_at", sa.DateTime(timezone=True)),
        sa.Column("last_sent_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index(
        "ix_portfolio_alerts_due",
        "portfolio_alerts",
        ["next_check_at"],
        postgresql_where=sa.text("enabled"),
    )
    op.execute("ALTER TABLE portfolio_alerts ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE portfolio_alerts FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY own_alerts ON portfolio_alerts "
        "USING (user_id = app_user()) WITH CHECK (user_id = app_user())"
    )
    op.execute("GRANT SELECT, INSERT, UPDATE ON portfolio_alerts TO janus_app")
    op.execute("GRANT SELECT, UPDATE ON portfolio_alerts TO janus_worker")
    op.execute(f"GRANT SELECT ON {', '.join(READ)} TO janus_worker")
    op.execute("""CREATE FUNCTION public.claim_portfolio_alert()
      RETURNS TABLE(user_id bigint, email text, name text)
      LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
      SELECT a.user_id, u.email::text, u.name::text FROM public.portfolio_alerts a
      JOIN public.users u ON u.id = a.user_id AND u.deleted_at IS NULL
      WHERE a.enabled AND a.next_check_at <= now()
      ORDER BY a.next_check_at LIMIT 1 FOR UPDATE OF a SKIP LOCKED
    $$""")
    op.execute("REVOKE ALL ON FUNCTION public.claim_portfolio_alert() FROM PUBLIC")
    op.execute("GRANT EXECUTE ON FUNCTION public.claim_portfolio_alert() TO janus_worker")


def downgrade() -> None:
    op.execute("DROP FUNCTION public.claim_portfolio_alert()")
    op.execute(f"REVOKE SELECT ON {', '.join(READ)} FROM janus_worker")
    op.drop_table("portfolio_alerts")
