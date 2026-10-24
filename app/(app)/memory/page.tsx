"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Pencil, Trash2, BrainCircuit } from "lucide-react";
import { memoryItems as initialMemoryItems, getCustomerById } from "@/lib/mock-data";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { EmptyState } from "@/components/shared/empty-state";
import { CustomerAvatar } from "@/components/shared/customer-avatar";
import { AIConfidence } from "@/components/shared/ai-indicator";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/utils";
import type { MemoryItem, MemoryKind } from "@/lib/types";
import type { VariantProps } from "class-variance-authority";

type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

const kindMeta: Record<MemoryKind, { label: string; tone: BadgeTone }> = {
  stable_fact: { label: "Customer Memory", tone: "info" },
  conversation: { label: "Conversation Memory", tone: "accent" },
  derived_insight: { label: "Derived Insight", tone: "warning" },
  support: { label: "Event History", tone: "neutral" },
};

const statusMeta: Record<MemoryItem["status"], { label: string; tone: BadgeTone }> = {
  approved: { label: "Approved", tone: "success" },
  pending: { label: "Pending", tone: "warning" },
  rejected: { label: "Rejected", tone: "danger" },
};

const confidenceOptions = [
  { value: "all", label: "Any confidence" },
  { value: "90", label: "90%+" },
  { value: "75", label: "75%+" },
  { value: "50", label: "50%+" },
];

export default function MemoryPage() {
  const [items, setItems] = React.useState<MemoryItem[]>(initialMemoryItems);
  const [query, setQuery] = React.useState("");
  const [kindFilter, setKindFilter] = React.useState<string>("all");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [confidenceFilter, setConfidenceFilter] = React.useState<string>("all");
  const [editItem, setEditItem] = React.useState<MemoryItem | null>(null);
  const [editValue, setEditValue] = React.useState("");

  const kindCounts = React.useMemo(() => {
    const counts: Record<MemoryKind, number> = { stable_fact: 0, derived_insight: 0, conversation: 0, support: 0 };
    for (const item of items) counts[item.kind] += 1;
    return counts;
  }, [items]);

  const rows = items
    .map((item) => ({ item, customer: getCustomerById(item.customerId) }))
    .filter((r) => kindFilter === "all" || r.item.kind === kindFilter)
    .filter((r) => statusFilter === "all" || r.item.status === statusFilter)
    .filter((r) => {
      if (confidenceFilter === "all") return true;
      const min = Number(confidenceFilter);
      return Math.round((r.item.confidence ?? 0) * 100) >= min;
    })
    .filter((r) => {
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        r.item.value.toLowerCase().includes(q) ||
        r.item.label.toLowerCase().includes(q) ||
        r.item.source.toLowerCase().includes(q) ||
        (r.customer?.name.toLowerCase().includes(q) ?? false)
      );
    })
    .sort((a, b) => (a.item.createdAt < b.item.createdAt ? 1 : -1));

  function approve(id: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: "approved" } : i)));
    toast.success("Memory approved");
  }

  function openEdit(item: MemoryItem) {
    setEditItem(item);
    setEditValue(item.value);
  }

  function saveEdit() {
    if (!editItem) return;
    setItems((prev) => prev.map((i) => (i.id === editItem.id ? { ...i, value: editValue } : i)));
    toast.success("Memory updated");
    setEditItem(null);
  }

  function remove(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    toast.success("Memory deleted");
  }

  function resetFilters() {
    setQuery("");
    setKindFilter("all");
    setStatusFilter("all");
    setConfidenceFilter("all");
  }

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col">
      <PageHeader
        title="Memory"
        description={`${items.length} memories — ${kindCounts.stable_fact} customer · ${kindCounts.conversation} conversation · ${kindCounts.derived_insight} derived insights · ${kindCounts.support} event history`}
      />

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 pb-4">
        <SearchInput value={query} onChange={setQuery} placeholder="Search memory or customers…" className="w-64" />
        <Select value={kindFilter} onValueChange={setKindFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Memory type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All memory types</SelectItem>
            {(Object.keys(kindMeta) as MemoryKind[]).map((k) => (
              <SelectItem key={k} value={k}>
                {kindMeta[k].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select value={confidenceFilter} onValueChange={setConfidenceFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Confidence" />
          </SelectTrigger>
          <SelectContent>
            {confidenceOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-[12px] text-muted-foreground">
          {rows.length} of {items.length} shown
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="px-6 py-6">
          <EmptyState
            icon={BrainCircuit}
            title="No memory items match your filters"
            description="Try a different search term or reset the filters."
            action={
              <Button size="sm" variant="secondary" onClick={resetFilters}>
                Reset filters
              </Button>
            }
          />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[280px]">Memory</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Captured</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-32">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ item, customer }) => (
              <TableRow key={item.id}>
                <TableCell className="whitespace-normal">
                  <div className="flex flex-col gap-0.5 py-0.5">
                    <span className="text-[11px] text-muted-foreground">{item.label}</span>
                    <span className="text-foreground">{item.value}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={kindMeta[item.kind].tone}>{kindMeta[item.kind].label}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{item.source}</TableCell>
                <TableCell>
                  {typeof item.confidence === "number" ? (
                    <AIConfidence value={item.confidence} />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {customer ? (
                    <Link href={`/customers/${customer.id}`} className="flex items-center gap-2 hover:text-accent">
                      <CustomerAvatar name={customer.name} color={customer.avatarColor} size="sm" />
                      <span className="font-medium text-foreground">{customer.name}</span>
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">Unknown</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDate(item.createdAt)}</TableCell>
                <TableCell>
                  <Badge variant={statusMeta[item.status].tone}>{statusMeta[item.status].label}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {item.status === "pending" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Approve"
                        aria-label="Approve memory"
                        onClick={() => approve(item.id)}
                      >
                        <Check className="size-3.5 text-success" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Edit"
                      aria-label="Edit memory"
                      onClick={() => openEdit(item)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Delete"
                      aria-label="Delete memory"
                      onClick={() => remove(item.id)}
                    >
                      <Trash2 className="size-3.5 text-danger" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit memory</DialogTitle>
            <DialogDescription>{editItem?.label}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="memory-value">Value</Label>
            <Textarea
              id="memory-value"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="min-h-28"
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setEditItem(null)}>
              Cancel
            </Button>
            <Button onClick={saveEdit}>Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
