from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from janus_api.core.db import Base


class WorkspaceState(Base):
    """One whole store document per company, such as the finance books or the vendor master.

    The browser writes a store as one document with an expected version, so two people
    saving at once cannot overwrite each other silently.
    """

    __tablename__ = "workspace_state"
    __table_args__ = (
        UniqueConstraint("tenant_id", "store_key"),
        Index("ix_workspace_state_tenant_id", "tenant_id"),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    store_key: Mapped[str] = mapped_column(String(80))
    data: Mapped[dict] = mapped_column(JSONB)
    version: Mapped[int] = mapped_column(Integer, default=1)
    updated_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
