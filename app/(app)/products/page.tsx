"use client";

import { useState } from "react";
import { Package, Plus, Pencil, Archive, RotateCcw, RefreshCw } from "lucide-react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const UNITS = ["unit", "piece", "hour", "day", "month", "year", "kg", "litre", "metre", "sqft", "lot"];

export default function ProductsPage() {
  const session = useSession();
  const canWrite = can(session, "settings:manage");
  const [showInactive, setShowInactive] = useState(false);
  const products = useApi<CrmProduct[]>(`/products${showInactive ? "?all=true" : ""}`);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Partial<CrmProduct> | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = (products.data ?? []).filter((p) =>
    `${p.name} ${p.sku ?? ""} ${p.description}`.toLowerCase().includes(query.toLowerCase()),
  );

  async function save() {
    if (!editing) return;
    if (!editing.name?.trim()) { toast.error("Enter a product name"); return; }
    setBusy(true);
    try {
      if (editing.id) {
        await api(`/products/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: editing.name,
            sku: editing.sku || null,
            description: editing.description ?? "",
            unitPrice: editing.unitPrice ?? "0",
            taxPct: editing.taxPct ?? "0",
            unit: editing.unit ?? "unit",
          }),
        });
        toast.success("Product updated");
      } else {
        await api("/products", {
          method: "POST",
          body: JSON.stringify({
            name: editing.name,
            sku: editing.sku || null,
            description: editing.description ?? "",
            unitPrice: editing.unitPrice ?? "0",
            taxPct: editing.taxPct ?? "0",
            unit: editing.unit ?? "unit",
          }),
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
      await api(`/products/${product.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !product.active }),
      });
      toast.success(product.active ? "Product deactivated" : "Product reactivated");
      products.reload();
    } catch (e) {
      toast.error(message(e));
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Products & Services"
        description={`${filtered.length} ${filtered.length === 1 ? "product" : "products"}`}
        actions={
          canWrite ? (
            <Button size="sm" className="gap-1" onClick={() => setEditing({ name: "", unit: "unit", unitPrice: "0", taxPct: "0", description: "" })}>
              <Plus className="size-3.5" /> Add Product
            </Button>
          ) : undefined
        }
      />
      <div className="flex items-center gap-3 px-6 pb-4">
        <SearchInput value={query} onChange={setQuery} placeholder="Search products..." className="max-w-xs" />
        <Button variant="outline" size="sm" onClick={() => setShowInactive(!showInactive)}>
          {showInactive ? "Hide inactive" : "Show inactive"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => products.reload()}><RefreshCw className="size-3.5" /></Button>
      </div>
      <div className="flex-1 overflow-auto px-6">
        {filtered.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No products yet"
            description="Add your products and services to use in deals and quotes"
            action={
              canWrite ? (
                <Button size="sm" onClick={() => setEditing({ name: "", unit: "unit", unitPrice: "0", taxPct: "0", description: "" })}>
                  <Plus className="size-3.5 mr-1" /> Add Product
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Tax %</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Status</TableHead>
                {canWrite && <TableHead className="w-24">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id} className={cn(!p.active && "opacity-50")}>
                  <TableCell>
                    <div>
                      <span className="font-medium">{p.name}</span>
                      {p.description && <p className="text-xs text-muted-foreground line-clamp-1">{p.description}</p>}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono">{p.sku ?? "—"}</TableCell>
                  <TableCell className="text-right">{formatCurrencyINR(Number(p.unitPrice))}</TableCell>
                  <TableCell className="text-right">{p.taxPct}%</TableCell>
                  <TableCell className="capitalize text-sm">{p.unit}</TableCell>
                  <TableCell>
                    <Badge variant={p.active ? "success" : "neutral"}>{p.active ? "Active" : "Inactive"}</Badge>
                  </TableCell>
                  {canWrite && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => setEditing(p)}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => toggleActive(p)}>
                          {p.active ? <Archive className="size-3.5" /> : <RotateCcw className="size-3.5" />}
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={editing !== null} onOpenChange={(v) => { if (!v) setEditing(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit Product" : "New Product"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Name *</Label>
                <Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>SKU</Label>
                  <Input value={editing.sku ?? ""} onChange={(e) => setEditing({ ...editing, sku: e.target.value })} placeholder="Optional" />
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
                  <Label>Unit Price</Label>
                  <Input type="number" value={editing.unitPrice ?? "0"} onChange={(e) => setEditing({ ...editing, unitPrice: e.target.value })} />
                </div>
                <div>
                  <Label>Tax %</Label>
                  <Input type="number" value={editing.taxPct ?? "0"} onChange={(e) => setEditing({ ...editing, taxPct: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} rows={2} />
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
