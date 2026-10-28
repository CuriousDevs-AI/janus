from datetime import date

from sqlalchemy import BigInteger, CheckConstraint, Date, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from janus_api.core.db import Base


class ITChange(Base):
    """An IT change request. The requester cannot decide it; approved changes are carried out."""

    __tablename__ = "it_changes"
    __table_args__ = (
        UniqueConstraint("tenant_id", "number"),
        CheckConstraint("risk IN ('low', 'medium', 'high')", name="ck_it_changes_risk"),
        CheckConstraint(
            "status IN ('pending', 'approved', 'rejected', 'done')", name="ck_it_changes_status"
        ),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    number: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(200))
    risk: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(10))
    requested_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    decided_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    raised_on: Mapped[date] = mapped_column(Date)
