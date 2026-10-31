"""HR record kinds are up to 24 characters (payroll_issue, candidate_detail); the column held 12."""

import sqlalchemy as sa
from alembic import op

revision = "0045"
down_revision = "0044"


def upgrade() -> None:
    op.alter_column("hr_records", "kind", type_=sa.String(24), existing_nullable=False)


def downgrade() -> None:
    op.alter_column("hr_records", "kind", type_=sa.String(12), existing_nullable=False)
