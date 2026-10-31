from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from janus_api.core.db import Base


class HrRecord(Base):
    """One HR record (an employee, a leave request, a day's attendance), as the HR screens hold it.

    `subject` is the employee the record is about and `approvers` the employees who may decide on
    it; the server uses both to decide who may read or change the record, so a person only ever
    receives what they are allowed to see. `version` rises with each save, and a save based on an
    older version is refused rather than written over newer data.
    """

    __tablename__ = "hr_records"
    __table_args__ = (
        UniqueConstraint("tenant_id", "kind", "key", name="uq_hr_records_key"),
        CheckConstraint("kind IN ('employee', 'leave', 'attendance')", name="ck_hr_records_kind"),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"), index=True)
    kind: Mapped[str] = mapped_column(String(12))
    key: Mapped[str] = mapped_column(String(80))
    subject: Mapped[str] = mapped_column(String(80), index=True)
    approvers: Mapped[list[str]] = mapped_column(ARRAY(String(80)), server_default="{}")
    data: Mapped[dict[str, Any]] = mapped_column(JSONB)
    version: Mapped[int] = mapped_column(Integer, server_default="1")
    updated_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
