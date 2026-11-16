"""Follow-ups on a lead: what was said, by whom, and when to call next.

A salesperson writes down each call or meeting and sets the next follow-up. The lead keeps the next
date, so a lead someone has agreed to call next week is not "gone quiet" today.
"""

import sqlalchemy as sa
from alembic import op

revision = "0085"
down_revision = "0084"


def upgrade() -> None:
    op.add_column("leads", sa.Column("next_follow_up_on", sa.Date(), nullable=True))
    op.create_table(
        "lead_notes",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("lead_id", sa.BigInteger(), nullable=False),
        sa.Column("author_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("body", sa.String(2000), nullable=False),
        sa.Column("next_follow_up_on", sa.Date(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id", "lead_id"], ["leads.tenant_id", "leads.id"], ondelete="CASCADE"
        ),
    )
    op.create_index("ix_lead_notes_lead", "lead_notes", ["tenant_id", "lead_id"])
    op.execute("ALTER TABLE lead_notes ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE lead_notes FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_access ON lead_notes USING (tenant_id = app_tenant()) "
        "WITH CHECK (tenant_id = app_tenant())"
    )
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON lead_notes TO janus_app")


def downgrade() -> None:
    op.drop_table("lead_notes")
    op.drop_column("leads", "next_follow_up_on")
