"""Workflow runner: the worker claims approved or queued workflow runs and carries out their steps.

The worker gets only what the supported steps need: reading workflows and the records a run is
about, posting Team Chat messages and adding project tasks. Row-level security still limits every
read and write to the run's company.
"""

import sqlalchemy as sa
from alembic import op

revision = "0047"
down_revision = "0046"

READ = (
    "automation_workflows",
    "business_workspaces",
    "business_workspace_members",
    "support_tickets",
    "team_spaces",
    "team_space_members",
    "projects",
)
WRITE = ("automation_executions", "team_messages", "project_tasks")


def upgrade() -> None:
    op.create_index(
        "ix_automation_executions_due",
        "automation_executions",
        ["id"],
        postgresql_where=sa.text("status IN ('queued', 'approved')"),
    )
    op.execute(f"GRANT SELECT ON {', '.join(READ)} TO janus_worker")
    op.execute(f"GRANT SELECT, INSERT, UPDATE ON {', '.join(WRITE)} TO janus_worker")
    op.execute(
        "GRANT USAGE ON SEQUENCE "
        + ", ".join(f"{table}_id_seq" for table in WRITE)
        + " TO janus_worker"
    )
    op.execute("""CREATE FUNCTION public.claim_automation_execution()
      RETURNS TABLE(id bigint, tenant_id bigint)
      LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
      SELECT e.id, e.tenant_id FROM public.automation_executions e
      WHERE e.status IN ('queued', 'approved')
      ORDER BY e.id LIMIT 1 FOR UPDATE SKIP LOCKED
    $$""")
    op.execute("REVOKE ALL ON FUNCTION public.claim_automation_execution() FROM PUBLIC")
    op.execute("GRANT EXECUTE ON FUNCTION public.claim_automation_execution() TO janus_worker")


def downgrade() -> None:
    op.execute("DROP FUNCTION public.claim_automation_execution()")
    op.execute(
        "REVOKE USAGE ON SEQUENCE "
        + ", ".join(f"{table}_id_seq" for table in WRITE)
        + " FROM janus_worker"
    )
    op.execute(f"REVOKE SELECT, INSERT, UPDATE ON {', '.join(WRITE)} FROM janus_worker")
    op.execute(f"REVOKE SELECT ON {', '.join(READ)} FROM janus_worker")
    op.drop_index("ix_automation_executions_due", "automation_executions")
