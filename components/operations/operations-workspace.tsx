"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GST_RATES } from "@/lib/stores/finance-store";
import { TODAY, isExpired, stockOn, useOperationsStore, type Dispatch, type PurchaseOrder } from "@/lib/stores/operations-store";
import { useLocationsStore } from "@/lib/stores/company-locations-store";
import { useVendorsStore } from "@/lib/stores/vendors-store";
import { useFinanceStore } from "@/lib/stores/finance-store";
import { useWorkflowRulesStore, type WorkflowRules } from "@/lib/stores/workflow-rules-store";
import { useSession } from "@/components/auth/session-provider";
import { linkedLabel, useCrmLinkOptions } from "@/lib/record-links";
import { RecordDocuments } from "@/components/shared/record-documents";
import { TrailPanel } from "@/components/shared/audit-trail-panel";

const money = (value: number) => `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const selectClass = "h-9 w-full rounded-md border border-input bg-surface px-3 text-sm";
const days = (from: string, to: string) => Math.floor((Date.parse(to) - Date.parse(from)) / 86400000);

const comingSoon: Record<string, string> = {
};

export function OperationsWorkspace() {
  const searchParams = useSearchParams();
  const view = searchParams.get("view") ?? "overview";
  const session = useSession();
  const me = session.user.name ?? session.user.email ?? "You";
  const titles: Record<string, string> = { overview: "Operations overview", products: "Products & stock", inventory: "Inventory by location", orders: "Dispatch & returns", warehouses: "Warehouses & locations", "purchase-orders": "Purchase orders", vendors: "Vendors", procurement: "Requisitions", counts: "Physical count", transfers: "Transit transfers", reports: "Operations reports", workflows: "Workflows" };

  if (view in comingSoon) {
    return (
      <div className="mx-auto flex max-w-[1200px] flex-col">
        <PageHeader title="Coming soon" description="Operations & Inventory" />
        <div className="px-6 pb-10"><Card><CardContent className="p-6 text-sm text-muted-foreground">{comingSoon[view]}</CardContent></Card></div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col">
      <PageHeader title={titles[view] ?? "Operations overview"} description="Items, stock by location and batch, dispatches and returns. Stock never goes negative." />
      <div className="flex flex-col gap-4 px-6 pb-10">
        {view === "products" && <ProductsView />}
        {view === "inventory" && <InventoryView me={me} />}
        {view === "orders" && <OrdersView me={me} />}
        {view === "warehouses" && <WarehousesView />}
        {view === "purchase-orders" && <PurchaseOrdersView me={me} />}
        {view === "vendors" && <VendorsView />}
        {view === "procurement" && <RequisitionsView me={me} />}
        {view === "counts" && <PhysicalCountView me={me} />}
        {view === "transfers" && <TransfersView me={me} />}
        {view === "reports" && <OperationsReportsView />}
        {view === "workflows" && <WorkflowsView />}
        {!["products", "inventory", "orders", "warehouses", "purchase-orders", "vendors", "procurement", "counts", "transfers", "reports", "workflows"].includes(view) && <OverviewView />}
        {!["products", "inventory", "orders", "warehouses", "purchase-orders", "vendors", "procurement", "counts", "transfers", "reports"].includes(view) && <OperationsTrail />}
      </div>
    </div>
  );
}

/** Transit transfers: stock sent from one location to another with a transporter and LR number, then received. */
function TransfersView({ me }: { me: string }) {
  const items = useOperationsStore((state) => state.items);
  const transfers = useOperationsStore((state) => state.transfers);
  const sendTransfer = useOperationsStore((state) => state.sendTransfer);
  const receiveTransfer = useOperationsStore((state) => state.receiveTransfer);
  const locations = useLocationsStore((state) => state.locations);
  const batches = useOperationsStore((state) => state.batches);
  const [itemId, setItemId] = React.useState("");
  const [batchNo, setBatchNo] = React.useState("");
  const [qty, setQty] = React.useState("");
  const [fromId, setFromId] = React.useState("");
  const [toId, setToId] = React.useState("");
  const [transporter, setTransporter] = React.useState("");
  const [lrNumber, setLrNumber] = React.useState("");
  const selected = items.find((i) => i.id === itemId);
  const itemBatches = batches.filter((b) => b.itemId === itemId);
  const locationName = (id: number) => locations.find((l) => l.id === id)?.name ?? "location";

  function send() {
    const problem = sendTransfer({ itemId, batchNo: batchNo || null, qty: Number(qty), fromLocationId: Number(fromId), toLocationId: Number(toId), transporter, lrNumber }, me);
    if (problem) return toast.error(problem);
    toast.success("Transfer sent; the stock is in transit");
    setQty(""); setTransporter(""); setLrNumber(""); setBatchNo("");
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Send stock to another location</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-xs text-muted-foreground">Stock leaves the sending location now and arrives when it is received. A batch-tracked item moves batch by batch.</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <select aria-label="Transfer item" className={selectClass} value={itemId} onChange={(e) => { setItemId(e.target.value); setBatchNo(""); }}><option value="">Item…</option>{items.map((i) => <option key={i.id} value={i.id}>{i.name}{i.trackBatch ? " (batch)" : ""}</option>)}</select>
            {selected?.trackBatch ? <select aria-label="Transfer batch" className={selectClass} value={batchNo} onChange={(e) => setBatchNo(e.target.value)}><option value="">Batch…</option>{itemBatches.map((b) => <option key={b.id} value={b.batchNo}>{b.batchNo}</option>)}</select> : null}
            <Input aria-label="Transfer quantity" type="number" min={0} placeholder="Qty" value={qty} onChange={(e) => setQty(e.target.value)} />
            <select aria-label="From location" className={selectClass} value={fromId} onChange={(e) => setFromId(e.target.value)}><option value="">From…</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
            <select aria-label="To location" className={selectClass} value={toId} onChange={(e) => setToId(e.target.value)}><option value="">To…</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
            <Input aria-label="Transporter" placeholder="Transporter" value={transporter} onChange={(e) => setTransporter(e.target.value)} />
            <Input aria-label="LR number" placeholder="LR / docket number" value={lrNumber} onChange={(e) => setLrNumber(e.target.value)} />
            <Button disabled={!itemId || (selected?.trackBatch && !batchNo) || !(Number(qty) > 0) || !fromId || !toId || transporter.trim().length < 2} onClick={send}>Send transfer</Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="grid gap-3 p-4 text-sm">
          {transfers.length === 0 ? <p className="text-muted-foreground">No transfers yet.</p> : null}
          {transfers.map((t) => {
            const item = items.find((i) => i.id === t.itemId);
            return (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 last:border-0">
                <span>
                  <span className="font-medium">{t.number}</span> · {item?.name ?? "Item"} × {t.qty} · {locationName(t.fromLocationId)} → {locationName(t.toLocationId)}
                  <span className="block text-xs text-muted-foreground">{t.date} · {t.transporter}{t.lrNumber ? ` · LR ${t.lrNumber}` : ""}</span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge variant={t.status === "received" ? "success" : "warning"}>{t.status}</Badge>
                  {t.status === "in transit" ? <Button size="sm" variant="secondary" onClick={() => { const p = receiveTransfer(t.id, me); if (p) toast.error(p); else toast.success(`${t.number} received`); }}>Mark received</Button> : null}
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </>
  );
}

/** Operations in numbers: stock value by location, low stock, dispatches not yet delivered, and orders and requisitions still open. */
function OperationsReportsView() {
  const items = useOperationsStore((state) => state.items);
  const movements = useOperationsStore((state) => state.movements);
  const dispatches = useOperationsStore((state) => state.dispatches);
  const orders = useOperationsStore((state) => state.purchaseOrders);
  const requisitions = useOperationsStore((state) => state.requisitions);
  const transfers = useOperationsStore((state) => state.transfers);
  const adjustments = useOperationsStore((state) => state.adjustments);
  const locations = useLocationsStore((state) => state.locations);
  const byLocation = locations.map((l) => {
    const value = items.filter((i) => !i.trackBatch).reduce((sum, i) => sum + stockOn(movements, i.id, l.id) * i.rate, 0);
    return { name: l.name, value };
  });
  const lowStock = items.filter((i) => !i.trackBatch && stockOn(movements, i.id) <= i.reorderLevel).length;
  const undelivered = dispatches.filter((d) => d.status === "dispatched").length;
  const openOrderValue = orders.reduce((sum, o) => sum + o.lines.reduce((s2, l) => s2 + (l.qty - l.received) * l.rate, 0), 0);
  const pendingRequisitions = requisitions.filter((r) => r.status === "pending").length;
  const inTransit = transfers.filter((t) => t.status === "in transit").length;
  const waitingAdjustments = adjustments.filter((a) => a.status === "pending").length;
  const rows: [string, string][] = [
    ["Items with stock at or below reorder level", String(lowStock)],
    ["Dispatches not yet delivered", String(undelivered)],
    ["Value of open purchase orders", money(openOrderValue)],
    ["Requisitions waiting for approval", String(pendingRequisitions)],
    ["Transfers in transit", String(inTransit)],
    ["Adjustments waiting for approval", String(waitingAdjustments)],
  ];
  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Stock value by location</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm tabular-nums">
          {byLocation.map((row) => <div key={row.name} className="flex justify-between border-b border-border pb-2 last:border-0"><span>{row.name}</span><span>{money(row.value)}</span></div>)}
          <p className="text-xs text-muted-foreground">Valued at each item&apos;s rate. Batch-tracked items are not included in these totals.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Open work</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm tabular-nums">
          {rows.map(([label, value]) => <div key={label} className="flex justify-between border-b border-border pb-2 last:border-0"><span>{label}</span><span className="font-medium">{value}</span></div>)}
        </CardContent>
      </Card>
    </>
  );
}

/** Operations workflows: the standard steps, and the rules the owner sets. Each rule is enforced where it applies. */
function WorkflowsView() {
  const session = useSession();
  const isOwner = session.permissions.includes("*");
  const rules = useWorkflowRulesStore();
  const [threshold, setThreshold] = React.useState(String(rules.adjustmentApprovalValue));
  const [tolerance, setTolerance] = React.useState(String(rules.matchTolerancePercent));

  function save(key: keyof WorkflowRules, value: string) {
    const problem = rules.setRule(key, Number(value), isOwner);
    if (problem) return toast.error(problem);
    toast.success("Rule saved");
  }

  const steps: { title: string; text: string }[] = [
    { title: "Requisition to order", text: "Someone other than the requester approves, against a budget line that still has money. An approved requisition becomes a purchase order." },
    { title: "Goods receipt", text: "Goods are received against the order and cannot exceed what is still due on each line. Receipts are posted to stock at the order's location." },
    { title: "Three-way match", text: "A bill is paid only when it agrees with the goods received, within the tolerance below." },
    { title: "Stock counts and adjustments", text: "A count difference becomes an adjustment. One worth more than the threshold below needs approval by someone other than the person who counted." },
    { title: "Transfers", text: "Stock leaves the sending location when sent and arrives when received. A transfer cannot send more than the sending location holds." },
    { title: "Dispatch and returns", text: "Stock is reduced when a delivery is dispatched and needs proof of delivery. A return in good condition goes back to stock; a damaged one does not." },
  ];

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Rules the system enforces</CardTitle></CardHeader>
        <CardContent className="grid gap-4 text-sm">
          <p className="text-xs text-muted-foreground">Set by the owner. The stock adjustment and bill match rules read these values.</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
            <span>Adjustment approval above (₹)</span>
            <Input aria-label="Adjustment approval threshold" type="number" min={0} className="h-8 w-40" value={threshold} onChange={(e) => setThreshold(e.target.value)} disabled={!isOwner} />
            <Button size="sm" variant="secondary" disabled={!isOwner} onClick={() => save("adjustmentApprovalValue", threshold)}>Save</Button>
            <span>Bill and goods tolerance (%)</span>
            <Input aria-label="Match tolerance" type="number" min={0} max={10} step={0.5} className="h-8 w-40" value={tolerance} onChange={(e) => setTolerance(e.target.value)} disabled={!isOwner} />
            <Button size="sm" variant="secondary" disabled={!isOwner} onClick={() => save("matchTolerancePercent", tolerance)}>Save</Button>
          </div>
          {!isOwner ? <p className="text-xs text-muted-foreground">Only the owner can change these rules.</p> : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Standard workflows</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm">
          {steps.map((step) => (
            <p key={step.title}><span className="font-medium">{step.title}.</span> {step.text}</p>
          ))}
          <p className="text-xs text-muted-foreground">Based on common practice for small and mid-sized warehouses: approvals by someone other than the requester, goods checked against the order before stock is posted, bills matched to the order and the goods, and count differences approved above a threshold. Not yet built: pick, pack and ship checkpoints, and return merchandise authorisation.</p>
        </CardContent>
      </Card>
    </>
  );
}

/** Physical count: count the items at one location and record the differences against the system. */
function PhysicalCountView({ me }: { me: string }) {
  const items = useOperationsStore((state) => state.items);
  const movements = useOperationsStore((state) => state.movements);
  const counts = useOperationsStore((state) => state.counts);
  const recordCount = useOperationsStore((state) => state.recordCount);
  const locations = useLocationsStore((state) => state.locations);
  const [locationId, setLocationId] = React.useState("");
  const [entries, setEntries] = React.useState<Record<string, string>>({});
  const batches = useOperationsStore((state) => state.batches);
  // One row per item, and one row per batch for a batch-tracked item.
  const rows = items.flatMap((item) => item.trackBatch
    ? batches.filter((b) => b.itemId === item.id).map((b) => ({ key: `${item.id}|${b.batchNo}`, item, batchNo: b.batchNo as string | null }))
    : [{ key: `${item.id}|`, item, batchNo: null as string | null }]);

  function submit() {
    const counted = rows.filter((r) => entries[r.key] !== undefined && entries[r.key] !== "").map((r) => ({ itemId: r.item.id, batchNo: r.batchNo, counted: Number(entries[r.key]) }));
    const problem = recordCount(Number(locationId), counted, me);
    if (problem) return toast.error(problem);
    toast.success("Count recorded; any differences went to adjustment approval");
    setEntries({});
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Count a location</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-xs text-muted-foreground">Enter what you counted for each item; leave an item blank if you did not count it. A difference becomes a stock adjustment, and one above ₹10,000 needs approval from someone else. Batch-tracked items are counted batch by batch.</p>
          <select aria-label="Count location" className={selectClass} value={locationId} onChange={(e) => { setLocationId(e.target.value); setEntries({}); }}><option value="">Location…</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          {locationId !== "" ? (
            <>
              <table className="w-full text-sm tabular-nums">
                <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="py-2">Item</th><th className="text-right">System</th><th className="text-right">Counted</th><th className="text-right">Difference</th></tr></thead>
                <tbody>
                  {rows.map(({ key, item, batchNo }) => {
                    const system = stockOn(movements, item.id, Number(locationId), item.trackBatch ? batchNo : undefined);
                    const counted = entries[key];
                    const diff = counted === undefined || counted === "" ? null : Number(counted) - system;
                    return (
                      <tr key={key} className="border-b border-border last:border-0">
                        <td className="py-2">{item.name}<span className="block text-xs text-muted-foreground">{item.unit}{batchNo ? ` · batch ${batchNo}` : ""}</span></td>
                        <td className="text-right">{system}</td>
                        <td className="text-right"><Input aria-label={`Counted ${item.name}${batchNo ? ` batch ${batchNo}` : ""}`} type="number" min={0} className="ml-auto h-8 w-24" value={counted ?? ""} onChange={(e) => setEntries((current) => ({ ...current, [key]: e.target.value }))} /></td>
                        <td className={`text-right ${diff !== null && diff !== 0 ? "text-danger" : ""}`}>{diff === null ? "—" : diff > 0 ? `+${diff}` : diff}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <Button className="w-fit" onClick={submit}>Record count</Button>
            </>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Past counts</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {counts.length === 0 ? <p className="text-muted-foreground">No counts yet.</p> : null}
          {counts.map((c) => {
            const diffs = c.lines.filter((l) => l.variance !== 0).length;
            return <p key={c.id}><span className="font-medium">{c.number}</span> · {locations.find((l) => l.id === c.locationId)?.name ?? "location"} · {c.date} · {c.lines.length} counted · {diffs} difference{diffs === 1 ? "" : "s"} · by {c.by}</p>;
          })}
        </CardContent>
      </Card>
    </>
  );
}

/** Requisitions: a request to buy, approved by someone else against a budget line, then turned into a purchase order. */
function RequisitionsView({ me }: { me: string }) {
  const items = useOperationsStore((state) => state.items);
  const requisitions = useOperationsStore((state) => state.requisitions);
  const addRequisition = useOperationsStore((state) => state.addRequisition);
  const approveRequisition = useOperationsStore((state) => state.approveRequisition);
  const rejectRequisition = useOperationsStore((state) => state.rejectRequisition);
  const orderRequisition = useOperationsStore((state) => state.orderRequisition);
  const locations = useLocationsStore((state) => state.locations);
  const vendors = useVendorsStore((state) => state.vendors);
  const budgetLines = useFinanceStore((state) => state.budgetLines);
  const [itemId, setItemId] = React.useState("");
  const [qty, setQty] = React.useState("");
  const [rate, setRate] = React.useState("");
  const [locationId, setLocationId] = React.useState("");
  const [budgetLineId, setBudgetLineId] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [vendorFor, setVendorFor] = React.useState<Record<string, string>>({});

  function raise() {
    const problem = addRequisition({ itemId, qty: Number(qty), estimatedRate: Number(rate), locationId: Number(locationId), budgetLineId, reason }, me);
    if (problem) return toast.error(problem);
    toast.success("Requisition raised");
    setQty(""); setRate(""); setReason("");
  }

  function approve(id: string, lineId: string) {
    const line = budgetLines.find((l) => l.id === lineId);
    const available = line ? line.allocated - line.drawn : 0;
    const problem = approveRequisition(id, available, me);
    if (problem) return toast.error(problem);
    toast.success("Requisition approved");
  }

  function order(id: string) {
    const vendor = vendorFor[id] ?? vendors[0]?.name ?? "";
    if (!vendor) return toast.error("Add a vendor first.");
    const problem = orderRequisition(id, vendor, me);
    if (problem) return toast.error(problem);
    toast.success("Purchase order raised from the requisition");
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Raise a requisition</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-xs text-muted-foreground">A requisition is a request to buy. It is approved by someone other than the person who raised it, against a budget line that still has money left. An approved requisition becomes a purchase order.</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <select aria-label="Requisition item" className={selectClass} value={itemId} onChange={(e) => setItemId(e.target.value)}><option value="">Item…</option>{items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
            <Input aria-label="Requisition quantity" type="number" min={0} placeholder="Qty" value={qty} onChange={(e) => setQty(e.target.value)} />
            <Input aria-label="Estimated rate" type="number" min={0} placeholder="Estimated rate ₹" value={rate} onChange={(e) => setRate(e.target.value)} />
            <select aria-label="Requisition location" className={selectClass} value={locationId} onChange={(e) => setLocationId(e.target.value)}><option value="">Deliver to…</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
            <select aria-label="Budget line" className={selectClass} value={budgetLineId} onChange={(e) => setBudgetLineId(e.target.value)}><option value="">Budget line…</option>{budgetLines.map((l) => <option key={l.id} value={l.id}>{l.name} · ₹{(l.allocated - l.drawn).toLocaleString("en-IN")} left</option>)}</select>
            <Input aria-label="Reason" placeholder="Why it is needed" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button disabled={!itemId || !(Number(qty) > 0) || !locationId || !budgetLineId || reason.trim().length < 5} onClick={raise}>Raise requisition</Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="grid gap-3 p-4 text-sm">
          {requisitions.length === 0 ? <p className="text-muted-foreground">No requisitions yet.</p> : null}
          {requisitions.map((r) => {
            const item = items.find((i) => i.id === r.itemId);
            const line = budgetLines.find((l) => l.id === r.budgetLineId);
            const value = r.qty * r.estimatedRate;
            return (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 last:border-0">
                <span>
                  <span className="font-medium">{r.number}</span> · {item?.name ?? "Item"} × {r.qty} · ₹{value.toLocaleString("en-IN")}
                  <span className="block text-xs text-muted-foreground">{r.requester} · {line?.name ?? "budget line"} · {r.reason}{r.rejectedReason ? ` · rejected: ${r.rejectedReason}` : ""}{r.poNumber ? ` · ${r.poNumber}` : ""}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant={r.status === "approved" || r.status === "ordered" ? "success" : r.status === "rejected" ? "danger" : "warning"}>{r.status}</Badge>
                  {r.status === "pending" ? (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => approve(r.id, r.budgetLineId)}>Approve</Button>
                      <Button size="sm" variant="ghost" onClick={() => { const p = rejectRequisition(r.id, "Rejected from requisitions", me); if (p) toast.error(p); }}>Reject</Button>
                    </>
                  ) : null}
                  {r.status === "approved" ? (
                    <>
                      <select aria-label={`Vendor for ${r.number}`} className={selectClass} value={vendorFor[r.id] ?? vendors[0]?.name ?? ""} onChange={(e) => setVendorFor((current) => ({ ...current, [r.id]: e.target.value }))}>{vendors.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}</select>
                      <Button size="sm" onClick={() => order(r.id)}>Raise purchase order</Button>
                    </>
                  ) : null}
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </>
  );
}

/** Purchase orders to vendors, and goods receipt against them. Each receipt adds stock and moves the order along. */
function PurchaseOrdersView({ me }: { me: string }) {
  const items = useOperationsStore((state) => state.items);
  const orders = useOperationsStore((state) => state.purchaseOrders);
  const addPurchaseOrder = useOperationsStore((state) => state.addPurchaseOrder);
  const receiveAgainstPO = useOperationsStore((state) => state.receiveAgainstPO);
  const locations = useLocationsStore((state) => state.locations);
  const vendors = useVendorsStore((state) => state.vendors);
  const [vendor, setVendor] = React.useState("");
  const [locationId, setLocationId] = React.useState("");
  const [lines, setLines] = React.useState<{ itemId: string; qty: string; rate: string }[]>([{ itemId: "", qty: "", rate: "" }]);
  const [receipts, setReceipts] = React.useState<Record<string, string>>({});

  const ready = vendor.trim().length >= 2 && locationId !== "" && lines.every((line) => line.itemId && Number(line.qty) > 0 && Number(line.rate) >= 0);

  function setLine(index: number, patch: Partial<{ itemId: string; qty: string; rate: string }>) {
    setLines((current) => current.map((line, i) => i === index ? { ...line, ...patch } : line));
  }

  function create() {
    if (locationId === "") return toast.error("Choose the location the goods come to.");
    const problem = addPurchaseOrder({ vendor, locationId: Number(locationId), lines: lines.map((line) => ({ itemId: line.itemId, qty: Number(line.qty), rate: Number(line.rate) })) }, me);
    if (problem) return toast.error(problem);
    toast.success("Purchase order raised");
    setVendor(""); setLines([{ itemId: "", qty: "", rate: "" }]);
  }

  function receive(orderId: string, order: PurchaseOrder) {
    const entries = order.lines
      .map((line) => ({ itemId: line.itemId, qty: Number(receipts[`${orderId}:${line.itemId}`] ?? 0) }))
      .filter((entry) => entry.qty > 0);
    if (entries.length === 0) return toast.error("Enter the quantity received on at least one line.");
    const problem = receiveAgainstPO(orderId, entries, me);
    if (problem) return toast.error(problem);
    toast.success("Goods received");
    setReceipts((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${orderId}:`))));
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Raise a purchase order</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-xs text-muted-foreground">Goods received against an order add stock at the location the order names. Each receipt cannot be more than what is still due on its line.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <select aria-label="Vendor" className={selectClass} value={vendor} onChange={(e) => setVendor(e.target.value)}><option value="">Vendor…</option>{vendors.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}</select>
            <select aria-label="Deliver to" className={selectClass} value={locationId} onChange={(e) => setLocationId(e.target.value)}><option value="">Deliver to…</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          </div>
          {lines.map((line, index) => (
            <div key={index} className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
              <select aria-label={`Item line ${index + 1}`} className={selectClass} value={line.itemId} onChange={(e) => setLine(index, { itemId: e.target.value })}><option value="">Item…</option>{items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
              <Input aria-label={`Quantity line ${index + 1}`} type="number" min={0} placeholder="Qty" value={line.qty} onChange={(e) => setLine(index, { qty: e.target.value })} />
              <Input aria-label={`Rate line ${index + 1}`} type="number" min={0} placeholder="Rate ₹" value={line.rate} onChange={(e) => setLine(index, { rate: e.target.value })} />
              <Button size="sm" variant="ghost" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, i) => i !== index))}>Remove</Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setLines((current) => [...current, { itemId: "", qty: "", rate: "" }])}>Add item line</Button>
            <Button disabled={!ready} onClick={create}>Raise order</Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="grid gap-4 p-4 text-sm">
          {orders.length === 0 ? <p className="text-muted-foreground">No purchase orders yet.</p> : null}
          {orders.map((order) => {
            const value = order.lines.reduce((sum, line) => sum + line.qty * line.rate, 0);
            const received = order.lines.reduce((sum, line) => sum + line.received * line.rate, 0);
            const status = order.lines.every((line) => line.received >= line.qty) ? "received" : order.lines.some((line) => line.received > 0) ? "part received" : "open";
            return (
              <div key={order.id} className="grid gap-2 border-b border-border pb-3 last:border-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-medium">{order.number}</span> · {order.vendor} · {locations.find((l) => l.id === order.locationId)?.name ?? "—"} · {order.date}
                    <span className="block text-xs text-muted-foreground">Value ₹{value.toLocaleString("en-IN")} · received ₹{received.toLocaleString("en-IN")}</span>
                  </span>
                  <Badge variant={status === "received" ? "success" : status === "part received" ? "warning" : "neutral"}>{status}</Badge>
                </div>
                {order.lines.map((line) => {
                  const item = items.find((i) => i.id === line.itemId);
                  const due = line.qty - line.received;
                  const key = `${order.id}:${line.itemId}`;
                  return (
                    <div key={line.itemId} className="flex flex-wrap items-center justify-between gap-2 pl-4 text-xs">
                      <span>{item?.name ?? "Item"}: ordered {line.qty}, received {line.received}, at ₹{line.rate}</span>
                      {due > 0 ? (
                        <span className="flex items-center gap-2">
                          <Input aria-label={`Receive ${item?.name ?? "item"} on ${order.number}`} type="number" min={0} className="h-8 w-24" placeholder={`Max ${due}`} value={receipts[key] ?? ""} onChange={(e) => setReceipts((current) => ({ ...current, [key]: e.target.value }))} />
                        </span>
                      ) : <span className="text-muted-foreground">complete</span>}
                    </div>
                  );
                })}
                {order.lines.some((line) => line.qty > line.received) ? (
                  <div className="pl-4"><Button size="sm" variant="secondary" onClick={() => receive(order.id, order)}>Receive goods</Button></div>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </>
  );
}

/** The vendor master: the names purchase orders and bills pick from, with GSTIN and payment terms. */
function VendorsView() {
  const vendors = useVendorsStore((state) => state.vendors);
  const addVendor = useVendorsStore((state) => state.addVendor);
  const [name, setName] = React.useState("");
  const [gstin, setGstin] = React.useState("");
  const [terms, setTerms] = React.useState("30");

  function save() {
    const problem = addVendor({ name, gstin, paymentTermsDays: Number(terms) });
    if (problem) return toast.error(problem);
    toast.success(`${name.trim()} added`);
    setName(""); setGstin(""); setTerms("30");
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Add a vendor</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-xs text-muted-foreground">Purchase orders and vendor bills pick from this list, so a vendor has one name everywhere. GSTIN is optional; if it is entered it must be in the usual 15-character format.</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <Input aria-label="Vendor name" placeholder="Vendor name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input aria-label="GSTIN" placeholder="GSTIN (optional)" value={gstin} onChange={(e) => setGstin(e.target.value)} />
            <Input aria-label="Payment terms in days" type="number" min={0} max={365} placeholder="Payment terms (days)" value={terms} onChange={(e) => setTerms(e.target.value)} />
            <Button disabled={name.trim().length < 2} onClick={save}>Add vendor</Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="grid gap-2 p-4 text-sm">
          {vendors.length === 0 ? <p className="text-muted-foreground">No vendors yet.</p> : null}
          {vendors.map((v) => (
            <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0">
              <span className="font-medium">{v.name}</span>
              <span className="text-xs text-muted-foreground">{v.gstin || "GSTIN not added"} · {v.paymentTermsDays} days payment terms</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

function OperationsTrail() {
  const trail = useOperationsStore((state) => state.trail);
  return <TrailPanel entries={trail} />;
}

function OverviewView() {
  const items = useOperationsStore((state) => state.items);
  const batches = useOperationsStore((state) => state.batches);
  const movements = useOperationsStore((state) => state.movements);
  const dispatches = useOperationsStore((state) => state.dispatches);
  const adjustments = useOperationsStore((state) => state.adjustments);
  const low = items.filter((item) => stockOn(movements, item.id) <= item.reorderLevel);
  const expiring = batches.filter((batch) => !isExpired(batch) && days(TODAY, batch.expiry) <= 60 && stockOn(movements, batch.itemId, undefined, batch.batchNo) > 0);
  const open = dispatches.filter((d) => d.status === "dispatched").length;
  const pendingAdj = adjustments.filter((a) => a.status === "pending").length;

  return (
    <>
      {items.length === 0 ? <Card><CardContent className="p-6 text-sm text-muted-foreground">No items yet. Add the first one from Products &amp; stock. Stock starts at zero for a new company.</CardContent></Card> : null}
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi label="Items" value={String(items.length)} />
        <Kpi label="Low stock" value={String(low.length)} tone={low.length > 0 ? "warning" : undefined} />
        <Kpi label="Dispatches not yet delivered" value={String(open)} />
        <Kpi label="Adjustments waiting approval" value={String(pendingAdj)} tone={pendingAdj > 0 ? "warning" : undefined} />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Low stock</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {low.length === 0 ? <p className="text-muted-foreground">Every item is above its reorder level.</p> : null}
          {low.map((item) => <p key={item.id}>{item.name} · {stockOn(movements, item.id)} {item.unit} (reorder at {item.reorderLevel})</p>)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Expiring within 60 days</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {expiring.length === 0 ? <p className="text-muted-foreground">No batch expires in the next 60 days.</p> : null}
          {expiring.map((batch) => { const item = items.find((i) => i.id === batch.itemId); return <p key={batch.id}>{item?.name} · batch {batch.batchNo} · expires {batch.expiry} ({days(TODAY, batch.expiry)} days)</p>; })}
        </CardContent>
      </Card>
    </>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "warning" }) {
  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${tone === "warning" ? "text-amber-700" : ""}`}>{value}</p>
    </div>
  );
}

function ProductsView() {
  const items = useOperationsStore((state) => state.items);
  const movements = useOperationsStore((state) => state.movements);
  const addItem = useOperationsStore((state) => state.addItem);
  const [form, setForm] = React.useState({ name: "", sku: "", unit: "piece", hsn: "", rate: "", gstRate: 18, reorderLevel: "0", trackBatch: false });
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  function save() {
    const problem = addItem({ name: form.name.trim(), sku: form.sku.trim(), unit: form.unit.trim() || "piece", hsn: form.hsn.trim(), rate: Number(form.rate), gstRate: form.gstRate, reorderLevel: Number(form.reorderLevel), trackBatch: form.trackBatch });
    if (problem) return toast.error(problem);
    toast.success("Item added");
    setForm({ name: "", sku: "", unit: "piece", hsn: "", rate: "", gstRate: 18, reorderLevel: "0", trackBatch: false });
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Add an item</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-xs text-muted-foreground">Items that track batches need a batch and an expiry date on every receipt. Use it for food, medicine and anything with a shelf life.</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="flex flex-col gap-1.5 sm:col-span-2"><Label htmlFor="it-name">Name</Label><Input id="it-name" value={form.name} onChange={(e) => set({ name: e.target.value })} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="it-sku">SKU</Label><Input id="it-sku" value={form.sku} onChange={(e) => set({ sku: e.target.value })} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="it-unit">Unit</Label><Input id="it-unit" value={form.unit} onChange={(e) => set({ unit: e.target.value })} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="it-hsn">HSN</Label><Input id="it-hsn" value={form.hsn} onChange={(e) => set({ hsn: e.target.value })} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="it-rate">Rate (₹)</Label><Input id="it-rate" type="number" min={0} value={form.rate} onChange={(e) => set({ rate: e.target.value })} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="it-gst">GST</Label><select id="it-gst" className={selectClass} value={form.gstRate} onChange={(e) => set({ gstRate: Number(e.target.value) })}>{GST_RATES.map((rate) => <option key={rate} value={rate}>{rate}%</option>)}</select></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="it-reorder">Reorder level</Label><Input id="it-reorder" type="number" min={0} value={form.reorderLevel} onChange={(e) => set({ reorderLevel: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.trackBatch} onChange={(e) => set({ trackBatch: e.target.checked })} />Track batch and expiry</label>
          </div>
          <Button className="w-fit" onClick={save}>Add item</Button>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="px-4 py-2">Item</th><th className="px-4 py-2">SKU</th><th className="px-4 py-2">HSN</th><th className="px-4 py-2 text-right">Rate</th><th className="px-4 py-2 text-right">GST</th><th className="px-4 py-2 text-right">Stock</th><th className="px-4 py-2">Batches</th></tr></thead>
            <tbody>
              {items.length === 0 ? <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">No items yet.</td></tr> : null}
              {items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">{item.name}</td>
                  <td className="px-4 py-3">{item.sku}</td>
                  <td className="px-4 py-3">{item.hsn}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(item.rate)}</td>
                  <td className="px-4 py-3 text-right">{item.gstRate}%</td>
                  <td className="px-4 py-3 text-right tabular-nums">{stockOn(movements, item.id)} {item.unit}</td>
                  <td className="px-4 py-3">{item.trackBatch ? <Badge variant="neutral">tracked</Badge> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}

function InventoryView({ me }: { me: string }) {
  const items = useOperationsStore((state) => state.items);
  const batches = useOperationsStore((state) => state.batches);
  const movements = useOperationsStore((state) => state.movements);
  const receive = useOperationsStore((state) => state.receive);
  const requestAdjustment = useOperationsStore((state) => state.requestAdjustment);
  const adjustments = useOperationsStore((state) => state.adjustments);
  const approveAdjustment = useOperationsStore((state) => state.approveAdjustment);
  const locations = useLocationsStore((state) => state.locations);
  const [itemId, setItemId] = React.useState("");
  const [locationId, setLocationId] = React.useState<number | "">("");
  const [batchNo, setBatchNo] = React.useState("");
  const [expiry, setExpiry] = React.useState("");
  const [qty, setQty] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [mode, setMode] = React.useState<"receive" | "adjust">("receive");
  const item = items.find((i) => i.id === itemId);

  function save() {
    if (locationId === "") return toast.error("Choose a location.");
    if (mode === "receive") {
      const problem = receive({ itemId, locationId: Number(locationId), batchNo: batchNo || null, expiry: expiry || null, qty: Number(qty), reason }, me);
      if (problem) return toast.error(problem);
      toast.success("Stock received");
    } else {
      const problem = requestAdjustment({ itemId, locationId: Number(locationId), batchNo: item?.trackBatch ? batchNo || null : null, qty: Number(qty), reason }, me);
      if (problem) return toast.error(problem);
      toast.success(Math.abs(Number(qty)) * (item?.rate ?? 0) > useWorkflowRulesStore.getState().adjustmentApprovalValue ? "Adjustment sent for approval" : "Adjustment applied");
    }
    setQty(""); setReason("");
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {locations.map((location) => (
          <Card key={location.id}><CardHeader><CardTitle className="text-sm">{location.name}</CardTitle></CardHeader><CardContent className="grid gap-1 text-sm">
            {items.map((i) => { const qtyHere = stockOn(movements, i.id, location.id); return qtyHere !== 0 ? <p key={i.id} className="flex justify-between tabular-nums"><span>{i.name}</span><span>{qtyHere} {i.unit}</span></p> : null; })}
            {items.every((i) => stockOn(movements, i.id, location.id) === 0) ? <p className="text-muted-foreground">No stock here.</p> : null}
          </CardContent></Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Receive stock or adjust</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex gap-2"><Button size="sm" variant={mode === "receive" ? "default" : "secondary"} onClick={() => setMode("receive")}>Receive</Button><Button size="sm" variant={mode === "adjust" ? "default" : "secondary"} onClick={() => setMode("adjust")}>Adjust</Button></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5"><Label htmlFor="inv-item">Item</Label><select id="inv-item" className={selectClass} value={itemId} onChange={(e) => setItemId(e.target.value)}><option value="">Choose…</option>{items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="inv-loc">Location</Label><select id="inv-loc" className={selectClass} value={locationId} onChange={(e) => setLocationId(e.target.value === "" ? "" : Number(e.target.value))}><option value="">Choose…</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="inv-qty">{mode === "receive" ? "Quantity" : "Change (use minus to reduce)"}</Label><Input id="inv-qty" type="number" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
            {item?.trackBatch ? <><div className="flex flex-col gap-1.5"><Label htmlFor="inv-batch">Batch</Label><Input id="inv-batch" value={batchNo} onChange={(e) => setBatchNo(e.target.value)} list="batch-list" /><datalist id="batch-list">{batches.filter((b) => b.itemId === itemId).map((b) => <option key={b.id} value={b.batchNo} />)}</datalist></div>{mode === "receive" ? <div className="flex flex-col gap-1.5"><Label htmlFor="inv-exp">Expiry (new batch)</Label><Input id="inv-exp" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></div> : null}</> : null}
            <div className="flex flex-col gap-1.5 sm:col-span-3"><Label htmlFor="inv-reason">Reason</Label><Input id="inv-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={mode === "receive" ? "e.g. Supplier invoice 4471" : "e.g. Count difference after cycle count"} /></div>
          </div>
          <Button className="w-fit" disabled={!itemId || !qty || reason.trim().length < 3} onClick={save}>{mode === "receive" ? "Receive stock" : "Record adjustment"}</Button>
          <p className="text-xs text-muted-foreground">Adjustments above ₹{useWorkflowRulesStore((state) => state.adjustmentApprovalValue).toLocaleString("en-IN")} need approval by someone other than the person who requested them.</p>
        </CardContent>
      </Card>
      {adjustments.some((a) => a.status === "pending") ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Adjustments waiting approval</CardTitle></CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {adjustments.filter((a) => a.status === "pending").map((a) => { const i = items.find((x) => x.id === a.itemId); return (
              <div key={a.id} className="flex items-center justify-between gap-3"><span>{i?.name} · {a.qty > 0 ? "+" : ""}{a.qty} {i?.unit} · {money(a.value)} · {a.reason} · by {a.by}</span><Button size="sm" variant="secondary" onClick={() => { const p = approveAdjustment(a.id, me); if (p) toast.error(p); else toast.success("Adjustment applied"); }}>Approve</Button></div>
            ); })}
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader><CardTitle className="text-base">Recent movements</CardTitle></CardHeader>
        <CardContent className="grid gap-1 text-xs text-muted-foreground">
          {movements.slice(0, 8).map((m) => { const i = items.find((x) => x.id === m.itemId); const l = locations.find((x) => x.id === m.locationId); return <p key={m.id}>{m.date} · {m.type} · {i?.name} · {m.qty > 0 ? "+" : ""}{m.qty} · {l?.name}{m.batchNo ? ` · batch ${m.batchNo}` : ""} · {m.reason}</p>; })}
        </CardContent>
      </Card>
    </>
  );
}

function OrdersView({ me }: { me: string }) {
  const items = useOperationsStore((state) => state.items);
  const batches = useOperationsStore((state) => state.batches);
  const movements = useOperationsStore((state) => state.movements);
  const dispatches = useOperationsStore((state) => state.dispatches);
  const createDispatch = useOperationsStore((state) => state.createDispatch);
  const markDelivered = useOperationsStore((state) => state.markDelivered);
  const recordReturn = useOperationsStore((state) => state.recordReturn);
  const locations = useLocationsStore((state) => state.locations);
  const [customer, setCustomer] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [dealId, setDealId] = React.useState("");
  const [transporter, setTransporter] = React.useState("");
  const [lrNumber, setLrNumber] = React.useState("");
  const links = useCrmLinkOptions();
  const [locationId, setLocationId] = React.useState<number | "">("");
  const [lines, setLines] = React.useState<{ itemId: string; batchNo: string; qty: string }[]>([{ itemId: "", batchNo: "", qty: "" }]);
  const [proofFor, setProofFor] = React.useState<Dispatch | null>(null);
  const [proof, setProof] = React.useState("");
  const [returnFor, setReturnFor] = React.useState<Dispatch | null>(null);
  const [returnItem, setReturnItem] = React.useState("");
  const [returnQty, setReturnQty] = React.useState("");
  const [returnCondition, setReturnCondition] = React.useState<"good" | "damaged">("good");
  const [returnReason, setReturnReason] = React.useState("");
  const [docsFor, setDocsFor] = React.useState<Dispatch | null>(null);

  function create() {
    if (locationId === "") return toast.error("Choose the location to dispatch from.");
    const problem = createDispatch({ customer, customerCompany: company, dealId: dealId || undefined, transporter, lrNumber, locationId: Number(locationId), lines: lines.filter((l) => l.itemId).map((l) => ({ itemId: l.itemId, batchNo: l.batchNo || null, qty: Number(l.qty), rate: items.find((i) => i.id === l.itemId)?.rate ?? 0 })) }, me);
    if (problem) return toast.error(problem);
    toast.success("Dispatch created with delivery challan");
    setCustomer(""); setCompany(""); setDealId(""); setTransporter(""); setLrNumber(""); setLines([{ itemId: "", batchNo: "", qty: "" }]);
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">New dispatch</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-xs text-muted-foreground">Stock is reduced when the dispatch is created. A delivery challan is issued. The GST invoice follows from Finance.</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="flex flex-col gap-1.5"><Label htmlFor="ds-cust">Customer</Label><Input id="ds-cust" value={customer} onChange={(e) => setCustomer(e.target.value)} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="ds-comp">Company</Label><Input id="ds-comp" value={company} onChange={(e) => setCompany(e.target.value)} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="ds-transporter">Transporter (optional)</Label><Input id="ds-transporter" value={transporter} onChange={(e) => setTransporter(e.target.value)} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="ds-lr">LR number (optional)</Label><Input id="ds-lr" value={lrNumber} onChange={(e) => setLrNumber(e.target.value)} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="ds-deal">CRM deal (optional)</Label><select id="ds-deal" className="h-8 rounded-md border border-input bg-surface px-2 text-xs" value={dealId} onChange={(e) => setDealId(e.target.value)}><option value="">None</option>{links.deals.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></div>
            <div className="flex flex-col gap-1.5 sm:col-span-2"><Label htmlFor="ds-loc">Dispatch from</Label><select id="ds-loc" className={selectClass} value={locationId} onChange={(e) => setLocationId(e.target.value === "" ? "" : Number(e.target.value))}><option value="">Choose…</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
          </div>
          {lines.map((line, index) => {
            const item = items.find((i) => i.id === line.itemId);
            const available = item && locationId !== "" ? stockOn(movements, item.id, Number(locationId), item.trackBatch ? line.batchNo || undefined : undefined) : null;
            const itemBatches = batches.filter((b) => b.itemId === line.itemId && !isExpired(b));
            return (
              <div key={index} className="grid gap-2 sm:grid-cols-[2fr_1.2fr_1fr_auto]">
                <select aria-label={`Item ${index + 1}`} className={selectClass} value={line.itemId} onChange={(e) => setLines((cur) => cur.map((l, i) => i === index ? { ...l, itemId: e.target.value, batchNo: "" } : l))}><option value="">Item…</option>{items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
                {item?.trackBatch ? <select aria-label={`Batch ${index + 1}`} className={selectClass} value={line.batchNo} onChange={(e) => setLines((cur) => cur.map((l, i) => i === index ? { ...l, batchNo: e.target.value } : l))}><option value="">Batch…</option>{itemBatches.map((b) => <option key={b.id} value={b.batchNo}>{b.batchNo} (exp {b.expiry})</option>)}</select> : <span className="self-center text-xs text-muted-foreground">{available !== null ? `${available} ${item?.unit} here` : ""}</span>}
                <Input aria-label={`Quantity ${index + 1}`} type="number" min={0} value={line.qty} onChange={(e) => setLines((cur) => cur.map((l, i) => i === index ? { ...l, qty: e.target.value } : l))} />
                <Button variant="ghost" size="sm" disabled={lines.length === 1} onClick={() => setLines((cur) => cur.filter((_, i) => i !== index))}>Remove</Button>
              </div>
            );
          })}
          <div className="flex gap-2"><Button variant="secondary" size="sm" onClick={() => setLines((cur) => [...cur, { itemId: "", batchNo: "", qty: "" }])}>Add item</Button><Button size="sm" onClick={create}>Create dispatch</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="px-4 py-2">Dispatch</th><th className="px-4 py-2">Customer</th><th className="px-4 py-2">Items</th><th className="px-4 py-2">Status</th><th className="px-4 py-2" /></tr></thead>
            <tbody>
              {dispatches.length === 0 ? <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No dispatches yet.</td></tr> : null}
              {dispatches.map((d) => (
                <tr key={d.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">{d.number}<span className="block text-xs text-muted-foreground">Challan {d.challanNo} · {d.date}</span></td>
                  <td className="px-4 py-3">{d.customer}<span className="block text-xs text-muted-foreground">{d.customerCompany}</span>{linkedLabel(links.deals, d.dealId) ? <span className="block text-xs text-muted-foreground">Deal: {linkedLabel(links.deals, d.dealId)}</span> : null}{d.transporter || d.lrNumber ? <span className="block text-xs text-muted-foreground">{d.transporter ?? "Transporter not given"}{d.lrNumber ? ` · LR ${d.lrNumber}` : ""}</span> : null}</td>
                  <td className="px-4 py-3 text-xs">{d.lines.map((l) => `${items.find((i) => i.id === l.itemId)?.name} × ${l.qty}${l.batchNo ? ` (${l.batchNo})` : ""}`).join(", ")}</td>
                  <td className="px-4 py-3"><Badge variant={d.status === "delivered" ? "success" : "warning"}>{d.status}</Badge>{d.proof ? <span className="block text-xs text-muted-foreground">{d.proof}</span> : null}</td>
                  <td className="px-4 py-3 text-right"><div className="flex justify-end gap-1">{d.status === "dispatched" ? <Button size="sm" variant="secondary" onClick={() => setProofFor(d)}>Mark delivered</Button> : null}<Button size="sm" variant="ghost" onClick={() => setDocsFor(d)}>Documents</Button><Button size="sm" variant="ghost" onClick={() => setReturnFor(d)}>Return</Button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={docsFor !== null} onOpenChange={(open) => !open && setDocsFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Documents for {docsFor?.number}</DialogTitle><DialogDescription>Challans, receipts and contracts for this dispatch.</DialogDescription></DialogHeader>
          {docsFor ? <RecordDocuments recordKind="dispatch" recordId={docsFor.id} addedBy={me} today="2026-10-23" /> : null}
        </DialogContent>
      </Dialog>

      {proofFor ? (
        <Dialog open onOpenChange={(open) => !open && setProofFor(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Mark {proofFor.number} delivered</DialogTitle><DialogDescription>Add proof: the receiver&apos;s name, the signed challan number or a photo reference.</DialogDescription></DialogHeader>
            <Input value={proof} onChange={(e) => setProof(e.target.value)} placeholder="e.g. Received by R. Kumar, signed challan DC-0101" />
            <DialogFooter><Button variant="secondary" onClick={() => setProofFor(null)}>Cancel</Button><Button disabled={proof.trim().length < 3} onClick={() => { const p = markDelivered(proofFor.id, proof, me); if (p) return toast.error(p); toast.success("Marked delivered"); setProofFor(null); setProof(""); }}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {returnFor ? (
        <Dialog open onOpenChange={(open) => !open && setReturnFor(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Return from {returnFor.number}</DialogTitle><DialogDescription>Good stock goes back into the location. Damaged stock is recorded but not added back.</DialogDescription></DialogHeader>
            <div className="grid gap-3">
              <select aria-label="Item" className={selectClass} value={returnItem} onChange={(e) => setReturnItem(e.target.value)}><option value="">Item…</option>{returnFor.lines.map((l) => <option key={l.itemId} value={l.itemId}>{items.find((i) => i.id === l.itemId)?.name} (sent {l.qty})</option>)}</select>
              <Input aria-label="Quantity returned" type="number" min={1} value={returnQty} onChange={(e) => setReturnQty(e.target.value)} placeholder="Quantity returned" />
              <select aria-label="Condition" className={selectClass} value={returnCondition} onChange={(e) => setReturnCondition(e.target.value as "good" | "damaged")}><option value="good">Good</option><option value="damaged">Damaged</option></select>
              <Input aria-label="Reason" value={returnReason} onChange={(e) => setReturnReason(e.target.value)} placeholder="Reason" />
            </div>
            <DialogFooter><Button variant="secondary" onClick={() => setReturnFor(null)}>Cancel</Button><Button disabled={!returnItem || !returnQty || returnReason.trim().length < 3} onClick={() => { const p = recordReturn({ dispatchId: returnFor.id, itemId: returnItem, qty: Number(returnQty), condition: returnCondition, reason: returnReason }, me); if (p) return toast.error(p); toast.success("Return recorded"); setReturnFor(null); setReturnQty(""); setReturnReason(""); }}>Record return</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

function WarehousesView() {
  const locations = useLocationsStore((state) => state.locations);
  return (
    <>
      <Card>
        <CardContent className="grid gap-2 p-4 text-sm">
          {locations.length === 0 ? <p className="text-muted-foreground">No locations yet.</p> : null}
          {locations.map((l) => <p key={l.id}><span className="font-medium">{l.name}</span> · {l.kind} · {l.address}{l.gst ? ` · ${l.gst}` : ""}</p>)}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Locations are added and edited in <Link href="/settings?tab=workspace&view=settings&workspace=business" className="underline">Company Profile</Link>. Each location can hold stock.</p>
    </>
  );
}
