"use client";

import { useMemo, useState } from "react";
import {
  FileCheck2, Eye, RefreshCw, Send,
  Clock, CheckCircle2, XCircle, AlertTriangle,
  ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { useSession } from "@/components/auth/session-provider";
import { can } from "@/lib/permissions";
import type { CrmQuote } from "@/lib/api/types";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrencyINR, formatRelativeTime, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type StatusFilter = "all" | "draft" | "sent" | "accepted" | "rejected" | "expired";
type SortKey = "date" | "total" | "number";

const STATUS_BADGE: Record<string, { variant: "neutral" | "accent" | "success" | "danger" | "warning"; icon: typeof Clock }> = {
  draft: { variant: "neutral", icon: Clock },
  sent: { variant: "accent", icon: Send },
  accepted: { variant: "success", icon: CheckCircle2 },
  rejected: { variant: "danger", icon: XCircle },
  expired: { variant: "warning", icon: AlertTriangle },
};

export default function QuotesPage() {
  const session = useSession();
  const canWrite = can(session, "leads:write");
  const quotes = useApi<CrmQuote[]>("/quotes");
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<CrmQuote | null>(null);
  const [statusChange, setStatusChange] = useState<{ id: string; status: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");

  const all = quotes.data ?? [];

  const filtered = useMemo(() => {
    let list = all.filter((q) =>
      `${q.number} ${q.notes ?? ""}`.toLowerCase().includes(query.toLowerCase()),
    );
    if (statusFilter !== "all") list = list.filter((q) => q.status === statusFilter);
    list = [...list].sort((a, b) => {
      if (sortKey === "total") return Number(b.total) - Number(a.total);
      if (sortKey === "number") return a.number.localeCompare(b.number);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return list;
  }, [all, query, statusFilter, sortKey]);

  const stats = useMemo(() => {
    const totalValue = all.reduce((s, q) => s + Number(q.total), 0);
    const accepted = all.filter((q) => q.status === "accepted");
    const acceptedValue = accepted.reduce((s, q) => s + Number(q.total), 0);
    const pending = all.filter((q) => q.status === "draft" || q.status === "sent");
    const pendingValue = pending.reduce((s, q) => s + Number(q.total), 0);
    const rejected = all.filter((q) => q.status === "rejected");
    const winRate = (accepted.length + rejected.length) > 0 ? Math.round((accepted.length / (accepted.length + rejected.length)) * 100) : 0;
    return { totalValue, accepted: accepted.length, acceptedValue, pending: pending.length, pendingValue, rejected: rejected.length, winRate };
  }, [all]);

  async function updateStatus() {
    if (!statusChange) return;
    setBusy(true);
    try {
      await api(`/quotes/${statusChange.id}`, { method: "PATCH", body: JSON.stringify({ status: statusChange.status }) });
      toast.success("Quote status updated");
      setStatusChange(null);
      quotes.reload();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }

  function isExpiring(q: CrmQuote): boolean {
    if (!q.validUntil || q.status !== "sent") return false;
    const days = Math.ceil((new Date(q.validUntil).getTime() - Date.now()) / 86400000);
    return days >= 0 && days <= 7;
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Quotes"
        description={all.length > 0 ? `${all.length} quote${all.length !== 1 ? "s" : ""} · ${formatCurrencyINR(stats.totalValue)} total value` : "Create and track sales quotes for deals"}
        actions={
          <Button size="sm" variant="secondary" onClick={() => quotes.reload()} aria-label="Refresh"><RefreshCw className="size-3.5" /></Button>
        }
      />

      {all.length > 0 && (
        <div className="grid gap-2 px-6 pb-3 sm:grid-cols-5">
          {([
            ["Total Quotes", String(all.length), formatCurrencyINR(stats.totalValue), "bg-accent"],
            ["Pending", String(stats.pending), formatCurrencyINR(stats.pendingValue), "bg-amber-500"],
            ["Accepted", String(stats.accepted), formatCurrencyINR(stats.acceptedValue), "bg-emerald-500"],
            ["Rejected", String(stats.rejected), `${stats.winRate}% win rate`, "bg-red-500"],
            ["Win Rate", `${stats.winRate}%`, `${stats.accepted} of ${stats.accepted + stats.rejected}`, "bg-indigo-500"],
          ] as const).map(([title, value, detail, dot]) => (
            <div key={title} className="rounded-xl border border-border bg-surface p-3">
              <div className="flex items-center gap-1.5">
                <span className={cn("size-1.5 rounded-full", dot)} />
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-lg font-bold tabular-nums">{value}</span>
                <span className="text-[11px] text-muted-foreground truncate">{detail}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 pb-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Search quotes..." className="w-60" />
        <div className="flex rounded-lg border border-border bg-surface-2 p-0.5 text-xs">
          {(["all", "draft", "sent", "accepted", "rejected", "expired"] as StatusFilter[]).map((s) => {
            const count = s === "all" ? all.length : all.filter((q) => q.status === s).length;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "rounded-md px-2.5 py-1 font-medium capitalize transition-colors",
                  statusFilter === s ? "bg-surface shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s === "all" ? "All" : s}{count > 0 && <span className="ml-1 text-muted-foreground">({count})</span>}
              </button>
            );
          })}
        </div>
        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <SelectTrigger className="h-8 w-36 text-xs"><ArrowUpDown className="size-3 mr-1" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="date">Newest first</SelectItem>
            <SelectItem value="total">Highest value</SelectItem>
            <SelectItem value="number">Quote number</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {filtered.length === 0 ? (
          <EmptyState
            icon={FileCheck2}
            title={query || statusFilter !== "all" ? "No quotes match your filters" : "No quotes yet"}
            description={query || statusFilter !== "all" ? "Try a different search or filter." : "Quotes are created from deals. Open a deal and create a quote to send to your customer."}
          />
        ) : (
          <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-surface-2">
                  <TableHead>Quote #</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Valid Until</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-28">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((q) => {
                  const subtotal = q.items.reduce((s, item) => s + Number(item.quantity) * Number(item.unitPrice) * (1 - Number(item.discountPct) / 100), 0);
                  const tax = Number(q.total) - subtotal;
                  const badge = STATUS_BADGE[q.status] ?? STATUS_BADGE.draft;
                  const expiring = isExpiring(q);
                  return (
                    <TableRow key={q.id} className="group">
                      <TableCell><span className="font-semibold font-mono text-sm">{q.number}</span></TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs">{q.items.length} item{q.items.length !== 1 ? "s" : ""}</span>
                          <span className="text-[10px] text-muted-foreground line-clamp-1">{q.items.map((i) => i.description).join(", ")}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{formatCurrencyINR(subtotal)}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs text-muted-foreground">{tax > 0 ? `+${formatCurrencyINR(tax)}` : "—"}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatCurrencyINR(Number(q.total))}</TableCell>
                      <TableCell>
                        <Badge variant={badge.variant} className="gap-1">
                          <badge.icon className="size-3" />
                          {q.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {q.validUntil ? (
                          <span className={cn("text-xs", expiring && "text-warning font-medium")}>
                            {q.validUntil}
                            {expiring && <span className="ml-1 text-[10px]">(expiring)</span>}
                          </span>
                        ) : <span className="text-xs text-muted-foreground/50">—</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatRelativeTime(q.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => setPreview(q)} title="Preview"><Eye className="size-3.5" /></Button>
                          {canWrite && q.status === "draft" && (
                            <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => setStatusChange({ id: q.id, status: "sent" })}>
                              <Send className="size-3 mr-1" /> Send
                            </Button>
                          )}
                          {canWrite && q.status === "sent" && (
                            <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => setStatusChange({ id: q.id, status: "accepted" })}>
                              <CheckCircle2 className="size-3 mr-1" /> Accept
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={preview !== null} onOpenChange={(v) => { if (!v) setPreview(null); }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Quote {preview?.number}
              {preview && <Badge variant={STATUS_BADGE[preview.status]?.variant ?? "neutral"} className="capitalize">{preview.status}</Badge>}
            </DialogTitle>
            <DialogDescription>
              {preview?.validUntil ? `Valid until ${preview.validUntil}` : "No expiration date set"}
              {preview && isExpiring(preview) && " — expiring soon!"}
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="space-y-4">
              {preview.notes && (
                <div className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted-foreground">{preview.notes}</div>
              )}
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-surface-2">
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Disc %</TableHead>
                      <TableHead className="text-right">Tax %</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="text-sm font-medium">{item.description}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{item.quantity}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{formatCurrencyINR(Number(item.unitPrice))}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{Number(item.discountPct) > 0 ? `${item.discountPct}%` : "—"}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{Number(item.taxPct) > 0 ? `${item.taxPct}%` : "—"}</TableCell>
                        <TableCell className="text-right text-sm font-semibold tabular-nums">{formatCurrencyINR(Number(item.lineTotal))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-3">
                <span className="text-sm text-muted-foreground">{preview.items.length} line item{preview.items.length !== 1 ? "s" : ""}</span>
                <div className="text-right">
                  <span className="text-sm text-muted-foreground mr-3">Grand Total</span>
                  <span className="text-xl font-bold tabular-nums">{formatCurrencyINR(Number(preview.total))}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            {canWrite && preview && preview.status !== "accepted" && preview.status !== "expired" && (
              <Select value="" onValueChange={(v) => { setStatusChange({ id: preview.id, status: v }); setPreview(null); }}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Change status..." /></SelectTrigger>
                <SelectContent>
                  {["draft", "sent", "accepted", "rejected", "expired"].filter((s) => s !== preview.status).map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button variant="outline" onClick={() => setPreview(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={statusChange !== null} onOpenChange={(v) => { if (!v) setStatusChange(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Update Quote Status</DialogTitle>
            <DialogDescription>This action will change the quote&apos;s workflow state.</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Change status to <strong className="capitalize text-foreground">{statusChange?.status}</strong>?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusChange(null)}>Cancel</Button>
            <Button onClick={updateStatus} disabled={busy}>{busy ? "Updating..." : "Confirm"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
