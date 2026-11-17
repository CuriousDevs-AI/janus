"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SWITCHABLE_WORKSPACES, getWorkspaceDefinition, type WorkspaceId } from "@/lib/workspace-config";
import { ArrowRight, ArrowUp, BellOff, Building2, Check, Eye, Plus, RotateCcw, Search, Send, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CompanyLogo } from "@/components/shared/company-logo";
import { LogoPicker } from "@/components/shared/logo-picker";
import { SectionCard } from "@/components/settings/section-ui";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/shared/page-header";
import { DemoAiModelsKeys } from "@/features/portfolio/demo/demo-ai-keys";
import { activeCompanyId, readCompanies, removeCompany, seedCompanies, subscribeCompanies, switchCompany, updateCompany, type CompanyRecord } from "@/lib/company";
import { summarise, type CompanySummary } from "@/features/portfolio/demo/group-summary";
import { answerFor, insightsFor, type Answer } from "@/features/portfolio/demo/insights";
import { Bars, Kpi, palette } from "@/features/portfolio/components/figures";
import { inr } from "@/features/portfolio/lib/format";
import { useLoginAccount } from "@/lib/demo-persona";
import { useSession } from "@/components/auth/session-provider";
import { userScoped } from "@/lib/stores/user-scoped";
import { useAuditLog, actionLabel, actionCategories, type AuditEntry } from "@/lib/stores/audit-log-store";

function sinceDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return `Since ${d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}`;
  } catch { return iso; }
}
function pl(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

const titles: Record<string, [string, string]> = {
  overview: ["Overview", "Every company you run, at a glance."],
  analytics: ["Analytics", "The same measures for every company, side by side."],
  finance: ["Finance", "What the people and the pipeline cost and bring in, by company."],
  work: ["Work Inbox", "Everything that needs someone to act, across your companies."],
  activity: ["Activity", "Every action across your portfolio, newest first."],
  companies: ["Companies", "Set up, switch on workspaces, open or remove a company."],
  intelligence: ["Janus Intelligence", "Ask a question across all your companies."],
  "ai-keys": ["AI Models & Keys", "Providers, models, keys and routing for AI features across your portfolio."],
  notifications: ["Notifications", "What needs you, from every company."],
  compliance: ["Compliance", "Policy acknowledgments, document expiry and audit status by company."],
  people: ["Portfolio access", "Who else can see the Portfolio. Each company's own people and roles are in its Business Management."],
  billing: ["Plan & Billing", "Your plan, usage and billing across all companies."],
};
const tone = { high: "danger", medium: "warning", low: "neutral" } as const;
const workspaceName = (id: string) => getWorkspaceDefinition(id as WorkspaceId).name;
const stageLabel: Record<string, string> = { new: "New", qualified: "Qualified", proposal: "Proposal", negotiation: "Negotiation", won: "Won", lost: "Lost" };

function usePortfolio() {
  const registry = React.useSyncExternalStore(subscribeCompanies, () => JSON.stringify(readCompanies()), () => JSON.stringify(seedCompanies));
  const hydrated = React.useSyncExternalStore(() => () => {}, () => true, () => false);
  const summaries = React.useMemo<CompanySummary[]>(() => hydrated ? (JSON.parse(registry) as CompanyRecord[]).map((record) => summarise(record)) : [], [registry, hydrated]);
  return { summaries, hydrated };
}
const open = (id: string, to?: string) => id === activeCompanyId() && to ? window.location.assign(to) : switchCompany(id, to);

export function DemoPortfolio() {
  const view = useSearchParams().get("view") ?? "overview";
  const login = useLoginAccount();
  const { summaries, hydrated } = usePortfolio();
  const [title, description] = titles[view] ?? titles.overview;
  if (login && login.hrRole !== "owner") return <div className="p-8 text-sm text-muted-foreground" role="status">The Portfolio is for the Owner and the people they add under Portfolio access.</div>;
  const content = !hydrated ? <p className="text-sm text-muted-foreground" role="status">Loading your companies…</p>
    : summaries.length === 0 && view !== "people" ? <FirstCompany />
    : view === "analytics" ? <Analytics list={summaries} />
    : view === "finance" ? <Finance list={summaries} />
    : view === "work" ? <WorkInbox list={summaries} />
    : view === "activity" ? <Activity list={summaries} />
    : view === "companies" ? <Companies list={summaries} />
    : view === "intelligence" ? <Intelligence list={summaries} />
    : view === "ai-keys" ? <DemoAiModelsKeys list={summaries} />
    : view === "notifications" ? <Notifications list={summaries} />
    : view === "compliance" ? <Compliance list={summaries} />
    : view === "people" ? <People list={summaries} />
    : view === "billing" ? <PlanBilling list={summaries} />
    : <Overview list={summaries} />;
  return <div className="mx-auto flex max-w-[1240px] flex-col">
    <PageHeader title={title} description={description} />
    <div className="flex flex-col gap-6 px-6 pb-10">{content}</div>
  </div>;
}

function FirstCompany() {
  return <section className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-surface px-6 py-14 text-center">
    <span className="flex size-12 items-center justify-center rounded-xl bg-accent-muted text-accent"><Building2 className="size-5" aria-hidden /></span>
    <div><h2 className="text-lg font-semibold">Create your first company</h2><p className="mt-1 text-sm text-muted-foreground">Add the company, switch on the workspaces it needs and bring in your team. Everything you add later shows up here, across all your companies.</p></div>
    <Button asChild><Link href="/setup?new=1"><Plus className="mr-1 size-4" />Create a company</Link></Button>
  </section>;
}


function Overview({ list }: { list: CompanySummary[] }) {
  const total = { people: list.reduce((s, i) => s + i.hr.people, 0), pipeline: list.reduce((s, i) => s + (i.crm?.pipeline ?? 0), 0), won: list.reduce((s, i) => s + (i.crm?.wonValue ?? 0), 0), waiting: list.reduce((s, i) => s + i.hr.pendingLeave, 0), pay: list.reduce((s, i) => s + i.hr.monthlyPay, 0) };
  const attention = list.flatMap((item) => item.attention.map((entry) => ({ ...entry, company: item.company }))).sort((a, b) => ({ high: 0, medium: 1, low: 2 })[a.severity] - ({ high: 0, medium: 1, low: 2 })[b.severity]);
  const insights = insightsFor(list);
  return <>
    <div className="flex justify-end"><Button size="sm" asChild><Link href="/setup?new=1"><Plus className="mr-1 size-4" />Add company</Link></Button></div>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
      <Kpi label="Companies" value={String(list.length)} detail="Under your login" />
      <Kpi label="People" value={String(total.people)} detail="Across all companies" />
      <Kpi label="Open pipeline" value={inr(total.pipeline)} detail="Companies with CRM" />
      <Kpi label="Won so far" value={inr(total.won)} detail="Closed deals" />
      <Kpi label="Monthly payroll" value={inr(total.pay)} detail="All companies" />
    </div>
    <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
      <SectionCard title="Needs your attention" description="Most urgent first. Open an item to go straight to it.">
        {attention.length === 0 ? <p className="text-sm text-muted-foreground">Nothing is waiting on you in any company.</p> : <ul className="flex flex-col divide-y divide-border">{attention.slice(0, 6).map((item, index) => <li key={`${item.company.id}-${index}`} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"><Badge variant={tone[item.severity]}>{item.severity === "high" ? "High" : item.severity === "medium" ? "Medium" : "Low"}</Badge><span className="min-w-0 flex-1 text-sm"><span className="font-medium">{item.company.name}</span> · {item.text}</span><Button size="sm" variant="secondary" onClick={() => open(item.company.id, item.to)}>Open</Button></li>)}</ul>}
        {attention.length > 6 && <Link className="mt-3 inline-block text-sm text-accent hover:underline" href="/portfolio?view=notifications">See all {attention.length} in Notifications</Link>}
      </SectionCard>
      <SectionCard title="Janus insights" description="Drawn from the numbers on this page.">
        {insights.length === 0 ? <p className="text-sm text-muted-foreground">Insights appear once your companies have records.</p> : <ul className="flex flex-col gap-3">{insights.map((item) => <li key={item.title} className="flex gap-3"><Sparkles className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden /><div><p className="flex items-center gap-2 text-sm font-medium">{item.title}<Badge variant={item.tone === "positive" ? "success" : item.tone === "watch" ? "warning" : "info"}>{item.tone === "positive" ? "Good" : item.tone === "watch" ? "Watch" : "Do next"}</Badge></p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{item.detail}</p></div></li>)}</ul>}
      </SectionCard>
    </div>
    <CompanyCards list={list} />
  </>;
}

function CompanyCards({ list }: { list: CompanySummary[] }) {
  return <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
    {list.map((item) => <section key={item.company.id} aria-label={item.company.name} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3"><CompanyLogo company={item.company} size={36} className="rounded-lg" /><div className="min-w-0"><h3 className="truncate text-sm font-semibold">{item.company.name}</h3><p className="truncate text-xs text-muted-foreground">{[item.company.industry, item.company.city].filter(Boolean).join(" · ") || "No details yet"}</p></div></div>
        <Badge variant={item.company.setupDone ? "success" : "warning"}>{item.company.setupDone ? "Active" : "Setup unfinished"}</Badge>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-[11px] text-muted-foreground">People</dt><dd className="font-semibold tabular-nums">{item.hr.people}</dd></div>
        <div><dt className="text-[11px] text-muted-foreground">On leave today</dt><dd className="font-semibold tabular-nums">{item.hr.onLeaveToday}</dd></div>
        {item.crm ? <><div><dt className="text-[11px] text-muted-foreground">Open pipeline</dt><dd className="font-semibold tabular-nums">{inr(item.crm.pipeline)}</dd></div><div><dt className="text-[11px] text-muted-foreground">Win rate</dt><dd className="font-semibold tabular-nums">{item.crm.winRate}%</dd></div></> : <div className="col-span-2 text-xs text-muted-foreground">CRM & Sales is not switched on.</div>}
      </dl>
      <Button variant="secondary" size="sm" className="self-start" onClick={() => open(item.company.id)}>Open {item.company.name.split(" ")[0]}<ArrowRight className="ml-1 size-4" /></Button>
    </section>)}
  </div>;
}


function Analytics({ list }: { list: CompanySummary[] }) {
  const crm = list.filter((item) => item.crm);
  const colors = new Map(list.map((item, index) => [item.company.id, palette[index % palette.length]]));
  const months = crm[0]?.crm?.monthly.map((m) => m.label) ?? [];
  const peak = Math.max(1, ...crm.flatMap((item) => item.crm!.monthly.map((m) => m.leads)));
  const x = (index: number) => 40 + index * (480 / Math.max(1, months.length - 1));
  const y = (value: number) => 170 - (value / peak) * 140;
  return <>
    {crm.length === 0 ? <SectionCard title="Sales analytics" description="Needs CRM records."><p className="text-sm text-muted-foreground">No company has CRM & Sales switched on yet.</p></SectionCard> : <>
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Open pipeline" description="Value of deals still in play."><Bars format={inr} rows={crm.map((item) => ({ id: item.company.id, label: item.company.name, value: item.crm!.pipeline, color: colors.get(item.company.id)! }))} /></SectionCard>
        <SectionCard title="Won so far" description="Closed deals by company."><Bars format={inr} rows={crm.map((item) => ({ id: item.company.id, label: item.company.name, value: item.crm!.wonValue, color: colors.get(item.company.id)! }))} /></SectionCard>
      </div>
      <SectionCard title="Leads captured by month" description="Counted from each company's leads, by the month they came in.">
        <svg viewBox="0 0 560 200" role="img" aria-label="Leads captured per month for each company" className="h-auto w-full">
          <g stroke="var(--border)" strokeWidth="1"><line x1="40" y1="170" x2="520" y2="170" /><line x1="40" y1="100" x2="520" y2="100" /><line x1="40" y1="30" x2="520" y2="30" /></g>
          {months.map((month, index) => <text key={month} x={x(index)} y="190" textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">{month}</text>)}
          {crm.map((item) => <polyline key={item.company.id} fill="none" stroke={colors.get(item.company.id)} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={item.crm!.monthly.map((m, index) => `${x(index)},${y(m.leads)}`).join(" ")} />)}
        </svg>
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">{crm.map((item) => <span key={item.company.id} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: colors.get(item.company.id) }} />{item.company.name}</span>)}</div>
      </SectionCard>
      <SectionCard title="Pipeline by stage" description="Leads at each stage, with the value of their deals.">
        <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="py-2 pr-4">Stage</th>{crm.map((item) => <th key={item.company.id} className="px-3 py-2">{item.company.name.split(" ")[0]}</th>)}</tr></thead><tbody>{Object.keys(stageLabel).map((stage) => <tr key={stage} className="border-b border-border last:border-0"><td className="py-2.5 pr-4 font-medium">{stageLabel[stage]}</td>{crm.map((item) => { const row = item.crm!.byStage.find((entry) => entry.stage === stage) ?? { count: 0, value: 0 }; return <td key={item.company.id} className="px-3 py-2.5 tabular-nums">{row.count}{row.value ? <span className="text-muted-foreground"> · {inr(row.value)}</span> : null}</td>; })}</tr>)}</tbody></table></div>
      </SectionCard>
      <SectionCard title="Where leads come from" description="Leads and how many were won, by channel.">
        <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="py-2 pr-4">Channel</th>{crm.map((item) => <th key={item.company.id} className="px-3 py-2">{item.company.name.split(" ")[0]}</th>)}</tr></thead><tbody>{["whatsapp", "website", "phone_call"].map((source) => <tr key={source} className="border-b border-border last:border-0"><td className="py-2.5 pr-4 font-medium">{source === "phone_call" ? "Phone calls" : source === "whatsapp" ? "WhatsApp" : "Website"}</td>{crm.map((item) => { const row = item.crm!.bySource.find((entry) => entry.source === source) ?? { count: 0, won: 0 }; return <td key={item.company.id} className="px-3 py-2.5 tabular-nums">{row.count}<span className="text-muted-foreground"> · {row.won} won</span></td>; })}</tr>)}</tbody></table></div>
      </SectionCard>
    </>}
    <SectionCard title="People" description="Headcount and payroll by company."><Bars format={(value) => `${value} people`} rows={list.map((item) => ({ id: item.company.id, label: item.company.name, value: item.hr.people, color: colors.get(item.company.id)! }))} /></SectionCard>
  </>;
}

function Finance({ list }: { list: CompanySummary[] }) {
  const t = { pay: list.reduce((s, i) => s + i.hr.monthlyPay, 0), won: list.reduce((s, i) => s + (i.crm?.wonValue ?? 0), 0), pipe: list.reduce((s, i) => s + (i.crm?.pipeline ?? 0), 0), claims: list.reduce((s, i) => s + i.hr.claimsValue, 0), claimCount: list.reduce((s, i) => s + i.hr.claimsPending, 0) };
  const rows: [string, (item: CompanySummary) => string][] = [["Monthly payroll", (item) => inr(item.hr.monthlyPay)], ["Payroll per year", (item) => inr(item.hr.monthlyPay * 12)], ["Won so far", (item) => item.crm ? inr(item.crm.wonValue) : "—"], ["Open pipeline", (item) => item.crm ? inr(item.crm.pipeline) : "—"], ["Monthly payroll as % of won", (item) => item.crm && item.crm.wonValue ? `${Math.round((item.hr.monthlyPay / item.crm.wonValue) * 100)}%` : "—"], ["Reimbursements waiting", (item) => item.hr.claimsPending ? `${item.hr.claimsPending} · ${inr(item.hr.claimsValue)}` : "None"], ["Finance & Accounting", () => "Not connected"]];
  return <>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Kpi label="Monthly payroll" value={inr(t.pay)} detail="All companies" />
      <Kpi label="Won so far" value={inr(t.won)} detail="Closed deals" />
      <Kpi label="Open pipeline" value={inr(t.pipe)} detail="Still to close" />
      <Kpi label="Reimbursements waiting" value={String(t.claimCount)} detail={`${inr(t.claims)} to approve`} />
    </div>
    <SectionCard title="By company" description="Taken from each company's HR and CRM records.">
      <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="py-2 pr-4">Measure</th>{list.map((item) => <th key={item.company.id} className="px-3 py-2">{item.company.name.split(" ")[0]}</th>)}</tr></thead><tbody>{rows.map(([label, fn]) => <tr key={label} className="border-b border-border last:border-0"><td className="py-2.5 pr-4 font-medium">{label}</td>{list.map((item) => <td key={item.company.id} className="px-3 py-2.5 tabular-nums">{fn(item)}</td>)}</tr>)}</tbody></table></div>
    </SectionCard>
    <SectionCard title="Ledgers" description="Cash, receivables, payables and GST need Finance & Accounting."><p className="text-sm text-muted-foreground">Finance & Accounting is not connected for any company yet. Until it is, this page shows what payroll and sales records can tell you, and Janus does not estimate cash or profit.</p></SectionCard>
  </>;
}

function Companies({ list }: { list: CompanySummary[] }) {
  const [editing, setEditing] = React.useState<CompanyRecord | null>(null);
  const [removing, setRemoving] = React.useState<CompanyRecord | null>(null);
  return <>
    <div className="flex justify-end"><Button size="sm" asChild><Link href="/setup?new=1"><Plus className="mr-1 size-4" />Add company</Link></Button></div>
    <div className="grid gap-4 lg:grid-cols-2">
      {list.map((item) => { const company = item.company; return <section key={company.id} aria-label={company.name} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
        <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><CompanyLogo company={company} size={36} className="rounded-lg" /><div className="min-w-0"><h3 className="truncate text-sm font-semibold">{company.name}</h3><p className="text-xs text-muted-foreground">{[company.industry, company.city, sinceDate(company.createdAt)].filter(Boolean).join(" · ")}</p></div></div>{company.setupDone ? <Badge variant="success">Active</Badge> : <Link href={`/setup?finish=${company.id}`}><Badge variant="warning" className="cursor-pointer hover:opacity-80">Setup unfinished</Badge></Link>}</div>
        <div className="grid gap-1.5"><p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Workspaces</p>
          <div className="flex flex-wrap gap-1.5">{SWITCHABLE_WORKSPACES.map((id) => { const on = company.workspaces.includes(id); return <Badge key={id} variant={on ? "success" : "neutral"}>{workspaceName(id)}</Badge>; })}</div>
        </div>
        <p className="text-xs text-muted-foreground">{pl(item.hr.people, "person", "people")}{item.crm ? ` · ${pl(item.crm.leads, "lead", "leads")} · ${pl(item.crm.openDeals, "open deal", "open deals")}` : ""}</p>
        <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => open(company.id)}>Open<ArrowRight className="ml-1 size-4" /></Button>{!company.setupDone && <Button size="sm" variant="secondary" asChild><Link href={`/setup?finish=${company.id}`}>Finish setup</Link></Button>}<Button size="sm" variant="outline" onClick={() => setEditing(company)}>Edit details</Button><Button size="sm" variant="ghost" aria-label={`Remove ${company.name}`} onClick={() => setRemoving(company)}><Trash2 className="size-4" /></Button></div>
      </section>; })}
    </div>
    {editing && <EditCompany company={editing} onClose={() => setEditing(null)} />}
    {removing && <RemoveCompany company={removing} onClose={() => setRemoving(null)} />}
  </>;
}

function EditCompany({ company, onClose }: { company: CompanyRecord; onClose: () => void }) {
  const session = useSession();
  const appendLog = useAuditLog((s) => s.append);
  const [name, setName] = React.useState(company.name);
  const [industry, setIndustry] = React.useState(company.industry);
  const [city, setCity] = React.useState(company.city);
  const [logo, setLogo] = React.useState<string | undefined>(company.logo);
  const taken = readCompanies().some((item) => item.id !== company.id && item.name.trim().toLowerCase() === name.trim().toLowerCase());
  const error = name.trim().length < 2 ? "Give the company a name." : taken ? `${name.trim()} already exists.` : industry.trim().length > 0 && industry.trim().length < 3 ? "Industry must be at least 3 characters." : city.trim().length > 0 && city.trim().length < 2 ? "City must be at least 2 characters." : "";
  const save = () => {
    const before: Record<string, string> = {};
    const after: Record<string, string> = {};
    if (name.trim() !== company.name) { before.name = company.name; after.name = name.trim(); }
    if (industry.trim() !== company.industry) { before.industry = company.industry; after.industry = industry.trim(); }
    if (city.trim() !== company.city) { before.city = company.city; after.city = city.trim(); }
    updateCompany(company.id, { name: name.trim(), industry: industry.trim(), city: city.trim(), logo });
    appendLog({ action: "company.edited", actor: { name: session.user.name, email: session.user.email, role: session.role }, companyId: company.id, companyName: company.name, target: company.name, detail: null, before: Object.keys(before).length ? before : null, after: Object.keys(after).length ? after : null });
    toast.success("Company updated."); onClose();
  };
  return <Dialog open onOpenChange={(value) => !value && onClose()}><DialogContent><DialogHeader><DialogTitle>Edit {company.name}</DialogTitle><DialogDescription>The name appears in the company menu, reports and letters.</DialogDescription></DialogHeader>
    <div className="grid gap-4"><LogoPicker id={company.id} name={name} value={logo} onChange={setLogo} /><label className="grid gap-1.5 text-xs text-muted-foreground">Name<Input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} /></label><label className="grid gap-1.5 text-xs text-muted-foreground">Industry<Input value={industry} maxLength={60} onChange={(event) => setIndustry(event.target.value)} /></label><label className="grid gap-1.5 text-xs text-muted-foreground">City<Input value={city} maxLength={40} onChange={(event) => setCity(event.target.value)} /></label>{error && <p role="alert" className="text-xs text-danger">{error}</p>}</div>
    <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={Boolean(error)} onClick={save}>Save</Button></DialogFooter></DialogContent></Dialog>;
}

function RemoveCompany({ company, onClose }: { company: CompanyRecord; onClose: () => void }) {
  const session = useSession();
  const appendLog = useAuditLog((s) => s.append);
  const [typed, setTyped] = React.useState("");
  const remove = () => {
    removeCompany(company.id);
    appendLog({ action: "company.archived", actor: { name: session.user.name, email: session.user.email, role: session.role }, companyId: company.id, companyName: company.name, target: company.name, detail: null, before: null, after: null });
    toast.success(`${company.name} removed.`); onClose();
  };
  return <Dialog open onOpenChange={(value) => !value && onClose()}><DialogContent><DialogHeader><DialogTitle>Remove {company.name}?</DialogTitle><DialogDescription>It disappears from your account and from the Portfolio. Type its name to confirm.</DialogDescription></DialogHeader>
    <Input aria-label="Type the company name" value={typed} onChange={(event) => setTyped(event.target.value)} placeholder={company.name} />
    <DialogFooter><Button variant="outline" onClick={onClose}>Keep it</Button><Button variant="destructive" disabled={typed.trim() !== company.name} onClick={remove}>Remove company</Button></DialogFooter></DialogContent></Dialog>;
}

function Intelligence({ list }: { list: CompanySummary[] }) {
  const [turns, setTurns] = React.useState<{ q: string; a: Answer }[]>([]);
  const [q, setQ] = React.useState("");
  const suggestions = ["What needs my attention?", "Compare the pipeline", "Which company has the heaviest payroll?", "Where does each company stand on setup?"];
  function ask(text: string) { const clean = text.trim(); if (!clean) return; setTurns((current) => [...current, { q: clean, a: answerFor(clean, list) }]); setQ(""); }
  return <SectionCard title="Ask across your companies" description="Answers come from each company's own records, with the figures shown. Janus does not guess.">
    <div className="flex flex-col gap-4">
      {turns.length === 0 && <div className="flex flex-wrap gap-2">{suggestions.map((item) => <Button key={item} size="sm" variant="outline" onClick={() => ask(item)}>{item}</Button>)}</div>}
      <ol className="flex flex-col gap-4" aria-live="polite">{turns.map((turn, index) => <li key={index} className="flex flex-col gap-2"><p className="self-end bg-accent-muted px-3 py-2 text-sm">{turn.q}</p><div className="border border-border bg-surface-2 p-3 text-sm"><p className="flex items-start gap-2"><Sparkles className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />{turn.a.text}</p>{turn.a.rows && turn.a.rows.length > 0 && <dl className="mt-3 divide-y divide-border border-t border-border">{turn.a.rows.map(([label, value], row) => <div key={row} className="flex flex-wrap justify-between gap-2 py-2"><dt className="font-medium">{label}</dt><dd className="text-muted-foreground">{value}</dd></div>)}</dl>}</div></li>)}</ol>
      <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); ask(q); }}><Input aria-label="Ask Janus" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Ask about pipeline, people, payroll or what needs you" /><Button type="submit" disabled={!q.trim()}><Send className="mr-1 size-4" />Ask</Button></form>
    </div>
  </SectionCard>;
}

function Notifications({ list }: { list: CompanySummary[] }) {
  const readKey = userScoped("janus.portfolio-read");
  const [filter, setFilter] = React.useState("all");
  const [read, setRead] = React.useState<string[]>(() => { try { return JSON.parse(window.localStorage.getItem(readKey) ?? "[]"); } catch { return []; } });
  const items = list.flatMap((item) => item.attention.map((entry, index) => ({ ...entry, company: item.company, key: `${item.company.id}:${index}:${entry.text}` }))).filter((item) => filter === "all" || item.company.id === filter).sort((a, b) => ({ high: 0, medium: 1, low: 2 })[a.severity] - ({ high: 0, medium: 1, low: 2 })[b.severity]);
  const mark = (keys: string[]) => { const next = [...new Set([...read, ...keys])]; setRead(next); try { window.localStorage.setItem(readKey, JSON.stringify(next)); } catch { /* private mode */ } };
  const unread = items.filter((item) => !read.includes(item.key));
  return <SectionCard title={`${unread.length} unread`} description="From every company, most urgent first." action={<Button size="sm" variant="secondary" disabled={unread.length === 0} onClick={() => mark(items.map((item) => item.key))}><Check className="mr-1 size-4" />Mark all read</Button>}>
    <div role="group" aria-label="Filter by company" className="mb-4 flex flex-wrap gap-2"><Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>All companies</Button>{list.map((item) => <Button key={item.company.id} size="sm" variant={filter === item.company.id ? "default" : "outline"} onClick={() => setFilter(item.company.id)}>{item.company.name.split(" ")[0]}</Button>)}</div>
    {items.length === 0 ? <p className="text-sm text-muted-foreground">Nothing needs you right now.</p> : <ul className="flex flex-col divide-y divide-border">{items.map((item) => <li key={item.key} className={`flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0 ${read.includes(item.key) ? "opacity-60" : ""}`}><Badge variant={tone[item.severity]}>{item.severity === "high" ? "High" : item.severity === "medium" ? "Medium" : "Low"}</Badge><span className="min-w-0 flex-1 text-sm"><span className="font-medium">{item.company.name}</span> · {item.text}</span><Button size="sm" variant="secondary" onClick={() => { mark([item.key]); open(item.company.id, item.to); }}>Open</Button></li>)}</ul>}
  </SectionCard>;
}

type Person = { id: string; name: string; email: string; role: string; companies: string[] };
const roles: [string, string][] = [["Co-owner", "Sees everything in the Portfolio and can add companies."], ["Group finance", "Sees Analytics and Finance, not people or notifications."], ["Group analyst", "Sees Overview and Analytics, read only."]];
function People({ list }: { list: CompanySummary[] }) {
  const accessKey = userScoped("janus.portfolio-access");
  const { user } = useSession();
  const [people, setPeople] = React.useState<Person[]>(() => { try { return JSON.parse(window.localStorage.getItem(accessKey) ?? "[]"); } catch { return []; } });
  const [adding, setAdding] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", email: "", role: roles[1][0], companies: [] as string[] });
  const save = (next: Person[]) => { setPeople(next); try { window.localStorage.setItem(accessKey, JSON.stringify(next)); } catch { /* private mode */ } };
  const error = !form.name.trim() ? "Enter their name." : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim()) ? "Enter a valid email." : people.some((item) => item.email.toLowerCase() === form.email.trim().toLowerCase()) ? "That person already has access." : "";
  return <>
    <SectionCard title="Who can see the Portfolio" description="You always can. Add people who need the view across companies." action={<Button size="sm" onClick={() => setAdding(true)}><Plus className="mr-1 size-4" />Add person</Button>}>
      <ul className="divide-y divide-border"><li className="flex items-center justify-between gap-3 py-3 first:pt-0"><div><p className="text-sm font-medium">{user.name}</p><p className="text-xs text-muted-foreground">{user.email} · Owner · every company</p></div><Badge variant="success">Owner</Badge></li>
        {people.map((person) => <li key={person.id} className="flex items-center justify-between gap-3 py-3 last:pb-0"><div className="min-w-0"><p className="truncate text-sm font-medium">{person.name} <span className="font-normal text-muted-foreground">· {person.email}</span></p><p className="text-xs text-muted-foreground">{person.role} · {person.companies.length ? person.companies.map((id) => list.find((item) => item.company.id === id)?.company.name ?? id).join(", ") : "every company"}</p></div><Button size="sm" variant="ghost" aria-label={`Remove ${person.name}`} onClick={() => { save(people.filter((item) => item.id !== person.id)); toast.success(`${person.name} no longer has access.`); }}><Trash2 className="size-4" /></Button></li>)}
      </ul>
    </SectionCard>
    <SectionCard title="What each role sees" description="Company data stays inside each company. These roles only open the Portfolio."><dl className="grid gap-3 md:grid-cols-3">{roles.map(([role, detail]) => <div key={role} className="border border-border bg-surface-2 p-3"><dt className="text-sm font-medium">{role}</dt><dd className="mt-1 text-xs text-muted-foreground">{detail}</dd></div>)}</dl></SectionCard>
    <Dialog open={adding} onOpenChange={setAdding}><DialogContent><DialogHeader><DialogTitle>Add a person</DialogTitle><DialogDescription>They get an invitation to the Portfolio with the access you choose.</DialogDescription></DialogHeader>
      <div className="grid gap-3"><label className="grid gap-1.5 text-xs text-muted-foreground">Name<Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label className="grid gap-1.5 text-xs text-muted-foreground">Email<Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
        <label className="grid gap-1.5 text-xs text-muted-foreground">Role<select className="h-9 border border-border bg-surface px-3 text-sm text-foreground" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>{roles.map(([role]) => <option key={role}>{role}</option>)}</select></label>
        <fieldset className="grid gap-1.5"><legend className="mb-1 text-xs text-muted-foreground">Companies (none ticked means every company)</legend>{list.map((item) => <label key={item.company.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.companies.includes(item.company.id)} onChange={() => setForm({ ...form, companies: form.companies.includes(item.company.id) ? form.companies.filter((id) => id !== item.company.id) : [...form.companies, item.company.id] })} />{item.company.name}</label>)}</fieldset>
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}</div>
      <DialogFooter><Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button><Button disabled={Boolean(error)} onClick={() => { save([...people, { id: crypto.randomUUID(), name: form.name.trim(), email: form.email.trim(), role: form.role, companies: form.companies }]); toast.success(`${form.name.trim()} was invited.`); setForm({ name: "", email: "", role: roles[1][0], companies: [] }); setAdding(false); }}>Send invitation</Button></DialogFooter></DialogContent></Dialog>
  </>;
}

type DemoWorkKind = "approve" | "follow_up" | "claims" | "setup" | "leads";
const demoWorkKinds: Record<DemoWorkKind, string> = { approve: "Approve", follow_up: "Follow up", claims: "Expense claims", setup: "Finish setup", leads: "Leads going quiet" };
type DemoWorkItem = { key: string; company: CompanyRecord; kind: DemoWorkKind; priority: "high" | "medium" | "low"; title: string; detail: string; to: string };
const DAY = 864e5;
const priorityOrder = { high: 0, medium: 1, low: 2 };

function demoWorkFor(list: CompanySummary[]): DemoWorkItem[] {
  const items: DemoWorkItem[] = [];
  for (const s of list) {
    const add = (item: Omit<DemoWorkItem, "company" | "key">) => items.push({ ...item, company: s.company, key: `${s.company.id}:${item.kind}:${item.title}` });
    if (s.hr.pendingLeave > 0) add({ kind: "approve", priority: s.hr.pendingLeave > 2 ? "high" : "medium", title: `${s.hr.pendingLeave} leave request${s.hr.pendingLeave !== 1 ? "s" : ""} pending`, detail: "Decide in the company, where the policy applies.", to: "/workspace/hr-people?view=approvals&workspace=hr-people" });
    if (s.hr.claimsPending > 0) add({ kind: "claims", priority: s.hr.claimsValue > 10000 ? "high" : "medium", title: `${s.hr.claimsPending} expense claim${s.hr.claimsPending !== 1 ? "s" : ""} to review`, detail: `${inr(s.hr.claimsValue)} total across submitted claims.`, to: "/workspace/hr-people?view=expenses&workspace=hr-people" });
    if (s.crm && s.crm.quiet > 0) add({ kind: "leads", priority: s.crm.quiet > 4 ? "high" : "medium", title: `${s.crm.quiet} lead${s.crm.quiet !== 1 ? "s" : ""} with no activity for 4+ days`, detail: "Follow up or close them before they go cold.", to: "/leads?workspace=crm-sales" });
    if (s.crm) {
      const proposals = s.crm.byStage.find((r) => r.stage === "proposal");
      const negotiations = s.crm.byStage.find((r) => r.stage === "negotiation");
      const waiting = (proposals?.count ?? 0) + (negotiations?.count ?? 0);
      const waitingValue = (proposals?.value ?? 0) + (negotiations?.value ?? 0);
      if (waiting > 0) add({ kind: "follow_up", priority: waiting > 3 ? "high" : "medium", title: `${waiting} deal${waiting !== 1 ? "s" : ""} in proposal or negotiation`, detail: `${inr(waitingValue)} in the pipeline waiting for a decision.`, to: "/deals?workspace=crm-sales" });
    }
    if (!s.company.setupDone) add({ kind: "setup", priority: "low", title: "Finish company setup", detail: "Some workspaces are off until setup is complete.", to: `/setup?finish=${s.company.id}` });
  }
  return items.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

function WorkInbox({ list }: { list: CompanySummary[] }) {
  const [company, setCompany] = React.useState("all");
  const [kind, setKind] = React.useState<DemoWorkKind | "all">("all");
  const [urgentOnly, setUrgentOnly] = React.useState(false);
  const [snoozed, setSnoozed] = React.useState<Record<string, number>>({});
  const [openedAt] = React.useState(() => Date.now());
  const all = React.useMemo(() => demoWorkFor(list), [list]);
  const live = all.filter((item) => !(snoozed[item.key] > openedAt));
  const shown = live.filter((item) => (company === "all" || item.company.id === company) && (kind === "all" || item.kind === kind) && (!urgentOnly || item.priority === "high"));
  const kinds = [...new Set(live.map((item) => item.kind))];
  const hidden = all.length - live.length;
  const snooze = (key: string) => setSnoozed((prev) => ({ ...prev, [key]: Date.now() + DAY }));
  const unsnoozeAll = () => setSnoozed({});
  return <>
    <div className="grid grid-cols-3 gap-3">
      <Kpi label="To do" value={String(live.length)} detail="Show everything" active={!urgentOnly && company === "all" && kind === "all"} onSelect={() => { setUrgentOnly(false); setCompany("all"); setKind("all"); }} />
      <Kpi label="Urgent" value={String(live.filter((item) => item.priority === "high").length)} tone="danger" detail={urgentOnly ? "Showing only these" : "Show only these"} active={urgentOnly} onSelect={() => setUrgentOnly(!urgentOnly)} />
      <Kpi label="Companies" value={String(list.length)} detail="In your portfolio" />
    </div>
    <SectionCard title={`${shown.length} ${shown.length === 1 ? "thing" : "things"} to do`} description="Most urgent first. Open one to do it in its company." action={hidden > 0 ? <Button size="sm" variant="ghost" onClick={unsnoozeAll}><RotateCcw className="size-3.5" />Show {hidden} snoozed</Button> : undefined}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {list.length > 1 && <select aria-label="Company" className="h-8 rounded-md border border-input bg-surface-2 px-2 text-[13px]" value={company} onChange={(e) => setCompany(e.target.value)}><option value="all">All companies</option>{list.map((item) => <option key={item.company.id} value={item.company.id}>{item.company.name}</option>)}</select>}
        <select aria-label="Kind of work" className="h-8 rounded-md border border-input bg-surface-2 px-2 text-[13px]" value={kind} onChange={(e) => setKind(e.target.value as DemoWorkKind | "all")}><option value="all">Every kind</option>{kinds.map((k) => <option key={k} value={k}>{demoWorkKinds[k]}</option>)}</select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={urgentOnly} onChange={() => setUrgentOnly(!urgentOnly)} />Urgent only</label>
      </div>
      {shown.length === 0 ? <p className="text-sm text-muted-foreground">{live.length === 0 ? (list.length > 1 ? "Nothing needs doing in any company. Well done." : "Nothing needs doing right now. Well done.") : "Nothing matches these filters."}</p>
        : <ul className="flex flex-col divide-y divide-border">{shown.map((item) => <li key={item.key} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
          <Badge variant={item.priority === "high" ? "danger" : item.priority === "medium" ? "warning" : "neutral"}>{item.priority === "high" ? "Urgent" : item.priority === "medium" ? "Soon" : "When free"}</Badge>
          <div className="min-w-0 flex-1">
            <p className="text-sm"><span className="font-medium">{item.title}</span> <span className="text-muted-foreground">{list.length > 1 ? `· ${item.company.name} ` : ""}· {demoWorkKinds[item.kind]}</span></p>
            <p className="text-xs text-muted-foreground">{item.detail}</p>
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" aria-label={`Snooze ${item.title} for a day`} title="Hide for a day" onClick={() => snooze(item.key)}><BellOff className="size-3.5" /></Button>
            <Button size="sm" variant="secondary" onClick={() => open(item.company.id, item.to)}>Open</Button>
          </div>
        </li>)}</ul>}
    </SectionCard>
  </>;
}

const fmtAuditDate = (iso: string) => {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) + ", " + d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
  } catch { return iso; }
};
const fmtAuditDay = (iso: string) => {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    if (isToday) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  } catch { return iso; }
};
const fmtAuditTime = (iso: string) => {
  try { return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }); }
  catch { return ""; }
};

const PAGE_SIZE = 20;

function useSeedAuditLog(list: CompanySummary[], session: { user: { name: string; email: string }; role: string }) {
  const entries = useAuditLog((s) => s.entries);
  const seeded = React.useRef(false);
  React.useEffect(() => {
    if (seeded.current || entries.length > 0 || list.length === 0) return;
    seeded.current = true;
    const actor = { name: session.user.name, email: session.user.email, role: session.role };
    const batch: Omit<AuditEntry, "id" | "at" | "device" | "ip">[] = [];
    for (const item of [...list].reverse()) {
      const c = item.company;
      batch.push({ action: "company.created", actor, companyId: c.id, companyName: c.name, target: c.name, detail: `Industry: ${c.industry}, City: ${c.city}`, before: null, after: { industry: c.industry, city: c.city } });
      for (const ws of c.workspaces) {
        batch.push({ action: "workspace.enabled", actor, companyId: c.id, companyName: c.name, target: ws, detail: null, before: null, after: { workspace: ws } });
      }
      if (c.setupDone) {
        batch.push({ action: "setup.completed", actor, companyId: c.id, companyName: c.name, target: c.name, detail: null, before: null, after: null });
      }
    }
    requestAnimationFrame(() => { for (const entry of batch) useAuditLog.getState().append(entry); });
  }, [list, entries.length, session]);
}

function Activity({ list }: { list: CompanySummary[] }) {
  const session = useSession();
  useSeedAuditLog(list, session);
  const entries = useAuditLog((s) => s.entries);
  const [search, setSearchRaw] = React.useState("");
  const [filterCompany, setFilterCompanyRaw] = React.useState("all");
  const [filterCategory, setFilterCategoryRaw] = React.useState("all");
  const [page, setPage] = React.useState(0);
  const [drawer, setDrawer] = React.useState<AuditEntry | null>(null);
  const setSearch = (v: string) => { setSearchRaw(v); setPage(0); };
  const setFilterCompany = (v: string) => { setFilterCompanyRaw(v); setPage(0); };
  const setFilterCategory = (v: string) => { setFilterCategoryRaw(v); setPage(0); };

  const companyNames = React.useMemo(() => [...new Set(entries.filter((e) => e.companyName).map((e) => e.companyName!))].sort(), [entries]);
  const categories = React.useMemo(() => actionCategories(), []);

  const filtered = React.useMemo(() => {
    let result = entries;
    if (filterCompany !== "all") result = result.filter((e) => e.companyName === filterCompany);
    if (filterCategory !== "all") {
      const cat = categories.find((c) => c.label === filterCategory);
      if (cat) result = result.filter((e) => cat.actions.includes(e.action));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((e) => e.actor.name.toLowerCase().includes(q) || actionLabel(e.action).toLowerCase().includes(q) || (e.target && e.target.toLowerCase().includes(q)) || (e.companyName && e.companyName.toLowerCase().includes(q)));
    }
    return result;
  }, [entries, filterCompany, filterCategory, search, categories]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const groups = paged.reduce<[string, AuditEntry[]][]>((out, entry) => {
    const label = fmtAuditDay(entry.at);
    const last = out[out.length - 1];
    if (last && last[0] === label) last[1].push(entry); else out.push([label, [entry]]);
    return out;
  }, []);

  return <>
    <SectionCard title="Audit log" description="Every action across your portfolio, newest first. Click View for full details.">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input type="text" placeholder="Search events…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent" />
        </div>
        <select aria-label="Company" className="h-8 rounded-md border border-input bg-surface-2 px-2 text-[13px]" value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)}>
          <option value="all">All companies</option>
          {companyNames.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <select aria-label="Action type" className="h-8 rounded-md border border-input bg-surface-2 px-2 text-[13px]" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
          <option value="all">All actions</option>
          {categories.map((cat) => <option key={cat.label} value={cat.label}>{cat.label}</option>)}
        </select>
        <span className="text-[11px] text-muted-foreground tabular-nums">{filtered.length} event{filtered.length !== 1 ? "s" : ""}</span>
      </div>
      {groups.length === 0 ? <p className="text-sm text-muted-foreground">No events{search || filterCompany !== "all" || filterCategory !== "all" ? " match the filters" : " recorded yet"}.</p>
        : <div className="flex flex-col gap-5">{groups.map(([label, groupEntries]) => <section key={label}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</h3>
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {groupEntries.map((entry) => <li key={entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2.5 text-sm">
              <span className="w-20 shrink-0 text-xs tabular-nums text-muted-foreground">{fmtAuditTime(entry.at)}</span>
              <span className="min-w-0 flex-1"><span className="font-medium">{entry.actor.name}</span> {actionLabel(entry.action)} <span className="font-medium">{entry.target}</span>{entry.companyName ? <span className="text-muted-foreground"> · {entry.companyName}</span> : null}</span>
              <Button size="sm" variant="ghost" onClick={() => setDrawer(entry)}><Eye className="size-3.5" />View</Button>
            </li>)}
          </ul>
        </section>)}</div>}
      {totalPages > 1 && <div className="mt-4 flex items-center justify-between">
        <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
        <span className="text-xs text-muted-foreground tabular-nums">Page {page + 1} of {totalPages}</span>
        <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>Next</Button>
      </div>}
    </SectionCard>
    {drawer && <AuditDrawer entry={drawer} onClose={() => setDrawer(null)} />}
  </>;
}

function AuditDrawer({ entry, onClose }: { entry: AuditEntry; onClose: () => void }) {
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  const rows: [string, string][] = [
    ["Who", `${entry.actor.name} (${entry.actor.email})`],
    ["Role", entry.actor.role],
    ["Action", actionLabel(entry.action)],
    ["Target", entry.target],
    ...(entry.companyName ? [["Company", entry.companyName] as [string, string]] : []),
    ["When", fmtAuditDate(entry.at)],
    ["Device", entry.device.length > 60 ? entry.device.slice(0, 60) + "…" : entry.device],
    ["IP address", entry.ip],
    ["Log ID", entry.id],
  ];
  if (entry.detail) rows.splice(4, 0, ["Detail", entry.detail]);
  return <>
    <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
    <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-surface shadow-lg">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold">Event details</h2>
        <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-surface-2" aria-label="Close"><X className="size-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <dl className="flex flex-col gap-3">
          {rows.map(([label, value]) => <div key={label} className="flex flex-col gap-0.5">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className="text-sm text-foreground break-all">{value}</dd>
          </div>)}
        </dl>
        {(entry.before || entry.after) && <div className="mt-5">
          <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Changes</h3>
          <div className="grid gap-2">
            {Object.keys({ ...entry.before, ...entry.after }).map((key) => <div key={key} className="rounded-md border border-border p-2.5 text-xs">
              <span className="font-medium">{key}</span>
              {entry.before?.[key] && <span className="block text-danger line-through">{entry.before[key]}</span>}
              {entry.after?.[key] && <span className="block text-emerald-600 dark:text-emerald-400">{entry.after[key]}</span>}
            </div>)}
          </div>
        </div>}
      </div>
    </aside>
  </>;
}


function Compliance({ list }: { list: CompanySummary[] }) {
  const complianceItems: { company: CompanyRecord; category: string; item: string; status: "compliant" | "attention" | "overdue"; due?: string }[] = [];
  for (const item of list) {
    if (!item.company.setupDone) complianceItems.push({ company: item.company, category: "Setup", item: "Company setup", status: "overdue", due: "Incomplete" });
    complianceItems.push({ company: item.company, category: "HR", item: "Employee agreements", status: item.hr.people > 0 ? "compliant" : "attention", due: item.hr.people > 0 ? "On file" : "No employees" });
    complianceItems.push({ company: item.company, category: "Policy", item: "Leave policy", status: "compliant" });
    if (item.crm) complianceItems.push({ company: item.company, category: "Data", item: "CRM data handling", status: "compliant" });
  }
  const overdue = complianceItems.filter((i) => i.status === "overdue").length;
  const attention = complianceItems.filter((i) => i.status === "attention").length;
  return <>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Kpi label="Companies" value={String(list.length)} detail="Under compliance review" />
      <Kpi label="Compliant" value={String(complianceItems.filter((i) => i.status === "compliant").length)} detail="Items up to date" />
      <Kpi label="Needs attention" value={String(attention)} detail="Review required" />
      <Kpi label="Overdue" value={String(overdue)} detail="Action needed" />
    </div>
    <SectionCard title="Compliance status by company" description="Policy acknowledgments, document expiry and setup status.">
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="py-2 pr-4">Company</th><th className="px-3 py-2">Category</th><th className="px-3 py-2">Item</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Note</th></tr></thead>
        <tbody>{complianceItems.map((ci, index) => <tr key={`${ci.company.id}-${index}`} className="border-b border-border last:border-0"><td className="py-2.5 pr-4"><div className="flex items-center gap-2"><CompanyLogo company={ci.company} size={20} className="rounded" /><span className="font-medium">{ci.company.name}</span></div></td><td className="px-3 py-2.5 text-muted-foreground">{ci.category}</td><td className="px-3 py-2.5">{ci.item}</td><td className="px-3 py-2.5"><Badge variant={ci.status === "compliant" ? "success" : ci.status === "attention" ? "warning" : "danger"}>{ci.status === "compliant" ? "Compliant" : ci.status === "attention" ? "Attention" : "Overdue"}</Badge></td><td className="px-3 py-2.5 text-xs text-muted-foreground">{ci.due ?? "—"}</td></tr>)}</tbody></table></div>
    </SectionCard>
  </>;
}


const PLANS = [
  { id: "free", name: "Free", price: 0, tagline: "Get started with the basics.", companies: 1, logins: 3, features: ["1 company", "3 people", "CRM & HR basics", "Community support"] },
  { id: "starter", name: "Starter", price: 999, tagline: "For a small team running one company.", companies: 2, logins: 15, features: ["2 companies", "15 people", "All workspaces", "Email support"] },
  { id: "growth", name: "Growth", price: 2999, tagline: "The plan most growing businesses choose.", companies: 10, logins: 100, features: ["10 companies", "100 people", "Janus Intelligence", "Priority support", "Compliance calendar"] },
  { id: "enterprise", name: "Enterprise", price: null as number | null, tagline: "For groups that need everything.", companies: null as number | null, logins: null as number | null, features: ["Unlimited companies", "Unlimited people", "Dedicated support", "Custom integrations", "SLA guarantee"] },
];

function PlanBilling({ list }: { list: CompanySummary[] }) {
  const billingKey = userScoped("janus.portfolio-plan");
  const [currentPlan, setCurrentPlan] = React.useState(() => { try { return window.localStorage.getItem(billingKey) ?? "free"; } catch { return "free"; } });
  const [upgrading, setUpgrading] = React.useState<typeof PLANS[number] | null>(null);
  const totalPeople = list.reduce((s, i) => s + i.hr.people, 0);
  const current = PLANS.find((p) => p.id === currentPlan) ?? PLANS[0];
  const changePlan = (planId: string) => { setCurrentPlan(planId); try { window.localStorage.setItem(billingKey, planId); } catch {} setUpgrading(null); toast.success(`Plan changed to ${PLANS.find((p) => p.id === planId)?.name}.`); };
  const rank = (id: string) => PLANS.findIndex((p) => p.id === id);
  return <>
    <SectionCard title="Your plan" description="One plan covers every company you own.">
      <div className="flex flex-wrap items-center gap-4">
        <div className="rounded-lg border-2 border-accent bg-accent-muted px-4 py-3">
          <p className="text-lg font-semibold">{current.name}</p>
          <p className="text-sm text-muted-foreground">{current.price === null ? "Custom pricing" : current.price === 0 ? "Free" : `₹${current.price.toLocaleString("en-IN")}/mo + GST`}</p>
        </div>
        <dl className="grid grid-cols-3 gap-6 text-sm">
          <div><dt className="text-[11px] text-muted-foreground">Companies</dt><dd className="font-semibold tabular-nums">{list.length}{current.companies ? ` / ${current.companies}` : ""}</dd></div>
          <div><dt className="text-[11px] text-muted-foreground">People</dt><dd className="font-semibold tabular-nums">{totalPeople}{current.logins ? ` / ${current.logins}` : ""}</dd></div>
          <div><dt className="text-[11px] text-muted-foreground">Workspaces</dt><dd className="font-semibold tabular-nums">{list.reduce((s, i) => s + i.company.workspaces.length, 0)}</dd></div>
        </dl>
      </div>
    </SectionCard>
    <div>
      <h2 className="mb-3 text-sm font-semibold">Plans</h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{PLANS.map((plan) => {
        const here = plan.id === currentPlan;
        const up = rank(plan.id) > rank(currentPlan);
        return <section key={plan.id} className={`flex flex-col rounded-xl border bg-surface p-4 ${here ? "border-accent ring-2 ring-accent/20" : "border-border"}`}>
          <div className="flex items-center justify-between gap-2"><h3 className="text-base font-semibold">{plan.name}</h3>{here && <Badge variant="success">Your plan</Badge>}{plan.id === "growth" && !here && <Badge variant="neutral">Most groups</Badge>}</div>
          <p className="mt-0.5 text-xs text-muted-foreground">{plan.tagline}</p>
          <p className="mt-3 text-2xl font-semibold tabular-nums">{plan.price === null ? "Custom" : plan.price === 0 ? "Free" : `₹${plan.price.toLocaleString("en-IN")}`}{plan.price !== null && plan.price > 0 && <span className="text-xs font-normal text-muted-foreground"> / month + GST</span>}</p>
          <ul className="mt-3 flex flex-1 flex-col gap-1.5 text-[13px]">{plan.features.map((f) => <li key={f} className="flex items-start gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-success" />{f}</li>)}</ul>
          <div className="mt-4">{here ? <Button size="sm" variant="secondary" className="w-full" disabled>Current plan</Button>
            : plan.id === "enterprise" ? <Button size="sm" variant="outline" className="w-full" onClick={() => toast.message("Enterprise is set up with the Janus team.", { description: "Tell us how many companies and people you run." })}>Talk to us</Button>
            : <Button size="sm" variant={up ? "default" : "outline"} className="w-full" onClick={() => setUpgrading(plan)}>{up ? <><ArrowUp className="size-3.5" />Upgrade to {plan.name}</> : <>Move to {plan.name}</>}</Button>}</div>
        </section>;
      })}</div>
    </div>
    <SectionCard title="Billing by company" description="Usage breakdown per company.">
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="py-2 pr-4">Company</th><th className="px-3 py-2">People</th><th className="px-3 py-2">Workspaces</th><th className="px-3 py-2">Status</th></tr></thead>
        <tbody>{list.map((item) => <tr key={item.company.id} className="border-b border-border last:border-0"><td className="py-2.5 pr-4"><div className="flex items-center gap-2"><CompanyLogo company={item.company} size={20} className="rounded" /><span className="font-medium">{item.company.name}</span></div></td><td className="px-3 py-2.5 tabular-nums">{item.hr.people}</td><td className="px-3 py-2.5 tabular-nums">{item.company.workspaces.length}</td><td className="px-3 py-2.5"><Badge variant={item.company.setupDone ? "success" : "warning"}>{item.company.setupDone ? "Active" : "Setup unfinished"}</Badge></td></tr>)}</tbody></table></div>
    </SectionCard>
    {upgrading && <Dialog open onOpenChange={() => setUpgrading(null)}><DialogContent><DialogHeader><DialogTitle>{rank(upgrading.id) > rank(currentPlan) ? "Upgrade" : "Move"} to {upgrading.name}</DialogTitle><DialogDescription>{upgrading.price === null ? "We will get in touch." : upgrading.price === 0 ? "Move to the free plan. Your companies and data stay." : `₹${upgrading.price.toLocaleString("en-IN")}/month + GST. ${upgrading.companies} companies, ${upgrading.logins} people.`}</DialogDescription></DialogHeader>
      <DialogFooter><Button variant="outline" onClick={() => setUpgrading(null)}>Cancel</Button><Button onClick={() => changePlan(upgrading.id)}>{rank(upgrading.id) > rank(currentPlan) ? "Confirm upgrade" : "Confirm change"}</Button></DialogFooter></DialogContent></Dialog>}
  </>;
}

