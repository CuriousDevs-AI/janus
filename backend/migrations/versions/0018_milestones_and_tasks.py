"""typed milestones and tasks, linked to the project record they belong to"""

import sqlalchemy as sa
from alembic import op

revision = "0018"
down_revision = "0017"


def _tenant_rls(table: str) -> None:
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY tenant_access ON {table} USING (tenant_id = app_tenant()) "
        "WITH CHECK (tenant_id = app_tenant())"
    )


def upgrade() -> None:
    op.create_table(
        "project_milestones",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("project_id", sa.BigInteger(), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("external_key", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("due_on", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("completed_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("accepted_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("tenant_id", "external_key"),
        sa.CheckConstraint(
            "status IN ('planned', 'done', 'accepted')", name="ck_milestones_status"
        ),
        sa.CheckConstraint("amount >= 0", name="ck_milestones_amount"),
    )
    _tenant_rls("project_milestones")

    op.create_table(
        "project_tasks",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("project_id", sa.BigInteger(), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column(
            "milestone_id", sa.BigInteger(), sa.ForeignKey("project_milestones.id"), nullable=True
        ),
        sa.Column("external_key", sa.String(length=80), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("assignee_user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("due_on", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.UniqueConstraint("tenant_id", "external_key"),
        sa.CheckConstraint("status IN ('todo', 'doing', 'done')", name="ck_tasks_status"),
    )
    _tenant_rls("project_tasks")


def downgrade() -> None:
    op.drop_table("project_tasks")
    op.drop_table("project_milestones")
