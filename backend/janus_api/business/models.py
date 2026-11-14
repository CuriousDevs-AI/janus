from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from janus_api.core.db import Base


class BusinessWorkspace(Base):
    __tablename__ = "business_workspaces"
    __table_args__ = (
        UniqueConstraint("tenant_id", "workspace_type"),
        UniqueConstraint("tenant_id", "id"),
        Index("ix_business_workspaces_tenant_id", "tenant_id"),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    workspace_type: Mapped[str] = mapped_column(String(40))
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(String(1000), default="")
    status: Mapped[str] = mapped_column(String(20), server_default="active")
    settings: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    created_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class WorkspaceMember(Base):
    __tablename__ = "business_workspace_members"
    __table_args__ = (
        UniqueConstraint("workspace_id", "membership_id"),
        Index("ix_business_workspace_members_tenant_id", "tenant_id"),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    workspace_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("business_workspaces.id"))
    membership_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("memberships.id"))
    access_level: Mapped[str] = mapped_column(String(20), server_default="member")
    permissions: Mapped[list[str]] = mapped_column(ARRAY(String), server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AgentDefinition(Base):
    __tablename__ = "business_agents"
    __table_args__ = (UniqueConstraint("tenant_id", "agent_key"),)
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    workspace_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("business_workspaces.id")
    )
    agent_key: Mapped[str] = mapped_column(String(80))
    name: Mapped[str] = mapped_column(String(160))
    department: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(20), server_default="draft")
    configuration: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AutomationFolder(Base):
    """A folder the company files its workflows in. Deleting it leaves its workflows unfiled."""

    __tablename__ = "automation_folders"
    __table_args__ = (UniqueConstraint("tenant_id", "name", name="uq_automation_folders_name"),)
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AutomationWorkflow(Base):
    __tablename__ = "automation_workflows"
    __table_args__ = (UniqueConstraint("tenant_id", "name"),)
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    workspace_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("business_workspaces.id")
    )
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(String(1000), default="")
    folder_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("automation_folders.id", ondelete="SET NULL")
    )
    trigger: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    actions: Mapped[list[Any]] = mapped_column(JSONB, server_default=text("'[]'::jsonb"))
    status: Mapped[str] = mapped_column(String(20), server_default="draft")
    requires_approval: Mapped[bool] = mapped_column(server_default="true")
    created_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AutomationExecution(Base):
    __tablename__ = "automation_executions"
    __table_args__ = (
        Index("ix_automation_executions_tenant_id", "tenant_id"),
        # The runs the worker still has to carry out.
        Index(
            "ix_automation_executions_due",
            "id",
            postgresql_where=text("status IN ('queued', 'approved')"),
        ),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    workflow_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("automation_workflows.id"))
    status: Mapped[str] = mapped_column(String(20), server_default="pending")
    event: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    result: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    approved_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class SavedReport(Base):
    """A library report kept under the business's own name, with the period it opens on. Everyone
    in the business who can read reports sees it."""

    __tablename__ = "business_saved_reports"
    __table_args__ = (Index("ix_business_saved_reports_tenant_id", "tenant_id"),)
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    name: Mapped[str] = mapped_column(String(80))
    report: Mapped[str] = mapped_column(String(40))
    period: Mapped[str] = mapped_column(String(10), default="month")
    note: Mapped[str] = mapped_column(String(300), default="")
    created_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ReportPins(Base):
    """The library reports one person keeps at the top, in one business."""

    __tablename__ = "business_report_pins"
    __table_args__ = (UniqueConstraint("tenant_id", "user_id"),)
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    reports: Mapped[list[str]] = mapped_column(JSONB, default=list)


class ReportSchedule(Base):
    """A report emailed to members of the business on a schedule. Each recipient gets the figures
    their own role may see, read when it is sent."""

    __tablename__ = "business_report_schedules"
    __table_args__ = (Index("ix_business_report_schedules_tenant_id", "tenant_id"),)
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    report: Mapped[str] = mapped_column(String(40))
    period: Mapped[str] = mapped_column(String(10), default="month")
    # daily, weekly (Mondays) or monthly (the 1st), at 9 in the morning in India.
    frequency: Mapped[str] = mapped_column(String(10))
    # User ids; only those still active members when it is sent receive it.
    recipients: Mapped[list[int]] = mapped_column(JSONB, default=list)
    paused: Mapped[bool] = mapped_column(default=False)
    next_due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Why the last send did not reach everyone, in words for the page.
    last_problem: Mapped[str | None] = mapped_column(String(500))
    created_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
