"""Team Chat: pin messages, private channels, add members, call history, auto-groups.

Adds:
- team_spaces.private (bool): whether only invited members see the channel
- team_messages.pinned_at/pinned_by: pin support (up to 50 per channel)
- team_call_events: join/leave/share log for call history
- team_spaces.source_kind/source_id: link a channel back to its department or project
"""

import sqlalchemy as sa
from alembic import op

revision = "0092"
down_revision = "0091"


def upgrade() -> None:
    op.add_column(
        "team_spaces",
        sa.Column("private", sa.Boolean, server_default="false", nullable=False),
    )
    op.add_column(
        "team_spaces",
        sa.Column("source_kind", sa.String(20), nullable=True),
    )
    op.add_column(
        "team_spaces",
        sa.Column("source_id", sa.String(80), nullable=True),
    )
    op.add_column(
        "team_messages",
        sa.Column("pinned_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "team_messages",
        sa.Column("pinned_by", sa.BigInteger, nullable=True),
    )
    op.create_table(
        "team_call_events",
        sa.Column(
            "id",
            sa.BigInteger,
            sa.Identity(always=True),
            primary_key=True,
        ),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenants.id"), index=True),
        sa.Column("space_id", sa.BigInteger, sa.ForeignKey("team_spaces.id"), index=True),
        sa.Column("user_id", sa.BigInteger, sa.ForeignKey("users.id"), index=True),
        sa.Column("action", sa.String(10), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "action IN ('join', 'leave', 'share_on', 'share_off')",
            name="ck_team_call_events_action",
        ),
    )
    op.create_index(
        "ix_team_spaces_source",
        "team_spaces",
        ["tenant_id", "source_kind", "source_id"],
    )
    op.drop_constraint("ck_team_messages_kind", "team_messages")
    op.create_check_constraint(
        "ck_team_messages_kind",
        "team_messages",
        "kind IN ('text', 'announcement', 'kudos', 'poll', 'event', 'meeting')",
    )


def downgrade() -> None:
    op.drop_index("ix_team_spaces_source", table_name="team_spaces")
    op.drop_table("team_call_events")
    op.drop_column("team_messages", "pinned_by")
    op.drop_column("team_messages", "pinned_at")
    op.drop_column("team_spaces", "source_id")
    op.drop_column("team_spaces", "source_kind")
    op.drop_constraint("ck_team_messages_kind", "team_messages")
    op.create_check_constraint(
        "ck_team_messages_kind",
        "team_messages",
        "kind IN ('text', 'announcement', 'kudos', 'poll', 'event')",
    )
    op.drop_column("team_spaces", "private")
