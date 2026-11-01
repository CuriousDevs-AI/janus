from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import BigInteger, Boolean, Date, DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from janus_api.core.db import Base


class PortfolioDigest(Base):
    """One person's weekly Portfolio email: on or off, and when it is next due."""

    __tablename__ = "portfolio_digests"
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), unique=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    next_due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PortfolioTarget(Base):
    """A company's monthly target for one measure: leads, value won or money collected."""

    __tablename__ = "portfolio_targets"
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    metric: Mapped[str] = mapped_column(String(20))
    monthly: Mapped[Decimal] = mapped_column(Numeric(16, 2))
    updated_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ComplianceProfile(Base):
    """Which statutory filings apply to a company."""

    __tablename__ = "compliance_profiles"
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"), unique=True)
    gstin: Mapped[str | None] = mapped_column(String(15))
    gst_filing: Mapped[str] = mapped_column(String(10), default="none")
    tds: Mapped[bool] = mapped_column(Boolean, default=False)
    pf_esi: Mapped[bool] = mapped_column(Boolean, default=False)
    company: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ComplianceFiling(Base):
    """A filing marked done: its calendar key (gstr3b_2026-10) and the day it was filed."""

    __tablename__ = "compliance_filings"
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    item_key: Mapped[str] = mapped_column(String(40))
    filed_on: Mapped[date] = mapped_column(Date)
    filed_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
