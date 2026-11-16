"""Composite index on deals(tenant_id, id) for cursor pagination.

The deals list query filters on tenant_id and paginates with id > after_id, ordered by id.
Without a composite index Postgres sorts all tenant rows on every page fetch; the index
lets it range-scan directly.
"""

from alembic import op

revision = "0091"
down_revision = "0090"


def upgrade() -> None:
    op.create_index("ix_deals_tenant_id_id", "deals", ["tenant_id", "id"])


def downgrade() -> None:
    op.drop_index("ix_deals_tenant_id_id", table_name="deals")
