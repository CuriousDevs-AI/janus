"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, CalendarRange, HeartPulse, Loader2, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionCard } from "@/components/settings/section-ui";
import { SchedulesPanel, type ReportSchedule } from "@/components/business/report-keeping";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";

type Member = { user_id: string; name: string; email: string; status: string };
type Frequency = ReportSchedule["frequency"];

/** The agents Janus runs: each reads the business on a schedule and emails what it finds. */
const agents: { report: string; name: string; text: string; reads: string; icon: React.ComponentType<{ className?: string }>; frequencies: [Frequency, string][] }[] = [
  {
    report: "health-brief", name: "Business Health Monitor", icon: HeartPulse,
    text: "Every morning or every Monday, emails what needs the owner most urgently, then sales, money owed, cash in the bank, filings due and decisions waiting.",
    reads: "Reads CRM, Finance, HR and filings.",
    frequencies: [["daily", "Every morning at 9"], ["weekly", "Every Monday at 9"]],
  },
  {
    report: "monthly-review", name: "Monthly Business Review", icon: CalendarRange,
    text: "On the 1st, emails the month just ended against the one before: leads, deals won, sales, collections, supplier bills, profit, the biggest customer and headcount.",
    reads: "Reads CRM, Finance and HR.",
    frequencies: [["monthly", "On the 1st at 9"]],
  },
];
const agentReports = new Set(agents.map((item) => item.report));

/**
 * AI Agents for a real business: agents that run on their own, read the company's records and email
 * each person what their role may see. Agents that react to something happening live in Workflows.
 */
export function LiveAgents() {
  const schedules = useApi<ReportSchedule[]>("/business/reports/schedules");
  const mine = (schedules.data ?? []).filter((item) => agentReports.has(item.report));
  const [setting, setSetting] = React.useState<(typeof agents)[number] | null>(null);

  return <div className="mx-auto flex max-w-[1240px] flex-col gap-5 px-4 py-6 sm:px-6 sm:py-7">
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">AI Agents</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Agents that watch the business for you</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Each agent reads your records on a schedule and emails what it finds. Every person gets only the figures their own role can see, read the morning it goes out.</p>
    </div>

    <div className="grid gap-3 md:grid-cols-2">{agents.map((agent) => {
      const running = mine.filter((item) => item.report === agent.report);
      return <article key={agent.report} className="flex flex-col rounded-lg border border-border bg-surface p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent-muted text-accent"><agent.icon className="size-4" /></span>
          <div className="min-w-0"><h2 className="text-sm font-semibold">{agent.name}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{agent.text}</p><p className="mt-1 text-[11px] text-muted-foreground">{agent.reads}</p></div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{running.length ? `${running.filter((item) => !item.paused).length} running` : "Not set up"}</span>
          <Button size="sm" onClick={() => setSetting(agent)}>{running.length ? "Add another" : "Set up"}</Button>
        </div>
      </article>;
    })}</div>

    <SchedulesPanel schedules={mine} loading={schedules.loading} error={schedules.error} demo={false} onNew={() => setSetting(agents[0])} onChanged={() => schedules.reload()} words={{ title: "Your agents", description: "Each runs at 9 in the morning, India time. Send one now to see exactly what it emails.", emptyTitle: "No agent is running yet", emptyText: "Set up the Business Health Monitor above to start your mornings with what needs you.", action: "Set up an agent", hidePeriod: true }} />

    <SectionCard title="Agents that act when something happens" description="Telling approvers about a spend request, flagging a credit note or write-off, alerting the team to a new lead or ticket: these run the moment it happens, as Workflows.">
      <Button size="sm" variant="outline" asChild><Link href="/automations?workspace=business"><Workflow className="size-3.5" />Open Workflows<ArrowRight className="size-3.5" /></Link></Button>
    </SectionCard>

    {setting && <SetupDialog agent={setting} onClose={() => setSetting(null)} onDone={() => { setSetting(null); schedules.reload(); }} />}
  </div>;
}

function SetupDialog({ agent, onClose, onDone }: { agent: (typeof agents)[number]; onClose: () => void; onDone: () => void }) {
  const members = useApi<Member[]>("/members");
  const active = (members.data ?? []).filter((item) => item.status === "active");
  const [frequency, setFrequency] = React.useState<Frequency>(agent.frequencies[0][0]);
  const [chosen, setChosen] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);
  async function save() {
    setSaving(true);
    try {
      await api("/business/reports/schedules", { method: "POST", body: JSON.stringify({ report: agent.report, period: "month", frequency, recipients: chosen.map(Number) }) });
      toast.success(`${agent.name} is on. ${agent.frequencies.find(([value]) => value === frequency)?.[1]}, it emails ${chosen.length} ${chosen.length === 1 ? "person" : "people"}.`);
      onDone();
    } catch (error) { toast.error(message(error)); setSaving(false); }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}><DialogContent className="max-w-md">
    <DialogHeader><DialogTitle>{agent.name}</DialogTitle><DialogDescription>{agent.text}</DialogDescription></DialogHeader>
    <div className="grid gap-3">
      {agent.frequencies.length > 1 && <div><Label htmlFor="agent-frequency">When</Label><select id="agent-frequency" value={frequency} onChange={(event) => setFrequency(event.target.value as Frequency)} className="mt-1 h-9 w-full rounded-md border border-input bg-surface-2 px-2 text-sm">{agent.frequencies.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>}
      <fieldset><legend className="text-sm font-medium">Email it to</legend>
        {members.loading ? <p className="mt-1 text-xs text-muted-foreground">Loading your team…</p> : members.error ? <p className="mt-1 text-xs text-danger">{members.error}</p>
          : <div className="mt-1 grid max-h-48 gap-1 overflow-y-auto rounded-md border border-border p-2">{active.map((item) => <label key={item.user_id} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-surface-2"><input type="checkbox" checked={chosen.includes(item.user_id)} onChange={() => setChosen((current) => current.includes(item.user_id) ? current.filter((id) => id !== item.user_id) : [...current, item.user_id])} /><span className="min-w-0 truncate">{item.name} <span className="text-muted-foreground">· {item.email}</span></span></label>)}</div>}
        <p className="mt-1 text-[11px] text-muted-foreground">Someone whose role cannot see the figures is skipped, and the agent says so.</p>
      </fieldset>
    </div>
    <DialogFooter><Button variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button><Button disabled={chosen.length === 0 || saving} onClick={() => void save()}>{saving && <Loader2 className="size-3.5 animate-spin" />}Switch it on</Button></DialogFooter>
  </DialogContent></Dialog>;
}
