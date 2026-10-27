"use client";

import * as React from "react";
import { useSession } from "@/components/auth/session-provider";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useFinanceStore, dueAmount } from "@/lib/stores/finance-store";
import { useOperationsStore, stockOn } from "@/lib/stores/operations-store";
import { useITStore, renewalSoon } from "@/lib/stores/it-store";
import { useProjectsStore } from "@/lib/stores/projects-store";
import { useAppStore } from "@/lib/stores/app-store";
import { useRenewalsStore } from "@/lib/stores/renewals-store";

/**
 * Work inbox (Phase 4): everything across the workspaces that is waiting for someone to act on it. It reads the
 * records and links to the view where the action is taken; it stores nothing of its own.
 */

const TODAY = "2026-10-23";

/** `by` is who raised the item, when it is known: the person who raised it cannot act on it. */
interface InboxItem { id: string; module: string; text: string; href: string; urgent: boolean; by?: string }

const READ_KEY = "janus.work-inbox-read";

/** Items this viewer has marked read. Kept in this browser only, as a convenience. */
function readSet(): Set<string> {
  try { return new Set<string>(JSON.parse(window.localStorage.getItem(READ_KEY) ?? "[]")); } catch { return new Set<string>(); }
}
function saveReadSet(ids: Set<string>) {
  try { window.localStorage.setItem(READ_KEY, JSON.stringify([...ids])); } catch { /* private mode: read marks are simply not kept */ }
}

const at = (workspace: string, view: string) => `/workspace/${workspace}?view=${view}&workspace=${workspace}`;

export default function WorkInboxPage() {
  const fund = useFinanceStore((s) => s.fundRequests);
  const creditNotes = useFinanceStore((s) => s.creditNotes);
  const bills = useFinanceStore((s) => s.bills);
  const invoices = useFinanceStore((s) => s.invoices);
  const adjustments = useOperationsStore((s) => s.adjustments);
  const requisitions = useOperationsStore((s) => s.requisitions);
  const returns = useOperationsStore((s) => s.returns);
  const transfers = useOperationsStore((s) => s.transfers);
  const items = useOperationsStore((s) => s.items);
  const movements = useOperationsStore((s) => s.movements);
  const changes = useITStore((s) => s.changes);
  const incidents = useITStore((s) => s.incidents);
  const helpdesk = useITStore((s) => s.helpdesk);
  const licences = useITStore((s) => s.licences);
  const tickets = useAppStore((s) => s.tickets);
  const renewals = useRenewalsStore((s) => s.renewals);
  const milestones = useProjectsStore((s) => s.milestones);
  const changeRequests = useProjectsStore((s) => s.changes);

  const list: InboxItem[] = [];

  fund.filter((f) => f.status === "pending" || f.status === "awaiting_finance").forEach((f) => list.push({ id: `fund-${f.id}`, module: "Finance", text: `Fund request ${f.number}: ${f.purpose}`, href: at("finance-accounting", "approvals"), urgent: f.amount > 50000, by: f.requestedBy }));
  creditNotes.filter((c) => c.status === "pending").forEach((c) => list.push({ id: `cn-${c.id}`, module: "Finance", text: `Credit note ${c.number} waiting for approval`, href: at("finance-accounting", "approvals"), urgent: false, by: c.createdBy }));
  changeRequests.filter((c) => c.status === "pending").forEach((c) => list.push({ id: `chg-${c.id}`, module: "Projects", text: `Project change: ${c.description}`, href: at("projects-delivery", "changes"), urgent: false, by: c.requestedBy }));
  milestones.filter((m) => m.status === "done").forEach((m) => list.push({ id: `ms-${m.id}`, module: "Projects", text: `Milestone "${m.name}" waiting for acceptance`, href: at("projects-delivery", "milestones"), urgent: false }));
  bills.filter((b) => b.dueDate < TODAY && b.amount - b.payments.reduce((sum, p) => sum + p.amount, 0) > 0.001).forEach((b) => list.push({ id: `bill-${b.id}`, module: "Finance", text: `Bill ${b.number} from ${b.vendor} is overdue`, href: at("finance-accounting", "payables"), urgent: true }));
  invoices.filter((i) => !i.cancelled && i.dueDate < TODAY && dueAmount(i, creditNotes) > 0.001).forEach((i) => list.push({ id: `inv-${i.id}`, module: "Finance", text: `Invoice ${i.number} is overdue`, href: at("finance-accounting", "receivables"), urgent: true }));
  adjustments.filter((a) => a.status === "pending").forEach((a) => list.push({ id: `adj-${a.id}`, module: "Operations", text: `Stock adjustment waiting for approval`, href: at("operations-inventory", "inventory"), urgent: false, by: a.by }));
  requisitions.filter((r) => r.status === "pending").forEach((r) => list.push({ id: `req-${r.id}`, module: "Operations", text: `Requisition ${r.number} waiting for approval`, href: at("operations-inventory", "procurement"), urgent: false, by: r.requester }));
  requisitions.filter((r) => r.status === "approved").forEach((r) => list.push({ id: `reqo-${r.id}`, module: "Operations", text: `Requisition ${r.number} approved, not yet ordered`, href: at("operations-inventory", "procurement"), urgent: false }));
  returns.filter((r) => r.status === "authorised").forEach((r) => list.push({ id: `rma-${r.id}`, module: "Operations", text: `${r.number} waiting for inspection`, href: at("operations-inventory", "orders"), urgent: false }));
  transfers.filter((t) => t.status === "in transit").forEach((t) => list.push({ id: `trf-${t.id}`, module: "Operations", text: `${t.number} in transit, not yet received`, href: at("operations-inventory", "transfers"), urgent: false }));
  items.filter((i) => !i.trackBatch && stockOn(movements, i.id) <= i.reorderLevel).forEach((i) => list.push({ id: `low-${i.id}`, module: "Operations", text: `${i.name} is at or below its reorder level`, href: at("operations-inventory", "inventory"), urgent: false }));
  changes.filter((c) => c.status === "pending").forEach((c) => list.push({ id: `itchg-${c.id}`, module: "IT", text: `${c.number}: ${c.title} waiting for approval`, href: at("it-infrastructure", "changes"), urgent: false, by: c.requestedBy }));
  incidents.filter((i) => i.status !== "resolved").forEach((i) => list.push({ id: `inc-${i.id}`, module: "IT", text: `${i.number}: ${i.title}`, href: at("it-infrastructure", "incidents"), urgent: i.severity === "critical" }));
  helpdesk.filter((h) => h.status !== "resolved" && h.dueOn < TODAY).forEach((h) => list.push({ id: `hd-${h.id}`, module: "IT", text: `${h.number} is overdue`, href: at("it-infrastructure", "helpdesk"), urgent: true }));
  licences.filter(renewalSoon).forEach((l) => list.push({ id: `lic-${l.id}`, module: "IT", text: `${l.name} renews on ${l.renewal}`, href: at("it-infrastructure", "licenses"), urgent: false }));
  tickets.filter((t) => t.status === "escalated").forEach((t) => list.push({ id: `esc-${t.id}`, module: "Support", text: `${t.number} is escalated: ${t.subject}`, href: at("customer-support", "queues"), urgent: true }));
  renewals.filter((r) => { const days = Math.round((Date.parse(r.contractEnd) - Date.parse(TODAY)) / 86400000); return days <= 60; }).forEach((r) => list.push({ id: `ren-${r.id}`, module: "Support", text: `${r.customerName}'s contract ends ${r.contractEnd}`, href: at("customer-support", "renewals"), urgent: false }));

  const session = useSession();
  const me = session.user.name ?? session.user.email ?? "You";
  const [read, setRead] = React.useState<Set<string>>(() => (typeof window === "undefined" ? new Set<string>() : readSet()));
  const [showRead, setShowRead] = React.useState(false);
  const [showMine, setShowMine] = React.useState(false);

  function markRead(id: string) {
    const next = new Set(read);
    next.add(id);
    saveReadSet(next);
    setRead(next);
  }

  const visible = list
    .filter((i) => showMine || i.by !== me)
    .filter((i) => showRead || !read.has(i.id));
  const hidden = list.length - visible.length;
  const urgent = visible.filter((i) => i.urgent);
  const rest = visible.filter((i) => !i.urgent);
  const modules = [...new Set(visible.map((i) => i.module))];

  return (
    <div className="mx-auto flex max-w-[1000px] flex-col">
      <PageHeader title="Work inbox" description={`${visible.length} thing${visible.length === 1 ? "" : "s"} to act on${hidden > 0 ? `; ${hidden} hidden` : ""}, across every workspace.`} />
      <div className="flex flex-col gap-4 px-6 pb-10">
        <div className="flex flex-wrap gap-2 text-xs">
          <Button size="sm" variant={showMine ? "secondary" : "outline"} onClick={() => setShowMine((v) => !v)}>{showMine ? "Showing items I raised" : "Hiding items I raised"}</Button>
          <Button size="sm" variant={showRead ? "secondary" : "outline"} onClick={() => setShowRead((v) => !v)}>{showRead ? "Showing read items" : "Hiding read items"}</Button>
        </div>
        {visible.length === 0 ? <Card><CardContent className="p-6 text-sm text-muted-foreground">Nothing to act on right now. Items you raised are hidden unless you show them, because you cannot approve your own.</CardContent></Card> : null}
        {urgent.length > 0 ? <InboxCard title="Urgent" items={urgent} read={read} onRead={markRead} /> : null}
        {modules.map((m) => <InboxCard key={m} title={m} items={rest.filter((i) => i.module === m)} read={read} onRead={markRead} />)}
      </div>
    </div>
  );
}

function InboxCard({ title, items, read, onRead }: { title: string; items: InboxItem[]; read: Set<string>; onRead: (id: string) => void }) {
  if (items.length === 0) return null;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title} · {items.length}</CardTitle></CardHeader>
      <CardContent className="grid gap-2 text-sm">
        {items.map((i) => (
          <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0">
            <span className={`flex items-center gap-2 ${read.has(i.id) ? "text-muted-foreground" : ""}`}>{i.urgent ? <Badge variant="danger">urgent</Badge> : null}{i.text}{read.has(i.id) ? <span className="text-xs">· read</span> : null}</span>
            <span className="flex items-center gap-3">
              {!read.has(i.id) ? <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => onRead(i.id)}>Mark read</button> : null}
              <Link href={i.href} className="text-xs text-accent hover:underline">Open</Link>
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
