"""Payslips kept by the monthly payroll run, one per person per month, so later months know what
was paid and the TDS already deducted. Per company under row-level security; never changed once
kept.
"""

import sqlalchemy as sa
from alembic import op

revision = "0074"
down_revision = "0073"


def upgrade() -> None:
    money = [
        sa.Column(name, sa.BigInteger(), nullable=False)
        for name in (
            "basic_paise",
            "hra_paise",
            "special_paise",
            "gross_paise",
            "pf_paise",
            "esi_paise",
            "pt_paise",
        )
    ]
    op.create_table(
        "hr_payslips",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("month", sa.Date(), nullable=False),
        sa.Column("employee_key", sa.String(80), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("pan", sa.String(10)),
        sa.Column("paid_days", sa.Integer(), nullable=False),
        sa.Column("total_days", sa.Integer(), nullable=False),
        *money,
        sa.Column("tds_paise", sa.BigInteger()),
        sa.Column("net_paise", sa.BigInteger(), nullable=False),
        sa.Column("note", sa.String(400)),
        sa.Column("run_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("tenant_id", "month", "employee_key"),
        sa.CheckConstraint("extract(day FROM month) = 1", name="ck_hr_payslips_month"),
        sa.CheckConstraint(
            "paid_days BETWEEN 1 AND total_days AND gross_paise > 0", name="ck_hr_payslips_pay"
        ),
    )
    op.create_index("ix_hr_payslips_tenant_id", "hr_payslips", ["tenant_id"])
    op.execute("ALTER TABLE hr_payslips ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE hr_payslips FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_access ON hr_payslips "
        "USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant())"
    )
    op.execute("GRANT SELECT, INSERT ON hr_payslips TO janus_app")


def downgrade() -> None:
    op.drop_table("hr_payslips")
