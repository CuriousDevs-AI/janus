"""HR on the server: employees, leave and attendance, each record with who it is about and who
may approve it, so the API decides what each person may see."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0043"
down_revision = "0042"


def upgrade() -> None:
    op.create_table(
        "hr_records",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("kind", sa.String(12), nullable=False),
        sa.Column("key", sa.String(80), nullable=False),
        sa.Column("subject", sa.String(80), nullable=False),
        sa.Column(
            "approvers", postgresql.ARRAY(sa.String(80)), server_default="{}", nullable=False
        ),
        sa.Column("data", postgresql.JSONB(), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("updated_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("tenant_id", "kind", "key", name="uq_hr_records_key"),
        sa.CheckConstraint(
            "kind IN ('employee', 'leave', 'attendance')", name="ck_hr_records_kind"
        ),
    )
    op.create_index("ix_hr_records_tenant_id", "hr_records", ["tenant_id"])
    op.create_index("ix_hr_records_subject", "hr_records", ["subject"])
    op.execute("ALTER TABLE hr_records ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE hr_records FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_access ON hr_records USING (tenant_id = app_tenant()) "
        "WITH CHECK (tenant_id = app_tenant())"
    )


def downgrade() -> None:
    op.drop_table("hr_records")
