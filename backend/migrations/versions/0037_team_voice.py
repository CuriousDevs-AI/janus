"""Team chat: voice channels, who is in each call, and the WebRTC messages between them."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0037"
down_revision = "0036"

TABLES = ["team_voice_presence", "team_signals"]


def upgrade() -> None:
    op.drop_constraint("ck_team_spaces_kind", "team_spaces", type_="check")
    op.create_check_constraint(
        "ck_team_spaces_kind", "team_spaces", "kind IN ('channel', 'dm', 'group', 'voice')"
    )
    op.drop_constraint("ck_team_spaces_name_by_kind", "team_spaces", type_="check")
    op.create_check_constraint(
        "ck_team_spaces_name_by_kind",
        "team_spaces",
        "(kind IN ('channel', 'voice') AND name IS NOT NULL) "
        "OR (kind IN ('dm', 'group') AND name IS NULL)",
    )
    op.create_table(
        "team_voice_presence",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("space_id", sa.BigInteger(), sa.ForeignKey("team_spaces.id"), nullable=False),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("muted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("deafened", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("sharing", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column(
            "joined_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "seen_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("space_id", "user_id", name="uq_team_voice_presence"),
    )
    op.create_index("ix_team_voice_presence_tenant_id", "team_voice_presence", ["tenant_id"])
    op.create_index("ix_team_voice_presence_space_id", "team_voice_presence", ["space_id"])
    op.create_index("ix_team_voice_presence_user_id", "team_voice_presence", ["user_id"])
    op.create_table(
        "team_signals",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("space_id", sa.BigInteger(), sa.ForeignKey("team_spaces.id"), nullable=False),
        sa.Column("from_user", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("to_user", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "kind IN ('offer', 'answer', 'ice', 'bye')", name="ck_team_signals_kind"
        ),
    )
    op.create_index("ix_team_signals_tenant_id", "team_signals", ["tenant_id"])
    op.create_index("ix_team_signals_space_id", "team_signals", ["space_id"])
    op.create_index("ix_team_signals_to_user", "team_signals", ["to_user"])
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_access ON {table} USING (tenant_id = app_tenant()) "
            "WITH CHECK (tenant_id = app_tenant())"
        )


def downgrade() -> None:
    op.drop_table("team_signals")
    op.drop_table("team_voice_presence")
    # Fails while voice channels exist, which is intended: they have no old shape.
    op.drop_constraint("ck_team_spaces_name_by_kind", "team_spaces", type_="check")
    op.create_check_constraint(
        "ck_team_spaces_name_by_kind",
        "team_spaces",
        "(kind = 'channel' AND name IS NOT NULL) OR (kind IN ('dm', 'group') AND name IS NULL)",
    )
    op.drop_constraint("ck_team_spaces_kind", "team_spaces", type_="check")
    op.create_check_constraint(
        "ck_team_spaces_kind", "team_spaces", "kind IN ('channel', 'dm', 'group')"
    )
