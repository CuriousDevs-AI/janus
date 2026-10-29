from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from janus_api.core.db import Base


class Project(Base):
    """A project on the server. Its status is one of the four the screens show."""

    __tablename__ = "projects"
    __table_args__ = (
        UniqueConstraint("tenant_id", "external_key"),
        Index("ix_projects_tenant_id", "tenant_id"),
        CheckConstraint(
            "status IN ('planned', 'active', 'on hold', 'done')", name="ck_projects_status"
        ),
        CheckConstraint("budget >= 0", name="ck_projects_budget"),
        CheckConstraint("end_on >= start_on", name="ck_projects_dates"),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    external_key: Mapped[str] = mapped_column(String(80))
    name: Mapped[str] = mapped_column(String(160))
    client: Mapped[str] = mapped_column(String(160))
    owner_user_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(20))
    budget: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    start_on: Mapped[date] = mapped_column(Date)
    end_on: Mapped[date] = mapped_column(Date)
    created_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
