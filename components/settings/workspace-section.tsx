"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Bell, LockKeyhole, Plus, RefreshCw, Sparkles, UserRound, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { SectionCard, FieldRow } from "@/components/settings/section-ui";
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
import { workspaceDefinitions } from "@/lib/workspace-config";
import { api, message } from "@/lib/api/client";
import { useApi as apiUse } from "@/lib/api/use-api";
import { CompanyProfileSection } from "@/components/settings/company-profile-section";
import { ProfileCard } from "@/components/settings/profile-card";
import { BillingSection } from "@/components/settings/billing-section";
import { formatCurrencyINR } from "@/lib/utils";
import { LiveBusinessOverview } from "@/components/business/business-overview";
import { inr, usePortfolioApi, type PortfolioPeriodKey, type PortfolioSummary } from "@/features/portfolio";
import { LiveAccessReview, LiveDataExport } from "@/components/business/company-settings";
import { useSession } from "@/components/auth/session-provider";

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
    <div className="mt-4 flex flex-col gap-6 rounded-xl bg-[#faf9f5] p-4 sm:mt-5 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Business Overview</h1>
        <p className="mt-3 text-sm text-muted-foreground">This view is for the Owner and users with Report access. Ask an Owner to grant you the Reports permission if you need it.</p>
      </div>
    </div>
  );
  return (
    <div className="mt-4 flex flex-col gap-6 rounded-xl bg-[#faf9f5] p-4 sm:mt-5 sm:p-6">
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

      <section className="flex flex-col justify-between gap-4 rounded-xl border border-[#e4e4df] bg-white p-5 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-muted text-accent"><Sparkles className="size-4" /></span>
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
    <div className="h-24 animate-pulse rounded-xl border border-[#e4e4df] bg-white" />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((item) => <div key={item} className="h-[104px] animate-pulse rounded-lg border border-[#e4e4df] bg-white" />)}</div>
    <div className="h-64 animate-pulse rounded-xl border border-[#e4e4df] bg-white" />
  </div>;
}

function OverviewKpi({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-xl border border-[#e4e4df] bg-white p-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;
}

function UnavailableMessage({ text }: { text: string }) { return <div className="rounded-md border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">{text}</div>; }

function WorkspacesPanel() {
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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Workspaces</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Create and manage the workspaces your business uses.</p>
        </div>
        {available.length > 0 && <Button size="sm" onClick={() => openActivate()}><Plus className="size-3.5" />Activate workspace</Button>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <WorkspaceMetric label="Active workspaces" value={ready ? String(created.length) : "—"} detail={ready && created.some((workspace) => staffing(workspace.id)?.warn) ? `${created.filter((workspace) => staffing(workspace.id)?.warn).length} without a manager` : "Switched on for this business"} />
        <WorkspaceMetric label="Available to activate" value={ready ? String(available.length) : "—"} detail="Department workspaces" />
      </div>

      <SectionCard title="Active workspaces" description="These are the workspaces currently enabled for this business. Open one to enter its workflow.">
        <div className="grid gap-3 lg:grid-cols-2">
          {!ready && <p className="text-sm text-muted-foreground">Loading workspaces…</p>}
          {created.map((workspace) => {
            const team = staffing(workspace.id);
            return <WorkspaceCard key={workspace.id} name={recordFor(workspace.id)?.name || workspace.name} description={recordFor(workspace.id)?.description || workspace.description} staffing={team?.text} warn={team?.warn} href={workspace.id === "crm-sales" ? "/dashboard?workspace=crm-sales" : workspace.id === "team-chat" ? "/team?workspace=team-chat" : `/workspace/${workspace.id}?workspace=${workspace.id}`} />;
          })}
        </div>
        {created.some((workspace) => staffing(workspace.id)?.warn) && <p className="mt-3 text-xs text-muted-foreground">A workspace without a manager leaves its approvals and follow-ups to you. <Link href="/settings?tab=team" className="text-accent hover:underline">Give it a manager in People & Access</Link></p>}
        {loadError && <div className="mt-3 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800">The workspace list could not be loaded: {loadError}. Showing the usual workspaces.</div>}
      </SectionCard>

      {ready && available.length > 0 && <SectionCard title="Available workspaces" description="Switch on a department when you are ready. Its records stay separate, and you choose who joins it.">
        <div className="grid gap-3 sm:grid-cols-2">
          {available.map((workspace) => (
            <div key={workspace.id} className="flex items-center gap-3 rounded-lg border border-dashed border-border px-4 py-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-muted text-accent"><Plus className="size-4" /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-foreground">{workspace.name}</span><span className="mt-1 block text-xs text-muted-foreground">{workspace.description}</span></span>
              <Button size="sm" variant="secondary" onClick={() => openActivate(workspace.id)}>Activate</Button>
            </div>
          ))}
        </div>
      </SectionCard>}

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
    </div>
  );
}

function WorkspaceMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-lg border border-border bg-surface p-4"><span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span><p className="mt-2 text-xl font-semibold text-foreground">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;
}

type WorkspaceRecord = { id: string; type: string; name: string; description: string };
type WorkspacePerson = { membershipId: string; name: string; email: string; accessLevel: string };

function WorkspaceCard({ name, description, href, staffing, warn = false }: { name: string; description: string; href: string; staffing?: string; warn?: boolean }) {
  return <Link href={href} className="group flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-4 transition-colors hover:border-accent-border hover:bg-surface-2"><span className="flex min-w-0 flex-1 flex-col gap-1"><span className="flex items-center gap-2 text-sm font-medium text-foreground">{name}<Badge variant="success">Active</Badge></span><span className="text-xs text-muted-foreground">{description}</span>{staffing && <span className={`text-xs ${warn ? "text-warning" : "text-muted-foreground"}`}>{staffing}</span>}</span><ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-accent" /></Link>;
}

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
