"""backfill CRM workspace access for existing businesses"""

from alembic import op

revision = "0011"
down_revision = "0010"


def upgrade() -> None:
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


def downgrade() -> None:
    op.execute(
        "DELETE FROM business_workspace_members WHERE workspace_id IN "
        "(SELECT id FROM business_workspaces WHERE workspace_type = 'crm_sales')"
    )
    op.execute("DELETE FROM business_workspaces WHERE workspace_type = 'crm_sales'")
