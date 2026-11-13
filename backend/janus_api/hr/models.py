from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
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
        # The kinds and their access live in hr.service.SCOPES; the database keeps the names tidy.
        CheckConstraint("kind ~ '^[a-z_]{2,24}$'", name="ck_hr_records_kind"),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"), index=True)
    kind: Mapped[str] = mapped_column(String(24))
    key: Mapped[str] = mapped_column(String(80))
    subject: Mapped[str] = mapped_column(String(80), index=True)
    approvers: Mapped[list[str]] = mapped_column(ARRAY(String(80)), server_default="{}")
    data: Mapped[dict[str, Any]] = mapped_column(JSONB)
    version: Mapped[int] = mapped_column(Integer, server_default="1")
    updated_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class HrPayslip(Base):
    """One person's payslip for one month of a payroll run, in paise: kept once the month is run,
    so later months know what was paid and deducted. `tds_paise` is None where TDS is left to the
    accountant (the old tax regime)."""

    __tablename__ = "hr_payslips"
    __table_args__ = (UniqueConstraint("tenant_id", "month", "employee_key"),)
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"), index=True)
    month: Mapped[date] = mapped_column(Date)
    employee_key: Mapped[str] = mapped_column(String(80))
    name: Mapped[str] = mapped_column(String(160))
    pan: Mapped[str | None] = mapped_column(String(10))
    paid_days: Mapped[int] = mapped_column(Integer)
    total_days: Mapped[int] = mapped_column(Integer)
    basic_paise: Mapped[int] = mapped_column(BigInteger)
    hra_paise: Mapped[int] = mapped_column(BigInteger)
    special_paise: Mapped[int] = mapped_column(BigInteger)
    gross_paise: Mapped[int] = mapped_column(BigInteger)
    pf_paise: Mapped[int] = mapped_column(BigInteger)
    esi_paise: Mapped[int] = mapped_column(BigInteger)
    pt_paise: Mapped[int] = mapped_column(BigInteger)
    tds_paise: Mapped[int | None] = mapped_column(BigInteger)
    net_paise: Mapped[int] = mapped_column(BigInteger)
    note: Mapped[str | None] = mapped_column(String(400))
    run_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
