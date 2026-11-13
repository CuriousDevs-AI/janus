"""Red alerts reach the browser too, and owners get the weekly email and red alerts by default.

The worker pushes red alerts to the browsers a person allowed notifications on, and forgets the
ones the push service no longer knows; row-level security still keeps it to one company at a
time. `add_owner_portfolio_defaults()` turns both on for every active, verified owner who has
never chosen, so a row a person turned off stays off.
"""

from alembic import op

revision = "0071"
down_revision = "0070"

# The first Monday 9:00 in India after now, as portfolio.digest.next_due works it out.
NEXT_MONDAY = (
    "(date_trunc('week', now() AT TIME ZONE 'Asia/Kolkata') + interval '7 days 9 hours')"
    " AT TIME ZONE 'Asia/Kolkata'"
)


def upgrade() -> None:
    op.execute("GRANT SELECT, DELETE ON push_subscriptions TO janus_worker")
    op.execute(f"""CREATE FUNCTION public.add_owner_portfolio_defaults()
      RETURNS integer
      LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
      DECLARE
        digests integer;
        alerts integer;
      BEGIN
        CREATE TEMP TABLE IF NOT EXISTS owners_without_settings (user_id bigint) ON COMMIT DROP;
        INSERT INTO owners_without_settings
          SELECT DISTINCT m.user_id FROM public.memberships m
          JOIN public.roles r ON r.id = m.role_id AND r.name = 'owner'
          JOIN public.users u ON u.id = m.user_id
            AND u.deleted_at IS NULL AND u.email_verified_at IS NOT NULL
          WHERE m.status = 'active';
        INSERT INTO public.portfolio_digests (user_id, enabled, next_due_at)
          SELECT o.user_id, true, {NEXT_MONDAY} FROM owners_without_settings o
          WHERE NOT EXISTS (SELECT 1 FROM public.portfolio_digests d WHERE d.user_id = o.user_id)
          ON CONFLICT (user_id) DO NOTHING;
        GET DIAGNOSTICS digests = ROW_COUNT;
        -- The first check only notes what is red, so turning alerts on sends no old news.
        INSERT INTO public.portfolio_alerts (user_id, enabled, red, next_check_at)
          SELECT o.user_id, true, '[]'::jsonb, now() FROM owners_without_settings o
          WHERE NOT EXISTS (SELECT 1 FROM public.portfolio_alerts a WHERE a.user_id = o.user_id)
          ON CONFLICT (user_id) DO NOTHING;
        GET DIAGNOSTICS alerts = ROW_COUNT;
        DROP TABLE owners_without_settings;
        RETURN digests + alerts;
      END
    $$""")
    op.execute("REVOKE ALL ON FUNCTION public.add_owner_portfolio_defaults() FROM PUBLIC")
    op.execute("GRANT EXECUTE ON FUNCTION public.add_owner_portfolio_defaults() TO janus_worker")


def downgrade() -> None:
    op.execute("DROP FUNCTION public.add_owner_portfolio_defaults()")
    op.execute("REVOKE SELECT, DELETE ON push_subscriptions FROM janus_worker")
