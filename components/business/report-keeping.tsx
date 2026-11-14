"use client";

import * as React from "react";
import { BarChart3, CalendarClock, Loader2, Pause, Play, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionCard } from "@/components/settings/section-ui";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { periodWords, type ReportPeriod } from "@/components/business/report-figures";
import type { ReportDefinition } from "@/lib/report-catalogue";

/** A library report kept under a name the business chose, with the period it opens on. */
export type SavedReport = { id: string; name: string; report: string; period: ReportPeriod; note: string; createdByName: string; createdAt: string; mine: boolean };
/** A report emailed to members on a schedule (GET /business/reports/schedules). */
export type ReportSchedule = { id: string; report: string; reportName: string; period: ReportPeriod; frequency: "daily" | "weekly" | "monthly"; recipients: { id: string; name: string; email: string }[]; paused: boolean; nextDueAt: string | null; lastSentAt: string | null; lastProblem: string | null; createdByName: string };
type Member = { user_id: string; name: string; email: string; status: string };

const frequencyWords = { daily: "Every morning", weekly: "Every Monday", monthly: "On the 1st" } as const;
const select = "mt-1 h-9 w-full rounded-md border border-input bg-surface-2 px-2 text-sm";
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

function Empty({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-5 py-12 text-center"><BarChart3 className="size-6 text-muted-foreground" /><p className="text-sm font-medium">{title}</p><p className="max-w-md text-xs text-muted-foreground">{description}</p>{action}</div>;
}

/**
 * Saving a report: a library report and the period it opens on, under a name the team will know,
 * such as "Board pack: sales this quarter". Saved reports are the business's, not one person's.
 */
export function SaveReportDialog({ reports, initial, onClose, onSave }: { reports: ReportDefinition[]; initial?: { report: string; period: ReportPeriod }; onClose: () => void; onSave: (value: { name: string; report: string; period: ReportPeriod; note: string }) => Promise<void> }) {
  const [report, setReport] = React.useState(initial?.report ?? reports[0]?.id ?? "");
  const [period, setPeriod] = React.useState<ReportPeriod>(initial?.period ?? "month");
  const definition = reports.find((item) => item.id === report);
  const [name, setName] = React.useState(initial && definition ? `${definition.name}, ${periodWords[initial.period].toLowerCase()}` : "");
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  async function save() {
    setSaving(true);
    try { await onSave({ name: name.trim(), report, period, note: note.trim() }); } catch (error) { toast.error(message(error)); setSaving(false); }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}><DialogContent className="max-w-md">
    <DialogHeader><DialogTitle>Save a report</DialogTitle><DialogDescription>Everyone here who reads reports sees it under My reports, and it opens on the period you choose.</DialogDescription></DialogHeader>
    <div className="grid gap-3">
      {!initial && <div><Label htmlFor="save-report">Report</Label><select id="save-report" value={report} onChange={(event) => setReport(event.target.value)} className={select}>{reports.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>}
      <div><Label htmlFor="save-period">Opens on</Label><select id="save-period" value={period} onChange={(event) => setPeriod(event.target.value as ReportPeriod)} className={select}>{(Object.keys(periodWords) as ReportPeriod[]).map((key) => <option key={key} value={key}>{periodWords[key]}</option>)}</select><p className="mt-1 text-[11px] text-muted-foreground">For reports that compare a period. The others always show today.</p></div>
      <div><Label htmlFor="save-name">Name</Label><Input id="save-name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="Board pack: sales this quarter" className="mt-1" autoFocus /></div>
      <div><Label htmlFor="save-note">Note for the team (optional)</Label><Input id="save-note" value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} placeholder="Reviewed every Friday" className="mt-1" /></div>
    </div>
    <DialogFooter><Button variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button><Button disabled={!name.trim() || !report || saving} onClick={() => void save()}>{saving && <Loader2 className="size-3.5 animate-spin" />}Save report</Button></DialogFooter>
  </DialogContent></Dialog>;
}

export function SavedReportsPanel({ saved, loading, error, names, onNew, onOpen, onDelete }: { saved: SavedReport[]; loading: boolean; error?: string; names: Map<string, string>; onNew: () => void; onOpen: (item: SavedReport) => void; onDelete: (item: SavedReport) => Promise<void> }) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const action = <Button size="sm" onClick={onNew}><Plus className="size-3.5" />Save a report</Button>;
  return <SectionCard title="My reports" description="Reports your business saved under its own names. Open one and it shows today's figures." action={saved.length ? action : undefined}>
    {loading ? <p className="text-sm text-muted-foreground">Loading saved reports…</p>
      : error ? <p className="text-sm text-danger">{error}</p>
      : saved.length === 0 ? <Empty title="No saved reports yet" description="Save the reports you look at often, with the period they open on, so the team finds them in one place. You can also save one from any report with Save." action={action} />
      : <ul className="divide-y divide-border">{saved.map((item) => <li key={item.id} className="flex flex-wrap items-center gap-3 py-3">
        <button type="button" onClick={() => onOpen(item)} className="min-w-0 flex-1 text-left">
          <span className="block text-sm font-medium hover:text-accent">{item.name}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{names.get(item.report) ?? item.report} · {periodWords[item.period]} · saved by {item.mine ? "you" : item.createdByName}{item.note ? ` · ${item.note}` : ""}</span>
        </button>
        <Button size="sm" variant="secondary" onClick={() => onOpen(item)}>Open</Button>
        <Button size="icon" variant="ghost" aria-label={`Delete ${item.name}`} disabled={busy !== null} onClick={async () => { if (!window.confirm(`Delete “${item.name}”? The report itself stays in the Library.`)) return; setBusy(item.id); try { await onDelete(item); } catch (failure) { toast.error(message(failure)); } finally { setBusy(null); } }}>{busy === item.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5 text-danger" />}</Button>
      </li>)}</ul>}
  </SectionCard>;
}

/**
 * Emailing a report to members of the business. Only people in the business can get it, and each
 * gets the figures their own role may see, read the morning it goes out.
 */
export function ScheduleReportDialog({ reports, initial, onClose, onSave }: { reports: ReportDefinition[]; initial?: string; onClose: () => void; onSave: (value: { report: string; period: ReportPeriod; frequency: ReportSchedule["frequency"]; recipients: number[] }) => Promise<void> }) {
  const members = useApi<Member[]>("/members");
  const active = (members.data ?? []).filter((item) => item.status === "active");
  const [report, setReport] = React.useState(initial && reports.some((item) => item.id === initial) ? initial : reports[0]?.id ?? "");
  const [period, setPeriod] = React.useState<ReportPeriod>("month");
  const [frequency, setFrequency] = React.useState<ReportSchedule["frequency"]>("weekly");
  const [chosen, setChosen] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);
  const toggle = (id: string) => setChosen((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  async function save() {
    setSaving(true);
    try { await onSave({ report, period, frequency, recipients: chosen.map(Number) }); } catch (error) { toast.error(message(error)); setSaving(false); }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}><DialogContent className="max-w-md">
    <DialogHeader><DialogTitle>Email a report</DialogTitle><DialogDescription>Sent at 9 in the morning, India time. Each person gets only the figures their own role can see.</DialogDescription></DialogHeader>
    {reports.length === 0 ? <p className="text-sm text-muted-foreground">No report has figures from your records yet, so there is nothing to send.</p> : <div className="grid gap-3">
      <div><Label htmlFor="schedule-report">Report</Label><select id="schedule-report" value={report} onChange={(event) => setReport(event.target.value)} className={select}>{reports.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="schedule-frequency">How often</Label><select id="schedule-frequency" value={frequency} onChange={(event) => setFrequency(event.target.value as ReportSchedule["frequency"])} className={select}><option value="daily">Every morning</option><option value="weekly">Every Monday</option><option value="monthly">On the 1st of the month</option></select></div>
        <div><Label htmlFor="schedule-period">Period</Label><select id="schedule-period" value={period} onChange={(event) => setPeriod(event.target.value as ReportPeriod)} className={select}>{(Object.keys(periodWords) as ReportPeriod[]).map((key) => <option key={key} value={key}>{periodWords[key]}</option>)}</select></div>
      </div>
      <fieldset><legend className="text-sm font-medium">Send to</legend>
        {members.loading ? <p className="mt-1 text-xs text-muted-foreground">Loading your team…</p> : members.error ? <p className="mt-1 text-xs text-danger">{members.error}</p>
          : <div className="mt-1 grid max-h-48 gap-1 overflow-y-auto rounded-md border border-border p-2">{active.map((item) => <label key={item.user_id} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-surface-2"><input type="checkbox" checked={chosen.includes(item.user_id)} onChange={() => toggle(item.user_id)} /><span className="min-w-0 truncate">{item.name} <span className="text-muted-foreground">· {item.email}</span></span></label>)}</div>}
        <p className="mt-1 text-[11px] text-muted-foreground">Only people in this business. To send to your accountant, invite them in People &amp; Access first.</p>
      </fieldset>
    </div>}
    <DialogFooter><Button variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button><Button disabled={!report || chosen.length === 0 || saving} onClick={() => void save()}>{saving ? <Loader2 className="size-3.5 animate-spin" /> : <CalendarClock className="size-3.5" />}Save schedule</Button></DialogFooter>
  </DialogContent></Dialog>;
}

/** Words for a list of schedules: Business Reports' by default, or an owner's agents. */
export type ScheduleWords = { title: string; description: string; emptyTitle: string; emptyText: string; action: string; hidePeriod?: boolean };
const reportWords: ScheduleWords = { title: "Scheduled", description: "Reports emailed to your team at 9 in the morning, India time.", emptyTitle: "No reports are emailed yet", emptyText: "Have the sales summary in your inbox every Monday, or receivables on the 1st, without opening Janus.", action: "Email a report" };

export function SchedulesPanel({ schedules, loading, error, onNew, onChanged, demo, words = reportWords }: { schedules: ReportSchedule[]; loading: boolean; error?: string; onNew: () => void; onChanged: (next?: ReportSchedule[]) => void; demo: boolean; words?: ScheduleWords }) {
  const [busy, setBusy] = React.useState<string | null>(null);
  async function act(item: ReportSchedule, kind: "send" | "pause" | "delete") {
    if (kind === "delete" && !window.confirm(`Stop emailing ${item.reportName}? It will not be sent again.`)) return;
    if (demo) {
      onChanged(kind === "delete" ? schedules.filter((other) => other.id !== item.id) : schedules.map((other) => other.id === item.id ? { ...other, paused: kind === "pause" ? !other.paused : other.paused, lastSentAt: kind === "send" ? new Date().toISOString() : other.lastSentAt } : other));
      if (kind === "send") toast.success("In the preview nothing is emailed.");
      return;
    }
    setBusy(`${item.id}:${kind}`);
    try {
      if (kind === "send") { const done = await api<ReportSchedule>(`/business/reports/schedules/${item.id}/send`, { method: "POST" }); toast[done.lastProblem ? "warning" : "success"](done.lastProblem ?? `Sent to ${item.recipients.length} ${item.recipients.length === 1 ? "person" : "people"}.`); }
      else if (kind === "pause") await api(`/business/reports/schedules/${item.id}`, { method: "PATCH", body: JSON.stringify({ paused: !item.paused }) });
      else await api(`/business/reports/schedules/${item.id}`, { method: "DELETE" });
      onChanged();
    } catch (failure) { toast.error(message(failure)); } finally { setBusy(null); }
  }
  const spin = (item: ReportSchedule, kind: string, icon: React.ReactNode) => busy === `${item.id}:${kind}` ? <Loader2 className="size-3.5 animate-spin" /> : icon;
  const action = <Button size="sm" onClick={onNew}><CalendarClock className="size-3.5" />{words.action}</Button>;
  return <SectionCard title={words.title} description={words.description} action={schedules.length ? action : undefined}>
    {loading ? <p className="text-sm text-muted-foreground">Loading schedules…</p>
      : error ? <p className="text-sm text-danger">{error}</p>
      : schedules.length === 0 ? <Empty title={words.emptyTitle} description={words.emptyText} action={action} />
      : <ul className="divide-y divide-border">{schedules.map((item) => <li key={item.id} className="flex flex-wrap items-start gap-3 py-3">
        <div className="min-w-[220px] flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">{item.reportName}{item.paused ? <Badge variant="warning">Paused</Badge> : <Badge variant="success">On</Badge>}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{frequencyWords[item.frequency]}{words.hidePeriod ? "" : ` · ${periodWords[item.period].toLowerCase()}`} · to {item.recipients.map((person) => person.name).join(", ") || "nobody still in the business"}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{item.nextDueAt ? `Next: ${when(item.nextDueAt)}` : "Not sending while paused"}{item.lastSentAt ? ` · Last sent ${when(item.lastSentAt)}` : " · Not sent yet"}</p>
          {item.lastProblem && <p className="mt-1 text-xs text-warning">{item.lastProblem}</p>}
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="secondary" disabled={busy !== null || item.recipients.length === 0} onClick={() => void act(item, "send")}>{spin(item, "send", <Send className="size-3.5" />)}Send now</Button>
          <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void act(item, "pause")}>{spin(item, "pause", item.paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />)}{item.paused ? "Resume" : "Pause"}</Button>
          <Button size="icon" variant="ghost" aria-label={`Stop emailing ${item.reportName}`} disabled={busy !== null} onClick={() => void act(item, "delete")}>{spin(item, "delete", <Trash2 className="size-3.5 text-danger" />)}</Button>
        </div>
      </li>)}</ul>}
  </SectionCard>;
}
