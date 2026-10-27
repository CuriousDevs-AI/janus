"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { demoMode } from "@/lib/demo-mode";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/components/auth/session-provider";
import { TrailPanel } from "@/components/shared/audit-trail-panel";
import { useFinanceStore, dueAmount } from "@/lib/stores/finance-store";
import { DEFAULT_HOURLY_COST, PROJECT_TYPES, TODAY, addDays, projectHealth, projectProfitability, useProjectsStore, type Project } from "@/lib/stores/projects-store";
import { users } from "@/lib/mock-data";
import { useCrmLinkOptions } from "@/lib/record-links";
import { TimelineView } from "@/components/projects/project-timeline";
import { archiveProjectTimeline, describeUnmatched, syncProjectTimeline } from "@/lib/timeline-sync";
import { projectPersonRefs } from "@/lib/timeline-team";
import { mirrorNewProject, refreshProjectRecords, setProjectRecordStatus } from "@/lib/project-records";
import { message } from "@/lib/api/client";

const money = (value: number) => `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const selectClass = "h-9 w-full rounded-md border border-input bg-surface px-3 text-sm";

const comingSoon: Record<string, string> = {
};

export function ProjectsWorkspace() {
  const searchParams = useSearchParams();
  const view = searchParams.get("view") ?? "overview";
  const session = useSession();
  const me = session.user.name ?? session.user.email ?? "You";
  const titles: Record<string, string> = { overview: "Delivery overview", timesheets: "Timesheets", resources: "Resource allocation", reports: "Project profitability", calendar: "Project calendar", projects: "Projects", milestones: "Milestones & billing", tasks: "Tasks", changes: "Change requests", "client-delivery": "Client delivery" };

  if (view in comingSoon) {
    return (
      <div className="mx-auto flex max-w-[1200px] flex-col">
        <PageHeader title="Coming soon" description="Projects & Delivery" />
        <div className="px-6 pb-10"><Card><CardContent className="p-6 text-sm text-muted-foreground">{comingSoon[view]}</CardContent></Card></div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col">
      <PageHeader title={titles[view] ?? "Delivery overview"} description="Projects draw their budget from a fund allocation. Milestones bill on acceptance. Delivery health is computed from dates and open work." />
      <div className="flex flex-col gap-4 px-6 pb-10">
        {view === "projects" && <ProjectsView me={me} />}
        {view === "milestones" && <MilestonesView me={me} />}
        {view === "tasks" && <TasksView />}
        {view === "changes" && <ChangesView me={me} />}
        {view === "timesheets" && <TimesheetsView me={me} />}
        {view === "resources" && <ResourcesView />}
        {view === "reports" && <ProfitabilityView />}
        {view === "calendar" && <CalendarView />}
        {view === "client-delivery" && <ClientView />}
        {view === "timeline" && <TimelineView />}
        {!["projects", "milestones", "tasks", "changes", "client-delivery", "timesheets", "resources", "reports", "calendar"].includes(view) && <OverviewView />}
        {!["projects", "milestones", "tasks", "changes", "client-delivery", "timesheets", "resources", "reports", "calendar"].includes(view) && <ProjectsTrail />}
      </div>
    </div>
  );
}

function healthTone(health: string) {
  return health === "late" ? "danger" : health === "at risk" ? "warning" : health === "done" ? "success" : "neutral";
}

function ProjectsTrail() {
  const trail = useProjectsStore((state) => state.trail);
  return <TrailPanel entries={trail} />;
}

/** Hours people worked on projects. Logged by day; a person cannot log more than 12 hours in a day. */
function TimesheetsView({ me }: { me: string }) {
  const projects = useProjectsStore((state) => state.projects);
  const timesheets = useProjectsStore((state) => state.timesheets);
  const logHours = useProjectsStore((state) => state.logHours);
  const [projectId, setProjectId] = React.useState("");
  const [person, setPerson] = React.useState(me);
  const [date, setDate] = React.useState(TODAY);
  const [hours, setHours] = React.useState("");
  const [note, setNote] = React.useState("");

  function save() {
    const problem = logHours({ projectId, person, date, hours: Number(hours), note }, me);
    if (problem) return toast.error(problem);
    toast.success("Hours logged");
    setHours(""); setNote("");
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Log hours</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-xs text-muted-foreground">Log the hours a person worked on a project, by day. Hours are entered, not estimated. A day cannot go over 12 hours for one person.</p>
          <div className="grid gap-3 sm:grid-cols-6">
            <select aria-label="Project" className={selectClass} value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="">Project…</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <select aria-label="Person" className={selectClass} value={person} onChange={(e) => setPerson(e.target.value)}>{users.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}</select>
            <Input aria-label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <Input aria-label="Hours" type="number" min={0.5} max={12} step={0.5} placeholder="Hours" value={hours} onChange={(e) => setHours(e.target.value)} />
            <Input aria-label="Note" placeholder="What was done" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button disabled={!projectId || !person || !(Number(hours) > 0)} onClick={save}>Log hours</Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="px-4 py-2">Date</th><th className="px-4 py-2">Person</th><th className="px-4 py-2">Project</th><th className="px-4 py-2 text-right">Hours</th><th className="px-4 py-2">Note</th></tr></thead>
            <tbody>
              {timesheets.length === 0 ? <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No hours logged yet.</td></tr> : null}
              {timesheets.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">{t.date}</td>
                  <td className="px-4 py-3">{t.person}</td>
                  <td className="px-4 py-3">{projects.find((p) => p.id === t.projectId)?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{t.hours}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}

/** Planned share of each person's week across projects, with the hours they logged this week. Over 100% is flagged. */
function ResourcesView() {
  const projects = useProjectsStore((state) => state.projects);
  const allocations = useProjectsStore((state) => state.allocations);
  const timesheets = useProjectsStore((state) => state.timesheets);
  const setAllocation = useProjectsStore((state) => state.setAllocation);
  const session = useSession();
  const me = session.user.name ?? session.user.email ?? "You";
  const [projectId, setProjectId] = React.useState("");
  const [person, setPerson] = React.useState("");
  const [percent, setPercent] = React.useState("");
  const weekStart = addDays(TODAY, -6);

  function save() {
    const problem = setAllocation(projectId, person, Number(percent), me);
    if (problem) return toast.error(problem);
    toast.success("Allocation saved");
    setPercent("");
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Plan a share of someone&apos;s week</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <select aria-label="Allocation project" className={selectClass} value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="">Project…</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <select aria-label="Allocation person" className={selectClass} value={person} onChange={(e) => setPerson(e.target.value)}><option value="">Person…</option>{users.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}</select>
            <Input aria-label="Share of week" type="number" min={1} max={100} placeholder="% of week" value={percent} onChange={(e) => setPercent(e.target.value)} />
            <Button disabled={!projectId || !person || !(Number(percent) > 0)} onClick={save}>Save share</Button>
          </div>
        </CardContent>
      </Card>
      {users.map((u) => {
        const mine = allocations.filter((a) => a.person === u.name);
        const total = mine.reduce((sum, a) => sum + a.percent, 0);
        const logged = timesheets.filter((t) => t.person === u.name && t.date >= weekStart && t.date <= TODAY).reduce((sum, t) => sum + t.hours, 0);
        if (mine.length === 0 && logged === 0) return null;
        return (
          <Card key={u.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {u.name}
                <Badge variant={total > 100 ? "danger" : "neutral"}>{total}% planned</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              {mine.map((a) => <p key={a.id}>{projects.find((p) => p.id === a.projectId)?.name ?? "Project"} · {a.percent}%</p>)}
              <p className="text-xs text-muted-foreground">{logged} hours logged in the last 7 days.{total > 100 ? " Over-allocated: the planned shares add up to more than the week." : ""}</p>
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}

/** Profit per project to date: accepted milestones billed, against the cost of the hours logged. People without a rate use the default. */
function ProfitabilityView() {
  const session = useSession();
  const me = session.user.name ?? session.user.email ?? "You";
  const projects = useProjectsStore((state) => state.projects);
  const milestones = useProjectsStore((state) => state.milestones);
  const timesheets = useProjectsStore((state) => state.timesheets);
  const rates = useProjectsStore((state) => state.rates);
  const setCostRate = useProjectsStore((state) => state.setCostRate);
  const [person, setPerson] = React.useState("");
  const [hourly, setHourly] = React.useState("");

  function save() {
    const problem = setCostRate(person, Number(hourly), me);
    if (problem) return toast.error(problem);
    toast.success("Cost saved");
    setHourly("");
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Cost per hour</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <p className="text-xs text-muted-foreground">Project cost is hours logged times what each person costs an hour. A person with no cost set uses ₹{DEFAULT_HOURLY_COST} an hour.</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <select aria-label="Cost person" className={selectClass} value={person} onChange={(e) => setPerson(e.target.value)}><option value="">Person…</option>{users.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}</select>
            <Input aria-label="Cost per hour" type="number" min={0} placeholder="₹ per hour" value={hourly} onChange={(e) => setHourly(e.target.value)} />
            <Button disabled={!person || hourly === ""} onClick={save}>Save cost</Button>
          </div>
          <p className="text-xs text-muted-foreground">{rates.length === 0 ? "No cost set yet; everyone uses the default." : rates.map((r) => `${r.person}: ₹${r.hourlyCost}/hr`).join(" · ")}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm tabular-nums">
            <thead><tr className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="px-4 py-2">Project</th><th className="px-4 py-2 text-right">Billed</th><th className="px-4 py-2 text-right">Hours</th><th className="px-4 py-2 text-right">Cost</th><th className="px-4 py-2 text-right">Margin</th></tr></thead>
            <tbody>
              {projects.map((p) => {
                const r = projectProfitability(p, milestones, timesheets, rates);
                return (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium">{p.name}<span className="block text-xs font-normal text-muted-foreground">{p.client}</span></td>
                    <td className="px-4 py-3 text-right">{money(r.billed)}</td>
                    <td className="px-4 py-3 text-right">{r.hours}</td>
                    <td className="px-4 py-3 text-right">{money(r.cost)}</td>
                    <td className={`px-4 py-3 text-right ${r.margin !== null && r.margin < 0 ? "text-danger" : ""}`}>{r.margin === null ? "no billing yet" : `${r.margin}%`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}

/** Dated work over the next eight weeks: milestones due, tasks due, and project end dates, grouped by the week they fall in. */
function CalendarView() {
  const projects = useProjectsStore((state) => state.projects);
  const milestones = useProjectsStore((state) => state.milestones);
  const tasks = useProjectsStore((state) => state.tasks);
  const start = addDays(TODAY, -((new Date(Date.parse(TODAY)).getUTCDay() + 6) % 7));
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(start, i * 7));
  type Entry = { date: string; label: string; kind: "milestone" | "task" | "project end" };
  const entries: Entry[] = [
    ...milestones.filter((m) => m.status !== "accepted").map((m) => ({ date: m.due, label: `${m.name} · ${projects.find((p) => p.id === m.projectId)?.name ?? "project"}`, kind: "milestone" as const })),
    ...tasks.filter((t) => t.status !== "done").map((t) => ({ date: t.due, label: `${t.title} · ${t.assignee}`, kind: "task" as const })),
    ...projects.filter((p) => p.status !== "done").map((p) => ({ date: p.end, label: p.name, kind: "project end" as const })),
  ];

  return (
    <>
      <p className="text-xs text-muted-foreground">Open milestones, open tasks and project end dates for the next eight weeks, from the Monday of this week. Overdue items are listed in the first week.</p>
      {weeks.map((weekStart, index) => {
        const weekEnd = addDays(weekStart, 6);
        const inWeek = entries.filter((e) => (index === 0 ? e.date <= weekEnd : e.date >= weekStart && e.date <= weekEnd)).sort((a, b) => a.date.localeCompare(b.date));
        return (
          <Card key={weekStart}>
            <CardHeader><CardTitle className="text-base">Week of {weekStart}{index === 0 ? " (including overdue)" : ""}</CardTitle></CardHeader>
            <CardContent className="grid gap-1 text-sm">
              {inWeek.length === 0 ? <p className="text-muted-foreground">Nothing due.</p> : null}
              {inWeek.map((e, i) => (
                <p key={`${e.kind}-${i}-${e.label}`}><span className="text-muted-foreground">{e.date} · {e.kind} · </span>{e.label}{e.date < TODAY ? " · overdue" : ""}</p>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}

function OverviewView() {
  const projects = useProjectsStore((state) => state.projects);
  const milestones = useProjectsStore((state) => state.milestones);
  const tasks = useProjectsStore((state) => state.tasks);
  const counts = { active: projects.filter((p) => p.status === "active").length, late: projects.filter((p) => projectHealth(p, milestones, tasks) === "late").length, atRisk: projects.filter((p) => projectHealth(p, milestones, tasks) === "at risk").length, openTasks: tasks.filter((t) => t.status !== "done").length };
  return (
    <>
      {projects.length === 0 ? <Card><CardContent className="p-6 text-sm text-muted-foreground">No projects yet. Create one from Projects; it draws its budget from a fund allocation.</CardContent></Card> : null}
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi label="Active projects" value={String(counts.active)} />
        <Kpi label="Late" value={String(counts.late)} tone={counts.late > 0 ? "warning" : undefined} />
        <Kpi label="At risk" value={String(counts.atRisk)} tone={counts.atRisk > 0 ? "warning" : undefined} />
        <Kpi label="Open tasks" value={String(counts.openTasks)} />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Project health</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {projects.map((p) => <p key={p.id} className="flex items-center justify-between gap-3"><span>{p.name} · {p.client}</span><Badge variant={healthTone(projectHealth(p, milestones, tasks)) as "neutral"}>{projectHealth(p, milestones, tasks)}</Badge></p>)}
        </CardContent>
      </Card>
    </>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "warning" }) {
  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${tone === "warning" ? "text-amber-700" : ""}`}>{value}</p>
    </div>
  );
}

function ProjectsView({ me }: { me: string }) {
  const projects = useProjectsStore((state) => state.projects);
  const milestones = useProjectsStore((state) => state.milestones);
  const tasks = useProjectsStore((state) => state.tasks);
  const addProject = useProjectsStore((state) => state.addProject);
  const closeProject = useProjectsStore((state) => state.closeProject);
  const lines = useFinanceStore((state) => state.budgetLines);
  const [form, setForm] = React.useState({ name: "", client: "", customerId: "", type: PROJECT_TYPES[0] as string, owner: me, ownerId: "", start: TODAY, end: addDays(TODAY, 60), budget: "", budgetLineId: "" });
  // The server's copy of each project's core fields is loaded when the screen opens (real mode only).
  React.useEffect(() => {
    if (demoMode) return;
    refreshProjectRecords().catch(() => {
      /* the screen keeps its own copy if the server cannot be reached */
    });
  }, []);
  // The company directory, for choosing an owner by account (real mode only).
  const [people, setPeople] = React.useState<{ user_id: string; name: string }[]>([]);
  React.useEffect(() => {
    if (demoMode) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await api<{ user_id: string; name: string }[]>("/project-timelines/directory");
        if (!cancelled) setPeople(list);
      } catch {
        /* without the directory the owner is typed as before */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const links = useCrmLinkOptions();
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  function save() {
    const ownerChosen = form.ownerId || undefined;
    const problem = addProject({ name: form.name, client: form.client.trim() || "Internal", customerId: form.customerId || undefined, type: form.type as Project["type"], owner: form.owner.trim() || me, start: form.start, end: form.end, budget: Number(form.budget), budgetLineId: form.budgetLineId }, me);
    if (problem) return toast.error(problem);
    toast.success("Project created; its budget is drawn from the fund line");
    setForm({ ...form, name: "", client: "", customerId: "", budget: "" });
    // The project's timeline and team are created with it. A failure here is reported, never blocks the project.
    const created = useProjectsStore.getState().projects.at(-1);
    if (created) {
      mirrorNewProject(created, created.owner, ownerChosen)
        .then((links) => { if (Object.keys(links).length > 0) useProjectsStore.getState().linkPeople(created.id, links); })
        .catch((error: unknown) => toast.warning(`Project saved here, but not on the server: ${message(error)}`));
      syncProjectTimeline(created, projectPersonRefs(created, [], [], created.id))
        .then((result) => {
          if (result) useProjectsStore.getState().linkPeople(created.id, result.links);
          if (result && result.unmatched.length > 0) toast.warning(`Timeline created. Could not match: ${describeUnmatched(result.unmatched)}. Fix the names, then sync the team.`);
        })
        .catch((error: unknown) => toast.error(`Timeline not created: ${message(error)}`));
    }
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">New project</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-xs text-muted-foreground">The budget is drawn from the chosen budget line in Finance, so the line&apos;s remaining balance stays correct. A project cannot spend more than its line has left.</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="flex flex-col gap-1.5 sm:col-span-2"><Label htmlFor="pj-name">Name</Label><Input id="pj-name" value={form.name} onChange={(e) => set({ name: e.target.value })} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="pj-client">Client (blank for internal)</Label><Input id="pj-client" value={form.client} onChange={(e) => set({ client: e.target.value, customerId: "" })} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="pj-customer">CRM customer (optional)</Label><select id="pj-customer" className="h-8 rounded-md border border-input bg-surface px-2 text-xs" value={form.customerId} onChange={(e) => { const picked = links.customers.find((c) => c.id === e.target.value); set({ customerId: e.target.value, client: picked?.label ?? form.client }); }}><option value="">None</option>{links.customers.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="pj-type">Type</Label><select id="pj-type" className={selectClass} value={form.type} onChange={(e) => set({ type: e.target.value })}>{PROJECT_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="pj-owner">Owner</Label>{demoMode || people.length === 0 ? <Input id="pj-owner" value={form.owner} onChange={(e) => set({ owner: e.target.value, ownerId: "" })} /> : <select id="pj-owner" className={selectClass} value={form.ownerId} onChange={(e) => { const person = people.find((p) => p.user_id === e.target.value); set({ owner: person?.name ?? "", ownerId: e.target.value }); }}><option value="">Choose a person…</option>{people.map((p) => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}</select>}</div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="pj-start">Start</Label><Input id="pj-start" type="date" value={form.start} onChange={(e) => set({ start: e.target.value })} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="pj-end">End</Label><Input id="pj-end" type="date" value={form.end} onChange={(e) => set({ end: e.target.value })} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="pj-budget">Budget (₹)</Label><Input id="pj-budget" type="number" min={0} value={form.budget} onChange={(e) => set({ budget: e.target.value })} /></div>
            <div className="flex flex-col gap-1.5 sm:col-span-2"><Label htmlFor="pj-line">Budget line</Label><select id="pj-line" className={selectClass} value={form.budgetLineId} onChange={(e) => set({ budgetLineId: e.target.value })}><option value="">Choose…</option>{lines.map((l) => <option key={l.id} value={l.id}>{l.name} · {money(l.allocated - l.drawn)} left</option>)}</select></div>
          </div>
          <Button className="w-fit" onClick={save}>Create project</Button>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="px-4 py-2">Project</th><th className="px-4 py-2">Type</th><th className="px-4 py-2">Owner</th><th className="px-4 py-2">End</th><th className="px-4 py-2 text-right">Budget</th><th className="px-4 py-2">Health</th><th className="px-4 py-2" /></tr></thead>
            <tbody>
              {projects.length === 0 ? <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No projects yet.</td></tr> : null}
              {projects.map((p) => {
                const health = projectHealth(p, milestones, tasks);
                return (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium">{p.name}<span className="block text-xs text-muted-foreground">{p.client} · {milestones.filter((m) => m.projectId === p.id).length} milestones · {tasks.filter((t) => t.projectId === p.id && t.status !== "done").length} open tasks</span></td>
                    <td className="px-4 py-3">{p.type}</td>
                    <td className="px-4 py-3">{p.owner}</td>
                    <td className="px-4 py-3">{p.end}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(p.budget)}</td>
                    <td className="px-4 py-3"><Badge variant={healthTone(health) as "neutral"}>{health}</Badge></td>
                    <td className="px-4 py-3 text-right">{p.status === "done" ? <span className="text-xs text-muted-foreground">Closed</span> : <Button size="sm" variant="ghost" onClick={() => { const problem = closeProject(p.id, me); if (problem) toast.error(problem); else { toast.success(`${p.name} closed; unused budget released. Closure summary saved.`); archiveProjectTimeline(p.id).catch((error: unknown) => toast.error(`Timeline not closed: ${message(error)}`)); setProjectRecordStatus(p.id, "done").catch((error: unknown) => toast.warning(`Closed here, but not on the server: ${message(error)}`)); } }}>Close project</Button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}

function MilestonesView({ me }: { me: string }) {
  const projects = useProjectsStore((state) => state.projects);
  const milestones = useProjectsStore((state) => state.milestones);
  const addMilestone = useProjectsStore((state) => state.addMilestone);
  const complete = useProjectsStore((state) => state.completeMilestone);
  const accept = useProjectsStore((state) => state.acceptMilestone);
  const invoices = useFinanceStore((state) => state.invoices);
  const creditNotes = useFinanceStore((state) => state.creditNotes);
  const raiseDispute = useProjectsStore((state) => state.raiseDispute);
  const resolveDispute = useProjectsStore((state) => state.resolveDispute);
  const [disputeFor, setDisputeFor] = React.useState("");
  const [disputeReason, setDisputeReason] = React.useState("");
  const [projectId, setProjectId] = React.useState("");
  const [name, setName] = React.useState("");
  const [due, setDue] = React.useState(TODAY);
  const [amount, setAmount] = React.useState("");

  const open = milestones.filter((m) => m.dispute);
  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Disputes · {open.length} open</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <p className="text-xs text-muted-foreground">A disputed milestone cannot be accepted or billed until the dispute is resolved. An accepted milestone is already billed, so it is handled as a credit note in Finance.</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <select aria-label="Milestone in dispute" className={selectClass} value={disputeFor} onChange={(e) => setDisputeFor(e.target.value)}><option value="">Milestone…</option>{milestones.filter((m) => m.status !== "accepted" && !m.dispute).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
            <Input aria-label="What is in dispute" placeholder="What is in dispute" value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)} />
            <Button disabled={!disputeFor || disputeReason.trim().length < 5} onClick={() => { const p = raiseDispute(disputeFor, disputeReason, me); if (p) toast.error(p); else { toast.success("Milestone is in dispute; billing is stopped"); setDisputeFor(""); setDisputeReason(""); } }}>Raise dispute</Button>
          </div>
          {open.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0">
              <span>{m.name} · <span className="text-muted-foreground">{m.dispute?.reason} · raised by {m.dispute?.raisedBy} on {m.dispute?.date}</span></span>
              <Button size="sm" variant="secondary" onClick={() => { const p = resolveDispute(m.id, me); if (p) toast.error(p); else toast.success("Dispute resolved"); }}>Resolve dispute</Button>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Add a milestone</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-xs text-muted-foreground">Accepting a milestone creates an invoice for its amount in Finance. The person who completed the milestone cannot accept it.</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <select aria-label="Project" className={selectClass} value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="">Project…</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <Input aria-label="Milestone name" placeholder="Milestone" value={name} onChange={(e) => setName(e.target.value)} />
            <Input aria-label="Due date" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            <Input aria-label="Billing amount" type="number" min={0} placeholder="Amount (₹, before GST)" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <Button className="w-fit" disabled={!projectId || name.trim().length < 3} onClick={() => { const p = addMilestone({ projectId, name, due, amount: Number(amount) || 0 }); if (p) return toast.error(p); toast.success("Milestone added"); setName(""); setAmount(""); }}>Add milestone</Button>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="px-4 py-2">Milestone</th><th className="px-4 py-2">Project</th><th className="px-4 py-2">Due</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2">Status</th><th className="px-4 py-2" /></tr></thead>
            <tbody>
              {milestones.length === 0 ? <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No milestones yet.</td></tr> : null}
              {milestones.map((m) => {
                const project = projects.find((p) => p.id === m.projectId);
                const invoice = m.invoiceNumber ? invoices.find((i) => i.number === m.invoiceNumber) : undefined;
                return (
                  <tr key={m.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium">{m.name}{m.invoiceNumber ? <span className="block text-xs text-muted-foreground">Invoice {m.invoiceNumber} · {invoice ? money(dueAmount(invoice, creditNotes)) + " due" : ""}</span> : null}</td>
                    <td className="px-4 py-3">{project?.name}</td>
                    <td className="px-4 py-3">{m.due}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(m.amount)}</td>
                    <td className="px-4 py-3"><Badge variant={m.status === "accepted" ? "success" : m.status === "done" ? "warning" : "neutral"}>{m.status}</Badge>{m.dispute ? <Badge variant="danger" className="ml-1">in dispute</Badge> : null}{m.acceptedBy ? <span className="block text-xs text-muted-foreground">accepted by {m.acceptedBy}</span> : null}</td>
                    <td className="px-4 py-3 text-right"><div className="flex justify-end gap-1">
                      {m.status === "planned" ? <Button size="sm" variant="secondary" onClick={() => { const p = complete(m.id, me); if (p) toast.error(p); else toast.success("Marked complete"); }}>Mark complete</Button> : null}
                      {m.status === "done" && m.dispute ? <span className="self-center text-xs text-muted-foreground">Resolve the dispute to accept</span> : null}
                      {m.status === "done" && !m.dispute ? <Button size="sm" variant="secondary" onClick={() => { const p = accept(m.id, me); if (p) toast.error(p); else toast.success(m.amount > 0 ? "Accepted; invoice created in Finance" : "Accepted"); }}>Accept</Button> : null}
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}

function TasksView() {
  const projects = useProjectsStore((state) => state.projects);
  const tasks = useProjectsStore((state) => state.tasks);
  const addTask = useProjectsStore((state) => state.addTask);
  const setStatus = useProjectsStore((state) => state.setTaskStatus);
  const [projectId, setProjectId] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [assignee, setAssignee] = React.useState("");
  const [due, setDue] = React.useState(addDays(TODAY, 7));

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Add a task</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <select aria-label="Project" className={selectClass} value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="">Project…</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <Input aria-label="Task title" placeholder="Task" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input aria-label="Assignee" placeholder="Assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)} />
            <Input aria-label="Due date" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <Button className="w-fit" disabled={!projectId || title.trim().length < 3 || assignee.trim().length < 2} onClick={() => { const p = addTask({ projectId, milestoneId: null, title, assignee: assignee.trim(), due }); if (p) return toast.error(p); toast.success("Task added"); setTitle(""); }}>Add task</Button>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="grid gap-2 p-4 text-sm">
          {tasks.length === 0 ? <p className="text-muted-foreground">No tasks yet.</p> : null}
          {tasks.map((t) => {
            const project = projects.find((p) => p.id === t.projectId);
            const overdue = t.status !== "done" && t.due < TODAY;
            return (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0">
                <span><span className="font-medium">{t.title}</span> · {project?.name} · {t.assignee} · due {t.due}{overdue ? <Badge variant="warning" className="ml-2">overdue</Badge> : null}</span>
                <select aria-label={`Status of ${t.title}`} className="h-8 rounded-md border border-input bg-surface px-2 text-xs" value={t.status} onChange={(e) => setStatus(t.id, e.target.value as typeof t.status)}><option value="todo">To do</option><option value="doing">Doing</option><option value="done">Done</option></select>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </>
  );
}

function ChangesView({ me }: { me: string }) {
  const projects = useProjectsStore((state) => state.projects);
  const changes = useProjectsStore((state) => state.changes);
  const requestChange = useProjectsStore((state) => state.requestChange);
  const decide = useProjectsStore((state) => state.decideChange);
  const versions = useProjectsStore((state) => state.versions);
  const [projectId, setProjectId] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [budgetChange, setBudgetChange] = React.useState("0");
  const [dayChange, setDayChange] = React.useState("0");

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Plan versions</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <p className="text-xs text-muted-foreground">Each approved change adds a version. Earlier versions are kept, so the plan can be read as it was before any change.</p>
          {versions.length === 0 ? <p className="text-muted-foreground">No change has been approved yet, so there is only the plan as first set.</p> : null}
          {projects.filter((p) => versions.some((v) => v.projectId === p.id)).map((p) => (
            <div key={p.id} className="grid gap-1">
              <p className="font-medium">{p.name}</p>
              {versions.filter((v) => v.projectId === p.id).map((v) => (
                <p key={v.id} className="text-xs text-muted-foreground">v{v.number} · budget {money(v.budget)} · ends {v.end} · {v.note} · by {v.by} on {v.date}</p>
              ))}
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Request a change</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-xs text-muted-foreground">Approval by someone other than the requester. Approving changes the project&apos;s budget and end date, and keeps a record of the decision.</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <select aria-label="Project" className={selectClass} value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="">Project…</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <Input aria-label="Change description" className="sm:col-span-2" placeholder="What changes" value={description} onChange={(e) => setDescription(e.target.value)} />
            <Input aria-label="Budget change" type="number" value={budgetChange} onChange={(e) => setBudgetChange(e.target.value)} />
            <Input aria-label="Days change" type="number" value={dayChange} onChange={(e) => setDayChange(e.target.value)} />
          </div>
          <Button className="w-fit" disabled={!projectId || description.trim().length < 5} onClick={() => { const p = requestChange({ projectId, description, budgetChange: Number(budgetChange), dayChange: Number(dayChange) }, me); if (p) return toast.error(p); toast.success("Change request sent"); setDescription(""); }}>Send request</Button>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="grid gap-2 p-4 text-sm">
          {changes.length === 0 ? <p className="text-muted-foreground">No change requests yet.</p> : null}
          {changes.map((c) => {
            const project = projects.find((p) => p.id === c.projectId);
            return (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0">
                <span>{project?.name} · {c.description} · budget {c.budgetChange >= 0 ? "+" : ""}{money(c.budgetChange)} · {c.dayChange >= 0 ? "+" : ""}{c.dayChange} days · by {c.requestedBy}</span>
                {c.status === "pending" ? <span className="flex gap-1"><Button size="sm" variant="secondary" onClick={() => { const p = decide(c.id, true, me); if (p) toast.error(p); else toast.success("Change approved"); }}>Approve</Button><Button size="sm" variant="ghost" onClick={() => { const p = decide(c.id, false, me); if (p) toast.error(p); else toast.success("Change rejected"); }}>Reject</Button></span> : <Badge variant={c.status === "approved" ? "success" : "danger"}>{c.status}</Badge>}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </>
  );
}

function ClientView() {
  const projects = useProjectsStore((state) => state.projects);
  const milestones = useProjectsStore((state) => state.milestones);
  const tasks = useProjectsStore((state) => state.tasks);
  const clients = Array.from(new Set(projects.map((p) => p.client)));
  if (clients.length === 0) return <Card><CardContent className="p-6 text-sm text-muted-foreground">No client projects yet.</CardContent></Card>;
  return (
    <>
      {clients.map((client) => (
        <Card key={client}>
          <CardHeader><CardTitle className="text-base">{client}</CardTitle></CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {projects.filter((p) => p.client === client).map((p) => (
              <div key={p.id}>
                <p className="font-medium">{p.name} <Badge variant={healthTone(projectHealth(p, milestones, tasks)) as "neutral"}>{projectHealth(p, milestones, tasks)}</Badge></p>
                <p className="text-xs text-muted-foreground">Milestones delivered: {milestones.filter((m) => m.projectId === p.id && m.status === "accepted").length} of {milestones.filter((m) => m.projectId === p.id).length} accepted · open tasks: {tasks.filter((t) => t.projectId === p.id && t.status !== "done").length}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </>
  );
}
