"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Bell, ChevronDown, ChevronUp, Eye, EyeOff, Globe, GripVertical, LockKeyhole, Monitor, Moon, Palette, PanelLeft, Pencil, Plus, Power, RefreshCw, Settings2, SlidersHorizontal, Sparkles, Sun, Trash2, Type, UserRound, UsersRound, X } from "lucide-react";
import { toast } from "sonner";
import { CuriousdevsLogo } from "@/components/shared/curiousdevs-logo";
import { PrismColorPicker } from "@/components/shared/prism-color-picker";
import { SectionCard, FieldRow, SettingRow } from "@/components/settings/section-ui";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { workspaceDefinitions, type WorkspaceId } from "@/lib/workspace-config";
import { getNavSectionsForWorkspace, type NavSection } from "@/lib/nav-config";
import { api, message } from "@/lib/api/client";
import { useApi as apiUse } from "@/lib/api/use-api";
import { scoped } from "@/lib/company";
import { applyAppearance, clearAppearance, loadAndApplyAppearance } from "@/lib/appearance";
import { CompanyProfileSection } from "@/components/settings/company-profile-section";
import { ProfileCard } from "@/components/settings/profile-card";
import { BillingSection } from "@/components/settings/billing-section";
import { formatCurrencyINR } from "@/lib/utils";
import { LiveBusinessOverview } from "@/components/business/business-overview";
import { inr, usePortfolioApi, type PortfolioPeriodKey, type PortfolioSummary } from "@/features/portfolio";
import { LiveAccessReview, LiveDataExport } from "@/components/business/company-settings";
import { useSession } from "@/components/auth/session-provider";
import { useWorkspace } from "@/components/layout/workspace-context";

const timezones = [
  { value: "Asia/Kolkata", label: "Asia/Kolkata (IST)" },
  { value: "America/New_York", label: "America/New York (ET)" },
  { value: "Europe/London", label: "Europe/London (GMT)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (SGT)" },
  { value: "Australia/Sydney", label: "Australia/Sydney (AEST)" },
  { value: "UTC", label: "UTC" },
];

export function WorkspaceSection() {
  const searchParams = useSearchParams();
  const view = searchParams.get("view");
  const requestedSection = searchParams.get("section");
  const [settingsSection, setSettingsSection] = React.useState(() => requestedSection || "profile");

  if (view === "overview") return <BusinessOverviewPanel />;
  if (view === "workspaces") return <WorkspacesPanel />;
  if (view === "administration") return <AdministrationPanel section={requestedSection} />;
  if (view === "settings" && requestedSection === "billing") return <BillingSection />;

  const settingsSections = [["profile", "Company Profile"], ["structure", "Organization Structure"], ["locale", "Hours & Timezone"], ["security", "Access & Security"], ["data", "Export Your Data"]];
  return (
    <div className="flex flex-col gap-5">
      <SectionTabs items={settingsSections} value={settingsSection} onChange={setSettingsSection} />
      <main className="min-w-0">
          {settingsSection === "profile" && <CompanyProfileSection />}
          {settingsSection === "structure" && <SectionCard title="Organization structure" description="Organize your teams, departments and workspace ownership."><RealStructure /></SectionCard>}
          {settingsSection === "locale" && <LiveHours />}
          {settingsSection === "security" && <SectionCard title="Who can get in" description="Everyone with access to this business, from its member list. Check it whenever someone leaves."><LiveAccessReview /></SectionCard>}
          {settingsSection === "data" && <SectionCard title="Export your records" description="Everything your business keeps in Janus, as spreadsheets you own."><LiveDataExport /></SectionCard>}
      </main>
    </div>
  );
}

function AdministrationPanel({ section }: { section: string | null }) {
  if (section === "profile") return <ProfileCard />;
  if (section === "billing") return <BillingSection />;

  const sections = [
    { title: "Profile", description: "Your name, phone and sign-in email, and the companies you belong to.", href: "/settings?tab=workspace&view=administration&section=profile&workspace=business", icon: UserRound },
    { title: "People & Access", description: "Members, invitations, roles, permissions and workspace access.", href: "/settings?tab=team&workspace=business", icon: UsersRound },
    { title: "Notifications", description: "The Monday summary, alerts when a company needs you, and this browser's notifications.", href: "/settings?tab=notifications&workspace=business", icon: Bell },
    { title: "Security & Sessions", description: "Your password, and every device signed in as you.", href: "/settings?tab=security&workspace=business", icon: LockKeyhole },
  ];

  return <div className="flex flex-col gap-5">
    <div><p className="text-[11px] font-medium uppercase tracking-wide text-accent">Administration</p><h2 className="mt-1 text-xl font-semibold tracking-tight">Administration</h2><p className="mt-1 text-sm text-muted-foreground">Manage your Janus account, team access and everyday preferences from one place.</p></div>
    <SectionCard title="Account administration" description="Common controls for the people and settings that keep your business running.">
      <div className="grid gap-3 sm:grid-cols-2">
        {sections.map(({ title, description, href, icon: Icon }) => <Link key={title} href={href} className="group rounded-lg border border-border bg-surface p-4 transition-colors hover:border-accent-border hover:bg-surface-2"><div className="flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent-muted text-accent"><Icon className="size-4" /></span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2 text-sm font-medium text-foreground">{title}<ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-accent" /></span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span></span></div></Link>)}
      </div>
    </SectionCard>
  </div>;
}

function BusinessOverviewPanel() {
  const session = useSession();
  const canReadReports = session.permissions.includes("*") || session.permissions.includes("reports:read");
  const canView = canReadReports;
  const live = apiUse<{ leads: number; openDeals: number; wonDeals: number; pipelineValue: string; unavailable: string[] }>(canView ? "/business/reports/summary" : null);
  const data = live.data;
  const loading = live.loading;
  const error = live.error;
  const leads = data?.leads ?? 0;
  const openDeals = data?.openDeals ?? 0;
  const pipelineAmount = Number(data?.pipelineValue);
  const pipeline = data?.pipelineValue != null && Number.isFinite(pipelineAmount) ? formatCurrencyINR(pipelineAmount, false) : "—";
  const unavailable = loading ? "Reading your records…" : error ? "CRM summary is unavailable right now." : null;

  const [periodKey, setPeriodKey] = React.useState<PortfolioPeriodKey>("month");
  const figures = usePortfolioApi<PortfolioSummary>(canView ? `/portfolio/summary?period=${periodKey}` : null, { keepPrevious: true });
  const shown = figures.data;
  const mine = shown?.companies.find((item) => item.current);
  const top = mine?.attention[0];
  if (!canView) return (
    <div className="mt-4 flex flex-col gap-6 rounded-xl bg-surface-2 p-4 sm:mt-5 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Business Overview</h1>
        <p className="mt-3 text-sm text-muted-foreground">This view is for the Owner and users with Report access. Ask an Owner to grant you the Reports permission if you need it.</p>
      </div>
    </div>
  );
  return (
    <div className="mt-4 flex flex-col gap-6 rounded-xl bg-surface-2 p-4 sm:mt-5 sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Business Overview</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">A view of verified activity from your connected workspaces.</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => (mine ? figures.reload() : window.location.reload())}>
          <RefreshCw className="size-3.5" />
          Refresh
        </Button>
      </div>

      <section className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-surface p-5 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-muted text-accent"><CuriousdevsLogo className="size-4" /></span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Janus brief</p>
            <p className="mt-1 text-sm leading-6 text-foreground">{mine ? `${mine.attention.length ? `${mine.attention.length} ${mine.attention.length === 1 ? "thing needs" : "things need"} you. First: ${top?.text}.` : "Nothing needs you right now."} ${mine.crm.openDeals ? `${mine.crm.openDeals} open deal${mine.crm.openDeals === 1 ? "" : "s"} worth ${inr(Number(mine.crm.pipelineValue))} in the pipeline.` : "No open deals in the pipeline."}` : unavailable ?? `You have ${leads} captured lead${leads === 1 ? "" : "s"}, ${openDeals} active deal${openDeals === 1 ? "" : "s"}, and ${pipeline} in open pipeline.`}</p>
          </div>
        </div>
        <Link href="/ai?workspace=business" className="shrink-0 text-sm font-medium text-accent hover:underline">Ask Janus →</Link>
      </section>

      {mine && shown ? <LiveBusinessOverview company={mine} period={shown.period} onPeriod={setPeriodKey} onReload={figures.reload} stale={figures.stale} /> : figures.loading ? <OverviewSkeleton /> : <div className="grid gap-3 sm:grid-cols-3">
        <OverviewKpi label="Leads" value={loading || error ? "—" : String(leads)} detail="Captured leads" />
        <OverviewKpi label="Open deals" value={loading || error ? "—" : String(openDeals)} detail="Active deals" />
        <OverviewKpi label="Pipeline" value={loading || error ? "—" : pipeline} detail="Open CRM pipeline" />
      </div>}

      <SectionCard title="Owner attention" description="Only verified alerts and approvals appear here."><UnavailableMessage text={unavailable ?? "No verified alerts or pending approvals yet."} /></SectionCard>
    </div>
  );
}

function OverviewSkeleton() {
  return <div className="flex flex-col gap-6" role="status" aria-label="Reading your records">
    <div className="h-24 animate-pulse rounded-xl border border-border bg-surface" />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((item) => <div key={item} className="h-[104px] animate-pulse rounded-lg border border-border bg-surface" />)}</div>
    <div className="h-64 animate-pulse rounded-xl border border-border bg-surface" />
  </div>;
}

function OverviewKpi({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-xl border border-border bg-surface p-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;
}

function UnavailableMessage({ text }: { text: string }) { return <div className="rounded-md border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">{text}</div>; }

type SidebarPrefs = Record<string, { hidden?: string[]; sectionOrder?: string[]; collapsed?: string[] }>;
function readSidebarPrefs(): SidebarPrefs { try { return JSON.parse(window.localStorage.getItem(scoped("janus.sidebar.prefs")) ?? "{}"); } catch { return {}; } }
function saveSidebarPrefs(prefs: SidebarPrefs) { try { window.localStorage.setItem(scoped("janus.sidebar.prefs"), JSON.stringify(prefs)); } catch {} }

function WorkspacesPanel() {
  const { workspaceId: currentWorkspaceId } = useWorkspace();
  const searchParams = useSearchParams();
  const activate = searchParams.get("activate");
  const activationDefinition = workspaceDefinitions.find((workspace) => workspace.id === activate && workspace.id !== "business" && workspace.id !== "portfolio");
  const [createOpen, setCreateOpen] = React.useState(Boolean(activationDefinition));
  const [workspaceName, setWorkspaceName] = React.useState(activationDefinition?.name ?? "");
  const [workspaceType, setWorkspaceType] = React.useState(activationDefinition?.id ?? "");
  const [records, setRecords] = React.useState<WorkspaceRecord[] | null>(null);
  const [members, setMembers] = React.useState<Record<string, WorkspacePerson[]>>({});
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [settingsFor, setSettingsFor] = React.useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = React.useState("");
  const departments = workspaceDefinitions.filter((workspace) => workspace.id !== "business" && workspace.id !== "portfolio");
  const recordFor = (id: string) => records?.find((item) => item.type === id.replaceAll("-", "_"));
  const isOn = (workspace: (typeof departments)[number]) => workspace.id === "team-chat" || records === null ? workspace.status === "active" : Boolean(recordFor(workspace.id));
  const ready = records !== null || Boolean(loadError);
  const created = ready ? departments.filter(isOn) : [];
  const available = ready ? departments.filter((workspace) => !isOn(workspace)) : [];

  React.useEffect(() => {
    let cancelled = false;
    api<WorkspaceRecord[]>("/workspaces")
      .then(async (items) => {
        if (cancelled) return;
        setRecords(items);
        const lists = await Promise.all(items.map((item) => api<WorkspacePerson[]>(`/workspaces/${item.id}/members`).then((people) => [item.id, people] as const).catch(() => [item.id, null] as const)));
        if (!cancelled) setMembers(Object.fromEntries(lists.filter((entry): entry is readonly [string, WorkspacePerson[]] => entry[1] !== null)));
      })
      .catch((error) => { if (!cancelled) setLoadError(message(error)); });
    return () => { cancelled = true; };
  }, []);
  function staffing(workspaceId: string) {
    const record = recordFor(workspaceId);
    const people = record ? members[record.id] : undefined;
    if (!people) return undefined;
    const leads = people.filter((person) => person.accessLevel === "manager" || person.accessLevel === "owner");
    const managers = people.filter((person) => person.accessLevel === "manager");
    return { text: `${people.length} ${people.length === 1 ? "person" : "people"} · ${managers.length ? `managed by ${managers.slice(0, 2).map((person) => person.name).join(", ")}${managers.length > 2 ? ` and ${managers.length - 2} more` : ""}` : leads.length ? "no manager yet, only the Owner" : "nobody leads it yet"}`, warn: managers.length === 0 };
  }
  function openActivate(id?: string) {
    const definition = departments.find((workspace) => workspace.id === (id ?? available[0]?.id));
    setWorkspaceType(definition?.id ?? "");
    setWorkspaceName(definition?.name ?? "");
    setCreateOpen(true);
  }

  async function deactivateWorkspace(id: string) {
    const record = recordFor(id);
    if (!record) return;
    setSaving(true);
    try {
      await api(`/workspaces/${record.id}`, { method: "PATCH", body: JSON.stringify({ status: "inactive" }) });
      setRecords((items) => items?.filter((item) => item.id !== record.id) ?? []);
      setDeactivateTarget(null);
      toast.success(`${record.name} deactivated. Its records are kept.`);
    } catch (error) { toast.error(message(error)); } finally { setSaving(false); }
  }

  async function deleteWorkspace(id: string) {
    const record = recordFor(id);
    if (!record) return;
    setSaving(true);
    try {
      await api(`/workspaces/${record.id}`, { method: "DELETE" });
      setRecords((items) => items?.filter((item) => item.id !== record.id) ?? []);
      setDeleteTarget(null);
      setDeleteConfirm("");
      toast.success(`${record.name} deleted permanently.`);
    } catch (error) { toast.error(message(error)); } finally { setSaving(false); }
  }

  const deactivateDef = deactivateTarget ? departments.find((w) => w.id === deactivateTarget) : null;
  const deleteDef = deleteTarget ? departments.find((w) => w.id === deleteTarget) : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Workspaces</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Create and manage the workspaces your business uses. Customize each workspace&apos;s sidebar, appearance and behavior.</p>
        </div>
        {available.length > 0 && <Button size="sm" onClick={() => openActivate()}><Plus className="size-3.5" />Activate workspace</Button>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <WorkspaceMetric label="Active workspaces" value={ready ? String(created.length) : "—"} detail={ready && created.some((workspace) => staffing(workspace.id)?.warn) ? `${created.filter((workspace) => staffing(workspace.id)?.warn).length} without a manager` : "Switched on for this business"} />
        <WorkspaceMetric label="Available to activate" value={ready ? String(available.length) : "—"} detail="Department workspaces" />
      </div>

      <SectionCard title="Active workspaces" description="These are the workspaces currently enabled for this business. Open one to enter its workflow.">
        <div className="grid gap-3">
          {!ready && <p className="text-sm text-muted-foreground">Loading workspaces…</p>}
          {created.map((workspace) => {
            const team = staffing(workspace.id);
            const wsName = recordFor(workspace.id)?.name || workspace.name;
            const wsDesc = recordFor(workspace.id)?.description || workspace.description;
            return <div key={workspace.id} className="group flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-4 shadow-sm transition-all hover:shadow-md hover:border-accent-border/40" style={{ borderLeft: "3px solid var(--accent)" }}>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">{wsName}<Badge variant="success">Active</Badge></span>
                <span className="text-xs text-muted-foreground">{wsDesc}</span>
                {team && <span className={`text-xs ${team.warn ? "text-warning" : "text-muted-foreground"}`}>{team.text}</span>}
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setSettingsFor(workspace.id)} className="gap-1.5 text-muted-foreground hover:text-foreground"><Pencil className="size-3" />Edit</Button>
                <div className="flex items-center rounded-md border border-border bg-surface-2 p-0.5">
                  {workspace.id !== "team-chat" && <button type="button" onClick={() => setDeactivateTarget(workspace.id)} title="Deactivate" className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-warning-muted hover:text-warning"><Power className="size-3.5" /></button>}
                  {workspace.id !== "team-chat" && <button type="button" onClick={() => setDeleteTarget(workspace.id)} title="Delete" className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"><Trash2 className="size-3.5" /></button>}
                </div>
                <Link href={workspace.id === "crm-sales" ? "/dashboard?workspace=crm-sales" : workspace.id === "team-chat" ? "/team?workspace=team-chat" : `/workspace/${workspace.id}?workspace=${workspace.id}`}><Button size="sm">Open<ArrowRight className="size-3 ml-1" /></Button></Link>
              </div>
            </div>;
          })}
        </div>
        {created.some((workspace) => staffing(workspace.id)?.warn) && <p className="mt-3 text-xs text-muted-foreground">A workspace without a manager leaves its approvals and follow-ups to you. <Link href="/settings?tab=team" className="text-accent hover:underline">Give it a manager in People & Access</Link></p>}
        {loadError && <div className="mt-3 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800">The workspace list could not be loaded: {loadError}. Showing the usual workspaces.</div>}
      </SectionCard>

      {ready && available.length > 0 && <SectionCard title="Available workspaces" description="Switch on a department when you are ready. Its records stay separate, and you choose who joins it.">
        <div className="grid gap-3 sm:grid-cols-2">
          {available.map((workspace) => (
            <div key={workspace.id} className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-surface px-4 py-3 transition-all hover:border-accent-border/60 hover:bg-accent-muted/20 hover:shadow-sm">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-muted text-accent transition-transform group-hover:scale-105"><Plus className="size-4" /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-foreground">{workspace.name}</span><span className="mt-1 block text-xs text-muted-foreground">{workspace.description}</span></span>
              <Button size="sm" variant="outline" onClick={() => openActivate(workspace.id)} className="gap-1.5 border-accent-border/60 text-accent hover:bg-accent hover:text-white"><Plus className="size-3" />Activate</Button>
            </div>
          ))}
        </div>
      </SectionCard>}

      {/* Activate workspace dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
              <DialogTitle>Activate workspace</DialogTitle>
            <DialogDescription>
              Switch on a department for this business. Its records stay in it, and only the people you add can open it.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="workspace-name" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Workspace name
            </label>
            <Input
              id="workspace-name"
              value={workspaceName}
              onChange={(event) => setWorkspaceName(event.target.value)}
              placeholder="e.g. Customer Support"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="workspace-type" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Workspace type</label>
            <Select value={workspaceType} onValueChange={(value) => { if (!workspaceName.trim() || departments.some((workspace) => workspace.name === workspaceName)) setWorkspaceName(departments.find((workspace) => workspace.id === value)?.name ?? ""); setWorkspaceType(value); }}>
              <SelectTrigger id="workspace-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {available.map((workspace) => <SelectItem key={workspace.id} value={workspace.id}>{workspace.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              disabled={!workspaceName.trim() || !workspaceType || saving}
              onClick={async () => {
                setSaving(true);
                try {
                  const created = await api<WorkspaceRecord>("/workspaces", {
                    method: "POST",
                    body: JSON.stringify({ type: workspaceType.replaceAll("-", "_"), name: workspaceName.trim() }),
                  });
                  setRecords((items) => [...(items ?? []), created]);
                  setWorkspaceName("");
                  setCreateOpen(false);
                  toast.success("Workspace activated");
                } catch (error) {
                  toast.error(message(error));
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? "Activating…" : "Activate workspace"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate confirmation */}
      <Dialog open={Boolean(deactivateTarget)} onOpenChange={(open) => !open && setDeactivateTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate {deactivateDef?.name ?? "workspace"}</DialogTitle>
            <DialogDescription>This will hide the workspace from your sidebar and lock access. All records and data inside it are kept and can be restored by re-activating.</DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-800">
            <p className="font-medium">What happens when you deactivate:</p>
            <ul className="mt-1.5 list-inside list-disc space-y-1">
              <li>Members lose access to this workspace immediately</li>
              <li>All records, conversations and files are preserved</li>
              <li>Automations and workflows in this workspace are paused</li>
              <li>You can re-activate it any time from this page</li>
            </ul>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeactivateTarget(null)}>Cancel</Button>
            <Button variant="destructive" disabled={saving} onClick={() => deactivateTarget && void deactivateWorkspace(deactivateTarget)}>
              {saving ? "Deactivating…" : "Deactivate workspace"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteConfirm(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteDef?.name ?? "workspace"} permanently</DialogTitle>
            <DialogDescription>This will permanently delete the workspace and all its records. This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-danger/30 bg-danger/5 p-3 text-xs text-danger">
            <p className="font-medium">Warning — this is permanent:</p>
            <ul className="mt-1.5 list-inside list-disc space-y-1">
              <li>All records, conversations and files will be deleted</li>
              <li>Member access will be revoked</li>
              <li>Automations and workflows will be removed</li>
              <li>This cannot be reversed</li>
            </ul>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Type &quot;{deleteDef?.name}&quot; to confirm</label>
            <Input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder={deleteDef?.name ?? "workspace name"} />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => { setDeleteTarget(null); setDeleteConfirm(""); }}>Cancel</Button>
            <Button variant="destructive" disabled={saving || deleteConfirm !== deleteDef?.name} onClick={() => deleteTarget && void deleteWorkspace(deleteTarget)}>
              {saving ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Workspace settings sidebar panel */}
      {settingsFor && <WorkspaceSettingsDialog workspaceId={settingsFor as WorkspaceId} name={recordFor(settingsFor)?.name || departments.find((w) => w.id === settingsFor)?.name || settingsFor} onClose={() => { setSettingsFor(null); loadAndApplyAppearance(currentWorkspaceId); }} />}
    </div>
  );
}

type AppearancePrefs = {
  accentColor?: string;
  sidebarBg?: string;
  fontScale?: string;
  borderRadius?: string;
  sidebarWidth?: string;
  iconStyle?: string;
  colorTheme?: string;
  themeMode?: string;
  fontFamily?: string;
  contentDensity?: string;
  sidebarPosition?: string;
  reduceMotion?: boolean;
  highContrast?: boolean;
  focusIndicators?: string;
  dateFormat?: string;
  timeFormat?: string;
  numberFormat?: string;
  firstDayOfWeek?: string;
  currencyDisplay?: string;
  language?: string;
  autoCollapseSidebar?: string;
  showRecentItems?: boolean;
  confirmBeforeDelete?: boolean;
  keyboardShortcuts?: boolean;
};
function readAppearancePrefs(wsId: string): AppearancePrefs { try { return JSON.parse(window.localStorage.getItem(scoped(`janus.ws.${wsId}.appearance`)) ?? "{}"); } catch { return {}; } }
function saveAppearancePrefs(wsId: string, prefs: AppearancePrefs) { try { window.localStorage.setItem(scoped(`janus.ws.${wsId}.appearance`), JSON.stringify(prefs)); } catch {} }

function readFavorites(wsId: string): string[] { try { return JSON.parse(window.localStorage.getItem(scoped(`janus.ws.${wsId}.favorites`)) ?? "[]"); } catch { return []; } }
function saveFavorites(wsId: string, favs: string[]) { try { window.localStorage.setItem(scoped(`janus.ws.${wsId}.favorites`), JSON.stringify(favs)); } catch {} }

const COLOR_THEMES: Array<{ id: string; name: string; accent: string; sidebarBg: string; desc: string }> = [
  { id: "default", name: "Janus Default", accent: "#2563eb", sidebarBg: "#ffffff", desc: "Clean blue on white — the standard Janus look." },
  { id: "ocean", name: "Ocean", accent: "#0ea5e9", sidebarBg: "#f0f9ff", desc: "Light sky tones for a calm, airy feel." },
  { id: "forest", name: "Forest", accent: "#16a34a", sidebarBg: "#f0fdf4", desc: "Green accents for growth-focused teams." },
  { id: "sunset", name: "Sunset", accent: "#ea580c", sidebarBg: "#fff7ed", desc: "Warm orange for energy and urgency." },
  { id: "violet", name: "Violet", accent: "#7c3aed", sidebarBg: "#faf5ff", desc: "Purple tones for creative workspaces." },
  { id: "rose", name: "Rose", accent: "#e11d48", sidebarBg: "#fff1f2", desc: "Bold pink for HR and people teams." },
  { id: "slate", name: "Slate", accent: "#475569", sidebarBg: "#f8fafc", desc: "Neutral grey for a professional, minimal look." },
  { id: "midnight", name: "Midnight", accent: "#6366f1", sidebarBg: "#1e1b4b", desc: "Dark sidebar with indigo accent — enterprise feel." },
  { id: "charcoal", name: "Charcoal", accent: "#2563eb", sidebarBg: "#18181b", desc: "Dark sidebar, blue accents — developer-friendly." },
  { id: "custom", name: "Custom", accent: "", sidebarBg: "", desc: "Pick your own accent and sidebar colors." },
];

const ACCENT_SWATCHES = ["#2563eb", "#0ea5e9", "#16a34a", "#ea580c", "#7c3aed", "#e11d48", "#475569", "#6366f1", "#0d9488", "#d97706", "#db2777", "#4f46e5"];
const SIDEBAR_BG_SWATCHES = ["#ffffff", "#f8fafc", "#f7f5f1", "#f0f9ff", "#f0fdf4", "#fff7ed", "#faf5ff", "#fff1f2", "#fefce8", "#1e1b4b", "#18181b", "#1e293b"];


function WorkspaceSettingsDialog({ workspaceId, name, onClose }: { workspaceId: WorkspaceId; name: string; onClose: () => void }) {
  const navSections = React.useMemo(() => {
    try { return getNavSectionsForWorkspace(workspaceId); } catch { return []; }
  }, [workspaceId]);

  const [prefs, setPrefs] = React.useState(() => readSidebarPrefs());
  const wsPrefs = prefs[workspaceId] ?? {};
  const hiddenItems = wsPrefs.hidden ?? [];
  const collapsedSections = wsPrefs.collapsed ?? [];
  const [tab, setTab] = React.useState<"sidebar" | "appearance" | "notifications" | "behavior">("sidebar");

  // Appearance
  const [appearance, setAppearance] = React.useState(() => readAppearancePrefs(workspaceId));
  const [compactMode, setCompactMode] = React.useState(() => { try { return window.localStorage.getItem(scoped(`janus.ws.${workspaceId}.compact`)) === "true"; } catch { return false; } });
  const [showSectionTitles, setShowSectionTitles] = React.useState(() => { try { return window.localStorage.getItem(scoped(`janus.ws.${workspaceId}.no-section-titles`)) !== "true"; } catch { return true; } });
  const [defaultLanding, setDefaultLanding] = React.useState(() => { try { return window.localStorage.getItem(scoped(`janus.ws.${workspaceId}.landing`)) ?? ""; } catch { return ""; } });
  const selectedTheme = COLOR_THEMES.find((t) => t.id === (appearance.colorTheme ?? "default")) ?? COLOR_THEMES[0];

  // Favorites
  const [favorites, setFavorites] = React.useState(() => readFavorites(workspaceId));

  function updatePrefs(update: Partial<typeof wsPrefs>) {
    const next = { ...prefs, [workspaceId]: { ...wsPrefs, ...update } };
    setPrefs(next);
    saveSidebarPrefs(next);
  }

  function updateAppearance(update: Partial<AppearancePrefs>) {
    const next = { ...appearance, ...update };
    setAppearance(next);
    saveAppearancePrefs(workspaceId, next);
    applyAppearance(next);
  }

  function selectTheme(themeId: string) {
    const theme = COLOR_THEMES.find((t) => t.id === themeId);
    if (!theme || themeId === "custom") { updateAppearance({ colorTheme: "custom" }); return; }
    updateAppearance({ colorTheme: themeId, accentColor: theme.accent, sidebarBg: theme.sidebarBg });
  }

  function toggleItem(href: string) {
    const next = hiddenItems.includes(href) ? hiddenItems.filter((h) => h !== href) : [...hiddenItems, href];
    updatePrefs({ hidden: next });
  }

  function toggleSection(title: string) {
    const next = collapsedSections.includes(title) ? collapsedSections.filter((t) => t !== title) : [...collapsedSections, title];
    updatePrefs({ collapsed: next });
  }

  function toggleFavorite(href: string) {
    const next = favorites.includes(href) ? favorites.filter((f) => f !== href) : [...favorites, href];
    setFavorites(next);
    saveFavorites(workspaceId, next);
  }

  function moveSectionUp(index: number) {
    if (index <= 0) return;
    const order = wsPrefs.sectionOrder ?? navSections.map((s) => s.title);
    const next = [...order];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    updatePrefs({ sectionOrder: next });
  }

  function moveSectionDown(index: number) {
    const order = wsPrefs.sectionOrder ?? navSections.map((s) => s.title);
    if (index >= order.length - 1) return;
    const next = [...order];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    updatePrefs({ sectionOrder: next });
  }

  function resetAll() {
    const next = { ...prefs };
    delete next[workspaceId];
    setPrefs(next);
    saveSidebarPrefs(next);
    try {
      window.localStorage.removeItem(scoped(`janus.ws.${workspaceId}.compact`));
      window.localStorage.removeItem(scoped(`janus.ws.${workspaceId}.no-section-titles`));
      window.localStorage.removeItem(scoped(`janus.ws.${workspaceId}.landing`));
      window.localStorage.removeItem(scoped(`janus.ws.${workspaceId}.appearance`));
      window.localStorage.removeItem(scoped(`janus.ws.${workspaceId}.favorites`));
    } catch {}
    setCompactMode(false);
    setShowSectionTitles(true);
    setDefaultLanding("");
    setAppearance({});
    setFavorites([]);
    clearAppearance();
    toast.success("All settings reset to defaults");
  }

  const sectionOrder = wsPrefs.sectionOrder ?? navSections.map((s) => s.title);
  const orderedSections = sectionOrder.map((title) => navSections.find((s) => s.title === title)).filter((s): s is NavSection => Boolean(s));
  const unordered = navSections.filter((s) => !sectionOrder.includes(s.title));
  const allSections = [...orderedSections, ...unordered];
  const allItems = navSections.flatMap((s) => s.items);

  const tabIcons = { sidebar: PanelLeft, appearance: Palette, behavior: SlidersHorizontal } as const;
  const tabs = [["sidebar", "Sidebar"], ["appearance", "Appearance"], ["behavior", "Behavior"]] as const;

  return <Dialog open onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle><Settings2 className="mr-2 inline size-4" />{name} — Workspace settings</DialogTitle>
        <DialogDescription>Customize sidebar, theme, colors, notifications and behavior. Changes apply to your view only.</DialogDescription>
      </DialogHeader>

      <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-surface-2 p-1" role="tablist">
        {tabs.map(([key, label]) => { const TabIcon = tabIcons[key]; return <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs transition-all ${tab === key ? "bg-surface font-medium text-foreground shadow-sm" : "text-muted-foreground hover:bg-surface/70 hover:text-foreground"}`}><TabIcon className="size-3.5" />{label}</button>; })}
      </div>

      {/* ─── SIDEBAR TAB ─── */}
      {tab === "sidebar" && <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div><p className="text-xs font-medium text-foreground">Navigation sections</p><p className="text-[11px] text-muted-foreground">Reorder sections, show/hide items, and star your favorites. Changes apply to your sidebar only.</p></div>
          <Button size="sm" variant="outline" onClick={resetAll} className="gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"><RefreshCw className="size-3" />Reset</Button>
        </div>

        {favorites.length > 0 && <div className="rounded-lg border border-accent-border/40 bg-accent-muted/30 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-accent">Pinned favorites</p>
          <div className="flex flex-wrap gap-1.5">
            {favorites.map((href) => { const item = allItems.find((i) => i.href === href); if (!item) return null; const Icon = item.icon; return <span key={href} className="flex items-center gap-1.5 rounded-md border border-accent-border/30 bg-surface px-2 py-1 text-xs"><Icon className="size-3 text-accent" />{item.label}<button type="button" onClick={() => toggleFavorite(href)} className="ml-0.5 text-muted-foreground hover:text-danger"><X className="size-3" /></button></span>; })}
          </div>
        </div>}

        {allSections.map((section, sectionIndex) => {
          const isCollapsed = collapsedSections.includes(section.title);
          const visibleCount = section.items.filter((item) => !hiddenItems.includes(item.href)).length;
          return <div key={section.title} className="rounded-lg border border-border bg-surface">
            <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
              <GripVertical className="size-3.5 text-muted-foreground/50" />
              <span className="flex-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{section.title}</span>
              <span className="text-[10px] text-muted-foreground">{visibleCount}/{section.items.length}</span>
              <div className="flex gap-0.5">
                <button type="button" onClick={() => moveSectionUp(sectionIndex)} disabled={sectionIndex === 0} className="rounded p-0.5 text-muted-foreground hover:bg-surface-2 disabled:opacity-30"><ChevronUp className="size-3.5" /></button>
                <button type="button" onClick={() => moveSectionDown(sectionIndex)} disabled={sectionIndex === allSections.length - 1} className="rounded p-0.5 text-muted-foreground hover:bg-surface-2 disabled:opacity-30"><ChevronDown className="size-3.5" /></button>
                <button type="button" onClick={() => toggleSection(section.title)} className="rounded p-0.5 text-muted-foreground hover:bg-surface-2">{isCollapsed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}</button>
              </div>
            </div>
            {!isCollapsed && <div className="divide-y divide-border/40">
              {section.items.map((item) => {
                const hidden = hiddenItems.includes(item.href);
                const isFav = favorites.includes(item.href);
                const Icon = item.icon;
                return <div key={item.href} className={`flex items-center gap-3 px-3 py-2 ${hidden && !item.essential ? "opacity-40" : ""}`}>
                  <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 text-xs text-foreground">{item.label}{item.essential && <span className="ml-1 text-[10px] text-muted-foreground">(core)</span>}</span>
                  <button type="button" onClick={() => toggleFavorite(item.href)} title={isFav ? "Unpin" : "Pin to favorites"} className={`rounded p-0.5 transition-colors ${isFav ? "text-accent" : "text-muted-foreground/40 hover:text-accent"}`}><svg viewBox="0 0 16 16" fill={isFav ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" className="size-3.5"><polygon points="8,1.5 10,6 15,6.5 11.5,10 12.5,15 8,12.5 3.5,15 4.5,10 1,6.5 6,6" /></svg></button>
                  {item.essential ? <Switch checked disabled className="opacity-50" /> : <Switch checked={!hidden} onCheckedChange={() => toggleItem(item.href)} />}
                </div>;
              })}
            </div>}
          </div>;
        })}
      </div>}

      {/* ─── APPEARANCE TAB ─── */}
      {tab === "appearance" && <div className="flex flex-col gap-5">

        {/* Theme mode */}
        <div>
          <p className="mb-1 text-xs font-medium text-foreground">Theme mode</p>
          <p className="mb-3 text-[11px] text-muted-foreground">Choose light, dark or match your system. Each workspace remembers its own mode.</p>
          <div className="grid grid-cols-3 gap-2">
            {([["light", "Light", Sun], ["dark", "Dark", Moon], ["system", "System", Monitor]] as const).map(([mode, label, Icon]) => <button key={mode} type="button" onClick={() => updateAppearance({ themeMode: mode })} className={`flex flex-col items-center gap-2 rounded-lg border p-3 transition-colors ${(appearance.themeMode ?? "light") === mode ? "border-accent-border bg-accent-muted" : "border-border bg-surface hover:bg-surface-2"}`}>
              <Icon className="size-5 text-foreground" />
              <span className="text-xs font-medium">{label}</span>
            </button>)}
          </div>
        </div>

        {/* Color theme */}
        <div>
          <p className="mb-1 text-xs font-medium text-foreground">Color theme</p>
          <p className="mb-3 text-[11px] text-muted-foreground">Choose a preset or define custom accent and sidebar colors. Each workspace can have its own look.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {COLOR_THEMES.map((theme) => <button key={theme.id} type="button" onClick={() => selectTheme(theme.id)} className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${selectedTheme.id === theme.id ? "border-accent-border bg-accent-muted" : "border-border bg-surface hover:bg-surface-2"}`}>
              {theme.id !== "custom" ? <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: theme.sidebarBg, border: "1px solid var(--border)" }}><span className="size-3 rounded-full" style={{ backgroundColor: theme.accent }} /></span> : <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-surface"><Sparkles className="size-3 text-muted-foreground" /></span>}
              <span className="min-w-0"><span className="block text-xs font-medium">{theme.name}</span><span className="block text-[10px] text-muted-foreground">{theme.desc}</span></span>
            </button>)}
          </div>
        </div>

        {/* Custom color pickers — prism spectrum */}
        {selectedTheme.id === "custom" && <div className="rounded-lg border border-border bg-surface-2 p-4">
          <p className="mb-4 text-xs font-medium text-foreground">Custom colors</p>
          <div className="flex flex-col gap-5">
            <PrismColorPicker label="Accent color" value={appearance.accentColor ?? "#2563eb"} swatches={ACCENT_SWATCHES} onChange={(color) => updateAppearance({ accentColor: color })} />
            <PrismColorPicker label="Sidebar background" value={appearance.sidebarBg ?? "#ffffff"} swatches={SIDEBAR_BG_SWATCHES} onChange={(color) => updateAppearance({ sidebarBg: color })} />
          </div>
        </div>}

        {/* Typography */}
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-3 flex items-center gap-2"><Type className="size-3.5 text-accent" /><p className="text-xs font-medium text-foreground">Typography</p></div>
          <div className="flex flex-col gap-1">
            <SettingRow label="Font family" description="The typeface used across this workspace.">
              <Select value={appearance.fontFamily ?? "inter"} onValueChange={(v) => updateAppearance({ fontFamily: v })}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="inter">Inter (default)</SelectItem>
                  <SelectItem value="system">System font</SelectItem>
                  <SelectItem value="mono">JetBrains Mono</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>
            <SettingRow label="Font scale" description="Adjust the base font size across this workspace.">
              <Select value={appearance.fontScale ?? "100"} onValueChange={(v) => updateAppearance({ fontScale: v })}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="85">Small (85%)</SelectItem>
                  <SelectItem value="90">Compact (90%)</SelectItem>
                  <SelectItem value="100">Default (100%)</SelectItem>
                  <SelectItem value="110">Large (110%)</SelectItem>
                  <SelectItem value="120">Extra large (120%)</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>
          </div>
        </div>

        {/* Layout & density */}
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-3 flex items-center gap-2"><PanelLeft className="size-3.5 text-accent" /><p className="text-xs font-medium text-foreground">Layout & density</p></div>
          <div className="flex flex-col gap-1">
            <SettingRow label="Content density" description="How tight the UI feels — more content or more breathing room.">
              <Select value={appearance.contentDensity ?? "comfortable"} onValueChange={(v) => updateAppearance({ contentDensity: v })}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="compact">Compact</SelectItem>
                  <SelectItem value="comfortable">Comfortable</SelectItem>
                  <SelectItem value="spacious">Spacious</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>
            <SettingRow label="Corner roundness" description="Border radius on cards, buttons and inputs.">
              <Select value={appearance.borderRadius ?? "0px"} onValueChange={(v) => updateAppearance({ borderRadius: v })}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0px">Sharp (0px)</SelectItem>
                  <SelectItem value="4px">Subtle (4px)</SelectItem>
                  <SelectItem value="8px">Rounded (8px)</SelectItem>
                  <SelectItem value="12px">Soft (12px)</SelectItem>
                  <SelectItem value="16px">Pill (16px)</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>
            <SettingRow label="Sidebar width" description="How wide the sidebar is on desktop.">
              <Select value={appearance.sidebarWidth ?? "default"} onValueChange={(v) => updateAppearance({ sidebarWidth: v })}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="narrow">Narrow (220px)</SelectItem>
                  <SelectItem value="default">Default (258px)</SelectItem>
                  <SelectItem value="wide">Wide (300px)</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>
            <SettingRow label="Sidebar position" description="Which side the sidebar sits on.">
              <Select value={appearance.sidebarPosition ?? "left"} onValueChange={(v) => updateAppearance({ sidebarPosition: v })}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>
            <SettingRow label="Compact sidebar" description="Tighter spacing between menu items.">
              <Switch checked={compactMode} onCheckedChange={(checked) => { setCompactMode(checked); try { window.localStorage.setItem(scoped(`janus.ws.${workspaceId}.compact`), String(checked)); } catch {} }} />
            </SettingRow>
            <SettingRow label="Show section titles" description="Category headers above groups of menu items.">
              <Switch checked={showSectionTitles} onCheckedChange={(checked) => { setShowSectionTitles(checked); try { window.localStorage.setItem(scoped(`janus.ws.${workspaceId}.no-section-titles`), String(!checked)); } catch {} }} />
            </SettingRow>
            <SettingRow label="Icon style" description="How icons look in the sidebar.">
              <Select value={appearance.iconStyle ?? "outline"} onValueChange={(v) => updateAppearance({ iconStyle: v })}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="outline">Outline</SelectItem>
                  <SelectItem value="filled">Filled</SelectItem>
                  <SelectItem value="duotone">Duotone</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>
            <SettingRow label="Auto-collapse sidebar" description="Collapse sidebar on smaller screens or always.">
              <Select value={appearance.autoCollapseSidebar ?? "mobile"} onValueChange={(v) => updateAppearance({ autoCollapseSidebar: v })}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">Never</SelectItem>
                  <SelectItem value="mobile">On mobile</SelectItem>
                  <SelectItem value="always">Always</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>
          </div>
        </div>

        {/* Accessibility */}
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-3 flex items-center gap-2"><Eye className="size-3.5 text-accent" /><p className="text-xs font-medium text-foreground">Accessibility</p></div>
          <div className="flex flex-col gap-1">
            <SettingRow label="Reduce motion" description="Minimize animations and transitions for motion sensitivity.">
              <Switch checked={appearance.reduceMotion ?? false} onCheckedChange={(checked) => updateAppearance({ reduceMotion: checked })} />
            </SettingRow>
            <SettingRow label="High contrast" description="Increase contrast between text and backgrounds.">
              <Switch checked={appearance.highContrast ?? false} onCheckedChange={(checked) => updateAppearance({ highContrast: checked })} />
            </SettingRow>
            <SettingRow label="Focus indicators" description="How visible keyboard focus outlines are.">
              <Select value={appearance.focusIndicators ?? "default"} onValueChange={(v) => updateAppearance({ focusIndicators: v })}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="enhanced">Enhanced</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>
          </div>
        </div>

        {/* Regional display */}
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-3 flex items-center gap-2"><Globe className="size-3.5 text-accent" /><p className="text-xs font-medium text-foreground">Regional display</p></div>
          <div className="flex flex-col gap-1">
            <SettingRow label="Language" description="Display language for this workspace.">
              <Select value="en" onValueChange={() => {}}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="hi" disabled>Hindi (coming soon)</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>
            <SettingRow label="Date format" description="How dates appear in tables, forms and reports.">
              <Select value={appearance.dateFormat ?? "DD/MM/YYYY"} onValueChange={(v) => updateAppearance({ dateFormat: v })}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                  <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                  <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                  <SelectItem value="DD-MMM-YYYY">DD-MMM-YYYY</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>
            <SettingRow label="Time format" description="12-hour with AM/PM or 24-hour clock.">
              <Select value={appearance.timeFormat ?? "12h"} onValueChange={(v) => updateAppearance({ timeFormat: v })}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="12h">12-hour (2:30 PM)</SelectItem>
                  <SelectItem value="24h">24-hour (14:30)</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>
            <SettingRow label="Number format" description="How large numbers are grouped.">
              <Select value={appearance.numberFormat ?? "indian"} onValueChange={(v) => updateAppearance({ numberFormat: v })}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="indian">Indian (1,00,000)</SelectItem>
                  <SelectItem value="international">Intl (100,000)</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>
            <SettingRow label="Currency display" description="Show the symbol or the ISO code.">
              <Select value={appearance.currencyDisplay ?? "symbol"} onValueChange={(v) => updateAppearance({ currencyDisplay: v })}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="symbol">Symbol (&#x20b9;)</SelectItem>
                  <SelectItem value="code">Code (INR)</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>
            <SettingRow label="First day of week" description="Which day calendars and week views start on.">
              <Select value={appearance.firstDayOfWeek ?? "monday"} onValueChange={(v) => updateAppearance({ firstDayOfWeek: v })}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monday">Monday</SelectItem>
                  <SelectItem value="sunday">Sunday</SelectItem>
                  <SelectItem value="saturday">Saturday</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>
          </div>
        </div>

        {/* Live preview */}
        <div className="rounded-lg border border-border bg-surface-2 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Live preview</p>
          <div className="flex gap-3 overflow-hidden rounded-md border border-border" style={{ fontSize: `${Number(appearance.fontScale ?? 100) / 100}em` }}>
            <div className="w-[180px] shrink-0 border-r border-border p-2" style={{ backgroundColor: appearance.sidebarBg ?? "#ffffff", borderRadius: appearance.borderRadius ?? "0px" }}>
              <div className="mb-2 h-3 rounded bg-muted-foreground/10" style={{ width: "60%" }} />
              {["Overview", "Leads", "Deals"].map((label) => <div key={label} className="flex items-center gap-1.5 rounded px-1.5 py-1" style={{ borderRadius: appearance.borderRadius ?? "0px" }}>
                <span className="size-2.5 rounded-sm" style={{ backgroundColor: appearance.accentColor ?? "#2563eb" }} />
                <span className="text-[10px]" style={{ color: (appearance.sidebarBg ?? "#ffffff") < "#808080" ? "#e2e8f0" : "#0a1424" }}>{label}</span>
              </div>)}
            </div>
            <div className="flex-1 p-3">
              <div className="mb-2 h-3 rounded bg-muted-foreground/10" style={{ width: "40%" }} />
              <div className="flex gap-2">
                <div className="h-8 flex-1 rounded border border-border bg-surface" style={{ borderRadius: appearance.borderRadius ?? "0px" }} />
                <div className="flex h-8 items-center justify-center rounded px-3 text-[10px] font-medium text-white" style={{ backgroundColor: appearance.accentColor ?? "#2563eb", borderRadius: appearance.borderRadius ?? "0px" }}>Save</div>
              </div>
            </div>
          </div>
        </div>
      </div>}

      {/* ─── BEHAVIOR TAB ─── */}
      {tab === "behavior" && <div className="flex flex-col gap-5">
        <div><p className="text-xs font-medium text-foreground">Workspace behavior</p><p className="mt-1 text-[11px] text-muted-foreground">Configure how this workspace behaves when you open it and use it day to day.</p></div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-3 flex items-center gap-2"><PanelLeft className="size-3.5 text-accent" /><p className="text-xs font-medium text-foreground">Navigation</p></div>
          <div className="flex flex-col gap-1">
            <SettingRow label="Default landing page" description="The first page you see when switching to this workspace.">
              <Select value={defaultLanding} onValueChange={(value) => { setDefaultLanding(value); try { if (value) window.localStorage.setItem(scoped(`janus.ws.${workspaceId}.landing`), value); else window.localStorage.removeItem(scoped(`janus.ws.${workspaceId}.landing`)); } catch {} toast.success(value ? "Default page set" : "Using workspace default"); }}>
                <SelectTrigger className="w-48"><SelectValue placeholder="Workspace default" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Workspace default</SelectItem>
                  {allItems.map((item) => <SelectItem key={item.href} value={item.href}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </SettingRow>
            <SettingRow label="Show recent items" description="Display recently visited pages in the sidebar for quick access.">
              <Switch checked={appearance.showRecentItems ?? true} onCheckedChange={(checked) => updateAppearance({ showRecentItems: checked })} />
            </SettingRow>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-3 flex items-center gap-2"><LockKeyhole className="size-3.5 text-accent" /><p className="text-xs font-medium text-foreground">Safety</p></div>
          <div className="flex flex-col gap-1">
            <SettingRow label="Confirm before delete" description="Ask for confirmation when deleting records, files and messages.">
              <Switch checked={appearance.confirmBeforeDelete ?? true} onCheckedChange={(checked) => updateAppearance({ confirmBeforeDelete: checked })} />
            </SettingRow>
            <SettingRow label="Keyboard shortcuts" description="Enable single-key shortcuts for common actions in this workspace.">
              <Switch checked={appearance.keyboardShortcuts ?? true} onCheckedChange={(checked) => updateAppearance({ keyboardShortcuts: checked })} />
            </SettingRow>
          </div>
        </div>
      </div>}

      <DialogFooter className="flex items-center justify-between border-t border-border pt-4 sm:justify-between">
        <Button size="sm" variant="outline" onClick={resetAll} className="gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"><RefreshCw className="size-3" />Reset everything</Button>
        <Button onClick={onClose}>Done</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

function WorkspaceMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-lg border border-border bg-surface p-4 shadow-sm transition-shadow hover:shadow-md"><span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span><p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;
}

type WorkspaceRecord = { id: string; type: string; name: string; description: string };
type WorkspacePerson = { membershipId: string; name: string; email: string; accessLevel: string };


function SectionTabs({ items, value, onChange }: { items: string[][]; value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface-2 p-1" role="tablist">
      {items.map(([itemValue, label]) => (
        <button
          key={itemValue}
          type="button"
          role="tab"
          aria-selected={value === itemValue}
          onClick={() => onChange(itemValue)}
          className={`rounded-md px-3 py-2 text-xs transition-colors ${value === itemValue ? "bg-surface font-medium text-foreground shadow-sm" : "text-muted-foreground hover:bg-surface/70 hover:text-foreground"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

type HrRecords = { records: Record<string, Array<{ key: string; data: Record<string, unknown> }>> };
type Department = { id: string; name: string; active?: boolean; headId?: string | null };

function RealStructure() {
  const spaces = apiUse<Array<{ type: string; status: string }>>("/workspaces");
  const hrOn = spaces.data?.some((item) => item.type === "hr_people" && item.status === "active");
  const hr = apiUse<HrRecords>(hrOn ? "/hr/records" : null);
  if (spaces.loading || (hrOn && hr.loading)) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!hrOn) return <div className="flex flex-col items-start gap-2"><UnavailableMessage text="Departments are kept in HR & People, which is not switched on for this business." /><Link href="/settings?tab=workspace&view=workspaces&workspace=business&activate=hr-people" className="text-sm font-medium text-accent hover:underline">Switch on HR &amp; People</Link></div>;
  if (hr.error) return <UnavailableMessage text={`Departments could not be read: ${hr.error}`} />;
  const setting = hr.data?.records.config?.find((item) => item.key === "org.departments")?.data.value;
  const departments = (Array.isArray(setting) ? (setting as Department[]) : []).filter((item) => item.active !== false);
  const employees = (hr.data?.records.employee ?? []).map((item) => item.data as { id: string; name?: string; department?: string; status?: string }).filter((item) => item.status !== "archived");
  if (departments.length === 0) return <div className="flex flex-col items-start gap-2"><UnavailableMessage text={`No departments yet${employees.length ? `, so the ${employees.length} ${employees.length === 1 ? "person" : "people"} in HR belong to none` : ""}.`} /><Link href="/workspace/hr-people?view=organization&workspace=hr-people" className="text-sm font-medium text-accent hover:underline">Add departments in HR &amp; People</Link></div>;
  const unplaced = employees.filter((item) => !departments.some((department) => department.name === item.department)).length;
  return (
    <ul className="divide-y divide-border">
      {departments.map((department) => {
        const people = employees.filter((item) => item.department === department.name).length;
        const head = employees.find((item) => item.id === department.headId)?.name;
        return (
          <li key={department.id} className="flex items-center justify-between gap-3 py-3 text-sm">
            <span className="font-medium">{department.name}{head ? <span className="font-normal text-muted-foreground"> · head {head}</span> : <span className="font-normal text-warning"> · no head</span>}</span>
            <span className="text-muted-foreground">{people} {people === 1 ? "person" : "people"}</span>
          </li>
        );
      })}
      {unplaced > 0 && <li className="flex items-center justify-between gap-3 py-3 text-sm"><span className="text-muted-foreground">In no department</span><span className="text-muted-foreground">{unplaced} {unplaced === 1 ? "person" : "people"}</span></li>}
    </ul>
  );
}

type SavedHours = { timezone: string; businessHoursStart: string | null; businessHoursEnd: string | null };

function LiveHours() {
  const saved = apiUse<SavedHours>("/business/setup");
  if (saved.loading) return <SectionCard><p className="text-sm text-muted-foreground">Loading your hours…</p></SectionCard>;
  if (saved.error || !saved.data) return <SectionCard title="Hours & timezone"><UnavailableMessage text={saved.error ?? "Your hours could not be loaded."} /></SectionCard>;
  return <HoursForm initial={saved.data} onSaved={saved.reload} />;
}

function HoursForm({ initial, onSaved }: { initial: SavedHours; onSaved: () => void }) {
  const [timezone, setTimezone] = React.useState(initial.timezone || "Asia/Kolkata");
  const [start, setStart] = React.useState(initial.businessHoursStart ?? "09:00");
  const [end, setEnd] = React.useState(initial.businessHoursEnd ?? "18:00");
  const [saving, setSaving] = React.useState(false);
  const dirty = timezone !== initial.timezone || start !== (initial.businessHoursStart ?? "09:00") || end !== (initial.businessHoursEnd ?? "18:00");
  const wrong = start && end && start >= end ? "Closing time must be after opening time." : "";
  const options = timezones.some((item) => item.value === timezone) ? timezones : [{ value: timezone, label: timezone }, ...timezones];
  async function save() {
    setSaving(true);
    try {
      await api("/business/setup", { method: "PATCH", body: JSON.stringify({ timezone, businessHoursStart: start, businessHoursEnd: end }) });
      toast.success("Hours saved");
      onSaved();
    } catch (error) { toast.error(message(error)); } finally { setSaving(false); }
  }
  return <SectionCard title="Hours & timezone" description="When your business is open, and the timezone it works in. Amounts are always in rupees.">
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <FieldRow label="Timezone"><Select value={timezone} onValueChange={setTimezone}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{options.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></FieldRow>
      <FieldRow label="Opens at"><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></FieldRow>
      <FieldRow label="Closes at"><Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></FieldRow>
    </div>
    {wrong && <p role="alert" className="mt-2 text-xs text-danger">{wrong}</p>}
    <p className="mt-3 text-[11px] text-muted-foreground">Saved with your business. Janus does not yet hold back messages or workflows outside these hours.</p>
    <div className="mt-4 flex justify-end"><Button disabled={!dirty || Boolean(wrong) || saving} onClick={save}>{saving ? "Saving…" : "Save hours"}</Button></div>
  </SectionCard>;
}
