from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKeyConstraint,
    Index,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from janus_api.core.db import Base


class Job(Base):
    __tablename__ = "jobs"
    __table_args__ = (
        UniqueConstraint("tenant_id", "receipt_id"),
        ForeignKeyConstraint(
            ["tenant_id", "receipt_id"], ["ingest_receipts.tenant_id", "ingest_receipts.id"]
        ),
        CheckConstraint("status IN ('pending', 'done', 'failed')"),
        Index("ix_jobs_due", "available_at", "id", postgresql_where=text("status = 'pending'")),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, index=True)
    receipt_id: Mapped[int] = mapped_column(BigInteger)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    attempts: Mapped[int] = mapped_column(default=0)
    available_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    error_code: Mapped[str | None] = mapped_column(String(80))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
