"use client";

import { useState } from "react";
import {
  Mail, Plus, Pencil, Trash2, Play, Pause, RefreshCw,
  ArrowRight, Clock, Zap, Eye, ChevronDown, ChevronUp,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { useSession } from "@/components/auth/session-provider";
import { can } from "@/lib/permissions";
import type { EmailSequence, EmailTemplate } from "@/lib/api/types";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type StepDraft = { templateId: string; delayDays: number; delayHours: number };
type Draft = { id?: string; name: string; description: string; steps: StepDraft[]; active: boolean };
type ViewMode = "cards" | "list";
type StatusFilter = "all" | "active" | "paused";

const emptyStep = (): StepDraft => ({ templateId: "", delayDays: 0, delayHours: 0 });
const emptyDraft = (): Draft => ({ name: "", description: "", steps: [emptyStep()], active: false });

function formatDelay(days: number, hours: number): string {
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  return parts.length > 0 ? parts.join(" ") : "Immediately";
}

function totalDuration(steps: Array<{ delayDays: number; delayHours: number }>): string {
  const totalHours = steps.reduce((s, step) => s + step.delayDays * 24 + step.delayHours, 0);
  if (totalHours === 0) return "Instant";
  const days = Math.floor(totalHours / 24);
  const hrs = totalHours % 24;
  if (days > 0 && hrs > 0) return `${days}d ${hrs}h`;
  if (days > 0) return `${days} day${days !== 1 ? "s" : ""}`;
  return `${hrs} hour${hrs !== 1 ? "s" : ""}`;
}

function useLocalView(): [ViewMode, (v: ViewMode) => void] {
  const [view, setView] = useState<ViewMode>(() => {
    try { return (localStorage.getItem("janus:sequences:view") as ViewMode) || "cards"; } catch { return "cards"; }
  });
  return [view, (v: ViewMode) => { setView(v); try { localStorage.setItem("janus:sequences:view", v); } catch {} }];
}

export default function SequencesPage() {
  const session = useSession();
  const canWrite = can(session, "settings:manage");
  const sequences = useApi<EmailSequence[]>("/sequences");
  const templates = useApi<EmailTemplate[]>("/email-templates");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useLocalView();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const all = sequences.data ?? [];
  const filtered = all.filter((s) => {
    const matchesQuery = `${s.name} ${s.description ?? ""}`.toLowerCase().includes(query.toLowerCase());
    const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? s.active : !s.active);
    return matchesQuery && matchesStatus;
  });

  const tplMap = new Map((templates.data ?? []).map((t) => [t.id, t]));

  const activeCount = all.filter((s) => s.active).length;
  const totalSteps = all.reduce((n, s) => n + s.steps.length, 0);
  const avgSteps = all.length > 0 ? Math.round(totalSteps / all.length * 10) / 10 : 0;

  async function save() {
    if (!editing) return;
    if (!editing.name.trim()) { toast.error("Enter a sequence name"); return; }
    if (editing.steps.length === 0) { toast.error("Add at least one step"); return; }
    if (editing.steps.some((s) => !s.templateId)) { toast.error("Select a template for every step"); return; }
    setBusy(true);
    try {
      const body = { name: editing.name.trim(), description: editing.description.trim() || null, steps: editing.steps, active: editing.active };
      if (editing.id) {
        await api(`/sequences/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
        toast.success("Sequence updated");
      } else {
        await api("/sequences", { method: "POST", body: JSON.stringify(body) });
        toast.success("Sequence created");
      }
      setEditing(null);
      sequences.reload();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/sequences/${id}`, { method: "DELETE" });
      toast.success("Sequence deleted");
      sequences.reload();
    } catch (e) {
      toast.error(message(e));
    }
  }

  async function toggle(seq: EmailSequence) {
    try {
      await api(`/sequences/${seq.id}`, { method: "PATCH", body: JSON.stringify({ active: !seq.active }) });
      toast.success(seq.active ? "Sequence paused" : "Sequence activated");
      sequences.reload();
    } catch (e) {
      toast.error(message(e));
    }
  }

  async function duplicate(seq: EmailSequence) {
    setBusy(true);
    try {
      await api("/sequences", {
        method: "POST",
        body: JSON.stringify({ name: `${seq.name} (copy)`, description: seq.description, steps: seq.steps, active: false }),
      });
      toast.success("Sequence duplicated");
      sequences.reload();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }

  function addStep() {
    if (!editing) return;
    setEditing({ ...editing, steps: [...editing.steps, emptyStep()] });
  }

  function removeStep(idx: number) {
    if (!editing) return;
    setEditing({ ...editing, steps: editing.steps.filter((_, i) => i !== idx) });
  }

  function updateStep(idx: number, patch: Partial<StepDraft>) {
    if (!editing) return;
    setEditing({ ...editing, steps: editing.steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)) });
  }

  function moveStep(idx: number, dir: -1 | 1) {
    if (!editing) return;
    const steps = [...editing.steps];
    const target = idx + dir;
    if (target < 0 || target >= steps.length) return;
    [steps[idx], steps[target]] = [steps[target], steps[idx]];
    setEditing({ ...editing, steps });
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Email Sequences"
        description={all.length > 0 ? `${all.length} sequence${all.length !== 1 ? "s" : ""} · ${activeCount} active` : "Automated drip campaigns for lead nurturing"}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => sequences.reload()} aria-label="Refresh"><RefreshCw className="size-3.5" /></Button>
            {canWrite && (
              <Button size="sm" onClick={() => setEditing(emptyDraft())}><Plus className="size-3.5" /> New Sequence</Button>
            )}
          </div>
        }
      />

      {all.length > 0 && (
        <div className="grid gap-2 px-6 pb-3 sm:grid-cols-4">
          {([
            ["Total Sequences", String(all.length), `${totalSteps} total steps`, "bg-accent"],
            ["Active", String(activeCount), `${all.length - activeCount} paused`, "bg-emerald-500"],
            ["Avg Steps", String(avgSteps), "Per sequence", "bg-indigo-500"],
            ["Total Duration", totalDuration(all.flatMap((s) => s.steps)), "Longest cadence", "bg-amber-500"],
          ] as const).map(([title, value, detail, dot]) => (
            <div key={title} className="rounded-xl border border-border bg-surface p-3">
              <div className="flex items-center gap-1.5">
                <span className={cn("size-1.5 rounded-full", dot)} />
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-lg font-bold tabular-nums">{value}</span>
                <span className="text-[11px] text-muted-foreground">{detail}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {all.length > 0 && (
        <div className="mx-6 mb-3 flex items-center gap-2 rounded-lg bg-accent-muted px-4 py-2.5">
          <Mail className="size-3.5 shrink-0 text-accent" />
          <p className="text-[12px] text-accent">Sequences with 3-5 steps and 2-3 day delays between emails see the best open rates.</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 pb-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Search sequences..." className="w-60" />
        <div className="flex rounded-lg border border-border bg-surface-2 p-0.5 text-xs">
          {(["all", "active", "paused"] as StatusFilter[]).map((s) => {
            const count = s === "all" ? all.length : all.filter((seq) => s === "active" ? seq.active : !seq.active).length;
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
                {s}{count > 0 && <span className="ml-1 text-muted-foreground">({count})</span>}
              </button>
            );
          })}
        </div>
        <div className="flex rounded-lg border border-border bg-surface-2 p-0.5">
          <button type="button" onClick={() => setView("cards")} className={cn("flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors", view === "cards" ? "bg-surface shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}><Zap className="size-3.5" /> Cards</button>
          <button type="button" onClick={() => setView("list")} className={cn("flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors", view === "list" ? "bg-surface shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}><Mail className="size-3.5" /> List</button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {filtered.length === 0 ? (
          <EmptyState
            icon={Mail}
            title={query || statusFilter !== "all" ? "No sequences match your filters" : "No sequences yet"}
            description={query || statusFilter !== "all" ? "Try a different search or filter." : "Create email drip sequences to automatically nurture leads over time."}
            action={canWrite && !query ? <Button size="sm" onClick={() => setEditing(emptyDraft())}><Plus className="size-3.5 mr-1" /> Create</Button> : undefined}
          />
        ) : view === "cards" ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((seq) => {
              const expanded = expandedId === seq.id;
              return (
                <article key={seq.id} className="flex flex-col rounded-xl border border-border bg-surface transition-all hover:shadow-md hover:border-border-strong">
                  <div className="flex items-start justify-between gap-2 p-4 pb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold leading-tight truncate">{seq.name}</h3>
                        <Badge variant={seq.active ? "success" : "neutral"} className="shrink-0 text-[9px]">{seq.active ? "Active" : "Paused"}</Badge>
                      </div>
                      {seq.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{seq.description}</p>}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 px-4 py-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Mail className="size-3" /> {seq.steps.length} step{seq.steps.length !== 1 ? "s" : ""}</span>
                    <span className="flex items-center gap-1"><Clock className="size-3" /> {totalDuration(seq.steps)}</span>
                  </div>

                  {/* Step flow preview */}
                  <div className="px-4 pb-2">
                    <button type="button" onClick={() => setExpandedId(expanded ? null : seq.id)} className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors">
                      {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                      {expanded ? "Hide steps" : "Show steps"}
                    </button>
                    {expanded && (
                      <div className="mt-2 space-y-1.5">
                        {seq.steps.map((step, idx) => {
                          const tpl = tplMap.get(step.templateId);
                          return (
                            <div key={idx} className="flex items-center gap-2 text-[11px]">
                              <span className="flex size-5 items-center justify-center rounded-full bg-accent-muted text-accent text-[9px] font-bold shrink-0">{idx + 1}</span>
                              {idx > 0 && <span className="text-muted-foreground">{formatDelay(step.delayDays, step.delayHours)}</span>}
                              {idx > 0 && <ArrowRight className="size-2.5 text-muted-foreground shrink-0" />}
                              <span className="truncate font-medium">{tpl?.name ?? "Unknown template"}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {canWrite && (
                    <div className="flex gap-1 border-t border-border/50 p-2 mt-auto">
                      <Button variant="ghost" size="sm" className="h-7 text-xs flex-1 gap-1" onClick={() => toggle(seq)}>
                        {seq.active ? <><Pause className="size-3" /> Pause</> : <><Play className="size-3" /> Activate</>}
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs flex-1 gap-1" onClick={() => setEditing({ id: seq.id, name: seq.name, description: seq.description ?? "", steps: seq.steps, active: seq.active })}>
                        <Pencil className="size-3" /> Edit
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => duplicate(seq)} disabled={busy}>
                        <Copy className="size-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => remove(seq.id)}>
                        <Trash2 className="size-3 text-danger" />
                      </Button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((seq) => {
              const expanded = expandedId === seq.id;
              return (
                <div key={seq.id} className="rounded-xl border border-border bg-surface overflow-hidden">
                  <div className="flex items-center gap-4 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold truncate">{seq.name}</span>
                        <Badge variant={seq.active ? "success" : "neutral"} className="text-[9px]">{seq.active ? "Active" : "Paused"}</Badge>
                      </div>
                      {seq.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{seq.description}</p>}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                      <span>{seq.steps.length} step{seq.steps.length !== 1 ? "s" : ""}</span>
                      <span>{totalDuration(seq.steps)}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => setExpandedId(expanded ? null : seq.id)}>
                        {expanded ? <ChevronUp className="size-3.5" /> : <Eye className="size-3.5" />}
                      </Button>
                      {canWrite && (
                        <>
                          <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => toggle(seq)} title={seq.active ? "Pause" : "Activate"}>
                            {seq.active ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                          </Button>
                          <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => setEditing({ id: seq.id, name: seq.name, description: seq.description ?? "", steps: seq.steps, active: seq.active })}>
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => duplicate(seq)} disabled={busy}>
                            <Copy className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => remove(seq.id)}>
                            <Trash2 className="size-3.5 text-danger" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  {expanded && (
                    <div className="border-t border-border bg-surface-2/30 px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {seq.steps.map((step, idx) => {
                          const tpl = tplMap.get(step.templateId);
                          return (
                            <div key={idx} className="flex items-center gap-1.5">
                              {idx > 0 && (
                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <ArrowRight className="size-3" />
                                  <span>{formatDelay(step.delayDays, step.delayHours)}</span>
                                  <ArrowRight className="size-3" />
                                </div>
                              )}
                              <span className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs">
                                <span className="flex size-4 items-center justify-center rounded-full bg-accent-muted text-accent text-[9px] font-bold">{idx + 1}</span>
                                <span className="font-medium truncate max-w-[140px]">{tpl?.name ?? "Template"}</span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={editing !== null} onOpenChange={(v) => { if (!v) setEditing(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit Sequence" : "New Sequence"}</DialogTitle>
            <DialogDescription>{editing?.id ? "Update the cadence, templates and timing." : "Build a multi-step email cadence for lead nurturing."}</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Name *</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. New Lead Follow-up" /></div>
                <div><Label>Description</Label><Input value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="What this sequence does" /></div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <Label>Steps</Label>
                    <span className="ml-2 text-xs text-muted-foreground">Total duration: {totalDuration(editing.steps)}</span>
                  </div>
                  <Button variant="outline" size="sm" onClick={addStep}><Plus className="size-3 mr-1" /> Add Step</Button>
                </div>
                <div className="space-y-2">
                  {editing.steps.map((step, idx) => (
                    <div key={idx} className="flex items-end gap-2 rounded-lg border border-border bg-surface-2 p-3">
                      <div className="flex flex-col items-center gap-1 pb-1">
                        <span className="flex size-6 items-center justify-center rounded-full bg-accent-muted text-accent text-xs font-bold">{idx + 1}</span>
                        {editing.steps.length > 1 && (
                          <div className="flex flex-col gap-0.5">
                            <button type="button" onClick={() => moveStep(idx, -1)} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronUp className="size-3" /></button>
                            <button type="button" onClick={() => moveStep(idx, 1)} disabled={idx === editing.steps.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown className="size-3" /></button>
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <Label className="text-xs">Template</Label>
                        <Select value={step.templateId} onValueChange={(v) => updateStep(idx, { templateId: v })}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select template..." /></SelectTrigger>
                          <SelectContent>
                            {(templates.data ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-20">
                        <Label className="text-xs">Days</Label>
                        <Input type="number" min={0} className="h-8 text-xs" value={step.delayDays} onChange={(e) => updateStep(idx, { delayDays: Number(e.target.value) })} />
                      </div>
                      <div className="w-20">
                        <Label className="text-xs">Hours</Label>
                        <Input type="number" min={0} max={23} className="h-8 text-xs" value={step.delayHours} onChange={(e) => updateStep(idx, { delayHours: Number(e.target.value) })} />
                      </div>
                      {editing.steps.length > 1 && (
                        <Button variant="ghost" size="sm" className="size-7 p-0 shrink-0" onClick={() => removeStep(idx)}>
                          <Trash2 className="size-3.5 text-danger" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={busy}>{busy ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
