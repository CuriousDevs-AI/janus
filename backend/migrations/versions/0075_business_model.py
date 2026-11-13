"""What kind of business a company runs: trading, a retail store, import and export, manufacturing,
services, warehousing, a holding company, or not trading yet. The Portfolio picks each company's
measures from it, so a holding company is not shown a sales chart. Empty until the Owner chooses.
"""

import sqlalchemy as sa
from alembic import op

revision = "0075"
down_revision = "0074"

MODELS = (
    "trading",
    "retail",
    "import_export",
    "manufacturing",
    "services",
    "warehousing",
    "holding",
    "not_started",
)


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("business_model", sa.String(20), nullable=False, server_default=""),
    )
    allowed = ", ".join(f"'{model}'" for model in ("", *MODELS))
    op.create_check_constraint(
        "ck_tenants_business_model", "tenants", f"business_model IN ({allowed})"
    )


def downgrade() -> None:
    op.drop_constraint("ck_tenants_business_model", "tenants", type_="check")
    op.drop_column("tenants", "business_model")
