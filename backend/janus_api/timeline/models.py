from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from janus_api.core.db import Base


class ProjectTimeline(Base):
    """The shared timeline of one project: its conversation and its record of what happened."""

    __tablename__ = "project_timelines"
    __table_args__ = (UniqueConstraint("tenant_id", "project_key"),)
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"), index=True)
    project_key: Mapped[str] = mapped_column(String(80))
    name: Mapped[str] = mapped_column(String(160))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ProjectTimelineMember(Base):
    __tablename__ = "project_timeline_members"
    __table_args__ = (UniqueConstraint("timeline_id", "user_id"),)
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"), index=True)
    timeline_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("project_timelines.id"))
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    added_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ProjectTimelineEntry(Base):
    """One item on a timeline. Events come from the modules; messages and decisions from people."""

    __tablename__ = "project_timeline_entries"
    __table_args__ = (Index("ix_project_timeline_entries_timeline", "timeline_id", "id"),)
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"), index=True)
    timeline_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("project_timelines.id"))
    kind: Mapped[str] = mapped_column(String(20))
    author_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    body: Mapped[str] = mapped_column(Text)
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
