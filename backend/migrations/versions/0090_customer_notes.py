"""Notes on customer records, and a GIN index for lead-note search.

A salesperson meeting a customer writes free-text notes on the customer record (contact).
Each note is timestamped and attributed to an author. The existing lead_notes table gets
a GIN trigram index so the leads endpoint can search follow-up note text.
"""

import sqlalchemy as sa
from alembic import op

revision = "0090"
down_revision = "0089"


def _secure(name: str) -> None:
    op.execute(f"ALTER TABLE {name} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {name} FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY tenant_access ON {name} USING (tenant_id = app_tenant()) "
        "WITH CHECK (tenant_id = app_tenant())"
    )
    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {name} TO janus_app")
    op.execute(f"GRANT SELECT ON {name} TO janus_worker")


def upgrade() -> None:
    op.create_table(
        "customer_notes",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("contact_id", sa.BigInteger(), nullable=False),
        sa.Column("author_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("body", sa.String(4000), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id", "contact_id"], ["contacts.tenant_id", "contacts.id"],
            ondelete="CASCADE",
        ),
    )
    op.create_index("ix_customer_notes_tenant_id", "customer_notes", ["tenant_id"])
    op.create_index(
        "ix_customer_notes_contact",
        "customer_notes",
        ["tenant_id", "contact_id"],
    )
    _secure("customer_notes")

    # Trigram index on lead_notes.body so lead search can match follow-up text.
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute(
        "CREATE INDEX ix_lead_notes_body_trgm ON lead_notes "
        "USING gin (body gin_trgm_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_lead_notes_body_trgm")
    op.drop_table("customer_notes")
