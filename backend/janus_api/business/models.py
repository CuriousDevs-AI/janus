from datetime import datetime

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
    settings: Mapped[dict] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
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
    configuration: Mapped[dict] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
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
    trigger: Mapped[dict] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    actions: Mapped[list] = mapped_column(JSONB, server_default=text("'[]'::jsonb"))
    status: Mapped[str] = mapped_column(String(20), server_default="draft")
    requires_approval: Mapped[bool] = mapped_column(server_default="true")
    created_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AutomationExecution(Base):
    __tablename__ = "automation_executions"
    __table_args__ = (Index("ix_automation_executions_tenant_id", "tenant_id"),)
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    workflow_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("automation_workflows.id"))
    status: Mapped[str] = mapped_column(String(20), server_default="pending")
    event: Mapped[dict] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    result: Mapped[dict] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    approved_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
