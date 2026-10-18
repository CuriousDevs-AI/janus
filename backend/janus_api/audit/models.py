from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from janus_api.core.db import Base


class AuditLog(Base):
    __tablename__ = "audit_log"
    tenant_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("tenants.id"), index=True)
    user_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"), index=True)
    action: Mapped[str]
    ip: Mapped[str | None]
    details: Mapped[dict[str, str | int | bool]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
