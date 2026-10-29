"""The stock ledger on the server: item master, batches, goods received and adjustments.

Stock on hand is the sum of the movements for an item, location and batch, and never goes negative.
Each change locks its item, so two requests cannot both take the last unit. An adjustment above the
approval value waits for someone other than the person who asked. Every change needs stock:adjust
and writes its audit row in the same transaction. Requests that could book stock twice carry an
Idempotency-Key.
"""

import uuid
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from janus_api.audit import service as audit
from janus_api.auth.service import Actor
from janus_api.core.deps import Db, request_ip, require
from janus_api.core.errors import ApiError
from janus_api.finance.models import FinanceBudgetLine
from janus_api.operations.models import (
    OpsAdjustment,
    OpsBatch,
    OpsCount,
    OpsCountLine,
    OpsDispatch,
    OpsDispatchLine,
    OpsItem,
    OpsMovement,
    OpsPoLine,
    OpsPurchaseOrder,
    OpsRequisition,
    OpsReturn,
    OpsTransfer,
)
from janus_api.rules.service import ensure_open, rules_for

router = APIRouter(prefix="/v1/operations", tags=["Operations"])
Stock = Annotated[Actor, Depends(require("stock:adjust"))]

MAX_QTY = Decimal("1000000")


class ItemCreate(BaseModel):
    key: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=2, max_length=160)
    sku: str = Field(min_length=1, max_length=64)
    unit: str = Field(min_length=1, max_length=20)
    hsn: str = Field(pattern=r"^\d{4,8}$")
    rate_paise: int = Field(ge=0, le=10**12)
    gst_rate: int = Field(ge=0, le=28)
    reorder_level: Decimal = Field(ge=0, le=MAX_QTY, max_digits=12, decimal_places=3)
    track_batch: bool


class BatchIn(BaseModel):
    key: str = Field(min_length=1, max_length=64)
    item_key: str = Field(min_length=1, max_length=64)
    batch_no: str = Field(min_length=2, max_length=64)
    expiry: date


class MovementIn(BaseModel):
    key: str = Field(min_length=1, max_length=64)
    item_key: str = Field(min_length=1, max_length=64)
    location_id: int = Field(ge=0, le=999)
    batch_no: str | None = Field(default=None, max_length=64)
    qty: Decimal = Field(gt=0, le=MAX_QTY, max_digits=12, decimal_places=3)
    reason: str = Field(min_length=1, max_length=300)
    booked_on: date


class PoLineIn(BaseModel):
    item_key: str = Field(min_length=1, max_length=64)
    qty: Decimal = Field(gt=0, le=MAX_QTY, max_digits=12, decimal_places=3)
    rate_paise: int = Field(ge=0, le=10**12)


class PurchaseOrderIn(BaseModel):
    key: str = Field(min_length=1, max_length=64)
    number: str | None = Field(default=None, max_length=20)
    vendor: str = Field(min_length=2, max_length=160)
    location_id: int = Field(ge=0, le=999)
    lines: list[PoLineIn] = Field(min_length=1, max_length=200)


class ReceiptLineIn(BaseModel):
    item_key: str = Field(min_length=1, max_length=64)
    qty: Decimal = Field(gt=0, le=MAX_QTY, max_digits=12, decimal_places=3)


class PurchaseReceiveIn(BaseModel):
    receipts: list[ReceiptLineIn] = Field(min_length=1, max_length=200)


class LedgerImport(BaseModel):
    items: list[ItemCreate] = Field(max_length=2000)
    batches: list[BatchIn] = Field(default=[], max_length=5000)
    movements: list[MovementIn] = Field(default=[], max_length=20000)
    purchase_orders: list[PurchaseOrderIn] = Field(default=[], max_length=2000)


class ReceiptIn(BaseModel):
    location_id: int = Field(ge=0, le=999)
    batch_no: str | None = Field(default=None, max_length=64)
    expiry: date | None = None
    qty: Decimal = Field(gt=0, le=MAX_QTY, max_digits=12, decimal_places=3)
    reason: str = Field(default="Goods received", max_length=300)


class AdjustmentIn(BaseModel):
    location_id: int = Field(ge=0, le=999)
    batch_no: str | None = Field(default=None, max_length=64)
    qty: Decimal = Field(ge=-MAX_QTY, le=MAX_QTY, max_digits=12, decimal_places=3)
    reason: str = Field(min_length=3, max_length=300)


class RejectIn(BaseModel):
    reason: str = Field(min_length=3, max_length=300)


class ItemOut(BaseModel):
    key: str
    name: str
    sku: str
    unit: str
    hsn: str
    rate_paise: int
    gst_rate: int
    reorder_level: float
    track_batch: bool


class BatchOut(BaseModel):
    key: str
    item_key: str
    batch_no: str
    expiry: date


class MovementOut(BaseModel):
    key: str
    item_key: str
    location_id: int
    batch_no: str | None
    kind: str
    qty: float
    reason: str
    booked_on: date
    recorded_by: str


class AdjustmentOut(BaseModel):
    id: str
    item_key: str
    location_id: int
    batch_no: str | None
    qty: float
    reason: str
    value_paise: int
    status: str
    booked_on: date
    requested_by: str
    approved_by: str | None
    rejected_by: str | None
    rejected_reason: str | None


class DispatchLineOut(BaseModel):
    item_key: str
    batch_no: str | None
    qty: float
    rate_paise: int


class DispatchOut(BaseModel):
    id: str
    number: str
    challan_no: str
    booked_on: date
    customer: str
    customer_company: str
    location_id: int
    deal_ref: str | None
    transporter: str | None
    lr_number: str | None
    status: str
    picked: str | None
    packed: str | None
    shipped: str | None
    proof: str | None
    delivered_by: str | None
    created_by: str
    lines: list[DispatchLineOut]


class ReturnOut(BaseModel):
    id: str
    number: str
    dispatch_id: str
    item_key: str
    batch_no: str | None
    qty: float
    reason: str
    status: str
    condition: str | None
    location_id: int
    raised_by: str
    inspected_by: str | None


class TransferOut(BaseModel):
    id: str
    number: str
    item_key: str
    batch_no: str | None
    qty: float
    from_location_id: int
    to_location_id: int
    transporter: str
    lr_number: str | None
    status: str
    booked_on: date
    sent_by: str
    received_by: str | None


class CountLineOut(BaseModel):
    item_key: str
    batch_no: str | None
    system: float
    counted: float
    variance: float


class CountOut(BaseModel):
    id: str
    number: str
    location_id: int
    booked_on: date
    counted_by: str
    lines: list[CountLineOut]


class PoLineOut(BaseModel):
    item_key: str
    qty: float
    rate_paise: int
    received: float


class PurchaseOrderOut(BaseModel):
    id: str
    number: str
    vendor: str
    location_id: int
    booked_on: date
    created_by: str
    lines: list[PoLineOut]


class RequisitionOut(BaseModel):
    id: str
    number: str
    requester: str
    item_key: str
    qty: float
    estimated_rate_paise: int
    location_id: int
    budget_line_key: str
    reason: str
    status: str
    decided_by: str | None
    rejected_reason: str | None
    po_number: str | None
    raised_on: date


class LedgerOut(BaseModel):
    items: list[ItemOut]
    batches: list[BatchOut]
    movements: list[MovementOut]
    adjustments: list[AdjustmentOut]
    dispatches: list[DispatchOut]
    returns: list[ReturnOut]
    transfers: list[TransferOut]
    counts: list[CountOut]
    purchase_orders: list[PurchaseOrderOut]
    requisitions: list[RequisitionOut]


def _item_out(row: OpsItem) -> ItemOut:
    return ItemOut(
        key=row.item_key,
        name=row.name,
        sku=row.sku,
        unit=row.unit,
        hsn=row.hsn,
        rate_paise=row.rate_paise,
        gst_rate=row.gst_rate,
        reorder_level=float(row.reorder_level),
        track_batch=row.track_batch,
    )


async def _item(db: Db, tenant_id: int, key: str, *, lock: bool = False) -> OpsItem:
    query = select(OpsItem).where(OpsItem.tenant_id == tenant_id, OpsItem.item_key == key)
    if lock:
        query = query.with_for_update()
    row = await db.scalar(query)
    if row is None:
        raise ApiError("not_found", "Item not found.", 404)
    return row


async def _item_by_id(db: Db, item_id: int) -> OpsItem:
    return (await db.scalars(select(OpsItem).where(OpsItem.id == item_id))).one()


async def _on_hand(
    db: Db, tenant_id: int, item: OpsItem, location_id: int, batch_no: str | None
) -> Decimal:
    query = select(func.coalesce(func.sum(OpsMovement.qty), 0)).where(
        OpsMovement.tenant_id == tenant_id,
        OpsMovement.item_id == item.id,
        OpsMovement.location_id == location_id,
    )
    if item.track_batch:
        query = query.where(OpsMovement.batch_no == batch_no)
    total = await db.scalar(query)
    return Decimal(total or 0)


def _batch_for_item(item: OpsItem, batch_no: str | None) -> str | None:
    if not item.track_batch:
        return None
    if not batch_no or len(batch_no.strip()) < 2:
        raise ApiError("batch_required", "This item tracks batches. Enter the batch number.", 422)
    return batch_no.strip()


async def _movement_out(db: Db, row: OpsMovement) -> MovementOut:
    item = await _item_by_id(db, row.item_id)
    return MovementOut(
        key=row.move_key,
        item_key=item.item_key,
        location_id=row.location_id,
        batch_no=row.batch_no,
        kind=row.kind,
        qty=float(row.qty),
        reason=row.reason,
        booked_on=row.booked_on,
        recorded_by=row.recorded_by_name,
    )


async def _adjustment_out(db: Db, row: OpsAdjustment) -> AdjustmentOut:
    item = await _item_by_id(db, row.item_id)
    return AdjustmentOut(
        id=str(row.id),
        item_key=item.item_key,
        location_id=row.location_id,
        batch_no=row.batch_no,
        qty=float(row.qty),
        reason=row.reason,
        value_paise=row.value_paise,
        status=row.status,
        booked_on=row.booked_on,
        requested_by=row.requested_by_name,
        approved_by=row.approved_by_name,
        rejected_by=row.rejected_by_name,
        rejected_reason=row.rejected_reason,
    )


async def _adjustment(db: Db, tenant_id: int, adjustment_id: int) -> OpsAdjustment:
    row = await db.scalar(
        select(OpsAdjustment)
        .where(OpsAdjustment.tenant_id == tenant_id, OpsAdjustment.id == adjustment_id)
        .with_for_update()
    )
    if row is None:
        raise ApiError("not_found", "Adjustment not found.", 404)
    return row


@router.get("/ledger", response_model=LedgerOut)
async def ledger(actor: Stock, db: Db) -> LedgerOut:
    tenant_id = actor.session.tenant_id
    items = (
        await db.scalars(select(OpsItem).where(OpsItem.tenant_id == tenant_id).order_by(OpsItem.id))
    ).all()
    batches = (
        await db.scalars(
            select(OpsBatch).where(OpsBatch.tenant_id == tenant_id).order_by(OpsBatch.id)
        )
    ).all()
    movements = (
        await db.scalars(
            select(OpsMovement)
            .where(OpsMovement.tenant_id == tenant_id)
            .order_by(OpsMovement.id.desc())
        )
    ).all()
    adjustments = (
        await db.scalars(
            select(OpsAdjustment)
            .where(OpsAdjustment.tenant_id == tenant_id)
            .order_by(OpsAdjustment.id.desc())
        )
    ).all()
    dispatches = (
        await db.scalars(
            select(OpsDispatch)
            .where(OpsDispatch.tenant_id == tenant_id)
            .order_by(OpsDispatch.id.desc())
        )
    ).all()
    returns = (
        await db.scalars(
            select(OpsReturn).where(OpsReturn.tenant_id == tenant_id).order_by(OpsReturn.id.desc())
        )
    ).all()
    requisitions = (
        await db.scalars(
            select(OpsRequisition)
            .where(OpsRequisition.tenant_id == tenant_id)
            .order_by(OpsRequisition.id.desc())
        )
    ).all()
    purchase_orders = (
        await db.scalars(
            select(OpsPurchaseOrder)
            .where(OpsPurchaseOrder.tenant_id == tenant_id)
            .order_by(OpsPurchaseOrder.id.desc())
        )
    ).all()
    transfers = (
        await db.scalars(
            select(OpsTransfer)
            .where(OpsTransfer.tenant_id == tenant_id)
            .order_by(OpsTransfer.id.desc())
        )
    ).all()
    counts = (
        await db.scalars(
            select(OpsCount).where(OpsCount.tenant_id == tenant_id).order_by(OpsCount.id.desc())
        )
    ).all()
    item_keys = {item.id: item.item_key for item in items}
    return LedgerOut(
        items=[_item_out(item) for item in items],
        batches=[
            BatchOut(
                key=batch.batch_key,
                item_key=item_keys[batch.item_id],
                batch_no=batch.batch_no,
                expiry=batch.expiry,
            )
            for batch in batches
        ],
        movements=[
            MovementOut(
                key=row.move_key,
                item_key=item_keys[row.item_id],
                location_id=row.location_id,
                batch_no=row.batch_no,
                kind=row.kind,
                qty=float(row.qty),
                reason=row.reason,
                booked_on=row.booked_on,
                recorded_by=row.recorded_by_name,
            )
            for row in movements
        ],
        adjustments=[
            AdjustmentOut(
                id=str(row.id),
                item_key=item_keys[row.item_id],
                location_id=row.location_id,
                batch_no=row.batch_no,
                qty=float(row.qty),
                reason=row.reason,
                value_paise=row.value_paise,
                status=row.status,
                booked_on=row.booked_on,
                requested_by=row.requested_by_name,
                approved_by=row.approved_by_name,
                rejected_by=row.rejected_by_name,
                rejected_reason=row.rejected_reason,
            )
            for row in adjustments
        ],
        dispatches=[await _dispatch_out(db, row) for row in dispatches],
        returns=[await _return_out(db, row) for row in returns],
        transfers=[await _transfer_out(db, row) for row in transfers],
        counts=[await _count_out(db, row) for row in counts],
        purchase_orders=[await _po_out(db, row) for row in purchase_orders],
        requisitions=[await _requisition_out(db, row) for row in requisitions],
    )


@router.post("/items", response_model=ItemOut, status_code=201)
async def create_item(
    data: ItemCreate, actor: Stock, db: Db, request: Request, response: Response
) -> ItemOut:
    tenant_id = actor.session.tenant_id
    existing = await db.scalar(
        select(OpsItem).where(OpsItem.tenant_id == tenant_id, OpsItem.item_key == data.key)
    )
    if existing is not None:
        response.status_code = 200
        return _item_out(existing)
    if data.name.strip() == "":
        raise ApiError("invalid", "Enter the item name.", 422)
    sku_taken = await db.scalar(
        select(OpsItem.id).where(
            OpsItem.tenant_id == tenant_id, func.lower(OpsItem.sku) == data.sku.strip().lower()
        )
    )
    if sku_taken is not None:
        raise ApiError("sku_exists", "This SKU already exists.", 409)
    row = OpsItem(
        tenant_id=tenant_id,
        item_key=data.key,
        name=data.name.strip(),
        sku=data.sku.strip(),
        unit=data.unit.strip(),
        hsn=data.hsn,
        rate_paise=data.rate_paise,
        gst_rate=data.gst_rate,
        reorder_level=data.reorder_level,
        track_batch=data.track_batch,
    )
    db.add(row)
    await db.flush()
    audit.record(
        db,
        "operations.item_created",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"item": row.sku},
    )
    return _item_out(row)


@router.post("/import", response_model=LedgerOut, status_code=201)
async def import_opening_ledger(
    data: LedgerImport, actor: Stock, db: Db, request: Request
) -> LedgerOut:
    """Loads the opening item master, batches and goods received, once, into an empty ledger.

    Stock that came from the screen before the server held it is booked here, so the balances match.
    It is refused once the company has any item, so it cannot be used to add stock later.
    """
    tenant_id = actor.session.tenant_id
    has_items = await db.scalar(
        select(func.count()).select_from(OpsItem).where(OpsItem.tenant_id == tenant_id)
    )
    if has_items:
        raise ApiError(
            "ledger_exists", "The stock ledger already has items; use the normal steps.", 409
        )
    by_key: dict[str, OpsItem] = {}
    for spec in data.items:
        row = OpsItem(
            tenant_id=tenant_id,
            item_key=spec.key,
            name=spec.name.strip(),
            sku=spec.sku.strip(),
            unit=spec.unit.strip(),
            hsn=spec.hsn,
            rate_paise=spec.rate_paise,
            gst_rate=spec.gst_rate,
            reorder_level=spec.reorder_level,
            track_batch=spec.track_batch,
        )
        db.add(row)
        by_key[spec.key] = row
    await db.flush()
    for batch in data.batches:
        if batch.item_key not in by_key:
            raise ApiError(
                "unknown_item", "A batch refers to an item that is not in the import.", 422
            )
        db.add(
            OpsBatch(
                tenant_id=tenant_id,
                batch_key=batch.key,
                item_id=by_key[batch.item_key].id,
                batch_no=batch.batch_no,
                expiry=batch.expiry,
            )
        )
    for move in data.movements:
        if move.item_key not in by_key:
            raise ApiError(
                "unknown_item", "A movement refers to an item that is not in the import.", 422
            )
        item = by_key[move.item_key]
        db.add(
            OpsMovement(
                tenant_id=tenant_id,
                move_key=move.key,
                item_id=item.id,
                location_id=move.location_id,
                batch_no=_batch_for_item(item, move.batch_no) if item.track_batch else None,
                kind="receipt",
                qty=move.qty,
                reason=move.reason.strip() or "Opening stock",
                booked_on=move.booked_on,
                recorded_by_name=actor.user.name,
            )
        )
    for order in data.purchase_orders:
        for line in order.lines:
            if line.item_key not in by_key:
                raise ApiError(
                    "unknown_item",
                    "A purchase order refers to an item that is not in the import.",
                    422,
                )
        await _insert_purchase_order(
            db,
            tenant_id,
            actor,
            order.key,
            order.number,
            order.vendor,
            order.location_id,
            order.lines,
            idempotency_key=f"import-{order.key}",
            booked_on=_today(),
            item_by_key=by_key,
        )
    await db.flush()
    audit.record(
        db,
        "operations.ledger_imported",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"items": len(data.items), "movements": len(data.movements)},
    )
    return await ledger(actor, db)


@router.post("/items/{key}/receipts", response_model=MovementOut, status_code=201)
async def receive_stock(
    key: str,
    data: ReceiptIn,
    actor: Stock,
    db: Db,
    request: Request,
    response: Response,
    idempotency_key: Annotated[str, Header(min_length=1, max_length=80)],
) -> MovementOut:
    tenant_id = actor.session.tenant_id
    await ensure_open(db, tenant_id, _today())
    item = await _item(db, tenant_id, key, lock=True)
    existing = await db.scalar(
        select(OpsMovement).where(
            OpsMovement.tenant_id == tenant_id, OpsMovement.idempotency_key == idempotency_key
        )
    )
    if existing is not None:
        if (
            existing.item_id != item.id
            or existing.qty != data.qty
            or existing.location_id != data.location_id
        ):
            raise ApiError(
                "idempotency_conflict",
                "This Idempotency-Key was used for a different request.",
                409,
            )
        response.status_code = 200
        return await _movement_out(db, existing)
    batch_no = _batch_for_item(item, data.batch_no)
    if batch_no is not None:
        known = await db.scalar(
            select(OpsBatch.id).where(OpsBatch.item_id == item.id, OpsBatch.batch_no == batch_no)
        )
        if known is None:
            if data.expiry is None:
                raise ApiError("expiry_required", "A new batch needs an expiry date.", 422)
            db.add(
                OpsBatch(
                    tenant_id=tenant_id,
                    batch_key=f"bat-{idempotency_key[:40]}",
                    item_id=item.id,
                    batch_no=batch_no,
                    expiry=data.expiry,
                )
            )
    row = OpsMovement(
        tenant_id=tenant_id,
        move_key=f"mv-{idempotency_key[:40]}",
        item_id=item.id,
        location_id=data.location_id,
        batch_no=batch_no,
        kind="receipt",
        qty=data.qty,
        reason=data.reason.strip() or "Goods received",
        booked_on=_today(),
        recorded_by_name=actor.user.name,
        idempotency_key=idempotency_key,
    )
    db.add(row)
    await db.flush()
    audit.record(
        db,
        "operations.stock_received",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"item": item.sku, "qty": str(data.qty), "location": data.location_id},
    )
    return await _movement_out(db, row)


async def _book_adjustment(
    db: Db,
    tenant_id: int,
    actor: Actor,
    item: OpsItem,
    location_id: int,
    batch_no: str | None,
    qty: Decimal,
    reason: str,
    idempotency_key: str,
) -> OpsAdjustment:
    """Books an adjustment. Under the approval value it is applied at once; above it, it waits."""
    await ensure_open(db, tenant_id, _today())
    rules = await rules_for(db, tenant_id)
    value = int((abs(qty) * item.rate_paise).to_integral_value(rounding=ROUND_HALF_UP))
    needs_approval = value > rules.adjustment_approval_paise
    row = OpsAdjustment(
        tenant_id=tenant_id,
        item_id=item.id,
        location_id=location_id,
        batch_no=batch_no,
        qty=qty,
        reason=reason,
        value_paise=value,
        status="pending" if needs_approval else "applied",
        booked_on=_today(),
        requested_by=actor.user.id,
        requested_by_name=actor.user.name,
        idempotency_key=idempotency_key,
    )
    db.add(row)
    await db.flush()
    if not needs_approval:
        db.add(
            OpsMovement(
                tenant_id=tenant_id,
                move_key=f"adj-{row.id}",
                item_id=item.id,
                location_id=location_id,
                batch_no=batch_no,
                kind="adjustment",
                qty=qty,
                reason=reason,
                booked_on=row.booked_on,
                recorded_by_name=actor.user.name,
            )
        )
    return row


@router.post("/items/{key}/adjustments", response_model=AdjustmentOut, status_code=201)
async def request_adjustment(
    key: str,
    data: AdjustmentIn,
    actor: Stock,
    db: Db,
    request: Request,
    response: Response,
    idempotency_key: Annotated[str, Header(min_length=1, max_length=80)],
) -> AdjustmentOut:
    tenant_id = actor.session.tenant_id
    item = await _item(db, tenant_id, key, lock=True)
    existing = await db.scalar(
        select(OpsAdjustment).where(
            OpsAdjustment.tenant_id == tenant_id, OpsAdjustment.idempotency_key == idempotency_key
        )
    )
    if existing is not None:
        if existing.item_id != item.id or existing.qty != data.qty:
            raise ApiError(
                "idempotency_conflict",
                "This Idempotency-Key was used for a different request.",
                409,
            )
        response.status_code = 200
        return await _adjustment_out(db, existing)
    if data.qty == 0:
        raise ApiError("invalid", "Enter a quantity that is not zero.", 422)
    batch_no = _batch_for_item(item, data.batch_no)
    if data.qty < 0:
        available = await _on_hand(db, tenant_id, item, data.location_id, batch_no)
        if -data.qty > available:
            raise ApiError(
                "insufficient_stock", f"Only {available} {item.unit} is in stock here.", 422
            )
    row = await _book_adjustment(
        db,
        tenant_id,
        actor,
        item,
        data.location_id,
        batch_no,
        data.qty,
        data.reason.strip(),
        idempotency_key,
    )
    audit.record(
        db,
        "operations.adjustment_requested",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"item": item.sku, "qty": str(data.qty), "status": row.status},
    )
    return await _adjustment_out(db, row)


@router.post("/adjustments/{adjustment_id}/approve", response_model=AdjustmentOut)
async def approve_adjustment(
    adjustment_id: int, actor: Stock, db: Db, request: Request
) -> AdjustmentOut:
    tenant_id = actor.session.tenant_id
    await ensure_open(db, tenant_id, _today())
    row = await _adjustment(db, tenant_id, adjustment_id)
    if row.status != "pending":
        raise ApiError("not_pending", "This adjustment is already applied or rejected.", 409)
    if row.requested_by == actor.user.id:
        raise ApiError(
            "self_approval", "The person who requested an adjustment cannot approve it.", 403
        )
    item = await _item_by_id(db, row.item_id)
    await db.execute(select(OpsItem.id).where(OpsItem.id == item.id).with_for_update())
    if row.qty < 0:
        available = await _on_hand(db, tenant_id, item, row.location_id, row.batch_no)
        if -row.qty > available:
            raise ApiError(
                "insufficient_stock", f"Only {available} {item.unit} is in stock here now.", 422
            )
    row.status = "applied"
    row.approved_by_name = actor.user.name
    db.add(
        OpsMovement(
            tenant_id=tenant_id,
            move_key=f"adj-{row.id}",
            item_id=item.id,
            location_id=row.location_id,
            batch_no=row.batch_no,
            kind="adjustment",
            qty=row.qty,
            reason=row.reason,
            booked_on=_today(),
            recorded_by_name=actor.user.name,
        )
    )
    await db.flush()
    audit.record(
        db,
        "operations.adjustment_approved",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"item": item.sku, "qty": str(row.qty)},
    )
    return await _adjustment_out(db, row)


@router.post("/adjustments/{adjustment_id}/reject", response_model=AdjustmentOut)
async def reject_adjustment(
    adjustment_id: int, data: RejectIn, actor: Stock, db: Db, request: Request
) -> AdjustmentOut:
    tenant_id = actor.session.tenant_id
    row = await _adjustment(db, tenant_id, adjustment_id)
    if row.status != "pending":
        raise ApiError("not_pending", "Only a pending adjustment can be rejected.", 409)
    if row.requested_by == actor.user.id:
        raise ApiError(
            "self_approval", "The person who requested an adjustment cannot reject it.", 403
        )
    row.status = "rejected"
    row.rejected_by_name = actor.user.name
    row.rejected_reason = data.reason.strip()
    await db.flush()
    audit.record(
        db,
        "operations.adjustment_rejected",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"adjustment": row.id},
    )
    return await _adjustment_out(db, row)


def _today() -> date:
    return date.today()


# ---- Dispatches and returns --------------------------------------------------------------------

STAGES = ("picked", "packed", "shipped")


class DispatchLineIn(BaseModel):
    item_key: str = Field(min_length=1, max_length=64)
    batch_no: str | None = Field(default=None, max_length=64)
    qty: Decimal = Field(gt=0, le=MAX_QTY, max_digits=12, decimal_places=3)
    rate_paise: int = Field(ge=0, le=10**12)


class DispatchIn(BaseModel):
    location_id: int = Field(ge=0, le=999)
    customer: str = Field(min_length=2, max_length=160)
    customer_company: str = Field(default="", max_length=160)
    deal_ref: str | None = Field(default=None, max_length=80)
    transporter: str | None = Field(default=None, max_length=160)
    lr_number: str | None = Field(default=None, max_length=60)
    lines: list[DispatchLineIn] = Field(min_length=1, max_length=200)


class ProofIn(BaseModel):
    proof: str = Field(min_length=3, max_length=300)


class ReturnIn(BaseModel):
    dispatch_id: int = Field(ge=1)
    item_key: str = Field(min_length=1, max_length=64)
    qty: Decimal = Field(gt=0, le=MAX_QTY, max_digits=12, decimal_places=3)
    reason: str = Field(min_length=3, max_length=300)


class InspectIn(BaseModel):
    condition: Literal["good", "damaged"]


async def _dispatch_out(db: Db, row: OpsDispatch) -> DispatchOut:
    lines = (
        await db.scalars(
            select(OpsDispatchLine)
            .where(OpsDispatchLine.dispatch_id == row.id)
            .order_by(OpsDispatchLine.position)
        )
    ).all()
    return DispatchOut(
        id=str(row.id),
        number=row.number,
        challan_no=row.challan_no,
        booked_on=row.booked_on,
        customer=row.customer,
        customer_company=row.customer_company,
        location_id=row.location_id,
        deal_ref=row.deal_ref,
        transporter=row.transporter,
        lr_number=row.lr_number,
        status=row.status,
        picked=row.picked_by,
        packed=row.packed_by,
        shipped=row.shipped_by,
        proof=row.proof,
        delivered_by=row.delivered_by,
        created_by=row.created_by_name,
        lines=[
            DispatchLineOut(
                item_key=(await _item_by_id(db, line.item_id)).item_key,
                batch_no=line.batch_no,
                qty=float(line.qty),
                rate_paise=line.rate_paise,
            )
            for line in lines
        ],
    )


async def _return_out(db: Db, row: OpsReturn) -> ReturnOut:
    item = await _item_by_id(db, row.item_id)
    return ReturnOut(
        id=str(row.id),
        number=row.number,
        dispatch_id=str(row.dispatch_id),
        item_key=item.item_key,
        batch_no=row.batch_no,
        qty=float(row.qty),
        reason=row.reason,
        status=row.status,
        condition=row.condition,
        location_id=row.location_id,
        raised_by=row.raised_by_name,
        inspected_by=row.inspected_by_name,
    )


async def _dispatch(db: Db, tenant_id: int, dispatch_id: int, *, lock: bool = False) -> OpsDispatch:
    query = select(OpsDispatch).where(
        OpsDispatch.tenant_id == tenant_id, OpsDispatch.id == dispatch_id
    )
    if lock:
        query = query.with_for_update()
    row = await db.scalar(query)
    if row is None:
        raise ApiError("not_found", "Dispatch not found.", 404)
    return row


@router.get("/dispatches/{dispatch_id}", response_model=DispatchOut)
async def get_dispatch(dispatch_id: int, actor: Stock, db: Db) -> DispatchOut:
    return await _dispatch_out(db, await _dispatch(db, actor.session.tenant_id, dispatch_id))


@router.post("/dispatches", response_model=DispatchOut, status_code=201)
async def create_dispatch(
    data: DispatchIn,
    actor: Stock,
    db: Db,
    request: Request,
    response: Response,
    idempotency_key: Annotated[str, Header(min_length=1, max_length=80)],
) -> DispatchOut:
    """Books a dispatch and takes its lines out of stock in one transaction.

    Lines for the same item and batch are added up before stock is checked, so a dispatch
    cannot take more than is there. Expired batches are refused.
    """
    tenant_id = actor.session.tenant_id
    await ensure_open(db, tenant_id, _today())
    existing = await db.scalar(
        select(OpsDispatch).where(
            OpsDispatch.tenant_id == tenant_id, OpsDispatch.idempotency_key == idempotency_key
        )
    )
    if existing is not None:
        response.status_code = 200
        return await _dispatch_out(db, existing)
    # Items are locked in key order, so two dispatches cannot wait on each other.
    items: dict[str, OpsItem] = {}
    for key in sorted({line.item_key for line in data.lines}):
        items[key] = await _item(db, tenant_id, key, lock=True)
    needed: dict[tuple[int, str | None], Decimal] = {}
    for line in data.lines:
        item = items[line.item_key]
        batch_no = _batch_for_item(item, line.batch_no)
        if batch_no is not None:
            batch = await db.scalar(
                select(OpsBatch).where(OpsBatch.item_id == item.id, OpsBatch.batch_no == batch_no)
            )
            if batch is None:
                raise ApiError(
                    "unknown_batch", f"Batch {batch_no} is not known for {item.name}.", 422
                )
            if batch.expiry < _today():
                raise ApiError(
                    "batch_expired", f"Batch {batch_no} has expired and cannot be dispatched.", 422
                )
        needed_key = (item.id, batch_no)
        needed[needed_key] = needed.get(needed_key, Decimal(0)) + line.qty
    by_id = {item.id: item for item in items.values()}
    for (item_id, batch_no), total in needed.items():
        item = by_id[item_id]
        available = await _on_hand(db, tenant_id, item, data.location_id, batch_no)
        if total > available:
            raise ApiError(
                "insufficient_stock",
                f"Only {available} {item.unit} of {item.name} is in stock here.",
                422,
            )
    count = await db.scalar(
        select(func.count()).select_from(OpsDispatch).where(OpsDispatch.tenant_id == tenant_id)
    )
    today = _today()
    number = f"DN-{today.year}-{101 + (count or 0):04d}"
    row = OpsDispatch(
        tenant_id=tenant_id,
        number=number,
        challan_no=f"DC-{today.year}-{101 + (count or 0):04d}",
        location_id=data.location_id,
        customer=data.customer.strip(),
        customer_company=data.customer_company.strip(),
        deal_ref=data.deal_ref,
        transporter=(data.transporter or "").strip() or None,
        lr_number=(data.lr_number or "").strip() or None,
        status="dispatched",
        booked_on=today,
        created_by=actor.user.id,
        created_by_name=actor.user.name,
        idempotency_key=idempotency_key,
    )
    db.add(row)
    await db.flush()
    for position, line in enumerate(data.lines):
        item = items[line.item_key]
        batch_no = _batch_for_item(item, line.batch_no)
        db.add(
            OpsDispatchLine(
                tenant_id=tenant_id,
                dispatch_id=row.id,
                position=position,
                item_id=item.id,
                batch_no=batch_no,
                qty=line.qty,
                rate_paise=line.rate_paise,
            )
        )
        db.add(
            OpsMovement(
                tenant_id=tenant_id,
                move_key=f"dsp-{row.id}-{position}",
                item_id=item.id,
                location_id=data.location_id,
                batch_no=batch_no,
                kind="dispatch",
                qty=-line.qty,
                reason=f"Dispatch {number}",
                booked_on=today,
                recorded_by_name=actor.user.name,
            )
        )
    await db.flush()
    audit.record(
        db,
        "operations.dispatch_booked",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"dispatch": number, "lines": len(data.lines)},
    )
    return await _dispatch_out(db, row)


@router.post("/dispatches/{dispatch_id}/checkpoints/{stage}", response_model=DispatchOut)
async def checkpoint_dispatch(
    dispatch_id: int, stage: str, actor: Stock, db: Db, request: Request
) -> DispatchOut:
    """Marks the goods picked, packed or shipped, in that order, each by the person who did it."""
    tenant_id = actor.session.tenant_id
    if stage not in STAGES:
        raise ApiError("invalid", "The stage must be picked, packed or shipped.", 422)
    row = await _dispatch(db, tenant_id, dispatch_id, lock=True)
    if row.status == "delivered":
        raise ApiError("delivered", "This dispatch is already delivered.", 409)
    if getattr(row, f"{stage}_by") is not None:
        raise ApiError("already_done", f"The goods are {stage} already.", 409)
    index = STAGES.index(stage)
    if index > 0 and getattr(row, f"{STAGES[index - 1]}_by") is None:
        raise ApiError("out_of_order", f"Mark the goods {STAGES[index - 1]} before {stage}.", 409)
    setattr(row, f"{stage}_by", actor.user.name)
    await db.flush()
    audit.record(
        db,
        "operations.dispatch_checkpoint",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"dispatch": row.number, "stage": stage},
    )
    return await _dispatch_out(db, row)


@router.post("/dispatches/{dispatch_id}/deliver", response_model=DispatchOut)
async def deliver_dispatch(
    dispatch_id: int, data: ProofIn, actor: Stock, db: Db, request: Request
) -> DispatchOut:
    tenant_id = actor.session.tenant_id
    row = await _dispatch(db, tenant_id, dispatch_id, lock=True)
    if row.status == "delivered":
        raise ApiError("delivered", "This dispatch is already delivered.", 409)
    if row.shipped_by is None:
        raise ApiError("not_shipped", "Ship the goods before recording delivery.", 409)
    row.status = "delivered"
    row.proof = data.proof.strip()
    row.delivered_by = actor.user.name
    await db.flush()
    audit.record(
        db,
        "operations.dispatch_delivered",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"dispatch": row.number},
    )
    return await _dispatch_out(db, row)


@router.post("/returns", response_model=ReturnOut, status_code=201)
async def authorise_return(
    data: ReturnIn,
    actor: Stock,
    db: Db,
    request: Request,
    response: Response,
    idempotency_key: Annotated[str, Header(min_length=1, max_length=80)],
) -> ReturnOut:
    """Authorises a return against a dispatch. Stock changes only after the goods are inspected."""
    tenant_id = actor.session.tenant_id
    existing = await db.scalar(
        select(OpsReturn).where(
            OpsReturn.tenant_id == tenant_id, OpsReturn.idempotency_key == idempotency_key
        )
    )
    if existing is not None:
        response.status_code = 200
        return await _return_out(db, existing)
    dispatch = await _dispatch(db, tenant_id, data.dispatch_id)
    item = await _item(db, tenant_id, data.item_key)
    line = await db.scalar(
        select(OpsDispatchLine).where(
            OpsDispatchLine.dispatch_id == dispatch.id, OpsDispatchLine.item_id == item.id
        )
    )
    if line is None:
        raise ApiError("not_on_dispatch", "That item was not on this dispatch.", 422)
    if data.qty > line.qty:
        raise ApiError("over_return", f"Return between 1 and {line.qty}.", 422)
    count = await db.scalar(
        select(func.count()).select_from(OpsReturn).where(OpsReturn.tenant_id == tenant_id)
    )
    row = OpsReturn(
        tenant_id=tenant_id,
        number=f"RMA-{_today().year}-{101 + (count or 0):04d}",
        dispatch_id=dispatch.id,
        item_id=item.id,
        batch_no=line.batch_no,
        qty=data.qty,
        reason=data.reason.strip(),
        status="authorised",
        location_id=dispatch.location_id,
        raised_by=actor.user.id,
        raised_by_name=actor.user.name,
        idempotency_key=idempotency_key,
    )
    db.add(row)
    await db.flush()
    audit.record(
        db,
        "operations.return_authorised",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"return": row.number, "dispatch": dispatch.number},
    )
    return await _return_out(db, row)


@router.post("/returns/{return_id}/inspect", response_model=ReturnOut)
async def inspect_return(
    return_id: int, data: InspectIn, actor: Stock, db: Db, request: Request
) -> ReturnOut:
    """Records the condition of returned goods. Good goods go back to stock; damaged do not."""
    tenant_id = actor.session.tenant_id
    await ensure_open(db, tenant_id, _today())
    row = await db.scalar(
        select(OpsReturn)
        .where(OpsReturn.tenant_id == tenant_id, OpsReturn.id == return_id)
        .with_for_update()
    )
    if row is None:
        raise ApiError("not_found", "Return not found.", 404)
    if row.status != "authorised":
        raise ApiError("already_inspected", "This return has already been inspected.", 409)
    row.status = "inspected"
    row.condition = data.condition
    row.inspected_by_name = actor.user.name
    if data.condition == "good":
        db.add(
            OpsMovement(
                tenant_id=tenant_id,
                move_key=f"rma-{row.id}",
                item_id=row.item_id,
                location_id=row.location_id,
                batch_no=row.batch_no,
                kind="return",
                qty=row.qty,
                reason=f"Return {row.number} inspected good",
                booked_on=_today(),
                recorded_by_name=actor.user.name,
            )
        )
    await db.flush()
    audit.record(
        db,
        "operations.return_inspected",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"return": row.number, "condition": data.condition},
    )
    return await _return_out(db, row)


# ---- Transfers and physical counts -------------------------------------------------------------


class TransferIn(BaseModel):
    item_key: str = Field(min_length=1, max_length=64)
    batch_no: str | None = Field(default=None, max_length=64)
    qty: Decimal = Field(gt=0, le=MAX_QTY, max_digits=12, decimal_places=3)
    from_location_id: int = Field(ge=0, le=999)
    to_location_id: int = Field(ge=0, le=999)
    transporter: str = Field(min_length=2, max_length=160)
    lr_number: str | None = Field(default=None, max_length=60)


class CountLineIn(BaseModel):
    item_key: str = Field(min_length=1, max_length=64)
    batch_no: str | None = Field(default=None, max_length=64)
    counted: Decimal = Field(ge=0, le=MAX_QTY, max_digits=12, decimal_places=3)


class CountIn(BaseModel):
    location_id: int = Field(ge=0, le=999)
    lines: list[CountLineIn] = Field(min_length=1, max_length=500)


async def _transfer_out(db: Db, row: OpsTransfer) -> TransferOut:
    item = await _item_by_id(db, row.item_id)
    return TransferOut(
        id=str(row.id),
        number=row.number,
        item_key=item.item_key,
        batch_no=row.batch_no,
        qty=float(row.qty),
        from_location_id=row.from_location_id,
        to_location_id=row.to_location_id,
        transporter=row.transporter,
        lr_number=row.lr_number,
        status=row.status,
        booked_on=row.booked_on,
        sent_by=row.sent_by_name,
        received_by=row.received_by_name,
    )


async def _count_out(db: Db, row: OpsCount) -> CountOut:
    lines = (
        await db.scalars(
            select(OpsCountLine)
            .where(OpsCountLine.count_id == row.id)
            .order_by(OpsCountLine.position)
        )
    ).all()
    out: list[CountLineOut] = []
    for line in lines:
        item = await _item_by_id(db, line.item_id)
        out.append(
            CountLineOut(
                item_key=item.item_key,
                batch_no=line.batch_no,
                system=float(line.system_qty),
                counted=float(line.counted_qty),
                variance=float(line.variance),
            )
        )
    return CountOut(
        id=str(row.id),
        number=row.number,
        location_id=row.location_id,
        booked_on=row.booked_on,
        counted_by=row.counted_by_name,
        lines=out,
    )


@router.post("/transfers", response_model=TransferOut, status_code=201)
async def send_transfer(
    data: TransferIn,
    actor: Stock,
    db: Db,
    request: Request,
    response: Response,
    idempotency_key: Annotated[str, Header(min_length=1, max_length=80)],
) -> TransferOut:
    """Sends stock to another location. It leaves the sender now and arrives when received."""
    tenant_id = actor.session.tenant_id
    await ensure_open(db, tenant_id, _today())
    existing = await db.scalar(
        select(OpsTransfer).where(
            OpsTransfer.tenant_id == tenant_id, OpsTransfer.idempotency_key == idempotency_key
        )
    )
    if existing is not None:
        response.status_code = 200
        return await _transfer_out(db, existing)
    if data.from_location_id == data.to_location_id:
        raise ApiError("same_location", "The item is already at that location.", 422)
    item = await _item(db, tenant_id, data.item_key, lock=True)
    batch_no = _batch_for_item(item, data.batch_no)
    available = await _on_hand(db, tenant_id, item, data.from_location_id, batch_no)
    if data.qty > available:
        raise ApiError(
            "insufficient_stock",
            f"Only {available} {item.unit} of {item.name} is at the sending location.",
            422,
        )
    count = await db.scalar(
        select(func.count()).select_from(OpsTransfer).where(OpsTransfer.tenant_id == tenant_id)
    )
    row = OpsTransfer(
        tenant_id=tenant_id,
        number=f"TRF-{_today().year}-{101 + (count or 0):04d}",
        item_id=item.id,
        batch_no=batch_no,
        qty=data.qty,
        from_location_id=data.from_location_id,
        to_location_id=data.to_location_id,
        transporter=data.transporter.strip(),
        lr_number=(data.lr_number or "").strip() or None,
        status="in transit",
        booked_on=_today(),
        sent_by=actor.user.id,
        sent_by_name=actor.user.name,
        idempotency_key=idempotency_key,
    )
    db.add(row)
    await db.flush()
    db.add(
        OpsMovement(
            tenant_id=tenant_id,
            move_key=f"trf-out-{row.id}",
            item_id=item.id,
            location_id=data.from_location_id,
            batch_no=batch_no,
            kind="transfer_out",
            qty=-data.qty,
            reason=f"Sent {row.number}",
            booked_on=row.booked_on,
            recorded_by_name=actor.user.name,
        )
    )
    await db.flush()
    audit.record(
        db,
        "operations.transfer_sent",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"transfer": row.number, "item": item.sku, "qty": str(data.qty)},
    )
    return await _transfer_out(db, row)


@router.post("/transfers/{transfer_id}/receive", response_model=TransferOut)
async def receive_transfer(transfer_id: int, actor: Stock, db: Db, request: Request) -> TransferOut:
    tenant_id = actor.session.tenant_id
    await ensure_open(db, tenant_id, _today())
    row = await db.scalar(
        select(OpsTransfer)
        .where(OpsTransfer.tenant_id == tenant_id, OpsTransfer.id == transfer_id)
        .with_for_update()
    )
    if row is None:
        raise ApiError("not_found", "Transfer not found.", 404)
    if row.status != "in transit":
        raise ApiError("already_received", "This transfer has already been received.", 409)
    item = await _item_by_id(db, row.item_id)
    row.status = "received"
    row.received_by_name = actor.user.name
    db.add(
        OpsMovement(
            tenant_id=tenant_id,
            move_key=f"trf-in-{row.id}",
            item_id=item.id,
            location_id=row.to_location_id,
            batch_no=row.batch_no,
            kind="transfer_in",
            qty=row.qty,
            reason=f"Received {row.number}",
            booked_on=_today(),
            recorded_by_name=actor.user.name,
        )
    )
    await db.flush()
    audit.record(
        db,
        "operations.transfer_received",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"transfer": row.number},
    )
    return await _transfer_out(db, row)


@router.post("/counts", response_model=CountOut, status_code=201)
async def record_count(
    data: CountIn,
    actor: Stock,
    db: Db,
    request: Request,
    response: Response,
    idempotency_key: Annotated[str, Header(min_length=1, max_length=80)],
) -> CountOut:
    """Records a physical count. Each difference from the system is booked as an adjustment."""
    tenant_id = actor.session.tenant_id
    await ensure_open(db, tenant_id, _today())
    existing = await db.scalar(
        select(OpsCount).where(
            OpsCount.tenant_id == tenant_id, OpsCount.idempotency_key == idempotency_key
        )
    )
    if existing is not None:
        response.status_code = 200
        return await _count_out(db, existing)
    keys = sorted({line.item_key for line in data.lines})
    items = {key: await _item(db, tenant_id, key, lock=True) for key in keys}
    seen: set[tuple[int, str | None]] = set()
    priced: list[tuple[OpsItem, str | None, Decimal, Decimal]] = []
    for line in data.lines:
        item = items[line.item_key]
        batch_no = _batch_for_item(item, line.batch_no)
        if batch_no is not None:
            known = await db.scalar(
                select(OpsBatch.id).where(
                    OpsBatch.item_id == item.id, OpsBatch.batch_no == batch_no
                )
            )
            if known is None:
                raise ApiError(
                    "unknown_batch", f"Batch {batch_no} is not known for {item.name}.", 422
                )
        if (item.id, batch_no) in seen:
            raise ApiError("duplicate_line", f"{item.name} is counted twice.", 422)
        seen.add((item.id, batch_no))
        system = await _on_hand(db, tenant_id, item, data.location_id, batch_no)
        priced.append((item, batch_no, system, line.counted))
    count = await db.scalar(
        select(func.count()).select_from(OpsCount).where(OpsCount.tenant_id == tenant_id)
    )
    row = OpsCount(
        tenant_id=tenant_id,
        number=f"CNT-{_today().year}-{101 + (count or 0):04d}",
        location_id=data.location_id,
        booked_on=_today(),
        counted_by=actor.user.id,
        counted_by_name=actor.user.name,
        idempotency_key=idempotency_key,
    )
    db.add(row)
    await db.flush()
    for position, (item, batch_no, system, counted) in enumerate(priced):
        variance = counted - system
        db.add(
            OpsCountLine(
                tenant_id=tenant_id,
                count_id=row.id,
                position=position,
                item_id=item.id,
                batch_no=batch_no,
                system_qty=system,
                counted_qty=counted,
                variance=variance,
            )
        )
        if variance != 0:
            # The item is locked, so a difference can never take stock below zero.
            await _book_adjustment(
                db,
                tenant_id,
                actor,
                item,
                data.location_id,
                batch_no,
                variance,
                f"Physical count {row.number}",
                f"{idempotency_key}-{position}",
            )
    await db.flush()
    audit.record(
        db,
        "operations.count_recorded",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"count": row.number, "lines": len(priced)},
    )
    return await _count_out(db, row)


# ---- Purchase orders and goods received against them -----------------------------------------


async def _po_out(db: Db, row: OpsPurchaseOrder) -> PurchaseOrderOut:
    lines = (
        await db.scalars(
            select(OpsPoLine).where(OpsPoLine.po_id == row.id).order_by(OpsPoLine.position)
        )
    ).all()
    out: list[PoLineOut] = []
    for line in lines:
        item = await _item_by_id(db, line.item_id)
        out.append(
            PoLineOut(
                item_key=item.item_key,
                qty=float(line.qty),
                rate_paise=line.rate_paise,
                received=float(line.received_qty),
            )
        )
    return PurchaseOrderOut(
        id=row.po_key,
        number=row.number,
        vendor=row.vendor,
        location_id=row.location_id,
        booked_on=row.booked_on,
        created_by=row.created_by_name,
        lines=out,
    )


async def _insert_purchase_order(
    db: Db,
    tenant_id: int,
    actor: Actor,
    key: str,
    number: str | None,
    vendor: str,
    location_id: int,
    lines: list[PoLineIn],
    *,
    idempotency_key: str,
    booked_on: date,
    item_by_key: dict[str, OpsItem] | None = None,
) -> OpsPurchaseOrder:
    if number is None:
        count = await db.scalar(
            select(func.count())
            .select_from(OpsPurchaseOrder)
            .where(OpsPurchaseOrder.tenant_id == tenant_id)
        )
        number = f"PO-{booked_on.year}-{101 + (count or 0):04d}"
    row = OpsPurchaseOrder(
        tenant_id=tenant_id,
        po_key=key,
        number=number,
        vendor=vendor.strip(),
        location_id=location_id,
        booked_on=booked_on,
        created_by=actor.user.id,
        created_by_name=actor.user.name,
        idempotency_key=idempotency_key,
    )
    db.add(row)
    await db.flush()
    for position, line in enumerate(lines):
        item = (
            item_by_key[line.item_key]
            if item_by_key is not None
            else await _item(db, tenant_id, line.item_key)
        )
        db.add(
            OpsPoLine(
                tenant_id=tenant_id,
                po_id=row.id,
                position=position,
                item_id=item.id,
                qty=line.qty,
                rate_paise=line.rate_paise,
                received_qty=Decimal(0),
            )
        )
    await db.flush()
    return row


async def _po(db: Db, tenant_id: int, key: str, *, lock: bool = False) -> OpsPurchaseOrder:
    query = select(OpsPurchaseOrder).where(
        OpsPurchaseOrder.tenant_id == tenant_id, OpsPurchaseOrder.po_key == key
    )
    if lock:
        query = query.with_for_update()
    row = await db.scalar(query)
    if row is None:
        raise ApiError("not_found", "Purchase order not found.", 404)
    return row


@router.post("/purchase-orders", response_model=PurchaseOrderOut, status_code=201)
async def create_purchase_order(
    data: PurchaseOrderIn,
    actor: Stock,
    db: Db,
    request: Request,
    response: Response,
    idempotency_key: Annotated[str, Header(min_length=1, max_length=80)],
) -> PurchaseOrderOut:
    tenant_id = actor.session.tenant_id
    existing = await db.scalar(
        select(OpsPurchaseOrder).where(
            OpsPurchaseOrder.tenant_id == tenant_id,
            OpsPurchaseOrder.idempotency_key == idempotency_key,
        )
    )
    if existing is not None:
        response.status_code = 200
        return await _po_out(db, existing)
    for line in data.lines:
        await _item(db, tenant_id, line.item_key)
    row = await _insert_purchase_order(
        db,
        tenant_id,
        actor,
        data.key,
        data.number,
        data.vendor,
        data.location_id,
        data.lines,
        idempotency_key=idempotency_key,
        booked_on=_today(),
    )
    audit.record(
        db,
        "operations.purchase_order_raised",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"order": row.number, "lines": len(data.lines)},
    )
    return await _po_out(db, row)


@router.post("/purchase-orders/{key}/receive", response_model=PurchaseOrderOut)
async def receive_against_order(
    key: str,
    data: PurchaseReceiveIn,
    actor: Stock,
    db: Db,
    request: Request,
    response: Response,
    idempotency_key: Annotated[str, Header(min_length=1, max_length=80)],
) -> PurchaseOrderOut:
    """Books goods received against an order, up to what is still due on each line.

    The order is locked, so two receipts cannot both take the same quantity. Batch-tracked items are
    received with their batch from the stock ledger, not against the order.
    """
    tenant_id = actor.session.tenant_id
    await ensure_open(db, tenant_id, _today())
    row = await _po(db, tenant_id, key, lock=True)
    replay = await db.scalar(
        select(OpsMovement.id).where(
            OpsMovement.tenant_id == tenant_id,
            OpsMovement.idempotency_key == f"{idempotency_key}-0",
        )
    )
    if replay is not None:
        response.status_code = 200
        return await _po_out(db, row)
    lines = (
        await db.scalars(
            select(OpsPoLine).where(OpsPoLine.po_id == row.id).order_by(OpsPoLine.position)
        )
    ).all()
    by_item_id = {line.item_id: line for line in lines}
    # Several receipts for the same item are added up before the check against what is due.
    totals: dict[str, Decimal] = {}
    for receipt in data.receipts:
        totals[receipt.item_key] = totals.get(receipt.item_key, Decimal(0)) + receipt.qty
    for item_key, qty in totals.items():
        item = await _item(db, tenant_id, item_key)
        line = by_item_id.get(item.id)
        if line is None:
            raise ApiError("not_on_order", "That item is not on this order.", 422)
        if item.track_batch:
            raise ApiError(
                "batch_item",
                f"{item.name} tracks batches. Receive it with its batch from the stock ledger.",
                422,
            )
        due = line.qty - line.received_qty
        if qty > due:
            raise ApiError(
                "over_receipt",
                f"Only {due} {item.unit} of {item.name} is still due on this order.",
                422,
            )
    today = _today()
    for position, receipt in enumerate(data.receipts):
        item = await _item(db, tenant_id, receipt.item_key)
        db.add(
            OpsMovement(
                tenant_id=tenant_id,
                move_key=f"po-{idempotency_key[:40]}-{position}",
                item_id=item.id,
                location_id=row.location_id,
                batch_no=None,
                kind="receipt",
                qty=receipt.qty,
                reason=f"Goods received against {row.number}",
                booked_on=today,
                recorded_by_name=actor.user.name,
                idempotency_key=f"{idempotency_key}-{position}",
            )
        )
    items_by_id = await _items_by_id(db, [line.item_id for line in lines])
    for line in lines:
        added = totals.get(items_by_id[line.item_id].item_key)
        if added:
            line.received_qty = line.received_qty + added
    await db.flush()
    audit.record(
        db,
        "operations.goods_received",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"order": row.number, "lines": len(totals)},
    )
    return await _po_out(db, row)


async def _items_by_id(db: Db, ids: list[int]) -> dict[int, OpsItem]:
    rows = (await db.scalars(select(OpsItem).where(OpsItem.id.in_(ids)))).all()
    return {row.id: row for row in rows}


# ---- Requisitions ------------------------------------------------------------------------------


class RequisitionIn(BaseModel):
    key: str = Field(min_length=1, max_length=64)
    item_key: str = Field(min_length=1, max_length=64)
    qty: Decimal = Field(gt=0, le=MAX_QTY, max_digits=12, decimal_places=3)
    estimated_rate_paise: int = Field(ge=0, le=10**12)
    location_id: int = Field(ge=0, le=999)
    budget_line_key: str = Field(min_length=1, max_length=80)
    reason: str = Field(min_length=5, max_length=300)


class RequisitionOrderIn(BaseModel):
    vendor: str = Field(min_length=2, max_length=160)


async def _requisition_out(db: Db, row: OpsRequisition) -> RequisitionOut:
    item = await _item_by_id(db, row.item_id)
    po_number = None
    if row.po_key is not None:
        po_number = await db.scalar(
            select(OpsPurchaseOrder.number).where(
                OpsPurchaseOrder.tenant_id == row.tenant_id,
                OpsPurchaseOrder.po_key == row.po_key,
            )
        )
    return RequisitionOut(
        id=row.req_key,
        number=row.number,
        requester=row.requested_by_name,
        item_key=item.item_key,
        qty=float(row.qty),
        estimated_rate_paise=row.estimated_rate_paise,
        location_id=row.location_id,
        budget_line_key=row.budget_line_key,
        reason=row.reason,
        status=row.status,
        decided_by=row.decided_by_name,
        rejected_reason=row.rejected_reason,
        po_number=po_number,
        raised_on=row.raised_on,
    )


async def _req(db: Db, tenant_id: int, key: str, *, lock: bool = False) -> OpsRequisition:
    query = select(OpsRequisition).where(
        OpsRequisition.tenant_id == tenant_id, OpsRequisition.req_key == key
    )
    if lock:
        query = query.with_for_update()
    row = await db.scalar(query)
    if row is None:
        raise ApiError("not_found", "Requisition not found.", 404)
    return row


@router.post("/requisitions", response_model=RequisitionOut, status_code=201)
async def raise_requisition(
    data: RequisitionIn,
    actor: Stock,
    db: Db,
    request: Request,
    response: Response,
    idempotency_key: Annotated[str, Header(min_length=1, max_length=80)],
) -> RequisitionOut:
    tenant_id = actor.session.tenant_id
    existing = await db.scalar(
        select(OpsRequisition).where(
            OpsRequisition.tenant_id == tenant_id,
            OpsRequisition.idempotency_key == idempotency_key,
        )
    )
    if existing is not None:
        response.status_code = 200
        return await _requisition_out(db, existing)
    item = await _item(db, tenant_id, data.item_key)
    budget = await db.scalar(
        select(FinanceBudgetLine.id).where(
            FinanceBudgetLine.tenant_id == tenant_id,
            FinanceBudgetLine.external_key == data.budget_line_key,
        )
    )
    if budget is None:
        raise ApiError(
            "budget_line_not_found", "Choose the budget line this buying is paid from.", 422
        )
    count = await db.scalar(
        select(func.count())
        .select_from(OpsRequisition)
        .where(OpsRequisition.tenant_id == tenant_id)
    )
    row = OpsRequisition(
        tenant_id=tenant_id,
        req_key=data.key,
        number=f"REQ-{_today().year}-{101 + (count or 0):04d}",
        item_id=item.id,
        qty=data.qty,
        estimated_rate_paise=data.estimated_rate_paise,
        location_id=data.location_id,
        budget_line_key=data.budget_line_key,
        reason=data.reason.strip(),
        status="pending",
        requested_by=actor.user.id,
        requested_by_name=actor.user.name,
        raised_on=_today(),
        idempotency_key=idempotency_key,
    )
    db.add(row)
    await db.flush()
    audit.record(
        db,
        "operations.requisition_raised",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"requisition": row.number, "item": item.sku, "qty": str(data.qty)},
    )
    return await _requisition_out(db, row)


@router.post("/requisitions/{key}/approve", response_model=RequisitionOut)
async def approve_requisition(key: str, actor: Stock, db: Db, request: Request) -> RequisitionOut:
    """Approves a requisition if its budget line still has the money, read on the server."""
    tenant_id = actor.session.tenant_id
    row = await _req(db, tenant_id, key, lock=True)
    if row.status != "pending":
        raise ApiError("not_pending", "Only a pending requisition can be approved.", 409)
    if row.requested_by == actor.user.id:
        raise ApiError(
            "self_approval", "The person who raised a requisition cannot approve it.", 403
        )
    budget = await db.scalar(
        select(FinanceBudgetLine).where(
            FinanceBudgetLine.tenant_id == tenant_id,
            FinanceBudgetLine.external_key == row.budget_line_key,
        )
    )
    if budget is None:
        raise ApiError(
            "budget_line_not_found",
            "The budget line for this requisition is not on the server.",
            422,
        )
    available = budget.allocated_paise - budget.drawn_paise
    value = int((row.qty * row.estimated_rate_paise).to_integral_value(rounding=ROUND_HALF_UP))
    if value > available:
        raise ApiError(
            "over_budget",
            f"The budget line has {available / 100:,.2f} left; this needs {value / 100:,.2f}.",
            422,
        )
    row.status = "approved"
    row.decided_by_name = actor.user.name
    await db.flush()
    audit.record(
        db,
        "operations.requisition_approved",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"requisition": row.number, "value_paise": value},
    )
    return await _requisition_out(db, row)


@router.post("/requisitions/{key}/reject", response_model=RequisitionOut)
async def reject_requisition(
    key: str, data: RejectIn, actor: Stock, db: Db, request: Request
) -> RequisitionOut:
    tenant_id = actor.session.tenant_id
    row = await _req(db, tenant_id, key, lock=True)
    if row.status != "pending":
        raise ApiError("not_pending", "Only a pending requisition can be rejected.", 409)
    if row.requested_by == actor.user.id:
        raise ApiError(
            "self_approval", "The person who raised a requisition cannot reject it.", 403
        )
    row.status = "rejected"
    row.decided_by_name = actor.user.name
    row.rejected_reason = data.reason.strip()
    await db.flush()
    audit.record(
        db,
        "operations.requisition_rejected",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"requisition": row.number},
    )
    return await _requisition_out(db, row)


@router.post("/requisitions/{key}/order", response_model=RequisitionOut)
async def order_requisition(
    key: str, data: RequisitionOrderIn, actor: Stock, db: Db, request: Request
) -> RequisitionOut:
    """Turns an approved requisition into a purchase order to the chosen vendor, once."""
    tenant_id = actor.session.tenant_id
    row = await _req(db, tenant_id, key, lock=True)
    if row.status != "approved":
        raise ApiError(
            "not_approved", "Only an approved requisition can be turned into an order.", 409
        )
    item = await _item_by_id(db, row.item_id)
    order = await _insert_purchase_order(
        db,
        tenant_id,
        actor,
        f"po-{uuid.uuid4().hex}",
        None,
        data.vendor,
        row.location_id,
        [PoLineIn(item_key=item.item_key, qty=row.qty, rate_paise=row.estimated_rate_paise)],
        idempotency_key=f"req-{row.req_key}"[:80],
        booked_on=_today(),
        item_by_key={item.item_key: item},
    )
    row.status = "ordered"
    row.po_key = order.po_key
    await db.flush()
    audit.record(
        db,
        "operations.requisition_ordered",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={"requisition": row.number, "order": order.number},
    )
    return await _requisition_out(db, row)
