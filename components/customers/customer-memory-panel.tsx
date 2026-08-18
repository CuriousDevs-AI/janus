"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check, Pencil, Trash2 } from "lucide-react";
import { getMemoryForCustomer, getConversationsForCustomer } from "@/lib/mock-data";
import { AIConfidence } from "@/components/shared/ai-indicator";
import { ChannelBadge } from "@/components/shared/channel-badge";
import { formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { MemoryItem } from "@/lib/types";

export function CustomerMemoryPanel({ customerId }: { customerId: string }) {
  const [items, setItems] = React.useState<MemoryItem[]>(() => getMemoryForCustomer(customerId));
  const conversations = getConversationsForCustomer(customerId).slice(0, 5);

  const facts = items.filter((m) => m.kind === "stable_fact");
  const insights = items.filter((m) => m.kind === "derived_insight");
  const support = items.filter((m) => m.kind === "support");

  function approve(id: string) {
    setItems((list) => list.map((m) => (m.id === id ? { ...m, status: "approved" } : m)));
    toast.success("Insight approved");
  }
  function remove(id: string) {
    setItems((list) => list.filter((m) => m.id !== id));
    toast.success("Memory deleted");
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Stable facts</p>
        <div className="flex flex-col gap-2">
          {facts.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface-2 px-3 py-2">
              <div>
                <p className="text-[11px] text-muted-foreground">{f.label}</p>
                <p className="text-[13px] text-foreground">{f.value}</p>
              </div>
              <button onClick={() => remove(f.id)} className="text-muted-foreground hover:text-danger" aria-label="Delete">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
          {facts.length === 0 && <p className="text-[12px] text-muted-foreground">No stable facts recorded.</p>}
        </div>

        {support.length > 0 && (
          <>
            <p className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Support memory</p>
            <div className="flex flex-col gap-2">
              {support.map((s) => (
                <div key={s.id} className="rounded-md border border-border bg-surface-2 px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">{s.label} · {s.source}</p>
                  <p className="text-[13px] text-foreground">{s.value}</p>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recent context — last {conversations.length} conversations</p>
        <div className="flex flex-col gap-1.5">
          {conversations.map((c) => (
            <div key={c.id} className="flex items-center justify-between text-[12px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <ChannelBadge channel={c.channel} iconOnly />
                {c.subject}
              </span>
              <span>{formatRelativeTime(c.lastMessageAt)}</span>
            </div>
          ))}
          {conversations.length === 0 && <p className="text-[12px] text-muted-foreground">No conversations yet.</p>}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Derived insights</p>
        <div className="flex flex-col gap-2">
          {insights.map((m) => (
            <div key={m.id} className="rounded-md border border-border bg-surface-2 px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[13px] text-foreground">{m.value}</p>
                <Badge variant={m.status === "approved" ? "success" : m.status === "rejected" ? "danger" : "warning"} className="shrink-0">
                  {m.status}
                </Badge>
              </div>
              <div className="mt-1.5 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  {m.confidence !== undefined && <AIConfidence value={m.confidence} />}
                  <span>{m.source}</span>
                </div>
                <div className="flex items-center gap-1">
                  {m.status === "pending" && (
                    <Button size="sm" variant="secondary" onClick={() => approve(m.id)}>
                      <Check className="size-3" /> Approve
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => toast("Edit isn't wired up in this demo")}>
                    <Pencil className="size-3" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(m.id)}>
                    <Trash2 className="size-3 text-danger" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {insights.length === 0 && <p className="text-[12px] text-muted-foreground">No derived insights yet.</p>}
        </div>
      </div>
    </div>
  );
}
