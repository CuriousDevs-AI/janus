"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/components/auth/session-provider";
import { TrailPanel } from "@/components/shared/audit-trail-panel";
import { useFinanceStore, dueAmount } from "@/lib/stores/finance-store";
import { PROJECT_TYPES, TODAY, addDays, projectHealth, useProjectsStore, type Project } from "@/lib/stores/projects-store";
import { useCrmLinkOptions } from "@/lib/record-links";

const money = (value: number) => `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const selectClass = "h-9 w-full rounded-md border border-input bg-surface px-3 text-sm";

const comingSoon: Record<string, string> = {
  resources: "Resource allocation across projects, with over-allocation warnings, comes in phase 2.",
  timesheets: "Timesheets and billing from approved hours come in phase 2.",
  calendar: "The project calendar comes in phase 2, with meetings.",
  reports: "Project reports and profitability come after timesheets and costs are in use.",
};

export function ProjectsWorkspace() {
  const searchParams = useSearchParams();
  const view = searchParams.get("view") ?? "overview";
  const session = useSession();
  const me = session.user.name ?? session.user.email ?? "You";
  const titles: Record<string, string> = { overview: "Delivery overview", projects: "Projects", milestones: "Milestones & billing", tasks: "Tasks", changes: "Change requests", "client-delivery": "Client delivery" };

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
        {view === "client-delivery" && <ClientView />}
        {!["projects", "milestones", "tasks", "changes", "client-delivery"].includes(view) && <OverviewView />}
        {!["projects", "milestones", "tasks", "changes", "client-delivery"].includes(view) && <ProjectsTrail />}
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
  const lines = useFinanceStore((state) => state.budgetLines);
  const [form, setForm] = React.useState({ name: "", client: "", customerId: "", type: PROJECT_TYPES[0] as string, owner: me, start: TODAY, end: addDays(TODAY, 60), budget: "", budgetLineId: "" });
  const links = useCrmLinkOptions();
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  function save() {
    const problem = addProject({ name: form.name, client: form.client.trim() || "Internal", customerId: form.customerId || undefined, type: form.type as Project["type"], owner: form.owner.trim() || me, start: form.start, end: form.end, budget: Number(form.budget), budgetLineId: form.budgetLineId }, me);
    if (problem) return toast.error(problem);
    toast.success("Project created; its budget is drawn from the fund line");
    setForm({ ...form, name: "", client: "", customerId: "", budget: "" });
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
            <div className="flex flex-col gap-1.5"><Label htmlFor="pj-owner">Owner</Label><Input id="pj-owner" value={form.owner} onChange={(e) => set({ owner: e.target.value })} /></div>
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
            <thead><tr className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="px-4 py-2">Project</th><th className="px-4 py-2">Type</th><th className="px-4 py-2">Owner</th><th className="px-4 py-2">End</th><th className="px-4 py-2 text-right">Budget</th><th className="px-4 py-2">Health</th></tr></thead>
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
  const [projectId, setProjectId] = React.useState("");
  const [name, setName] = React.useState("");
  const [due, setDue] = React.useState(TODAY);
  const [amount, setAmount] = React.useState("");

  return (
    <>
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
                    <td className="px-4 py-3"><Badge variant={m.status === "accepted" ? "success" : m.status === "done" ? "warning" : "neutral"}>{m.status}</Badge>{m.acceptedBy ? <span className="block text-xs text-muted-foreground">accepted by {m.acceptedBy}</span> : null}</td>
                    <td className="px-4 py-3 text-right"><div className="flex justify-end gap-1">
                      {m.status === "planned" ? <Button size="sm" variant="secondary" onClick={() => { const p = complete(m.id, me); if (p) toast.error(p); else toast.success("Marked complete"); }}>Mark complete</Button> : null}
                      {m.status === "done" ? <Button size="sm" variant="secondary" onClick={() => { const p = accept(m.id, me); if (p) toast.error(p); else toast.success(m.amount > 0 ? "Accepted; invoice created in Finance" : "Accepted"); }}>Accept</Button> : null}
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
  const [projectId, setProjectId] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [budgetChange, setBudgetChange] = React.useState("0");
  const [dayChange, setDayChange] = React.useState("0");

  return (
    <>
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
