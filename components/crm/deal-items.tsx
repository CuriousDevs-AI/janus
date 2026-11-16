"use client";

import { useState } from "react";
import { Plus, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import type { CrmProduct, DealItem } from "@/lib/api/types";
import { useApi } from "@/lib/api/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrencyINR } from "@/lib/utils";

function lineTotal(qty: string, price: string, disc: string) {
  const q = parseFloat(qty) || 0;
  const p = parseFloat(price) || 0;
  const d = parseFloat(disc) || 0;
  return q * p * (1 - d / 100);
}

interface LineItem {
  id?: string;
  productId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPct: string;
}

export function DealItemsEditor({
  dealId,
  items,
  onChanged,
  readOnly,
}: {
  dealId: string;
  items: DealItem[];
  onChanged?: () => void;
  readOnly?: boolean;
}) {
  const products = useApi<CrmProduct[]>("/products");
  const [lines, setLines] = useState<LineItem[]>(
    items.map((i) => ({
      id: i.id,
      productId: i.productId || "",
      description: i.description,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      discountPct: i.discountPct,
    })),
  );
  const [busy, setBusy] = useState(false);

  function addLine() {
    setLines([...lines, { productId: "", description: "", quantity: "1", unitPrice: "0", discountPct: "0" }]);
  }

  function updateLine(idx: number, field: keyof LineItem, value: string) {
    const updated = [...lines];
    updated[idx] = { ...updated[idx], [field]: value };
    if (field === "productId" && value) {
      const product = (products.data ?? []).find((p) => p.id === value);
      if (product) {
        updated[idx].description = product.name;
        updated[idx].unitPrice = product.unitPrice;
      }
    }
    setLines(updated);
  }

  function removeLine(idx: number) {
    setLines(lines.filter((_, i) => i !== idx));
  }

  const grandTotal = lines.reduce((sum, l) => sum + lineTotal(l.quantity, l.unitPrice, l.discountPct), 0);

  async function save() {
    setBusy(true);
    try {
      const existingIds = new Set(items.map((i) => i.id));
      const lineIds = new Set(lines.filter((l) => l.id).map((l) => l.id));

      for (const item of items) {
        if (!lineIds.has(item.id)) {
          await api(`/deals/${dealId}/items/${item.id}`, { method: "DELETE" });
        }
      }

      for (const line of lines) {
        const payload = {
          productId: line.productId || null,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountPct: line.discountPct,
        };
        if (line.id && existingIds.has(line.id)) {
          await api(`/deals/${dealId}/items/${line.id}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          });
        } else {
          await api(`/deals/${dealId}/items`, {
            method: "POST",
            body: JSON.stringify(payload),
          });
        }
      }
      toast.success("Line items saved");
      onChanged?.();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }

  async function generateQuote() {
    setBusy(true);
    try {
      await api(`/deals/${dealId}/quote`, {
        method: "POST",
        body: JSON.stringify({ notes: "", validUntil: null }),
      });
      toast.success("Quote generated");
      onChanged?.();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[200px]">Product</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="w-20">Qty</TableHead>
            <TableHead className="w-28">Unit Price</TableHead>
            <TableHead className="w-20">Disc %</TableHead>
            <TableHead className="w-28 text-right">Total</TableHead>
            {!readOnly && <TableHead className="w-10" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line, idx) => (
            <TableRow key={idx}>
              <TableCell>
                {readOnly ? (
                  <span className="text-sm">{line.description}</span>
                ) : (
                  <Select value={line.productId} onValueChange={(v) => updateLine(idx, "productId", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="custom">Custom item</SelectItem>
                      {(products.data ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </TableCell>
              <TableCell>
                {readOnly ? line.description : (
                  <Input className="h-8 text-xs" value={line.description} onChange={(e) => updateLine(idx, "description", e.target.value)} />
                )}
              </TableCell>
              <TableCell>
                {readOnly ? line.quantity : (
                  <Input className="h-8 text-xs" type="number" value={line.quantity} onChange={(e) => updateLine(idx, "quantity", e.target.value)} />
                )}
              </TableCell>
              <TableCell>
                {readOnly ? formatCurrencyINR(parseFloat(line.unitPrice)) : (
                  <Input className="h-8 text-xs" type="number" value={line.unitPrice} onChange={(e) => updateLine(idx, "unitPrice", e.target.value)} />
                )}
              </TableCell>
              <TableCell>
                {readOnly ? `${line.discountPct}%` : (
                  <Input className="h-8 text-xs" type="number" value={line.discountPct} onChange={(e) => updateLine(idx, "discountPct", e.target.value)} />
                )}
              </TableCell>
              <TableCell className="text-right font-medium">
                {formatCurrencyINR(lineTotal(line.quantity, line.unitPrice, line.discountPct))}
              </TableCell>
              {!readOnly && (
                <TableCell>
                  <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => removeLine(idx)}>
                    <Trash2 className="size-3.5 text-muted-foreground" />
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
          <TableRow>
            <TableCell colSpan={5} className="text-right font-semibold text-sm">Grand Total</TableCell>
            <TableCell className="text-right font-bold">{formatCurrencyINR(grandTotal)}</TableCell>
            {!readOnly && <TableCell />}
          </TableRow>
        </TableBody>
      </Table>
      {!readOnly && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={addLine} className="gap-1">
            <Plus className="size-3.5" /> Add Item
          </Button>
          <Button size="sm" onClick={save} disabled={busy}>Save Items</Button>
          <Button variant="outline" size="sm" onClick={generateQuote} disabled={busy} className="gap-1 ml-auto">
            <FileText className="size-3.5" /> Generate Quote
          </Button>
        </div>
      )}
    </div>
  );
}
