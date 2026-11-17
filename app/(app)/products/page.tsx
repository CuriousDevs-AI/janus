"use client";

import { useMemo, useState } from "react";
import {
  Package, Plus, Pencil, Archive, RotateCcw, RefreshCw,
  LayoutGrid, List, IndianRupee, Tag, Hash, MoreHorizontal, Eye,
} from "lucide-react";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { useSession } from "@/components/auth/session-provider";
import { can } from "@/lib/permissions";
import type { CrmProduct } from "@/lib/api/types";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrencyINR, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const UNITS = ["unit", "piece", "hour", "day", "month", "year", "kg", "litre", "metre", "sqft", "lot"];
const CATEGORIES = ["all", "in-house", "external", "service"] as const;
type ProductCategory = (typeof CATEGORIES)[number];
type ViewMode = "table" | "grid";

function inferCategory(p: CrmProduct): "in-house" | "external" | "service" {
  const d = `${p.name} ${p.description}`.toLowerCase();
  if (["hour", "day", "month", "year"].includes(p.unit)) return "service";
  if (d.includes("[external]") || d.includes("third-party") || d.includes("reseller")) return "external";
  return "in-house";
}

function categoryBadge(cat: "in-house" | "external" | "service") {
  if (cat === "in-house") return <Badge variant="accent" className="text-[10px]">In-house</Badge>;
  if (cat === "external") return <Badge variant="warning" className="text-[10px]">External</Badge>;
  return <Badge variant="info" className="text-[10px]">Service</Badge>;
}

function useLocalView(): [ViewMode, (v: ViewMode) => void] {
  const [view, setView] = useState<ViewMode>(() => {
    try { return (localStorage.getItem("janus:products:view") as ViewMode) || "table"; } catch { return "table"; }
  });
  return [view, (v: ViewMode) => { setView(v); try { localStorage.setItem("janus:products:view", v); } catch {} }];
}

export default function ProductsPage() {
  const session = useSession();
  const canWrite = can(session, "settings:manage");
  const [showInactive, setShowInactive] = useState(false);
  const products = useApi<CrmProduct[]>(`/products${showInactive ? "?all=true" : ""}`);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Partial<CrmProduct> | null>(null);
  const [preview, setPreview] = useState<CrmProduct | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useLocalView();
  const [categoryFilter, setCategoryFilter] = useState<ProductCategory>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const all = products.data ?? [];
  const filtered = useMemo(() => {
    return all.filter((p) => {
      const matchesQuery = `${p.name} ${p.sku ?? ""} ${p.description}`.toLowerCase().includes(query.toLowerCase());
      const matchesCategory = categoryFilter === "all" || inferCategory(p) === categoryFilter;
      return matchesQuery && matchesCategory;
    });
  }, [all, query, categoryFilter]);

  const activeCount = all.filter((p) => p.active).length;
  const avgPrice = all.length > 0 ? all.reduce((s, p) => s + Number(p.unitPrice), 0) / all.length : 0;
  const noSku = all.filter((p) => !p.sku).length;
  const totalValue = all.reduce((s, p) => s + Number(p.unitPrice), 0);

  const toggleSelect = (id: string) => setSelectedIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allSelected = filtered.length > 0 && filtered.every((p) => selectedIds.has(p.id));

  async function save() {
    if (!editing) return;
    if (!editing.name?.trim()) { toast.error("Enter a product name"); return; }
    setBusy(true);
    try {
      if (editing.id) {
        await api(`/products/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: editing.name, sku: editing.sku || null, description: editing.description ?? "", unitPrice: editing.unitPrice ?? "0", taxPct: editing.taxPct ?? "0", unit: editing.unit ?? "unit" }),
        });
        toast.success("Product updated");
      } else {
        await api("/products", {
          method: "POST",
          body: JSON.stringify({ name: editing.name, sku: editing.sku || null, description: editing.description ?? "", unitPrice: editing.unitPrice ?? "0", taxPct: editing.taxPct ?? "0", unit: editing.unit ?? "unit" }),
        });
        toast.success("Product created");
      }
      setEditing(null);
      products.reload();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(product: CrmProduct) {
    try {
      await api(`/products/${product.id}`, { method: "PATCH", body: JSON.stringify({ active: !product.active }) });
      toast.success(product.active ? "Product deactivated" : "Product reactivated");
      products.reload();
    } catch (e) {
      toast.error(message(e));
    }
  }

  async function bulkToggle(active: boolean) {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setBusy(true);
    try {
      await Promise.all(ids.map((id) => api(`/products/${id}`, { method: "PATCH", body: JSON.stringify({ active }) })));
      toast.success(`${ids.length} product${ids.length !== 1 ? "s" : ""} ${active ? "activated" : "deactivated"}`);
      setSelectedIds(new Set());
      products.reload();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Products & Services"
        description={products.data ? `${all.length} product${all.length === 1 ? "" : "s"} · ${formatCurrencyINR(totalValue)} catalog value` : "Your product catalog"}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => products.reload()} aria-label="Refresh"><RefreshCw className="size-3.5" /></Button>
            {canWrite && (
              <Button size="sm" onClick={() => setEditing({ name: "", unit: "unit", unitPrice: "0", taxPct: "0", description: "" })}>
                <Plus className="size-3.5" /> Add Product
              </Button>
            )}
          </div>
        }
      />

      {/* Summary cards */}
      {all.length > 0 && (
        <div className="grid gap-2 px-6 pb-3 sm:grid-cols-4">
          {([
            ["Total Products", String(all.length), "In your catalog", "bg-accent"],
            ["Active", String(activeCount), `${all.length - activeCount} inactive`, "bg-emerald-500"],
            ["Avg Unit Price", formatCurrencyINR(avgPrice), "Across all products", "bg-indigo-500"],
            ["Missing SKU", String(noSku), noSku > 0 ? "Consider adding" : "All tagged", "bg-amber-500"],
          ] as const).map(([title, value, detail, dot]) => (
            <div key={title} className="rounded-xl border border-border bg-surface p-3">
              <div className="flex items-center gap-1.5">
                <span className={cn("size-1.5 rounded-full", dot)} />
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-lg font-bold tabular-nums">{value}</span>
                <span className="text-[11px] text-muted-foreground">{detail}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 pb-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Search products..." className="w-60" />
        <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as ProductCategory)}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="in-house">In-house</SelectItem>
            <SelectItem value="external">External</SelectItem>
            <SelectItem value="service">Service</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => setShowInactive(!showInactive)}>
          {showInactive ? "Hide inactive" : "Show inactive"}
        </Button>
        <div className="flex rounded-lg border border-border bg-surface-2 p-0.5">
          <button type="button" onClick={() => setView("table")} className={cn("flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors", view === "table" ? "bg-surface shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}><List className="size-3.5" /> Table</button>
          <button type="button" onClick={() => setView("grid")} className={cn("flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors", view === "grid" ? "bg-surface shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}><LayoutGrid className="size-3.5" /> Grid</button>
        </div>
        {canWrite && selectedIds.size > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs font-medium">{selectedIds.size} selected</span>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => bulkToggle(true)}>Activate</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => bulkToggle(false)}>Deactivate</Button>
          </div>
        )}
      </div>

      {products.error && <p role="alert" className="mx-6 mt-3 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">{products.error}</p>}

      <div className="flex-1 overflow-auto px-6 py-4">
        {filtered.length === 0 ? (
          <EmptyState
            icon={Package}
            title={query || categoryFilter !== "all" ? "No products match your filters" : "No products yet"}
            description={query || categoryFilter !== "all" ? "Try a different search or category filter." : "Add your products and services to use in deals and quotes. Products can be in-house manufactured, externally sourced or services billed by time."}
            action={
              canWrite && !query ? (
                <Button size="sm" onClick={() => setEditing({ name: "", unit: "unit", unitPrice: "0", taxPct: "0", description: "" })}>
                  <Plus className="size-3.5 mr-1" /> Add Product
                </Button>
              ) : undefined
            }
          />
        ) : view === "table" ? (
          <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-surface-2">
                  {canWrite && <TableHead className="w-10"><Checkbox checked={allSelected} onCheckedChange={(c) => setSelectedIds(c ? new Set(filtered.map((p) => p.id)) : new Set())} /></TableHead>}
                  <TableHead>Product</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Tax %</TableHead>
                  <TableHead className="text-right">Price + Tax</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-14" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => {
                  const cat = inferCategory(p);
                  const priceWithTax = Number(p.unitPrice) * (1 + Number(p.taxPct) / 100);
                  return (
                    <TableRow key={p.id} className={cn("group", !p.active && "opacity-50", selectedIds.has(p.id) && "bg-accent-muted/30")}>
                      {canWrite && <TableCell><Checkbox checked={selectedIds.has(p.id)} onCheckedChange={() => toggleSelect(p.id)} /></TableCell>}
                      <TableCell>
                        <div>
                          <span className="font-medium">{p.name}</span>
                          {p.description && <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{p.description}</p>}
                        </div>
                      </TableCell>
                      <TableCell>{categoryBadge(cat)}</TableCell>
                      <TableCell>
                        {p.sku ? <span className="text-xs font-mono bg-surface-2 rounded px-1.5 py-0.5">{p.sku}</span> : <span className="text-xs text-muted-foreground/50">—</span>}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatCurrencyINR(Number(p.unitPrice))}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{p.taxPct}%</TableCell>
                      <TableCell className="text-right tabular-nums text-xs text-muted-foreground">{formatCurrencyINR(priceWithTax)}</TableCell>
                      <TableCell><span className="capitalize text-xs text-muted-foreground">{p.unit}</span></TableCell>
                      <TableCell><Badge variant={p.active ? "success" : "neutral"}>{p.active ? "Active" : "Inactive"}</Badge></TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="size-7 p-0 opacity-0 group-hover:opacity-100"><MoreHorizontal className="size-3.5" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setPreview(p)}><Eye className="size-3.5 mr-2" /> View</DropdownMenuItem>
                            {canWrite && <DropdownMenuItem onClick={() => setEditing(p)}><Pencil className="size-3.5 mr-2" /> Edit</DropdownMenuItem>}
                            {canWrite && <DropdownMenuItem onClick={() => toggleActive(p)}>{p.active ? <><Archive className="size-3.5 mr-2" /> Deactivate</> : <><RotateCcw className="size-3.5 mr-2" /> Reactivate</>}</DropdownMenuItem>}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((p) => {
              const cat = inferCategory(p);
              const priceWithTax = Number(p.unitPrice) * (1 + Number(p.taxPct) / 100);
              return (
                <article key={p.id} className={cn("group flex flex-col rounded-xl border border-border bg-surface p-4 transition-all hover:shadow-md hover:border-border-strong", !p.active && "opacity-50")} onClick={() => setPreview(p)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold leading-tight line-clamp-2">{p.name}</h3>
                      {p.description && <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{p.description}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {categoryBadge(cat)}
                      <Badge variant={p.active ? "success" : "neutral"} className="text-[9px]">{p.active ? "Active" : "Inactive"}</Badge>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <div className="flex items-baseline gap-1">
                      <span className="text-lg font-bold tabular-nums">{formatCurrencyINR(Number(p.unitPrice))}</span>
                      <span className="text-[10px] text-muted-foreground">/{p.unit}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                      {Number(p.taxPct) > 0 && <span className="flex items-center gap-0.5"><Tag className="size-2.5" /> {p.taxPct}% tax → {formatCurrencyINR(priceWithTax)}</span>}
                      {p.sku && <span className="flex items-center gap-0.5"><Hash className="size-2.5" /> {p.sku}</span>}
                    </div>
                  </div>
                  {canWrite && (
                    <div className="flex gap-1 mt-3 pt-2 border-t border-border/50">
                      <Button variant="ghost" size="sm" className="h-7 text-xs flex-1" onClick={(e) => { e.stopPropagation(); setEditing(p); }}><Pencil className="size-3" /> Edit</Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs flex-1" onClick={(e) => { e.stopPropagation(); toggleActive(p); }}>{p.active ? <><Archive className="size-3" /> Deactivate</> : <><RotateCcw className="size-3" /> Activate</>}</Button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Product Detail Dialog */}
      <Dialog open={preview !== null} onOpenChange={(v) => { if (!v) setPreview(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{preview?.name}</DialogTitle>
            <DialogDescription>Product details</DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {categoryBadge(inferCategory(preview))}
                <Badge variant={preview.active ? "success" : "neutral"}>{preview.active ? "Active" : "Inactive"}</Badge>
                {preview.sku && <Badge variant="outline" className="font-mono">{preview.sku}</Badge>}
              </div>
              {preview.description && <p className="text-sm text-muted-foreground">{preview.description}</p>}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border bg-surface-2 p-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Unit Price</span>
                  <span className="mt-1 block text-lg font-bold tabular-nums">{formatCurrencyINR(Number(preview.unitPrice))}</span>
                  <span className="text-xs text-muted-foreground">per {preview.unit}</span>
                </div>
                <div className="rounded-lg border border-border bg-surface-2 p-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">With Tax</span>
                  <span className="mt-1 block text-lg font-bold tabular-nums">{formatCurrencyINR(Number(preview.unitPrice) * (1 + Number(preview.taxPct) / 100))}</span>
                  <span className="text-xs text-muted-foreground">{preview.taxPct}% GST</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            {canWrite && preview && <Button variant="outline" onClick={() => { setEditing(preview); setPreview(null); }}>Edit</Button>}
            <Button variant="outline" onClick={() => setPreview(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit/Create Dialog */}
      <Dialog open={editing !== null} onOpenChange={(v) => { if (!v) setEditing(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit Product" : "New Product"}</DialogTitle>
            <DialogDescription>{editing?.id ? "Update product details and pricing." : "Add a new product or service to your catalog."}</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Name *</Label>
                <Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Cloud Hosting Plan" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>SKU</Label>
                  <Input value={editing.sku ?? ""} onChange={(e) => setEditing({ ...editing, sku: e.target.value })} placeholder="e.g. SKU-001" />
                </div>
                <div>
                  <Label>Unit</Label>
                  <Select value={editing.unit ?? "unit"} onValueChange={(v) => setEditing({ ...editing, unit: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {UNITS.map((u) => <SelectItem key={u} value={u} className="capitalize">{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Unit Price (₹)</Label>
                  <Input type="number" value={editing.unitPrice ?? "0"} onChange={(e) => setEditing({ ...editing, unitPrice: e.target.value })} />
                </div>
                <div>
                  <Label>Tax %</Label>
                  <Input type="number" value={editing.taxPct ?? "0"} onChange={(e) => setEditing({ ...editing, taxPct: e.target.value })} />
                </div>
              </div>
              {editing.unitPrice && Number(editing.unitPrice) > 0 && Number(editing.taxPct) > 0 && (
                <div className="rounded-md bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
                  Price with tax: <span className="font-semibold text-foreground">{formatCurrencyINR(Number(editing.unitPrice) * (1 + Number(editing.taxPct) / 100))}</span>
                </div>
              )}
              <div>
                <Label>Description</Label>
                <Textarea value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} rows={2} placeholder="Product details, specifications..." />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={busy}>{busy ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
