from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from janus_api.core.db import Base


class OpsItem(Base):
    """An item in the item master. Its key is the id the screen gives it, so ids stay the same."""

    __tablename__ = "ops_items"
    __table_args__ = (
        UniqueConstraint("tenant_id", "item_key"),
        UniqueConstraint("tenant_id", "sku"),
        CheckConstraint("rate_paise >= 0", name="ck_ops_items_rate"),
        CheckConstraint("gst_rate >= 0 AND gst_rate <= 28", name="ck_ops_items_gst"),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    item_key: Mapped[str] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(160))
    sku: Mapped[str] = mapped_column(String(64))
    unit: Mapped[str] = mapped_column(String(20))
    hsn: Mapped[str] = mapped_column(String(8))
    rate_paise: Mapped[int] = mapped_column(BigInteger)
    gst_rate: Mapped[int] = mapped_column(Integer)
    reorder_level: Mapped[Decimal] = mapped_column(Numeric(12, 3))
    track_batch: Mapped[bool] = mapped_column(Boolean)


class OpsBatch(Base):
    __tablename__ = "ops_batches"
    __table_args__ = (
        UniqueConstraint("tenant_id", "batch_key"),
        UniqueConstraint("tenant_id", "item_id", "batch_no"),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    batch_key: Mapped[str] = mapped_column(String(64))
    item_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("ops_items.id"))
    batch_no: Mapped[str] = mapped_column(String(64))
    expiry: Mapped[date] = mapped_column(Date)


class OpsMovement(Base):
    """A change to stock on hand. Stock is the sum of these rows for an item, location and batch."""

    __tablename__ = "ops_movements"
    __table_args__ = (
        UniqueConstraint("tenant_id", "move_key"),
        UniqueConstraint("tenant_id", "idempotency_key"),
        CheckConstraint("qty <> 0", name="ck_ops_movements_qty"),
        CheckConstraint("kind IN ('receipt', 'adjustment')", name="ck_ops_movements_kind"),
        CheckConstraint(
            "(kind = 'receipt' AND qty > 0) OR kind = 'adjustment'", name="ck_ops_movements_sign"
        ),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    move_key: Mapped[str] = mapped_column(String(64))
    item_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("ops_items.id"))
    location_id: Mapped[int] = mapped_column(Integer)
    batch_no: Mapped[str | None] = mapped_column(String(64))
    kind: Mapped[str] = mapped_column(String(12))
    qty: Mapped[Decimal] = mapped_column(Numeric(12, 3))
    reason: Mapped[str] = mapped_column(String(300))
    booked_on: Mapped[date] = mapped_column(Date)
    recorded_by_name: Mapped[str] = mapped_column(String(160))
    idempotency_key: Mapped[str | None] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class OpsAdjustment(Base):
    """A stock adjustment. Above the approval value, another person approves it."""

    __tablename__ = "ops_adjustments"
    __table_args__ = (
        UniqueConstraint("tenant_id", "idempotency_key"),
        CheckConstraint("qty <> 0", name="ck_ops_adjustments_qty"),
        CheckConstraint("value_paise >= 0", name="ck_ops_adjustments_value"),
        CheckConstraint(
            "status IN ('pending', 'applied', 'rejected')", name="ck_ops_adjustments_status"
        ),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    item_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("ops_items.id"))
    location_id: Mapped[int] = mapped_column(Integer)
    batch_no: Mapped[str | None] = mapped_column(String(64))
    qty: Mapped[Decimal] = mapped_column(Numeric(12, 3))
    reason: Mapped[str] = mapped_column(String(300))
    value_paise: Mapped[int] = mapped_column(BigInteger)
    status: Mapped[str] = mapped_column(String(10))
    booked_on: Mapped[date] = mapped_column(Date)
    requested_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    requested_by_name: Mapped[str] = mapped_column(String(160))
    approved_by_name: Mapped[str | None] = mapped_column(String(160))
    rejected_by_name: Mapped[str | None] = mapped_column(String(160))
    rejected_reason: Mapped[str | None] = mapped_column(String(300))
    idempotency_key: Mapped[str] = mapped_column(String(80))
