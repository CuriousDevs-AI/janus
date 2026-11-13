"""A company's contact details beside its registration: website, email, phone, city and state.

The people recorded with it (directors, founders and co-founders) stay in the same JSON list; each
now says which of those roles it holds, so no column changes for them.
"""

import sqlalchemy as sa
from alembic import op

revision = "0053"
down_revision = "0052"

COLUMNS = (
    ("website", 200),
    ("email", 320),
    ("phone", 32),
    ("city", 80),
    ("state", 40),
)


def upgrade() -> None:
    for name, size in COLUMNS:
        op.add_column("company_registrations", sa.Column(name, sa.String(size)))


def downgrade() -> None:
    for name, _ in COLUMNS:
        op.drop_column("company_registrations", name)
