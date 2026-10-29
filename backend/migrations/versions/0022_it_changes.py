"""IT change requests on the server"""

import sqlalchemy as sa
from alembic import op

revision = "0022"
down_revision = "0021"


def upgrade() -> None:
    op.create_table(
        "it_changes",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("number", sa.String(length=20), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("risk", sa.String(length=10), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("requested_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("decided_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("raised_on", sa.Date(), nullable=False),
        sa.UniqueConstraint("tenant_id", "number"),
        sa.CheckConstraint("risk IN ('low', 'medium', 'high')", name="ck_it_changes_risk"),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected', 'done')", name="ck_it_changes_status"
        ),
    )
    op.execute("ALTER TABLE it_changes ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE it_changes FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_access ON it_changes USING (tenant_id = app_tenant()) "
        "WITH CHECK (tenant_id = app_tenant())"
    )


def downgrade() -> None:
    op.drop_table("it_changes")
