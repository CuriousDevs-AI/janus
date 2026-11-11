from datetime import date, datetime

from sqlalchemy import BigInteger, Boolean, Date, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from janus_api.core.db import Base


class AccountPlan(Base):
    """A person's plan: which one, since when, and when it renews."""

    __tablename__ = "account_plans"
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), unique=True)
    plan: Mapped[str] = mapped_column(String(20))
    started_on: Mapped[date] = mapped_column(Date)
    renews_on: Mapped[date | None] = mapped_column(Date)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AccountInvoice(Base):
    """An invoice to a person's account for one month of a plan. Amounts are in paise."""

    __tablename__ = "account_invoices"
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    number: Mapped[str] = mapped_column(String(20))
    plan: Mapped[str] = mapped_column(String(20))
    issued_on: Mapped[date] = mapped_column(Date)
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    amount_paise: Mapped[int] = mapped_column(BigInteger)
    gst_paise: Mapped[int] = mapped_column(BigInteger)
    total_paise: Mapped[int] = mapped_column(BigInteger)
    status: Mapped[str] = mapped_column(String(10))
    paid_on: Mapped[date | None] = mapped_column(Date)
    # Made for testing (no payment provider is connected), and shown as such.
    sample: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
