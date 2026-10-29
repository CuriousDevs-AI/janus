"use client";

import { api, message } from "@/lib/api/client";
import { demoMode } from "@/lib/demo-mode";
import { toPaise } from "@/lib/finance-records";
import { type TrailEntry, trailEntry, withTrail } from "@/lib/stores/audit-trail";
import { periodLockProblem } from "@/lib/stores/period-lock-store";
import { type Adjustment, type Batch, type Item, type Movement, TODAY, useOperationsStore } from "@/lib/stores/operations-store";

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
  kind: "receipt" | "adjustment";
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
interface ServerLedger {
  items: ServerItem[];
  batches: ServerBatch[];
  movements: ServerMovement[];
  adjustments: ServerAdjustment[];
}

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
  type: row.kind,
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

function apply(ledger: ServerLedger) {
  useOperationsStore.setState({
    items: ledger.items.map(toItem),
    batches: ledger.batches.map(toBatch),
    movements: ledger.movements.map(toMovement),
    adjustments: ledger.adjustments.map(toAdjustment),
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
