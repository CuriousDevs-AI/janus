"""Business Reports keep what people make: saved reports, pinned reports and emailed schedules.

Saved reports and schedules belong to the business (row-level security on app.tenant_id); pins are
one person's within it. The worker claims one due schedule at a time through a function that
returns its business and the active members it goes to, then reads each recipient's figures under
that recipient's own context, so nobody is emailed more than their role may see.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0082"
down_revision = "0081"

TABLES = ("business_saved_reports", "business_report_pins", "business_report_schedules")


def _tenant_table(name: str, *columns: sa.Column) -> None:
    op.create_table(
        name,
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        *columns,
    )
    op.execute(f"ALTER TABLE {name} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {name} FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY tenant_access ON {name} USING (tenant_id = app_tenant()) "
        "WITH CHECK (tenant_id = app_tenant())"
    )
    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {name} TO janus_app")


def upgrade() -> None:
    created = sa.Column(
        "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
    )
    _tenant_table(
        "business_saved_reports",
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("report", sa.String(40), nullable=False),
        sa.Column("period", sa.String(10), nullable=False, server_default="month"),
        sa.Column("note", sa.String(300), nullable=False, server_default=""),
        sa.Column("created_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        created,
    )
    op.create_index("ix_business_saved_reports_tenant_id", "business_saved_reports", ["tenant_id"])
    _tenant_table(
        "business_report_pins",
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("reports", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.UniqueConstraint("tenant_id", "user_id"),
    )
    _tenant_table(
        "business_report_schedules",
        sa.Column("report", sa.String(40), nullable=False),
        sa.Column("period", sa.String(10), nullable=False, server_default="month"),
        sa.Column("frequency", sa.String(10), nullable=False),
        sa.Column("recipients", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("paused", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("next_due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_sent_at", sa.DateTime(timezone=True)),
        sa.Column("last_problem", sa.String(500)),
        sa.Column("created_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint("frequency IN ('daily', 'weekly', 'monthly')"),
    )
    op.create_index(
        "ix_business_report_schedules_tenant_id", "business_report_schedules", ["tenant_id"]
    )
    op.create_index(
        "ix_business_report_schedules_due",
        "business_report_schedules",
        ["next_due_at"],
        postgresql_where=sa.text("NOT paused"),
    )
    op.execute("GRANT SELECT, UPDATE ON business_report_schedules TO janus_worker")
    op.execute("""CREATE FUNCTION public.claim_report_schedule()
      RETURNS TABLE(id bigint, tenant_id bigint, recipients jsonb)
      LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
      SELECT s.id, s.tenant_id, COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', u.id, 'email', u.email, 'name', u.name)
                         ORDER BY u.id)
        FROM public.memberships m JOIN public.users u ON u.id = m.user_id
        WHERE m.tenant_id = s.tenant_id AND m.status = 'active' AND u.deleted_at IS NULL
          AND s.recipients @> to_jsonb(u.id)
      ), '[]'::jsonb)
      FROM public.business_report_schedules s
      WHERE NOT s.paused AND s.next_due_at <= now()
      ORDER BY s.next_due_at LIMIT 1 FOR UPDATE OF s SKIP LOCKED
    $$""")
    op.execute("REVOKE ALL ON FUNCTION public.claim_report_schedule() FROM PUBLIC")
    op.execute("GRANT EXECUTE ON FUNCTION public.claim_report_schedule() TO janus_worker")


def downgrade() -> None:
    op.execute("DROP FUNCTION public.claim_report_schedule()")
    for name in reversed(TABLES):
        op.drop_table(name)
