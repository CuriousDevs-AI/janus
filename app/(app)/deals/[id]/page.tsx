"use client";
import { ContactConversation } from "@/components/chat/contact-conversation";
import { CustomerCalls } from "@/components/calls/customer-call";
import { use, useState } from "react";
import { can } from "@/lib/permissions";
import Link from "next/link";
import { toast } from "sonner";
import { useApi } from "@/lib/api/use-api";
import type { Deal, DealEvent } from "@/lib/api/types";
import { useSession } from "@/components/auth/session-provider";
import { WhatsAppButton } from "@/components/inbox/whatsapp-button";
import { DealForm } from "@/components/deals/deal-form";
import { dealStageMeta } from "@/lib/status-meta";
import { formatCurrencyINR, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function DealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const session = useSession();
  const result = useApi<Deal>(`/deals/${encodeURIComponent(id)}`);
  const [cursors, setCursors] = useState<string[]>([]);
  const history = useApi<DealEvent[]>(
    result.data
      ? `/deals/${id}/events?limit=50${cursors.length ? `&before_id=${cursors.at(-1)}` : ""}`
      : null,
  );
  const deal = result.data;
  function refresh() {
    result.reload();
    history.reload();
  }
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-6">
      <div className="flex items-center justify-between">
        <Link href="/deals" className="text-xs text-muted-foreground">
          ← Deals
        </Link>
        <Button size="sm" variant="secondary" onClick={refresh}>
          Refresh
        </Button>
      </div>
      {result.error && (
        <p role="alert" className="text-sm text-danger">
          {result.error}
        </p>
      )}
      {!deal && !result.error && <p role="status">Loading deal…</p>}
      {deal && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold">{deal.name}</h1>
                <Badge variant={dealStageMeta[deal.stage].tone}>
                  {dealStageMeta[deal.stage].label}
                </Badge>
              </div>
              <Link
                href={`/customers/${deal.customerId}`}
                className="text-sm text-muted-foreground hover:text-accent"
              >
                {deal.customerName}
                {deal.company && ` · ${deal.company}`}
              </Link>
              <p className="mt-2 text-mono text-xl font-semibold">
                {formatCurrencyINR(Number(deal.amount), false)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" asChild>
                <Link href={`/leads/${deal.leadId}`}>Open lead</Link>
              </Button>
              {deal.phone && <WhatsAppButton contactId={deal.customerId} />}
            </div>
          </div>
          <ContactConversation contactId={deal.customerId} />
          <CustomerCalls contactId={deal.customerId} />
          <div className="grid gap-5 md:grid-cols-2">
            <section className="rounded-lg border border-border bg-surface p-4">
              <h2 className="mb-4 text-sm font-semibold">Deal details</h2>
              {can(session, "leads:write") ? (
                <DealForm
                  key={`${deal.id}-${deal.version}`}
                  deal={deal}
                  onSaved={() => {
                    refresh();
                    setCursors([]);
                    toast.success("Deal saved");
                  }}
                />
              ) : (
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt>Expected close</dt>
                    <dd>{deal.expectedCloseAt || "Not set"}</dd>
                  </div>
                  {deal.lostReason && (
                    <div>
                      <dt>Loss reason</dt>
                      <dd>{deal.lostReason}</dd>
                    </div>
                  )}
                </dl>
              )}
              <p className="mt-4 text-xs text-muted-foreground">
                Updated {formatDateTime(deal.updatedAt)}
              </p>
            </section>
            <section className="rounded-lg border border-border bg-surface p-4">
              <h2 className="mb-4 text-sm font-semibold">Deal history</h2>
              {history.error && (
                <p role="alert" className="text-sm text-danger">
                  {history.error}
                </p>
              )}
              {!history.data && !history.error && (
                <p role="status" className="text-sm">
                  Loading history…
                </p>
              )}
              <ol className="space-y-4">
                {history.data?.map((event) => (
                  <li key={event.id} className="border-l-2 border-border pl-3">
                    <p className="text-sm font-medium">
                      {event.action === "deal.created"
                        ? "Deal created"
                        : event.details.from_stage !== event.details.to_stage
                          ? `Moved from ${String(event.details.from_stage)} to ${String(event.details.to_stage)}`
                          : "Deal details updated"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDateTime(event.createdAt)} ·{" "}
                      {event.userId === session.user.id
                        ? session.user.name
                        : event.userId
                          ? `Member #${event.userId}`
                          : "System"}
                    </p>
                    {event.details.amount !== undefined && (
                      <p className="mt-1 text-xs">
                        Value:{" "}
                        {formatCurrencyINR(Number(event.details.amount), false)}
                      </p>
                    )}
                    {event.details.lost_reason && (
                      <p className="mt-1 whitespace-pre-wrap text-xs">
                        Reason: {String(event.details.lost_reason)}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
              {history.data?.length === 0 && (
                <p className="text-sm text-muted-foreground">No more events.</p>
              )}
              <div className="mt-4 flex justify-between">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!cursors.length}
                  onClick={() => setCursors(cursors.slice(0, -1))}
                >
                  Newer
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={history.data?.length !== 50}
                  onClick={() =>
                    setCursors([...cursors, history.data!.at(-1)!.id])
                  }
                >
                  Older
                </Button>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
