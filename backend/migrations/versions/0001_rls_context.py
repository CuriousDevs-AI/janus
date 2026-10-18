"""Transaction-local tenant and actor context."""

from alembic import op

revision = "0001"
down_revision = None


def upgrade() -> None:
    op.execute(
        "CREATE FUNCTION public.app_tenant() RETURNS bigint LANGUAGE sql STABLE "
        "AS $$ SELECT nullif(current_setting('app.tenant_id', true), '')::bigint $$"
    )
    op.execute(
        "CREATE FUNCTION public.app_user() RETURNS bigint LANGUAGE sql STABLE "
        "AS $$ SELECT nullif(current_setting('app.user_id', true), '')::bigint $$"
    )
    op.execute("REVOKE CREATE ON SCHEMA public FROM PUBLIC")


def downgrade() -> None:
    op.execute("DROP FUNCTION public.app_user()")
    op.execute("DROP FUNCTION public.app_tenant()")
