"use client";

import * as React from "react";
import { Check, Loader2, MessageSquare, SquareCheckBig, Zap } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";

/** A ready-made workflow from GET /business/automation-templates: it runs as it is once the person
 * picks the Team Chat channel it posts in or the project it adds tasks to (`needs`). */
export type WorkflowStarter = { id: string; name: string; description: string; trigger?: Record<string, unknown>; steps?: unknown[]; modules?: string[]; needs?: string[] };
/** One run of a workflow, from GET /business/automations/executions (the latest hundred). */
export type WorkflowRun = { id: string; workflowId: string; status: string; event: Record<string, unknown>; createdAt: string; completedAt?: string | null; recordRef?: Record<string, unknown> | null; result?: { error?: { message?: string } } };
/** What the list says about a workflow's runs in the last 7 days. */
export type RunStats = { runs7d: number; failed7d: number; waiting: number; lastRunAt: string | null; lastError: string | null };

const WEEK = 7 * 864e5;
const failed = (status: string) => status === "failed" || status === "refused";

/** Runs, failures and waiting approvals for each workflow, from its recent runs. */
export function runStats(runs: WorkflowRun[]): Map<string, RunStats> {
  const since = Date.now() - WEEK;
  const out = new Map<string, RunStats>();
  // Newest first, as the API returns them, so the first failure seen is the latest.
  for (const run of runs) {
    const stats = out.get(run.workflowId) ?? { runs7d: 0, failed7d: 0, waiting: 0, lastRunAt: null, lastError: null };
    const at = Date.parse(run.createdAt);
    if (at >= since) { stats.runs7d += 1; if (failed(run.status)) stats.failed7d += 1; }
    if (run.status === "pending_approval") stats.waiting += 1;
    if (!stats.lastRunAt || at > Date.parse(stats.lastRunAt)) stats.lastRunAt = run.createdAt;
    if (failed(run.status) && !stats.lastError) stats.lastError = run.result?.error?.message ?? "The last run failed.";
    out.set(run.workflowId, stats);
  }
  return out;
}

/** What a run is about, in words. */
export function runSubject(run: WorkflowRun) {
  const ref = run.recordRef ?? run.event;
  if (ref?.lead_id !== undefined) return `New lead #${String(ref.lead_id)}`;
  if (ref?.ticket_id !== undefined) return `New ticket #${String(ref.ticket_id)}`;
  return "Started by hand";
}

const triggerWords: Record<string, string> = { manual: "Run by hand", lead_created: "When a lead comes in", ticket_created: "When a support ticket is opened" };
export const whenItStarts = (trigger?: Record<string, unknown>) => triggerWords[String(trigger?.type ?? "")] ?? (trigger?.type ? String(trigger.type).replaceAll("_", " ") : "Not set");

/** The ready-made workflows as cards, each opening its short set-up. */
export function StarterCards({ starters, onPick }: { starters: WorkflowStarter[]; onPick: (starter: WorkflowStarter) => void }) {
  return <div className="grid gap-3 sm:grid-cols-2">{starters.map((item) => <article key={item.id} className="flex flex-col rounded-lg border border-border bg-surface p-4">
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-accent-muted text-accent">{item.needs?.includes("project") ? <SquareCheckBig className="size-3.5" aria-hidden /> : <MessageSquare className="size-3.5" aria-hidden />}</span>
      <div className="min-w-0"><h3 className="text-sm font-semibold">{item.name}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p></div>
    </div>
    <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground"><Zap className="size-3" aria-hidden />{whenItStarts(item.trigger)}</p>
    <Button size="sm" className="mt-3 self-start" onClick={() => onPick(item)}>Set up</Button>
  </article>)}</div>;
}

type Channel = { id: string; kind: string; name: string | null; joined: boolean };
type Project = { external_key: string; name: string; status: string };

/**
 * One question, then the workflow is made and, if the person wants, switched on. A post goes out as
 * the person, so only channels they have joined are offered; a task needs a project.
 */
export function StarterSetup({ starter, onClose, onDone }: { starter: WorkflowStarter; onClose: () => void; onDone: () => void }) {
  const wantsChannel = starter.needs?.includes("channel") ?? false;
  const wantsProject = starter.needs?.includes("project") ?? false;
  const channels = useApi<Channel[]>(wantsChannel ? "/team/channels" : null);
  const projects = useApi<Project[]>(wantsProject ? "/project-records" : null);
  const joined = (channels.data ?? []).filter((item) => item.kind === "channel" && item.joined && item.name);
  const open = (projects.data ?? []).filter((item) => !["completed", "cancelled", "closed", "archived"].includes(item.status));
  const [channel, setChannel] = React.useState("");
  const [project, setProject] = React.useState("");
  const [saving, setSaving] = React.useState<"on" | "draft" | null>(null);
  const chosenChannel = channel || joined[0]?.name || "";
  const chosenProject = project || open[0]?.external_key || "";
  const ready = (!wantsChannel || Boolean(chosenChannel)) && (!wantsProject || Boolean(chosenProject));
  const loading = channels.loading || projects.loading;

  const create = async (switchOn: boolean) => {
    setSaving(switchOn ? "on" : "draft");
    try {
      const steps = (starter.steps ?? []).map((step) => {
        const raw = step as { config?: Record<string, unknown> };
        return { ...raw, config: { ...raw.config, ...(wantsChannel ? { channel: chosenChannel } : {}), ...(wantsProject ? { project: chosenProject } : {}) } };
      });
      // An alert or a task for each lead is no use if each one first waits for an approval.
      const created = await api<{ id: string }>("/business/automations", { method: "POST", body: JSON.stringify({ name: starter.name, description: starter.description, trigger: starter.trigger ?? { type: "manual" }, actions: steps, requiresApproval: false }) });
      if (switchOn) await api(`/business/automations/${created.id}/on`, { method: "POST" });
      toast.success(switchOn ? `“${starter.name}” is on. It runs for the next ${starter.trigger?.type === "ticket_created" ? "ticket" : "lead"}.` : `“${starter.name}” saved, switched off.`);
      onDone();
    } catch (error) { toast.error(message(error)); setSaving(null); }
  };

  return <Dialog open onOpenChange={(value) => { if (!value) onClose(); }}>
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>{starter.name}</DialogTitle><DialogDescription>{starter.description}</DialogDescription></DialogHeader>
      <div className="grid gap-4">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Zap className="size-3.5" aria-hidden />{whenItStarts(starter.trigger)}</p>
        {wantsChannel && <div className="grid gap-1.5"><Label htmlFor="starter-channel">Post in</Label>
          {loading ? <p className="text-xs text-muted-foreground">Loading your channels…</p>
            : channels.error ? <p className="text-xs text-danger">{channels.error}</p>
            : joined.length ? <select id="starter-channel" value={chosenChannel} onChange={(event) => setChannel(event.target.value)} className="h-9 rounded-md border border-input bg-surface-2 px-2 text-sm">{joined.map((item) => <option key={item.id} value={item.name!}>#{item.name}</option>)}</select>
            : <p className="text-xs text-muted-foreground">You have not joined a Team Chat channel. Create or join one in Team Chat first; posts go out as you.</p>}
          <p className="text-[11px] text-muted-foreground">Posted as you, in a channel you have joined.</p>
        </div>}
        {wantsProject && <div className="grid gap-1.5"><Label htmlFor="starter-project">Add tasks to</Label>
          {loading ? <p className="text-xs text-muted-foreground">Loading your projects…</p>
            : projects.error ? <p className="text-xs text-danger">{projects.error}</p>
            : open.length ? <select id="starter-project" value={chosenProject} onChange={(event) => setProject(event.target.value)} className="h-9 rounded-md border border-input bg-surface-2 px-2 text-sm">{open.map((item) => <option key={item.external_key} value={item.external_key}>{item.name}</option>)}</select>
            : <p className="text-xs text-muted-foreground">There is no open project to add tasks to. Create one in Projects &amp; Delivery first, for example &quot;Sales follow-ups&quot;.</p>}
          <p className="text-[11px] text-muted-foreground">Each task is due the next day.</p>
        </div>}
        <ul className="grid gap-1 rounded-md bg-surface-2 p-3 text-xs">{(starter.steps ?? []).map((step, index) => { const raw = step as { title?: string; config?: Record<string, unknown> }; const text = String(raw.config?.message ?? raw.config?.title ?? "").replace(/\{\{\s*([a-z_]+)\.([a-z_]+)\s*\}\}/g, (_, record: string, field: string) => `[${record}'s ${field.replaceAll("_", " ")}]`); return <li key={index}><span className="font-medium">{raw.title ?? `Step ${index + 1}`}</span>{text && <span className="text-muted-foreground">: “{text}”</span>}</li>; })}</ul>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="secondary" disabled={!ready || saving !== null} onClick={() => void create(false)}>{saving === "draft" && <Loader2 className="size-3.5 animate-spin" />}Save, switched off</Button>
        <Button disabled={!ready || saving !== null} onClick={() => void create(true)}>{saving === "on" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}Switch it on</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

/** Runs that wait for someone to approve them before any step happens. */
export function RunsWaiting({ runs, names, onApproved }: { runs: WorkflowRun[]; names: Map<string, string>; onApproved: () => void }) {
  const waiting = runs.filter((run) => run.status === "pending_approval");
  const [busy, setBusy] = React.useState<string | null>(null);
  if (!waiting.length) return null;
  const approve = async (run: WorkflowRun) => {
    setBusy(run.id);
    try { await api(`/business/automations/executions/${run.id}/approve`, { method: "POST" }); toast.success("Approved. Janus carries it out now."); onApproved(); }
    catch (error) { toast.error(message(error)); } finally { setBusy(null); }
  };
  return <section aria-label="Runs waiting for approval" className="mb-4 rounded-lg border border-warning/40 bg-warning/5 p-3">
    <p className="text-sm font-medium">{waiting.length} {waiting.length === 1 ? "run is" : "runs are"} waiting for approval</p>
    <p className="mt-0.5 text-xs text-muted-foreground">Nothing in them happens until someone approves.</p>
    <ul className="mt-2 divide-y divide-border">{waiting.slice(0, 5).map((run) => <li key={run.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
      <span className="min-w-0 flex-1"><span className="font-medium">{names.get(run.workflowId) ?? "Workflow"}</span> <span className="text-muted-foreground">· {runSubject(run)} · {new Date(run.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span></span>
      <Badge variant="warning">Waiting</Badge>
      <Button size="sm" disabled={busy !== null} onClick={() => void approve(run)}>{busy === run.id && <Loader2 className="size-3.5 animate-spin" />}Approve</Button>
    </li>)}</ul>
    {waiting.length > 5 && <p className="text-xs text-muted-foreground">And {waiting.length - 5} more: approve these first.</p>}
  </section>;
}
