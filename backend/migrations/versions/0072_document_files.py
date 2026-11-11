"""The file of a company document (the licence, policy or certificate itself: PDF or image, up to
5 MB), kept in its row under row-level security like Team Chat attachments. One per document.
"""

import sqlalchemy as sa
from alembic import op

revision = "0072"
down_revision = "0071"


def upgrade() -> None:
    op.create_table(
        "company_document_files",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column(
            "document_id",
            sa.BigInteger(),
            sa.ForeignKey("company_documents.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("filename", sa.String(200), nullable=False),
        sa.Column("content_type", sa.String(100), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column("uploaded_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "uploaded_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint(
            "size_bytes BETWEEN 1 AND 5242880", name="ck_company_document_files_size"
        ),
        sa.CheckConstraint(
            "content_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')",
            name="ck_company_document_files_type",
        ),
    )
    op.create_index("ix_company_document_files_tenant_id", "company_document_files", ["tenant_id"])
    op.execute("ALTER TABLE company_document_files ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE company_document_files FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_access ON company_document_files "
        "USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant())"
    )
    op.execute("GRANT SELECT, INSERT, DELETE ON company_document_files TO janus_app")


def downgrade() -> None:
    op.drop_table("company_document_files")
