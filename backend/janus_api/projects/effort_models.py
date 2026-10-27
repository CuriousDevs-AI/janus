from datetime import date
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from janus_api.core.db import Base


class ProjectTimesheet(Base):
    """Hours a person worked on a project on a day. Entered, never estimated."""

    __tablename__ = "project_timesheets"
    __table_args__ = (
        Index("ix_project_timesheets_project", "project_id"),
        CheckConstraint("hours > 0 AND hours <= 12", name="ck_timesheets_hours"),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    project_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("projects.id"))
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    work_on: Mapped[date] = mapped_column(Date)
    hours: Mapped[Decimal] = mapped_column(Numeric(4, 2))
    note: Mapped[str] = mapped_column(String(300), server_default="")
    logged_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))


class ProjectAllocation(Base):
    __tablename__ = "project_allocations"
    __table_args__ = (
        UniqueConstraint("project_id", "user_id"),
        CheckConstraint("percent >= 0 AND percent <= 100", name="ck_allocations_percent"),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    project_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("projects.id"))
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    percent: Mapped[int] = mapped_column(Integer)


class ProjectChange(Base):
    """A change to a project's budget or end date, approved by someone other than the requester."""

    __tablename__ = "project_change_requests"
    __table_args__ = (
        CheckConstraint("status IN ('pending', 'approved', 'rejected')", name="ck_changes_status"),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    project_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("projects.id"))
    description: Mapped[str] = mapped_column(String(300))
    budget_change: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    day_change: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(10))
    requested_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    decided_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
