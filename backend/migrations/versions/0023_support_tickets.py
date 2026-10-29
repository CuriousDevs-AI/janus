"""Support ticket status, assignee and resolution on the server"""

import sqlalchemy as sa
from alembic import op

revision = "0023"
down_revision = "0022"


def upgrade() -> None:
    op.create_table(
        "support_tickets",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("external_key", sa.String(length=64), nullable=False),
        sa.Column("number", sa.String(length=20), nullable=False),
        sa.Column("subject", sa.String(length=200), nullable=False),
        sa.Column("priority", sa.String(length=10), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("assignee", sa.String(length=64), nullable=True),
        sa.Column("resolution", sa.String(length=300), nullable=True),
        sa.Column("opened_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("raised_on", sa.Date(), nullable=False),
        sa.UniqueConstraint("tenant_id", "external_key", name="uq_support_tickets_key"),
        sa.CheckConstraint(
            "priority IN ('low', 'medium', 'high', 'urgent')", name="ck_support_tickets_priority"
        ),
        sa.CheckConstraint(
            "status IN ('open', 'ai_handling', 'waiting_customer', 'escalated', 'in_progress', "
            "'resolved', 'closed')",
            name="ck_support_tickets_status",
        ),
    )
    op.execute("ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE support_tickets FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_access ON support_tickets USING (tenant_id = app_tenant()) "
        "WITH CHECK (tenant_id = app_tenant())"
    )


def downgrade() -> None:
    op.drop_table("support_tickets")
