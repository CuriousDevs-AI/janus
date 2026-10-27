from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from janus_api.core.db import Base


class VendorBankAccount(Base):
    """A vendor's bank account. The full number is stored encrypted and never returned by the API;
    only the last four digits are shown. A change takes effect once someone other than the requester
    approves it."""

    __tablename__ = "vendor_bank_accounts"
    __table_args__ = (Index("ix_vendor_bank_accounts_tenant_id", "tenant_id"),)
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    vendor_id: Mapped[str] = mapped_column(String(80))
    vendor_name: Mapped[str] = mapped_column(String(160))
    holder: Mapped[str] = mapped_column(String(160))
    account_last4: Mapped[str] = mapped_column(String(4))
    account_ciphertext: Mapped[str] = mapped_column(Text)
    ifsc: Mapped[str] = mapped_column(String(11))
    status: Mapped[str] = mapped_column(String(20), server_default=text("'pending'"))
    requested_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    approved_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
