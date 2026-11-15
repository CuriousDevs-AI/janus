"""Why a lead or deal was lost, as one of a few reasons a sales manager can count.

A lost deal carried only free text, and a lost lead carried nothing, so nobody could say whether
the business loses on price, to a competitor or to silence. Both now record a reason from a short
list, an optional note, and when they were lost. Deals and leads lost before this are counted as
"other", with the date they were last touched.
"""

import sqlalchemy as sa
from alembic import op

revision = "0087"
down_revision = "0085"

REASONS = "('price', 'competitor', 'no_budget', 'no_response', 'timing', 'not_a_fit', 'other')"


def upgrade() -> None:
    for table in ("leads", "deals"):
        op.add_column(table, sa.Column("lost_category", sa.String(30), nullable=True))
        op.add_column(table, sa.Column("lost_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "leads",
        sa.Column("lost_reason", sa.String(1000), nullable=False, server_default=""),
    )
    op.execute(
        "UPDATE deals SET lost_category = 'other', lost_at = updated_at WHERE stage = 'lost'"
    )
    op.execute(
        "UPDATE leads SET lost_category = coalesce(d.lost_category, 'other'),"
        " lost_reason = coalesce(d.lost_reason, ''),"
        " lost_at = coalesce(d.lost_at, leads.last_activity_at)"
        " FROM leads l LEFT JOIN deals d ON d.tenant_id = l.tenant_id AND d.lead_id = l.id"
        " WHERE leads.id = l.id AND leads.stage = 'lost'"
    )
    op.drop_constraint("deal_lost_reason", "deals", type_="check")
    for table in ("leads", "deals"):
        singular = table[:-1]
        op.create_check_constraint(
            f"{singular}_lost_category",
            table,
            f"lost_category IS NULL OR lost_category IN {REASONS}",
        )
        op.create_check_constraint(
            f"{singular}_lost_has_reason",
            table,
            "stage != 'lost' OR (lost_category IS NOT NULL AND lost_at IS NOT NULL)",
        )


def downgrade() -> None:
    for table in ("leads", "deals"):
        singular = table[:-1]
        op.drop_constraint(f"{singular}_lost_has_reason", table, type_="check")
        op.drop_constraint(f"{singular}_lost_category", table, type_="check")
    op.execute("UPDATE deals SET lost_reason = 'Other' WHERE stage = 'lost' AND lost_reason = ''")
    op.create_check_constraint(
        "deal_lost_reason", "deals", "stage != 'lost' OR length(trim(lost_reason)) > 0"
    )
    op.drop_column("leads", "lost_reason")
    for table in ("leads", "deals"):
        op.drop_column(table, "lost_at")
        op.drop_column(table, "lost_category")
