"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/components/auth/session-provider";
import { useAppStore } from "@/lib/stores/app-store";
import { useRenewalsStore } from "@/lib/stores/renewals-store";
import { useFeedbackStore } from "@/lib/stores/feedback-store";
import { useFinanceStore, dueAmount } from "@/lib/stores/finance-store";
import { customerHealth } from "@/lib/customer-health";
import { useCrmLinkOptions } from "@/lib/record-links";
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
};

export function SupportWorkspace() {
  const searchParams = useSearchParams();
  const view = searchParams.get("view") ?? "overview";
  const titles: Record<string, string> = { overview: "Support overview", queues: "Queues & assignments", sla: "SLA management", renewals: "Renewals & contracts", feedback: "Customer feedback", reports: "Support reports" };

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
        {view === "queues" ? <QueuesView /> : view === "sla" ? <SlaView /> : view === "renewals" ? <RenewalsView /> : view === "feedback" ? <FeedbackView /> : view === "reports" ? <SupportReportsView /> : <OverviewView />}
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
      <HealthCard />
      <AssignmentsTrail />
    </>
  );
}

/** Customer health for every customer on the renewals list: open tickets, escalations, SLA breaches, overdue invoices and renewal timing. */
function HealthCard() {
  const open = useOpenTickets();
  const renewals = useRenewalsStore((state) => state.renewals);
  const invoices = useFinanceStore((state) => state.invoices);
  const creditNotes = useFinanceStore((state) => state.creditNotes);
  const rows = renewals.map((r) => {
    const mine = open.filter((t) => t.customerId === r.customerId);
    const overdueInvoices = invoices.filter((i) => !i.cancelled && i.customer === r.customerName && i.dueDate < TODAY && dueAmount(i, creditNotes) > 0.001).length;
    const health = customerHealth({
      openTickets: mine.length,
      escalatedTickets: mine.filter((t) => t.status === "escalated").length,
      breachedTickets: mine.filter((t) => slaState(t) === "breached").length,
      overdueInvoices,
      renewalDays: daysBetween(TODAY, r.contractEnd),
    });
    return { renewal: r, health };
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Customer health</CardTitle></CardHeader>
      <CardContent className="grid gap-2 text-sm">
        {rows.length === 0 ? <p className="text-muted-foreground">No customers on the renewals list yet, so there is no health to show.</p> : null}
        {rows.map(({ renewal, health }) => (
          <div key={renewal.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0">
            <span>
              <span className="font-medium">{renewal.customerName}</span>
              <span className="block text-xs text-muted-foreground">{health.reasons.length > 0 ? health.reasons.join(" · ") : "No issues on record"}</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="tabular-nums">{health.score}/100</span>
              <Badge variant={health.band === "healthy" ? "success" : health.band === "watch" ? "warning" : "danger"}>{health.band}</Badge>
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Recent ticket assignments with the person who made each one. */
function AssignmentsTrail() {
  const activities = useAppStore((state) => state.activities);
  const rows = activities.filter((a) => a.relatedKind === "ticket" && a.title.endsWith("assigned")).slice(0, 12);
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Assignment trail</CardTitle></CardHeader>
      <CardContent className="grid gap-2 text-sm">
        {rows.length === 0 ? <p className="text-muted-foreground">No assignments yet. Changes to who holds a ticket appear here.</p> : null}
        {rows.map((a) => (
          <p key={a.id}>
            <span className="text-muted-foreground">{a.createdAt.slice(0, 10)} · {a.actor.type === "human" ? a.actor.userName : a.actor.type === "ai" ? a.actor.agentName : "System"} · </span>
            {a.title}
          </p>
        ))}
      </CardContent>
    </Card>
  );
}

const TODAY = "2026-10-23";

/** Ratings the customer gave on resolved tickets, recorded by staff with the customer's words. */
function FeedbackView() {
  const session = useSession();
  const me = session.user.name ?? session.user.email ?? "You";
  const tickets = useAppStore((state) => state.tickets);
  const feedback = useFeedbackStore((state) => state.feedback);
  const recordFeedback = useFeedbackStore((state) => state.recordFeedback);
  const done = new Set(feedback.map((f) => f.ticketId));
  const resolved = tickets.filter((t) => (t.status === "resolved" || t.status === "closed") && !done.has(t.id));
  const [ticketId, setTicketId] = React.useState("");
  const [rating, setRating] = React.useState("5");
  const [comment, setComment] = React.useState("");

  function save() {
    const ticket = tickets.find((t) => t.id === ticketId);
    if (!ticket) return toast.error("Choose a resolved ticket.");
    const problem = recordFeedback({ ticketId, ticketNumber: ticket.number, rating: Number(rating) as 1 | 2 | 3 | 4 | 5, comment, recordedBy: me, date: TODAY });
    if (problem) return toast.error(problem);
    toast.success("Feedback recorded");
    setTicketId(""); setComment("");
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Record feedback</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-xs text-muted-foreground">Once a ticket is resolved, record the rating the customer gave and their words. One rating per ticket.</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <select aria-label="Resolved ticket" className={selectClass} value={ticketId} onChange={(e) => setTicketId(e.target.value)}><option value="">Resolved ticket…</option>{resolved.map((t) => <option key={t.id} value={t.id}>{t.number} · {t.subject}</option>)}</select>
            <select aria-label="Rating" className={selectClass} value={rating} onChange={(e) => setRating(e.target.value)}>{[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r} / 5</option>)}</select>
            <Input aria-label="Customer's words" placeholder="What the customer said" value={comment} onChange={(e) => setComment(e.target.value)} />
            <Button disabled={!ticketId} onClick={save}>Record feedback</Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="grid gap-2 p-4 text-sm">
          {feedback.length === 0 ? <p className="text-muted-foreground">No feedback recorded yet.</p> : null}
          {feedback.map((f) => <p key={f.id}><span className="font-medium">{f.ticketNumber}</span> · {f.rating}/5 · {f.comment || "no comment"} <span className="text-xs text-muted-foreground">· recorded by {f.recordedBy} on {f.date}</span></p>)}
        </CardContent>
      </Card>
    </>
  );
}

/** Support in numbers: what is open, how service times are holding, and what customers rated. */
function SupportReportsView() {
  const tickets = useAppStore((state) => state.tickets);
  const feedback = useFeedbackStore((state) => state.feedback);
  const open = tickets.filter((t) => !closed(t));
  const breached = open.filter((t) => slaState(t) === "breached").length;
  const escalated = open.filter((t) => t.status === "escalated").length;
  const resolved = tickets.filter((t) => closed(t)).length;
  const average = feedback.length > 0 ? Math.round((feedback.reduce((sum, f) => sum + f.rating, 0) / feedback.length) * 10) / 10 : null;
  const rows: [string, string][] = [
    ["Open tickets", String(open.length)],
    ["Resolved tickets", String(resolved)],
    ["Breached service time (open)", String(breached)],
    ["Escalated (open)", String(escalated)],
    ["Customer ratings recorded", String(feedback.length)],
    ["Average rating", average === null ? "No ratings yet" : `${average} / 5`],
  ];
  return (
    <Card>
      <CardContent className="grid gap-2 p-4 text-sm">
        {rows.map(([label, value]) => <div key={label} className="flex justify-between border-b border-border pb-2 last:border-0"><span>{label}</span><span className="font-medium tabular-nums">{value}</span></div>)}
        <p className="text-xs text-muted-foreground">Figures come from the tickets in this workspace and the feedback recorded here.</p>
      </CardContent>
    </Card>
  );
}

const RENEWAL_WINDOW_DAYS = 60;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000);

/** Renewals by contract end date: which are due within 60 days, which have lapsed, and the customer's open ticket health. */
function RenewalsView() {
  const renewals = useRenewalsStore((state) => state.renewals);
  const addRenewal = useRenewalsStore((state) => state.addRenewal);
  const setContractEnd = useRenewalsStore((state) => state.setContractEnd);
  const tickets = useAppStore((state) => state.tickets);
  const links = useCrmLinkOptions();
  const [customerId, setCustomerId] = React.useState("");
  const [contractEnd, setContractEndDraft] = React.useState("2027-03-31");
  const [value, setValue] = React.useState("");
  const [owner, setOwner] = React.useState("");
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});

  function save() {
    const customer = links.customers.find((c) => c.id === customerId);
    const problem = addRenewal({ customerId, customerName: customer?.label ?? "Customer", contractEnd, value: Number(value), owner });
    if (problem) return toast.error(problem);
    toast.success("Renewal added");
    setCustomerId(""); setValue(""); setOwner("");
  }

  function update(id: string) {
    const problem = setContractEnd(id, drafts[id] ?? "");
    if (problem) return toast.error(problem);
    toast.success("Contract end date updated");
    setDrafts((current) => ({ ...current, [id]: "" }));
  }

  const rows = [...renewals].sort((a, b) => a.contractEnd.localeCompare(b.contractEnd));

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Add a renewal</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-xs text-muted-foreground">One contract per customer. A renewal is due for reminder within 60 days of its end date. Health comes from the customer&apos;s open tickets and their service times.</p>
          <div className="grid gap-3 sm:grid-cols-5">
            <select aria-label="Customer" className={selectClass} value={customerId} onChange={(e) => setCustomerId(e.target.value)}><option value="">Customer…</option>{links.customers.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
            <Input aria-label="Contract end" type="date" value={contractEnd} onChange={(e) => setContractEndDraft(e.target.value)} />
            <Input aria-label="Contract value" type="number" min={0} placeholder="Value ₹" value={value} onChange={(e) => setValue(e.target.value)} />
            <select aria-label="Renewal owner" className={selectClass} value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">Owner…</option>{users.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}</select>
            <Button disabled={!customerId || !owner || value === ""} onClick={save}>Add renewal</Button>
          </div>
        </CardContent>
      </Card>
      {rows.length === 0 ? <Card><CardContent className="p-6 text-sm text-muted-foreground">No renewals yet.</CardContent></Card> : null}
      {rows.map((r) => {
        const days = daysBetween(TODAY, r.contractEnd);
        const status = days < 0 ? "lapsed" : days <= RENEWAL_WINDOW_DAYS ? "renewal due" : "on track";
        const open = tickets.filter((t) => t.customerId === r.customerId && !closed(t));
        const atRisk = open.some((t) => slaState(t) === "breached" || t.status === "escalated");
        const health = atRisk ? "at risk" : open.length > 0 ? "watch" : "healthy";
        return (
          <Card key={r.id}>
            <CardContent className="grid gap-2 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{r.customerName} <span className="font-normal text-muted-foreground">· {r.owner} · ₹{r.value.toLocaleString("en-IN")}</span></span>
                <span className="flex gap-2">
                  <Badge variant={status === "lapsed" ? "danger" : status === "renewal due" ? "warning" : "neutral"}>{status}</Badge>
                  <Badge variant={health === "at risk" ? "danger" : health === "watch" ? "warning" : "success"}>{health}</Badge>
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Contract ends {r.contractEnd} ({days < 0 ? `${Math.abs(days)} days ago` : `in ${days} days`}) · {open.length} open ticket{open.length === 1 ? "" : "s"}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Input aria-label={`New end date for ${r.customerName}`} type="date" className="h-8 w-40" value={drafts[r.id] ?? ""} onChange={(e) => setDrafts((current) => ({ ...current, [r.id]: e.target.value }))} />
                <Button size="sm" variant="secondary" disabled={!drafts[r.id]} onClick={() => update(r.id)}>Set new end date</Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
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
  const session = useSession();
  const me = session.user.name ?? session.user.email ?? "You";
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
                    <select aria-label={`Assign ${t.number}`} className={selectClass} value={t.assigneeId ?? ""} onChange={(e) => { if (!e.target.value) return; assign(t.id, e.target.value, me); toast.success(`${t.number} assigned`); }}>
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
