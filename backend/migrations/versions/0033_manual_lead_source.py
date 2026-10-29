"""Manual lead entry: a source connection kind for leads typed in by a person."""

from alembic import op

revision = "0033"
down_revision = "0032"


def upgrade() -> None:
    op.drop_constraint("source_connection_kind", "source_connections", type_="check")
    op.create_check_constraint(
        "source_connection_kind",
        "source_connections",
        "kind IN ('webhook', 'embed', 'api_key', 'csv', 'oauth', 'manual')",
    )


def downgrade() -> None:
    op.execute(
        "DELETE FROM ingest_receipts WHERE connection_id IN "
        "(SELECT id FROM source_connections WHERE kind = 'manual')"
    )
    op.execute("DELETE FROM source_connections WHERE kind = 'manual'")
    op.drop_constraint("source_connection_kind", "source_connections", type_="check")
    op.create_check_constraint(
        "source_connection_kind",
        "source_connections",
        "kind IN ('webhook', 'embed', 'api_key', 'csv', 'oauth')",
    )
