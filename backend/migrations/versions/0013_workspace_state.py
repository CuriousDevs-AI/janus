"""tenant-scoped workspace state documents for the operational workspaces"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0013"
down_revision = "0012"


def upgrade() -> None:
    op.create_table(
        "workspace_state",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("store_key", sa.String(length=80), nullable=False),
        sa.Column("data", postgresql.JSONB(), nullable=False),
        sa.Column("version", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.Column("updated_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("tenant_id", "store_key"),
    )
    op.create_index("ix_workspace_state_tenant_id", "workspace_state", ["tenant_id"])
    op.execute("ALTER TABLE workspace_state ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE workspace_state FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_access ON workspace_state USING (tenant_id = app_tenant()) "
        "WITH CHECK (tenant_id = app_tenant())"
    )


def downgrade() -> None:
    op.drop_table("workspace_state")
