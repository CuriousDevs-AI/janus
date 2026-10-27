"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppStore } from "@/lib/stores/app-store";
import { users } from "@/lib/mock-data";
import type { Ticket } from "@/lib/types";

const selectClass = "h-8 rounded-md border border-input bg-surface px-2 text-xs";
const closed = (ticket: Ticket) => ticket.status === "resolved" || ticket.status === "closed";

/** Tickets still needing work, with the SLA state derived from minutes remaining. */
function slaState(ticket: Ticket) {
  if (closed(ticket) || ticket.slaMinutesRemaining === null) return "none" as const;
  if (ticket.slaMinutesRemaining <= 0) return "breached" as const;
  if (ticket.slaMinutesRemaining <= 60) return "due soon" as const;
  return "on track" as const;
}

const slaTone = (state: ReturnType<typeof slaState>) => state === "breached" ? "danger" : state === "due soon" ? "warning" : state === "on track" ? "success" : "neutral";

const comingSoon: Record<string, string> = {
  feedback: "Customer feedback after resolution comes in phase 2.",
  renewals: "Renewals and customer success reminders come in phase 2, once contracts have dates.",
  reports: "Support reports come once queues and SLA history have data.",
};

export function SupportWorkspace() {
  const searchParams = useSearchParams();
  const view = searchParams.get("view") ?? "overview";
  const titles: Record<string, string> = { overview: "Support overview", queues: "Queues & assignments", sla: "SLA management" };

  if (view in comingSoon) {
    return (
      <div className="mx-auto flex max-w-[1200px] flex-col">
        <PageHeader title="Coming soon" description="Customer Support & Success" />
        <div className="px-6 pb-10"><Card><CardContent className="p-6 text-sm text-muted-foreground">{comingSoon[view]}</CardContent></Card></div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col">
      <PageHeader title={titles[view] ?? "Support overview"} description="Tickets are worked in CRM & Sales. This workspace shows who holds them, and whether they are within their service time." />
      <div className="flex flex-col gap-4 px-6 pb-10">
        {view === "queues" ? <QueuesView /> : view === "sla" ? <SlaView /> : <OverviewView />}
      </div>
    </div>
  );
}

function useOpenTickets() {
  const tickets = useAppStore((state) => state.tickets);
  return React.useMemo(() => tickets.filter((t) => !closed(t)), [tickets]);
}

function OverviewView() {
  const open = useOpenTickets();
  const tickets = useAppStore((state) => state.tickets);
  const counts = {
    open: open.length,
    unassigned: open.filter((t) => !t.assigneeId).length,
    breached: open.filter((t) => slaState(t) === "breached").length,
    dueSoon: open.filter((t) => slaState(t) === "due soon").length,
    escalated: open.filter((t) => t.status === "escalated").length,
  };
  return (
    <>
      {tickets.length === 0 ? <Card><CardContent className="p-6 text-sm text-muted-foreground">No tickets yet. Tickets arrive from chats, email and lead sources.</CardContent></Card> : null}
      <div className="grid gap-3 sm:grid-cols-5">
        <Kpi label="Open tickets" value={String(counts.open)} />
        <Kpi label="Unassigned" value={String(counts.unassigned)} tone={counts.unassigned > 0 ? "warning" : undefined} />
        <Kpi label="SLA breached" value={String(counts.breached)} tone={counts.breached > 0 ? "warning" : undefined} />
        <Kpi label="Due within an hour" value={String(counts.dueSoon)} />
        <Kpi label="Escalated" value={String(counts.escalated)} />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Needs attention now</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {open.filter((t) => slaState(t) === "breached" || !t.assigneeId).slice(0, 8).map((t) => <p key={t.id}>{t.number} · {t.subject} · {t.assigneeId ? "assigned" : "unassigned"} · SLA {slaState(t)}</p>)}
          {open.filter((t) => slaState(t) === "breached" || !t.assigneeId).length === 0 ? <p className="text-muted-foreground">Nothing is breached or unassigned.</p> : null}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Open a ticket in <Link href="/tickets?workspace=customer-support" className="underline">Tickets</Link> to reply, escalate or resolve it.</p>
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

function QueuesView() {
  const open = useOpenTickets();
  const assign = useAppStore((state) => state.assignTicket);
  const customers = useAppStore((state) => state.customers);
  const groups: { key: string; label: string; tickets: Ticket[] }[] = [
    { key: "", label: "Unassigned", tickets: open.filter((t) => !t.assigneeId) },
    ...users.map((u) => ({ key: u.id, label: u.name, tickets: open.filter((t) => t.assigneeId === u.id) })),
  ].filter((g) => g.tickets.length > 0 || g.key === "");

  return (
    <>
      <p className="text-xs text-muted-foreground">Assign a ticket to the person who will work it. Reassigning keeps the history in the ticket. Each person sees their queue; the unassigned queue is for the lead to distribute.</p>
      {groups.map((group) => (
        <Card key={group.key || "unassigned"}>
          <CardHeader><CardTitle className="text-base">{group.label} <span className="text-sm font-normal text-muted-foreground">· {group.tickets.length}</span></CardTitle></CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {group.tickets.length === 0 ? <p className="text-muted-foreground">No tickets.</p> : null}
            {group.tickets.map((t) => {
              const customer = customers.find((c) => c.id === t.customerId);
              return (
                <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0">
                  <span><span className="font-medium">{t.number}</span> · {t.subject}<span className="block text-xs text-muted-foreground">{customer?.name ?? "Customer"} · {t.priority} · {t.status.replaceAll("_", " ")}</span></span>
                  <span className="flex items-center gap-2">
                    <Badge variant={slaTone(slaState(t)) as "neutral"}>{slaState(t)}</Badge>
                    <select aria-label={`Assign ${t.number}`} className={selectClass} value={t.assigneeId ?? ""} onChange={(e) => { if (!e.target.value) return; assign(t.id, e.target.value); toast.success(`${t.number} assigned`); }}>
                      <option value="">Assign to…</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </>
  );
}

function SlaView() {
  const open = useOpenTickets();
  const sorted = [...open].sort((a, b) => (a.slaMinutesRemaining ?? Number.MAX_SAFE_INTEGER) - (b.slaMinutesRemaining ?? Number.MAX_SAFE_INTEGER));
  return (
    <>
      <p className="text-xs text-muted-foreground">Breached means the service time has run out. Due soon means under an hour is left. Times come from the ticket record; they are not recalculated here.</p>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="px-4 py-2">Ticket</th><th className="px-4 py-2">Priority</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Time left</th><th className="px-4 py-2">SLA</th></tr></thead>
            <tbody>
              {sorted.length === 0 ? <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No open tickets.</td></tr> : null}
              {sorted.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">{t.number}<span className="block text-xs font-normal text-muted-foreground">{t.subject}</span></td>
                  <td className="px-4 py-3">{t.priority}</td>
                  <td className="px-4 py-3">{t.status.replaceAll("_", " ")}</td>
                  <td className="px-4 py-3 tabular-nums">{t.slaMinutesRemaining === null ? "—" : t.slaMinutesRemaining <= 0 ? "over" : `${t.slaMinutesRemaining} min`}</td>
                  <td className="px-4 py-3"><Badge variant={slaTone(slaState(t)) as "neutral"}>{slaState(t)}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}
