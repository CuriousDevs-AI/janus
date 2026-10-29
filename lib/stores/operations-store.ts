"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { workspaceStorage } from "@/lib/stores/workspace-storage";
import { isFirstCompany } from "@/lib/companies";
import { scoped } from "@/lib/company";
import { periodLockProblem } from "@/lib/stores/period-lock-store";
import { workflowRules } from "@/lib/stores/workflow-rules-store";
import { type TrailEntry, trailEntry, withTrail } from "@/lib/stores/audit-trail";
import { demoMode } from "@/lib/demo-mode";

/**
 * Operations & Inventory (phase 1): item master, stock by location and batch, stock movements,
 * dispatches with delivery challans, returns and stock adjustments. Stock never goes negative.
 * Each company keeps its own records. Warehouses are the company's locations (Company Profile).
 */

export const ADJUSTMENT_APPROVAL_VALUE = 10000;
export const TODAY = "2026-10-23";

export interface Item { id: string; name: string; sku: string; unit: string; hsn: string; rate: number; gstRate: number; reorderLevel: number; trackBatch: boolean }
export interface Batch { id: string; itemId: string; batchNo: string; expiry: string }
export type MovementType = "receipt" | "dispatch" | "return" | "adjustment" | "transfer";
export interface Movement { id: string; date: string; type: MovementType; itemId: string; locationId: number; batchNo: string | null; qty: number; reason: string; by: string }
export interface DispatchLine { itemId: string; batchNo: string | null; qty: number; rate: number }
export interface Dispatch {
  id: string; number: string; challanNo: string; date: string; customer: string; customerCompany: string; locationId: number;
  lines: DispatchLine[]; status: "dispatched" | "delivered"; proof?: string; createdBy: string; deliveredBy?: string; dealId?: string;
  /** Logistics: who carries the goods and the transporter's LR (docket) number, when given. */
  transporter?: string; lrNumber?: string;
  /** Pick, pack and ship checkpoints, each with who did it. A delivery needs the goods shipped first. */
  picked?: string; packed?: string; shipped?: string;
}
/** One line of a purchase order: what was ordered, at what rate, and how much has come in. */
export interface PoLine { itemId: string; qty: number; rate: number; received: number }
export interface PurchaseOrder { id: string; number: string; vendor: string; date: string; locationId: number; lines: PoLine[]; createdBy: string }
/** A request to buy an item. Another person approves it; once approved it is turned into a purchase order. */
export interface Requisition { id: string; number: string; requester: string; itemId: string; qty: number; estimatedRate: number; locationId: number; budgetLineId: string; reason: string; status: "pending" | "approved" | "rejected" | "ordered"; decidedBy?: string; rejectedReason?: string; poNumber?: string; raisedOn: string }
/** A physical count of one location: what the system said, what was counted, and the difference. */
export interface StockCount { id: string; number: string; date: string; locationId: number; lines: { itemId: string; batchNo: string | null; system: number; counted: number; variance: number }[]; by: string }
/** Stock moved from one location to another. It leaves the sending location when it is sent, and arrives when it is received. */
export interface Transfer { id: string; number: string; date: string; itemId: string; qty: number; batchNo: string | null; fromLocationId: number; toLocationId: number; transporter: string; lrNumber: string; status: "in transit" | "received"; by: string }
/** A return authorised before the goods come back (RMA). Stock changes only after inspection, and only if the goods are good. */
export interface Return { id: string; number: string; dispatchId: string; itemId: string; batchNo: string | null; qty: number; reason: string; status: "authorised" | "inspected"; condition?: "good" | "damaged"; raisedBy: string; inspectedBy?: string; locationId: number }
export interface Adjustment { id: string; date: string; itemId: string; locationId: number; batchNo: string | null; qty: number; reason: string; status: "pending" | "applied" | "rejected"; by: string; approvedBy?: string; rejectedBy?: string; value: number }

interface OperationsState {
  items: Item[];
  batches: Batch[];
  movements: Movement[];
  dispatches: Dispatch[];
  adjustments: Adjustment[];
  purchaseOrders: PurchaseOrder[];
  requisitions: Requisition[];
  counts: StockCount[];
  transfers: Transfer[];
  returns: Return[];
  trail: TrailEntry[];
  addItem: (input: Omit<Item, "id">) => string | null;
  receive: (input: { itemId: string; locationId: number; batchNo: string | null; expiry: string | null; qty: number; reason: string }, by: string) => string | null;
  addRequisition: (input: { itemId: string; qty: number; estimatedRate: number; locationId: number; budgetLineId: string; reason: string }, by: string) => string | null;
  approveRequisition: (id: string, availableBudget: number, by: string) => string | null;
  rejectRequisition: (id: string, reason: string, by: string) => string | null;
  orderRequisition: (id: string, vendor: string, by: string) => string | null;
  addPurchaseOrder: (input: { vendor: string; locationId: number; lines: { itemId: string; qty: number; rate: number }[] }, by: string) => string | null;
  receiveAgainstPO: (poId: string, receipts: { itemId: string; qty: number }[], by: string) => string | null;
  createDispatch: (input: { customer: string; customerCompany: string; locationId: number; lines: DispatchLine[]; dealId?: string; transporter?: string; lrNumber?: string }, by: string) => string | null;
  markDelivered: (id: string, proof: string, by: string) => string | null;
  checkpointDispatch: (id: string, stage: "picked" | "packed" | "shipped", by: string) => string | null;
  authoriseReturn: (input: { dispatchId: string; itemId: string; qty: number; reason: string }, by: string) => string | null;
  inspectReturn: (id: string, condition: "good" | "damaged", by: string) => string | null;
  requestAdjustment: (input: { itemId: string; locationId: number; batchNo: string | null; qty: number; reason: string }, by: string) => string | null;
  sendTransfer: (input: Omit<Transfer, "id" | "number" | "date" | "status" | "by" | "batchNo"> & { batchNo?: string | null }, by: string) => string | null;
  receiveTransfer: (id: string, by: string) => string | null;
  recordCount: (locationId: number, counts: { itemId: string; batchNo?: string | null; counted: number }[], by: string) => string | null;
  approveAdjustment: (id: string, by: string) => string | null;
  rejectAdjustment: (id: string, reason: string, by: string) => string | null;
}

const seed = (): Pick<OperationsState, "items" | "batches" | "movements" | "dispatches" | "adjustments" | "purchaseOrders" | "requisitions" | "counts" | "transfers" | "returns"> => {
  if (!isFirstCompany) return { items: [], batches: [], movements: [], dispatches: [], adjustments: [], purchaseOrders: [], requisitions: [], counts: [], transfers: [], returns: [] };
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
  const purchaseOrders: PurchaseOrder[] = [
    { id: "po-1", number: "PO-2026-0101", vendor: "Gurugram Packaging Co", date: "2026-10-15", locationId: 2, lines: [{ itemId: "itm-1", qty: 1000, rate: 45, received: 0 }], createdBy: "Neha Verma" },
  ];
  return { items, batches, movements, dispatches: [], adjustments: [], purchaseOrders, requisitions: [], counts: [], transfers: [], returns: [] };
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
      trail: [],
      purchaseOrders: seed().purchaseOrders,
      addItem: (input) => {
        if (!demoMode) return "Stock changes are recorded on the server.";
        if (input.name.trim().length < 2) return "Enter the item name.";
        if (!/^\d{4,8}$/.test(input.hsn.trim())) return "HSN code must be 4 to 8 digits.";
        if (get().items.some((item) => item.sku.toLowerCase() === input.sku.trim().toLowerCase())) return "This SKU already exists.";
        set((state) => ({ items: [...state.items, { ...input, id: `itm-${Date.now()}` }] }));
        return null;
      },
      addRequisition: (input, by) => {
        if (!get().items.some((i) => i.id === input.itemId)) return "Choose an item.";
        if (!(input.qty > 0)) return "Enter a quantity above zero.";
        if (!(input.estimatedRate >= 0)) return "The estimated rate cannot be negative.";
        if (!input.budgetLineId) return "Choose the budget line this buying is paid from.";
        if (input.reason.trim().length < 5) return "Say why it is needed.";
        const number = nextNumber("REQ", get().requisitions.length);
        const requisition: Requisition = { ...input, id: `req-${Date.now()}`, number, requester: by, reason: input.reason.trim(), status: "pending", raisedOn: TODAY };
        set((state) => ({
          requisitions: [requisition, ...state.requisitions],
          trail: withTrail(state.trail, trailEntry("operations", TODAY, by, `Raised requisition ${number} for ${input.qty} of ${get().items.find((i) => i.id === input.itemId)?.name ?? "an item"}`)),
        }));
        return null;
      },
      approveRequisition: (id, availableBudget, by) => {
        const req = get().requisitions.find((r) => r.id === id);
        if (!req) return "Requisition not found.";
        if (req.status !== "pending") return "Only a pending requisition can be approved.";
        if (req.requester === by) return "The person who raised a requisition cannot approve it.";
        const value = req.qty * req.estimatedRate;
        if (value > availableBudget + 0.001) return `The budget line has ₹${availableBudget.toLocaleString("en-IN")} left; this requisition needs ₹${value.toLocaleString("en-IN")}.`;
        set((state) => ({
          requisitions: state.requisitions.map((r) => r.id === id ? { ...r, status: "approved", decidedBy: by } : r),
          trail: withTrail(state.trail, trailEntry("operations", TODAY, by, `Approved requisition ${req.number} · ₹${value.toLocaleString("en-IN")}`)),
        }));
        return null;
      },
      rejectRequisition: (id, reason, by) => {
        const req = get().requisitions.find((r) => r.id === id);
        if (!req) return "Requisition not found.";
        if (req.status !== "pending") return "Only a pending requisition can be rejected.";
        if (req.requester === by) return "The person who raised a requisition cannot reject it.";
        if (reason.trim().length < 3) return "Give the reason for rejecting it.";
        set((state) => ({
          requisitions: state.requisitions.map((r) => r.id === id ? { ...r, status: "rejected", decidedBy: by, rejectedReason: reason.trim() } : r),
          trail: withTrail(state.trail, trailEntry("operations", TODAY, by, `Rejected requisition ${req.number}: ${reason.trim()}`)),
        }));
        return null;
      },
      orderRequisition: (id, vendor, by) => {
        const req = get().requisitions.find((r) => r.id === id);
        if (!req) return "Requisition not found.";
        if (req.status !== "approved") return "Only an approved requisition can be turned into an order.";
        const before = get().purchaseOrders.length;
        const problem = get().addPurchaseOrder({ vendor, locationId: req.locationId, lines: [{ itemId: req.itemId, qty: req.qty, rate: req.estimatedRate }] }, by);
        if (problem) return problem;
        const order = get().purchaseOrders[0];
        if (get().purchaseOrders.length !== before + 1 || !order) return "The order could not be raised.";
        set((state) => ({ requisitions: state.requisitions.map((r) => r.id === id ? { ...r, status: "ordered", poNumber: order.number } : r) }));
        return null;
      },
      addPurchaseOrder: (input, by) => {
        const locked = periodLockProblem(TODAY);
        if (locked) return locked;
        if (input.vendor.trim().length < 2) return "Enter the vendor name.";
        if (input.lines.length === 0) return "Add at least one item to the order.";
        for (const line of input.lines) {
          const item = get().items.find((i) => i.id === line.itemId);
          if (!item) return "An item on the order was not found.";
          if (!(line.qty > 0)) return `Enter a quantity above zero for ${item.name}.`;
          if (!(line.rate >= 0)) return `The rate for ${item.name} cannot be negative.`;
        }
        const number = nextNumber("PO", get().purchaseOrders.length);
        const order: PurchaseOrder = { id: `po-${Date.now()}`, number, vendor: input.vendor.trim(), date: TODAY, locationId: input.locationId, lines: input.lines.map((line) => ({ ...line, received: 0 })), createdBy: by };
        const value = input.lines.reduce((sum, line) => sum + line.qty * line.rate, 0);
        set((state) => ({
          purchaseOrders: [order, ...state.purchaseOrders],
          trail: withTrail(state.trail, trailEntry("operations", TODAY, by, `Raised purchase order ${number} to ${order.vendor} · ₹${value.toLocaleString("en-IN")}`)),
        }));
        return null;
      },
      receiveAgainstPO: (poId, receipts, by) => {
        if (!demoMode) return "This step is not on the server yet, so real mode does not record it.";
        const locked = periodLockProblem(TODAY);
        if (locked) return locked;
        const order = get().purchaseOrders.find((o) => o.id === poId);
        if (!order) return "Purchase order not found.";
        for (const receipt of receipts) {
          const line = order.lines.find((l) => l.itemId === receipt.itemId);
          if (!line) return "That item is not on this order.";
          const item = get().items.find((i) => i.id === receipt.itemId);
          if (!item) return "Item not found.";
          if (item.trackBatch) return `${item.name} tracks batches. Receive it with its batch number from Receive stock.`;
          if (!(receipt.qty > 0)) return `Enter a quantity above zero for ${item.name}.`;
          if (receipt.qty > line.qty - line.received) return `Only ${line.qty - line.received} ${item.unit} of ${item.name} is still due on this order.`;
        }
        const moves = receipts.filter((r) => r.qty > 0);
        set((state) => ({
          movements: [
            ...moves.map((r, i) => ({ id: `mv-${Date.now()}-${i}`, date: TODAY, type: "receipt" as const, itemId: r.itemId, locationId: order.locationId, batchNo: null, qty: r.qty, reason: `Goods received against ${order.number}`, by })),
            ...state.movements,
          ],
          purchaseOrders: state.purchaseOrders.map((o) => o.id === poId ? { ...o, lines: o.lines.map((l) => {
            const got = moves.find((r) => r.itemId === l.itemId);
            return got ? { ...l, received: l.received + got.qty } : l;
          }) } : o),
          trail: withTrail(state.trail, trailEntry("operations", TODAY, by, `Received goods against ${order.number}: ${moves.map((r) => `${r.qty} ${get().items.find((i) => i.id === r.itemId)?.unit ?? ""}`).join(", ")}`)),
        }));
        return null;
      },
      receive: (input, by) => {
        if (!demoMode) return "Stock changes are recorded on the server.";
        const locked = periodLockProblem(TODAY);
        if (locked) return locked;
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
        set((state) => ({
          movements: [{ id: `mv-${Date.now()}`, date: TODAY, type: "receipt", itemId: item.id, locationId: input.locationId, batchNo: batchNo ?? null, qty: input.qty, reason: input.reason.trim() || "Goods received", by }, ...state.movements],
          trail: withTrail(state.trail, trailEntry("operations", TODAY, by, `Received ${input.qty} ${item.unit} of ${item.name}${batchNo ? ` (batch ${batchNo})` : ""}`)),
        }));
        return null;
      },
      createDispatch: (input, by) => {
        const locked = periodLockProblem(TODAY);
        if (locked) return locked;
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
        const dispatch: Dispatch = { id, number, challanNo: `DC-${number.slice(3)}`, date: TODAY, customer: input.customer.trim(), customerCompany: input.customerCompany.trim(), locationId: input.locationId, lines: input.lines, status: "dispatched", createdBy: by, dealId: input.dealId, transporter: input.transporter?.trim() || undefined, lrNumber: input.lrNumber?.trim() || undefined };
        const outgoing: Movement[] = input.lines.map((line, i) => ({ id: `mv-${Date.now()}-${i}`, date: TODAY, type: "dispatch", itemId: line.itemId, locationId: input.locationId, batchNo: line.batchNo, qty: -line.qty, reason: `Dispatch ${number}`, by }));
        const units = input.lines.reduce((sum, line) => sum + line.qty, 0);
        set((state) => ({
          dispatches: [dispatch, ...state.dispatches],
          movements: [...outgoing, ...state.movements],
          trail: withTrail(state.trail, trailEntry("operations", TODAY, by, `Dispatched ${number} to ${dispatch.customer} · ${units} units`)),
        }));
        return null;
      },
      checkpointDispatch: (id, stage, by) => {
        if (!demoMode) return "Dispatch steps are recorded on the server.";
        const dispatch = get().dispatches.find((d) => d.id === id);
        if (!dispatch) return "Dispatch not found.";
        if (dispatch.status === "delivered") return "This dispatch is already delivered.";
        const order = ["picked", "packed", "shipped"] as const;
        const index = order.indexOf(stage);
        const previous = index > 0 ? order[index - 1] : null;
        if (dispatch[stage]) return `${stage[0].toUpperCase()}${stage.slice(1)} already.`;
        if (previous && !dispatch[previous]) return `Mark the goods ${previous} before ${stage}.`;
        set((state) => ({
          dispatches: state.dispatches.map((d) => d.id === id ? { ...d, [stage]: by } : d),
          trail: withTrail(state.trail, trailEntry("operations", TODAY, by, `${dispatch.number} ${stage}`)),
        }));
        return null;
      },
      markDelivered: (id, proof, by) => {
        if (!demoMode) return "Dispatch steps are recorded on the server.";
        const dispatch = get().dispatches.find((d) => d.id === id);
        if (!dispatch) return "Dispatch not found.";
        if (dispatch.status === "delivered") return "This dispatch is already delivered.";
        if (!dispatch.shipped) return "Ship the goods before recording delivery.";
        if (proof.trim().length < 3) return "Add proof of delivery: receiver name, signed challan number or photo reference.";
        set((state) => ({
          dispatches: state.dispatches.map((d) => d.id === id ? { ...d, status: "delivered", proof: proof.trim(), deliveredBy: by } : d),
          trail: withTrail(state.trail, trailEntry("operations", TODAY, by, `Delivered ${dispatch.number} · proof: ${proof.trim()}`)),
        }));
        return null;
      },
      authoriseReturn: (input, by) => {
        const locked = periodLockProblem(TODAY);
        if (locked) return locked;
        const dispatch = get().dispatches.find((d) => d.id === input.dispatchId);
        if (!dispatch) return "Choose the dispatch this return belongs to.";
        const line = dispatch.lines.find((l) => l.itemId === input.itemId);
        if (!line) return "That item was not on this dispatch.";
        if (input.qty <= 0 || input.qty > line.qty) return `Return between 1 and ${line.qty}.`;
        if (input.reason.trim().length < 3) return "Give the reason for the return.";
        const number = nextNumber("RMA", get().returns.length);
        const rma: Return = { id: `rma-${Date.now()}`, number, dispatchId: dispatch.id, itemId: input.itemId, batchNo: line.batchNo, qty: input.qty, reason: input.reason.trim(), status: "authorised", raisedBy: by, locationId: dispatch.locationId };
        const item = get().items.find((i) => i.id === input.itemId);
        set((state) => ({
          returns: [rma, ...state.returns],
          trail: withTrail(state.trail, trailEntry("operations", TODAY, by, `Authorised ${number} for ${input.qty} ${item?.name ?? "item"} from ${dispatch.number}`)),
        }));
        return null;
      },
      inspectReturn: (id, condition, by) => {
        const locked = periodLockProblem(TODAY);
        if (locked) return locked;
        const rma = get().returns.find((r) => r.id === id);
        if (!rma) return "Return not found.";
        if (rma.status !== "authorised") return "This return has already been inspected.";
        const item = get().items.find((i) => i.id === rma.itemId);
        const name = item?.name ?? "item";
        const restock = condition === "good";
        set((state) => ({
          returns: state.returns.map((r) => r.id === id ? { ...r, status: "inspected", condition, inspectedBy: by } : r),
          movements: restock ? [{ id: `mv-${Date.now()}`, date: TODAY, type: "return", itemId: rma.itemId, locationId: rma.locationId, batchNo: rma.batchNo, qty: rma.qty, reason: `Return ${rma.number} inspected good`, by }, ...state.movements] : state.movements,
          trail: withTrail(state.trail, trailEntry("operations", TODAY, by, `Inspected ${rma.number}: ${rma.qty} ${name} ${restock ? "back to stock" : "not restocked (damaged)"}`)),
        }));
        return null;
      },
      sendTransfer: (input, by) => {
        if (!demoMode) return "This step is not on the server yet, so real mode does not record it.";
        const locked = periodLockProblem(TODAY);
        if (locked) return locked;
        const item = get().items.find((i) => i.id === input.itemId);
        if (!item) return "Choose an item.";
        const batchNo = item.trackBatch ? (input.batchNo ?? null) : null;
        if (item.trackBatch && !batchNo) return `${item.name} is batch tracked. Choose the batch to move.`;
        if (input.fromLocationId === input.toLocationId) return "The item is already at that location.";
        if (!(input.qty > 0)) return "Enter a quantity above zero.";
        if (input.transporter.trim().length < 2) return "Name the transporter.";
        const available = stockOn(get().movements, item.id, input.fromLocationId, item.trackBatch ? batchNo : undefined);
        if (input.qty > available) return `Only ${available} ${item.unit} of ${item.name}${batchNo ? ` (batch ${batchNo})` : ""} is at the sending location.`;
        const number = nextNumber("TRF", get().transfers.length);
        const transfer: Transfer = { ...input, batchNo, id: `trf-${Date.now()}`, number, date: TODAY, status: "in transit", by, transporter: input.transporter.trim(), lrNumber: input.lrNumber.trim() };
        set((state) => ({
          transfers: [transfer, ...state.transfers],
          movements: [{ id: `mv-${Date.now()}`, date: TODAY, type: "transfer", itemId: item.id, locationId: input.fromLocationId, batchNo, qty: -input.qty, reason: `Sent ${number}`, by }, ...state.movements],
          trail: withTrail(state.trail, trailEntry("operations", TODAY, by, `Sent ${input.qty} ${item.unit} of ${item.name} under ${number}`)),
        }));
        return null;
      },
      receiveTransfer: (id, by) => {
        if (!demoMode) return "This step is not on the server yet, so real mode does not record it.";
        const locked = periodLockProblem(TODAY);
        if (locked) return locked;
        const transfer = get().transfers.find((t) => t.id === id);
        if (!transfer) return "Transfer not found.";
        if (transfer.status !== "in transit") return "This transfer has already been received.";
        const item = get().items.find((i) => i.id === transfer.itemId);
        set((state) => ({
          transfers: state.transfers.map((t) => t.id === id ? { ...t, status: "received" } : t),
          movements: [{ id: `mv-${Date.now()}`, date: TODAY, type: "transfer", itemId: transfer.itemId, locationId: transfer.toLocationId, batchNo: transfer.batchNo, qty: transfer.qty, reason: `Received ${transfer.number}`, by }, ...state.movements],
          trail: withTrail(state.trail, trailEntry("operations", TODAY, by, `Received ${transfer.number}: ${transfer.qty} ${item?.unit ?? ""} of ${item?.name ?? "item"}`)),
        }));
        return null;
      },
      recordCount: (locationId, counts, by) => {
        if (!demoMode) return "This step is not on the server yet, so real mode does not record it.";
        const locked = periodLockProblem(TODAY);
        if (locked) return locked;
        if (counts.length === 0) return "Count at least one item.";
        const number = nextNumber("CNT", get().counts.length);
        const lines: StockCount["lines"] = [];
        for (const row of counts) {
          const item = get().items.find((i) => i.id === row.itemId);
          if (!item) return "An item in the count was not found.";
          const batchNo = item.trackBatch ? (row.batchNo ?? null) : null;
          if (item.trackBatch && !batchNo) return `${item.name} is batch tracked. Count it batch by batch.`;
          if (!(row.counted >= 0)) return `The count for ${item.name} cannot be negative.`;
          const system = stockOn(get().movements, item.id, locationId, item.trackBatch ? batchNo : undefined);
          lines.push({ itemId: item.id, batchNo, system, counted: row.counted, variance: row.counted - system });
        }
        set((state) => ({ counts: [{ id: `cnt-${Date.now()}`, number, date: TODAY, locationId, lines, by }, ...state.counts] }));
        for (const line of lines.filter((l) => l.variance !== 0)) {
          const problem = get().requestAdjustment({ itemId: line.itemId, locationId, batchNo: line.batchNo, qty: line.variance, reason: `Physical count ${number}` }, by);
          if (problem) return `Count recorded, but the adjustment for one item was refused: ${problem}`;
        }
        set((state) => ({ trail: withTrail(state.trail, trailEntry("operations", TODAY, by, `Counted ${number}: ${lines.filter((l) => l.variance !== 0).length} difference${lines.filter((l) => l.variance !== 0).length === 1 ? "" : "s"}`)) }));
        return null;
      },
      requestAdjustment: (input, by) => {
        if (!demoMode) return "Stock changes are recorded on the server.";
        const locked = periodLockProblem(TODAY);
        if (locked) return locked;
        const item = get().items.find((i) => i.id === input.itemId);
        if (!item) return "Choose an item.";
        if (input.qty === 0) return "Enter a quantity that is not zero.";
        if (input.reason.trim().length < 3) return "Give the reason for the adjustment.";
        const available = stockOn(get().movements, item.id, input.locationId, item.trackBatch ? input.batchNo : undefined);
        if (input.qty < 0 && -input.qty > available) return `Only ${available} ${item.unit} is in stock here.`;
        const value = Math.abs(input.qty) * item.rate;
        const needsApproval = value > workflowRules().adjustmentApprovalValue;
        const adjustment: Adjustment = { id: `adj-${Date.now()}`, date: TODAY, value, status: needsApproval ? "pending" : "applied", by, ...input, reason: input.reason.trim() };
        const change = `${input.qty > 0 ? "+" : ""}${input.qty} ${item.unit} of ${item.name}`;
        set((state) => ({
          adjustments: [adjustment, ...state.adjustments],
          movements: needsApproval ? state.movements : [{ id: `mv-${Date.now()}`, date: TODAY, type: "adjustment", itemId: item.id, locationId: input.locationId, batchNo: input.batchNo, qty: input.qty, reason: input.reason.trim(), by }, ...state.movements],
          trail: withTrail(state.trail, trailEntry("operations", TODAY, by, needsApproval ? `Requested adjustment ${change} (₹${value.toLocaleString("en-IN")}), waiting approval` : `Adjusted ${change}`)),
        }));
        return null;
      },
      rejectAdjustment: (id, reason, by) => {
        if (!demoMode) return "Stock changes are recorded on the server.";
        const adjustment = get().adjustments.find((a) => a.id === id);
        if (!adjustment) return "Adjustment not found.";
        if (adjustment.status !== "pending") return "Only a pending adjustment can be rejected.";
        if (adjustment.by === by) return "The person who requested an adjustment cannot reject it.";
        if (reason.trim().length < 3) return "Give the reason for rejecting it.";
        set((state) => ({
          adjustments: state.adjustments.map((a) => a.id === id ? { ...a, status: "rejected", rejectedBy: by } : a),
          trail: withTrail(state.trail, trailEntry("operations", TODAY, by, `Rejected adjustment of ${adjustment.qty > 0 ? "+" : ""}${adjustment.qty}: ${reason.trim()}`)),
        }));
        return null;
      },
      approveAdjustment: (id, by) => {
        if (!demoMode) return "Stock changes are recorded on the server.";
        const locked = periodLockProblem(TODAY);
        if (locked) return locked;
        const adjustment = get().adjustments.find((a) => a.id === id);
        if (!adjustment) return "Adjustment not found.";
        if (adjustment.status !== "pending") return "This adjustment is already applied.";
        if (adjustment.by === by) return "The person who requested an adjustment cannot approve it.";
        set((state) => ({
          adjustments: state.adjustments.map((a) => a.id === id ? { ...a, status: "applied", approvedBy: by } : a),
          movements: [{ id: `mv-${Date.now()}`, date: TODAY, type: "adjustment", itemId: adjustment.itemId, locationId: adjustment.locationId, batchNo: adjustment.batchNo, qty: adjustment.qty, reason: adjustment.reason, by }, ...state.movements],
          trail: withTrail(state.trail, trailEntry("operations", TODAY, by, `Approved adjustment of ${adjustment.qty > 0 ? "+" : ""}${adjustment.qty} (₹${adjustment.value.toLocaleString("en-IN")})`)),
        }));
        return null;
      },
    }),
    { name: scoped("janus.operations.v1"), storage: createJSONStorage(() => workspaceStorage), partialize: (state) => ({ items: state.items, batches: state.batches, movements: state.movements, dispatches: state.dispatches, adjustments: state.adjustments, purchaseOrders: state.purchaseOrders, requisitions: state.requisitions, counts: state.counts, transfers: state.transfers, returns: state.returns, trail: state.trail }) },
  ),
);
