"use client";

import { api, message } from "@/lib/api/client";
import { demoMode } from "@/lib/demo-mode";
import { toPaise } from "@/lib/finance-records";
import { type TrailEntry, trailEntry, withTrail } from "@/lib/stores/audit-trail";
import { periodLockProblem } from "@/lib/stores/period-lock-store";
import {
  type Adjustment,
  type Batch,
  type Dispatch,
  type Item,
  type Movement,
  type PurchaseOrder,
  type Requisition,
  type Return,
  type StockCount,
  type Transfer,
  TODAY,
  useOperationsStore,
} from "@/lib/stores/operations-store";

/**
 * The stock ledger is kept on the server: the item master, batches, goods received and adjustments.
 * Stock on hand is worked out from the server's movements, and the screen reloads the ledger after each
 * change, so it never shows a balance the server did not write. Demo mode keeps the local path.
 */

interface ServerItem {
  key: string;
  name: string;
  sku: string;
  unit: string;
  hsn: string;
  rate_paise: number;
  gst_rate: number;
  reorder_level: number;
  track_batch: boolean;
}
interface ServerBatch { key: string; item_key: string; batch_no: string; expiry: string }
interface ServerMovement {
  key: string;
  item_key: string;
  location_id: number;
  batch_no: string | null;
  kind: "receipt" | "adjustment" | "dispatch" | "return" | "transfer_out" | "transfer_in";
  qty: number;
  reason: string;
  booked_on: string;
  recorded_by: string;
}
interface ServerAdjustment {
  id: string;
  item_key: string;
  location_id: number;
  batch_no: string | null;
  qty: number;
  reason: string;
  value_paise: number;
  status: Adjustment["status"];
  booked_on: string;
  requested_by: string;
  approved_by: string | null;
  rejected_by: string | null;
  rejected_reason: string | null;
}
interface ServerDispatchLine { item_key: string; batch_no: string | null; qty: number; rate_paise: number }
interface ServerDispatch {
  id: string;
  number: string;
  challan_no: string;
  booked_on: string;
  customer: string;
  customer_company: string;
  location_id: number;
  deal_ref: string | null;
  transporter: string | null;
  lr_number: string | null;
  status: Dispatch["status"];
  picked: string | null;
  packed: string | null;
  shipped: string | null;
  proof: string | null;
  delivered_by: string | null;
  created_by: string;
  lines: ServerDispatchLine[];
}
interface ServerReturn {
  id: string;
  number: string;
  dispatch_id: string;
  item_key: string;
  batch_no: string | null;
  qty: number;
  reason: string;
  status: Return["status"];
  condition: Return["condition"] | null;
  location_id: number;
  raised_by: string;
  inspected_by: string | null;
}
interface ServerTransfer {
  id: string;
  number: string;
  item_key: string;
  batch_no: string | null;
  qty: number;
  from_location_id: number;
  to_location_id: number;
  transporter: string;
  lr_number: string | null;
  status: Transfer["status"];
  booked_on: string;
  sent_by: string;
  received_by: string | null;
}
interface ServerCount {
  id: string;
  number: string;
  location_id: number;
  booked_on: string;
  counted_by: string;
  lines: { item_key: string; batch_no: string | null; system: number; counted: number; variance: number }[];
}
interface ServerPurchaseOrder {
  id: string;
  number: string;
  vendor: string;
  booked_on: string;
  location_id: number;
  created_by: string;
  lines: { item_key: string; qty: number; rate_paise: number; received: number }[];
}
interface ServerRequisition {
  id: string;
  number: string;
  requester: string;
  item_key: string;
  qty: number;
  estimated_rate_paise: number;
  location_id: number;
  budget_line_key: string;
  reason: string;
  status: Requisition["status"];
  decided_by: string | null;
  rejected_reason: string | null;
  po_number: string | null;
  raised_on: string;
}
interface ServerLedger {
  requisitions: ServerRequisition[];
  purchase_orders: ServerPurchaseOrder[];
  items: ServerItem[];
  batches: ServerBatch[];
  movements: ServerMovement[];
  adjustments: ServerAdjustment[];
  dispatches: ServerDispatch[];
  returns: ServerReturn[];
  transfers: ServerTransfer[];
  counts: ServerCount[];
}

type DispatchInput = Parameters<ReturnType<typeof useOperationsStore.getState>["createDispatch"]>[0];

const toItem = (row: ServerItem): Item => ({
  id: row.key,
  name: row.name,
  sku: row.sku,
  unit: row.unit,
  hsn: row.hsn,
  rate: row.rate_paise / 100,
  gstRate: row.gst_rate,
  reorderLevel: row.reorder_level,
  trackBatch: row.track_batch,
});

const toBatch = (row: ServerBatch): Batch => ({ id: row.key, itemId: row.item_key, batchNo: row.batch_no, expiry: row.expiry });

const toMovement = (row: ServerMovement): Movement => ({
  id: row.key,
  date: row.booked_on,
  type: row.kind.startsWith("transfer") ? "transfer" : (row.kind as Movement["type"]),
  itemId: row.item_key,
  locationId: row.location_id,
  batchNo: row.batch_no,
  qty: row.qty,
  reason: row.reason,
  by: row.recorded_by,
});

const toAdjustment = (row: ServerAdjustment): Adjustment => ({
  id: row.id,
  date: row.booked_on,
  itemId: row.item_key,
  locationId: row.location_id,
  batchNo: row.batch_no,
  qty: row.qty,
  reason: row.reason,
  status: row.status,
  by: row.requested_by,
  approvedBy: row.approved_by ?? undefined,
  rejectedBy: row.rejected_by ?? undefined,
  value: row.value_paise / 100,
});

const toDispatch = (row: ServerDispatch): Dispatch => ({
  id: row.id,
  number: row.number,
  challanNo: row.challan_no,
  date: row.booked_on,
  customer: row.customer,
  customerCompany: row.customer_company,
  locationId: row.location_id,
  lines: row.lines.map((line) => ({ itemId: line.item_key, batchNo: line.batch_no, qty: line.qty, rate: line.rate_paise / 100 })),
  status: row.status,
  proof: row.proof ?? undefined,
  createdBy: row.created_by,
  deliveredBy: row.delivered_by ?? undefined,
  dealId: row.deal_ref ?? undefined,
  transporter: row.transporter ?? undefined,
  lrNumber: row.lr_number ?? undefined,
  picked: row.picked ?? undefined,
  packed: row.packed ?? undefined,
  shipped: row.shipped ?? undefined,
});

const toTransfer = (row: ServerTransfer): Transfer => ({
  id: row.id,
  number: row.number,
  date: row.booked_on,
  itemId: row.item_key,
  qty: row.qty,
  batchNo: row.batch_no,
  fromLocationId: row.from_location_id,
  toLocationId: row.to_location_id,
  transporter: row.transporter,
  lrNumber: row.lr_number ?? "",
  status: row.status,
  by: row.sent_by,
});

const toCount = (row: ServerCount): StockCount => ({
  id: row.id,
  number: row.number,
  date: row.booked_on,
  locationId: row.location_id,
  lines: row.lines.map((line) => ({ itemId: line.item_key, batchNo: line.batch_no, system: line.system, counted: line.counted, variance: line.variance })),
  by: row.counted_by,
});

const toPurchaseOrder = (row: ServerPurchaseOrder): PurchaseOrder => ({
  id: row.id,
  number: row.number,
  vendor: row.vendor,
  date: row.booked_on,
  locationId: row.location_id,
  lines: row.lines.map((line) => ({ itemId: line.item_key, qty: line.qty, rate: line.rate_paise / 100, received: line.received })),
  createdBy: row.created_by,
});

const toRequisition = (row: ServerRequisition): Requisition => ({
  id: row.id,
  number: row.number,
  requester: row.requester,
  itemId: row.item_key,
  qty: row.qty,
  estimatedRate: row.estimated_rate_paise / 100,
  locationId: row.location_id,
  budgetLineId: row.budget_line_key,
  reason: row.reason,
  status: row.status,
  decidedBy: row.decided_by ?? undefined,
  rejectedReason: row.rejected_reason ?? undefined,
  poNumber: row.po_number ?? undefined,
  raisedOn: row.raised_on,
});

const toReturn = (row: ServerReturn): Return => ({
  id: row.id,
  number: row.number,
  dispatchId: row.dispatch_id,
  itemId: row.item_key,
  batchNo: row.batch_no,
  qty: row.qty,
  reason: row.reason,
  status: row.status,
  condition: row.condition ?? undefined,
  raisedBy: row.raised_by,
  inspectedBy: row.inspected_by ?? undefined,
  locationId: row.location_id,
});

function apply(ledger: ServerLedger) {
  useOperationsStore.setState({
    items: ledger.items.map(toItem),
    batches: ledger.batches.map(toBatch),
    movements: ledger.movements.map(toMovement),
    adjustments: ledger.adjustments.map(toAdjustment),
    dispatches: ledger.dispatches.map(toDispatch),
    returns: ledger.returns.map(toReturn),
    transfers: ledger.transfers.map(toTransfer),
    counts: ledger.counts.map(toCount),
    purchaseOrders: ledger.purchase_orders.map(toPurchaseOrder),
    requisitions: ledger.requisitions.map(toRequisition),
  });
}

let syncing: Promise<void> | null = null;

/**
 * Loads the ledger from the server. When the server holds no items yet, the opening item master, batches
 * and goods received are loaded once, so the balances the screen had are the balances the server holds.
 */
export function syncOperations(): Promise<void> {
  if (demoMode) return Promise.resolve();
  if (!syncing) {
    syncing = loadLedger().finally(() => {
      syncing = null;
    });
  }
  return syncing;
}

async function loadLedger(): Promise<void> {
  let ledger = await api<ServerLedger>("/operations/ledger");
  if (ledger.items.length === 0) {
    const local = useOperationsStore.getState();
    await api<ServerLedger>("/operations/import", {
      method: "POST",
      body: JSON.stringify({
        items: local.items.map((item) => ({
          key: item.id,
          name: item.name,
          sku: item.sku,
          unit: item.unit,
          hsn: item.hsn,
          rate_paise: toPaise(item.rate),
          gst_rate: item.gstRate,
          reorder_level: item.reorderLevel,
          track_batch: item.trackBatch,
        })),
        batches: local.batches.map((batch) => ({ key: batch.id, item_key: batch.itemId, batch_no: batch.batchNo, expiry: batch.expiry })),
        purchase_orders: local.purchaseOrders.map((order) => ({
          key: order.id,
          number: order.number,
          vendor: order.vendor,
          location_id: order.locationId,
          lines: order.lines.map((line) => ({ item_key: line.itemId, qty: line.qty, rate_paise: toPaise(line.rate) })),
        })),
        // Only goods received are loaded; the other movements in the demo come from steps not on the server yet.
        movements: local.movements
          .filter((move) => move.type === "receipt")
          .map((move) => ({ key: move.id, item_key: move.itemId, location_id: move.locationId, batch_no: move.batchNo, qty: move.qty, reason: move.reason, booked_on: move.date })),
      }),
    });
    ledger = await api<ServerLedger>("/operations/ledger");
  }
  apply(ledger);
}

/** Adds an item to the item master on the server. The screen keeps it once the server accepts it. */
export async function addItemRecord(input: Omit<Item, "id">): Promise<string | null> {
  if (demoMode) return useOperationsStore.getState().addItem(input);
  const key = `itm-${Date.now()}`;
  try {
    await api("/operations/items", {
      method: "POST",
      body: JSON.stringify({
        key,
        name: input.name,
        sku: input.sku,
        unit: input.unit,
        hsn: input.hsn,
        rate_paise: toPaise(input.rate),
        gst_rate: input.gstRate,
        reorder_level: input.reorderLevel,
        track_batch: input.trackBatch,
      }),
    });
    await syncOperations();
    return null;
  } catch (error: unknown) {
    return message(error);
  }
}

/** Books goods received at a location. A new batch needs its expiry date. */
export async function receiveStock(
  input: { itemId: string; locationId: number; batchNo: string | null; expiry: string | null; qty: number; reason: string },
  by: string,
): Promise<string | null> {
  if (demoMode) return useOperationsStore.getState().receive(input, by);
  const locked = periodLockProblem(TODAY);
  if (locked) return locked;
  const item = useOperationsStore.getState().items.find((row) => row.id === input.itemId);
  if (!item) return "Choose an item.";
  try {
    await api(`/operations/items/${encodeURIComponent(input.itemId)}/receipts`, {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({
        location_id: input.locationId,
        batch_no: input.batchNo,
        expiry: input.expiry,
        qty: input.qty,
        reason: input.reason.trim() || "Goods received",
      }),
    });
    await syncOperations();
    addTrail(trailEntry("operations", TODAY, by, `Received ${input.qty} ${item.unit} of ${item.name}${input.batchNo ? ` (batch ${input.batchNo})` : ""}`));
    return null;
  } catch (error: unknown) {
    return message(error);
  }
}

/** Asks for a stock change. Above the approval value it waits for another person. */
export async function requestAdjustment(
  input: { itemId: string; locationId: number; batchNo: string | null; qty: number; reason: string },
  by: string,
): Promise<string | null> {
  if (demoMode) return useOperationsStore.getState().requestAdjustment(input, by);
  const locked = periodLockProblem(TODAY);
  if (locked) return locked;
  const item = useOperationsStore.getState().items.find((row) => row.id === input.itemId);
  if (!item) return "Choose an item.";
  try {
    const row = await api<ServerAdjustment>(`/operations/items/${encodeURIComponent(input.itemId)}/adjustments`, {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ location_id: input.locationId, batch_no: input.batchNo, qty: input.qty, reason: input.reason.trim() }),
    });
    await syncOperations();
    const change = `${input.qty > 0 ? "+" : ""}${input.qty} ${item.unit} of ${item.name}`;
    const value = row.value_paise / 100;
    addTrail(
      trailEntry(
        "operations",
        TODAY,
        by,
        row.status === "pending" ? `Requested adjustment ${change} (₹${value.toLocaleString("en-IN")}), waiting approval` : `Adjusted ${change}`,
      ),
    );
    return null;
  } catch (error: unknown) {
    return message(error);
  }
}

/** Applies a pending adjustment. The server checks stock again, because it may have moved since. */
export async function approveAdjustment(id: string, by: string): Promise<string | null> {
  if (demoMode) return useOperationsStore.getState().approveAdjustment(id, by);
  const locked = periodLockProblem(TODAY);
  if (locked) return locked;
  try {
    await api(`/operations/adjustments/${encodeURIComponent(id)}/approve`, { method: "POST" });
    await syncOperations();
    return null;
  } catch (error: unknown) {
    return message(error);
  }
}

export async function rejectAdjustment(id: string, reason: string, by: string): Promise<string | null> {
  if (demoMode) return useOperationsStore.getState().rejectAdjustment(id, reason, by);
  try {
    await api(`/operations/adjustments/${encodeURIComponent(id)}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason: reason.trim() }),
    });
    await syncOperations();
    return null;
  } catch (error: unknown) {
    return message(error);
  }
}

function addTrail(entry: TrailEntry) {
  useOperationsStore.setState((state) => ({ trail: withTrail(state.trail, entry) }));
}

/** Books a dispatch on the server. Its lines leave stock in the same step; the screen then reloads the ledger. */
export async function createDispatch(input: DispatchInput, by: string): Promise<string | null> {
  if (demoMode) return useOperationsStore.getState().createDispatch(input, by);
  const locked = periodLockProblem(TODAY);
  if (locked) return locked;
  try {
    const row = await api<ServerDispatch>("/operations/dispatches", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({
        location_id: input.locationId,
        customer: input.customer,
        customer_company: input.customerCompany,
        deal_ref: input.dealId ?? null,
        transporter: input.transporter ?? null,
        lr_number: input.lrNumber ?? null,
        lines: input.lines.map((line) => ({ item_key: line.itemId, batch_no: line.batchNo, qty: line.qty, rate_paise: toPaise(line.rate) })),
      }),
    });
    await syncOperations();
    const units = row.lines.reduce((sum, line) => sum + line.qty, 0);
    addTrail(trailEntry("operations", TODAY, by, `Dispatched ${row.number} to ${row.customer} · ${units} units`));
    return null;
  } catch (error: unknown) {
    return message(error);
  }
}

/** Marks the goods picked, packed or shipped, in that order. */
export async function checkpointDispatch(id: string, stage: "picked" | "packed" | "shipped", by: string): Promise<string | null> {
  if (demoMode) return useOperationsStore.getState().checkpointDispatch(id, stage, by);
  const number = useOperationsStore.getState().dispatches.find((item) => item.id === id)?.number ?? id;
  try {
    await api(`/operations/dispatches/${encodeURIComponent(id)}/checkpoints/${stage}`, { method: "POST" });
    await syncOperations();
    addTrail(trailEntry("operations", TODAY, by, `${number} ${stage}`));
    return null;
  } catch (error: unknown) {
    return message(error);
  }
}

/** Records proof of delivery. The goods must be shipped first. */
export async function markDelivered(id: string, proof: string, by: string): Promise<string | null> {
  if (demoMode) return useOperationsStore.getState().markDelivered(id, proof, by);
  const number = useOperationsStore.getState().dispatches.find((item) => item.id === id)?.number ?? id;
  try {
    await api(`/operations/dispatches/${encodeURIComponent(id)}/deliver`, {
      method: "POST",
      body: JSON.stringify({ proof: proof.trim() }),
    });
    await syncOperations();
    addTrail(trailEntry("operations", TODAY, by, `Delivered ${number} · proof: ${proof.trim()}`));
    return null;
  } catch (error: unknown) {
    return message(error);
  }
}

/** Authorises a return against a dispatch. Its stock comes back only after inspection. */
export async function authoriseReturn(
  input: { dispatchId: string; itemId: string; qty: number; reason: string },
  by: string,
): Promise<string | null> {
  if (demoMode) return useOperationsStore.getState().authoriseReturn(input, by);
  const locked = periodLockProblem(TODAY);
  if (locked) return locked;
  try {
    const row = await api<ServerReturn>("/operations/returns", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ dispatch_id: Number(input.dispatchId), item_key: input.itemId, qty: input.qty, reason: input.reason.trim() }),
    });
    await syncOperations();
    addTrail(trailEntry("operations", TODAY, by, `Authorised ${row.number} for ${input.qty} from ${input.dispatchId}`));
    return null;
  } catch (error: unknown) {
    return message(error);
  }
}

/** Records the condition of returned goods. Good goods go back into stock. */
export async function inspectReturn(id: string, condition: "good" | "damaged", by: string): Promise<string | null> {
  if (demoMode) return useOperationsStore.getState().inspectReturn(id, condition, by);
  const locked = periodLockProblem(TODAY);
  if (locked) return locked;
  try {
    const row = await api<ServerReturn>(`/operations/returns/${encodeURIComponent(id)}/inspect`, {
      method: "POST",
      body: JSON.stringify({ condition }),
    });
    await syncOperations();
    addTrail(trailEntry("operations", TODAY, by, `Inspected ${row.number}: ${row.qty} ${condition === "good" ? "back to stock" : "not restocked (damaged)"}`));
    return null;
  } catch (error: unknown) {
    return message(error);
  }
}

/** Sends stock to another location. It leaves the sender now and arrives when received. */
export async function sendTransfer(
  input: Omit<Transfer, "id" | "number" | "date" | "status" | "by" | "batchNo"> & { batchNo?: string | null },
  by: string,
): Promise<string | null> {
  if (demoMode) return useOperationsStore.getState().sendTransfer(input, by);
  const locked = periodLockProblem(TODAY);
  if (locked) return locked;
  try {
    const row = await api<ServerTransfer>("/operations/transfers", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({
        item_key: input.itemId,
        batch_no: input.batchNo ?? null,
        qty: input.qty,
        from_location_id: input.fromLocationId,
        to_location_id: input.toLocationId,
        transporter: input.transporter,
        lr_number: input.lrNumber || null,
      }),
    });
    await syncOperations();
    addTrail(trailEntry("operations", TODAY, by, `Sent ${input.qty} of ${row.item_key} under ${row.number}`));
    return null;
  } catch (error: unknown) {
    return message(error);
  }
}

/** Marks a transfer received. The stock arrives at the receiving location. */
export async function receiveTransfer(id: string, by: string): Promise<string | null> {
  if (demoMode) return useOperationsStore.getState().receiveTransfer(id, by);
  const locked = periodLockProblem(TODAY);
  if (locked) return locked;
  const number = useOperationsStore.getState().transfers.find((item) => item.id === id)?.number ?? id;
  try {
    await api(`/operations/transfers/${encodeURIComponent(id)}/receive`, { method: "POST" });
    await syncOperations();
    addTrail(trailEntry("operations", TODAY, by, `Received ${number}`));
    return null;
  } catch (error: unknown) {
    return message(error);
  }
}

/**
 * Records a physical count at a location. Each difference becomes an adjustment, which waits for approval
 * when it is above the approval value.
 */
export async function recordCount(
  locationId: number,
  counts: { itemId: string; batchNo?: string | null; counted: number }[],
  by: string,
): Promise<string | null> {
  if (demoMode) return useOperationsStore.getState().recordCount(locationId, counts, by);
  const locked = periodLockProblem(TODAY);
  if (locked) return locked;
  try {
    const row = await api<ServerCount>("/operations/counts", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({
        location_id: locationId,
        lines: counts.map((line) => ({ item_key: line.itemId, batch_no: line.batchNo ?? null, counted: line.counted })),
      }),
    });
    await syncOperations();
    const differences = row.lines.filter((line) => line.variance !== 0).length;
    addTrail(trailEntry("operations", TODAY, by, `Counted ${row.number}: ${differences} difference${differences === 1 ? "" : "s"}`));
    return null;
  } catch (error: unknown) {
    return message(error);
  }
}

/** Raises a purchase order on the server. The order's number comes from the server. */
export async function addPurchaseOrder(
  input: { vendor: string; locationId: number; lines: { itemId: string; qty: number; rate: number }[] },
  by: string,
): Promise<string | null> {
  if (demoMode) return useOperationsStore.getState().addPurchaseOrder(input, by);
  const locked = periodLockProblem(TODAY);
  if (locked) return locked;
  try {
    const row = await api<ServerPurchaseOrder>("/operations/purchase-orders", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({
        key: `po-${crypto.randomUUID()}`,
        vendor: input.vendor,
        location_id: input.locationId,
        lines: input.lines.map((line) => ({ item_key: line.itemId, qty: line.qty, rate_paise: toPaise(line.rate) })),
      }),
    });
    await syncOperations();
    addTrail(trailEntry("operations", TODAY, by, `Raised purchase order ${row.number} to ${row.vendor}`));
    return null;
  } catch (error: unknown) {
    return message(error);
  }
}

/** Books goods received against a purchase order, up to what is still due on each line. */
export async function receiveAgainstPO(
  poId: string,
  receipts: { itemId: string; qty: number }[],
  by: string,
): Promise<string | null> {
  if (demoMode) return useOperationsStore.getState().receiveAgainstPO(poId, receipts, by);
  const locked = periodLockProblem(TODAY);
  if (locked) return locked;
  const order = useOperationsStore.getState().purchaseOrders.find((item) => item.id === poId);
  try {
    await api<ServerPurchaseOrder>(`/operations/purchase-orders/${encodeURIComponent(poId)}/receive`, {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ receipts: receipts.map((receipt) => ({ item_key: receipt.itemId, qty: receipt.qty })) }),
    });
    await syncOperations();
    const summary = receipts.map((receipt) => `${receipt.qty} ${useOperationsStore.getState().items.find((item) => item.id === receipt.itemId)?.unit ?? ""}`).join(", ");
    addTrail(trailEntry("operations", TODAY, by, `Received goods against ${order?.number ?? poId}: ${summary}`));
    return null;
  } catch (error: unknown) {
    return message(error);
  }
}

/** Raises a requisition to buy. The server checks that the budget line exists. */
export async function addRequisition(
  input: { itemId: string; qty: number; estimatedRate: number; locationId: number; budgetLineId: string; reason: string },
  by: string,
): Promise<string | null> {
  if (demoMode) return useOperationsStore.getState().addRequisition(input, by);
  try {
    const row = await api<ServerRequisition>("/operations/requisitions", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({
        key: `req-${crypto.randomUUID()}`,
        item_key: input.itemId,
        qty: input.qty,
        estimated_rate_paise: toPaise(input.estimatedRate),
        location_id: input.locationId,
        budget_line_key: input.budgetLineId,
        reason: input.reason.trim(),
      }),
    });
    await syncOperations();
    addTrail(trailEntry("operations", TODAY, by, `Raised requisition ${row.number} for ${input.qty}`));
    return null;
  } catch (error: unknown) {
    return message(error);
  }
}

/**
 * Approves a requisition. The server reads the budget line itself, so the figure the screen shows is
 * not used here; the server refuses when the line no longer has the money.
 */
export async function approveRequisition(id: string, _availableBudget: number, by: string): Promise<string | null> {
  if (demoMode) return useOperationsStore.getState().approveRequisition(id, _availableBudget, by);
  const number = useOperationsStore.getState().requisitions.find((item) => item.id === id)?.number ?? id;
  try {
    await api(`/operations/requisitions/${encodeURIComponent(id)}/approve`, { method: "POST" });
    await syncOperations();
    addTrail(trailEntry("operations", TODAY, by, `Approved requisition ${number}`));
    return null;
  } catch (error: unknown) {
    return message(error);
  }
}

export async function rejectRequisition(id: string, reason: string, by: string): Promise<string | null> {
  if (demoMode) return useOperationsStore.getState().rejectRequisition(id, reason, by);
  const number = useOperationsStore.getState().requisitions.find((item) => item.id === id)?.number ?? id;
  try {
    await api(`/operations/requisitions/${encodeURIComponent(id)}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason: reason.trim() }),
    });
    await syncOperations();
    addTrail(trailEntry("operations", TODAY, by, `Rejected requisition ${number}: ${reason.trim()}`));
    return null;
  } catch (error: unknown) {
    return message(error);
  }
}

/** Turns an approved requisition into a purchase order to the vendor, once. */
export async function orderRequisition(id: string, vendor: string, by: string): Promise<string | null> {
  if (demoMode) return useOperationsStore.getState().orderRequisition(id, vendor, by);
  try {
    const row = await api<ServerRequisition>(`/operations/requisitions/${encodeURIComponent(id)}/order`, {
      method: "POST",
      body: JSON.stringify({ vendor }),
    });
    await syncOperations();
    addTrail(trailEntry("operations", TODAY, by, `Raised purchase order ${row.po_number ?? ""} from ${row.number}`));
    return null;
  } catch (error: unknown) {
    return message(error);
  }
}
