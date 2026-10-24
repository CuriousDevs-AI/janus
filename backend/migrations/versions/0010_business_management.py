"""business management workspaces, agents and automations"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0010"
down_revision = "0009"


def _tenant_rls(table: str) -> None:
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY tenant_access ON {table} USING (tenant_id = app_tenant()) "
        "WITH CHECK (tenant_id = app_tenant())"
    )


def upgrade() -> None:
    op.create_table(
        "business_workspaces",
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("workspace_type", sa.String(40), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("description", sa.String(1000), nullable=False, server_default=""),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column(
            "settings", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")
        ),
        sa.Column("created_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.UniqueConstraint("tenant_id", "workspace_type"),
        sa.UniqueConstraint("tenant_id", "id"),
    )
    op.create_index("ix_business_workspaces_tenant_id", "business_workspaces", ["tenant_id"])
    op.create_table(
        "business_workspace_members",
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column(
            "workspace_id",
            sa.BigInteger(),
            sa.ForeignKey("business_workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "membership_id",
            sa.BigInteger(),
            sa.ForeignKey("memberships.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("access_level", sa.String(20), nullable=False, server_default="member"),
        sa.Column(
            "permissions", postgresql.ARRAY(sa.String()), nullable=False, server_default="{}"
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.UniqueConstraint("workspace_id", "membership_id"),
    )
    op.create_index(
        "ix_business_workspace_members_tenant_id", "business_workspace_members", ["tenant_id"]
    )
    op.create_table(
        "business_agents",
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column(
            "workspace_id", sa.BigInteger(), sa.ForeignKey("business_workspaces.id"), nullable=True
        ),
        sa.Column("agent_key", sa.String(80), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("department", sa.String(40), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column(
            "configuration",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.UniqueConstraint("tenant_id", "agent_key"),
    )
    op.create_table(
        "automation_workflows",
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column(
            "workspace_id", sa.BigInteger(), sa.ForeignKey("business_workspaces.id"), nullable=True
        ),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("description", sa.String(1000), nullable=False, server_default=""),
        sa.Column(
            "trigger", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")
        ),
        sa.Column(
            "actions", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")
        ),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column(
            "requires_approval", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
        sa.Column("created_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.UniqueConstraint("tenant_id", "name"),
    )
    op.create_table(
        "automation_executions",
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column(
            "workflow_id", sa.BigInteger(), sa.ForeignKey("automation_workflows.id"), nullable=False
        ),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column(
            "event", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")
        ),
        sa.Column(
            "result", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")
        ),
        sa.Column("approved_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
    )
    for table in (
        "business_workspaces",
        "business_workspace_members",
        "business_agents",
        "automation_workflows",
        "automation_executions",
    ):
        _tenant_rls(table)
    # Backfill existing CRM tenants into the workspace registry.
    op.execute(
        """INSERT INTO business_workspaces
           (tenant_id, workspace_type, name, description, created_by)
           SELECT t.id, 'crm_sales', 'CRM & Sales',
                  'Customer relationships, leads and sales pipeline.', m.user_id
           FROM tenants t
           JOIN memberships m ON m.tenant_id = t.id AND m.status = 'active'
           JOIN roles r ON r.id = m.role_id AND r.name = 'owner'
           WHERE NOT EXISTS (
             SELECT 1 FROM business_workspaces w
             WHERE w.tenant_id = t.id AND w.workspace_type = 'crm_sales'
           )"""
    )
    op.execute(
        """INSERT INTO business_workspace_members
           (tenant_id, workspace_id, membership_id, access_level, permissions)
           SELECT w.tenant_id, w.id, m.id, 'owner', ARRAY['read', 'write', 'manage']::text[]
           FROM business_workspaces w
           JOIN memberships m ON m.tenant_id = w.tenant_id AND m.status = 'active'
           JOIN roles r ON r.id = m.role_id AND r.name = 'owner'
           WHERE w.workspace_type = 'crm_sales'
           ON CONFLICT (workspace_id, membership_id) DO NOTHING"""
    )
    additions = {
        "workspaces:manage",
        "reports:read",
        "agents:manage",
        "automations:manage",
        "approvals:manage",
    }
    op.execute(
        sa.text(
            "UPDATE roles SET permissions = permissions || CAST(:permissions AS text[]) "
            "WHERE name IN ('owner', 'admin')"
        ).bindparams(permissions=list(additions))
    )


def downgrade() -> None:
    for table in (
        "automation_executions",
        "automation_workflows",
        "business_agents",
        "business_workspace_members",
        "business_workspaces",
    ):
        op.drop_table(table)
