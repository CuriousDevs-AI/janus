"""The stock ledger on the server: item master, batches, goods received and adjustments.

Stock on hand is the sum of the movements for an item, location and batch, and never goes negative.
Each change locks its item, so two requests cannot both take the last unit. An adjustment above the
approval value waits for someone other than the person who asked. Every change needs stock:adjust
and writes its audit row in the same transaction. Requests that could book stock twice carry an
Idempotency-Key.
"""

from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from janus_api.audit import service as audit
from janus_api.auth.service import Actor
from janus_api.core.deps import Db, request_ip, require
from janus_api.core.errors import ApiError
from janus_api.operations.models import OpsAdjustment, OpsBatch, OpsItem, OpsMovement

router = APIRouter(prefix="/v1/operations", tags=["Operations"])
Stock = Annotated[Actor, Depends(require("stock:adjust"))]

# Adjustments worth more than this (in paise) need approval. Matches the screen's default rule.
APPROVAL_VALUE_PAISE = 10000 * 100
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


class LedgerImport(BaseModel):
    items: list[ItemCreate] = Field(max_length=2000)
    batches: list[BatchIn] = Field(default=[], max_length=5000)
    movements: list[MovementIn] = Field(default=[], max_length=20000)


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


class LedgerOut(BaseModel):
    items: list[ItemOut]
    batches: list[BatchOut]
    movements: list[MovementOut]
    adjustments: list[AdjustmentOut]


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
    value = int((abs(data.qty) * item.rate_paise).to_integral_value(rounding=ROUND_HALF_UP))
    needs_approval = value > APPROVAL_VALUE_PAISE
    row = OpsAdjustment(
        tenant_id=tenant_id,
        item_id=item.id,
        location_id=data.location_id,
        batch_no=batch_no,
        qty=data.qty,
        reason=data.reason.strip(),
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
                location_id=data.location_id,
                batch_no=batch_no,
                kind="adjustment",
                qty=data.qty,
                reason=row.reason,
                booked_on=row.booked_on,
                recorded_by_name=actor.user.name,
            )
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
