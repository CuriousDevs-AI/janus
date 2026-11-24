"""Fix raw_events partition grants: stop revoking from app/worker roles.

The ensure_raw_event_partitions() function was revoking ALL from janus_app
and janus_worker on each new partition, which blocked reads and writes.
Only PUBLIC should be revoked; app and worker need SELECT/INSERT/UPDATE.

Revision ID: 0109
Revises: 0108
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0109"
down_revision: str | None = "0108"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.ensure_raw_event_partitions()")
    op.execute("""CREATE FUNCTION public.ensure_raw_event_partitions() RETURNS void
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
      DECLARE day date; part text;
      BEGIN
        FOR offset_day IN -1..7 LOOP
          day := (now() AT TIME ZONE 'UTC')::date + offset_day;
          part := 'raw_events_' || to_char(day, 'YYYYMMDD');
          IF to_regclass('public.' || part) IS NOT NULL THEN CONTINUE; END IF;
          PERFORM pg_advisory_xact_lock(hashtextextended('partition:' || part, 0));
          IF to_regclass('public.' || part) IS NOT NULL THEN CONTINUE; END IF;
          EXECUTE format('CREATE TABLE public.%I PARTITION OF public.raw_events '
                         'FOR VALUES FROM (%L) TO (%L)', part, day, day + 1);
          EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', part);
          EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', part);
          EXECUTE format('CREATE POLICY tenant_only ON public.%I '
                         'USING (tenant_id = public.app_tenant()) '
                         'WITH CHECK (tenant_id = public.app_tenant())', part);
          EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', part);
          EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO janus_app, janus_worker', part);
        END LOOP;
      END $$""")
    op.execute("REVOKE ALL ON FUNCTION public.ensure_raw_event_partitions() FROM PUBLIC")
    op.execute(
        "GRANT EXECUTE ON FUNCTION public.ensure_raw_event_partitions() TO janus_app, janus_worker"
    )
    # Fix any existing partitions that already have broken grants.
    op.execute("""DO $$
      DECLARE r record;
      BEGIN
        FOR r IN
          SELECT inhrelid::regclass::text AS part
          FROM pg_inherits
          WHERE inhparent = 'public.raw_events'::regclass
        LOOP
          EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %s TO janus_app, janus_worker', r.part);
        END LOOP;
      END $$""")


def downgrade() -> None:
    pass
