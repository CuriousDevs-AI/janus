from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from janus_api.core.db import Base


class FinanceBudgetLine(Base):
    """A budget line in paise (1/100 rupee). drawn_paise is the running total and is only changed
    inside the transaction that also writes the draw or release row."""

    __tablename__ = "finance_budget_lines"
    __table_args__ = (
        UniqueConstraint("tenant_id", "external_key"),
        CheckConstraint("allocated_paise >= 0", name="ck_budget_allocated"),
        CheckConstraint("drawn_paise >= 0", name="ck_budget_drawn"),
        CheckConstraint("drawn_paise <= allocated_paise", name="ck_budget_within_allocation"),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    external_key: Mapped[str] = mapped_column(String(80))
    name: Mapped[str] = mapped_column(String(160))
    owner_name: Mapped[str] = mapped_column(String(160))
    allocated_paise: Mapped[int] = mapped_column(BigInteger)
    drawn_paise: Mapped[int] = mapped_column(BigInteger, default=0)


class FinanceBudgetMovement(Base):
    """A draw (positive) or a release (negative) against a budget line. The idempotency key makes a
    retried request return the first result instead of moving money twice."""

    __tablename__ = "finance_budget_movements"
    __table_args__ = (
        UniqueConstraint("tenant_id", "idempotency_key"),
        CheckConstraint("amount_paise <> 0", name="ck_movements_amount"),
        CheckConstraint("kind IN ('draw', 'release', 'allocation')", name="ck_movements_kind"),
        CheckConstraint(
            "(kind = 'release' AND amount_paise < 0)"
            " OR (kind IN ('draw', 'allocation') AND amount_paise > 0)",
            name="ck_movements_sign",
        ),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    kind: Mapped[str] = mapped_column(String(12), server_default="draw")
    line_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("finance_budget_lines.id"))
    amount_paise: Mapped[int] = mapped_column(BigInteger)
    note: Mapped[str] = mapped_column(String(300), default="")
    booked_on: Mapped[date] = mapped_column(Date)
    created_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    idempotency_key: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
