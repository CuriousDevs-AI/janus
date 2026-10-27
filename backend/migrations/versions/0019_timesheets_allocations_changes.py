"""typed timesheets, allocations and change requests for project records"""

import sqlalchemy as sa
from alembic import op

revision = "0019"
down_revision = "0018"


def _tenant_rls(table: str) -> None:
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY tenant_access ON {table} USING (tenant_id = app_tenant()) "
        "WITH CHECK (tenant_id = app_tenant())"
    )


def upgrade() -> None:
    op.create_table(
        "project_timesheets",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("project_id", sa.BigInteger(), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("work_on", sa.Date(), nullable=False),
        sa.Column("hours", sa.Numeric(4, 2), nullable=False),
        sa.Column("note", sa.String(length=300), nullable=False, server_default=""),
        sa.Column("logged_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.CheckConstraint("hours > 0 AND hours <= 12", name="ck_timesheets_hours"),
    )
    op.create_index("ix_project_timesheets_project", "project_timesheets", ["project_id"])
    _tenant_rls("project_timesheets")

    op.create_table(
        "project_allocations",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("project_id", sa.BigInteger(), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("percent", sa.Integer(), nullable=False),
        sa.UniqueConstraint("project_id", "user_id"),
        sa.CheckConstraint("percent >= 0 AND percent <= 100", name="ck_allocations_percent"),
    )
    _tenant_rls("project_allocations")

    op.create_table(
        "project_change_requests",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("project_id", sa.BigInteger(), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("description", sa.String(length=300), nullable=False),
        sa.Column("budget_change", sa.Numeric(14, 2), nullable=False),
        sa.Column("day_change", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("requested_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("decided_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected')", name="ck_changes_status"
        ),
    )
    _tenant_rls("project_change_requests")


def downgrade() -> None:
    op.drop_table("project_change_requests")
    op.drop_table("project_allocations")
    op.drop_table("project_timesheets")
