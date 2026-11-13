"""Plan limits, and payments for a plan through Razorpay.

`plan_usage(tenant)` says whose plan a company falls under (its Owner's; with several Owners, the
highest plan), and how many companies and seats that account uses: seats are active members and
open invitations across its companies. It runs as its owner because an admin inviting someone may
not read the Owner's plan or the account's other companies, and it returns only those counts.

`account_payments` keeps each Razorpay order for a plan, the person's own rows under row-level
security. Razorpay's webhook arrives signed but not signed in, so `account_payment_owner(order)`
returns only whose order it is; the payment is then settled under that person's context.
"""

import sqlalchemy as sa
from alembic import op

revision = "0077"
down_revision = "0076"


def upgrade() -> None:
    op.execute("""CREATE FUNCTION public.plan_usage(t bigint)
      RETURNS TABLE(account bigint, plan text, companies int, seats int)
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
      WITH owner AS (
        SELECT m.user_id, coalesce(p.plan, 'free') AS plan
        FROM public.memberships m
        JOIN public.roles r ON r.id = m.role_id AND r.tenant_id IS NULL AND r.name = 'owner'
        LEFT JOIN public.account_plans p ON p.user_id = m.user_id
        WHERE m.tenant_id = t AND m.status = 'active'
        ORDER BY CASE coalesce(p.plan, 'free')
          WHEN 'enterprise' THEN 3 WHEN 'growth' THEN 2 WHEN 'startup' THEN 1 ELSE 0 END DESC, m.id
        LIMIT 1
      ), owned AS (
        SELECT m.tenant_id FROM public.memberships m
        JOIN public.roles r ON r.id = m.role_id AND r.tenant_id IS NULL AND r.name = 'owner'
        WHERE m.user_id = (SELECT user_id FROM owner) AND m.status = 'active'
      )
      SELECT o.user_id, o.plan,
        (SELECT count(*) FROM owned)::int,
        ((SELECT count(*) FROM public.memberships m
            WHERE m.tenant_id IN (SELECT tenant_id FROM owned) AND m.status = 'active')
         + (SELECT count(*) FROM public.invitations i
            WHERE i.tenant_id IN (SELECT tenant_id FROM owned) AND i.used_at IS NULL
              AND i.revoked_at IS NULL AND i.expires_at > now()))::int
      FROM owner o
    $$""")
    op.execute("REVOKE ALL ON FUNCTION public.plan_usage(bigint) FROM PUBLIC")
    op.execute("GRANT EXECUTE ON FUNCTION public.plan_usage(bigint) TO janus_app")

    op.create_table(
        "account_payments",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("plan", sa.String(20), nullable=False),
        sa.Column("order_id", sa.String(40), nullable=False, unique=True),
        sa.Column("payment_id", sa.String(40)),
        sa.Column("amount_paise", sa.BigInteger(), nullable=False),
        sa.Column("status", sa.String(10), nullable=False, server_default="created"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("paid_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("status IN ('created', 'paid')", name="ck_account_payments_status"),
        sa.CheckConstraint("plan IN ('startup', 'growth')", name="ck_account_payments_plan"),
    )
    op.execute("ALTER TABLE account_payments ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE account_payments FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY own_rows ON account_payments "
        "USING (user_id = app_user()) WITH CHECK (user_id = app_user())"
    )
    op.execute("GRANT SELECT, INSERT, UPDATE ON account_payments TO janus_app")
    op.execute("""CREATE FUNCTION public.account_payment_owner(o text) RETURNS bigint
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
      SELECT user_id FROM public.account_payments WHERE order_id = o
    $$""")
    op.execute("REVOKE ALL ON FUNCTION public.account_payment_owner(text) FROM PUBLIC")
    op.execute("GRANT EXECUTE ON FUNCTION public.account_payment_owner(text) TO janus_app")
    # Every payment gets its invoice, even two on one day (an upgrade the day after buying), so
    # invoices are no longer one per start day; sample invoices skip a month already invoiced.
    op.drop_constraint("account_invoices_user_id_period_start_key", "account_invoices")


def downgrade() -> None:
    op.create_unique_constraint(
        "account_invoices_user_id_period_start_key", "account_invoices", ["user_id", "period_start"]
    )
    op.execute("DROP FUNCTION public.account_payment_owner(text)")
    op.drop_table("account_payments")
    op.execute("DROP FUNCTION public.plan_usage(bigint)")
