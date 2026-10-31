"""Workflow folders: a company files its workflows in folders; deleting one leaves them unfiled."""

import sqlalchemy as sa
from alembic import op

revision = "0046"
down_revision = "0045"


def upgrade() -> None:
    op.create_table(
        "automation_folders",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("tenant_id", "name", name="uq_automation_folders_name"),
    )
    op.create_index("ix_automation_folders_tenant_id", "automation_folders", ["tenant_id"])
    op.execute("ALTER TABLE automation_folders ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE automation_folders FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_access ON automation_folders USING (tenant_id = app_tenant()) "
        "WITH CHECK (tenant_id = app_tenant())"
    )
    op.add_column(
        "automation_workflows",
        sa.Column(
            "folder_id",
            sa.BigInteger(),
            sa.ForeignKey("automation_folders.id", ondelete="SET NULL"),
        ),
    )


def downgrade() -> None:
    op.drop_column("automation_workflows", "folder_id")
    op.drop_table("automation_folders")
