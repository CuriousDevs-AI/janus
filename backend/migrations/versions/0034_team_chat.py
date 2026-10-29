"""Team chat: channels, direct conversations, messages, threads and reactions."""

import sqlalchemy as sa
from alembic import op

revision = "0034"
down_revision = "0033"

TABLES = ["team_spaces", "team_space_members", "team_messages", "team_reactions"]


def upgrade() -> None:
    op.create_table(
        "team_spaces",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("name", sa.String(40), nullable=True),
        sa.Column("topic", sa.String(200), nullable=False, server_default=""),
        sa.Column("created_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("tenant_id", "name", name="uq_team_spaces_name"),
        sa.CheckConstraint("kind IN ('channel', 'dm')", name="ck_team_spaces_kind"),
        sa.CheckConstraint(
            "(kind = 'channel' AND name IS NOT NULL) OR (kind = 'dm' AND name IS NULL)",
            name="ck_team_spaces_name_by_kind",
        ),
    )
    op.create_index("ix_team_spaces_tenant_id", "team_spaces", ["tenant_id"])

    op.create_table(
        "team_space_members",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("space_id", sa.BigInteger(), sa.ForeignKey("team_spaces.id"), nullable=False),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("last_read_id", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column(
            "joined_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("space_id", "user_id", name="uq_team_space_members"),
    )
    op.create_index("ix_team_space_members_tenant_id", "team_space_members", ["tenant_id"])
    op.create_index("ix_team_space_members_space_id", "team_space_members", ["space_id"])
    op.create_index("ix_team_space_members_user_id", "team_space_members", ["user_id"])

    op.create_table(
        "team_messages",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("space_id", sa.BigInteger(), sa.ForeignKey("team_spaces.id"), nullable=False),
        sa.Column("parent_id", sa.BigInteger(), sa.ForeignKey("team_messages.id"), nullable=True),
        sa.Column("author_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("idempotency_key", sa.String(80), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint(
            "tenant_id", "author_id", "idempotency_key", name="uq_team_messages_idempotency"
        ),
        sa.CheckConstraint("char_length(body) BETWEEN 1 AND 4000", name="ck_team_messages_body"),
    )
    op.create_index("ix_team_messages_tenant_id", "team_messages", ["tenant_id"])
    op.create_index("ix_team_messages_space_id", "team_messages", ["space_id"])
    op.create_index("ix_team_messages_created_at", "team_messages", ["created_at"])

    op.create_table(
        "team_reactions",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("message_id", sa.BigInteger(), sa.ForeignKey("team_messages.id"), nullable=False),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("emoji", sa.String(16), nullable=False),
        sa.UniqueConstraint("message_id", "user_id", "emoji", name="uq_team_reactions"),
    )
    op.create_index("ix_team_reactions_tenant_id", "team_reactions", ["tenant_id"])
    op.create_index("ix_team_reactions_message_id", "team_reactions", ["message_id"])

    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_access ON {table} USING (tenant_id = app_tenant()) "
            "WITH CHECK (tenant_id = app_tenant())"
        )


def downgrade() -> None:
    op.drop_table("team_reactions")
    op.drop_table("team_messages")
    op.drop_table("team_space_members")
    op.drop_table("team_spaces")
