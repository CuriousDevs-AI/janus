"""Team chat: files posted with a message, kept in the company's row-level security."""

import sqlalchemy as sa
from alembic import op

revision = "0035"
down_revision = "0034"


def upgrade() -> None:
    op.create_table(
        "team_attachments",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("message_id", sa.BigInteger(), sa.ForeignKey("team_messages.id"), nullable=False),
        sa.Column("uploader_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("filename", sa.String(200), nullable=False),
        sa.Column("content_type", sa.String(100), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("size_bytes BETWEEN 1 AND 5242880", name="ck_team_attachments_size"),
    )
    op.create_index("ix_team_attachments_tenant_id", "team_attachments", ["tenant_id"])
    op.create_index("ix_team_attachments_message_id", "team_attachments", ["message_id"])
    op.execute("ALTER TABLE team_attachments ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE team_attachments FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_access ON team_attachments USING (tenant_id = app_tenant()) "
        "WITH CHECK (tenant_id = app_tenant())"
    )


def downgrade() -> None:
    op.drop_table("team_attachments")
