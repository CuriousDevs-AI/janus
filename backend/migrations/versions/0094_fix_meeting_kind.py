"""Fix ck_team_messages_kind to include 'meeting'.

The constraint update in 0092 did not apply because 0092 was first run before
the meeting kind lines were added.  This migration is idempotent: it drops the
old constraint and recreates it with the full set.
"""

from alembic import op

revision = "0094"
down_revision = "0093"


def upgrade() -> None:
    op.drop_constraint("ck_team_messages_kind", "team_messages")
    op.create_check_constraint(
        "ck_team_messages_kind",
        "team_messages",
        "kind IN ('text', 'announcement', 'kudos', 'poll', 'event', 'meeting')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_team_messages_kind", "team_messages")
    op.create_check_constraint(
        "ck_team_messages_kind",
        "team_messages",
        "kind IN ('text', 'announcement', 'kudos', 'poll', 'event')",
    )
