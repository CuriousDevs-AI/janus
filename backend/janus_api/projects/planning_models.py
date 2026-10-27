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
)
from sqlalchemy.orm import Mapped, mapped_column

from janus_api.core.db import Base


class ProjectMilestone(Base):
    """A project milestone: planned, then done, then accepted by a different person."""

    __tablename__ = "project_milestones"
    __table_args__ = (
        UniqueConstraint("tenant_id", "external_key"),
        CheckConstraint("status IN ('planned', 'done', 'accepted')", name="ck_milestones_status"),
        CheckConstraint("amount >= 0", name="ck_milestones_amount"),
        Index("ix_project_milestones_project", "project_id"),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    project_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("projects.id"))
    external_key: Mapped[str] = mapped_column(String(80))
    name: Mapped[str] = mapped_column(String(160))
    due_on: Mapped[date] = mapped_column(Date)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    status: Mapped[str] = mapped_column(String(20))
    completed_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    accepted_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ProjectTask(Base):
    __tablename__ = "project_tasks"
    __table_args__ = (
        UniqueConstraint("tenant_id", "external_key"),
        CheckConstraint("status IN ('todo', 'doing', 'done')", name="ck_tasks_status"),
        Index("ix_project_tasks_project", "project_id"),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    project_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("projects.id"))
    milestone_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("project_milestones.id")
    )
    external_key: Mapped[str] = mapped_column(String(80))
    title: Mapped[str] = mapped_column(String(200))
    assignee_user_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    due_on: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(10))
