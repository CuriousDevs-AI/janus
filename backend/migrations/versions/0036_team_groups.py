"""Team chat: group conversations of three or more people, private like a direct conversation."""

from alembic import op

revision = "0036"
down_revision = "0035"


def upgrade() -> None:
    op.drop_constraint("ck_team_spaces_kind", "team_spaces", type_="check")
    op.create_check_constraint(
        "ck_team_spaces_kind", "team_spaces", "kind IN ('channel', 'dm', 'group')"
    )
    op.drop_constraint("ck_team_spaces_name_by_kind", "team_spaces", type_="check")
    op.create_check_constraint(
        "ck_team_spaces_name_by_kind",
        "team_spaces",
        "(kind = 'channel' AND name IS NOT NULL) OR (kind IN ('dm', 'group') AND name IS NULL)",
    )


def downgrade() -> None:
    # Fails while group conversations exist, which is intended: they have no old shape.
    op.drop_constraint("ck_team_spaces_name_by_kind", "team_spaces", type_="check")
    op.create_check_constraint(
        "ck_team_spaces_name_by_kind",
        "team_spaces",
        "(kind = 'channel' AND name IS NOT NULL) OR (kind = 'dm' AND name IS NULL)",
    )
    op.drop_constraint("ck_team_spaces_kind", "team_spaces", type_="check")
    op.create_check_constraint("ck_team_spaces_kind", "team_spaces", "kind IN ('channel', 'dm')")
