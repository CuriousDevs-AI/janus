"""HR records: every HR area, not only employees, leave and attendance.

Which kinds exist, and who may see each, is decided in the API (hr.service.SCOPES).
"""

from alembic import op

revision = "0044"
down_revision = "0043"


def upgrade() -> None:
    op.drop_constraint("ck_hr_records_kind", "hr_records", type_="check")
    op.create_check_constraint("ck_hr_records_kind", "hr_records", "kind ~ '^[a-z_]{2,24}$'")


def downgrade() -> None:
    op.execute("DELETE FROM hr_records WHERE kind NOT IN ('employee', 'leave', 'attendance')")
    op.drop_constraint("ck_hr_records_kind", "hr_records", type_="check")
    op.create_check_constraint(
        "ck_hr_records_kind", "hr_records", "kind IN ('employee', 'leave', 'attendance')"
    )
