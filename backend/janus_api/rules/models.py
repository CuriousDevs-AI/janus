from datetime import date
from decimal import Decimal

from sqlalchemy import BigInteger, CheckConstraint, Date, ForeignKey, Numeric, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from janus_api.core.db import Base


class CompanyRules(Base):
    """One row per company: the period lock and the approval and matching rules the owner sets."""

    __tablename__ = "company_rules"
    __table_args__ = (
        UniqueConstraint("tenant_id"),
        CheckConstraint("adjustment_approval_value_paise >= 0", name="ck_company_rules_approval"),
        CheckConstraint(
            "match_tolerance_percent >= 0 AND match_tolerance_percent <= 10",
            name="ck_company_rules_tolerance",
        ),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    locked_through: Mapped[date | None] = mapped_column(Date)
    adjustment_approval_value_paise: Mapped[int] = mapped_column(BigInteger, default=1000000)
    match_tolerance_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal(2))
