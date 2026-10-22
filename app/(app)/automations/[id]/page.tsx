"use client";

import * as React from "react";
import { use } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, Check, ChevronDown, Copy, Download, FlaskConical, Lock, MoreHorizontal, Pencil, Play, Plus, Redo2, Save, Settings2, ShieldAlert, Trash2, Undo2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import type { BusinessAutomationCatalog, BusinessWorkflowRun, BusinessWorkflowStep } from "@/lib/types";
import { toast } from "sonner";
import { demoMode } from "@/lib/demo-mode";
import { WorkspaceCopyDialog, workspaceCopyOptions } from "@/components/workspace-copy-dialog";

type WorkflowRecord = {
  id: string;
  name: string;
  description: string;
  status: string;
  scope: "business";
  folderId?: string | null;
  ownerId?: string | null;
  liveVersion?: number | null;
  draftVersion?: number | null;
  trigger: Record<string, unknown>;
  steps: BusinessWorkflowStep[];
  actions: unknown[];
  goal?: Record<string, unknown>;
  settings: Record<string, unknown>;
  modulesUsed: string[];
  requiresApproval?: boolean;
  updatedAt?: string | null;
};

type PageTab = "editor" | "runs" | "versions" | "settings";
const pageTabs: Array<[PageTab, string]> = [["editor", "Editor"], ["runs", "Runs"], ["versions", "Versions"], ["settings", "Settings"]];

const emptyWorkflow: WorkflowRecord = {
  id: "new",
  name: "Untitled workflow",
  description: "",
  status: "draft",
  scope: "business",
  trigger: { type: "manual", reEnrollment: false, enrollExisting: false },
  steps: [],
  actions: [],
  settings: { runWindow: "any_time", timezone: "Asia/Kolkata", throttling: {}, errorHandling: {}, notifications: {} },
  modulesUsed: [],
};

const demoWorkflowRecords: WorkflowRecord[] = [
  { id: "demo-workflow-lead-follow-up", name: "New lead follow-up", description: "Qualify a new lead, draft a reply and create a follow-up task.", status: "active", scope: "business", ownerId: "Sales team", liveVersion: 3, draftVersion: 4, trigger: { type: "lead_created", module: "crm_sales", reEnrollment: false, enrollExisting: false }, steps: [{ id: "lead-qualify", type: "action", module: "crm_sales", action: "qualify_lead", title: "Qualify lead", config: {}, disabled: false }, { id: "lead-reply", type: "action", module: "whatsapp", action: "draft_reply", title: "Draft WhatsApp reply", config: { approvalRequired: true }, disabled: false }, { id: "lead-task", type: "action", module: "crm_sales", action: "create_task", title: "Create follow-up task", config: {}, disabled: false }], actions: [], goal: { type: "stage_changed", value: "qualified" }, settings: { runWindow: "business_hours", timezone: "Asia/Kolkata", throttling: {}, errorHandling: {}, notifications: {} }, modulesUsed: ["crm_sales", "whatsapp"], requiresApproval: true, updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
  { id: "demo-workflow-lead", name: "New lead follow-up", description: "Qualify a new lead, draft a reply and create a follow-up task.", status: "active", scope: "business", ownerId: "Sales team", liveVersion: 3, draftVersion: 4, trigger: { type: "lead_created", module: "crm_sales", reEnrollment: false, enrollExisting: false }, steps: [{ id: "lead-qualify", type: "action", module: "crm_sales", action: "qualify_lead", title: "Qualify lead", config: {}, disabled: false }, { id: "lead-reply", type: "action", module: "whatsapp", action: "draft_reply", title: "Draft WhatsApp reply", config: { approvalRequired: true }, disabled: false }, { id: "lead-task", type: "action", module: "crm_sales", action: "create_task", title: "Create follow-up task", config: {}, disabled: false }], actions: [], goal: { type: "stage_changed", value: "qualified" }, settings: { runWindow: "business_hours", timezone: "Asia/Kolkata", throttling: {}, errorHandling: {}, notifications: {} }, modulesUsed: ["crm_sales", "whatsapp"], requiresApproval: true, updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
  { id: "demo-workflow-missed-call", name: "Missed call callback", description: "Create a callback task when a new missed call is captured.", status: "draft", scope: "business", ownerId: "Sales team", draftVersion: 1, trigger: { type: "missed_call", module: "crm_sales", reEnrollment: false, enrollExisting: false }, steps: [{ id: "call-task", type: "action", module: "crm_sales", action: "create_task", title: "Create callback task", config: { dueIn: "2h" }, disabled: false }, { id: "call-owner", type: "action", module: "crm_sales", action: "assign_owner", title: "Assign sales owner", config: {}, disabled: false }], actions: [], settings: { runWindow: "any_time", timezone: "Asia/Kolkata", throttling: {}, errorHandling: {}, notifications: {} }, modulesUsed: ["crm_sales"], requiresApproval: false, updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
  { id: "demo-workflow-call", name: "Missed call callback", description: "Create a callback task when a new missed call is captured.", status: "draft", scope: "business", ownerId: "Sales team", draftVersion: 1, trigger: { type: "missed_call", module: "crm_sales", reEnrollment: false, enrollExisting: false }, steps: [{ id: "call-task", type: "action", module: "crm_sales", action: "create_task", title: "Create callback task", config: { dueIn: "2h" }, disabled: false }, { id: "call-owner", type: "action", module: "crm_sales", action: "assign_owner", title: "Assign sales owner", config: {}, disabled: false }], actions: [], settings: { runWindow: "any_time", timezone: "Asia/Kolkata", throttling: {}, errorHandling: {}, notifications: {} }, modulesUsed: ["crm_sales"], requiresApproval: false, updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
  { id: "demo-workflow-overdue", name: "Payment overdue reminder", description: "Review overdue invoices and prepare a reminder for owner approval.", status: "paused", scope: "business", ownerId: "Finance team", liveVersion: 2, trigger: { type: "invoice_overdue", module: "finance_accounting", reEnrollment: false, enrollExisting: false }, steps: [{ id: "overdue-risk", type: "action", module: "finance_accounting", action: "find_risk", title: "Find overdue invoices", config: {}, disabled: false }, { id: "overdue-reply", type: "action", module: "whatsapp", action: "draft_reply", title: "Draft payment reminder", config: { approvalRequired: true }, disabled: false }], actions: [], goal: { type: "invoice_status", value: "paid" }, settings: { runWindow: "business_hours", timezone: "Asia/Kolkata", throttling: {}, errorHandling: {}, notifications: {} }, modulesUsed: ["finance_accounting", "whatsapp"], requiresApproval: true, updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() },
  { id: "demo-workflow-collections", name: "Payment overdue reminder", description: "Review overdue invoices and prepare a reminder for owner approval.", status: "paused", scope: "business", ownerId: "Finance team", liveVersion: 2, trigger: { type: "invoice_overdue", module: "finance_accounting", reEnrollment: false, enrollExisting: false }, steps: [{ id: "overdue-risk", type: "action", module: "finance_accounting", action: "find_risk", title: "Find overdue invoices", config: {}, disabled: false }, { id: "overdue-reply", type: "action", module: "whatsapp", action: "draft_reply", title: "Draft payment reminder", config: { approvalRequired: true }, disabled: false }], actions: [], goal: { type: "invoice_status", value: "paid" }, settings: { runWindow: "business_hours", timezone: "Asia/Kolkata", throttling: {}, errorHandling: {}, notifications: {} }, modulesUsed: ["finance_accounting", "whatsapp"], requiresApproval: true, updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() },
];

export default function AutomationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const search = useSearchParams();
  const isNew = id === "new";
  const isDemoWorkflow = demoMode && id.startsWith("demo-workflow-");
  const rawTab = search.get("tab") as PageTab | null;
  const tab: PageTab = pageTabs.some(([key]) => key === rawTab) ? (rawTab as PageTab) : "editor";
  const workflowApi = useApi<WorkflowRecord>(isNew || isDemoWorkflow ? null : "/business/automations/" + id);
  const workflowListApi = useApi<WorkflowRecord[]>(isNew || isDemoWorkflow ? null : "/business/automations");
  const runsApi = useApi<BusinessWorkflowRun[]>(isNew || isDemoWorkflow ? null : "/business/automations/" + id + "/runs");
  const versionsApi = useApi<Array<Record<string, unknown>>>(isNew || isDemoWorkflow ? null : "/business/automations/" + id + "/versions");
  const catalogApi = useApi<BusinessAutomationCatalog>("/business/automation-catalog");
  const demoRecord = isDemoWorkflow ? demoWorkflowRecords.find((record) => record.id === id) : undefined;
  const [draft, setDraft] = React.useState<WorkflowRecord>(() => demoRecord ? normalizeWorkflow(demoRecord) : emptyWorkflow);
  const [hydrated, setHydrated] = React.useState(isNew || Boolean(demoRecord));
  const [editing, setEditing] = React.useState(isNew || search.get("mode") === "edit");
  const [selectedStepId, setSelectedStepId] = React.useState("trigger");
  const [panelTab, setPanelTab] = React.useState<"setup" | "configure" | "test">("setup");
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [copyOpen, setCopyOpen] = React.useState(false);
  const [saveState, setSaveState] = React.useState("Saved");
  const [testOutput, setTestOutput] = React.useState<Record<string, unknown> | null>(null);
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [changeNote, setChangeNote] = React.useState("");
  const [draftHistory, setDraftHistory] = React.useState<WorkflowRecord[]>([]);
  const [draftFuture, setDraftFuture] = React.useState<WorkflowRecord[]>([]);
  const draftEndpointRef = React.useRef(true);
  const lastSavedRef = React.useRef<string>("");

  React.useEffect(() => {
    const record = workflowApi.data ?? workflowListApi.data?.find((item) => String(item.id) === id) ?? demoRecord;
    if (!record || hydrated) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(normalizeWorkflow(record));
    setHydrated(true);
  }, [id, workflowApi.data, workflowListApi.data, hydrated, demoRecord]);

  const selectedStep = draft.steps.find((step) => step.id === selectedStepId);
  const catalog = catalogApi.data;
  const live = normalizeStatus(draft.status) === "on";
  const updateDraft = (next: WorkflowRecord) => { setDraftHistory((current) => [...current.slice(-19), draft]); setDraftFuture([]); setDraft(next); setSaveState("Unsaved changes"); };
  function undoDraft() {
    const previous = draftHistory[draftHistory.length - 1];
    if (!previous) return;
    setDraftFuture((current) => [draft, ...current]);
    setDraft(previous);
    setDraftHistory((current) => current.slice(0, -1));
    setSaveState("Unsaved changes");
  }
  function redoDraft() {
    const next = draftFuture[0];
    if (!next) return;
    setDraftHistory((current) => [...current, draft]);
    setDraft(next);
    setDraftFuture((current) => current.slice(1));
    setSaveState("Unsaved changes");
  }

  async function saveDraft(next = draft, silent = false) {
    if (isNew || !next.name.trim()) return false;
    if (isDemoWorkflow) { setSaveState("Saved · demo"); lastSavedRef.current = JSON.stringify(next); if (!silent) toast.success("Demo workflow draft saved"); return true; }
    setSaveState("Saving…");
    const payload = { name: next.name, description: next.description, scope: "business", trigger: next.trigger, steps: next.steps, actions: next.steps.map((step) => ({ id: step.id, type: step.type, module: step.module, action: step.action, title: step.title, config: step.config, disabled: step.disabled })), goal: next.goal, settings: next.settings, folderId: next.folderId };
    try {
      if (draftEndpointRef.current) {
        await api("/business/automations/" + id + "/draft", { method: "PATCH", body: JSON.stringify(payload) });
      } else throw new Error("draft endpoint unavailable");
      setSaveState("Saved");
      lastSavedRef.current = JSON.stringify(next);
      if (!silent) toast.success("Draft saved");
      return true;
    } catch {
      draftEndpointRef.current = false;
      try {
        await api("/business/automations/" + id, { method: "PATCH", body: JSON.stringify({ name: next.name, description: next.description, trigger: next.trigger, actions: payload.actions, requiresApproval: hasApproval(next) }) });
        setSaveState("Saved · legacy workflow endpoint");
        if (!silent) toast.success("Draft saved");
        return true;
      } catch (error) {
        setSaveState("Draft endpoint unavailable");
        if (!silent) toast.error(message(error));
        return false;
      }
    }
  }

  React.useEffect(() => {
    if (!editing || !hydrated || isNew || !draft.steps.length && !draft.description && draft.name === "Untitled workflow") return;
    const serialized = JSON.stringify(draft);
    if (serialized === lastSavedRef.current) return;
    const timer = window.setTimeout(() => { void saveDraft(draft, true); }, 900);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, editing, hydrated]);

  async function publish() {
    if (isNew) { toast.info("Save the workflow draft before publishing."); return; }
    if (!draft.steps.length && !draft.trigger.type) { toast.error("Add a trigger before publishing."); return; }
    if (isDemoWorkflow) { setDraft((current) => ({ ...current, status: "active", liveVersion: (current.liveVersion ?? 0) + 1 })); setSaveState("Published · demo"); setReviewOpen(false); setEditing(false); toast.success("Demo workflow published"); return; }
    try {
      await saveDraft(draft, true);
      await api("/business/automations/" + id + "/publish", { method: "POST", body: JSON.stringify({ changeNote: changeNote.trim() || "Published from Janus workflow editor" }) });
      toast.success("Workflow published");
      setReviewOpen(false);
      setEditing(false);
      workflowApi.reload();
    } catch (error) { toast.error(message(error)); }
  }

  async function testWorkflow(stepId?: string) {
    if (isNew) { toast.info("Save the workflow before testing it."); return; }
    if (isDemoWorkflow) { setTestOutput({ dryRun: true, status: "passed", workflow: draft.name, stepId: stepId ?? "all", preview: "No messages sent and no records changed.", side_effects: false }); toast.success("Demo dry run completed"); return; }
    try {
      const result = await api<Record<string, unknown>>("/business/automations/" + id + "/test", { method: "POST", body: JSON.stringify({ stepId, dryRun: true }) });
      setTestOutput(result);
      toast.success("Dry run completed");
    } catch (error) { toast.error("Dry-run endpoint unavailable: " + message(error)); }
  }

  async function toggle() {
    if (isNew) return;
    const next = live ? "off" : "on";
    if (next === "on" && hasOutboundMessage(draft) && !window.confirm("This workflow can send customer messages. Turn it on?")) return;
    if (isDemoWorkflow) { setDraft((current) => ({ ...current, status: next === "on" ? "active" : "paused" })); setSaveState("Saved · demo"); toast.success(next === "on" ? "Demo workflow turned on" : "Demo workflow turned off"); return; }
    try {
      await api("/business/automations/" + id + "/" + next, { method: "POST" });
      workflowApi.reload();
      toast.success(next === "on" ? "Workflow turned on" : "Workflow turned off");
    } catch {
      try { await api("/business/automations/" + id, { method: "PATCH", body: JSON.stringify({ status: next === "on" ? "active" : "paused" }) }); workflowApi.reload(); toast.success("Workflow status updated"); }
      catch (error) { toast.error(message(error)); }
    }
  }

  async function archive() {
    if (isNew || !window.confirm("Archive this workflow? Run history will be kept for audit.")) return;
    if (isDemoWorkflow) { toast.success("Demo workflow archived"); router.push("/automations?workspace=business"); return; }
    try { await api("/business/automations/" + id, { method: "DELETE" }); toast.success("Workflow archived"); router.push("/automations?workspace=business"); }
    catch (error) { toast.error(message(error)); }
  }

  async function duplicate() {
    if (isDemoWorkflow) { toast.success("Demo workflow duplicated as a draft"); router.push("/automations?workspace=business"); return; }
    try {
      const created = await api<WorkflowRecord>("/business/automations", { method: "POST", body: JSON.stringify({ name: draft.name + " copy", description: draft.description, scope: "business", trigger: draft.trigger, steps: draft.steps, actions: draft.steps, requiresApproval: hasApproval(draft) }) });
      toast.success("Workflow duplicated");
      router.push("/automations/" + created.id + "?workspace=business&mode=edit");
    } catch (error) { toast.error(message(error)); }
  }

  function selectTab(value: PageTab) { router.replace("/automations/" + id + "?workspace=business&tab=" + value + (editing ? "&mode=edit" : "")); }
  function enterEdit() { setEditing(true); router.replace("/automations/" + id + "?workspace=business&tab=editor&mode=edit"); }
  function updateStep(stepId: string, patch: Partial<BusinessWorkflowStep>) { updateDraft({ ...draft, steps: draft.steps.map((step) => step.id === stepId ? { ...step, ...patch } : step) }); }
  function addStep(kind: string, module?: string, action?: string) {
    const step: BusinessWorkflowStep = { id: "step-" + Date.now(), type: kind, module, action: action ?? kind, title: action === "workspace_data" ? moduleLabel(module ?? "workspace") + " data" : action ? action.replaceAll("_", " ") : kind, config: { ...(action === "workspace_data" ? { workspace: module, operation: "read_records" } : {}) }, disabled: false };
    const next = { ...draft, steps: [...draft.steps, step] };
    updateDraft(next); setSelectedStepId(step.id); setPanelTab("setup");
  }
  function removeStep(stepId: string) {
    if (!window.confirm("Delete this step? Later steps that use its data may need to be reconfigured.")) return;
    updateDraft({ ...draft, steps: draft.steps.filter((step) => step.id !== stepId) });
    setSelectedStepId("trigger");
  }
  function moveStep(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= draft.steps.length) return;
    const steps = [...draft.steps]; [steps[index], steps[target]] = [steps[target], steps[index]];
    updateDraft({ ...draft, steps });
  }

  if ((workflowApi.loading || workflowListApi.loading) && !hydrated) return <div className="px-6 py-8 text-sm text-muted-foreground">Loading workflow…</div>;
  if (workflowApi.error && !isNew && !isDemoWorkflow && !workflowApi.data && !workflowListApi.data?.some((item) => String(item.id) === id)) return <Unavailable title="Workflow details unavailable" text={workflowApi.error} action="GET /business/automations/:id or GET /business/automations" />;
  if (!hydrated) return null;

  return <div className="mx-auto flex max-w-[1500px] flex-col">
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 px-5 py-4 backdrop-blur sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><Link href="/automations?workspace=business" className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" />Business Management / Workflows{draft.folderId ? " / " + draft.folderId : ""}</Link>{editing ? <div className="flex items-center gap-2"><Input value={draft.name} onChange={(e) => updateDraft({ ...draft, name: e.target.value })} className="h-9 max-w-[420px] text-lg font-semibold" aria-label="Workflow name" /><Badge variant="outline">Draft</Badge></div> : <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-semibold">{draft.name}</h1><StatusBadge status={draft.status} /></div>}<p className="mt-1 text-xs text-muted-foreground">Business scope · {draft.ownerId ?? "Owner not returned"} · {draft.liveVersion ? "v" + draft.liveVersion : "Unpublished draft"}{draft.updatedAt ? " · Updated " + formatDate(draft.updatedAt) : ""}</p></div><div className="flex flex-wrap items-center gap-2">{editing && <><Button size="icon" variant="ghost" aria-label="Undo draft change" title="Undo draft change" disabled={!draftHistory.length} onClick={undoDraft}><Undo2 className="size-4" /></Button><Button size="icon" variant="ghost" aria-label="Redo draft change" title="Redo draft change" disabled={!draftFuture.length} onClick={redoDraft}><Redo2 className="size-4" /></Button></>}{!isNew && <Button size="sm" variant="secondary" onClick={() => void testWorkflow()}><FlaskConical className="size-3.5" />Test workflow</Button>}{!editing && <Button size="sm" variant="secondary" onClick={enterEdit}><Pencil className="size-3.5" />Edit</Button>}{editing && <Button size="sm" variant="secondary" onClick={() => void saveDraft()} disabled={saveState === "Saving…"}><Save className="size-3.5" />Save draft</Button>}{editing ? <Button size="sm" onClick={() => setReviewOpen(true)} disabled={isNew}><Check className="size-3.5" />Review & publish</Button> : <Button size="sm" variant={live ? "secondary" : "default"} onClick={() => void toggle()} disabled={isNew}>{live ? "Turn off" : "Turn on"}</Button>}<Button size="icon" variant="ghost" aria-label="Workflow actions" onClick={() => setMoreOpen((value) => !value)}><MoreHorizontal className="size-4" /></Button></div></div>
      {moreOpen && <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3"><Button size="sm" variant="ghost" onClick={() => setCopyOpen(true)}><Copy className="size-3.5" />Copy to workspace</Button><Button size="sm" variant="ghost" onClick={duplicate}><Copy className="size-3.5" />Duplicate</Button><Button size="sm" variant="ghost" onClick={() => navigator.clipboard?.writeText(JSON.stringify(draft, null, 2)).then(() => toast.success("Workflow JSON copied"))}><Download className="size-3.5" />Export JSON</Button><Button size="sm" variant="ghost" onClick={archive}><Trash2 className="size-3.5" />Archive</Button><Button size="sm" variant="ghost" disabled><X className="size-3.5" />Delete after archive</Button></div>}
    </header>
    {editing && !isNew && <div className="mx-5 mt-4 flex flex-wrap items-center justify-between gap-3 border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:mx-6"><span><strong>Editing a draft.</strong> Version {draft.liveVersion ?? "live"} keeps running until you publish. {draft.steps.length} step{draft.steps.length === 1 ? "" : "s"} configured.</span><Button size="sm" variant="secondary" onClick={() => { workflowApi.reload(); setEditing(false); }}>Discard draft</Button></div>}
    {!editing && live && <div className="mx-5 mt-4 flex flex-wrap items-center justify-between gap-3 border border-sky-300/70 bg-sky-50 px-4 py-3 text-sm text-sky-900 sm:mx-6"><span>This workflow is On. Editing creates a draft; the live version keeps running until you publish.</span><Button size="sm" variant="secondary" onClick={enterEdit}>Edit workflow</Button></div>}
    <div role="tablist" aria-label="Workflow sections" className="janus-tab-strip sticky top-0 z-20 mx-5 mt-4 flex gap-1 overflow-x-auto bg-[#f5f3ee] p-1 sm:mx-6">{pageTabs.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => selectTab(key)} className={"shrink-0 px-3 py-2 text-xs " + (tab === key ? "bg-white font-medium shadow-sm" : "text-muted-foreground hover:bg-white/70")}>{label}</button>)}</div>
    <div className="px-5 py-5 sm:px-6">{tab === "editor" && <EditorSurface editing={editing} workflow={draft} selectedStepId={selectedStepId} selectedStep={selectedStep} panelTab={panelTab} setPanelTab={setPanelTab} catalog={catalog} catalogError={catalogApi.error} onSelect={setSelectedStepId} onAdd={addStep} onRemove={removeStep} onMove={moveStep} onUpdate={updateStep} onTrigger={(trigger) => updateDraft({ ...draft, trigger })} onTest={testWorkflow} testOutput={testOutput} saveState={saveState} />}{tab === "runs" && <RunsTab api={runsApi} />}{tab === "versions" && <VersionsTab api={versionsApi} />}{tab === "settings" && <SettingsTab workflow={draft} onChange={updateDraft} onSave={() => void saveDraft()} />}</div>
    <Dialog open={reviewOpen} onOpenChange={setReviewOpen}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Review and publish</DialogTitle><DialogDescription>Review the draft before it becomes the live version. Existing enrollments keep running the current version until you publish.</DialogDescription></DialogHeader><div className="grid gap-3 text-sm"><div className="flex items-start gap-2 border border-border bg-surface-2 p-3"><Check className="mt-0.5 size-4 text-success" /><span>{draft.steps.length} workflow step{draft.steps.length === 1 ? "" : "s"} configured</span></div>{!draft.trigger.type && <div className="flex items-start gap-2 border border-danger/30 bg-danger/5 p-3 text-danger"><AlertTriangle className="mt-0.5 size-4" /><span>Add a trigger before publishing.</span></div>}{!draft.goal && <div className="flex items-start gap-2 border border-amber-300/70 bg-amber-50 p-3 text-amber-900"><AlertTriangle className="mt-0.5 size-4" /><span>No goal or exit condition is configured. Long-running workflows may need a stop rule.</span></div>}<Field label="Change note" id="workflow-change-note"><Input id="workflow-change-note" value={changeNote} onChange={(event) => setChangeNote(event.target.value)} placeholder="What changed in this version?" /></Field><p className="text-xs text-muted-foreground">Enrollment preview is unavailable until the preview endpoint is connected.</p></div><DialogFooter><Button variant="secondary" onClick={() => setReviewOpen(false)}>Keep editing</Button><Button onClick={publish} disabled={!draft.trigger.type || !draft.steps.length}>Publish version</Button></DialogFooter></DialogContent></Dialog><WorkspaceCopyDialog open={copyOpen} onOpenChange={setCopyOpen} itemName={draft.name} itemKind="workflow" onCopied={(target) => { const label = workspaceCopyOptions.find(([key]) => key === target)?.[1] ?? target; toast.success(`${draft.name} copied to ${label} as a draft`); }} />
  </div>;
}

function EditorSurface({ editing, workflow, selectedStepId, selectedStep, panelTab, setPanelTab, catalog, catalogError, onSelect, onAdd, onRemove, onMove, onUpdate, onTrigger, onTest, testOutput, saveState }: { editing: boolean; workflow: WorkflowRecord; selectedStepId: string; selectedStep?: BusinessWorkflowStep; panelTab: "setup" | "configure" | "test"; setPanelTab: (value: "setup" | "configure" | "test") => void; catalog?: BusinessAutomationCatalog; catalogError?: string; onSelect: (id: string) => void; onAdd: (kind: string, module?: string, action?: string) => void; onRemove: (id: string) => void; onMove: (index: number, direction: -1 | 1) => void; onUpdate: (id: string, patch: Partial<BusinessWorkflowStep>) => void; onTrigger: (trigger: Record<string, unknown>) => void; onTest: (stepId?: string) => void; testOutput: Record<string, unknown> | null; saveState: string }) {
  const [zoom, setZoom] = React.useState(100);
  const [dragging, setDragging] = React.useState(false);
  const addDroppedNode = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    try {
      const node = JSON.parse(event.dataTransfer.getData("application/x-janus-node")) as { kind: string; module?: string; action?: string };
      onAdd(node.kind, node.module, node.action);
    } catch {
      // Ignore drops that did not originate from the node palette.
    }
  };
  return <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_390px]">
    <NodePalette editing={editing} onAdd={onAdd} />
    <div className="min-w-0 border border-border bg-surface-2 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Flow canvas</p><p className="mt-1 text-xs text-muted-foreground">{editing ? "Drag nodes from the left or use the plus buttons." : "Read-only live flow. Select a node to inspect it."}</p></div>
        <div className="flex items-center gap-3"><span className="flex items-center gap-1 text-xs text-muted-foreground"><span className={"size-2 rounded-full " + (saveState === "Saved" ? "bg-success" : "bg-warning")} />{saveState}</span><div className="flex items-center border border-border bg-surface"><button type="button" className="px-2 py-1 text-xs hover:bg-surface-2" onClick={() => setZoom((value) => Math.max(70, value - 10))} aria-label="Zoom out">−</button><span className="min-w-12 px-2 text-center text-[11px] tabular-nums">{zoom}%</span><button type="button" className="px-2 py-1 text-xs hover:bg-surface-2" onClick={() => setZoom((value) => Math.min(130, value + 10))} aria-label="Zoom in">+</button><button type="button" className="border-l border-border px-2 py-1 text-[11px] hover:bg-surface-2" onClick={() => setZoom(100)}>Fit</button></div></div>
      </div>
      <div onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={addDroppedNode} className={("min-h-[620px] overflow-auto border p-4 transition-colors bg-[radial-gradient(circle_at_1px_1px,rgba(10,20,36,0.14)_1px,transparent_0)] [background-size:18px_18px] " + (dragging ? "border-accent bg-accent-muted/40" : "border-border/70"))}>
        <div className="mx-auto min-w-0" style={{ transform: "scale(" + zoom / 100 + ")", transformOrigin: "top left" }}>
          {workflow.steps.length === 0 ? <div className="mx-auto flex max-w-[260px] flex-col items-center"><StepCard compact step={{ id: "trigger", type: "trigger", title: "Trigger", config: {}, disabled: false }} selected={selectedStepId === "trigger"} editing={editing} index={-1} summary={triggerText(workflow.trigger)} onSelect={() => onSelect("trigger")} onSettings={() => { onSelect("trigger"); setPanelTab("setup"); }} onRemove={() => undefined} onMove={() => undefined} /><div className="my-4 h-6 w-px bg-border-strong" /><div className="w-full border border-dashed border-accent/40 bg-accent-muted p-4 text-center"><p className="text-sm font-semibold">Drop a node here</p><p className="mt-1 text-xs text-muted-foreground">Choose a workspace node or logic node from the left.</p></div></div> : <div className="flex min-w-max items-center gap-2 overflow-x-auto pb-4"><StepCard compact step={{ id: "trigger", type: "trigger", title: "Trigger", config: {}, disabled: false }} selected={selectedStepId === "trigger"} editing={editing} index={-1} summary={triggerText(workflow.trigger)} onSelect={() => onSelect("trigger")} onSettings={() => { onSelect("trigger"); setPanelTab("setup"); }} onRemove={() => undefined} onMove={() => undefined} />{workflow.steps.map((step, index) => <React.Fragment key={step.id}><div className="flex shrink-0 items-center gap-1.5"><div className="h-px w-5 bg-border-strong" /><button type="button" className="flex size-6 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40" disabled={!editing} onClick={() => onAdd("action")} aria-label="Add node between steps"><Plus className="size-3" /></button><div className="h-px w-5 bg-border-strong" /></div><StepCard compact step={step} selected={selectedStepId === step.id} editing={editing} index={index} summary={stepSummary(step)} onSelect={() => onSelect(step.id)} onSettings={() => { onSelect(step.id); setPanelTab("setup"); }} onRemove={() => onRemove(step.id)} onMove={(direction) => onMove(index, direction)} /></React.Fragment>)}<div className="h-px w-5 shrink-0 bg-border-strong" /><span className="shrink-0 rounded-full border border-border bg-surface px-3 py-1 text-[10px] text-muted-foreground">End</span></div>}
          <div className="mt-5 flex justify-center">{editing ? <ActionPicker catalog={catalog} catalogError={catalogError} onAdd={onAdd} /> : <span className="text-xs text-muted-foreground">No more steps</span>}</div><div className="mt-4 border border-dashed border-accent/50 bg-accent-muted p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-accent">Goal & exit condition</p><p className="mt-1 text-xs text-muted-foreground">{workflow.goal ? JSON.stringify(workflow.goal) : "No exit condition configured."}</p></div>
        </div>
      </div>
    </div>
    <StepPanel editing={editing} workflow={workflow} selectedStepId={selectedStepId} selectedStep={selectedStep} panelTab={panelTab} setPanelTab={setPanelTab} catalog={catalog} catalogError={catalogError} onUpdate={onUpdate} onTrigger={onTrigger} onTest={onTest} testOutput={testOutput} />
  </div>;
}

const paletteNodes = [
  { group: "Logic", nodes: [{ label: "Condition", kind: "if", action: "condition" }, { label: "Request approval", kind: "action", action: "approval" }] },
  { group: "Workspace data", nodes: [{ label: "CRM & Sales", kind: "workspace_data", module: "crm_sales", action: "workspace_data" }, { label: "Finance & Accounting", kind: "workspace_data", module: "finance_accounting", action: "workspace_data" }, { label: "HR & People", kind: "workspace_data", module: "hr_people", action: "workspace_data" }, { label: "Projects & Delivery", kind: "workspace_data", module: "projects_delivery", action: "workspace_data" }, { label: "Customer Support", kind: "workspace_data", module: "customer_support", action: "workspace_data" }, { label: "Operations & Inventory", kind: "workspace_data", module: "operations_inventory", action: "workspace_data" }, { label: "IT & Infrastructure", kind: "workspace_data", module: "it_infrastructure", action: "workspace_data" }] },
  { group: "Actions", nodes: [{ label: "Create task", kind: "action", module: "crm_sales", action: "create_task" }, { label: "Update record", kind: "action", module: "crm_sales", action: "update_record" }, { label: "Send notification", kind: "action", module: "communication", action: "send_notification" }] },
];

function NodePalette({ editing, onAdd }: { editing: boolean; onAdd: (kind: string, module?: string, action?: string) => void }) {
  const add = (node: { kind: string; module?: string; action?: string }) => onAdd(node.kind, node.module, node.action);
  return <aside className="min-w-0 h-fit border border-border bg-surface p-3 lg:sticky lg:top-24"><div className="mb-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Nodes</p><p className="mt-1 text-xs text-muted-foreground">Drag into the flow or click to add.</p></div><div className="grid gap-4">{paletteNodes.map((group) => <div key={group.group}><p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{group.group}</p><div className="grid gap-1">{group.nodes.map((node) => <button key={node.label} type="button" draggable={editing} disabled={!editing} onClick={() => add(node)} onDragStart={(event) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData("application/x-janus-node", JSON.stringify(node)); }} className="flex min-w-0 cursor-grab items-center gap-2 border border-border bg-surface-2 px-2.5 py-2 text-left text-xs hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"><span className="size-2 shrink-0 rounded-full bg-accent" /><span className="truncate">{node.label}</span></button>)}</div></div>)}</div></aside>;
}

function StepCard({ step, selected, editing, index, summary, onSelect, onSettings, onRemove, onMove, compact = false }: { step: BusinessWorkflowStep; selected: boolean; editing: boolean; index: number; summary: string; onSelect: () => void; onSettings?: () => void; onRemove: () => void; onMove: (direction: -1 | 1) => void; compact?: boolean }) {
  const isTrigger = step.type === "trigger";
  return <div role="button" tabIndex={0} onClick={onSelect} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect(); }} className={(compact ? "relative w-[220px] shrink-0 p-2.5 " : "relative w-full p-3 ") + "border bg-surface text-left " + (selected ? "border-accent ring-2 ring-accent/20" : "border-border hover:border-border-strong")}>
    <div className="flex min-w-0 items-start gap-2 pr-20">
      <div className={"flex size-7 shrink-0 items-center justify-center " + (isTrigger ? "bg-accent-muted text-accent" : "bg-surface-2 text-muted-foreground")}>{isTrigger ? <Play className="size-3.5" /> : <ChevronDown className="size-3.5" />}</div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1"><span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{isTrigger ? "Trigger" : "Step " + (index + 1)}</span>{step.module && <Badge variant="outline" className="max-w-[112px] truncate px-1.5 py-0 text-[9px]">{moduleLabel(step.module)}</Badge>}{step.disabled && <Badge variant="neutral" className="px-1.5 py-0 text-[9px]">Disabled</Badge>}</div>
        <p className="mt-0.5 truncate text-xs font-semibold">{step.title}</p><p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{summary}</p>{typeof step.config.error === "string" && <p className="mt-1.5 flex items-center gap-1 text-[11px] text-danger"><AlertCircle className="size-3" />{step.config.error}</p>}
      </div>
    </div>
    {editing && <div className="absolute right-2 top-2 flex items-center gap-0.5" onClick={(event) => event.stopPropagation()}><Button size="icon" variant="ghost" className="size-6" aria-label="Open node settings" title="Open node settings" onClick={onSettings ?? onSelect}><Settings2 className="size-3" /></Button>{!isTrigger && <><Button size="icon" variant="ghost" className="size-6" aria-label="Move step up" onClick={() => onMove(-1)}><ArrowUp className="size-3" /></Button><Button size="icon" variant="ghost" className="size-6" aria-label="Move step down" onClick={() => onMove(1)}><ArrowDown className="size-3" /></Button><Button size="icon" variant="ghost" className="size-6" aria-label="Delete step" onClick={onRemove}><Trash2 className="size-3" /></Button></>}</div>}
    {step.type === "if" && <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px]"><div className="border border-success/30 bg-success/5 p-1.5">Yes branch</div><div className="border border-border bg-surface-2 p-1.5">None matched</div></div>}
  </div>;
}

const coreNodeActions = [
  { type: "condition", label: "Condition", module: "logic" },
  { type: "approval", label: "Request approval", module: "business" },
  { type: "create_task", label: "Create task", module: "crm_sales" },
  { type: "update_record", label: "Update record", module: "crm_sales" },
  { type: "send_notification", label: "Send notification", module: "communication" },
];

const fallbackConnectedModules = [
  { id: "crm_sales", label: "CRM & Sales", connected: true },
  { id: "hr_people", label: "HR & People", connected: true },
  { id: "finance_accounting", label: "Finance & Accounting", connected: true },
  { id: "projects_delivery", label: "Projects & Delivery", connected: true },
  { id: "customer_support", label: "Customer Support & Success", connected: true },
  { id: "operations_inventory", label: "Operations & Inventory", connected: true },
  { id: "it_infrastructure", label: "IT & Infrastructure", connected: true },
];

const fallbackStepActions = [
  { type: "workspace_data", label: "Use workspace data" },
  { type: "condition", label: "Condition" },
  { type: "approval", label: "Request approval" },
  { type: "create_task", label: "Create task" },
  { type: "update_record", label: "Update record" },
  { type: "send_notification", label: "Send notification" },
];

function ActionPicker({ catalog, catalogError, onAdd }: { catalog?: BusinessAutomationCatalog; catalogError?: string; onAdd: (kind: string, module?: string, action?: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const actions = catalog?.actions?.length ? catalog.actions : coreNodeActions;
  return <div className="relative">{open && <div className="absolute bottom-11 left-1/2 z-20 w-[340px] -translate-x-1/2 border border-border bg-surface p-3 shadow-lg"><p className="text-xs font-semibold">Add a node</p>{catalogError && <p className="mt-2 border border-amber-300/70 bg-amber-50 p-2 text-[11px] text-amber-800">Live action catalog unavailable. Core node types are available while the catalog reconnects.</p>}<div className="mt-2 grid gap-1">{actions.map((action, index) => { const raw = action as Record<string, unknown>; const actionType = String(raw.type ?? raw.action ?? "action-" + index); const moduleName = typeof raw.module === "string" ? raw.module : undefined; const catalogModule = catalog?.modules?.find((item) => item.id === moduleName); const connected = !catalog || !catalogModule || (raw.connected !== false && catalogModule.connected !== false); return <button key={actionType + index} type="button" disabled={!connected} onClick={() => { onAdd(actionType === "condition" ? "if" : "action", moduleName, actionType); setOpen(false); }} className="flex items-start justify-between border border-border p-2 text-left text-xs hover:border-accent disabled:cursor-not-allowed disabled:opacity-45"><span><span className="block font-medium">{String(raw.label ?? actionType).replaceAll("_", " ")}</span><span className="text-[10px] text-muted-foreground">{connected ? moduleLabel(moduleName ?? "business") : "Connect " + moduleLabel(moduleName ?? "module") + " first"}</span></span>{connected ? <Plus className="size-3.5" /> : <Lock className="size-3.5" />}</button>; })}</div></div>}<Button variant="secondary" size="sm" onClick={() => setOpen((value) => !value)}><Plus className="size-3.5" />Add node</Button></div>;
}

function StepPanel({ editing, workflow, selectedStepId, selectedStep, panelTab, setPanelTab, catalog, catalogError, onUpdate, onTrigger, onTest, testOutput }: { editing: boolean; workflow: WorkflowRecord; selectedStepId: string; selectedStep?: BusinessWorkflowStep; panelTab: "setup" | "configure" | "test"; setPanelTab: (value: "setup" | "configure" | "test") => void; catalog?: BusinessAutomationCatalog; catalogError?: string; onUpdate: (id: string, patch: Partial<BusinessWorkflowStep>) => void; onTrigger: (trigger: Record<string, unknown>) => void; onTest: (stepId?: string) => void; testOutput: Record<string, unknown> | null }) {
  const isTrigger = selectedStepId === "trigger";
  return <aside className="min-w-0 h-fit border border-border bg-surface lg:sticky lg:top-24"><div className="border-b border-border p-4"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Selected step</p><h2 className="mt-1 truncate text-sm font-semibold">{isTrigger ? "Workflow trigger" : selectedStep?.title ?? "Select a step"}</h2></div><div className="flex border-b border-border">{(["setup", "configure", "test"] as const).map((key) => <button key={key} type="button" onClick={() => setPanelTab(key)} className={"min-w-0 flex-1 px-3 py-2 text-xs " + (panelTab === key ? "border-b-2 border-accent font-medium" : "text-muted-foreground")}>{key[0].toUpperCase() + key.slice(1)}</button>)}</div><div className="min-w-0 p-4">{panelTab === "setup" && <SetupPanel editing={editing} isTrigger={isTrigger} step={selectedStep} trigger={workflow.trigger} catalog={catalog} catalogError={catalogError} onUpdate={onUpdate} onTrigger={onTrigger} />}{panelTab === "configure" && <ConfigurePanel editing={editing} step={selectedStep} onUpdate={onUpdate} workflow={workflow} />}{panelTab === "test" && <TestPanel step={selectedStep} onTest={onTest} output={testOutput} />}</div></aside>;
}

function SetupPanel({ editing, isTrigger, step, trigger, catalog, catalogError, onUpdate, onTrigger }: { editing: boolean; isTrigger: boolean; step?: BusinessWorkflowStep; trigger: Record<string, unknown>; catalog?: BusinessAutomationCatalog; catalogError?: string; onUpdate: (id: string, patch: Partial<BusinessWorkflowStep>) => void; onTrigger: (trigger: Record<string, unknown>) => void }) {
  if (isTrigger) return <div className="grid gap-4"><Field label="Trigger type" id="trigger-type"><select disabled={!editing} id="trigger-type" value={String(trigger.type ?? "manual")} onChange={(e) => onTrigger({ ...trigger, type: e.target.value })} className="h-9 w-full border border-input bg-surface px-3 text-sm"><option value="record_event">Record event</option><option value="schedule">Scheduled</option><option value="app_event">App event</option><option value="incoming_webhook">Incoming webhook</option><option value="manual">Manual</option></select></Field><Field label="Module / record type" id="trigger-module"><Input disabled={!editing} id="trigger-module" value={String(trigger.module ?? "")} onChange={(e) => onTrigger({ ...trigger, module: e.target.value })} placeholder="Only connected modules can be selected" /></Field><label className="flex items-center gap-2 text-xs"><Checkbox disabled={!editing} checked={Boolean(trigger.reEnrollment)} onCheckedChange={(value) => onTrigger({ ...trigger, reEnrollment: value === true })} />Allow re-enrollment</label><label className="flex items-center gap-2 text-xs"><Checkbox disabled={!editing} checked={Boolean(trigger.enrollExisting)} onCheckedChange={(value) => onTrigger({ ...trigger, enrollExisting: value === true })} />Enroll existing matching records</label>{catalogError && <p className="text-xs text-amber-700">Connected trigger catalog unavailable: {catalogError}</p>}</div>;
  if (!step) return <p className="text-xs text-muted-foreground">Select the trigger or a step on the canvas.</p>;
  const modules = catalog?.modules?.length ? catalog.modules : fallbackConnectedModules;
  const options = catalog?.actions?.length ? catalog.actions.filter((item) => !item.module || item.module === step.module) : fallbackStepActions;
  const isWorkspaceData = step.action === "workspace_data" || step.type === "workspace_data";
  const isApproval = ["approval", "request_approval", "require_approval"].includes(step.action ?? "");
  return <div className="grid gap-4"><Field label="Module" id="step-module"><select disabled={!editing} id="step-module" value={step.module ?? ""} onChange={(e) => onUpdate(step.id, { module: e.target.value })} className="h-9 w-full border border-input bg-surface px-3 text-sm"><option value="">Select connected module</option>{modules.map((item) => <option key={item.id} value={item.id} disabled={!item.connected}>{item.connected ? item.label : "Connect " + item.label + " first"}</option>)}</select></Field><Field label="Action type" id="step-action"><select disabled={!editing} id="step-action" value={step.action ?? ""} onChange={(e) => onUpdate(step.id, { action: e.target.value, title: e.target.value.replaceAll("_", " ") })} className="h-9 w-full border border-input bg-surface px-3 text-sm"><option value="">Select action from catalog</option>{options.map((item, index) => { const raw = item as { type?: unknown; action?: unknown; label?: unknown }; const value = String(raw.type ?? raw.action ?? ""); return <option key={value || String(index)} value={value}>{String(raw.label ?? raw.type ?? raw.action)}</option>; })}</select></Field>{catalogError && <p className="-mt-2 text-[11px] text-amber-700">Showing core options while the connected catalog reconnects.</p>}<Field label="Step title" id="step-title"><Input disabled={!editing} id="step-title" value={step.title} onChange={(e) => onUpdate(step.id, { title: e.target.value })} /></Field>{isWorkspaceData && <div className="grid gap-3 border border-accent/30 bg-accent-muted p-3 text-xs"><p className="font-semibold">Workspace data</p><Field label="Workspace" id="workspace-data-module"><select disabled={!editing} id="workspace-data-module" value={step.module ?? "crm_sales"} onChange={(e) => onUpdate(step.id, { module: e.target.value, config: { ...step.config, workspace: e.target.value } })} className="h-8 w-full border border-input bg-surface px-2 text-xs"><option value="crm_sales">CRM & Sales</option><option value="hr_people">HR & People</option><option value="finance_accounting">Finance & Accounting</option><option value="projects_delivery">Projects & Delivery</option><option value="customer_support">Customer Support & Success</option><option value="operations_inventory">Operations & Inventory</option><option value="it_infrastructure">IT & Infrastructure</option></select></Field><Field label="What to do" id="workspace-data-operation"><select disabled={!editing} id="workspace-data-operation" value={String(step.config.operation ?? "read_records")} onChange={(e) => onUpdate(step.id, { config: { ...step.config, operation: e.target.value } })} className="h-8 w-full border border-input bg-surface px-2 text-xs"><option value="read_records">Read matching records</option><option value="find_risk">Find risks or overdue work</option><option value="create_task">Create a follow-up task</option></select></Field><p className="text-[10px] text-muted-foreground">Workspace access is checked when the workflow runs.</p></div>}{isApproval && <div className="grid gap-3 border border-amber-300/70 bg-amber-50 p-3 text-xs text-amber-950"><div className="flex items-start gap-2"><Lock className="mt-0.5 size-3.5 shrink-0" /><span><strong>Sensitive action approval</strong><br />This step pauses execution until an authorized approver responds.</span></div><div><p className="font-medium">Approver</p><Badge className="mt-1" variant="outline">Business owner</Badge><p className="mt-1 text-[10px] text-amber-800">Role and workspace permissions are resolved by the connected approvals service.</p></div><Field label="Reminder after" id="approval-reminder"><select disabled={!editing} id="approval-reminder" value={String(step.config.reminderAfter ?? "24h")} onChange={(e) => onUpdate(step.id, { config: { ...step.config, reminderAfter: e.target.value } })} className="h-8 w-full border border-input bg-surface px-2 text-xs"><option value="4h">4 hours</option><option value="24h">24 hours</option><option value="48h">48 hours</option></select></Field></div>}<label className="flex items-center gap-2 text-xs"><Checkbox disabled={!editing} checked={step.disabled === true} onCheckedChange={(value) => onUpdate(step.id, { disabled: value === true })} />Disable this step</label></div>;
}

function ConfigurePanel({ editing, step, onUpdate, workflow }: { editing: boolean; step?: BusinessWorkflowStep; onUpdate: (id: string, patch: Partial<BusinessWorkflowStep>) => void; workflow: WorkflowRecord }) {
  if (!step) return <p className="text-xs text-muted-foreground">Select a step to configure it.</p>;
  const configText = JSON.stringify(step.config ?? {}, null, 2);
  const tokens = ["Trigger › module", "Trigger › record ID", ...workflow.steps.slice(0, workflow.steps.findIndex((item) => item.id === step.id)).map((item, index) => "Step " + (index + 1) + " › output")];
  return <div className="grid gap-4"><Field label="Step configuration JSON" id="step-config"><Textarea disabled={!editing} id="step-config" value={configText} onChange={(e) => { try { onUpdate(step.id, { config: JSON.parse(e.target.value) }); } catch { onUpdate(step.id, { config: { ...step.config, error: "Configuration JSON is incomplete" } }); } }} className="min-h-40 font-mono text-xs" /></Field><div><p className="text-xs font-medium">Insert data</p><div className="mt-2 flex flex-wrap gap-1">{tokens.map((token) => <button key={token} type="button" disabled={!editing} onClick={() => onUpdate(step.id, { config: { ...step.config, token } })} className="border border-border bg-surface-2 px-2 py-1 text-[10px] text-muted-foreground hover:border-accent hover:text-foreground">[{token}]</button>)}</div><p className="mt-2 text-[10px] text-muted-foreground">Tokens resolve against the trigger or earlier step output. Sample values appear after a dry run.</p></div></div>;
}

function TestPanel({ step, onTest, output }: { step?: BusinessWorkflowStep; onTest: (stepId?: string) => void; output: Record<string, unknown> | null }) {
  return <div className="grid gap-4"><p className="text-xs text-muted-foreground">Run this step with test data. Dry runs never send messages or change records.</p><Button size="sm" variant="secondary" onClick={() => onTest(step?.id)} disabled={!step}><FlaskConical className="size-3.5" />Test this step</Button>{output ? <pre className="max-h-72 overflow-auto border border-border bg-surface-2 p-3 text-[10px]">{JSON.stringify(output, null, 2)}</pre> : <p className="text-xs text-muted-foreground">No test result returned.</p>}</div>;
}

function RunsTab({ api }: { api: ReturnType<typeof useApi<BusinessWorkflowRun[]>> }) {
  if (api.loading) return <p className="text-sm text-muted-foreground">Loading workflow runs…</p>;
  if (api.error) return <Unavailable title="Runs endpoint unavailable" text={api.error} action="GET /business/automations/:id/runs" />;
  const runs = api.data ?? [];
  return <section className="border border-border bg-surface"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4"><div><h2 className="text-sm font-semibold">Run history</h2><p className="mt-1 text-xs text-muted-foreground">Step-level inputs, outputs, approvals and errors are shown when returned by the API.</p></div><Button size="sm" variant="secondary" disabled={!runs.length} onClick={() => exportRuns(runs)}>Export CSV</Button></div>{!runs.length ? <EmptyState icon={Play} title="No runs returned" description="Run records will appear here after the runs endpoint is connected." /> : <div className="divide-y divide-border">{runs.map((run) => <details key={run.id} className="p-4"><summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 text-sm"><span className="font-medium">{run.recordRef ? JSON.stringify(run.recordRef) : "Record not returned"} · {run.status}</span><span className="text-xs text-muted-foreground">{formatDate(run.startedAt)} · v{run.version ?? "—"}</span></summary><div className="mt-3 grid gap-2 text-xs">{run.steps?.length ? run.steps.map((step, index) => <pre key={index} className="overflow-auto border border-border bg-surface-2 p-2">{JSON.stringify(step, null, 2)}</pre>) : <p className="text-muted-foreground">Step detail not returned.</p>}<div className="flex gap-2"><Button size="sm" variant="secondary" disabled title="Run retry endpoint is not connected">Retry failed step</Button><Button size="sm" variant="ghost" disabled title="Run cancel endpoint is not connected">Cancel run</Button></div></div></details>)}</div>}</section>;
}

function VersionsTab({ api }: { api: ReturnType<typeof useApi<Array<Record<string, unknown>>>> }) {
  if (api.loading) return <p className="text-sm text-muted-foreground">Loading workflow versions…</p>;
  if (api.error) return <Unavailable title="Versions endpoint unavailable" text={api.error} action="GET /business/automations/:id/versions" />;
  const versions = api.data ?? [];
  return <section className="border border-border bg-surface"><div className="border-b border-border p-4"><h2 className="text-sm font-semibold">Versions</h2><p className="mt-1 text-xs text-muted-foreground">Compare published versions and restore one as a draft when the versions API is connected.</p></div>{!versions.length ? <EmptyState icon={Copy} title="No versions returned" description="Publish a workflow to create a version." /> : <div className="divide-y divide-border">{versions.map((version, index) => <div key={index} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"><span>Version {String(version.version ?? index + 1)} · {String(version.changeNote ?? "No change note")}</span><Badge variant={version.live ? "success" : "neutral"}>{version.live ? "Live" : "Draft"}</Badge><Button size="sm" variant="secondary" disabled title="Version restore endpoint is not connected">Restore as draft</Button></div>)}</div>}</section>;
}

function SettingsTab({ workflow, onChange, onSave }: { workflow: WorkflowRecord; onChange: (next: WorkflowRecord) => void; onSave: () => void }) {
  const [name, setName] = React.useState(workflow.name);
  const [description, setDescription] = React.useState(workflow.description);
  return <div className="grid gap-4 lg:grid-cols-2"><section className="border border-border bg-surface p-5"><h2 className="text-sm font-semibold">Workflow settings</h2><div className="mt-4 grid gap-4"><Field label="Name" id="settings-name"><Input id="settings-name" value={name} onChange={(e) => { setName(e.target.value); onChange({ ...workflow, name: e.target.value }); }} /></Field><Field label="Description" id="settings-description"><Textarea id="settings-description" value={description} onChange={(e) => { setDescription(e.target.value); onChange({ ...workflow, description: e.target.value }); }} /></Field><Field label="Run window" id="settings-window"><select id="settings-window" value={String(workflow.settings.runWindow ?? "any_time")} onChange={(e) => onChange({ ...workflow, settings: { ...workflow.settings, runWindow: e.target.value } })} className="h-9 border border-input bg-surface px-3 text-sm"><option value="any_time">Any time</option><option value="business_hours">Business hours only</option></select></Field><Field label="Timezone" id="settings-timezone"><Input id="settings-timezone" value={String(workflow.settings.timezone ?? "Asia/Kolkata")} onChange={(e) => onChange({ ...workflow, settings: { ...workflow.settings, timezone: e.target.value } })} /></Field><Button size="sm" onClick={onSave}><Save className="size-3.5" />Save settings</Button></div></section><section className="border border-border bg-surface p-5"><h2 className="text-sm font-semibold">Safety and error handling</h2><div className="mt-4 grid gap-3 text-xs"><div className="flex items-start gap-2 border border-border bg-surface-2 p-3"><Lock className="size-3.5" />Suppression for do-not-contact, unsubscribed and blocked records is always on.</div><div className="flex items-start gap-2 border border-amber-300/70 bg-amber-50 p-3 text-amber-800"><ShieldAlert className="size-3.5" />Sensitive actions require a locked approval step before execution.</div><p className="text-muted-foreground">Throttling, retries, notifications and owner assignment will be editable when the workflow settings endpoint returns those fields.</p></div></section><section className="border border-amber-300/70 bg-amber-50 p-5 lg:col-span-2"><h2 className="text-sm font-semibold text-amber-900">Danger zone</h2><p className="mt-2 text-xs text-amber-800">Archive keeps run history for audit. Permanent delete is allowed only when the workflow is off.</p><Button size="sm" variant="secondary" className="mt-3" disabled title="Use the workflow action menu to archive">Archive workflow</Button></section></div>;
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) { return <div><Label htmlFor={id}>{label}</Label><div className="mt-1">{children}</div></div>; }
function StatusBadge({ status }: { status: string }) { const normalized = normalizeStatus(status); return <Badge variant={normalized === "on" ? "success" : normalized === "error" ? "danger" : normalized === "draft" ? "warning" : "neutral"}>{normalized === "on" ? "On" : normalized === "off" ? "Off" : normalized === "error" ? "Error" : "Draft"}</Badge>; }
function normalizeStatus(status: string) { return status === "active" || status === "on" ? "on" : status === "paused" || status === "off" ? "off" : status === "needs_attention" ? "error" : status; }
function normalizeWorkflow(value: WorkflowRecord): WorkflowRecord { const actions = Array.isArray(value.actions) ? value.actions : []; const steps = Array.isArray(value.steps) && value.steps.length ? value.steps : actions.map((action, index) => { const raw = typeof action === "object" && action !== null ? action as Record<string, unknown> : {}; const actionName = typeof raw.action === "string" ? raw.action : typeof raw.type === "string" ? raw.type : String(action); return { id: String(raw.id ?? "step-" + index), type: String(raw.type ?? "action"), module: typeof raw.module === "string" ? raw.module : undefined, action: actionName, title: typeof raw.title === "string" ? raw.title : actionName.replaceAll("_", " "), config: raw.config && typeof raw.config === "object" ? raw.config as Record<string, unknown> : {}, disabled: raw.disabled === true }; }); return { ...emptyWorkflow, ...value, scope: "business", steps, actions }; }
function triggerText(trigger: Record<string, unknown>) { const value = typeof trigger.type === "string" ? trigger.type : typeof trigger.event === "string" ? trigger.event : "Trigger not configured"; return value.replaceAll("_", " "); }
function stepSummary(step: BusinessWorkflowStep) { if (step.disabled) return "Disabled"; if (step.action) return step.action.replaceAll("_", " "); return step.note ?? "Configure this step"; }
function moduleLabel(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase()); }
function hasOutboundMessage(workflow: WorkflowRecord) { return workflow.steps.some((step) => ["send_whatsapp", "send_email", "bulk_message"].includes(step.action ?? "")); }
function hasApproval(workflow: WorkflowRecord) { return workflow.requiresApproval === true || workflow.steps.some((step) => ["send_whatsapp", "send_email", "bulk_message", "refund", "delete_record"].includes(step.action ?? "")); }
function formatDate(value?: string | null) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(); }
function exportRuns(runs: BusinessWorkflowRun[]) { const lines = ["id,status,startedAt,endedAt,version", ...runs.map((run) => [run.id, run.status, run.startedAt ?? "", run.endedAt ?? "", String(run.version ?? "")].map((value) => '"' + value.replaceAll('"', '""') + '"').join(","))]; const blob = new Blob([lines.join("\n")], { type: "text/csv" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "janus-workflow-runs.csv"; link.click(); URL.revokeObjectURL(link.href); }
function Unavailable({ title, text, action }: { title: string; text: string; action?: string }) { return <div className="border border-dashed border-border bg-surface p-6"><h1 className="text-base font-semibold">{title}</h1><p className="mt-2 text-sm text-muted-foreground">{text}</p>{action && <Badge className="mt-4" variant="outline">{action}</Badge>}</div>; }
