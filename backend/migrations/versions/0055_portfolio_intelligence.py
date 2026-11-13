"""Janus Intelligence across the Portfolio: each person's questions and answers, and what Janus
knows about each company (facts the owner approved, and passages of documents they added).

Questions are the asker's alone (row-level security on app.user_id). Knowledge is per company
(row-level security on app.tenant_id) and is searched with Postgres full-text search, so finding
the passages that answer a question needs no model and costs nothing.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0055"
down_revision = "0054"


def upgrade() -> None:
    op.create_table(
        "portfolio_questions",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("key_tenant_id", sa.BigInteger()),
        sa.Column("model", sa.String(200), nullable=False),
        sa.Column("question", sa.String(2000), nullable=False),
        sa.Column("answer", sa.String(8000), nullable=False),
        sa.Column("sources", JSONB(), nullable=False, server_default="[]"),
        sa.Column("cost_usd", sa.Numeric(20, 10)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("ix_portfolio_questions_user", "portfolio_questions", ["user_id", "id"])
    op.execute("ALTER TABLE portfolio_questions ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE portfolio_questions FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY own_questions ON portfolio_questions "
        "USING (user_id = app_user()) WITH CHECK (user_id = app_user())"
    )
    op.execute("GRANT SELECT, INSERT, DELETE ON portfolio_questions TO janus_app")

    op.create_table(
        "portfolio_knowledge",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("status", sa.String(10), nullable=False, server_default="approved"),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("body", sa.String(4000), nullable=False),
        sa.Column("document", sa.String(40)),
        sa.Column("passage", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_by", sa.BigInteger(), sa.ForeignKey("users.id")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint("kind IN ('fact', 'document')", name="ck_knowledge_kind"),
        sa.CheckConstraint("status IN ('approved', 'suggested')", name="ck_knowledge_status"),
    )
    op.create_index("ix_portfolio_knowledge_tenant", "portfolio_knowledge", ["tenant_id"])
    op.execute(
        "CREATE INDEX ix_portfolio_knowledge_search ON portfolio_knowledge USING gin "
        "(to_tsvector('simple', title || ' ' || body))"
    )
    op.execute("ALTER TABLE portfolio_knowledge ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE portfolio_knowledge FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_access ON portfolio_knowledge "
        "USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant())"
    )
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON portfolio_knowledge TO janus_app")


def downgrade() -> None:
    op.drop_table("portfolio_knowledge")
    op.drop_table("portfolio_questions")
