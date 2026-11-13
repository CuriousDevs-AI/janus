"""A register of each company's documents that expire: registrations, licences, insurance and
trademarks, with their number and expiry date. Per company under row-level security; the worker
reads it for red alerts, as a document that has expired turns the company red.
"""

import sqlalchemy as sa
from alembic import op

revision = "0058"
down_revision = "0057"


def upgrade() -> None:
    op.create_table(
        "company_documents",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("number", sa.String(80)),
        sa.Column("issued_on", sa.Date()),
        sa.Column("expires_on", sa.Date()),
        sa.Column("notes", sa.String(400)),
        sa.Column("updated_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint(
            "kind IN ('registration', 'licence', 'insurance', 'trademark', 'contract', 'other')",
            name="ck_company_documents_kind",
        ),
    )
    op.create_index("ix_company_documents_tenant", "company_documents", ["tenant_id"])
    op.execute("ALTER TABLE company_documents ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE company_documents FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_access ON company_documents "
        "USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant())"
    )
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON company_documents TO janus_app")
    op.execute("GRANT SELECT ON company_documents TO janus_worker")


def downgrade() -> None:
    op.drop_table("company_documents")
