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
import { usePersonalTasksStore, type PersonalTask } from "@/lib/stores/personal-tasks-store";
import { todayIso } from "@/lib/today";
import { CheckCircle, Circle, Plus, Trash2 } from "lucide-react";

/**
 * Work inbox: personal tasks at the top, then everything across the workspaces that
 * is waiting for someone to act on it.
 */

/** `by` is who raised the item, when it is known: the person who raised it cannot act on it. */
interface InboxItem { id: string; module: string; text: string; href: string; urgent: boolean; by?: string }

const READ_KEY = "janus.work-inbox-read";

function readSet(): Set<string> {
  try { return new Set<string>(JSON.parse(window.localStorage.getItem(READ_KEY) ?? "[]")); } catch { return new Set<string>(); }
}
function saveReadSet(ids: Set<string>) {
  try { window.localStorage.setItem(READ_KEY, JSON.stringify([...ids])); } catch { /* private mode */ }
}

const at = (workspace: string, view: string) => `/workspace/${workspace}?view=${view}&workspace=${workspace}`;

export default function WorkInboxPage() {
  const today = todayIso();
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
  bills.filter((b) => b.dueDate < today && b.amount - b.payments.reduce((sum, p) => sum + p.amount, 0) > 0.001).forEach((b) => list.push({ id: `bill-${b.id}`, module: "Finance", text: `Bill ${b.number} from ${b.vendor} is overdue`, href: at("finance-accounting", "payables"), urgent: true }));
  invoices.filter((i) => !i.cancelled && i.dueDate < today && dueAmount(i, creditNotes) > 0.001).forEach((i) => list.push({ id: `inv-${i.id}`, module: "Finance", text: `Invoice ${i.number} is overdue`, href: at("finance-accounting", "receivables"), urgent: true }));
  adjustments.filter((a) => a.status === "pending").forEach((a) => list.push({ id: `adj-${a.id}`, module: "Operations", text: `Stock adjustment waiting for approval`, href: at("operations-inventory", "inventory"), urgent: false, by: a.by }));
  requisitions.filter((r) => r.status === "pending").forEach((r) => list.push({ id: `req-${r.id}`, module: "Operations", text: `Requisition ${r.number} waiting for approval`, href: at("operations-inventory", "procurement"), urgent: false, by: r.requester }));
  requisitions.filter((r) => r.status === "approved").forEach((r) => list.push({ id: `reqo-${r.id}`, module: "Operations", text: `Requisition ${r.number} approved, not yet ordered`, href: at("operations-inventory", "procurement"), urgent: false }));
  returns.filter((r) => r.status === "authorised").forEach((r) => list.push({ id: `rma-${r.id}`, module: "Operations", text: `${r.number} waiting for inspection`, href: at("operations-inventory", "orders"), urgent: false }));
  transfers.filter((t) => t.status === "in transit").forEach((t) => list.push({ id: `trf-${t.id}`, module: "Operations", text: `${t.number} in transit, not yet received`, href: at("operations-inventory", "transfers"), urgent: false }));
  items.filter((i) => !i.trackBatch && stockOn(movements, i.id) <= i.reorderLevel).forEach((i) => list.push({ id: `low-${i.id}`, module: "Operations", text: `${i.name} is at or below its reorder level`, href: at("operations-inventory", "inventory"), urgent: false }));
  changes.filter((c) => c.status === "pending").forEach((c) => list.push({ id: `itchg-${c.id}`, module: "IT", text: `${c.number}: ${c.title} waiting for approval`, href: at("it-infrastructure", "changes"), urgent: false, by: c.requestedBy }));
  incidents.filter((i) => i.status !== "resolved").forEach((i) => list.push({ id: `inc-${i.id}`, module: "IT", text: `${i.number}: ${i.title}`, href: at("it-infrastructure", "incidents"), urgent: i.severity === "critical" }));
  helpdesk.filter((h) => h.status !== "resolved" && h.dueOn < today).forEach((h) => list.push({ id: `hd-${h.id}`, module: "IT", text: `${h.number} is overdue`, href: at("it-infrastructure", "helpdesk"), urgent: true }));
  licences.filter(renewalSoon).forEach((l) => list.push({ id: `lic-${l.id}`, module: "IT", text: `${l.name} renews on ${l.renewal}`, href: at("it-infrastructure", "licenses"), urgent: false }));
  tickets.filter((t) => t.status === "escalated").forEach((t) => list.push({ id: `esc-${t.id}`, module: "Support", text: `${t.number} is escalated: ${t.subject}`, href: at("customer-support", "queues"), urgent: true }));
  renewals.filter((r) => { const days = Math.round((Date.parse(r.contractEnd) - Date.parse(today)) / 86400000); return days <= 60; }).forEach((r) => list.push({ id: `ren-${r.id}`, module: "Support", text: `${r.customerName}'s contract ends ${r.contractEnd}`, href: at("customer-support", "renewals"), urgent: false }));

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
  const urgent = visible.filter((i) => i.urgent);
  const rest = visible.filter((i) => !i.urgent);
  const modules = [...new Set(visible.map((i) => i.module))];

  return (
    <div className="mx-auto flex max-w-[1000px] flex-col">
      <PageHeader title="Work Inbox" description="Your tasks and action items from every workspace." />
      <div className="flex flex-col gap-6 px-6 pb-10">
        <MyTasksSection today={today} />

        {/* Workspace action items */}
        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-muted-foreground">Action items across workspaces</h2>
          <div className="flex flex-wrap gap-2 text-xs">
            <Button size="sm" variant={showMine ? "secondary" : "outline"} onClick={() => setShowMine((v) => !v)}>{showMine ? "Showing items I raised" : "Hiding items I raised"}</Button>
            <Button size="sm" variant={showRead ? "secondary" : "outline"} onClick={() => setShowRead((v) => !v)}>{showRead ? "Showing read items" : "Hiding read items"}</Button>
          </div>
          {visible.length === 0 ? <Card><CardContent className="p-6 text-sm text-muted-foreground">Nothing to act on right now. Items you raised are hidden unless you show them, because you cannot approve your own.</CardContent></Card> : null}
          {urgent.length > 0 ? <InboxCard title="Urgent" items={urgent} read={read} onRead={markRead} /> : null}
          {modules.map((m) => <InboxCard key={m} title={m} items={rest.filter((i) => i.module === m)} read={read} onRead={markRead} />)}
        </div>
      </div>
    </div>
  );
}

/* ---------- My tasks section ---------- */

function MyTasksSection({ today }: { today: string }) {
  const tasks = usePersonalTasksStore((s) => s.tasks);
  const addTask = usePersonalTasksStore((s) => s.addTask);
  const toggleTask = usePersonalTasksStore((s) => s.toggleTask);
  const deleteTask = usePersonalTasksStore((s) => s.deleteTask);

  const [title, setTitle] = React.useState("");
  const [dueDate, setDueDate] = React.useState(today);
  const [error, setError] = React.useState<string | null>(null);
  const [showCompleted, setShowCompleted] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const err = addTask(title, dueDate);
    if (err) { setError(err); return; }
    setTitle("");
    setDueDate(today);
    setError(null);
    inputRef.current?.focus();
  }

  const pending = tasks.filter((t) => !t.completed);
  const completed = tasks.filter((t) => t.completed);

  // Group pending: due today (or overdue), then upcoming
  const dueToday = pending.filter((t) => t.dueDate <= today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const upcoming = pending.filter((t) => t.dueDate > today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">My tasks</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Add task form */}
        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2">
          <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1">
            <label htmlFor="task-title" className="text-xs text-muted-foreground">Task</label>
            <input
              ref={inputRef}
              id="task-title"
              type="text"
              placeholder="What needs to be done?"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setError(null); }}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="task-due" className="text-xs text-muted-foreground">Due date</label>
            <input
              id="task-due"
              type="date"
              value={dueDate}
              onChange={(e) => { setDueDate(e.target.value); setError(null); }}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <Button type="submit" size="sm" className="h-9">
            <Plus className="size-3.5" />
            Add
          </Button>
        </form>
        {error && <p className="text-xs text-danger">{error}</p>}

        {/* Due today / overdue */}
        {dueToday.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold text-muted-foreground">Due today</p>
            {dueToday.map((task) => (
              <TaskRow key={task.id} task={task} today={today} onToggle={toggleTask} onDelete={deleteTask} />
            ))}
          </div>
        )}

        {/* Upcoming */}
        {upcoming.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold text-muted-foreground">Upcoming</p>
            {upcoming.map((task) => (
              <TaskRow key={task.id} task={task} today={today} onToggle={toggleTask} onDelete={deleteTask} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {pending.length === 0 && completed.length === 0 && (
          <p className="text-sm text-muted-foreground">No tasks yet. Add one above to get started.</p>
        )}

        {/* Completed */}
        {completed.length > 0 && (
          <div className="flex flex-col gap-1">
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:underline"
              onClick={() => setShowCompleted((v) => !v)}
            >
              {showCompleted ? "Hide" : "Show"} {completed.length} completed task{completed.length === 1 ? "" : "s"}
            </button>
            {showCompleted && completed.map((task) => (
              <TaskRow key={task.id} task={task} today={today} onToggle={toggleTask} onDelete={deleteTask} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TaskRow({ task, today, onToggle, onDelete }: {
  task: PersonalTask;
  today: string;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const overdue = !task.completed && task.dueDate < today;
  return (
    <div className="flex items-center gap-2 rounded-md px-1 py-1.5 hover:bg-surface-2">
      <button
        type="button"
        onClick={() => onToggle(task.id)}
        className="shrink-0 text-muted-foreground hover:text-accent"
        aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
      >
        {task.completed
          ? <CheckCircle className="size-4 text-success" />
          : <Circle className="size-4" />}
      </button>
      <span className={`min-w-0 flex-1 text-sm ${task.completed ? "text-muted-foreground line-through" : "text-foreground"}`}>
        {task.title}
      </span>
      <span className={`shrink-0 text-xs ${overdue ? "text-danger font-medium" : "text-muted-foreground"}`}>
        {formatDueDate(task.dueDate, today)}
      </span>
      <button
        type="button"
        onClick={() => onDelete(task.id)}
        className="shrink-0 text-muted-foreground hover:text-danger"
        aria-label="Delete task"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

function formatDueDate(date: string, today: string): string {
  if (date === today) return "Today";
  const diff = Math.round((Date.parse(date) - Date.parse(today)) / 86400000);
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff < 0) return `${Math.abs(diff)} days overdue`;
  if (diff <= 7) return `In ${diff} days`;
  return new Date(date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/* ---------- Inbox cards (unchanged) ---------- */

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
