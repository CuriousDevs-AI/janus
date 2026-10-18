"""CSV imports"""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"


def upgrade() -> None:
    op.drop_constraint("source_connection_kind", "source_connections", type_="check")
    op.create_check_constraint(
        "source_connection_kind",
        "source_connections",
        "kind IN ('webhook', 'embed', 'api_key', 'csv')",
    )
    op.create_table(
        "csv_imports",
        sa.Column("tenant_id", sa.BigInteger(), nullable=False),
        sa.Column("connection_id", sa.BigInteger(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("file_name", sa.String(length=120), nullable=False),
        sa.Column("file_hash", sa.String(length=64), nullable=False),
        sa.Column("total_rows", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.CheckConstraint("total_rows > 0 AND total_rows <= 1000"),
        sa.ForeignKeyConstraint(
            ["tenant_id", "connection_id"],
            ["source_connections.tenant_id", "source_connections.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "connection_id", "id"),
        sa.UniqueConstraint("tenant_id", "connection_id", "idempotency_key"),
    )
    op.create_index(op.f("ix_csv_imports_tenant_id"), "csv_imports", ["tenant_id"], unique=False)
    op.add_column("ingest_receipts", sa.Column("csv_import_id", sa.BigInteger(), nullable=True))
    op.add_column("ingest_receipts", sa.Column("row_number", sa.Integer(), nullable=True))
    op.create_index(
        op.f("ix_ingest_receipts_csv_import_id"), "ingest_receipts", ["csv_import_id"], unique=False
    )
    op.create_unique_constraint(
        "csv_receipt_row_unique", "ingest_receipts", ["csv_import_id", "row_number"]
    )
    op.create_foreign_key(
        "csv_receipt_import_fk",
        "ingest_receipts",
        "csv_imports",
        ["tenant_id", "connection_id", "csv_import_id"],
        ["tenant_id", "connection_id", "id"],
    )

    op.create_check_constraint(
        "csv_receipt_row_check",
        "ingest_receipts",
        "(csv_import_id IS NULL AND row_number IS NULL) OR "
        "(csv_import_id IS NOT NULL AND row_number IS NOT NULL AND row_number >= 2)",
    )
    op.execute("ALTER TABLE csv_imports ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE csv_imports FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_only ON csv_imports USING (tenant_id = app_tenant()) "
        "WITH CHECK (tenant_id = app_tenant())"
    )


def downgrade() -> None:
    # Refuse downgrade while CSV sources exist, rather than losing their import history.
    op.drop_constraint("source_connection_kind", "source_connections", type_="check")
    op.create_check_constraint(
        "source_connection_kind", "source_connections", "kind IN ('webhook', 'embed', 'api_key')"
    )
    op.drop_constraint("csv_receipt_row_check", "ingest_receipts", type_="check")
    op.drop_constraint("csv_receipt_import_fk", "ingest_receipts", type_="foreignkey")
    op.drop_constraint("csv_receipt_row_unique", "ingest_receipts", type_="unique")
    op.drop_index(op.f("ix_ingest_receipts_csv_import_id"), table_name="ingest_receipts")
    op.drop_column("ingest_receipts", "row_number")
    op.drop_column("ingest_receipts", "csv_import_id")
    op.drop_index(op.f("ix_csv_imports_tenant_id"), table_name="csv_imports")
    op.drop_table("csv_imports")
