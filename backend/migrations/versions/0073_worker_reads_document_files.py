"""The worker's red alerts and weekly email read the Portfolio summary, which names each
document's file. The worker may read a file's name and size, never its bytes.
"""

from alembic import op

revision = "0073"
down_revision = "0072"

COLUMNS = "id, tenant_id, document_id, filename, content_type, size_bytes, uploaded_by, uploaded_at"


def upgrade() -> None:
    op.execute(f"GRANT SELECT ({COLUMNS}) ON company_document_files TO janus_worker")


def downgrade() -> None:
    op.execute(f"REVOKE SELECT ({COLUMNS}) ON company_document_files FROM janus_worker")
