"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Archive, Copy, Folder, FolderPlus, ListFilter, MoreHorizontal, Plus, Power, Search, SlidersHorizontal, Workflow, XCircle } from "lucide-react";
import { useAppStore } from "@/lib/stores/app-store";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { EmptyState } from "@/components/shared/empty-state";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AutomationCard } from "@/components/automations/automation-card";
import { CreateAutomationDialog } from "@/components/automations/create-automation-dialog";
import type { Automation } from "@/lib/types";
import { useWorkspace } from "@/components/layout/workspace-context";
import { useApi } from "@/lib/api/use-api";
import { api, message } from "@/lib/api/client";
import { toast } from "sonner";
import { demoMode } from "@/lib/demo-mode";
import { WorkspaceCopyDialog, workspaceCopyOptions, type WorkspaceCopyTarget } from "@/components/workspace-copy-dialog";

type StatusFilter = "all" | Automation["status"];

export default function AutomationsPage() {
  const { workspaceId } = useWorkspace();
  if (workspaceId === "business") return <BusinessAutomationCenter />;
  return <CrmAutomationsPage />;
}

function CrmAutomationsPage() {
  const automations = useAppStore((s) => s.automations);
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [createOpen, setCreateOpen] = React.useState(false);

  const filtered = automations.filter((a) => {
    const matchesStatus = statusFilter === "all" || a.status === statusFilter;
    const q = query.trim().toLowerCase();
    const matchesQuery = !q || a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q);
    return matchesStatus && matchesQuery;
  });

  const activeCount = automations.filter((a) => a.status === "active").length;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Automations"
        description={`${automations.length} automations · ${activeCount} active`}
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-3.5" />
            New Automation
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 pb-4">
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="disabled">Disabled</TabsTrigger>
            <TabsTrigger value="draft">Draft</TabsTrigger>
          </TabsList>
        </Tabs>
        <SearchInput value={query} onChange={setQuery} placeholder="Search automations…" className="w-72" />
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {filtered.length === 0 ? (
          <EmptyState
            icon={Workflow}
            title="No automations found"
            description="Try a different search term or status filter."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((automation) => (
              <AutomationCard key={automation.id} automation={automation} />
            ))}
          </div>
        )}
      </div>

      <CreateAutomationDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

type BusinessWorkflow = {
  id: string;
  name: string;
  description: string;
  folderId?: string | null;
  ownerId?: string | null;
  status: string;
  liveVersion?: number | null;
  draftVersion?: number | null;
  trigger: Record<string, unknown>;
  steps?: unknown[];
  actions: unknown[];
  modulesUsed?: string[];
  requiresApproval?: boolean;
  createdBy?: string | null;
  updatedBy?: string | null;
  updatedAt?: string | null;
  lastRunAt?: string | null;
  runs7d?: number | null;
  errors7d?: number | null;
};
type BusinessFolder = { id: string; name: string; count?: number };
type BusinessTemplate = { id: string; name: string; description: string; trigger?: Record<string, unknown>; steps?: unknown[]; modules?: string[] };

const demoWorkflowRows: BusinessWorkflow[] = [
  { id: "demo-workflow-lead-follow-up", name: "New lead follow-up", description: "Qualify a new lead, draft a reply and create a follow-up task.", status: "active", trigger: { type: "lead_created", module: "crm_sales" }, actions: [{ module: "crm_sales", action: "qualify_lead" }, { module: "whatsapp", action: "draft_reply" }, { module: "crm_sales", action: "create_task" }], modulesUsed: ["crm_sales", "whatsapp"], requiresApproval: true, ownerId: "Pankaj Neema", updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), lastRunAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), runs7d: 34, errors7d: 1 },
  { id: "demo-workflow-missed-call", name: "Missed call callback", description: "Create a callback task when a new missed call is captured.", status: "draft", trigger: { type: "missed_call", module: "crm_sales" }, actions: [{ module: "crm_sales", action: "create_task" }, { module: "crm_sales", action: "assign_owner" }], modulesUsed: ["crm_sales"], requiresApproval: false, ownerId: "Sales team", updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), runs7d: 8, errors7d: 0 },
  { id: "demo-workflow-overdue", name: "Payment overdue reminder", description: "Review overdue invoices and prepare a reminder for owner approval.", status: "paused", trigger: { type: "invoice_overdue", module: "finance_accounting" }, actions: [{ module: "finance_accounting", action: "find_risk" }, { module: "whatsapp", action: "draft_reply" }], modulesUsed: ["finance_accounting", "whatsapp"], requiresApproval: true, ownerId: "Finance team", updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), runs7d: 12, errors7d: 0 },
];
const demoFolderRows: BusinessFolder[] = [{ id: "demo-sales", name: "Sales operations", count: 2 }, { id: "demo-finance", name: "Finance controls", count: 1 }];
const demoTemplateRows: BusinessTemplate[] = [{ id: "demo-template-lead", name: "New lead follow-up", description: "Qualify and follow up with new enquiries.", trigger: { type: "lead_created", module: "crm_sales" }, steps: [{ module: "crm_sales", action: "qualify_lead" }, { module: "whatsapp", action: "draft_reply" }], modules: ["CRM & Sales", "WhatsApp"] }, { id: "demo-template-call", name: "Missed call callback", description: "Create a callback task for a missed call.", trigger: { type: "missed_call", module: "crm_sales" }, steps: [{ module: "crm_sales", action: "create_task" }], modules: ["CRM & Sales"] }];

function BusinessAutomationCenter() {
  const router = useRouter();
  const search = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const workflows = useApi<BusinessWorkflow[]>("/business/automations");
  const folders = useApi<BusinessFolder[]>("/business/automation-folders");
  const templates = useApi<BusinessTemplate[]>("/business/automation-templates");
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [module, setModule] = React.useState("all");
  const [sort, setSort] = React.useState("updated");
  const [folder, setFolder] = React.useState(search.get("folder") ?? "all");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [templatesOpen, setTemplatesOpen] = React.useState(false);
  const [templateSearch, setTemplateSearch] = React.useState("");
  const [newName, setNewName] = React.useState("");
  const [newDescription, setNewDescription] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [copyWorkflow, setCopyWorkflow] = React.useState<BusinessWorkflow | null>(null);
  const [demoRows, setDemoRows] = React.useState<BusinessWorkflow[]>(demoWorkflowRows);
  const demoSequenceRef = React.useRef(0);

  const data = demoMode ? demoRows : workflows.data ?? [];
  const folderRows = demoMode ? demoFolderRows : folders.data ?? [];
  const templateRows = demoMode ? demoTemplateRows : templates.data ?? [];
  const allModules = Array.from(new Set(data.flatMap((item) => modulesFor(item))));
  const visible = data.filter((item) => {
    const q = query.trim().toLowerCase();
    const haystack = [item.name, item.description, triggerText(item.trigger), ...modulesFor(item)].join(" ").toLowerCase();
    return (!q || haystack.includes(q)) && (status === "all" || normalizedStatus(item.status) === status) && (module === "all" || modulesFor(item).includes(module)) && (folder === "all" || item.folderId === folder);
  }).sort((left, right) => sort === "name" ? left.name.localeCompare(right.name) : sort === "runs" ? (right.runs7d ?? -1) - (left.runs7d ?? -1) : Date.parse(String(right.updatedAt ?? "")) - Date.parse(String(left.updatedAt ?? "")));

  const toggleAll = () => setSelected(selected.length === visible.length ? [] : visible.map((item) => item.id));
  const updateStatus = async (item: BusinessWorkflow, next: "on" | "off") => {
    if (next === "on" && hasOutboundMessage(item) && !window.confirm("This workflow can send customer messages. Turn it on?")) return;
    if (demoMode) { setDemoRows((current) => current.map((row) => row.id === item.id ? { ...row, status: next === "on" ? "active" : "paused" } : row)); toast.success(next === "on" ? "Demo workflow turned on" : "Demo workflow turned off"); return; }
    try {
      const endpoint = next === "on" ? "on" : "off";
      await api("/business/automations/" + item.id + "/" + endpoint, { method: "POST" });
      toast.success(next === "on" ? "Workflow turned on" : "Workflow turned off");
      workflows.reload();
    } catch (error) {
      try {
        await api("/business/automations/" + item.id, { method: "PATCH", body: JSON.stringify({ status: next === "on" ? "active" : "paused" }) });
        toast.success(next === "on" ? "Workflow turned on" : "Workflow turned off");
        workflows.reload();
      } catch (fallbackError) {
        toast.error(message(fallbackError ?? error));
      }
    }
  };
  const archive = async (item: BusinessWorkflow) => {
    if (!window.confirm("Archive this workflow? Run history will be kept for audit.")) return;
    if (demoMode) { setDemoRows((current) => current.filter((row) => row.id !== item.id)); setSelected((items) => items.filter((id) => id !== item.id)); toast.success("Demo workflow archived"); return; }
    try { await api("/business/automations/" + item.id, { method: "DELETE" }); toast.success("Workflow archived"); setSelected((items) => items.filter((id) => id !== item.id)); workflows.reload(); }
    catch (error) { toast.error(message(error)); }
  };
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    if (demoMode) { const created: BusinessWorkflow = { id: `demo-workflow-created-${++demoSequenceRef.current}`, name: newName.trim(), description: newDescription.trim(), status: "draft", trigger: { type: "manual" }, actions: [], modulesUsed: [], requiresApproval: true, ownerId: "Owner", updatedAt: new Date().toISOString(), runs7d: 0, errors7d: 0 }; setDemoRows((current) => [created, ...current]); setCreateOpen(false); setNewName(""); setNewDescription(""); toast.success("Demo workflow draft created"); router.push(`/automations/${created.id}?workspace=business&mode=edit`); setSaving(false); return; }
    try {
      const created = await api<BusinessWorkflow>("/business/automations", { method: "POST", body: JSON.stringify({ name: newName.trim(), description: newDescription.trim(), trigger: { type: "manual", reEnrollment: false, enrollExisting: false }, actions: [], requiresApproval: true }) });
      setCreateOpen(false); setNewName(""); setNewDescription(""); setCreateError(null); toast.success("Workflow draft created");
      router.push("/automations/" + created.id + "?workspace=business&mode=edit");
    } catch (error) { setCreateError(message(error)); toast.error(message(error)); } finally { setSaving(false); }
  };
  const createFromTemplate = async (template: BusinessTemplate) => {
    setSaving(true);
    if (demoMode) { const created: BusinessWorkflow = { id: `demo-workflow-template-${++demoSequenceRef.current}`, name: template.name, description: template.description, status: "draft", trigger: template.trigger ?? { type: "manual" }, actions: template.steps ?? [], modulesUsed: template.modules ?? [], requiresApproval: true, ownerId: "Owner", updatedAt: new Date().toISOString(), runs7d: 0, errors7d: 0 }; setDemoRows((current) => [created, ...current]); setTemplatesOpen(false); toast.success("Demo workflow created from template"); router.push(`/automations/${created.id}?workspace=business&mode=edit`); setSaving(false); return; }
    try {
      const created = await api<BusinessWorkflow>("/business/automations", { method: "POST", body: JSON.stringify({ name: template.name, description: template.description, trigger: template.trigger ?? { type: "manual" }, actions: template.steps ?? [], requiresApproval: true }) });
      setTemplatesOpen(false); toast.success("Workflow created from template"); router.push("/automations/" + created.id + "?workspace=business&mode=edit");
    } catch (error) { toast.error(message(error)); } finally { setSaving(false); }
  };
  const bulk = async (action: "on" | "off" | "archive") => {
    const rows = data.filter((item) => selected.includes(item.id));
    if (!rows.length) return;
    if (action === "archive" && !window.confirm("Archive the selected workflows?")) return;
    for (const item of rows) {
      if (action === "archive") await archive(item);
      else await updateStatus(item, action);
    }
    setSelected([]); workflows.reload();
  };
  const copyLabel = (target: WorkspaceCopyTarget) => workspaceCopyOptions.find(([key]) => key === target)?.[1] ?? target;

  return <div className="mx-auto flex max-w-[1500px] flex-col">
    <PageHeader title="Workflows" description="Business-level automations that can act across connected modules." actions={<div className="flex flex-wrap items-center gap-2">{demoMode && <Badge variant="neutral">Demo data</Badge>}<Button size="sm" variant="secondary" onClick={() => setTemplatesOpen(true)}><Folder className="size-3.5" />Templates</Button><Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="size-3.5" />Create workflow</Button></div>} />
    <div className="grid min-h-0 flex-1 lg:grid-cols-[210px_minmax(0,1fr)]">
      <aside className="border-r border-border px-4 py-5"><p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Folders</p><div className="grid gap-1"><FolderButton active={folder === "all"} label="All workflows" count={data.length} onClick={() => setFolder("all")} />{folderRows.map((item) => <FolderButton key={item.id} active={folder === item.id} label={item.name} count={item.count} onClick={() => setFolder(item.id)} />)}{!demoMode && !folders.data && <p className="px-2 py-3 text-xs text-muted-foreground">Folders are unavailable until the folders endpoint is connected.</p>}{!demoMode && <Button variant="ghost" size="sm" className="justify-start text-xs" disabled title="Folder endpoint is not connected"><FolderPlus className="size-3.5" />New folder</Button>}</div></aside>
      <main className="min-w-0 px-5 py-5">
        <div className="flex flex-wrap items-center gap-2 border-b border-border pb-4"><div className="relative min-w-[220px] flex-1"><Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search workflows…" className="pl-8" /></div><select aria-label="Status filter" value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 border border-input bg-surface px-3 text-xs"><option value="all">All statuses</option><option value="on">On</option><option value="off">Off</option><option value="draft">Draft</option><option value="error">Error</option></select><select aria-label="Module filter" value={module} onChange={(event) => setModule(event.target.value)} className="h-9 border border-input bg-surface px-3 text-xs"><option value="all">All modules</option>{allModules.map((item) => <option key={item} value={item}>{moduleLabel(item)}</option>)}</select><select aria-label="Sort workflows" value={sort} onChange={(event) => setSort(event.target.value)} className="h-9 border border-input bg-surface px-3 text-xs"><option value="updated">Last updated</option><option value="name">Name</option><option value="runs">Runs</option></select><Button size="icon" variant="ghost" aria-label="More workflow filters" title="More filters are available when the catalog endpoint is connected" disabled><SlidersHorizontal className="size-4" /></Button></div>
        {selected.length > 0 && <div className="my-3 flex flex-wrap items-center gap-2 border border-accent/30 bg-accent-muted px-3 py-2 text-xs"><span className="font-medium">{selected.length} selected</span><Button size="sm" variant="secondary" onClick={() => bulk("on")}><Power className="size-3.5" />Turn on</Button><Button size="sm" variant="secondary" onClick={() => bulk("off")}><XCircle className="size-3.5" />Turn off</Button><Button size="sm" variant="secondary" onClick={() => bulk("archive")}><Archive className="size-3.5" />Archive</Button></div>}
        {workflows.error && !demoMode && <div className="my-4 border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-800">Workflow records are unavailable: {workflows.error}</div>}
        {(!demoMode && workflows.loading) ? <div className="py-12 text-sm text-muted-foreground">Loading workflow records…</div> : !visible.length ? <div className="py-12"><EmptyState icon={Workflow} title={data.length ? "No workflows match these filters" : "No workflows yet"} description={data.length ? "Try another search or filter." : "Create a business workflow or use a connected template to automate work across modules."} action={!data.length ? <Button onClick={() => setCreateOpen(true)}><Plus className="size-3.5" />Create workflow</Button> : undefined} /></div> : <div className="overflow-x-auto border border-border"><table className="w-full min-w-[1080px] text-sm"><thead><tr className="border-b border-border bg-surface-2 text-left text-[10px] uppercase tracking-wide text-muted-foreground"><th className="w-10 px-3 py-3"><input type="checkbox" aria-label="Select all workflows" checked={visible.length > 0 && selected.length === visible.length} onChange={toggleAll} /></th><th className="w-16 px-2 py-3">On</th><th className="px-3 py-3">Name</th><th className="px-3 py-3">Trigger</th><th className="px-3 py-3">Modules</th><th className="px-3 py-3 text-right">Runs 7d</th><th className="px-3 py-3 text-right">Errors 7d</th><th className="px-3 py-3">Last run</th><th className="px-3 py-3">Owner</th><th className="px-3 py-3">Updated</th><th className="w-12 px-2 py-3" /></tr></thead><tbody>{visible.map((item) => <WorkflowRow key={item.id} workflow={item} selected={selected.includes(item.id)} onSelect={(checked) => setSelected((current) => checked ? [...current, item.id] : current.filter((id) => id !== item.id))} onOpen={() => router.push("/automations/" + item.id + "?workspace=business")} onToggle={() => updateStatus(item, normalizedStatus(item.status) === "on" ? "off" : "on")} onArchive={() => archive(item)} onCopy={() => setCopyWorkflow(item)} />)}</tbody></table></div>}
        <p className="mt-4 text-xs text-muted-foreground"><ListFilter className="mr-1 inline size-3.5" />{demoMode ? "Demo records are local to this preview and reset when the session is refreshed." : "Only connected workflow records are shown. Missing folders, templates and catalog data are labelled unavailable."}</p>
      </main>
    </div>
    <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (open) setCreateError(null); }}><DialogContent><DialogHeader><DialogTitle>Create workflow</DialogTitle><DialogDescription>Business workflows can trigger and act across connected modules. Workspace selection is not used.</DialogDescription></DialogHeader><form onSubmit={create} className="grid gap-4"><div><Label htmlFor="business-workflow-name">Name</Label><Input id="business-workflow-name" value={newName} onChange={(event) => setNewName(event.target.value)} className="mt-1" required /></div><div><Label htmlFor="business-workflow-description">Description</Label><Textarea id="business-workflow-description" value={newDescription} onChange={(event) => setNewDescription(event.target.value)} className="mt-1" /></div>{createError && <p role="alert" className="border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">Could not create workflow: {createError}</p>}<p className="text-xs text-muted-foreground">The workflow opens in the full editor with an empty trigger card.</p><DialogFooter><Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create workflow"}</Button></DialogFooter></form></DialogContent></Dialog>
    <Dialog open={templatesOpen} onOpenChange={setTemplatesOpen}><DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>Workflow templates</DialogTitle><DialogDescription>{demoMode ? "Preview reusable workflows with sample module mappings." : "Templates are loaded from the connected automation catalog."}</DialogDescription></DialogHeader><Input value={templateSearch} onChange={(event) => setTemplateSearch(event.target.value)} placeholder="Search templates…" />{templates.error && !demoMode ? <div className="border border-amber-300/70 bg-amber-50 p-4 text-sm text-amber-800">Template catalog is unavailable: {templates.error}</div> : (!demoMode && templates.loading) ? <p className="py-8 text-sm text-muted-foreground">Loading templates…</p> : !templateRows.length ? <EmptyState icon={Folder} title="No templates returned" description="Create a workflow from scratch to get started." /> : <div className="grid gap-3 sm:grid-cols-2">{templateRows.filter((item) => !templateSearch || (item.name + item.description).toLowerCase().includes(templateSearch.toLowerCase())).map((item) => <article key={item.id} className="border border-border bg-surface p-4"><h3 className="text-sm font-semibold">{item.name}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p><p className="mt-3 text-xs text-muted-foreground">Trigger: {triggerText(item.trigger ?? {})} · {item.modules?.map(moduleLabel).join(", ") || "Core modules"}</p><Button size="sm" className="mt-4" onClick={() => createFromTemplate(item)} disabled={saving}>Use template</Button></article>)}</div>}</DialogContent></Dialog><WorkspaceCopyDialog open={Boolean(copyWorkflow)} onOpenChange={(open) => !open && setCopyWorkflow(null)} itemName={copyWorkflow?.name ?? "Workflow"} itemKind="workflow" onCopied={(target) => { if (!copyWorkflow) return; const label = copyLabel(target); if (demoMode) { const copied: BusinessWorkflow = { ...copyWorkflow, id: `demo-workflow-copy-${Date.now()}`, name: `${copyWorkflow.name} · ${label}`, status: "draft", requiresApproval: true }; setDemoRows((current) => [copied, ...current]); toast.success(`${copied.name} added as a draft`); } else toast.info(`${copyWorkflow.name} is ready to copy to ${label}; the workspace copy endpoint is not connected yet.`); }} />
  </div>;
}

function FolderButton({ active, label, count, onClick }: { active: boolean; label: string; count?: number; onClick: () => void }) { return <button type="button" onClick={onClick} className={"flex items-center justify-between gap-2 px-2 py-2 text-left text-xs " + (active ? "bg-accent-muted font-medium" : "text-muted-foreground hover:bg-surface-2")}><span className="flex items-center gap-2"><Folder className="size-3.5" />{label}</span>{count !== undefined && <span className="tabular-nums">{count}</span>}</button>; }
function WorkflowRow({ workflow, selected, onSelect, onOpen, onToggle, onArchive, onCopy }: { workflow: BusinessWorkflow; selected: boolean; onSelect: (checked: boolean) => void; onOpen: () => void; onToggle: () => void; onArchive: () => void; onCopy: () => void }) {
  const isOn = normalizedStatus(workflow.status) === "on";
  return <tr className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-2" onClick={onOpen}><td className="px-3 py-3" onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={"Select " + workflow.name} checked={selected} onChange={(event) => onSelect(event.target.checked)} /></td><td className="px-2 py-3" onClick={(event) => event.stopPropagation()}><button type="button" aria-label={isOn ? "Turn workflow off" : "Turn workflow on"} onClick={onToggle} className={"flex size-7 items-center justify-center " + (isOn ? "text-success" : "text-muted-foreground")} title={isOn ? "On" : "Off"}>{isOn ? <Power className="size-4" /> : <Power className="size-4 opacity-40" />}</button></td><td className="px-3 py-3"><p className="font-medium">{workflow.name}</p><p className="mt-1 max-w-[260px] truncate text-xs text-muted-foreground">{workflow.description || "No description"}</p></td><td className="px-3 py-3 text-xs text-muted-foreground">{triggerText(workflow.trigger)}</td><td className="px-3 py-3"><div className="flex flex-wrap gap-1">{modulesFor(workflow).length ? modulesFor(workflow).map((item) => <Badge key={item} variant="outline">{moduleLabel(item)}</Badge>) : <span className="text-xs text-muted-foreground">Not returned</span>}</div></td><td className="px-3 py-3 text-right tabular-nums">{workflow.runs7d ?? "—"}</td><td className="px-3 py-3 text-right">{workflow.errors7d ? <Badge variant="danger">{workflow.errors7d}</Badge> : "—"}</td><td className="px-3 py-3 text-xs text-muted-foreground">{formatDate(workflow.lastRunAt)}</td><td className="px-3 py-3 text-xs text-muted-foreground">{workflow.ownerId ?? "Not returned"}</td><td className="px-3 py-3 text-xs text-muted-foreground">{formatDate(workflow.updatedAt)}</td><td className="px-2 py-3" onClick={(event) => event.stopPropagation()}><div className="flex items-center gap-1"><Button size="icon" variant="ghost" aria-label={"Copy " + workflow.name + " to another workspace"} title="Copy to workspace" onClick={onCopy}><Copy className="size-4" /></Button><Button size="icon" variant="ghost" aria-label={"Workflow actions for " + workflow.name} onClick={onArchive}><MoreHorizontal className="size-4" /></Button></div></td></tr>;
}
function normalizedStatus(value: string) { return value === "active" || value === "on" ? "on" : value === "paused" || value === "off" ? "off" : value === "needs_attention" ? "error" : value; }
function triggerText(trigger: Record<string, unknown> | undefined) { if (!trigger) return "Not configured"; const type = typeof trigger.type === "string" ? trigger.type : typeof trigger.event === "string" ? trigger.event : "Trigger not returned"; return type.replaceAll("_", " "); }
function modulesFor(workflow: BusinessWorkflow) { if (workflow.modulesUsed?.length) return workflow.modulesUsed; const values = [typeof workflow.trigger.module === "string" ? workflow.trigger.module : ""]; workflow.actions.forEach((action) => { if (typeof action === "object" && action && "module" in action && typeof action.module === "string") values.push(action.module); }); return Array.from(new Set(values.filter(Boolean))); }
function moduleLabel(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase()); }
function hasOutboundMessage(workflow: BusinessWorkflow) { return workflow.actions.some((action) => typeof action === "string" && ["send_whatsapp", "send_email", "bulk_message"].includes(action)); }
function formatDate(value?: string | null) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString(); }
