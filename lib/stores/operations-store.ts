"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { isFirstCompany } from "@/lib/companies";
import { scoped } from "@/lib/company";

/**
 * Operations & Inventory (phase 1): item master, stock by location and batch, stock movements,
 * dispatches with delivery challans, returns and stock adjustments. Stock never goes negative.
 * Each company keeps its own records. Warehouses are the company's locations (Company Profile).
 */

export const ADJUSTMENT_APPROVAL_VALUE = 10000;
export const TODAY = "2026-10-23";

export interface Item { id: string; name: string; sku: string; unit: string; hsn: string; rate: number; gstRate: number; reorderLevel: number; trackBatch: boolean }
export interface Batch { id: string; itemId: string; batchNo: string; expiry: string }
export type MovementType = "receipt" | "dispatch" | "return" | "adjustment";
export interface Movement { id: string; date: string; type: MovementType; itemId: string; locationId: number; batchNo: string | null; qty: number; reason: string; by: string }
export interface DispatchLine { itemId: string; batchNo: string | null; qty: number; rate: number }
export interface Dispatch {
  id: string; number: string; challanNo: string; date: string; customer: string; customerCompany: string; locationId: number;
  lines: DispatchLine[]; status: "dispatched" | "delivered"; proof?: string; createdBy: string; deliveredBy?: string;
}
export interface Adjustment { id: string; date: string; itemId: string; locationId: number; batchNo: string | null; qty: number; reason: string; status: "pending" | "applied"; by: string; approvedBy?: string; value: number }

interface OperationsState {
  items: Item[];
  batches: Batch[];
  movements: Movement[];
  dispatches: Dispatch[];
  adjustments: Adjustment[];
  addItem: (input: Omit<Item, "id">) => string | null;
  receive: (input: { itemId: string; locationId: number; batchNo: string | null; expiry: string | null; qty: number; reason: string }, by: string) => string | null;
  createDispatch: (input: { customer: string; customerCompany: string; locationId: number; lines: DispatchLine[] }, by: string) => string | null;
  markDelivered: (id: string, proof: string, by: string) => string | null;
  recordReturn: (input: { dispatchId: string; itemId: string; qty: number; condition: "good" | "damaged"; reason: string }, by: string) => string | null;
  requestAdjustment: (input: { itemId: string; locationId: number; batchNo: string | null; qty: number; reason: string }, by: string) => string | null;
  approveAdjustment: (id: string, by: string) => string | null;
}

const seed = (): Pick<OperationsState, "items" | "batches" | "movements" | "dispatches" | "adjustments"> => {
  if (!isFirstCompany) return { items: [], batches: [], movements: [], dispatches: [], adjustments: [] };
  const items: Item[] = [
    { id: "itm-1", name: "Corrugated box 12 x 9 in", sku: "PK-1209", unit: "piece", hsn: "4819", rate: 28, gstRate: 12, reorderLevel: 500, trackBatch: false },
    { id: "itm-2", name: "Stretch film 500 mm", sku: "PK-FILM5", unit: "roll", hsn: "3920", rate: 410, gstRate: 18, reorderLevel: 40, trackBatch: false },
    { id: "itm-3", name: "Pedestal fan 400 mm", sku: "FN-400", unit: "piece", hsn: "8414", rate: 1850, gstRate: 18, reorderLevel: 30, trackBatch: false },
    { id: "itm-4", name: "Floor cleaner 5 L", sku: "HC-FC5", unit: "carton", hsn: "3402", rate: 380, gstRate: 18, reorderLevel: 25, trackBatch: true },
  ];
  const batches: Batch[] = [
    { id: "bat-1", itemId: "itm-4", batchNo: "FC-2609-A", expiry: "2027-09-30" },
    { id: "bat-2", itemId: "itm-4", batchNo: "FC-2507-B", expiry: "2026-11-10" },
  ];
  const movements: Movement[] = [
    { id: "mv-1", date: "2026-10-01", type: "receipt", itemId: "itm-1", locationId: 2, batchNo: null, qty: 2400, reason: "Opening stock", by: "Neha Verma" },
    { id: "mv-2", date: "2026-10-01", type: "receipt", itemId: "itm-2", locationId: 2, batchNo: null, qty: 120, reason: "Opening stock", by: "Neha Verma" },
    { id: "mv-3", date: "2026-10-01", type: "receipt", itemId: "itm-3", locationId: 1, batchNo: null, qty: 22, reason: "Opening stock", by: "Neha Verma" },
    { id: "mv-4", date: "2026-10-02", type: "receipt", itemId: "itm-4", locationId: 2, batchNo: "FC-2609-A", qty: 180, reason: "Goods received", by: "Neha Verma" },
    { id: "mv-5", date: "2026-10-02", type: "receipt", itemId: "itm-4", locationId: 2, batchNo: "FC-2507-B", qty: 30, reason: "Goods received", by: "Neha Verma" },
  ];
  return { items, batches, movements, dispatches: [], adjustments: [] };
};

/** Stock on hand for an item at a location (and batch, when the item tracks batches). */
export function stockOn(movements: Movement[], itemId: string, locationId?: number, batchNo?: string | null) {
  return movements
    .filter((m) => m.itemId === itemId && (locationId === undefined || m.locationId === locationId) && (batchNo === undefined || m.batchNo === batchNo))
    .reduce((sum, m) => sum + m.qty, 0);
}

export function isExpired(batch: Batch | undefined) {
  return !!batch && batch.expiry < TODAY;
}

const nextNumber = (prefix: string, count: number) => `${prefix}-2026-${String(101 + count).padStart(4, "0")}`;

export const useOperationsStore = create<OperationsState>()(
  persist(
    (set, get) => ({
      ...seed(),
      addItem: (input) => {
        if (input.name.trim().length < 2) return "Enter the item name.";
        if (!/^\d{4,8}$/.test(input.hsn.trim())) return "HSN code must be 4 to 8 digits.";
        if (get().items.some((item) => item.sku.toLowerCase() === input.sku.trim().toLowerCase())) return "This SKU already exists.";
        set((state) => ({ items: [...state.items, { ...input, id: `itm-${Date.now()}` }] }));
        return null;
      },
      receive: (input, by) => {
        const item = get().items.find((i) => i.id === input.itemId);
        if (!item) return "Choose an item.";
        if (input.qty <= 0) return "Enter a quantity above zero.";
        let batchNo = input.batchNo;
        if (item.trackBatch) {
          if (!batchNo || batchNo.trim().length < 2) return "This item tracks batches. Enter the batch number.";
          batchNo = batchNo.trim();
          const known = get().batches.find((b) => b.itemId === item.id && b.batchNo === batchNo);
          if (!known) {
            if (!input.expiry) return "A new batch needs an expiry date.";
            set((state) => ({ batches: [...state.batches, { id: `bat-${Date.now()}`, itemId: item.id, batchNo: batchNo as string, expiry: input.expiry as string }] }));
          }
        }
        set((state) => ({ movements: [{ id: `mv-${Date.now()}`, date: TODAY, type: "receipt", itemId: item.id, locationId: input.locationId, batchNo: batchNo ?? null, qty: input.qty, reason: input.reason.trim() || "Goods received", by }, ...state.movements] }));
        return null;
      },
      createDispatch: (input, by) => {
        if (input.customer.trim().length < 2) return "Enter the customer name.";
        if (input.lines.length === 0) return "Add at least one item to the dispatch.";
        const { items, batches, movements } = get();
        for (const line of input.lines) {
          const item = items.find((i) => i.id === line.itemId);
          if (!item) return "An item on the dispatch was not found.";
          if (line.qty <= 0) return `Enter a quantity above zero for ${item.name}.`;
          if (item.trackBatch) {
            if (!line.batchNo) return `Choose a batch for ${item.name}.`;
            const batch = batches.find((b) => b.itemId === item.id && b.batchNo === line.batchNo);
            if (isExpired(batch)) return `Batch ${line.batchNo} has expired and cannot be dispatched.`;
          }
          const available = stockOn(movements, item.id, input.locationId, item.trackBatch ? line.batchNo : undefined);
          if (line.qty > available) return `Only ${available} ${item.unit} of ${item.name} is in stock here.`;
        }
        const number = nextNumber("DN", get().dispatches.length);
        const id = `dsp-${Date.now()}`;
        const dispatch: Dispatch = { id, number, challanNo: `DC-${number.slice(3)}`, date: TODAY, customer: input.customer.trim(), customerCompany: input.customerCompany.trim(), locationId: input.locationId, lines: input.lines, status: "dispatched", createdBy: by };
        const outgoing: Movement[] = input.lines.map((line, i) => ({ id: `mv-${Date.now()}-${i}`, date: TODAY, type: "dispatch", itemId: line.itemId, locationId: input.locationId, batchNo: line.batchNo, qty: -line.qty, reason: `Dispatch ${number}`, by }));
        set((state) => ({ dispatches: [dispatch, ...state.dispatches], movements: [...outgoing, ...state.movements] }));
        return null;
      },
      markDelivered: (id, proof, by) => {
        const dispatch = get().dispatches.find((d) => d.id === id);
        if (!dispatch) return "Dispatch not found.";
        if (dispatch.status === "delivered") return "This dispatch is already delivered.";
        if (proof.trim().length < 3) return "Add proof of delivery: receiver name, signed challan number or photo reference.";
        set((state) => ({ dispatches: state.dispatches.map((d) => d.id === id ? { ...d, status: "delivered", proof: proof.trim(), deliveredBy: by } : d) }));
        return null;
      },
      recordReturn: (input, by) => {
        const dispatch = get().dispatches.find((d) => d.id === input.dispatchId);
        if (!dispatch) return "Choose the dispatch this return belongs to.";
        const line = dispatch.lines.find((l) => l.itemId === input.itemId);
        if (!line) return "That item was not on this dispatch.";
        if (input.qty <= 0 || input.qty > line.qty) return `Return between 1 and ${line.qty}.`;
        if (input.reason.trim().length < 3) return "Give the reason for the return.";
        if (input.condition === "good") {
          set((state) => ({ movements: [{ id: `mv-${Date.now()}`, date: TODAY, type: "return", itemId: input.itemId, locationId: dispatch.locationId, batchNo: line.batchNo, qty: input.qty, reason: `Return from ${dispatch.number}: ${input.reason.trim()}`, by }, ...state.movements] }));
        }
        return null;
      },
      requestAdjustment: (input, by) => {
        const item = get().items.find((i) => i.id === input.itemId);
        if (!item) return "Choose an item.";
        if (input.qty === 0) return "Enter a quantity that is not zero.";
        if (input.reason.trim().length < 3) return "Give the reason for the adjustment.";
        const available = stockOn(get().movements, item.id, input.locationId, item.trackBatch ? input.batchNo : undefined);
        if (input.qty < 0 && -input.qty > available) return `Only ${available} ${item.unit} is in stock here.`;
        const value = Math.abs(input.qty) * item.rate;
        const needsApproval = value > ADJUSTMENT_APPROVAL_VALUE;
        const adjustment: Adjustment = { id: `adj-${Date.now()}`, date: TODAY, value, status: needsApproval ? "pending" : "applied", by, ...input, reason: input.reason.trim() };
        set((state) => ({
          adjustments: [adjustment, ...state.adjustments],
          movements: needsApproval ? state.movements : [{ id: `mv-${Date.now()}`, date: TODAY, type: "adjustment", itemId: item.id, locationId: input.locationId, batchNo: input.batchNo, qty: input.qty, reason: input.reason.trim(), by }, ...state.movements],
        }));
        return null;
      },
      approveAdjustment: (id, by) => {
        const adjustment = get().adjustments.find((a) => a.id === id);
        if (!adjustment) return "Adjustment not found.";
        if (adjustment.status !== "pending") return "This adjustment is already applied.";
        if (adjustment.by === by) return "The person who requested an adjustment cannot approve it.";
        set((state) => ({
          adjustments: state.adjustments.map((a) => a.id === id ? { ...a, status: "applied", approvedBy: by } : a),
          movements: [{ id: `mv-${Date.now()}`, date: TODAY, type: "adjustment", itemId: adjustment.itemId, locationId: adjustment.locationId, batchNo: adjustment.batchNo, qty: adjustment.qty, reason: adjustment.reason, by }, ...state.movements],
        }));
        return null;
      },
    }),
    { name: scoped("janus.operations.v1"), storage: createJSONStorage(() => localStorage), partialize: (state) => ({ items: state.items, batches: state.batches, movements: state.movements, dispatches: state.dispatches, adjustments: state.adjustments }) },
  ),
);
