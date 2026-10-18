"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus, GripVertical, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useApi } from "@/lib/api/use-api";
import { api, message } from "@/lib/api/client";
import type { Deal } from "@/lib/api/types";
import type { DealStage } from "@/lib/types";
import { useSession } from "@/components/auth/session-provider";
import { dealStageOrder, dealStageMeta } from "@/lib/status-meta";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { DealForm } from "@/components/deals/deal-form";
import { formatCurrencyINR, formatRelativeTime, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export default function DealsPage() {
  const session = useSession();
  const writable = session.permissions.includes("leads:write");
  const [cursors, setCursors] = useState(["0"]);
  const result = useApi<Deal[]>(`/deals?after_id=${cursors.at(-1)}&limit=100`);
  const [query, setQuery] = useState("");
  const [dragOverStage, setDragOverStage] = useState<DealStage | null>(null);
  const [editing, setEditing] = useState<Deal | null>(null);
  const [busy, setBusy] = useState(false);
  const deals = result.data ?? [];
  const filtered = deals.filter((deal) =>
    `${deal.name} ${deal.customerName} ${deal.company}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const openValue = filtered
    .filter((deal) => !["won", "lost"].includes(deal.stage))
    .reduce((sum, deal) => sum + Number(deal.amount), 0);
  async function move(deal: Deal, stage: DealStage) {
    if (!writable || busy || deal.stage === stage) return;
    if (stage === "lost") {
      setEditing({ ...deal, stage });
      return;
    }
    setBusy(true);
    try {
      await api<Deal>(`/deals/${deal.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: deal.name,
          amount: deal.amount,
          stage,
          expectedCloseAt: deal.expectedCloseAt,
          lostReason: "",
          version: deal.version,
        }),
      });
      toast.success(`Moved to ${dealStageMeta[stage].label}`);
      result.reload();
    } catch (error) {
      toast.error(message(error));
      result.reload();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Deals"
        description={
          result.data
            ? `${filtered.length} ${filtered.length === 1 ? "deal" : "deals"} on this page · ${formatCurrencyINR(openValue)} open value`
            : "Your sales pipeline"
        }
        actions={
          <>
            <Button
              size="sm"
              variant="secondary"
              onClick={result.reload}
              aria-label="Refresh deals"
            >
              <RefreshCw className="size-3.5" />
            </Button>
            {writable && (
              <Button size="sm" asChild>
                <Link href="/leads">
                  <Plus className="size-3.5" />
                  Choose a lead
                </Link>
              </Button>
            )}
          </>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 pb-4">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search deals on this page…"
          className="w-72"
        />
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={cursors.length === 1}
            onClick={() => setCursors(cursors.slice(0, -1))}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {cursors.length}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={deals.length < 100}
            onClick={() => setCursors([...cursors, deals.at(-1)!.id])}
          >
            Next
          </Button>
        </div>
      </div>
      {result.error && (
        <p role="alert" className="px-6 py-4 text-sm text-danger">
          {result.error}
        </p>
      )}
      {!result.data && !result.error && (
        <p role="status" className="px-6 py-4 text-sm">
          Loading deals…
        </p>
      )}
      {result.data && (
        <>
          {deals.length === 0 && (
            <p className="px-6 pt-4 text-sm text-muted-foreground">
              No deals here yet. Open a saved lead and choose Create deal.
            </p>
          )}
          <div className="min-h-80 flex-1 overflow-auto px-6 py-4">
            <div
              className="flex h-full min-h-72 gap-3"
              style={{ minWidth: dealStageOrder.length * 268 }}
            >
              {dealStageOrder.map((stage) => {
                const items = filtered.filter((deal) => deal.stage === stage);
                return (
                  <section
                    key={stage}
                    aria-label={`${dealStageMeta[stage].label} deals`}
                    onDragOver={(event) => {
                      if (writable && !busy) {
                        event.preventDefault();
                        setDragOverStage(stage);
                      }
                    }}
                    onDragLeave={() => setDragOverStage(null)}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDragOverStage(null);
                      const deal = deals.find(
                        (item) =>
                          item.id === event.dataTransfer.getData("text/plain"),
                      );
                      if (deal) void move(deal, stage);
                    }}
                    className={cn(
                      "flex w-64 shrink-0 flex-col rounded-lg border bg-surface-2/40",
                      dragOverStage === stage
                        ? "border-accent-border bg-accent-muted/30"
                        : "border-border",
                    )}
                  >
                    <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
                      <h2 className="text-xs font-semibold">
                        {dealStageMeta[stage].label}
                      </h2>
                      <Badge variant="neutral">{items.length}</Badge>
                    </div>
                    <div className="px-3 py-1.5 text-[11px] text-muted-foreground">
                      {formatCurrencyINR(
                        items.reduce(
                          (sum, deal) => sum + Number(deal.amount),
                          0,
                        ),
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
                      {items.map((deal) => (
                        <article
                          key={deal.id}
                          draggable={writable && !busy}
                          onDragStart={(event) => {
                            event.dataTransfer.setData("text/plain", deal.id);
                            event.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => setDragOverStage(null)}
                          className="flex flex-col gap-2 rounded-md border border-border bg-surface p-2.5 shadow-sm hover:border-border-strong"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <Link
                              className="text-[13px] font-medium hover:text-accent"
                              href={`/deals/${deal.id}`}
                            >
                              {deal.name}
                            </Link>
                            {writable && (
                              <GripVertical
                                aria-hidden
                                className="size-3.5 shrink-0 text-muted-foreground"
                              />
                            )}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {deal.customerName}
                            {deal.company && ` · ${deal.company}`}
                          </p>
                          <p className="text-mono text-sm font-semibold">
                            {formatCurrencyINR(Number(deal.amount), false)}
                          </p>
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                            <span>
                              {deal.ownerId === session.user.id
                                ? session.user.name
                                : deal.ownerId
                                  ? `Member #${deal.ownerId}`
                                  : "Unassigned"}
                            </span>
                            <span>{formatRelativeTime(deal.updatedAt)}</span>
                          </div>
                          {writable && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => setEditing(deal)}
                              aria-label={`Edit ${deal.name}`}
                            >
                              Edit / move stage
                            </Button>
                          )}
                        </article>
                      ))}
                      {items.length === 0 && (
                        <p className="rounded-md border border-dashed border-border py-4 text-center text-xs text-muted-foreground">
                          No deals
                        </p>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </>
      )}
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit deal</DialogTitle>
            <DialogDescription>
              Save changes to this deal and its linked lead.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <DealForm
              key={`${editing.id}-${editing.version}-${editing.stage}`}
              deal={editing}
              onSaved={() => {
                setEditing(null);
                result.reload();
                toast.success("Deal saved");
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
