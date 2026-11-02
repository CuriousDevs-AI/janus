"use client";

import * as React from "react";
import { Check, Download, Printer, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/settings/section-ui";
import { useSession } from "@/components/auth/session-provider";
import { api, message } from "@/lib/api/client";
import { switchTenant } from "@/lib/live-company";
import type { PortfolioCompany, PortfolioComplianceDue, PortfolioCompliancePlan, PortfolioPeriod } from "@/lib/api/types";

/**
 * The live Portfolio's operating views: what needs attention, health, approvals, the compliance
 * calendar, targets, questions across companies and the board pack. Everything here is read from
 * /portfolio/summary, which reads each company under its own access rules.
 */

/** Rupees the way an Indian owner reads them: ₹12,500 below a lakh, then ₹4.2L and ₹1.3Cr. */
export function inr(value: number) {
  // Rounded half up on whole tenths, like the weekly email: ₹1.65L reads ₹1.7L, not toFixed's ₹1.6L.
  const tenths = (unit: number) => String(Math.round(value / (unit / 10)) / 10);
  if (Math.abs(value) >= 1e7) return `₹${tenths(1e7)}Cr`;
  if (Math.abs(value) >= 1e5) return `₹${tenths(1e5)}L`;
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}
const severityTone = { high: "danger", medium: "warning", low: "neutral" } as const;
const severityName = { high: "High", medium: "Medium", low: "Low" } as const;
export const healthTone = { red: "danger", amber: "warning", green: "success" } as const;
export const healthName = { red: "Needs you", amber: "Watch", green: "On track" } as const;

/** The person's role in a company decides what they may do there from the Portfolio. */
export function useRoles() {
  const session = useSession();
  const role = (item: PortfolioCompany) => session.tenants.find((tenant) => tenant.id === item.id)?.role;
  return { owns: (item: PortfolioCompany) => role(item) === "owner", handlesMoney: (item: PortfolioCompany) => role(item) === "owner" || role(item) === "group_finance" };
}
/** Opens a screen inside a company, moving the session there first when it is another one. */
export const openIn = (item: PortfolioCompany, to: string) => item.current ? window.location.assign(to) : switchTenant(item.id, to).catch((error) => toast.error(message(error)));

/** Every company's attention lines together, most urgent first. */
export function attentionOf(list: PortfolioCompany[]) {
  const order = { high: 0, medium: 1, low: 2 };
  return list.flatMap((company) => company.attention.map((entry, index) => ({ ...entry, company, key: `${company.id}:${index}:${entry.text}` }))).sort((a, b) => order[a.severity] - order[b.severity]);
}

export function AttentionList({ list, limit, onOpen, read = [] }: { list: PortfolioCompany[]; limit?: number; onOpen?: (key: string) => void; read?: string[] }) {
  const { owns } = useRoles();
  const items = attentionOf(list);
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Nothing needs you in any company.</p>;
  return <ul className="flex flex-col divide-y divide-border">{items.slice(0, limit ?? items.length).map((item) => <li key={item.key} className={`flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0 ${read.includes(item.key) ? "opacity-60" : ""}`}>
    <Badge variant={severityTone[item.severity]}>{severityName[item.severity]}</Badge>
    <span className="min-w-0 flex-1 text-sm"><span className="font-medium">{item.company.name}</span> · {item.text}</span>
    {(owns(item.company) || item.to.startsWith("/portfolio")) && <Button size="sm" variant="secondary" onClick={() => { onOpen?.(item.key); if (item.to.startsWith("/portfolio")) window.location.assign(item.to); else openIn(item.company, item.to); }}>Open</Button>}
  </li>)}</ul>;
}

const readKey = "janus.portfolio-live-read";
/** Notifications are the attention lines; which ones were read is remembered in this browser only. */
export function LiveNotifications({ list }: { list: PortfolioCompany[] }) {
  const [filter, setFilter] = React.useState("all");
  const [read, setRead] = React.useState<string[]>(() => { try { return JSON.parse(window.localStorage.getItem(readKey) ?? "[]"); } catch { return []; } });
  const shown = list.filter((item) => filter === "all" || item.id === filter);
  const items = attentionOf(shown);
  const mark = (keys: string[]) => { const next = [...new Set([...read, ...keys])]; setRead(next); try { window.localStorage.setItem(readKey, JSON.stringify(next)); } catch { /* private mode */ } };
  const unread = items.filter((item) => !read.includes(item.key));
  return <SectionCard title={`${unread.length} unread`} description="From every company, most urgent first. Each opens where it is dealt with." action={<Button size="sm" variant="secondary" disabled={unread.length === 0} onClick={() => mark(items.map((item) => item.key))}><Check className="mr-1 size-4" />Mark all read</Button>}>
    <div role="group" aria-label="Filter by company" className="mb-4 flex flex-wrap gap-2"><Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>All companies</Button>{list.map((item) => <Button key={item.id} size="sm" variant={filter === item.id ? "default" : "outline"} onClick={() => setFilter(item.id)}>{item.name}</Button>)}</div>
    <AttentionList list={shown} read={read} onOpen={(key) => mark([key])} />
    {items.length > 0 && <p className="mt-3 text-xs text-muted-foreground">{items.length - unread.length} of {items.length} marked read in this browser.</p>}
  </SectionCard>;
}

export function ApprovalsCard({ list }: { list: PortfolioCompany[] }) {
  const { owns } = useRoles();
  const waiting = list.filter((item) => item.approvals.length > 0);
  const total = waiting.reduce((sum, item) => sum + item.approvals.reduce((count, entry) => count + entry.count, 0), 0);
  return <SectionCard title={`Waiting for a decision${total ? ` (${total})` : ""}`} description="Approvals in each company. Open one to decide it there.">
    {waiting.length === 0 ? <p className="text-sm text-muted-foreground">No approvals are waiting in any company.</p> : <ul className="flex flex-col gap-3">{waiting.map((item) => <li key={item.id}><p className="text-sm font-medium">{item.name}</p><ul className="mt-1 flex flex-wrap gap-2">{item.approvals.map((entry) => <li key={entry.kind}>{owns(item) ? <Button size="sm" variant="outline" onClick={() => openIn(item, entry.to)}>{entry.count} {(entry.count === 1 ? entry.one : entry.label).toLowerCase()}</Button> : <Badge variant="neutral">{entry.count} {(entry.count === 1 ? entry.one : entry.label).toLowerCase()}</Badge>}</li>)}</ul></li>)}</ul>}
  </SectionCard>;
}

const months = { week: 7 / 30.4, month: 1, quarter: 3, fy: 12 } as const;
/** Progress against the monthly targets, scaled to the period, with where the pace says it should be today. */
export function TargetsCard({ list, period }: { list: PortfolioCompany[]; period: PortfolioPeriod }) {
  const withTargets = list.filter((item) => item.targets && (item.targets.leads || item.targets.wonValue || item.targets.collected));
  if (withTargets.length === 0) return null;
  const start = new Date(`${period.start}T00:00:00+05:30`);
  const end = new Date(start);
  end.setMonth(end.getMonth() + (period.key === "fy" ? 12 : period.key === "quarter" ? 3 : 1));
  const elapsed = Math.min(1, (new Date(`${period.end}T23:59:59+05:30`).getTime() - start.getTime()) / (end.getTime() - start.getTime()));
  const row = (label: string, actual: number, monthly: string | null, format: (value: number) => string) => {
    if (!monthly) return null;
    const target = Number(monthly) * months[period.key];
    const pace = target * elapsed;
    const share = target ? Math.min(100, (actual / target) * 100) : 0;
    // A gap that rounds to nothing in the figure's own format counts as on pace.
    const onPace = actual >= pace || format(pace - actual) === format(0);
    return <div key={label}><div className="mb-1 flex flex-wrap justify-between gap-2 text-xs"><span className="font-medium">{label}</span><span className="tabular-nums text-muted-foreground">{format(actual)} of {format(target)} · {onPace ? "on pace" : `${format(pace - actual)} behind pace`}</span></div><div className="h-2 bg-surface-2"><div className={`h-2 ${onPace ? "bg-success" : "bg-warning"}`} style={{ width: `${Math.max(2, share)}%` }} /></div></div>;
  };
  return <SectionCard title="Targets" description={`Monthly targets scaled to ${period.label}, against where the pace says each should be today.`}>
    <div className="grid gap-5 md:grid-cols-2">{withTargets.map((item) => <div key={item.id} className="flex flex-col gap-3"><p className="text-sm font-medium">{item.name}</p>
      {row("Leads in", item.period.current.leads, item.targets!.leads, (value) => String(Math.round(value)))}
      {row("Value won", Number(item.period.current.wonValue), item.targets!.wonValue, inr)}
      {row("Collected", Number(item.period.current.collected ?? 0), item.targets!.collected, inr)}
    </div>)}</div>
  </SectionCard>;
}

/** The Owner sets each company's monthly targets; clearing a box removes that target. */
export function TargetsForm({ item, onSaved }: { item: PortfolioCompany; onSaved: () => void }) {
  const [form, setForm] = React.useState({ leads: item.targets?.leads ?? "", wonValue: item.targets?.wonValue ?? "", collected: item.targets?.collected ?? "" });
  const [saving, setSaving] = React.useState(false);
  const bad = Object.values(form).some((value) => value !== "" && !(Number(value) >= 0));
  async function save() {
    setSaving(true);
    try {
      const body = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value === "" ? null : value]));
      await api(`/portfolio/companies/${item.id}/targets`, { method: "PUT", body: JSON.stringify(body) });
      toast.success(`Targets saved for ${item.name}.`);
      onSaved();
    } catch (failure) { toast.error(message(failure)); }
    setSaving(false);
  }
  return <form className="grid gap-2 sm:grid-cols-4 sm:items-end" onSubmit={(event) => { event.preventDefault(); void save(); }}>
    {([["leads", "Leads a month"], ["wonValue", "Value won a month (₹)"], ["collected", "Collected a month (₹)"]] as const).map(([key, label]) => <label key={key} className="grid gap-1 text-xs text-muted-foreground">{label}<Input inputMode="decimal" value={form[key]} placeholder="No target" onChange={(event) => setForm({ ...form, [key]: event.target.value.replace(/[^0-9.]/g, "") })} /></label>)}
    <Button type="submit" size="sm" disabled={saving || bad}>{saving ? "Saving…" : "Save targets"}</Button>
  </form>;
}

const dueTone = { overdue: "danger", due_soon: "warning", upcoming: "neutral", filed: "success" } as const;
const dueName = { overdue: "Overdue", due_soon: "Due this week", upcoming: "Upcoming", filed: "Filed" } as const;
const day = (iso: string) => new Date(`${iso}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const todayIst = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

/** The statutory calendar for each company: what applies, what is due, and marking it filed. */
export function ComplianceView({ list, onChanged }: { list: PortfolioCompany[]; onChanged: () => void }) {
  const { handlesMoney } = useRoles();
  const all = list.flatMap((item) => item.compliance.filter((due) => due.status !== "filed").map((due) => ({ ...due, company: item })));
  const overdue = all.filter((due) => due.status === "overdue").length;
  const soon = all.filter((due) => due.status === "due_soon").length;
  return <>
    <SectionCard title={`${overdue} overdue · ${soon} due this week`} description="Standard due dates for GST, TDS, PF and ESI, advance tax and company filings, from 90 days back to 30 ahead. Government extensions and your AGM date can move them: confirm with your CA.">
      <p className="text-sm text-muted-foreground">Set what applies to each company below. A filing stays overdue until it is marked filed.</p>
    </SectionCard>
    {list.map((item) => <SectionCard key={item.id} title={item.name} description={item.compliancePlan?.gstin ? `GSTIN ${item.compliancePlan.gstin}` : "No GSTIN recorded"}>
      {handlesMoney(item) && <PlanForm item={item} onSaved={onChanged} />}
      {item.compliance.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No filings set up for this company yet.</p> : <ul className="mt-3 flex flex-col divide-y divide-border">{item.compliance.map((due) => <DueRow key={due.key} item={item} due={due} canMark={handlesMoney(item)} onChanged={onChanged} />)}</ul>}
    </SectionCard>)}
  </>;
}

function DueRow({ item, due, canMark, onChanged }: { item: PortfolioCompany; due: PortfolioComplianceDue; canMark: boolean; onChanged: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const change = async (filed: boolean) => {
    setBusy(true);
    try {
      await api(`/portfolio/companies/${item.id}/filings/${encodeURIComponent(due.key)}`, filed ? { method: "PUT", body: JSON.stringify({ filedOn: todayIst() }) } : { method: "DELETE" });
      toast.success(filed ? `${due.label} for ${due.period} marked filed.` : `${due.label} for ${due.period} is open again.`);
      onChanged();
    } catch (failure) { toast.error(message(failure)); }
    setBusy(false);
  };
  return <li className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0">
    <Badge variant={dueTone[due.status]}>{dueName[due.status]}</Badge>
    <span className="min-w-0 flex-1 text-sm"><span className="font-medium">{due.label}</span> · {due.period} <span className="text-muted-foreground">· {due.area} · due {day(due.dueOn)}{due.filedOn ? ` · filed ${day(due.filedOn)}` : ""}</span></span>
    {canMark && (due.status === "filed" ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => void change(false)}>Undo</Button> : <Button size="sm" variant="outline" disabled={busy} onClick={() => void change(true)}>Mark filed today</Button>)}
  </li>;
}

function PlanForm({ item, onSaved }: { item: PortfolioCompany; onSaved: () => void }) {
  const [plan, setPlan] = React.useState<PortfolioCompliancePlan>(item.compliancePlan ?? { gstin: null, gstFiling: "none", tds: false, pfEsi: false, company: false });
  const [saving, setSaving] = React.useState(false);
  const gstin = (plan.gstin ?? "").trim().toUpperCase();
  const bad = gstin !== "" && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(gstin);
  async function save() {
    setSaving(true);
    try {
      await api(`/portfolio/companies/${item.id}/compliance`, { method: "PUT", body: JSON.stringify({ ...plan, gstin: gstin || null }) });
      toast.success(`Filings updated for ${item.name}.`);
      onSaved();
    } catch (failure) { toast.error(message(failure)); }
    setSaving(false);
  }
  const box = (key: "tds" | "pfEsi" | "company", label: string) => <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={plan[key]} onChange={() => setPlan({ ...plan, [key]: !plan[key] })} />{label}</label>;
  return <form className="flex flex-col gap-3 border border-border bg-surface-2 p-3" onSubmit={(event) => { event.preventDefault(); void save(); }}>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-xs text-muted-foreground">GSTIN<Input value={plan.gstin ?? ""} maxLength={15} placeholder="27AAPFU0939F1ZV" onChange={(event) => setPlan({ ...plan, gstin: event.target.value })} aria-invalid={bad} /></label>
      <label className="grid gap-1 text-xs text-muted-foreground">GST returns<select className="h-9 border border-border bg-surface px-3 text-sm text-foreground" value={plan.gstFiling} onChange={(event) => setPlan({ ...plan, gstFiling: event.target.value as PortfolioCompliancePlan["gstFiling"] })}><option value="none">Not registered</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly (QRMP)</option></select></label>
    </div>
    <div className="flex flex-wrap gap-4">{box("tds", "Deducts TDS")}{box("pfEsi", "Pays PF and ESI")}{box("company", "Private or public limited company (ROC and tax filings)")}</div>
    {bad && <p role="alert" className="text-xs text-danger">That GSTIN does not have the right format.</p>}
    <Button type="submit" size="sm" className="self-start" disabled={saving || bad}>{saving ? "Saving…" : "Save what applies"}</Button>
  </form>;
}

/** Answers from the figures on the page only, naming the company and the number, and says when it cannot. */
export function answerLive(question: string, list: PortfolioCompany[]): { text: string; rows?: [string, string][] } {
  const q = question.toLowerCase();
  const named = list.find((item) => q.includes(item.name.toLowerCase()) || q.includes(item.name.split(" ")[0].toLowerCase()));
  const scope = named ? [named] : list;
  const top = <T,>(pick: (item: PortfolioCompany) => T | null | undefined, value: (item: PortfolioCompany) => number) => [...scope].filter((item) => pick(item) !== null && pick(item) !== undefined).sort((a, b) => value(b) - value(a))[0];
  if (/attention|urgent|need|worry|problem|health|red/.test(q)) {
    const items = attentionOf(scope);
    return { text: items.length ? `${items.length} thing${items.length === 1 ? "" : "s"} need you${named ? ` at ${named.name}` : ""}, most urgent first.` : "Nothing needs you right now.", rows: items.slice(0, 8).map((item) => [item.company.name, item.text]) };
  }
  if (/approv|waiting|pending|decide/.test(q)) {
    const rows = scope.flatMap((item) => item.approvals.map((entry): [string, string] => [item.name, `${entry.count} ${(entry.count === 1 ? entry.one : entry.label).toLowerCase()}`]));
    return { text: rows.length ? "These are waiting for a decision." : "No approvals are waiting.", rows };
  }
  if (/payroll|salary|salaries/.test(q)) {
    const best = top((item) => item.people?.monthlyPayroll, (item) => Number(item.people?.monthlyPayroll ?? 0));
    if (!best) return { text: "Payroll is not shared with your role." };
    return { text: named ? `${named.name} pays ${inr(Number(named.people?.monthlyPayroll ?? 0))} a month.` : `${best.name} has the heaviest payroll, ${inr(Number(best.people!.monthlyPayroll))} a month.`, rows: scope.filter((item) => item.people?.monthlyPayroll).map((item) => [item.name, `${inr(Number(item.people!.monthlyPayroll))} a month · ${item.people!.headcount} people`]) };
  }
  if (/people|headcount|staff|employee/.test(q)) return { text: `${scope.reduce((sum, item) => sum + (item.people?.headcount ?? 0), 0)} people${named ? ` at ${named.name}` : " across the companies"}.`, rows: scope.map((item) => [item.name, `${item.people?.headcount ?? 0} people · ${item.people?.onLeaveToday ?? 0} on leave today`]) };
  if (/owe|receivable|overdue|collect|outstanding/.test(q)) {
    const rows = scope.filter((item) => item.money).map((item): [string, string] => [item.name, `${inr(Number(item.money!.receivable))} owed · ${inr(Number(item.money!.overdue))} overdue`]);
    return rows.length ? { text: `Customers owe ${inr(scope.reduce((sum, item) => sum + Number(item.money?.receivable ?? 0), 0))} in all.`, rows } : { text: "Money is not shared with your role." };
  }
  if (/stock|inventory|reorder|expir/.test(q)) return { text: "Stock that needs a look.", rows: scope.map((item) => [item.name, `${item.stock?.belowReorder ?? 0} at or under reorder · ${item.stock?.expiringBatches ?? 0} batches expiring in 30 days`]) };
  if (/project|delivery|milestone|late/.test(q)) return { text: "Delivery across the companies.", rows: scope.map((item) => [item.name, `${item.delivery?.activeProjects ?? 0} active · ${item.delivery?.lateProjects ?? 0} late · ${item.delivery?.overdueMilestones ?? 0} milestones past due`]) };
  if (/gst|tds|compliance|filing|due/.test(q)) {
    const rows = scope.flatMap((item) => item.compliance.filter((due) => due.status === "overdue" || due.status === "due_soon").map((due): [string, string] => [item.name, `${due.label} for ${due.period}, due ${day(due.dueOn)}${due.status === "overdue" ? " (overdue)" : ""}`]));
    return { text: rows.length ? "Filings overdue or due this week." : "No filing is overdue or due this week.", rows };
  }
  if (/lead|pipeline|deal|won|sales|revenue|win rate|best|compare/.test(q)) {
    const best = top((item) => item.crm, (item) => Number(item.crm.pipelineValue));
    return { text: named ? `${named.name} has ${inr(Number(named.crm.pipelineValue))} open in ${named.crm.openDeals} deals and has won ${inr(Number(named.crm.wonValue))}.` : `${best?.name} holds the largest open pipeline, ${inr(Number(best?.crm.pipelineValue ?? 0))}.`, rows: scope.map((item) => [item.name, `${item.period.current.leads} leads this period · ${inr(Number(item.crm.pipelineValue))} open · ${inr(Number(item.crm.wonValue))} won`]) };
  }
  return { text: "I answer from the figures on this page: what needs you, approvals, sales, people and payroll, money owed, stock, delivery and filings. Try one of those, or name a company." };
}

export function LiveIntelligence({ list }: { list: PortfolioCompany[] }) {
  const [turns, setTurns] = React.useState<{ q: string; a: ReturnType<typeof answerLive> }[]>([]);
  const [q, setQ] = React.useState("");
  const suggestions = ["What needs my attention?", "Which company has the heaviest payroll?", "What approvals are waiting?", "Any GST or TDS due?"];
  const ask = (text: string) => { const clean = text.trim(); if (!clean) return; setTurns((current) => [...current, { q: clean, a: answerLive(clean, list) }]); setQ(""); };
  return <SectionCard title="Ask across your companies" description="Answers come from the figures on the Portfolio, with the numbers shown. Janus does not guess.">
    <div className="flex flex-col gap-4">
      {turns.length === 0 && <div className="flex flex-wrap gap-2">{suggestions.map((item) => <Button key={item} size="sm" variant="outline" onClick={() => ask(item)}>{item}</Button>)}</div>}
      <ol className="flex flex-col gap-4" aria-live="polite">{turns.map((turn, index) => <li key={index} className="flex flex-col gap-2"><p className="self-end bg-accent-muted px-3 py-2 text-sm">{turn.q}</p><div className="border border-border bg-surface-2 p-3 text-sm"><p className="flex items-start gap-2"><Sparkles className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />{turn.a.text}</p>{turn.a.rows && turn.a.rows.length > 0 && <dl className="mt-3 divide-y divide-border border-t border-border">{turn.a.rows.map(([label, value], row) => <div key={row} className="flex flex-wrap justify-between gap-2 py-2"><dt className="font-medium">{label}</dt><dd className="text-muted-foreground">{value}</dd></div>)}</dl>}</div></li>)}</ol>
      <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); ask(q); }}><Input aria-label="Ask Janus" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Ask about what needs you, approvals, money, stock, delivery or filings" /><Button type="submit" disabled={!q.trim()}><Send className="mr-1 size-4" />Ask</Button></form>
    </div>
  </SectionCard>;
}

/** The board pack: one row per measure and a column per company, as a CSV any spreadsheet opens. */
export function boardPack(list: PortfolioCompany[], period: PortfolioPeriod) {
  const money = (value: string | null | undefined) => (value === null || value === undefined ? "" : value);
  const rows: [string, (item: PortfolioCompany) => string | number][] = [
    ["Health", (item) => item.health ? healthName[item.health.status] : ""],
    [`Leads in (${period.label})`, (item) => item.period.current.leads],
    [`Leads in (same days before)`, (item) => item.period.previous.leads],
    [`Value won (${period.label})`, (item) => item.period.current.wonValue],
    ["Open pipeline", (item) => item.crm.pipelineValue],
    ["Open deals", (item) => item.crm.openDeals],
    ["Customers owe", (item) => money(item.money?.receivable)],
    ["Overdue", (item) => money(item.money?.overdue)],
    ["Overdue over 60 days", (item) => money(item.money?.ageing.over60)],
    ["Bills due in 7 days", (item) => money(item.money?.payableDueThisWeek)],
    [`Collected (${period.label})`, (item) => money(item.period.current.collected)],
    ["Headcount", (item) => item.people?.headcount ?? ""],
    ["Monthly payroll", (item) => money(item.people?.monthlyPayroll)],
    ["Items at or under reorder", (item) => item.stock?.belowReorder ?? ""],
    ["Stock value", (item) => money(item.stock?.stockValue)],
    ["Late projects", (item) => item.delivery?.lateProjects ?? ""],
    ["Open tickets", (item) => item.support?.open ?? ""],
    ["Approvals waiting", (item) => item.approvals.reduce((sum, entry) => sum + entry.count, 0)],
    ["Filings overdue", (item) => item.compliance.filter((due) => due.status === "overdue").length],
  ];
  const cell = (value: string | number) => { const text = String(value); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
  const lines = [["Measure", ...list.map((item) => item.name)], ...rows.map(([label, pick]) => [label, ...list.map(pick)])].map((line) => line.map(cell).join(","));
  return `Janus Portfolio, ${period.label}: ${period.start} to ${period.end}. Money in rupees; blank where your role does not include it.\n${lines.join("\n")}\n`;
}

export function ExportButtons({ list, period }: { list: PortfolioCompany[]; period: PortfolioPeriod }) {
  const download = () => {
    const blob = new Blob([boardPack(list, period)], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `portfolio-${period.key}-${period.end}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  return <div className="flex gap-2 print:hidden"><Button size="sm" variant="outline" onClick={download}><Download className="mr-1 size-4" />Board pack (CSV)</Button><Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="mr-1 size-4" />Print</Button></div>;
}
