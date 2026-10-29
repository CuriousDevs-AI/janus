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
        CheckConstraint(
            "kind IN ('receipt', 'adjustment', 'dispatch', 'return', 'transfer_out', "
            "'transfer_in')",
            name="ck_ops_movements_kind",
        ),
        CheckConstraint(
            "(kind IN ('receipt', 'return', 'transfer_in') AND qty > 0)"
            " OR (kind IN ('dispatch', 'transfer_out') AND qty < 0) OR kind = 'adjustment'",
            name="ck_ops_movements_sign",
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


class OpsDispatch(Base):
    """A dispatch with its delivery challan. Its lines take stock out when it is created."""

    __tablename__ = "ops_dispatches"
    __table_args__ = (
        UniqueConstraint("tenant_id", "number"),
        UniqueConstraint("tenant_id", "idempotency_key"),
        CheckConstraint("status IN ('dispatched', 'delivered')", name="ck_ops_dispatches_status"),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    number: Mapped[str] = mapped_column(String(20))
    challan_no: Mapped[str] = mapped_column(String(20))
    location_id: Mapped[int] = mapped_column(Integer)
    customer: Mapped[str] = mapped_column(String(160))
    customer_company: Mapped[str] = mapped_column(String(160), default="")
    deal_ref: Mapped[str | None] = mapped_column(String(80))
    transporter: Mapped[str | None] = mapped_column(String(160))
    lr_number: Mapped[str | None] = mapped_column(String(60))
    status: Mapped[str] = mapped_column(String(12))
    picked_by: Mapped[str | None] = mapped_column(String(160))
    packed_by: Mapped[str | None] = mapped_column(String(160))
    shipped_by: Mapped[str | None] = mapped_column(String(160))
    proof: Mapped[str | None] = mapped_column(String(300))
    delivered_by: Mapped[str | None] = mapped_column(String(160))
    booked_on: Mapped[date] = mapped_column(Date)
    created_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    created_by_name: Mapped[str] = mapped_column(String(160))
    idempotency_key: Mapped[str] = mapped_column(String(80))


class OpsDispatchLine(Base):
    __tablename__ = "ops_dispatch_lines"
    __table_args__ = (
        UniqueConstraint("dispatch_id", "position"),
        CheckConstraint("qty > 0 AND rate_paise >= 0", name="ck_ops_dispatch_lines_amounts"),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    dispatch_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("ops_dispatches.id"))
    position: Mapped[int] = mapped_column(Integer)
    item_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("ops_items.id"))
    batch_no: Mapped[str | None] = mapped_column(String(64))
    qty: Mapped[Decimal] = mapped_column(Numeric(12, 3))
    rate_paise: Mapped[int] = mapped_column(BigInteger)


class OpsReturn(Base):
    """A return authorised against a dispatch. Goods come back into stock only if inspected good."""

    __tablename__ = "ops_returns"
    __table_args__ = (
        UniqueConstraint("tenant_id", "number"),
        UniqueConstraint("tenant_id", "idempotency_key"),
        CheckConstraint("qty > 0", name="ck_ops_returns_qty"),
        CheckConstraint("status IN ('authorised', 'inspected')", name="ck_ops_returns_status"),
        CheckConstraint(
            "condition IS NULL OR condition IN ('good', 'damaged')", name="ck_ops_returns_condition"
        ),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    number: Mapped[str] = mapped_column(String(20))
    dispatch_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("ops_dispatches.id"))
    item_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("ops_items.id"))
    batch_no: Mapped[str | None] = mapped_column(String(64))
    qty: Mapped[Decimal] = mapped_column(Numeric(12, 3))
    reason: Mapped[str] = mapped_column(String(300))
    status: Mapped[str] = mapped_column(String(12))
    condition: Mapped[str | None] = mapped_column(String(10))
    location_id: Mapped[int] = mapped_column(Integer)
    raised_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    raised_by_name: Mapped[str] = mapped_column(String(160))
    inspected_by_name: Mapped[str | None] = mapped_column(String(160))
    idempotency_key: Mapped[str] = mapped_column(String(80))


class OpsTransfer(Base):
    """Stock moved between two locations: it leaves the sender when sent, arrives when received."""

    __tablename__ = "ops_transfers"
    __table_args__ = (
        UniqueConstraint("tenant_id", "number"),
        UniqueConstraint("tenant_id", "idempotency_key"),
        CheckConstraint("qty > 0", name="ck_ops_transfers_qty"),
        CheckConstraint("from_location_id <> to_location_id", name="ck_ops_transfers_locations"),
        CheckConstraint("status IN ('in transit', 'received')", name="ck_ops_transfers_status"),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    number: Mapped[str] = mapped_column(String(20))
    item_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("ops_items.id"))
    batch_no: Mapped[str | None] = mapped_column(String(64))
    qty: Mapped[Decimal] = mapped_column(Numeric(12, 3))
    from_location_id: Mapped[int] = mapped_column(Integer)
    to_location_id: Mapped[int] = mapped_column(Integer)
    transporter: Mapped[str] = mapped_column(String(160))
    lr_number: Mapped[str | None] = mapped_column(String(60))
    status: Mapped[str] = mapped_column(String(12))
    booked_on: Mapped[date] = mapped_column(Date)
    sent_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    sent_by_name: Mapped[str] = mapped_column(String(160))
    received_by_name: Mapped[str | None] = mapped_column(String(160))
    idempotency_key: Mapped[str] = mapped_column(String(80))


class OpsCount(Base):
    """A physical count of one location. Each difference is booked as an adjustment."""

    __tablename__ = "ops_counts"
    __table_args__ = (
        UniqueConstraint("tenant_id", "number"),
        UniqueConstraint("tenant_id", "idempotency_key"),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    number: Mapped[str] = mapped_column(String(20))
    location_id: Mapped[int] = mapped_column(Integer)
    booked_on: Mapped[date] = mapped_column(Date)
    counted_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    counted_by_name: Mapped[str] = mapped_column(String(160))
    idempotency_key: Mapped[str] = mapped_column(String(80))


class OpsCountLine(Base):
    __tablename__ = "ops_count_lines"
    __table_args__ = (
        UniqueConstraint("count_id", "position"),
        CheckConstraint("counted_qty >= 0", name="ck_ops_count_lines_counted"),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    count_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("ops_counts.id"))
    position: Mapped[int] = mapped_column(Integer)
    item_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("ops_items.id"))
    batch_no: Mapped[str | None] = mapped_column(String(64))
    system_qty: Mapped[Decimal] = mapped_column(Numeric(12, 3))
    counted_qty: Mapped[Decimal] = mapped_column(Numeric(12, 3))
    variance: Mapped[Decimal] = mapped_column(Numeric(12, 3))
