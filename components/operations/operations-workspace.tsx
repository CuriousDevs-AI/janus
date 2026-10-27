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
import { ADJUSTMENT_APPROVAL_VALUE, TODAY, isExpired, stockOn, useOperationsStore, type Dispatch } from "@/lib/stores/operations-store";
import { useLocationsStore } from "@/lib/stores/company-locations-store";
import { useSession } from "@/components/auth/session-provider";

const money = (value: number) => `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const selectClass = "h-9 w-full rounded-md border border-input bg-surface px-3 text-sm";
const days = (from: string, to: string) => Math.floor((Date.parse(to) - Date.parse(from)) / 86400000);

const comingSoon: Record<string, string> = {
  procurement: "Requisitions, purchase approval and budget check come in phase 2, with purchase orders.",
  "purchase-orders": "Purchase orders and goods receipt against them come in phase 2.",
  vendors: "The vendor list, with GSTIN and payment terms, comes in phase 2.",
  workflows: "Operational workflows come after the core stock and dispatch screens are in use.",
  reports: "Operations reports come once stock and dispatch have history.",
};

export function OperationsWorkspace() {
  const searchParams = useSearchParams();
  const view = searchParams.get("view") ?? "overview";
  const session = useSession();
  const me = session.user.name ?? session.user.email ?? "You";
  const titles: Record<string, string> = { overview: "Operations overview", products: "Products & stock", inventory: "Inventory by location", orders: "Dispatch & returns", warehouses: "Warehouses & locations" };

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
        {!["products", "inventory", "orders", "warehouses"].includes(view) && <OverviewView />}
      </div>
    </div>
  );
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
      toast.success(Math.abs(Number(qty)) * (item?.rate ?? 0) > ADJUSTMENT_APPROVAL_VALUE ? "Adjustment sent for approval" : "Adjustment applied");
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
          <p className="text-xs text-muted-foreground">Adjustments above ₹{ADJUSTMENT_APPROVAL_VALUE.toLocaleString("en-IN")} need approval by someone other than the person who requested them.</p>
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
  const [locationId, setLocationId] = React.useState<number | "">("");
  const [lines, setLines] = React.useState<{ itemId: string; batchNo: string; qty: string }[]>([{ itemId: "", batchNo: "", qty: "" }]);
  const [proofFor, setProofFor] = React.useState<Dispatch | null>(null);
  const [proof, setProof] = React.useState("");
  const [returnFor, setReturnFor] = React.useState<Dispatch | null>(null);
  const [returnItem, setReturnItem] = React.useState("");
  const [returnQty, setReturnQty] = React.useState("");
  const [returnCondition, setReturnCondition] = React.useState<"good" | "damaged">("good");
  const [returnReason, setReturnReason] = React.useState("");

  function create() {
    if (locationId === "") return toast.error("Choose the location to dispatch from.");
    const problem = createDispatch({ customer, customerCompany: company, locationId: Number(locationId), lines: lines.filter((l) => l.itemId).map((l) => ({ itemId: l.itemId, batchNo: l.batchNo || null, qty: Number(l.qty), rate: items.find((i) => i.id === l.itemId)?.rate ?? 0 })) }, me);
    if (problem) return toast.error(problem);
    toast.success("Dispatch created with delivery challan");
    setCustomer(""); setCompany(""); setLines([{ itemId: "", batchNo: "", qty: "" }]);
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
                  <td className="px-4 py-3">{d.customer}<span className="block text-xs text-muted-foreground">{d.customerCompany}</span></td>
                  <td className="px-4 py-3 text-xs">{d.lines.map((l) => `${items.find((i) => i.id === l.itemId)?.name} × ${l.qty}${l.batchNo ? ` (${l.batchNo})` : ""}`).join(", ")}</td>
                  <td className="px-4 py-3"><Badge variant={d.status === "delivered" ? "success" : "warning"}>{d.status}</Badge>{d.proof ? <span className="block text-xs text-muted-foreground">{d.proof}</span> : null}</td>
                  <td className="px-4 py-3 text-right"><div className="flex justify-end gap-1">{d.status === "dispatched" ? <Button size="sm" variant="secondary" onClick={() => setProofFor(d)}>Mark delivered</Button> : null}<Button size="sm" variant="ghost" onClick={() => setReturnFor(d)}>Return</Button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

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
