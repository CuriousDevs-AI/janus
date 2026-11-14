"use client";

import * as React from "react";
import { activeSpec } from "@/lib/companies";
import { useSession } from "@/components/auth/session-provider";
import { lakh, stats as crm } from "@/lib/demo-universe";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import type { HrEmployee, HrLeaveRequest } from "@/lib/types";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, BarChart3, Bookmark, CalendarClock, Download, ExternalLink, FileBarChart, Filter, Pin, Search, Share2, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AcquisitionSection } from "@/components/analytics/acquisition-section";
import { SalesSection } from "@/components/analytics/sales-section";
import { AiSection } from "@/components/analytics/ai-section";
import { SupportSection } from "@/components/analytics/support-section";
import { CustomerSection } from "@/components/analytics/customer-section";
import { AutomationSection } from "@/components/analytics/automation-section";
import { useWorkspace } from "@/components/layout/workspace-context";
import { useApi } from "@/lib/api/use-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/settings/section-ui";
import { reportCatalogue as baseCatalogue, reportDepartments, type ReportDefinition, type ReportDepartment } from "@/lib/report-catalogue";
import { demoMode } from "@/lib/demo-mode";
import { todayIso } from "@/lib/today";
import { FilterChips } from "@/components/shared/stat-tile";
import { reportsFromRecords, type ReportFigures, type ReportFiguresOut, type ReportPeriod, type ReportRow } from "@/components/business/report-figures";
import { SaveReportDialog, SavedReportsPanel, ScheduleReportDialog, SchedulesPanel, type ReportSchedule, type SavedReport } from "@/components/business/report-keeping";
import { api, message } from "@/lib/api/client";
import { toast } from "sonner";
import { usePortfolioApi } from "@/features/portfolio";

type Summary = { leads: number; openDeals: number; wonDeals: number; pipelineValue: string };
type ReportTab = "library" | "my" | "scheduled";
export default function AnalyticsPage() {
  const { workspaceId } = useWorkspace();
  const businessReports = workspaceId === "business";
  // AI and automation figures cover the whole company, so only people with company-wide access see them.
  const companyWide = useSession().permissions.includes("*");
  // Panels stay mounted but hidden, and a hidden chart measures 0×0; draw only the open tab's charts.
  const [tab, setTab] = React.useState("acquisition");
  if (businessReports) return <BusinessReports />;
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col">
      <PageHeader title="Analytics" description="Acquisition, sales, AI operations, support, customer health and automation — last 30 days." />
      <Tabs value={tab} onValueChange={setTab} className="px-6 pb-8">
        <TabsList><TabsTrigger value="acquisition">Acquisition</TabsTrigger><TabsTrigger value="sales">Sales</TabsTrigger>{companyWide && <TabsTrigger value="ai">AI</TabsTrigger>}<TabsTrigger value="support">Support</TabsTrigger><TabsTrigger value="customer">Customer</TabsTrigger>{companyWide && <TabsTrigger value="automation">Automation</TabsTrigger>}</TabsList>
        <TabsContent value="acquisition" className="pt-5">{tab === "acquisition" && <AcquisitionSection />}</TabsContent>
        <TabsContent value="sales" className="pt-5">{tab === "sales" && <SalesSection />}</TabsContent>
        {companyWide && <TabsContent value="ai" className="pt-5">{tab === "ai" && <AiSection />}</TabsContent>}
        <TabsContent value="support" className="pt-5">{tab === "support" && <SupportSection />}</TabsContent>
        <TabsContent value="customer" className="pt-5">{tab === "customer" && <CustomerSection />}</TabsContent>
        {companyWide && <TabsContent value="automation" className="pt-5">{tab === "automation" && <AutomationSection />}</TabsContent>}
      </Tabs>
    </div>
  );
}

const demoSaved: SavedReport[] = [
  { id: "demo-saved-pipeline", name: "Weekly pipeline review", report: "sales-pipeline", period: "month", note: "Reviewed every Monday", createdByName: "Pankaj Neema", createdAt: "2026-10-05T09:00:00+05:30", mine: true },
  { id: "demo-saved-sales", name: "Board pack: sales this quarter", report: "sales-summary", period: "quarter", note: "", createdByName: "Sales team", createdAt: "2026-10-01T09:00:00+05:30", mine: false },
];
const demoSchedules: ReportSchedule[] = [
  { id: "demo-schedule-sales", report: "sales-summary", reportName: "Sales summary", period: "month", frequency: "weekly", recipients: [{ id: "1", name: "Owner", email: `owner@${activeSpec.company.domain}` }], paused: false, nextDueAt: "2026-11-16T09:00:00+05:30", lastSentAt: "2026-11-09T09:00:00+05:30", lastProblem: null, createdByName: "Owner" },
];

function BusinessReports() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const legacySection = searchParams.get("section");
  const activeTab: ReportTab = rawTab === "my" || rawTab === "scheduled" ? rawTab : legacySection === "scheduled" ? "scheduled" : legacySection === "custom" ? "my" : "library";
  const reportId = searchParams.get("report");
  const rawPeriod = searchParams.get("period");
  const periodKey: ReportPeriod = rawPeriod === "quarter" || rawPeriod === "fy" ? rawPeriod : "month";
  // Every report's figures from the company's own records, read by the API the same way the
  // scheduled emails are. A role that cannot read the records keeps the CRM summary alone.
  const figures = usePortfolioApi<ReportFiguresOut>(demoMode ? null : `/business/reports/figures?period=${periodKey}`, { keepPrevious: true });
  const found = React.useMemo(() => figures.data?.figures ?? {}, [figures.data]);
  const spaces = useApi<Array<{ type: string; status: string }>>(demoMode ? null : "/workspaces");
  const reportCatalogue = React.useMemo(() => demoCatalogue.map((item) => found[item.id] ? { ...item, live: true } : item), [found]);
  const names = React.useMemo(() => new Map(reportCatalogue.map((item) => [item.id, item.name])), [reportCatalogue]);
  const report = reportCatalogue.find((item) => item.id === reportId);
  const [query, setQuery] = React.useState("");
  const [department, setDepartment] = React.useState<ReportDepartment | "All">("All");
  const livePins = useApi<{ reports: string[] }>(demoMode ? null : "/business/reports/pins");
  const [localPins, setLocalPins] = React.useState<string[] | null>(null);
  const pinned = localPins ?? livePins.data?.reports ?? ["sales-summary"];
  const liveSaved = useApi<SavedReport[]>(demoMode || activeTab !== "my" ? null : "/business/reports/saved");
  const liveSchedules = useApi<ReportSchedule[]>(demoMode ? null : "/business/reports/schedules");
  const [demoSavedList, setDemoSavedList] = React.useState(demoSaved);
  const [demoScheduleList, setDemoScheduleList] = React.useState(demoSchedules);
  const saved = demoMode ? demoSavedList : liveSaved.data ?? [];
  const schedules = demoMode ? demoScheduleList : liveSchedules.data ?? [];
  const [saving, setSaving] = React.useState<{ report: string; period: ReportPeriod } | "new" | null>(null);
  const [scheduling, setScheduling] = React.useState<string | "new" | null>(null);
  const liveReports = reportCatalogue.filter((item) => item.live);

  function setTab(tab: ReportTab) { router.replace(`/analytics?workspace=business&tab=${tab}`); }
  function openReport(definition: ReportDefinition, period: ReportPeriod = periodKey) { router.push(`/analytics?workspace=business&tab=library&report=${definition.id}&period=${period}`); }
  function connectWorkspace(definition: ReportDefinition) { router.push(`/settings?tab=workspace&view=workspaces&workspace=business&activate=${definition.requiredWorkspace}`); }
  function togglePin(id: string) {
    const next = pinned.includes(id) ? pinned.filter((item) => item !== id) : [...pinned, id];
    setLocalPins(next);
    if (!demoMode) api("/business/reports/pins", { method: "PUT", body: JSON.stringify({ reports: next }) }).catch((error) => { toast.error(message(error)); setLocalPins(pinned); });
  }
  async function saveReport(value: { name: string; report: string; period: ReportPeriod; note: string }) {
    if (demoMode) setDemoSavedList((current) => [...current, { ...value, id: `demo-${Date.now()}`, createdByName: "You", createdAt: new Date().toISOString(), mine: true }]);
    else { await api("/business/reports/saved", { method: "POST", body: JSON.stringify(value) }); liveSaved.reload(); }
    setSaving(null);
    toast.success(`“${value.name}” saved under My reports.`);
  }
  async function deleteSaved(item: SavedReport) {
    if (demoMode) { setDemoSavedList((current) => current.filter((other) => other.id !== item.id)); return; }
    await api(`/business/reports/saved/${item.id}`, { method: "DELETE" });
    liveSaved.reload();
  }
  async function saveSchedule(value: { report: string; period: ReportPeriod; frequency: ReportSchedule["frequency"]; recipients: number[] }) {
    if (demoMode) setDemoScheduleList((current) => [...current, { id: `demo-${Date.now()}`, report: value.report, reportName: names.get(value.report) ?? value.report, period: value.period, frequency: value.frequency, recipients: value.recipients.map((id) => ({ id: String(id), name: "Team member", email: "" })), paused: false, nextDueAt: null, lastSentAt: null, lastProblem: null, createdByName: "You" }]);
    else { await api("/business/reports/schedules", { method: "POST", body: JSON.stringify(value) }); liveSchedules.reload(); }
    setScheduling(null);
    toast.success(`${names.get(value.report) ?? "The report"} will be emailed ${value.frequency === "daily" ? "every morning" : value.frequency === "weekly" ? "every Monday" : "on the 1st"} at 9:00.`);
  }
  const visible = reportCatalogue.filter((item) => (department === "All" || item.department === department) && `${item.name} ${item.description}`.toLowerCase().includes(query.toLowerCase()));
  // A department is connected once its workspace is switched on for the business.
  const activeTypes = new Set((spaces.data ?? []).filter((item) => item.status === "active").map((item) => item.type.replaceAll("_", "-")));
  const connectedDepartments = new Set<ReportDepartment>(demoMode ? ["Sales", "HR"] : ["Sales", ...reportDepartments.filter((dept) => reportCatalogue.some((item) => item.department === dept && activeTypes.has(item.requiredWorkspace)))]);
  const pinnedReports = visible.filter((item) => pinned.includes(item.id));
  const mostUsed = visible.filter((item) => item.department === "Sales").slice(0, 4);
  const dialogs = <>
    {saving && <SaveReportDialog reports={reportCatalogue} initial={saving === "new" ? undefined : saving} onClose={() => setSaving(null)} onSave={saveReport} />}
    {scheduling && <ScheduleReportDialog reports={liveReports} initial={scheduling === "new" ? undefined : scheduling} onClose={() => setScheduling(null)} onSave={saveSchedule} />}
  </>;

  if (report) return <><ReportView definition={report} found={found[report.id] ?? null} readable={figures.data?.readable ?? false} periodLabel={figures.data?.period?.label} periodKey={periodKey} loading={figures.loading} stale={figures.stale} onBack={() => router.replace(`/analytics?workspace=business&tab=library`)} onSchedule={() => setScheduling(report.id)} onSave={() => setSaving({ report: report.id, period: periodKey })} />{dialogs}</>;

  return <div className="mx-auto flex max-w-[1400px] flex-col"><PageHeader title="Business Reports" description="Ready-made reports from your own records, one workspace at a time." />
    <div role="tablist" className="janus-tab-strip sticky top-0 z-20 mx-6 flex gap-1 overflow-x-auto rounded-lg bg-surface-2 p-1"><ReportTabButton active={activeTab === "library"} onClick={() => setTab("library")}>Library</ReportTabButton><ReportTabButton active={activeTab === "my"} onClick={() => setTab("my")}>My reports</ReportTabButton><ReportTabButton active={activeTab === "scheduled"} onClick={() => setTab("scheduled")}>Scheduled</ReportTabButton></div>
    {activeTab === "library" && <><div className="grid gap-3 px-6 pt-4 sm:grid-cols-3"><ReportSummaryCard label="Reports with figures" value={String(liveReports.length)} detail="Filled from your own records" /><ReportSummaryCard label="Departments connected" value={`${connectedDepartments.size} / ${reportDepartments.length}`} detail="Connect more workspaces to expand coverage" /><ReportSummaryCard label="Emailed on a schedule" value={String(schedules.filter((item) => !item.paused).length)} detail={schedules.length ? "Reports going to your team" : "None yet: open a report and choose Schedule"} /></div><div className="flex flex-col gap-5 px-6 py-5"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="relative w-full max-w-md"><Search className="pointer-events-none absolute left-3 top-2.5 size-3.5 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reports" aria-label="Search reports" className="pl-9" /></div><div className="flex items-center gap-2 text-xs text-muted-foreground"><Filter className="size-3.5" /><label htmlFor="report-department" className="sr-only">Department</label><select id="report-department" value={department} onChange={(event) => setDepartment(event.target.value as ReportDepartment | "All")} className="h-9 min-w-44 rounded-md border border-input bg-surface-2 px-3 text-sm text-foreground"><option value="All">All departments</option>{reportDepartments.map((item) => <option key={item} value={item}>{item}</option>)}</select></div></div><SectionCard title={pinnedReports.length ? "Pinned reports" : "Most used"} description={pinnedReports.length ? "Kept at the top for you, on every device." : "Pin a report to keep it here."}><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">{(pinnedReports.length ? pinnedReports : mostUsed).map((item) => <ReportCard key={item.id} report={item} pinned={pinned.includes(item.id)} onPin={() => togglePin(item.id)} onOpen={() => openReport(item)} />)}</div>{(pinnedReports.length ? pinnedReports : mostUsed).length === 0 && <EmptyState title="No reports match your search" description="Try another report name or department." />}</SectionCard><div className="flex flex-col gap-6">{reportDepartments.map((dept) => { const cards = visible.filter((item) => item.department === dept); const catalogCards = cards.filter((item) => !pinned.includes(item.id)); const departmentMatches = `${dept} ${reportCatalogue.find((item) => item.department === dept)?.requiredWorkspace ?? ""}`.toLowerCase().includes(query.toLowerCase()); if (department !== "All" && department !== dept) return null; if (!connectedDepartments.has(dept)) { if (!departmentMatches) return null; const definition = reportCatalogue.find((item) => item.department === dept)!; return <DisconnectedDepartment key={dept} department={dept} definition={definition} onConnect={() => connectWorkspace(definition)} />; } if (catalogCards.length === 0) return null; return <section key={dept}><h2 className="mb-3 text-base font-semibold">{dept}</h2><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{catalogCards.map((item) => <ReportCard key={item.id} report={item} pinned={pinned.includes(item.id)} onPin={() => togglePin(item.id)} onOpen={() => openReport(item)} />)}</div></section>; })}</div></div></>}
    {activeTab === "my" && <div className="px-6 py-5"><SavedReportsPanel saved={saved} loading={!demoMode && liveSaved.loading} error={demoMode ? undefined : liveSaved.error} names={names} onNew={() => setSaving("new")} onOpen={(item) => { const definition = reportCatalogue.find((entry) => entry.id === item.report); if (definition) openReport(definition, item.period); }} onDelete={deleteSaved} /></div>}
    {activeTab === "scheduled" && <div className="px-6 py-5"><SchedulesPanel schedules={schedules} loading={!demoMode && liveSchedules.loading} error={demoMode ? undefined : liveSchedules.error} demo={demoMode} onNew={() => setScheduling("new")} onChanged={(next) => { if (demoMode && next) setDemoScheduleList(next); else liveSchedules.reload(); }} /></div>}
    {dialogs}
  </div>;
}

function ReportSummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="rounded-lg border border-border bg-surface p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs leading-4 text-muted-foreground">{detail}</p></div>; }
function ReportTabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`shrink-0 rounded-sm px-3 py-2 text-[12px] transition-colors ${active ? "bg-white font-medium text-foreground shadow-sm" : "text-muted-foreground hover:bg-white/70 hover:text-foreground"}`}>{children}</button>; }

function ReportCard({ report, pinned, onPin, onOpen }: { report: ReportDefinition; pinned: boolean; onPin: () => void; onOpen: () => void }) {
  return <div className="group flex flex-col rounded-lg border border-border bg-surface p-4 transition-colors hover:border-accent-border hover:bg-surface-2"><div className="flex items-start justify-between gap-3"><button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-start gap-2 text-left"><span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-muted text-accent"><FileBarChart className="size-4" /></span><span className="min-w-0"><span className="block text-sm font-semibold">{report.name}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{report.description}</span></span></button><button type="button" aria-label={`${pinned ? "Unpin" : "Pin"} ${report.name}`} onClick={onPin} className={`rounded-md p-1.5 ${pinned ? "text-accent" : "text-muted-foreground opacity-60 hover:opacity-100"}`}><Pin className="size-3.5" fill={pinned ? "currentColor" : "none"} /></button></div><div className="mt-4 flex items-center justify-between gap-2 text-[11px] text-muted-foreground"><span>{report.live ? "From your records" : reportsFromRecords.has(report.id) ? "Shows once there are records" : "Coming soon"}</span><button type="button" onClick={onOpen} className="font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100">Open <ExternalLink className="inline size-3" /></button></div></div>;
}

/** In the demo the HR workspace is connected, so its three reports are live. */
const demoCatalogue: ReportDefinition[] = baseCatalogue.map((item) => demoMode && item.department === "HR" ? { ...item, live: true } : item);

/** Headcount, leave and payroll figures for the Owner, taken from the HR workspace records. */
function hrReportMetrics(id: string, people: HrEmployee[], leaves: HrLeaveRequest[]): string[][] | null {
  const active = people.filter((item) => item.status !== "archived");
  const today = todayIso();
  if (id === "headcount") return [["Employees", String(active.length)], ["Departments", String(new Set(active.map((item) => item.department)).size)], ["On notice", String(active.filter((item) => item.status === "notice").length)], ["Joined in the last 90 days", String(active.filter((item) => item.joiningDate >= "2026-07-26").length)]];
  if (id === "attendance-leave") return [["On leave today", String(leaves.filter((item) => item.status === "approved" && item.from <= today && item.to >= today).length)], ["Approved leave days, October", String(leaves.filter((item) => item.status === "approved" && item.from >= "2026-10-01" && item.from <= "2026-10-31").reduce((sum, item) => sum + item.days, 0))], ["Waiting for approval", String(leaves.filter((item) => item.status === "pending").length)], ["Needs clarification", String(leaves.filter((item) => item.status === "needs_clarification").length)]];
  if (id === "payroll-cost") { const total = active.reduce((sum, item) => sum + item.salaryMonthly, 0); return [["Monthly gross pay", lakh(total)], ["People on payroll", String(active.length)], ["Average per person", `₹${Math.round(total / Math.max(1, active.length)).toLocaleString("en-IN")}`], ["Per year", lakh(total * 12)]]; }
  return null;
}

function DisconnectedDepartment({ department, definition, onConnect }: { department: ReportDepartment; definition: ReportDefinition; onConnect: () => void }) { return <div className="flex flex-col items-start justify-between gap-3 rounded-lg border border-dashed border-border bg-surface-2 px-4 py-3 sm:flex-row sm:items-center"><div><p className="text-sm font-medium">{department}</p><p className="mt-1 text-xs text-muted-foreground">Connect {definition.requiredWorkspace.replaceAll("-", " ")} to unlock reports.</p></div><Button size="sm" variant="secondary" onClick={onConnect}>Connect</Button></div>; }

function ReportView({ definition, found, readable, periodLabel, periodKey, loading, stale, onBack, onSchedule, onSave }: { definition: ReportDefinition; found: ReportFigures | null; readable: boolean; periodLabel?: string; periodKey: ReportPeriod; loading: boolean; stale: boolean; onBack: () => void; onSchedule: () => void; onSave: () => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromRecords = found;
  // Without the company's records (a role without Portfolio access), the two sales reports read the CRM summary.
  const sales = useApi<Summary>(!readable && definition.endpoint === "/business/reports/summary" ? definition.endpoint : null);
  const people = useHrPeopleStore((state) => state.employees);
  const leaves = useHrPeopleStore((state) => state.leaveRequests);
  const demoSummary = demoMode ? { leads: crm.leads, openDeals: crm.openDeals, wonDeals: crm.wonDeals, pipelineValue: lakh(crm.pipeline) } : undefined;
  const summaryData = sales.data ?? (sales.error ? demoSummary : undefined);
  const hrMetrics = demoMode && definition.department === "HR" ? hrReportMetrics(definition.id, people, leaves) : null;
  const legacy = hrMetrics ?? (summaryData && definition.id === "sales-summary" ? [["Leads", String(summaryData.leads)], ["Open deals", String(summaryData.openDeals)], ["Won deals", String(summaryData.wonDeals)], ["Pipeline", summaryData.pipelineValue]] : summaryData && definition.id === "sales-pipeline" ? [["Open deals", String(summaryData.openDeals)], ["Pipeline", summaryData.pipelineValue]] : null);
  const shown: ReportFigures | null = fromRecords ?? (legacy ? { covers: "now", rows: legacy.map(([label, value]) => ({ label, value })) } : null);
  const waiting = !shown && (loading || sales.loading);
  const hasBefore = Boolean(shown?.rows.some((row) => row.before !== undefined));
  const nowWord = shown?.covers === "month" ? "This month" : shown?.covers === "period" ? "This period" : "Now";
  const workspaceName = definition.requiredWorkspace.replaceAll("-", " ");

  function setPeriod(key: ReportPeriod) { const params = new URLSearchParams(searchParams.toString()); params.set("period", key); router.replace(`/analytics?${params.toString()}`); }
  function downloadCsv() {
    if (!shown) return;
    const cell = (value: string | undefined) => `"${(value ?? "").replaceAll("\"", "\"\"")}"`;
    const lines = [["Figure", nowWord, ...(hasBefore ? ["Before"] : []), "Change"], ...shown.rows.map((row) => [row.label, row.value, ...(hasBefore ? [row.before ?? ""] : []), row.change ?? ""])];
    const url = URL.createObjectURL(new Blob([lines.map((line) => line.map(cell).join(",")).join("\n")], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url; link.download = `${definition.id}-${shown.covers === "period" ? periodKey : todayIso()}.csv`; link.click();
    URL.revokeObjectURL(url);
  }
  function copyLink() { navigator.clipboard.writeText(window.location.href).then(() => toast.success("Link copied. Anyone who opens it needs access to Business Reports."), () => toast.error("The link could not be copied. Copy it from the address bar.")); }

  return <div className={`mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-6 py-6 transition-opacity ${stale ? "opacity-60" : ""}`}>
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div><button type="button" onClick={onBack} className="mb-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground print:hidden"><ArrowLeft className="size-3.5" />Back to Library</button>
        <div className="flex items-center gap-2"><Badge variant="neutral">{definition.department}</Badge>{shown ? <Badge variant="success">From your records</Badge> : !waiting && <Badge variant="warning">Not available</Badge>}</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{definition.name}</h1><p className="mt-1 text-sm text-muted-foreground">{definition.description}</p></div>
      <div className="flex flex-wrap gap-2 print:hidden"><Button size="sm" variant="secondary" disabled={!shown} onClick={() => window.print()}><Download className="size-3.5" />Print or PDF</Button><Button size="sm" variant="secondary" disabled={!shown} onClick={downloadCsv}><Download className="size-3.5" />CSV</Button><Button size="sm" variant="secondary" onClick={onSave}><Bookmark className="size-3.5" />Save</Button><Button size="sm" variant="secondary" disabled={!fromRecords && !demoMode} title={fromRecords || demoMode ? undefined : "Only a report with figures from your records can be emailed."} onClick={onSchedule}><CalendarClock className="size-3.5" />Schedule</Button><Button size="sm" variant="secondary" onClick={copyLink}><Share2 className="size-3.5" />Copy link</Button><Link href={`/ai?workspace=business&view=chat&report=${definition.id}&period=${periodKey}`}><Button size="sm"><Sparkles className="size-3.5" />Ask Janus</Button></Link></div>
    </div>
    {shown?.covers === "period" && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3"><span className="text-sm text-muted-foreground">{periodLabel ?? "This period"}, against the same days before</span><span className="print:hidden"><FilterChips<ReportPeriod> label="Period" value={periodKey} onChange={setPeriod} options={[{ value: "month", label: "This month" }, { value: "quarter", label: "This quarter" }, { value: "fy", label: "This financial year" }]} /></span></div>}
    {shown?.covers === "now" && <p className="text-sm text-muted-foreground">As things stand today.</p>}
    {waiting ? <p className="text-sm text-muted-foreground">Loading…</p>
      : !shown ? <UnavailableReport message={sales.error && !demoMode ? `Report unavailable: ${sales.error}` : reportsFromRecords.has(definition.id) ? `This report fills in from ${workspaceName} records. ${readable ? "There are none for it yet." : "Your role does not include them."}` : "This report is not built yet."} />
      : <>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{shown.rows.slice(0, 4).map((row) => <ReportTile key={row.label} row={row} />)}</div>
        <SectionCard title="Detail" description={shown.covers === "period" ? "Each figure for this period and the same days of the period before." : "Each figure, with the screen where its records are."}>
          <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><thead><tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="px-2 py-2">Figure</th><th className="px-2 py-2 text-right">{nowWord}</th>{hasBefore && <th className="px-2 py-2 text-right">Before</th>}<th className="px-2 py-2">Change</th></tr></thead>
            <tbody>{shown.rows.map((row) => <tr key={row.label} className="border-b border-border last:border-0"><td className="px-2 py-3 font-medium">{row.href ? <Link href={row.href} className="hover:text-accent hover:underline">{row.label}</Link> : row.label}</td><td className={`px-2 py-3 text-right tabular-nums ${row.warn ? "font-semibold text-warning" : ""}`}>{row.value}</td>{hasBefore && <td className="px-2 py-3 text-right tabular-nums text-muted-foreground">{row.before ?? "—"}</td>}<td className="px-2 py-3 text-muted-foreground">{row.change ?? ""}</td></tr>)}</tbody></table></div>
          {shown.note && <p className="mt-3 text-xs text-muted-foreground">{shown.note}</p>}
        </SectionCard>
      </>}
  </div>;
}

function ReportTile({ row }: { row: ReportRow }) {
  const body = <><p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{row.label}</p><p className={`mt-2 text-2xl font-semibold tabular-nums ${row.warn ? "text-warning" : ""}`}>{row.value}</p><p className="mt-1 text-xs text-muted-foreground">{row.change ?? (row.before ? `Before: ${row.before}` : " ")}</p></>;
  return row.href ? <Link href={row.href} className="rounded-lg border border-border bg-surface p-4 transition-colors hover:border-accent-border hover:bg-surface-2">{body}</Link> : <div className="rounded-lg border border-border bg-surface p-4">{body}</div>;
}
function UnavailableReport({ message }: { message: string }) { return <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">— · {message}</div>; }

function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) { return <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-5 py-12 text-center"><BarChart3 className="size-6 text-muted-foreground" /><p className="text-sm font-medium">{title}</p><p className="max-w-md text-xs text-muted-foreground">{description}</p>{action}</div>; }
