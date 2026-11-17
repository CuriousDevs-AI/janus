"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { message } from "@/lib/api/client";
import { PageHeader } from "@/components/shared/page-header";
import { FilterChips, StatTile as Kpi, workspaceHref } from "@/components/shared/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useSession } from "@/components/auth/session-provider";
import { usePeople } from "@/lib/people-directory";
import { completeITChange, decideITChange, requestITChange, syncITChanges } from "@/lib/it-records";
import { addDays } from "@/lib/stores/projects-store";
import { ACCESS_LEVELS, ASSET_KINDS, ASSET_LOCATIONS, CUSTOM_FIELD_TYPES, HELPDESK_CATEGORIES, HELPDESK_PRIORITIES, KB_CATEGORIES, ONBOARDING_ITEMS, TODAY, renewalSoon, useITStore, type CustomField, type ITChange, type Incident, type KbArticle, type SoftwareRequest, type ITVendorContract, type NetworkItem, type OnboardingChecklist, type ITPolicy, type Problem } from "@/lib/stores/it-store";

/** People from the directory, with IT-offboarded people removed. */
function useITPeople() {
  const people = usePeople();
  const offboarded = useITStore((state) => state.offboarded);
  return React.useMemo(
    () => people.filter((p) => !offboarded.includes(p.name)),
    [people, offboarded],
  );
}

const selectClass = "h-8 rounded-md border border-input bg-surface px-2 text-xs";
const formatINR = (value: number) => `₹${value.toLocaleString("en-IN")}`;
const comingSoon: Record<string, string> = {
};

/** Run a store action: show its error, or the success message when it returns null. */
function run(problem: string | null, success: string) {
  if (problem) toast.error(problem);
  else toast.success(success);
  return !problem;
}

export function ITWorkspace() {
  const searchParams = useSearchParams();
  const view = searchParams.get("view") ?? "overview";
  const titles: Record<string, string> = { overview: "IT overview", assets: "IT assets", access: "Access management", licenses: "Software & licences", helpdesk: "IT helpdesk", incidents: "Incidents", changes: "Change management", reports: "IT reports", monitoring: "Infrastructure monitoring", kb: "Knowledge base", "software-requests": "Software requests", "vendor-contracts": "IT vendors & contracts", network: "Network & domains", "onboarding-checklists": "IT onboarding", "it-policies": "IT policies", problems: "Problem management", "it-settings": "IT settings" };
  const descriptions: Record<string, string> = {
    overview: "Assets, the access each person holds, and software licences. Every change is written to the log.",
    assets: "Devices, equipment and other physical items the company owns and assigns to people.",
    access: "Who has access to which systems, at what level. Grant and remove access in one place.",
    licenses: "Software licences, seats and renewal dates. Track cost and who is using each licence.",
    helpdesk: "Requests from people in the company. Each one is worked by an IT assignee until resolved.",
    incidents: "Something that is down or wrong. Each incident keeps a timeline of what was done.",
    changes: "Planned changes to systems or devices. Someone other than the requester approves, then it is carried out.",
    reports: "IT in numbers: assets, requests, incidents and changes at a glance.",
    monitoring: "Systems IT keeps an eye on. Record each check; a system marked down opens a critical incident.",
    kb: "How-to guides and troubleshooting articles for the team. Searchable and organised by category.",
    "software-requests": "People request software, managers and IT approve, and IT provisions it.",
    "vendor-contracts": "AMC, SaaS, ISP and hardware vendor contracts with renewal dates and costs.",
    network: "Domains, SSL certificates, Wi-Fi, IP ranges and DNS records the company owns.",
    "onboarding-checklists": "IT checklist for each new joiner: laptop, email, access, software and orientation.",
    "it-policies": "Company IT policies. People acknowledge each policy once they have read it.",
    problems: "When the same incident keeps happening, open a problem to find and fix the root cause.",
    "it-settings": "Custom ticket fields, SLA targets, categories and defaults for the IT workspace.",
  };

  if (view in comingSoon) {
    return (
      <div className="mx-auto flex max-w-[1200px] flex-col">
        <PageHeader title="Coming soon" description="IT & Infrastructure" />
        <div className="px-6 pb-10"><Card><CardContent className="p-6 text-sm text-muted-foreground">{comingSoon[view]}</CardContent></Card></div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col">
      <PageHeader title={titles[view] ?? "IT overview"} description={descriptions[view]} />
      <div className="flex flex-col gap-4 px-6 pb-10">
        {view === "assets" ? <AssetsView /> : view === "access" ? <AccessView /> : view === "licenses" ? <LicensesView /> : view === "helpdesk" ? <HelpdeskView /> : view === "incidents" ? <IncidentsView /> : view === "changes" ? <ChangesView /> : view === "reports" ? <ITReportsView /> : view === "monitoring" ? <MonitoringView /> : view === "kb" ? <KnowledgeBaseView /> : view === "software-requests" ? <SoftwareRequestsView /> : view === "vendor-contracts" ? <VendorContractsView /> : view === "network" ? <NetworkView /> : view === "onboarding-checklists" ? <OnboardingChecklistsView /> : view === "it-policies" ? <ITPoliciesView /> : view === "problems" ? <ProblemsView /> : view === "it-settings" ? <ITSettingsView /> : <OverviewView />}
      </div>
    </div>
  );
}


function OverviewView() {
  const assets = useITStore((state) => state.assets);
  const access = useITStore((state) => state.access);
  const licences = useITStore((state) => state.licences);
  const helpdesk = useITStore((state) => state.helpdesk);
  const incidents = useITStore((state) => state.incidents);
  const vendorContracts = useITStore((state) => state.vendorContracts);
  const onboardingChecklists = useITStore((state) => state.onboardingChecklists);
  const problems = useITStore((state) => state.problems);
  const log = useITStore((state) => state.log);
  const soon = licences.filter(renewalSoon);
  const resolvedTickets = helpdesk.filter((t) => t.status === "resolved");
  const ratedTickets = resolvedTickets.filter((t) => t.satisfaction !== null);
  const avgCsat = ratedTickets.length > 0 ? (ratedTickets.reduce((s, t) => s + (t.satisfaction ?? 0), 0) / ratedTickets.length).toFixed(1) : "—";
  const openProblems = problems.filter((p) => p.status !== "resolved");
  const inStock = assets.filter((a) => a.status === "in stock");
  const openTickets = helpdesk.filter((t) => t.status !== "resolved");
  const overdueTickets = openTickets.filter((t) => t.dueOn < TODAY);
  const openIncidents = incidents.filter((i) => i.status !== "resolved");
  const expiringContracts = vendorContracts.filter((v) => v.contractEnd >= TODAY && v.contractEnd <= addDays(TODAY, 60));
  const warrantyExpiring = assets.filter((a) => a.warrantyExpiry && a.warrantyExpiry >= TODAY && a.warrantyExpiry <= addDays(TODAY, 60));
  const pendingOnboarding = onboardingChecklists.filter((c) => c.items.some((i) => !i.done));
  const to = (view: string, extra: Record<string, string> = {}) => workspaceHref("it-infrastructure", view, extra);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi label="Open requests" value={String(openTickets.length)} detail={overdueTickets.length ? `${overdueTickets.length} overdue` : undefined} tone={overdueTickets.length > 0 ? "warning" : undefined} href={to("helpdesk")} />
        <Kpi label="Open incidents" value={String(openIncidents.length)} tone={openIncidents.some((i) => i.severity === "critical") ? "warning" : undefined} href={to("incidents")} />
        <Kpi label="Assets assigned" value={String(assets.filter((a) => a.status === "assigned").length)} detail={`${inStock.length} in stock`} href={to("assets")} />
        <Kpi label="Licence renewals (30d)" value={String(soon.length)} tone={soon.length > 0 ? "warning" : undefined} href={to("licenses")} />
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi label="Active access grants" value={String(access.filter((g) => g.status === "active").length)} href={to("access")} />
        <Kpi label="Vendor contracts" value={String(vendorContracts.length)} detail={expiringContracts.length ? `${expiringContracts.length} expiring in 60d` : undefined} tone={expiringContracts.length > 0 ? "warning" : undefined} href={to("vendor-contracts")} />
        <Kpi label="Warranty expiring (60d)" value={String(warrantyExpiring.length)} tone={warrantyExpiring.length > 0 ? "warning" : undefined} href={to("assets")} />
        <Kpi label="Onboarding pending" value={String(pendingOnboarding.length)} href={to("onboarding-checklists")} />
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi label="CSAT" value={avgCsat} detail={ratedTickets.length ? `${ratedTickets.length} rated` : "no ratings"} href={to("helpdesk")} />
        <Kpi label="Open problems" value={String(openProblems.length)} href={to("problems")} />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Needs attention</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {overdueTickets.map((t) => <p key={t.id} className="text-danger">{t.number} overdue: {t.subject} (due {t.dueOn})</p>)}
          {openIncidents.filter((i) => i.severity === "critical").map((i) => <p key={i.id} className="text-danger">{i.number} critical: {i.title}</p>)}
          {expiringContracts.map((v) => <p key={v.id}>{v.vendor} ({v.type}) contract expires {v.contractEnd}</p>)}
          {warrantyExpiring.map((a) => <p key={a.id}>{a.name} warranty expires {a.warrantyExpiry}</p>)}
          {soon.map((l) => <p key={l.id}>{l.name} renews on {l.renewal} · {formatINR(l.annualCost)} a year</p>)}
          {pendingOnboarding.map((c) => <p key={c.id}>Onboarding for {c.employeeName}: {c.items.filter((i) => !i.done).length} items left</p>)}
          {openProblems.map((p) => <p key={p.id}>{p.number}: {p.title} ({p.incidentIds.length} linked incidents)</p>)}
          {overdueTickets.length === 0 && openIncidents.filter((i) => i.severity === "critical").length === 0 && expiringContracts.length === 0 && warrantyExpiring.length === 0 && soon.length === 0 && pendingOnboarding.length === 0 && openProblems.length === 0 ? <p className="text-muted-foreground">Nothing is due or waiting.</p> : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Change log</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {log.length === 0 ? <p className="text-muted-foreground">No changes yet. Assignments, returns and access changes appear here.</p> : null}
          {log.slice(0, 15).map((entry) => <p key={entry.id}><span className="text-muted-foreground">{entry.at} · {entry.by} · </span>{entry.text}</p>)}
        </CardContent>
      </Card>
    </>
  );
}

/** IT requests from people in the company: raised, assigned, started and resolved. */
function HelpdeskView() {
  const people = useITPeople();
  const session = useSession();
  const me = session.user.name ?? session.user.email ?? "You";
  const tickets = useITStore((state) => state.helpdesk);
  const raiseTicket = useITStore((state) => state.raiseTicket);
  const setTicketStatus = useITStore((state) => state.setTicketStatus);
  const assignTicket = useITStore((state) => state.assignTicket);
  const resolveTicket = useITStore((state) => state.resolveTicket);
  const addTicketComment = useITStore((state) => state.addTicketComment);
  const rateSatisfaction = useITStore((state) => state.rateSatisfaction);
  const escalateTicket = useITStore((state) => state.escalateTicket);
  const reopenTicket = useITStore((state) => state.reopenTicket);
  const [system, setSystem] = React.useState("");
  const [commentTexts, setCommentTexts] = React.useState<Record<string, string>>({});
  const [level, setLevel] = React.useState<(typeof ACCESS_LEVELS)[number]>("view");
  const [requester, setRequester] = React.useState("");
  const [category, setCategory] = React.useState<(typeof HELPDESK_CATEGORIES)[number]>("Laptop or phone");
  const [priority, setPriority] = React.useState<(typeof HELPDESK_PRIORITIES)[number]>("medium");
  const [subject, setSubject] = React.useState("");
  const [description, setDescription] = React.useState("");
  const customFields = useITStore((state) => state.customFields);
  const [customValues, setCustomValues] = React.useState<Record<string, string | boolean>>({});
  const [statusFilter, setStatusFilter] = React.useState<"all" | "open" | "in progress" | "resolved">("all");
  const filtered = tickets.filter((t) => statusFilter === "all" || t.status === statusFilter);
  const categoryFields = customFields.filter((f) => f.categories.includes(category));

  const resolved = tickets.filter((t) => t.status === "resolved");
  const rated = resolved.filter((t) => t.satisfaction !== null);
  const avgCsat = rated.length > 0 ? (rated.reduce((s, t) => s + (t.satisfaction ?? 0), 0) / rated.length).toFixed(1) : "—";
  const slaBreached = tickets.filter((t) => t.status !== "resolved" && t.dueOn < TODAY).length;

  function raise() {
    const problem = raiseTicket({ requester, category, priority, subject, description, system: category === "Access" ? system : undefined, level: category === "Access" ? level : undefined, customValues }, me);
    if (problem) return toast.error(problem);
    toast.success("Request raised");
    setSubject(""); setDescription(""); setSystem(""); setCustomValues({});
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi label="Open" value={String(tickets.filter((t) => t.status === "open").length)} />
        <Kpi label="In progress" value={String(tickets.filter((t) => t.status === "in progress").length)} />
        <Kpi label="SLA breached" value={String(slaBreached)} tone={slaBreached > 0 ? "warning" : undefined} />
        <Kpi label="Avg CSAT" value={avgCsat} detail={`${rated.length} rated`} />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Raise a request</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-xs text-muted-foreground">Requests from people in the company. Each one is worked by an IT assignee until it is resolved.</p>
          <div className="grid gap-3 sm:grid-cols-5">
            <select aria-label="Requester" className={selectClass} value={requester} onChange={(e) => setRequester(e.target.value)}><option value="">Requester…</option>{people.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}</select>
            <select aria-label="Category" className={selectClass} value={category} onChange={(e) => setCategory(e.target.value as (typeof HELPDESK_CATEGORIES)[number])}>{HELPDESK_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <select aria-label="Priority" className={selectClass} value={priority} onChange={(e) => setPriority(e.target.value as (typeof HELPDESK_PRIORITIES)[number])}>{HELPDESK_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}</select>
            <Input aria-label="Problem" placeholder="What is the problem?" value={subject} onChange={(e) => setSubject(e.target.value)} />
            {category === "Access" ? (
              <>
                <Input aria-label="System" placeholder="System, e.g. Tally Prime" value={system} onChange={(e) => setSystem(e.target.value)} />
                <select aria-label="Access level" className={selectClass} value={level} onChange={(e) => setLevel(e.target.value as (typeof ACCESS_LEVELS)[number])}>{ACCESS_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}</select>
              </>
            ) : null}
          </div>
          <textarea aria-label="Description" className="min-h-[60px] rounded-md border border-input bg-surface px-3 py-2 text-sm" placeholder="Describe the problem in detail (steps, what you see, what you expected)…" value={description} onChange={(e) => setDescription(e.target.value)} />
          {categoryFields.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-3">
              {categoryFields.map((f) => (
                <div key={f.id} className="grid gap-1">
                  <label className="text-xs font-medium text-muted-foreground">{f.label}{f.required && <span className="text-danger"> *</span>}</label>
                  {f.type === "text" && <Input aria-label={f.label} placeholder={f.label} value={(customValues[f.id] as string) ?? ""} onChange={(e) => setCustomValues((prev) => ({ ...prev, [f.id]: e.target.value }))} />}
                  {f.type === "number" && <Input aria-label={f.label} type="number" placeholder={f.label} value={(customValues[f.id] as string) ?? ""} onChange={(e) => setCustomValues((prev) => ({ ...prev, [f.id]: e.target.value }))} />}
                  {f.type === "date" && <Input aria-label={f.label} type="date" value={(customValues[f.id] as string) ?? ""} onChange={(e) => setCustomValues((prev) => ({ ...prev, [f.id]: e.target.value }))} />}
                  {f.type === "dropdown" && <select aria-label={f.label} className={selectClass} value={(customValues[f.id] as string) ?? ""} onChange={(e) => setCustomValues((prev) => ({ ...prev, [f.id]: e.target.value }))}><option value="">Select…</option>{f.options.map((o) => <option key={o} value={o}>{o}</option>)}</select>}
                  {f.type === "checkbox" && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!customValues[f.id]} onChange={(e) => setCustomValues((prev) => ({ ...prev, [f.id]: e.target.checked }))} className="accent-accent" />{f.label}</label>}
                </div>
              ))}
            </div>
          )}
          <Button disabled={!requester || subject.trim().length < 5} onClick={raise} className="w-fit">Raise request</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Requests</CardTitle>
          <FilterChips<typeof statusFilter> label="Status" value={statusFilter} onChange={setStatusFilter} options={([["all", "All", tickets.length], ["open", "Open", tickets.filter((t) => t.status === "open").length], ["in progress", "In progress", tickets.filter((t) => t.status === "in progress").length], ["resolved", "Resolved", resolved.length]] as const).map(([value, label, count]) => ({ value, label, count }))} />
        </CardHeader>
        <CardContent className="grid gap-3 p-4 text-sm">
          {filtered.length === 0 ? <p className="text-muted-foreground">No requests match.</p> : null}
          {filtered.map((t) => (
            <div key={t.id} className="grid gap-2 border-b border-border pb-3 last:border-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  <span className="font-medium">{t.number}</span> · {t.subject}
                  <span className="block text-xs text-muted-foreground">{t.requester} · {t.category}{t.system ? ` (${t.system}, ${t.level})` : ""} · {t.priority} priority · raised {t.raisedOn} · due {t.dueOn ?? "—"}{t.status !== "resolved" && t.dueOn && t.dueOn < TODAY ? " · overdue" : ""}{t.assignee ? ` · with ${t.assignee}` : " · not assigned"}{t.escalatedTo ? ` · escalated to ${t.escalatedTo}` : ""}{t.firstResponseAt ? ` · first response ${t.firstResponseAt}` : ""}{t.resolvedAt ? ` · resolved ${t.resolvedAt}` : ""}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant={t.status === "resolved" ? "success" : t.status === "in progress" ? "warning" : "neutral"}>{t.status}</Badge>
                  {t.status !== "resolved" && t.dueOn && t.dueOn < TODAY ? <Badge variant="danger">overdue</Badge> : null}
                  {t.status !== "resolved" ? (
                    <>
                      <select aria-label={`Assign ${t.number}`} className={selectClass} value={t.assignee ?? ""} onChange={(e) => { if (e.target.value) assignTicket(t.id, e.target.value, me); }}>
                        <option value="">Assign to…</option>
                        {people.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
                      </select>
                      {t.status === "open" ? <Button size="sm" variant="secondary" onClick={() => { const p = setTicketStatus(t.id, "in progress", me); if (p) toast.error(p); }}>Start</Button> : null}
                      <Button size="sm" variant="outline" onClick={() => { const p = resolveTicket(t.id, me); if (p) toast.error(p); else toast.success(`${t.number} resolved`); }}>Resolve</Button>
                      {!t.escalatedTo && <Button size="sm" variant="ghost" onClick={() => { const mgr = people[0]?.name; if (mgr) run(escalateTicket(t.id, mgr, me), `Escalated to ${mgr}`); }}>Escalate</Button>}
                    </>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => run(reopenTicket(t.id, me), `${t.number} reopened`)}>Reopen</Button>
                  )}
                </span>
              </div>
              {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
              {Object.keys(t.customValues ?? {}).length > 0 && (
                <div className="flex flex-wrap gap-2">{Object.entries(t.customValues).map(([fid, val]) => { const f = customFields.find((cf) => cf.id === fid); return f ? <span key={fid} className="inline-flex items-center gap-1 rounded border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-muted-foreground"><span className="font-medium">{f.label}:</span> {typeof val === "boolean" ? (val ? "Yes" : "No") : String(val)}</span> : null; })}</div>
              )}
              {t.comments.length > 0 && <div className="grid gap-1 pl-3">{t.comments.map((c) => <p key={c.id} className="text-xs text-muted-foreground">{c.internal ? "🔒 " : ""}{c.by} · {c.at}: {c.text}</p>)}</div>}
              {t.status === "resolved" && t.satisfaction === null && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Rate:</span>
                  {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className="rounded border border-border px-2 py-0.5 hover:bg-accent/10" onClick={() => run(rateSatisfaction(t.id, n), "Thank you for your feedback")}>{n}</button>)}
                </div>
              )}
              {t.satisfaction !== null && <p className="text-xs text-muted-foreground">CSAT: {t.satisfaction}/5</p>}
              {t.status !== "resolved" && (
                <div className="flex items-center gap-2">
                  <Input className="h-7 text-xs" placeholder="Add a comment…" value={commentTexts[t.id] ?? ""} onChange={(e) => setCommentTexts((prev) => ({ ...prev, [t.id]: e.target.value }))} />
                  <Button size="sm" variant="ghost" disabled={!(commentTexts[t.id] ?? "").trim()} onClick={() => { const p = addTicketComment(t.id, commentTexts[t.id] ?? "", false, me); if (p) toast.error(p); else setCommentTexts((prev) => ({ ...prev, [t.id]: "" })); }}>Comment</Button>
                  <Button size="sm" variant="ghost" disabled={!(commentTexts[t.id] ?? "").trim()} onClick={() => { const p = addTicketComment(t.id, commentTexts[t.id] ?? "", true, me); if (p) toast.error(p); else setCommentTexts((prev) => ({ ...prev, [t.id]: "" })); }}>Internal note</Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

/** IT incidents: something down or wrong, raised, updated with a timeline, and resolved. */
function IncidentsView() {
  const session = useSession();
  const me = session.user.name ?? session.user.email ?? "You";
  const incidents = useITStore((state) => state.incidents);
  const assets = useITStore((state) => state.assets);
  const raiseIncident = useITStore((state) => state.raiseIncident);
  const updateIncident = useITStore((state) => state.updateIncident);
  const [title, setTitle] = React.useState("");
  const [severity, setSeverity] = React.useState<"minor" | "major" | "critical">("minor");
  const [assetId, setAssetId] = React.useState("");
  const [notes, setNotes] = React.useState<Record<string, string>>({});

  function raise() {
    const problem = raiseIncident({ title, severity, assetId: assetId || null }, me);
    if (problem) return toast.error(problem);
    toast.success("Incident opened");
    setTitle(""); setAssetId("");
  }

  function update(id: string, status: Incident["status"]) {
    const problem = updateIncident(id, status, notes[id] ?? "", me);
    if (problem) return toast.error(problem);
    setNotes((current) => ({ ...current, [id]: "" }));
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Open an incident</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-xs text-muted-foreground">Something that is down or wrong: a device, a system or the network. Each incident keeps a timeline of what was done.</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <Input aria-label="Incident title" placeholder="What is wrong?" value={title} onChange={(e) => setTitle(e.target.value)} />
            <select aria-label="Severity" className={selectClass} value={severity} onChange={(e) => setSeverity(e.target.value as Incident["severity"])}><option value="minor">Minor</option><option value="major">Major</option><option value="critical">Critical</option></select>
            <select aria-label="Affected asset" className={selectClass} value={assetId} onChange={(e) => setAssetId(e.target.value)}><option value="">No asset</option>{assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            <Button disabled={title.trim().length < 5} onClick={raise}>Open incident</Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="grid gap-4 p-4 text-sm">
          {incidents.length === 0 ? <p className="text-muted-foreground">No incidents.</p> : null}
          {incidents.map((i) => {
            const asset = assets.find((a) => a.id === i.assetId);
            return (
              <div key={i.id} className="grid gap-2 border-b border-border pb-3 last:border-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><span className="font-medium">{i.number}</span> · {i.title}<span className="block text-xs text-muted-foreground">{i.severity} · reported by {i.reportedBy} on {i.raisedOn}{asset ? ` · ${asset.name}` : ""}</span></span>
                  <span className="flex items-center gap-2">
                    <Badge variant={i.severity === "critical" ? "danger" : i.severity === "major" ? "warning" : "neutral"}>{i.severity}</Badge>
                    <Badge variant={i.status === "resolved" ? "success" : "warning"}>{i.status}</Badge>
                  </span>
                </div>
                {i.updates.map((u, idx) => <p key={idx} className="pl-3 text-xs text-muted-foreground">• {u}</p>)}
                {i.status !== "resolved" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Input aria-label={`Update for ${i.number}`} className="h-8 w-72" placeholder="What was done" value={notes[i.id] ?? ""} onChange={(e) => setNotes((current) => ({ ...current, [i.id]: e.target.value }))} />
                    {i.status === "open" ? <Button size="sm" variant="secondary" onClick={() => update(i.id, "investigating")}>Investigating</Button> : null}
                    <Button size="sm" variant="outline" onClick={() => update(i.id, "resolved")}>Resolve</Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </>
  );
}

/** IT changes: a planned change is approved by someone other than the person who asked for it, then carried out. */
function ChangesView() {
  const session = useSession();
  const me = session.user.name ?? session.user.email ?? "You";
  const changes = useITStore((state) => state.changes);
  React.useEffect(() => {
    syncITChanges().catch((error: unknown) => toast.warning(`Changes not loaded from the server: ${message(error)}`));
  }, []);
  const [title, setTitle] = React.useState("");
  const [risk, setRisk] = React.useState<ITChange["risk"]>("low");
  const [saving, setSaving] = React.useState(false);

  async function request() {
    setSaving(true);
    try {
      const problem = await requestITChange({ title, risk }, me);
      if (problem) return toast.error(problem);
      toast.success("Change requested");
      setTitle("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Request a change</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-xs text-muted-foreground">A change to systems or devices. Someone other than the person who asked approves it, then it is carried out and marked done.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input aria-label="Change title" placeholder="What will change?" value={title} onChange={(e) => setTitle(e.target.value)} />
            <select aria-label="Change risk" className={selectClass} value={risk} onChange={(e) => setRisk(e.target.value as ITChange["risk"])}><option value="low">Low risk</option><option value="medium">Medium risk</option><option value="high">High risk</option></select>
            <Button disabled={saving || title.trim().length < 5} onClick={request}>{saving ? "Saving…" : "Request change"}</Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="grid gap-3 p-4 text-sm">
          {changes.length === 0 ? <p className="text-muted-foreground">No changes requested.</p> : null}
          {changes.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 last:border-0">
              <span><span className="font-medium">{c.number}</span> · {c.title}<span className="block text-xs text-muted-foreground">{c.risk} risk · requested by {c.requestedBy} on {c.raisedOn}{c.decidedBy ? ` · decided by ${c.decidedBy}` : ""}</span></span>
              <span className="flex flex-wrap items-center gap-2">
                <Badge variant={c.status === "done" || c.status === "approved" ? "success" : c.status === "rejected" ? "danger" : "warning"}>{c.status}</Badge>
                {c.status === "pending" && c.requestedBy !== me ? (
                  <>
                    <Button size="sm" variant="secondary" onClick={async () => { const p = await decideITChange(c.id, true, me); if (p) toast.error(p); }}>Approve</Button>
                    <Button size="sm" variant="ghost" onClick={async () => { const p = await decideITChange(c.id, false, me); if (p) toast.error(p); }}>Reject</Button>
                  </>
                ) : c.status === "pending" ? (
                  <span className="text-xs text-muted-foreground">Waiting for someone else to decide</span>
                ) : null}
                {c.status === "approved" ? <Button size="sm" onClick={async () => { const p = await completeITChange(c.id, me); if (p) toast.error(p); }}>Mark carried out</Button> : null}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

/** IT in numbers: assets, requests, incidents and changes. */
function ITReportsView() {
  const assets = useITStore((state) => state.assets);
  const helpdesk = useITStore((state) => state.helpdesk);
  const incidents = useITStore((state) => state.incidents);
  const changes = useITStore((state) => state.changes);
  const licences = useITStore((state) => state.licences);
  const vendorContracts = useITStore((state) => state.vendorContracts);
  const kbArticles = useITStore((state) => state.kbArticles);
  const softwareRequests = useITStore((state) => state.softwareRequests);
  const networkItems = useITStore((state) => state.networkItems);
  const itPolicies = useITStore((state) => state.itPolicies);
  const onboardingChecklists = useITStore((state) => state.onboardingChecklists);
  const problems = useITStore((state) => state.problems);
  const totalLicenceCost = licences.reduce((s, l) => s + l.annualCost, 0);
  const totalVendorCost = vendorContracts.reduce((s, v) => s + v.annualCost, 0);
  const totalAssetValue = assets.filter((a) => a.status !== "retired").reduce((s, a) => s + a.cost, 0);
  const resolvedTickets = helpdesk.filter((h) => h.status === "resolved");
  const ratedTickets = resolvedTickets.filter((h) => h.satisfaction !== null);
  const avgCsat = ratedTickets.length > 0 ? (ratedTickets.reduce((s, t) => s + (t.satisfaction ?? 0), 0) / ratedTickets.length).toFixed(1) : "—";
  const slaBreached = helpdesk.filter((h) => h.status !== "resolved" && h.dueOn < TODAY).length;
  const slaCompliance = helpdesk.length > 0 ? Math.round(((helpdesk.length - slaBreached) / helpdesk.length) * 100) : 100;
  const sections: { title: string; rows: [string, string][] }[] = [
    { title: "Assets", rows: [
      ["Total assets", String(assets.length)],
      ["Assigned", String(assets.filter((a) => a.status === "assigned").length)],
      ["In stock", String(assets.filter((a) => a.status === "in stock").length)],
      ["Retired", String(assets.filter((a) => a.status === "retired").length)],
      ["Active asset value", formatINR(totalAssetValue)],
      ["Warranty expiring in 60 days", String(assets.filter((a) => a.warrantyExpiry && a.warrantyExpiry >= TODAY && a.warrantyExpiry <= addDays(TODAY, 60)).length)],
      ...Array.from(new Set(assets.map((a) => a.location))).map((loc): [string, string] => [`Assets at ${loc}`, String(assets.filter((a) => a.location === loc && a.status !== "retired").length)]),
    ] },
    { title: "Helpdesk & SLA", rows: [
      ["Total requests", String(helpdesk.length)],
      ["Open or in progress", String(helpdesk.filter((h) => h.status !== "resolved").length)],
      ["SLA breached (overdue)", String(slaBreached)],
      ["SLA compliance", `${slaCompliance}%`],
      ["Resolved", String(resolvedTickets.length)],
      ["Avg CSAT", `${avgCsat}/5 (${ratedTickets.length} rated)`],
      ["Escalated", String(helpdesk.filter((h) => h.escalatedTo).length)],
    ] },
    { title: "Incidents, Changes & Problems", rows: [
      ["Incidents open", String(incidents.filter((i) => i.status !== "resolved").length)],
      ["Critical incidents", String(incidents.filter((i) => i.status !== "resolved" && i.severity === "critical").length)],
      ["Changes pending", String(changes.filter((c) => c.status === "pending").length)],
      ["Changes completed", String(changes.filter((c) => c.status === "done").length)],
      ["Problems open", String(problems.filter((p) => p.status !== "resolved").length)],
      ["Problems with root cause", String(problems.filter((p) => p.status === "root-cause-identified" || p.status === "resolved").length)],
    ] },
    { title: "Licences & Software", rows: [
      ["Total licences", String(licences.length)],
      ["Annual licence cost", formatINR(totalLicenceCost)],
      ["Renewing in 30 days", String(licences.filter(renewalSoon).length)],
      ["Software requests pending", String(softwareRequests.filter((r) => r.status === "pending" || r.status === "manager_approved").length)],
    ] },
    { title: "Vendors & Costs", rows: [
      ["Vendor contracts", String(vendorContracts.length)],
      ["Annual vendor cost", formatINR(totalVendorCost)],
      ["Contracts expiring in 60 days", String(vendorContracts.filter((v) => v.contractEnd >= TODAY && v.contractEnd <= addDays(TODAY, 60)).length)],
      ["Total annual IT cost", formatINR(totalLicenceCost + totalVendorCost)],
    ] },
    { title: "Other", rows: [
      ["Knowledge base articles", String(kbArticles.length)],
      ["Network items tracked", String(networkItems.length)],
      ["Onboarding checklists open", String(onboardingChecklists.filter((c) => c.items.some((i) => !i.done)).length)],
      ["IT policies published", String(itPolicies.length)],
    ] },
  ];
  return (
    <>
      {sections.map((s) => (
        <Card key={s.title}>
          <CardHeader><CardTitle className="text-base">{s.title}</CardTitle></CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {s.rows.map(([label, value]) => <div key={label} className="flex justify-between border-b border-border pb-2 last:border-0"><span>{label}</span><span className="font-medium tabular-nums">{value}</span></div>)}
          </CardContent>
        </Card>
      ))}
    </>
  );
}

/** Systems IT keeps an eye on. A check records the status; a system marked down opens a critical incident. */
function MonitoringView() {
  const session = useSession();
  const me = session.user.name ?? session.user.email ?? "You";
  const monitors = useITStore((state) => state.monitors);
  const addMonitor = useITStore((state) => state.addMonitor);
  const recordCheck = useITStore((state) => state.recordCheck);
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<"Server" | "Network" | "Application" | "Website" | "Other">("Server");
  const [notes, setNotes] = React.useState<Record<string, string>>({});

  function add() {
    const problem = addMonitor({ name, kind }, me);
    if (problem) return toast.error(problem);
    toast.success("System added to monitoring");
    setName("");
  }

  function check(id: string, status: "up" | "degraded" | "down") {
    const problem = recordCheck(id, status, notes[id] ?? "", me);
    if (problem) return toast.error(problem);
    if (status === "down") toast.success("Marked down; a critical incident is open");
    setNotes((current) => ({ ...current, [id]: "" }));
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Add a system to monitoring</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-xs text-muted-foreground">Janus does not poll systems. IT records each check here. A system marked down opens a critical incident straight away.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input aria-label="System name" placeholder="System name" value={name} onChange={(e) => setName(e.target.value)} />
            <select aria-label="System type" className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>{(["Server", "Network", "Application", "Website", "Other"] as const).map((k) => <option key={k} value={k}>{k}</option>)}</select>
            <Button disabled={name.trim().length < 3} onClick={add}>Add system</Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="grid gap-3 p-4 text-sm">
          {monitors.length === 0 ? <p className="text-muted-foreground">No systems monitored yet.</p> : null}
          {monitors.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 last:border-0">
              <span><span className="font-medium">{m.name}</span> · {m.kind}<span className="block text-xs text-muted-foreground">last checked {m.lastChecked}{m.note ? ` · ${m.note}` : ""}</span></span>
              <span className="flex flex-wrap items-center gap-2">
                <Badge variant={m.status === "up" ? "success" : m.status === "degraded" ? "warning" : "danger"}>{m.status}</Badge>
                <Input aria-label={`Check note for ${m.name}`} className="h-8 w-56" placeholder="What did you see?" value={notes[m.id] ?? ""} onChange={(e) => setNotes((current) => ({ ...current, [m.id]: e.target.value }))} />
                <Button size="sm" variant="secondary" onClick={() => check(m.id, "up")}>Up</Button>
                <Button size="sm" variant="ghost" onClick={() => check(m.id, "degraded")}>Degraded</Button>
                <Button size="sm" variant="outline" onClick={() => check(m.id, "down")}>Down</Button>
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

interface HrAssetRequest {
  id: string;
  employeeName: string;
  category: string;
  reason: string;
  urgency: "normal" | "urgent";
  status: "manager_approved" | "it_processing" | "issued";
  approvedBy: string;
  approvedAt: string;
}

function seedHrRequests(): HrAssetRequest[] {
  return [];
}

function AssetsView() {
  const people = useITPeople();
  const names = people.map((person) => person.name);
  const session = useSession();
  const me = session.user.name ?? session.user.email ?? "You";
  const assets = useITStore((state) => state.assets);
  const addAsset = useITStore((state) => state.addAsset);
  const assignAsset = useITStore((state) => state.assignAsset);
  const returnAsset = useITStore((state) => state.returnAsset);
  const retireAsset = useITStore((state) => state.retireAsset);
  const offboard = useITStore((state) => state.offboard);
  const [draft, setDraft] = React.useState<{ name: string; kind: (typeof ASSET_KINDS)[number]; serial: string; purchaseDate: string; cost: string; location: string }>({ name: "", kind: "Laptop", serial: "", purchaseDate: TODAY, cost: "0", location: "Head office" });
  const [picks, setPicks] = React.useState<Record<string, string>>({});
  const [leaver, setLeaver] = React.useState("");
  const params = useSearchParams();
  type Show = "all" | "assigned" | "in stock" | "retired";
  const [show, setShow] = React.useState<Show>(() => { const asked = params.get("status"); return asked === "assigned" || asked === "in stock" || asked === "retired" ? asked : "all"; });
  const [find, setFind] = React.useState("");
  const term = find.trim().toLowerCase();
  const shown = assets.filter((a) => (show === "all" || a.status === show) && (!term || `${a.name} ${a.kind} ${a.serial} ${a.assignedTo ?? ""}`.toLowerCase().includes(term)));

  const [hrRequests, setHrRequests] = React.useState(seedHrRequests);
  const pendingFromHr = hrRequests.filter((r) => r.status === "manager_approved");
  const processing = hrRequests.filter((r) => r.status === "it_processing");

  function startProcessing(id: string) {
    setHrRequests((prev) => prev.map((r) => r.id === id ? { ...r, status: "it_processing" } : r));
    toast.success("Marked as processing");
  }

  function markIssued(id: string) {
    setHrRequests((prev) => prev.map((r) => r.id === id ? { ...r, status: "issued" } : r));
    toast.success("Asset issued to employee");
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const problem = addAsset({ name: draft.name, kind: draft.kind, serial: draft.serial, purchaseDate: draft.purchaseDate, cost: Number(draft.cost) || 0, warrantyExpiry: null, amcVendor: null, amcExpiry: null, location: draft.location }, me);
    if (run(problem, "Asset added")) setDraft({ name: "", kind: "Laptop", serial: "", purchaseDate: TODAY, cost: "0", location: "Head office" });
  };

  return (
    <>
      {(pendingFromHr.length > 0 || processing.length > 0) && <Card>
        <CardHeader><CardTitle className="text-base">Asset requests from HR</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <p className="text-xs text-muted-foreground">Requests approved by manager / HR. Process them here and mark as issued once the asset is handed over. Employees request assets in <a href="/workspace/hr-people?view=assets" className="font-medium text-accent hover:underline">HR → My Assets & Requests</a>.</p>
          {[...pendingFromHr, ...processing].map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 last:border-0">
              <span>
                <span className="font-medium">{r.employeeName}</span> · {r.category}
                <span className="block text-xs text-muted-foreground">{r.reason}</span>
                <span className="block text-xs text-muted-foreground">Approved by {r.approvedBy} on {r.approvedAt}</span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <Badge variant={r.urgency === "urgent" ? "warning" : "neutral"}>{r.urgency}</Badge>
                <Badge variant={r.status === "it_processing" ? "accent" : "info"}>{r.status === "it_processing" ? "Processing" : "Approved"}</Badge>
                {r.status === "manager_approved" && <Button size="sm" variant="secondary" onClick={() => startProcessing(r.id)}>Start processing</Button>}
                {r.status === "it_processing" && <Button size="sm" onClick={() => markIssued(r.id)}>Mark issued</Button>}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>}
      <Card>
        <CardHeader><CardTitle className="text-base">Add an asset</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-5">
            <Input aria-label="Asset name" placeholder="Name, e.g. Dell Latitude 5440" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <select aria-label="Asset type" className={selectClass} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as (typeof ASSET_KINDS)[number] })}>
              {ASSET_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <Input aria-label="Serial number" placeholder="Serial number" value={draft.serial} onChange={(e) => setDraft({ ...draft, serial: e.target.value })} />
            <Input aria-label="Cost" type="number" placeholder="Cost ₹" value={draft.cost} onChange={(e) => setDraft({ ...draft, cost: e.target.value })} />
            <select aria-label="Location" className={selectClass} value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })}>{ASSET_LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}</select>
            <Button type="submit">Add asset</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0"><CardTitle className="text-base">Register</CardTitle>{assets.length > 0 ? <Input aria-label="Find an asset" placeholder="Find by name, serial or person" value={find} onChange={(e) => setFind(e.target.value)} className="h-8 w-full max-w-[240px]" /> : null}</CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {assets.length > 0 ? <div className="mb-1"><FilterChips<Show> label="Show assets" value={show} onChange={setShow} options={(["all", "assigned", "in stock", "retired"] as const).map((value) => ({ value, label: value === "all" ? "All" : value[0].toUpperCase() + value.slice(1), count: value === "all" ? assets.length : assets.filter((a) => a.status === value).length }))} /></div> : null}
          {assets.length === 0 ? <p className="text-muted-foreground">No assets yet.</p> : null}
          {assets.length > 0 && shown.length === 0 ? <p className="text-muted-foreground">No asset matches. <button type="button" className="text-accent hover:underline" onClick={() => { setShow("all"); setFind(""); }}>Show all</button></p> : null}
          {shown.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0">
              <span>
                <span className="font-medium">{a.name}</span> · {a.kind} · {a.serial}
                <span className="block text-xs text-muted-foreground">{a.assignedTo ? `With ${a.assignedTo}` : a.status === "retired" ? "Retired" : "In stock"} · {a.location} · bought {a.purchaseDate} · {formatINR(a.cost)}{a.warrantyExpiry ? ` · warranty ${a.warrantyExpiry < TODAY ? "expired" : "until"} ${a.warrantyExpiry}` : ""}{a.amcVendor ? ` · AMC: ${a.amcVendor} until ${a.amcExpiry}` : ""}</span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <Badge variant={a.status === "assigned" ? "success" : "neutral"}>{a.status}</Badge>
                {a.assignedTo ? (
                  <Button size="sm" variant="outline" onClick={() => run(returnAsset(a.id, me), `${a.name} returned`)}>Return</Button>
                ) : a.status !== "retired" ? (
                  <>
                    <select aria-label={`Assign ${a.name}`} className={selectClass} value={picks[a.id] ?? ""} onChange={(e) => { if (!e.target.value) return; setPicks({ ...picks, [a.id]: e.target.value }); run(assignAsset(a.id, e.target.value, me), `${a.name} assigned to ${e.target.value}`); }}>
                      <option value="">Assign to…</option>
                      {names.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <Button size="sm" variant="ghost" onClick={() => run(retireAsset(a.id, me), `${a.name} retired`)}>Retire</Button>
                  </>
                ) : null}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Offboarding</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2 text-sm">
          <p className="w-full text-xs text-muted-foreground">When someone leaves, their assets come back to stock and all their active access is removed, in one step.</p>
          <select aria-label="Person leaving" className={selectClass} value={leaver} onChange={(e) => setLeaver(e.target.value)}>
            <option value="">Choose a person…</option>
            {names.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <Button size="sm" disabled={!leaver} onClick={() => { if (run(offboard(leaver, me), `${leaver} offboarded`)) setLeaver(""); }}>Offboard</Button>
        </CardContent>
      </Card>
    </>
  );
}

function AccessView() {
  const people = useITPeople();
  const names = people.map((person) => person.name);
  const session = useSession();
  const me = session.user.name ?? session.user.email ?? "You";
  const access = useITStore((state) => state.access);
  const grantAccess = useITStore((state) => state.grantAccess);
  const removeAccess = useITStore((state) => state.removeAccess);
  const [system, setSystem] = React.useState("");
  const [person, setPerson] = React.useState("");
  const [level, setLevel] = React.useState<(typeof ACCESS_LEVELS)[number]>("view");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (run(grantAccess({ system, person, level }, me), `Access granted to ${person}`)) setSystem("");
  };

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Grant access</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-4">
            <Input aria-label="System" placeholder="System, e.g. Tally Prime" value={system} onChange={(e) => setSystem(e.target.value)} />
            <select aria-label="Person" className={selectClass} value={person} onChange={(e) => setPerson(e.target.value)}>
              <option value="">Choose a person…</option>
              {names.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <select aria-label="Level" className={selectClass} value={level} onChange={(e) => setLevel(e.target.value as (typeof ACCESS_LEVELS)[number])}>
              {ACCESS_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <Button type="submit" disabled={!person}>Grant</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Who has access</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {access.length === 0 ? <p className="text-muted-foreground">No access records yet.</p> : null}
          {access.map((g) => (
            <div key={g.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0">
              <span>
                <span className="font-medium">{g.system}</span> · {g.person} · {g.level}
                <span className="block text-xs text-muted-foreground">Granted by {g.grantedBy}{g.removedBy ? ` · removed by ${g.removedBy}` : ""}</span>
              </span>
              {g.status === "active" ? (
                <Button size="sm" variant="outline" onClick={() => run(removeAccess(g.id, me), `Access to ${g.system} removed`)}>Remove</Button>
              ) : (
                <Badge variant="neutral">removed</Badge>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

function LicensesView() {
  const people = useITPeople();
  const names = people.map((person) => person.name);
  const session = useSession();
  const me = session.user.name ?? session.user.email ?? "You";
  const licences = useITStore((state) => state.licences);
  const addLicence = useITStore((state) => state.addLicence);
  const assignSeat = useITStore((state) => state.assignSeat);
  const freeSeat = useITStore((state) => state.freeSeat);
  const [draft, setDraft] = React.useState({ name: "", vendor: "", seats: "1", annualCost: "0", renewal: TODAY });
  const [picks, setPicks] = React.useState<Record<string, string>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const problem = addLicence({ name: draft.name, vendor: draft.vendor, seats: Number(draft.seats) || 0, annualCost: Number(draft.annualCost) || 0, renewal: draft.renewal }, me);
    if (run(problem, "Licence added")) setDraft({ name: "", vendor: "", seats: "1", annualCost: "0", renewal: TODAY });
  };

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Add a licence</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
            <Input aria-label="Licence name" placeholder="Licence name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <Input aria-label="Vendor" placeholder="Vendor" value={draft.vendor} onChange={(e) => setDraft({ ...draft, vendor: e.target.value })} />
            <Input aria-label="Seats" type="number" placeholder="Seats" value={draft.seats} onChange={(e) => setDraft({ ...draft, seats: e.target.value })} />
            <Input aria-label="Annual cost" type="number" placeholder="Annual cost ₹" value={draft.annualCost} onChange={(e) => setDraft({ ...draft, annualCost: e.target.value })} />
            <Input aria-label="Renewal date" type="date" value={draft.renewal} onChange={(e) => setDraft({ ...draft, renewal: e.target.value })} />
            <Button type="submit">Add licence</Button>
          </form>
        </CardContent>
      </Card>
      {licences.map((l) => (
        <Card key={l.id}>
          <CardHeader>
            <CardTitle className="text-base">
              {l.name} <span className="text-sm font-normal text-muted-foreground">· {l.vendor} · {l.assigned.length} of {l.seats} seats used · {formatINR(l.annualCost)} a year</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p className="text-xs text-muted-foreground">
              Renews {l.renewal}{renewalSoon(l) ? " · due within 30 days" : ""}
            </p>
            {l.assigned.map((p) => (
              <div key={p} className="flex items-center justify-between gap-2 border-b border-border pb-2 last:border-0">
                <span>{p}</span>
                <Button size="sm" variant="outline" onClick={() => run(freeSeat(l.id, p, me), `Seat freed from ${p}`)}>Free seat</Button>
              </div>
            ))}
            <select aria-label={`Give a seat on ${l.name}`} className={selectClass} value={picks[l.id] ?? ""} onChange={(e) => { if (!e.target.value) return; setPicks({ ...picks, [l.id]: e.target.value }); run(assignSeat(l.id, e.target.value, me), `Seat given to ${e.target.value}`); }}>
              <option value="">Give a seat to…</option>
              {names.filter((n) => !l.assigned.includes(n)).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </CardContent>
        </Card>
      ))}
      {licences.length === 0 ? <Card><CardContent className="p-6 text-sm text-muted-foreground">No licences yet.</CardContent></Card> : null}
    </>
  );
}

function KnowledgeBaseView() {
  const session = useSession();
  const me = session.user.name ?? session.user.email ?? "You";
  const articles = useITStore((state) => state.kbArticles);
  const addKbArticle = useITStore((state) => state.addKbArticle);
  const [draft, setDraft] = React.useState({ title: "", category: "Getting Started" as (typeof KB_CATEGORIES)[number], body: "" });
  const [find, setFind] = React.useState("");
  const [filterCat, setFilterCat] = React.useState<string>("all");
  const term = find.trim().toLowerCase();
  const shown = articles.filter((a) => (filterCat === "all" || a.category === filterCat) && (!term || `${a.title} ${a.body}`.toLowerCase().includes(term)));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = addKbArticle({ title: draft.title, category: draft.category, body: draft.body, createdBy: me }, me);
    if (run(problem, "Article published")) setDraft({ title: "", category: "Getting Started", body: "" });
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Write an article</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input aria-label="Article title" placeholder="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              <select aria-label="Category" className={selectClass} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as (typeof KB_CATEGORIES)[number] })}>{KB_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            </div>
            <textarea aria-label="Article body" className="min-h-[100px] rounded-md border border-input bg-surface px-3 py-2 text-sm" placeholder="Write the article…" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
            <Button type="submit" className="w-fit" disabled={draft.title.trim().length < 5 || draft.body.trim().length < 10}>Publish article</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Articles</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Filter category" className={selectClass} value={filterCat} onChange={(e) => setFilterCat(e.target.value)}><option value="all">All categories</option>{KB_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <Input aria-label="Search articles" className="h-8 w-56" placeholder="Search…" value={find} onChange={(e) => setFind(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          {shown.length === 0 ? <p className="text-muted-foreground">No articles match.</p> : null}
          {shown.map((a) => (
            <div key={a.id} className="border-b border-border pb-3 last:border-0">
              <p className="font-medium">{a.title}</p>
              <p className="text-xs text-muted-foreground">{a.category} · by {a.createdBy} on {a.createdAt} · {a.views} views</p>
              <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{a.body}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

function SoftwareRequestsView() {
  const people = useITPeople();
  const session = useSession();
  const me = session.user.name ?? session.user.email ?? "You";
  const requests = useITStore((state) => state.softwareRequests);
  const addSoftwareRequest = useITStore((state) => state.addSoftwareRequest);
  const decideSoftwareRequest = useITStore((state) => state.decideSoftwareRequest);
  const provisionSoftwareRequest = useITStore((state) => state.provisionSoftwareRequest);
  const [draft, setDraft] = React.useState({ requester: "", software: "", reason: "" });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = addSoftwareRequest(draft, me);
    if (run(problem, "Software request raised")) setDraft({ requester: "", software: "", reason: "" });
  }

  const statusLabel: Record<SoftwareRequest["status"], string> = { pending: "Pending", manager_approved: "Manager approved", it_approved: "IT approved", provisioned: "Provisioned", rejected: "Rejected" };
  const statusVariant = (s: SoftwareRequest["status"]) => s === "provisioned" ? "success" as const : s === "rejected" ? "danger" as const : "warning" as const;

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Request software</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-4">
            <select aria-label="Requester" className={selectClass} value={draft.requester} onChange={(e) => setDraft({ ...draft, requester: e.target.value })}><option value="">Requester…</option>{people.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}</select>
            <Input aria-label="Software" placeholder="Software name" value={draft.software} onChange={(e) => setDraft({ ...draft, software: e.target.value })} />
            <Input aria-label="Reason" placeholder="Why is it needed?" value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} />
            <Button type="submit" disabled={!draft.requester || draft.software.trim().length < 2}>Request</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="grid gap-3 p-4 text-sm">
          {requests.length === 0 ? <p className="text-muted-foreground">No software requests yet.</p> : null}
          {requests.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 last:border-0">
              <span>
                <span className="font-medium">{r.number}</span> · {r.software}
                <span className="block text-xs text-muted-foreground">{r.requester} · {r.reason} · requested {r.requestedAt}{r.decidedBy ? ` · decided by ${r.decidedBy}` : ""}</span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <Badge variant={statusVariant(r.status)}>{statusLabel[r.status]}</Badge>
                {(r.status === "pending" || r.status === "manager_approved") && (
                  <>
                    <Button size="sm" variant="secondary" onClick={() => run(decideSoftwareRequest(r.id, true, me), "Approved")}>Approve</Button>
                    <Button size="sm" variant="ghost" onClick={() => run(decideSoftwareRequest(r.id, false, me), "Rejected")}>Reject</Button>
                  </>
                )}
                {r.status === "it_approved" && <Button size="sm" onClick={() => run(provisionSoftwareRequest(r.id, me), `${r.software} provisioned for ${r.requester}`)}>Provision</Button>}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

function VendorContractsView() {
  const session = useSession();
  const me = session.user.name ?? session.user.email ?? "You";
  const contracts = useITStore((state) => state.vendorContracts);
  const addVendorContract = useITStore((state) => state.addVendorContract);
  const [draft, setDraft] = React.useState({ vendor: "", type: "AMC" as ITVendorContract["type"], contactPerson: "", phone: "", email: "", contractStart: TODAY, contractEnd: "", annualCost: "0", notes: "" });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = addVendorContract({ vendor: draft.vendor, type: draft.type, contactPerson: draft.contactPerson, phone: draft.phone, email: draft.email, contractStart: draft.contractStart, contractEnd: draft.contractEnd, annualCost: Number(draft.annualCost) || 0, notes: draft.notes }, me);
    if (run(problem, "Vendor contract added")) setDraft({ vendor: "", type: "AMC", contactPerson: "", phone: "", email: "", contractStart: TODAY, contractEnd: "", annualCost: "0", notes: "" });
  }

  const totalCost = contracts.reduce((s, c) => s + c.annualCost, 0);
  const expiring = contracts.filter((c) => c.contractEnd >= TODAY && c.contractEnd <= addDays(TODAY, 60));

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Active contracts" value={String(contracts.length)} />
        <Kpi label="Annual vendor cost" value={formatINR(totalCost)} />
        <Kpi label="Expiring in 60 days" value={String(expiring.length)} tone={expiring.length > 0 ? "warning" : undefined} />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Add a vendor contract</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-4">
              <Input aria-label="Vendor name" placeholder="Vendor name" value={draft.vendor} onChange={(e) => setDraft({ ...draft, vendor: e.target.value })} />
              <select aria-label="Contract type" className={selectClass} value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as ITVendorContract["type"] })}>{(["AMC", "SaaS", "ISP", "Hardware", "Other"] as const).map((t) => <option key={t} value={t}>{t}</option>)}</select>
              <Input aria-label="Contact person" placeholder="Contact person" value={draft.contactPerson} onChange={(e) => setDraft({ ...draft, contactPerson: e.target.value })} />
              <Input aria-label="Phone" placeholder="Phone" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <Input aria-label="Email" placeholder="Email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
              <Input aria-label="Contract start" type="date" value={draft.contractStart} onChange={(e) => setDraft({ ...draft, contractStart: e.target.value })} />
              <Input aria-label="Contract end" type="date" value={draft.contractEnd} onChange={(e) => setDraft({ ...draft, contractEnd: e.target.value })} />
              <Input aria-label="Annual cost" type="number" placeholder="Annual cost ₹" value={draft.annualCost} onChange={(e) => setDraft({ ...draft, annualCost: e.target.value })} />
            </div>
            <Input aria-label="Notes" placeholder="Notes (SLA, scope, special terms)" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            <Button type="submit" className="w-fit" disabled={draft.vendor.trim().length < 2 || !draft.contractEnd}>Add contract</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="grid gap-3 p-4 text-sm">
          {contracts.length === 0 ? <p className="text-muted-foreground">No vendor contracts yet.</p> : null}
          {contracts.map((c) => (
            <div key={c.id} className="border-b border-border pb-3 last:border-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{c.vendor}</span>
                <span className="flex items-center gap-2">
                  <Badge variant="neutral">{c.type}</Badge>
                  {c.contractEnd < TODAY ? <Badge variant="danger">Expired</Badge> : c.contractEnd <= addDays(TODAY, 60) ? <Badge variant="warning">Expiring soon</Badge> : <Badge variant="success">Active</Badge>}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{c.contactPerson} · {c.phone} · {c.email}</p>
              <p className="text-xs text-muted-foreground">{c.contractStart} → {c.contractEnd} · {formatINR(c.annualCost)}/year</p>
              {c.notes && <p className="mt-1 text-xs text-muted-foreground">{c.notes}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

function NetworkView() {
  const session = useSession();
  const me = session.user.name ?? session.user.email ?? "You";
  const items = useITStore((state) => state.networkItems);
  const addNetworkItem = useITStore((state) => state.addNetworkItem);
  const removeNetworkItem = useITStore((state) => state.removeNetworkItem);
  const [draft, setDraft] = React.useState({ name: "", type: "Domain" as NetworkItem["type"], value: "", expiry: "", notes: "" });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = addNetworkItem({ name: draft.name, type: draft.type, value: draft.value, expiry: draft.expiry || null, notes: draft.notes }, me);
    if (run(problem, "Network item added")) setDraft({ name: "", type: "Domain", value: "", expiry: "", notes: "" });
  }

  const expiring = items.filter((i) => i.expiry && i.expiry >= TODAY && i.expiry <= addDays(TODAY, 60));

  return (
    <>
      {expiring.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base text-warning">Expiring in 60 days</CardTitle></CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {expiring.map((i) => <p key={i.id}>{i.name} ({i.type}) · {i.value} · expires {i.expiry}</p>)}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle className="text-base">Add a network item</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-5">
            <Input aria-label="Name" placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <select aria-label="Type" className={selectClass} value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as NetworkItem["type"] })}>{(["Domain", "SSL", "IP Range", "Wi-Fi", "DNS", "Other"] as const).map((t) => <option key={t} value={t}>{t}</option>)}</select>
            <Input aria-label="Value" placeholder="IP, domain, SSID…" value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} />
            <Input aria-label="Expiry" type="date" value={draft.expiry} onChange={(e) => setDraft({ ...draft, expiry: e.target.value })} />
            <Button type="submit" disabled={draft.name.trim().length < 2 || draft.value.trim().length < 2}>Add</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="grid gap-3 p-4 text-sm">
          {items.length === 0 ? <p className="text-muted-foreground">No network items yet.</p> : null}
          {items.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 last:border-0">
              <span>
                <span className="font-medium">{i.name}</span> · {i.value}
                <span className="block text-xs text-muted-foreground">{i.type}{i.expiry ? ` · expires ${i.expiry}` : " · no expiry"}{i.notes ? ` · ${i.notes}` : ""}</span>
              </span>
              <span className="flex items-center gap-2">
                <Badge variant={i.expiry && i.expiry < TODAY ? "danger" : "neutral"}>{i.type}</Badge>
                <Button size="sm" variant="ghost" onClick={() => run(removeNetworkItem(i.id, me), `${i.name} removed`)}>Remove</Button>
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

function OnboardingChecklistsView() {
  const session = useSession();
  const me = session.user.name ?? session.user.email ?? "You";
  const checklists = useITStore((state) => state.onboardingChecklists);
  const addOnboarding = useITStore((state) => state.addOnboarding);
  const toggleOnboardingItem = useITStore((state) => state.toggleOnboardingItem);
  const [draft, setDraft] = React.useState({ employeeName: "", joiningDate: TODAY });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = addOnboarding(draft, me);
    if (run(problem, "Onboarding checklist created")) setDraft({ employeeName: "", joiningDate: TODAY });
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Create onboarding checklist</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
            <Input aria-label="Employee name" placeholder="New joiner's name" value={draft.employeeName} onChange={(e) => setDraft({ ...draft, employeeName: e.target.value })} />
            <Input aria-label="Joining date" type="date" value={draft.joiningDate} onChange={(e) => setDraft({ ...draft, joiningDate: e.target.value })} />
            <Button type="submit" disabled={draft.employeeName.trim().length < 2}>Create checklist</Button>
          </form>
        </CardContent>
      </Card>
      {checklists.length === 0 ? <Card><CardContent className="p-6 text-sm text-muted-foreground">No onboarding checklists yet.</CardContent></Card> : null}
      {checklists.map((cl) => {
        const done = cl.items.filter((i) => i.done).length;
        const total = cl.items.length;
        return (
          <Card key={cl.id}>
            <CardHeader>
              <CardTitle className="text-base">
                {cl.employeeName} <span className="text-sm font-normal text-muted-foreground">· joining {cl.joiningDate} · {done}/{total} done</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {cl.items.map((item, idx) => (
                <label key={idx} className="flex cursor-pointer items-center gap-2 border-b border-border pb-2 last:border-0">
                  <input type="checkbox" checked={item.done} onChange={() => toggleOnboardingItem(cl.id, idx, me)} className="accent-accent" />
                  <span className={item.done ? "line-through text-muted-foreground" : ""}>{item.label}</span>
                  {item.done && item.doneBy && <span className="text-xs text-muted-foreground">· {item.doneBy} on {item.doneAt}</span>}
                </label>
              ))}
              {done === total && <p className="mt-1 text-xs text-success">All items complete. {cl.employeeName} is ready.</p>}
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}

function ITPoliciesView() {
  const people = useITPeople();
  const session = useSession();
  const me = session.user.name ?? session.user.email ?? "You";
  const policies = useITStore((state) => state.itPolicies);
  const addITPolicy = useITStore((state) => state.addITPolicy);
  const acknowledgePolicy = useITStore((state) => state.acknowledgePolicy);
  const [draft, setDraft] = React.useState({ name: "", version: "1.0", effectiveDate: TODAY, body: "" });
  const [ackPerson, setAckPerson] = React.useState<Record<string, string>>({});

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = addITPolicy(draft, me);
    if (run(problem, "Policy published")) setDraft({ name: "", version: "1.0", effectiveDate: TODAY, body: "" });
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Publish a policy</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Input aria-label="Policy name" placeholder="Policy name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              <Input aria-label="Version" placeholder="Version, e.g. 1.0" value={draft.version} onChange={(e) => setDraft({ ...draft, version: e.target.value })} />
              <Input aria-label="Effective date" type="date" value={draft.effectiveDate} onChange={(e) => setDraft({ ...draft, effectiveDate: e.target.value })} />
            </div>
            <textarea aria-label="Policy body" className="min-h-[100px] rounded-md border border-input bg-surface px-3 py-2 text-sm" placeholder="Write the policy…" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
            <Button type="submit" className="w-fit" disabled={draft.name.trim().length < 3 || draft.body.trim().length < 10}>Publish policy</Button>
          </form>
        </CardContent>
      </Card>
      {policies.length === 0 ? <Card><CardContent className="p-6 text-sm text-muted-foreground">No IT policies yet.</CardContent></Card> : null}
      {policies.map((p) => (
        <Card key={p.id}>
          <CardHeader>
            <CardTitle className="text-base">
              {p.name} <span className="text-sm font-normal text-muted-foreground">· v{p.version} · effective {p.effectiveDate} · {p.acknowledgedBy.length} acknowledged</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p className="whitespace-pre-wrap text-xs text-muted-foreground">{p.body}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {p.acknowledgedBy.map((name) => <Badge key={name} variant="success">{name}</Badge>)}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <select aria-label="Acknowledge as" className={selectClass} value={ackPerson[p.id] ?? ""} onChange={(e) => setAckPerson((prev) => ({ ...prev, [p.id]: e.target.value }))}>
                <option value="">Acknowledge as…</option>
                {people.filter((u) => !p.acknowledgedBy.includes(u.name)).map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
              </select>
              <Button size="sm" disabled={!ackPerson[p.id]} onClick={() => { const person = ackPerson[p.id]; if (!person) return; const problem = acknowledgePolicy(p.id, person); if (problem) toast.error(problem); else { toast.success(`${person} acknowledged ${p.name}`); setAckPerson((prev) => ({ ...prev, [p.id]: "" })); } }}>Acknowledge</Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </>
  );
}

function ProblemsView() {
  const session = useSession();
  const me = session.user.name ?? session.user.email ?? "You";
  const problems = useITStore((state) => state.problems);
  const incidents = useITStore((state) => state.incidents);
  const addProblem = useITStore((state) => state.addProblem);
  const updateProblem = useITStore((state) => state.updateProblem);
  const linkIncidentToProblem = useITStore((state) => state.linkIncidentToProblem);
  const [draft, setDraft] = React.useState({ title: "", description: "" });
  const [rootCauseTexts, setRootCauseTexts] = React.useState<Record<string, string>>({});
  const [workaroundTexts, setWorkaroundTexts] = React.useState<Record<string, string>>({});

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const err = addProblem(draft, me);
    if (run(err, "Problem opened")) setDraft({ title: "", description: "" });
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Open problems" value={String(problems.filter((p) => p.status === "open").length)} />
        <Kpi label="Root cause identified" value={String(problems.filter((p) => p.status === "root-cause-identified").length)} />
        <Kpi label="Resolved" value={String(problems.filter((p) => p.status === "resolved").length)} />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Open a problem</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3">
            <Input aria-label="Problem title" placeholder="What keeps recurring?" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            <textarea aria-label="Problem description" className="min-h-[60px] rounded-md border border-input bg-surface px-3 py-2 text-sm" placeholder="Describe the pattern, affected systems, frequency…" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            <Button type="submit" className="w-fit" disabled={draft.title.trim().length < 5}>Open problem</Button>
          </form>
        </CardContent>
      </Card>
      {problems.length === 0 ? <Card><CardContent className="p-6 text-sm text-muted-foreground">No problems recorded yet. Open a problem when multiple incidents share the same root cause.</CardContent></Card> : null}
      {problems.map((prb) => {
        const linked = incidents.filter((i) => prb.incidentIds.includes(i.id));
        const unlinked = incidents.filter((i) => !prb.incidentIds.includes(i.id));
        return (
          <Card key={prb.id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                <span>{prb.number} · {prb.title}</span>
                <Badge variant={prb.status === "resolved" ? "success" : prb.status === "root-cause-identified" ? "accent" : "warning"}>{prb.status}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              {prb.description && <p className="text-xs text-muted-foreground">{prb.description}</p>}
              <p className="text-xs text-muted-foreground">Opened by {prb.createdBy} on {prb.createdAt} · {linked.length} linked incident{linked.length !== 1 ? "s" : ""}</p>
              {linked.length > 0 && (
                <div className="grid gap-1 pl-3">
                  {linked.map((i) => <p key={i.id} className="text-xs"><Badge variant={i.status === "resolved" ? "success" : "warning"} className="mr-1">{i.status}</Badge>{i.number} · {i.title} ({i.severity})</p>)}
                </div>
              )}
              {unlinked.length > 0 && prb.status !== "resolved" && (
                <select aria-label="Link incident" className={selectClass} value="" onChange={(e) => { if (e.target.value) run(linkIncidentToProblem(prb.id, e.target.value, me), "Incident linked"); }}>
                  <option value="">Link an incident…</option>
                  {unlinked.map((i) => <option key={i.id} value={i.id}>{i.number} · {i.title}</option>)}
                </select>
              )}
              <div className="grid gap-2">
                <div>
                  <p className="text-xs font-medium">Root cause</p>
                  {prb.rootCause ? <p className="text-xs text-muted-foreground">{prb.rootCause}</p> : prb.status !== "resolved" ? (
                    <div className="mt-1 flex items-center gap-2">
                      <Input className="h-7 text-xs" placeholder="What is the root cause?" value={rootCauseTexts[prb.id] ?? ""} onChange={(e) => setRootCauseTexts((prev) => ({ ...prev, [prb.id]: e.target.value }))} />
                      <Button size="sm" variant="secondary" disabled={!(rootCauseTexts[prb.id] ?? "").trim()} onClick={() => { run(updateProblem(prb.id, { rootCause: rootCauseTexts[prb.id] ?? "", status: "root-cause-identified" }, me), "Root cause recorded"); setRootCauseTexts((prev) => ({ ...prev, [prb.id]: "" })); }}>Save</Button>
                    </div>
                  ) : null}
                </div>
                <div>
                  <p className="text-xs font-medium">Workaround</p>
                  {prb.workaround ? <p className="text-xs text-muted-foreground">{prb.workaround}</p> : prb.status !== "resolved" ? (
                    <div className="mt-1 flex items-center gap-2">
                      <Input className="h-7 text-xs" placeholder="Temporary workaround" value={workaroundTexts[prb.id] ?? ""} onChange={(e) => setWorkaroundTexts((prev) => ({ ...prev, [prb.id]: e.target.value }))} />
                      <Button size="sm" variant="ghost" disabled={!(workaroundTexts[prb.id] ?? "").trim()} onClick={() => { run(updateProblem(prb.id, { workaround: workaroundTexts[prb.id] ?? "" }, me), "Workaround saved"); setWorkaroundTexts((prev) => ({ ...prev, [prb.id]: "" })); }}>Save</Button>
                    </div>
                  ) : null}
                </div>
              </div>
              {prb.status !== "resolved" && prb.rootCause && (
                <Button size="sm" className="w-fit" onClick={() => run(updateProblem(prb.id, { status: "resolved" }, me), `${prb.number} resolved`)}>Mark resolved</Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}

function ITSettingsView() {
  const session = useSession();
  const me = session.user.name ?? session.user.email ?? "You";
  const customFields = useITStore((state) => state.customFields);
  const addCustomField = useITStore((state) => state.addCustomField);
  const removeCustomField = useITStore((state) => state.removeCustomField);
  const [draft, setDraft] = React.useState<{ label: string; type: CustomField["type"]; required: boolean; options: string; categories: (typeof HELPDESK_CATEGORIES)[number][]; visibleToRequester: boolean }>({ label: "", type: "text", required: false, options: "", categories: [...HELPDESK_CATEGORIES], visibleToRequester: true });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const opts = draft.type === "dropdown" ? draft.options.split(",").map((o) => o.trim()).filter(Boolean) : [];
    const problem = addCustomField({ label: draft.label, type: draft.type, required: draft.required, options: opts, categories: draft.categories, visibleToRequester: draft.visibleToRequester }, me);
    if (run(problem, "Custom field added")) setDraft({ label: "", type: "text", required: false, options: "", categories: [...HELPDESK_CATEGORIES], visibleToRequester: true });
  }

  function toggleCat(cat: (typeof HELPDESK_CATEGORIES)[number]) {
    setDraft((prev) => ({ ...prev, categories: prev.categories.includes(cat) ? prev.categories.filter((c) => c !== cat) : [...prev.categories, cat] }));
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Custom ticket fields</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-xs text-muted-foreground">Add fields that appear when someone raises a ticket. Each field can be tied to specific categories, so the form adapts to what the requester selected. This is how ServiceNow and Freshservice handle per-category forms.</p>
          <form onSubmit={submit} className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-4">
              <Input aria-label="Field label" placeholder="Field label, e.g. Floor number" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
              <select aria-label="Field type" className={selectClass} value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as CustomField["type"] })}>
                {CUSTOM_FIELD_TYPES.map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
              </select>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={draft.required} onChange={(e) => setDraft({ ...draft, required: e.target.checked })} className="accent-accent" />Required</label>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={draft.visibleToRequester} onChange={(e) => setDraft({ ...draft, visibleToRequester: e.target.checked })} className="accent-accent" />Visible to requester</label>
            </div>
            {draft.type === "dropdown" && <Input aria-label="Options (comma-separated)" placeholder="Options, comma-separated: Head office, Warehouse, Branch" value={draft.options} onChange={(e) => setDraft({ ...draft, options: e.target.value })} />}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Show for categories:</span>
              {HELPDESK_CATEGORIES.map((cat) => (
                <label key={cat} className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={draft.categories.includes(cat)} onChange={() => toggleCat(cat)} className="accent-accent" />{cat}
                </label>
              ))}
            </div>
            <Button type="submit" className="w-fit" disabled={draft.label.trim().length < 2 || draft.categories.length === 0}>Add field</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Active custom fields ({customFields.length})</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm">
          {customFields.length === 0 ? <p className="text-muted-foreground">No custom fields. The ticket form uses only the built-in fields.</p> : null}
          {customFields.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 last:border-0">
              <span>
                <span className="font-medium">{f.label}</span>
                <span className="block text-xs text-muted-foreground">{f.type}{f.required ? " · required" : " · optional"} · {f.visibleToRequester ? "visible to requester" : "IT only"} · {f.categories.join(", ")}</span>
                {f.type === "dropdown" && f.options.length > 0 && <span className="block text-xs text-muted-foreground">Options: {f.options.join(", ")}</span>}
              </span>
              <Button size="sm" variant="ghost" onClick={() => run(removeCustomField(f.id, me), `${f.label} removed`)}>Remove</Button>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">SLA targets</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <p className="text-xs text-muted-foreground">Default resolution time by priority. These are set in code and apply to all new tickets.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-surface-2 p-3"><p className="text-xs font-medium">High priority</p><p className="mt-1 text-lg font-bold">Same day</p></div>
            <div className="rounded-lg border border-border bg-surface-2 p-3"><p className="text-xs font-medium">Medium priority</p><p className="mt-1 text-lg font-bold">1 business day</p></div>
            <div className="rounded-lg border border-border bg-surface-2 p-3"><p className="text-xs font-medium">Low priority</p><p className="mt-1 text-lg font-bold">3 business days</p></div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Ticket categories</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <p className="text-xs text-muted-foreground">The categories a requester picks from. Categories control which custom fields appear.</p>
          <div className="flex flex-wrap gap-2">{HELPDESK_CATEGORIES.map((cat) => <Badge key={cat} variant="neutral">{cat}</Badge>)}</div>
        </CardContent>
      </Card>
    </>
  );
}
