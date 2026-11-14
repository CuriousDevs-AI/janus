"""The names of the company's members, for reports that name people.

Rep performance names each lead's owner. The worker builds the same report for scheduled emails and
red alerts, but its role cannot read users. This function gives it, and the app, only the id and
name of each active member of the company whose context is set, and nothing else.
"""

from alembic import op

revision = "0084"
down_revision = "0083"


def upgrade() -> None:
    op.execute("""CREATE FUNCTION public.app_member_names()
      RETURNS TABLE(id bigint, name text)
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
      SELECT u.id, u.name::text
      FROM public.memberships m JOIN public.users u ON u.id = m.user_id
      WHERE m.tenant_id = public.app_tenant() AND u.deleted_at IS NULL
    $$""")
    op.execute("REVOKE ALL ON FUNCTION public.app_member_names() FROM PUBLIC")
    op.execute("GRANT EXECUTE ON FUNCTION public.app_member_names() TO janus_app, janus_worker")


def downgrade() -> None:
    op.execute("DROP FUNCTION public.app_member_names()")
