"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { message } from "@/lib/api/client";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useSession } from "@/components/auth/session-provider";
import { users } from "@/lib/mock-data";
import { completeITChange, decideITChange, requestITChange, syncITChanges } from "@/lib/it-records";
import { ACCESS_LEVELS, ASSET_KINDS, HELPDESK_CATEGORIES, HELPDESK_PRIORITIES, TODAY, renewalSoon, useITStore, type ITChange, type Incident } from "@/lib/stores/it-store";

const selectClass = "h-8 rounded-md border border-input bg-surface px-2 text-xs";
const formatINR = (value: number) => `₹${value.toLocaleString("en-IN")}`;
const names = users.map((u) => u.name);
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
  const titles: Record<string, string> = { overview: "IT overview", assets: "IT assets", access: "Access management", licenses: "Software & licences", helpdesk: "IT helpdesk", incidents: "Incidents", changes: "Change management", reports: "IT reports", monitoring: "Infrastructure monitoring" };

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
      <PageHeader title={titles[view] ?? "IT overview"} description="Assets, the access each person holds, and software licences. Every change is written to the log." />
      <div className="flex flex-col gap-4 px-6 pb-10">
        {view === "assets" ? <AssetsView /> : view === "access" ? <AccessView /> : view === "licenses" ? <LicensesView /> : view === "helpdesk" ? <HelpdeskView /> : view === "incidents" ? <IncidentsView /> : view === "changes" ? <ChangesView /> : view === "reports" ? <ITReportsView /> : view === "monitoring" ? <MonitoringView /> : <OverviewView />}
      </div>
    </div>
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

function OverviewView() {
  const assets = useITStore((state) => state.assets);
  const access = useITStore((state) => state.access);
  const licences = useITStore((state) => state.licences);
  const log = useITStore((state) => state.log);
  const soon = licences.filter(renewalSoon);
  const inStock = assets.filter((a) => a.status === "in stock");

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi label="Assets assigned" value={String(assets.filter((a) => a.status === "assigned").length)} />
        <Kpi label="Assets in stock" value={String(inStock.length)} />
        <Kpi label="Active access grants" value={String(access.filter((g) => g.status === "active").length)} />
        <Kpi label="Licences renewing in 30 days" value={String(soon.length)} tone={soon.length > 0 ? "warning" : undefined} />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Needs attention</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {soon.map((l) => <p key={l.id}>{l.name} renews on {l.renewal} · {formatINR(l.annualCost)} a year</p>)}
          {inStock.length > 0 ? <p>{inStock.length} asset{inStock.length === 1 ? " is" : "s are"} in stock and ready to assign.</p> : null}
          {soon.length === 0 && inStock.length === 0 ? <p className="text-muted-foreground">Nothing is due or waiting.</p> : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Change log</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {log.length === 0 ? <p className="text-muted-foreground">No changes yet. Assignments, returns and access changes appear here.</p> : null}
          {log.slice(0, 12).map((entry) => <p key={entry.id}><span className="text-muted-foreground">{entry.at} · {entry.by} · </span>{entry.text}</p>)}
        </CardContent>
      </Card>
    </>
  );
}

/** IT requests from people in the company: raised, assigned, started and resolved. */
function HelpdeskView() {
  const session = useSession();
  const me = session.user.name ?? session.user.email ?? "You";
  const tickets = useITStore((state) => state.helpdesk);
  const raiseTicket = useITStore((state) => state.raiseTicket);
  const setTicketStatus = useITStore((state) => state.setTicketStatus);
  const assignTicket = useITStore((state) => state.assignTicket);
  const resolveTicket = useITStore((state) => state.resolveTicket);
  const [system, setSystem] = React.useState("");
  const [level, setLevel] = React.useState<(typeof ACCESS_LEVELS)[number]>("view");
  const [requester, setRequester] = React.useState("");
  const [category, setCategory] = React.useState<(typeof HELPDESK_CATEGORIES)[number]>("Laptop or phone");
  const [priority, setPriority] = React.useState<(typeof HELPDESK_PRIORITIES)[number]>("medium");
  const [subject, setSubject] = React.useState("");

  function raise() {
    const problem = raiseTicket({ requester, category, priority, subject, system: category === "Access" ? system : undefined, level: category === "Access" ? level : undefined }, me);
    if (problem) return toast.error(problem);
    toast.success("Request raised");
    setSubject(""); setSystem("");
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Raise a request</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-xs text-muted-foreground">Requests from people in the company. Each one is worked by an IT assignee until it is resolved.</p>
          <div className="grid gap-3 sm:grid-cols-5">
            <select aria-label="Requester" className={selectClass} value={requester} onChange={(e) => setRequester(e.target.value)}><option value="">Requester…</option>{users.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}</select>
            <select aria-label="Category" className={selectClass} value={category} onChange={(e) => setCategory(e.target.value as (typeof HELPDESK_CATEGORIES)[number])}>{HELPDESK_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <select aria-label="Priority" className={selectClass} value={priority} onChange={(e) => setPriority(e.target.value as (typeof HELPDESK_PRIORITIES)[number])}>{HELPDESK_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}</select>
            <Input aria-label="Problem" placeholder="What is the problem?" value={subject} onChange={(e) => setSubject(e.target.value)} />
            {category === "Access" ? (
              <>
                <Input aria-label="System" placeholder="System, e.g. Tally Prime" value={system} onChange={(e) => setSystem(e.target.value)} />
                <select aria-label="Access level" className={selectClass} value={level} onChange={(e) => setLevel(e.target.value as (typeof ACCESS_LEVELS)[number])}>{ACCESS_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}</select>
              </>
            ) : null}
            <Button disabled={!requester || subject.trim().length < 5} onClick={raise}>Raise request</Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="grid gap-3 p-4 text-sm">
          {tickets.length === 0 ? <p className="text-muted-foreground">No requests yet.</p> : null}
          {tickets.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 last:border-0">
              <span>
                <span className="font-medium">{t.number}</span> · {t.subject}
                <span className="block text-xs text-muted-foreground">{t.requester} · {t.category}{t.system ? ` (${t.system}, ${t.level})` : ""} · {t.priority} priority · raised {t.raisedOn} · due {t.dueOn ?? "—"}{t.status !== "resolved" && t.dueOn && t.dueOn < TODAY ? " · overdue" : ""}{t.assignee ? ` · with ${t.assignee}` : " · not assigned"}</span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <Badge variant={t.status === "resolved" ? "success" : t.status === "in progress" ? "warning" : "neutral"}>{t.status}</Badge>
                {t.status !== "resolved" ? (
                  <>
                    <select aria-label={`Assign ${t.number}`} className={selectClass} value={t.assignee ?? ""} onChange={(e) => { if (e.target.value) assignTicket(t.id, e.target.value, me); }}>
                      <option value="">Assign to…</option>
                      {users.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
                    </select>
                    {t.status === "open" ? <Button size="sm" variant="secondary" onClick={() => { const p = setTicketStatus(t.id, "in progress", me); if (p) toast.error(p); }}>Start</Button> : null}
                    <Button size="sm" variant="outline" onClick={() => { const p = resolveTicket(t.id, me); if (p) toast.error(p); else toast.success(`${t.number} resolved`); }}>Resolve</Button>
                  </>
                ) : null}
              </span>
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

  async function request() {
    const problem = await requestITChange({ title, risk }, me);
    if (problem) return toast.error(problem);
    toast.success("Change requested");
    setTitle("");
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
            <Button disabled={title.trim().length < 5} onClick={request}>Request change</Button>
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
                {c.status === "pending" ? (
                  <>
                    <Button size="sm" variant="secondary" onClick={async () => { const p = await decideITChange(c.id, true, me); if (p) toast.error(p); }}>Approve</Button>
                    <Button size="sm" variant="ghost" onClick={async () => { const p = await decideITChange(c.id, false, me); if (p) toast.error(p); }}>Reject</Button>
                  </>
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
  const rows: [string, string][] = [
    ["Assets in stock", String(assets.filter((a) => a.status === "in stock").length)],
    ["Assets with someone", String(assets.filter((a) => a.assignedTo).length)],
    ["Requests open or in progress", String(helpdesk.filter((h) => h.status !== "resolved").length)],
    ["Requests overdue", String(helpdesk.filter((h) => h.status !== "resolved" && h.dueOn < TODAY).length)],
    ["Incidents open", String(incidents.filter((i) => i.status !== "resolved").length)],
    ["Critical incidents open", String(incidents.filter((i) => i.status !== "resolved" && i.severity === "critical").length)],
    ["Changes waiting approval", String(changes.filter((c) => c.status === "pending").length)],
    ["Licences renewing in 30 days", String(licences.filter(renewalSoon).length)],
  ];
  return (
    <Card>
      <CardContent className="grid gap-2 p-4 text-sm">
        {rows.map(([label, value]) => <div key={label} className="flex justify-between border-b border-border pb-2 last:border-0"><span>{label}</span><span className="font-medium tabular-nums">{value}</span></div>)}
      </CardContent>
    </Card>
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

function AssetsView() {
  const session = useSession();
  const me = session.user.name ?? session.user.email ?? "You";
  const assets = useITStore((state) => state.assets);
  const addAsset = useITStore((state) => state.addAsset);
  const assignAsset = useITStore((state) => state.assignAsset);
  const returnAsset = useITStore((state) => state.returnAsset);
  const retireAsset = useITStore((state) => state.retireAsset);
  const offboard = useITStore((state) => state.offboard);
  const [draft, setDraft] = React.useState<{ name: string; kind: (typeof ASSET_KINDS)[number]; serial: string; purchaseDate: string; cost: string }>({ name: "", kind: "Laptop", serial: "", purchaseDate: TODAY, cost: "0" });
  const [picks, setPicks] = React.useState<Record<string, string>>({});
  const [leaver, setLeaver] = React.useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const problem = addAsset({ name: draft.name, kind: draft.kind, serial: draft.serial, purchaseDate: draft.purchaseDate, cost: Number(draft.cost) || 0 }, me);
    if (run(problem, "Asset added")) setDraft({ name: "", kind: "Laptop", serial: "", purchaseDate: TODAY, cost: "0" });
  };

  return (
    <>
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
            <Button type="submit">Add asset</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Register</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {assets.length === 0 ? <p className="text-muted-foreground">No assets yet.</p> : null}
          {assets.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0">
              <span>
                <span className="font-medium">{a.name}</span> · {a.kind} · {a.serial}
                <span className="block text-xs text-muted-foreground">{a.assignedTo ? `With ${a.assignedTo}` : a.status === "retired" ? "Retired" : "In stock"} · bought {a.purchaseDate} · {formatINR(a.cost)}</span>
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
