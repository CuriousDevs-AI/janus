"""Team chat: drop the user foreign keys on call signals.

Every request locks the signed-in user's row. A signal insert also took a key-share lock on the
recipient's row, so two people signalling each other at once deadlocked. Signals are short-lived
relay messages, checked against the call before they are written, so they keep no user keys.
"""

from alembic import op

revision = "0038"
down_revision = "0037"


def upgrade() -> None:
    op.drop_constraint("team_signals_from_user_fkey", "team_signals", type_="foreignkey")
    op.drop_constraint("team_signals_to_user_fkey", "team_signals", type_="foreignkey")


def downgrade() -> None:
    op.create_foreign_key(
        "team_signals_from_user_fkey", "team_signals", "users", ["from_user"], ["id"]
    )
    op.create_foreign_key("team_signals_to_user_fkey", "team_signals", "users", ["to_user"], ["id"])
