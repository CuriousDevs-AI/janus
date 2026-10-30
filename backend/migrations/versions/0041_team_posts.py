"""Team chat posts: announcements, kudos, polls and events, and the answers to polls and events.

Each company gets an announcements channel that everyone reads; only people who may announce
post in it. The permission goes to owners and admins.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0041"
down_revision = "0040"

ADD_TO_ROLES = (
    "UPDATE roles SET permissions = ARRAY(SELECT DISTINCT unnest("
    "permissions || CAST(:new AS text[]))) "
    "WHERE tenant_id IS NULL AND name IN ('owner', 'admin')"
)
REMOVE_FROM_ROLES = (
    "UPDATE roles SET permissions = ARRAY(SELECT unnest(permissions) "
    "EXCEPT SELECT unnest(CAST(:old AS text[]))) "
    "WHERE tenant_id IS NULL"
)


def upgrade() -> None:
    op.add_column(
        "team_messages", sa.Column("kind", sa.String(12), server_default="text", nullable=False)
    )
    op.add_column("team_messages", sa.Column("meta", postgresql.JSONB()))
    op.create_check_constraint(
        "ck_team_messages_kind",
        "team_messages",
        "kind IN ('text', 'announcement', 'kudos', 'poll', 'event')",
    )
    op.add_column(
        "team_spaces",
        sa.Column("announcements", sa.Boolean(), server_default="false", nullable=False),
    )
    op.create_index(
        "uq_team_spaces_announcements",
        "team_spaces",
        ["tenant_id"],
        unique=True,
        postgresql_where=sa.text("announcements"),
    )
    op.create_table(
        "team_responses",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column(
            "message_id",
            sa.BigInteger(),
            sa.ForeignKey("team_messages.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("value", sa.String(40), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("message_id", "user_id", name="uq_team_responses"),
    )
    op.create_index("ix_team_responses_tenant_id", "team_responses", ["tenant_id"])
    op.create_index("ix_team_responses_message_id", "team_responses", ["message_id"])
    op.execute("ALTER TABLE team_responses ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE team_responses FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_access ON team_responses USING (tenant_id = app_tenant()) "
        "WITH CHECK (tenant_id = app_tenant())"
    )
    op.execute(sa.text(ADD_TO_ROLES).bindparams(new=["announcements:post"]))


def downgrade() -> None:
    op.execute(sa.text(REMOVE_FROM_ROLES).bindparams(old=["announcements:post"]))
    op.drop_table("team_responses")
    op.drop_index("uq_team_spaces_announcements", table_name="team_spaces")
    op.drop_column("team_spaces", "announcements")
    op.drop_constraint("ck_team_messages_kind", "team_messages", type_="check")
    op.drop_column("team_messages", "meta")
    op.drop_column("team_messages", "kind")
