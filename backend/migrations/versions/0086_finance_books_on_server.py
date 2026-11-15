"""Finance records that lived only in one browser, now kept on the server.

Expenses, petty cash top-ups, bank movements not in the books, opening cash and share capital,
month-end sign-offs and quarterly budget plans were saved in the browser that entered them, so they
were lost on another device and never reached profit, cash or the owner's figures. Bank statement
lines were already on the server for the cash position; a line now also records the payment it was
matched to in reconciliation.
"""

import sqlalchemy as sa
from alembic import op

revision = "0086"
down_revision = "0085"

TABLES = (
    "finance_expenses",
    "finance_petty_cash_top_ups",
    "finance_bank_movements",
    "finance_settings",
    "finance_close_reviews",
    "finance_budget_plans",
)


def _secure(name: str) -> None:
    op.execute(f"ALTER TABLE {name} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {name} FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY tenant_access ON {name} USING (tenant_id = app_tenant()) "
        "WITH CHECK (tenant_id = app_tenant())"
    )
    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {name} TO janus_app")


def _base(name: str, *columns: sa.Column, constraints: tuple[sa.Constraint, ...] = ()) -> None:
    op.create_table(
        name,
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        *columns,
        *constraints,
    )
    op.create_index(f"ix_{name}_tenant_id", name, ["tenant_id"])
    _secure(name)


def _when() -> sa.Column:
    return sa.Column(
        "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
    )


def _by(name: str = "created_by") -> sa.Column:
    return sa.Column(name, sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False)


def upgrade() -> None:
    _base(
        "finance_expenses",
        sa.Column("spent_on", sa.Date(), nullable=False),
        sa.Column("category", sa.String(40), nullable=False),
        sa.Column("payee", sa.String(160), nullable=False),
        sa.Column("amount_paise", sa.BigInteger(), nullable=False),
        sa.Column("gst_rate", sa.Integer(), nullable=False),
        sa.Column("paid_from", sa.String(20), nullable=False),
        _by(),
        _when(),
        constraints=(
            sa.CheckConstraint("amount_paise > 0", name="ck_finance_expenses_amount"),
            sa.CheckConstraint("gst_rate BETWEEN 0 AND 28", name="ck_finance_expenses_gst"),
            sa.CheckConstraint(
                "paid_from IN ('bank', 'petty cash')", name="ck_finance_expenses_paid_from"
            ),
        ),
    )
    _base(
        "finance_petty_cash_top_ups",
        sa.Column("topped_on", sa.Date(), nullable=False),
        sa.Column("amount_paise", sa.BigInteger(), nullable=False),
        _by(),
        _when(),
        constraints=(sa.CheckConstraint("amount_paise > 0", name="ck_finance_petty_cash_amount"),),
    )
    _base(
        "finance_bank_movements",
        sa.Column("moved_on", sa.Date(), nullable=False),
        sa.Column("description", sa.String(200), nullable=False),
        sa.Column("amount_paise", sa.BigInteger(), nullable=False),
        _by(),
        _when(),
        constraints=(
            sa.CheckConstraint("amount_paise <> 0", name="ck_finance_bank_movements_amount"),
        ),
    )
    _base(
        "finance_settings",
        sa.Column("opening_cash_paise", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("share_capital_paise", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        constraints=(sa.UniqueConstraint("tenant_id", name="uq_finance_settings_tenant"),),
    )
    _base(
        "finance_close_reviews",
        sa.Column("month", sa.String(7), nullable=False),
        sa.Column("item", sa.String(40), nullable=False),
        _by("reviewed_by"),
        _when(),
        constraints=(
            sa.UniqueConstraint("tenant_id", "month", "item", name="uq_finance_close_reviews"),
        ),
    )
    _base(
        "finance_budget_plans",
        sa.Column("line_key", sa.String(80), nullable=False),
        sa.Column("fiscal_year", sa.String(9), nullable=False),
        sa.Column("quarter", sa.Integer(), nullable=False),
        sa.Column("planned_paise", sa.BigInteger(), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        constraints=(
            sa.UniqueConstraint(
                "tenant_id", "line_key", "fiscal_year", "quarter", name="uq_finance_budget_plans"
            ),
            sa.CheckConstraint("quarter BETWEEN 1 AND 4", name="ck_finance_budget_plans_quarter"),
            sa.CheckConstraint("planned_paise >= 0", name="ck_finance_budget_plans_planned"),
        ),
    )
    op.add_column("finance_bank_lines", sa.Column("matched_key", sa.String(120), nullable=True))


def downgrade() -> None:
    op.drop_column("finance_bank_lines", "matched_key")
    for name in reversed(TABLES):
        op.drop_table(name)
