"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Building2, Check, Plus, Send, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CompanyLogo } from "@/components/shared/company-logo";
import { LogoPicker } from "@/components/shared/logo-picker";
import { SectionCard } from "@/components/settings/section-ui";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { demoMode } from "@/lib/demo-mode";
import { PageHeader } from "@/components/shared/page-header";
import { activeCompanyId, readCompanies, removeCompany, seedCompanies, subscribeCompanies, switchCompany, updateCompany, type CompanyRecord } from "@/lib/company";
import { summarise, type CompanySummary } from "@/lib/group-summary";
import { answerFor, insightsFor, type Answer } from "@/lib/portfolio-insights";
import { lakh } from "@/lib/demo-universe";
import { useLoginAccount } from "@/lib/demo-persona";
import { memoryItems } from "@/lib/mock-data/memory";
import { getCustomerById } from "@/lib/mock-data/customers";

const titles: Record<string, [string, string]> = {
  overview: ["Overview", "Every company you run, at a glance."],
  analytics: ["Analytics", "The same measures for every company, side by side."],
  finance: ["Finance", "What the people and the pipeline cost and bring in, by company."],
  companies: ["Companies", "Set up, switch on workspaces, open or remove a company."],
  intelligence: ["Janus Intelligence", "Ask a question across all your companies."],
  notifications: ["Notifications", "What needs you, from every company."],
  people: ["Portfolio access", "Who else can see the Portfolio. Each company's own people and roles are in its Business Management."],
};
const palette = ["#2563eb", "#d97706", "#16a34a", "#9333ea", "#dc2626"];
const tone = { high: "danger", medium: "warning", low: "neutral" } as const;
const workspaceName = (id: string) => id === "crm-sales" ? "CRM & Sales" : id === "hr-people" ? "HR & People" : id;
const stageLabel: Record<string, string> = { new: "New", qualified: "Qualified", proposal: "Proposal", negotiation: "Negotiation", won: "Won", lost: "Lost" };

function usePortfolio() {
  const registry = React.useSyncExternalStore(subscribeCompanies, () => JSON.stringify(readCompanies()), () => JSON.stringify(seedCompanies));
  const hydrated = React.useSyncExternalStore(() => () => {}, () => true, () => false);
  const summaries = React.useMemo<CompanySummary[]>(() => hydrated ? (JSON.parse(registry) as CompanyRecord[]).map((record) => summarise(record)) : [], [registry, hydrated]);
  return { summaries, hydrated };
}
const open = (id: string, to?: string) => id === activeCompanyId() && to ? window.location.assign(to) : switchCompany(id, to);

export function PortfolioPage() {
  const view = useSearchParams().get("view") ?? "overview";
  const login = useLoginAccount();
  const { summaries, hydrated } = usePortfolio();
  const [title, description] = titles[view] ?? titles.overview;
  // The Portfolio runs on the preview's company records. A live account has none yet.
  if (!demoMode) return <div className="p-8 text-sm text-muted-foreground" role="status">The Portfolio is not available yet for live accounts.</div>;
  if (login && login.hrRole !== "owner") return <div className="p-8 text-sm text-muted-foreground" role="status">The Portfolio is for the Owner and the people they add under Portfolio access.</div>;
  return <div className="mx-auto flex max-w-[1240px] flex-col">
    <PageHeader title={title} description={description} actions={<Button size="sm" asChild><Link href="/setup?new=1"><Plus className="mr-1 size-4" />Add company</Link></Button>} />
    <div className="flex flex-col gap-6 px-6 pb-10">
      {!hydrated ? <p className="text-sm text-muted-foreground" role="status">Loading your companies…</p> : summaries.length === 0 && view !== "people" ? <FirstCompany /> : view === "analytics" ? <Analytics list={summaries} /> : view === "finance" ? <Finance list={summaries} /> : view === "companies" ? <Companies list={summaries} /> : view === "intelligence" ? <Intelligence list={summaries} /> : view === "notifications" ? <Notifications list={summaries} /> : view === "people" ? <People list={summaries} /> : <Overview list={summaries} />}
    </div>
  </div>;
}

function FirstCompany() {
  return <section className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-surface px-6 py-14 text-center">
    <span className="flex size-12 items-center justify-center rounded-xl bg-accent-muted text-accent"><Building2 className="size-5" aria-hidden /></span>
    <div><h2 className="text-lg font-semibold">Create your first company</h2><p className="mt-1 text-sm text-muted-foreground">Add the company, switch on the workspaces it needs and bring in your team. Everything you add later shows up here, across all your companies.</p></div>
    <Button asChild><Link href="/setup?new=1"><Plus className="mr-1 size-4" />Create a company</Link></Button>
  </section>;
}

const Kpi = ({ label, value, detail }: { label: string; value: string; detail: string }) => <div className="rounded-xl border border-border bg-surface p-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;

function Overview({ list }: { list: CompanySummary[] }) {
  const total = { people: list.reduce((s, i) => s + i.hr.people, 0), pipeline: list.reduce((s, i) => s + (i.crm?.pipeline ?? 0), 0), won: list.reduce((s, i) => s + (i.crm?.wonValue ?? 0), 0), waiting: list.reduce((s, i) => s + i.hr.pendingLeave, 0), pay: list.reduce((s, i) => s + i.hr.monthlyPay, 0) };
  const attention = list.flatMap((item) => item.attention.map((entry) => ({ ...entry, company: item.company }))).sort((a, b) => ({ high: 0, medium: 1, low: 2 })[a.severity] - ({ high: 0, medium: 1, low: 2 })[b.severity]);
  const insights = insightsFor(list);
  const remembered = memoryItems.filter((item) => item.status === "approved" && item.kind !== "stable_fact").slice(0, 5);
  const acme = list.find((item) => item.company.id === "acme");
  return <>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
      <Kpi label="Companies" value={String(list.length)} detail="Under your login" />
      <Kpi label="People" value={String(total.people)} detail="Across all companies" />
      <Kpi label="Open pipeline" value={lakh(total.pipeline)} detail="Companies with CRM" />
      <Kpi label="Won so far" value={lakh(total.won)} detail="Closed deals" />
      <Kpi label="Monthly payroll" value={lakh(total.pay)} detail="All companies" />
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
    {acme && remembered.length > 0 && <SectionCard title="What Janus remembers" description={`Approved notes from ${acme.company.name}. Other companies add theirs as they work.`}>
      <ul className="grid gap-3 md:grid-cols-2">{remembered.map((item) => <li key={item.id} className="border border-border bg-surface-2 p-3 text-sm"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{item.label}{getCustomerById(item.customerId) ? ` · ${getCustomerById(item.customerId)!.name}` : ""}</p><p className="mt-1">{item.value}</p></li>)}</ul>
    </SectionCard>}
  </>;
}

function CompanyCards({ list }: { list: CompanySummary[] }) {
  return <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
    {list.map((item) => <section key={item.company.id} aria-label={item.company.name} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3"><CompanyLogo company={item.company} size={36} className="rounded-lg" /><div className="min-w-0"><h3 className="truncate text-sm font-semibold">{item.company.name}</h3><p className="truncate text-xs text-muted-foreground">{item.company.industry} · {item.company.city}</p></div></div>
        <Badge variant={item.company.setupDone ? "neutral" : "warning"}>{item.company.setupDone ? "Active" : "Setup unfinished"}</Badge>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-[11px] text-muted-foreground">People</dt><dd className="font-semibold tabular-nums">{item.hr.people}</dd></div>
        <div><dt className="text-[11px] text-muted-foreground">On leave today</dt><dd className="font-semibold tabular-nums">{item.hr.onLeaveToday}</dd></div>
        {item.crm ? <><div><dt className="text-[11px] text-muted-foreground">Open pipeline</dt><dd className="font-semibold tabular-nums">{lakh(item.crm.pipeline)}</dd></div><div><dt className="text-[11px] text-muted-foreground">Win rate</dt><dd className="font-semibold tabular-nums">{item.crm.winRate}%</dd></div></> : <div className="col-span-2 text-xs text-muted-foreground">CRM & Sales is not switched on.</div>}
      </dl>
      <Button variant="secondary" size="sm" className="self-start" onClick={() => open(item.company.id)}>Open {item.company.name.split(" ")[0]}<ArrowRight className="ml-1 size-4" /></Button>
    </section>)}
  </div>;
}

function Bars({ rows, format }: { rows: { id: string; label: string; value: number; color: string }[]; format: (value: number) => string }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return <ul className="flex flex-col gap-3">{rows.map((row) => <li key={row.id}><div className="mb-1 flex items-center justify-between gap-3 text-sm"><span className="font-medium">{row.label}</span><span className="tabular-nums text-muted-foreground">{format(row.value)}</span></div><div className="h-2.5 bg-surface-2"><div className="h-2.5" style={{ width: `${Math.max(2, (row.value / max) * 100)}%`, background: row.color }} /></div></li>)}</ul>;
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
        <SectionCard title="Open pipeline" description="Value of deals still in play."><Bars format={lakh} rows={crm.map((item) => ({ id: item.company.id, label: item.company.name, value: item.crm!.pipeline, color: colors.get(item.company.id)! }))} /></SectionCard>
        <SectionCard title="Won so far" description="Closed deals by company."><Bars format={lakh} rows={crm.map((item) => ({ id: item.company.id, label: item.company.name, value: item.crm!.wonValue, color: colors.get(item.company.id)! }))} /></SectionCard>
      </div>
      <SectionCard title="Leads captured by month" description="October is the real count so far; earlier months are history.">
        <svg viewBox="0 0 560 200" role="img" aria-label="Leads captured per month for each company" className="h-auto w-full">
          <g stroke="var(--border)" strokeWidth="1"><line x1="40" y1="170" x2="520" y2="170" /><line x1="40" y1="100" x2="520" y2="100" /><line x1="40" y1="30" x2="520" y2="30" /></g>
          {months.map((month, index) => <text key={month} x={x(index)} y="190" textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">{month}</text>)}
          {crm.map((item) => <polyline key={item.company.id} fill="none" stroke={colors.get(item.company.id)} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={item.crm!.monthly.map((m, index) => `${x(index)},${y(m.leads)}`).join(" ")} />)}
        </svg>
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">{crm.map((item) => <span key={item.company.id} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: colors.get(item.company.id) }} />{item.company.name}</span>)}</div>
      </SectionCard>
      <SectionCard title="Pipeline by stage" description="Leads at each stage, with the value of their deals.">
        <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="py-2 pr-4">Stage</th>{crm.map((item) => <th key={item.company.id} className="px-3 py-2">{item.company.name.split(" ")[0]}</th>)}</tr></thead><tbody>{Object.keys(stageLabel).map((stage) => <tr key={stage} className="border-b border-border last:border-0"><td className="py-2.5 pr-4 font-medium">{stageLabel[stage]}</td>{crm.map((item) => { const row = item.crm!.byStage.find((entry) => entry.stage === stage)!; return <td key={item.company.id} className="px-3 py-2.5 tabular-nums">{row.count}{row.value ? <span className="text-muted-foreground"> · {lakh(row.value)}</span> : null}</td>; })}</tr>)}</tbody></table></div>
      </SectionCard>
      <SectionCard title="Where leads come from" description="Leads and how many were won, by channel.">
        <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="py-2 pr-4">Channel</th>{crm.map((item) => <th key={item.company.id} className="px-3 py-2">{item.company.name.split(" ")[0]}</th>)}</tr></thead><tbody>{["whatsapp", "website", "phone_call"].map((source) => <tr key={source} className="border-b border-border last:border-0"><td className="py-2.5 pr-4 font-medium">{source === "phone_call" ? "Phone calls" : source === "whatsapp" ? "WhatsApp" : "Website"}</td>{crm.map((item) => { const row = item.crm!.bySource.find((entry) => entry.source === source)!; return <td key={item.company.id} className="px-3 py-2.5 tabular-nums">{row.count}<span className="text-muted-foreground"> · {row.won} won</span></td>; })}</tr>)}</tbody></table></div>
      </SectionCard>
    </>}
    <SectionCard title="People" description="Headcount and payroll by company."><Bars format={(value) => `${value} people`} rows={list.map((item) => ({ id: item.company.id, label: item.company.name, value: item.hr.people, color: colors.get(item.company.id)! }))} /></SectionCard>
  </>;
}

function Finance({ list }: { list: CompanySummary[] }) {
  const t = { pay: list.reduce((s, i) => s + i.hr.monthlyPay, 0), won: list.reduce((s, i) => s + (i.crm?.wonValue ?? 0), 0), pipe: list.reduce((s, i) => s + (i.crm?.pipeline ?? 0), 0), claims: list.reduce((s, i) => s + i.hr.claimsValue, 0), claimCount: list.reduce((s, i) => s + i.hr.claimsPending, 0) };
  const rows: [string, (item: CompanySummary) => string][] = [["Monthly payroll", (item) => lakh(item.hr.monthlyPay)], ["Payroll per year", (item) => lakh(item.hr.monthlyPay * 12)], ["Won so far", (item) => item.crm ? lakh(item.crm.wonValue) : "—"], ["Open pipeline", (item) => item.crm ? lakh(item.crm.pipeline) : "—"], ["Monthly payroll as % of won", (item) => item.crm && item.crm.wonValue ? `${Math.round((item.hr.monthlyPay / item.crm.wonValue) * 100)}%` : "—"], ["Reimbursements waiting", (item) => item.hr.claimsPending ? `${item.hr.claimsPending} · ₹${item.hr.claimsValue.toLocaleString("en-IN")}` : "None"], ["Finance & Accounting", () => "Not connected"]];
  return <>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Kpi label="Monthly payroll" value={lakh(t.pay)} detail="All companies" />
      <Kpi label="Won so far" value={lakh(t.won)} detail="Closed deals" />
      <Kpi label="Open pipeline" value={lakh(t.pipe)} detail="Still to close" />
      <Kpi label="Reimbursements waiting" value={String(t.claimCount)} detail={`₹${t.claims.toLocaleString("en-IN")} to approve`} />
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
    <div className="grid gap-4 lg:grid-cols-2">
      {list.map((item) => { const company = item.company; return <section key={company.id} aria-label={company.name} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
        <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><CompanyLogo company={company} size={36} className="rounded-lg" /><div className="min-w-0"><h3 className="truncate text-sm font-semibold">{company.name}</h3><p className="text-xs text-muted-foreground">{company.industry} · {company.city} · since {company.createdAt}</p></div></div><Badge variant={company.setupDone ? "success" : "warning"}>{company.setupDone ? "Set up" : "Setup unfinished"}</Badge></div>
        <fieldset className="grid gap-2"><legend className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Workspaces</legend>
          {["crm-sales", "hr-people"].map((id) => { const on = company.workspaces.includes(id); return <label key={id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={on} disabled={on && company.workspaces.length === 1} onChange={() => updateCompany(company.id, { workspaces: on ? company.workspaces.filter((entry) => entry !== id) : [...company.workspaces, id] })} />{workspaceName(id)}</label>; })}
        </fieldset>
        <p className="text-xs text-muted-foreground">{item.hr.people} people{item.crm ? ` · ${item.crm.leads} leads · ${item.crm.openDeals} open deals` : ""}</p>
        <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => open(company.id)}>Open<ArrowRight className="ml-1 size-4" /></Button>{!company.setupDone && <Button size="sm" variant="secondary" asChild><Link href={`/setup?finish=${company.id}`}>Finish setup</Link></Button>}<Button size="sm" variant="outline" onClick={() => setEditing(company)}>Edit details</Button><Button size="sm" variant="ghost" aria-label={`Remove ${company.name}`} onClick={() => setRemoving(company)}><Trash2 className="size-4" /></Button></div>
      </section>; })}
    </div>
    {editing && <EditCompany company={editing} onClose={() => setEditing(null)} />}
    {removing && <RemoveCompany company={removing} onClose={() => setRemoving(null)} />}
  </>;
}

function EditCompany({ company, onClose }: { company: CompanyRecord; onClose: () => void }) {
  const [name, setName] = React.useState(company.name);
  const [industry, setIndustry] = React.useState(company.industry);
  const [city, setCity] = React.useState(company.city);
  const [logo, setLogo] = React.useState<string | undefined>(company.logo);
  const taken = readCompanies().some((item) => item.id !== company.id && item.name.trim().toLowerCase() === name.trim().toLowerCase());
  const error = name.trim().length < 2 ? "Give the company a name." : taken ? `${name.trim()} already exists.` : city.trim().length < 2 ? "Add a city." : "";
  return <Dialog open onOpenChange={(value) => !value && onClose()}><DialogContent><DialogHeader><DialogTitle>Edit {company.name}</DialogTitle><DialogDescription>The name appears in the company menu, reports and letters.</DialogDescription></DialogHeader>
    <div className="grid gap-4"><LogoPicker id={company.id} name={name} value={logo} onChange={setLogo} /><label className="grid gap-1.5 text-xs text-muted-foreground">Name<Input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} /></label><label className="grid gap-1.5 text-xs text-muted-foreground">Industry<Input value={industry} maxLength={60} onChange={(event) => setIndustry(event.target.value)} /></label><label className="grid gap-1.5 text-xs text-muted-foreground">City<Input value={city} maxLength={40} onChange={(event) => setCity(event.target.value)} /></label>{error && <p role="alert" className="text-xs text-danger">{error}</p>}</div>
    <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={Boolean(error)} onClick={() => { updateCompany(company.id, { name: name.trim(), industry: industry.trim(), city: city.trim(), logo }); toast.success("Company updated."); onClose(); }}>Save</Button></DialogFooter></DialogContent></Dialog>;
}

function RemoveCompany({ company, onClose }: { company: CompanyRecord; onClose: () => void }) {
  const [typed, setTyped] = React.useState("");
  return <Dialog open onOpenChange={(value) => !value && onClose()}><DialogContent><DialogHeader><DialogTitle>Remove {company.name}?</DialogTitle><DialogDescription>It disappears from your account and from the Portfolio. Type its name to confirm.</DialogDescription></DialogHeader>
    <Input aria-label="Type the company name" value={typed} onChange={(event) => setTyped(event.target.value)} placeholder={company.name} />
    <DialogFooter><Button variant="outline" onClick={onClose}>Keep it</Button><Button variant="destructive" disabled={typed.trim() !== company.name} onClick={() => { removeCompany(company.id); toast.success(`${company.name} removed.`); onClose(); }}>Remove company</Button></DialogFooter></DialogContent></Dialog>;
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

const readKey = "janus.portfolio-read";
function Notifications({ list }: { list: CompanySummary[] }) {
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
const accessKey = "janus.portfolio-access";
const roles: [string, string][] = [["Co-owner", "Sees everything in the Portfolio and can add companies."], ["Group finance", "Sees Analytics and Finance, not people or notifications."], ["Group analyst", "Sees Overview and Analytics, read only."]];
function People({ list }: { list: CompanySummary[] }) {
  const [people, setPeople] = React.useState<Person[]>(() => { try { return JSON.parse(window.localStorage.getItem(accessKey) ?? "[]"); } catch { return []; } });
  const [adding, setAdding] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", email: "", role: roles[1][0], companies: [] as string[] });
  const save = (next: Person[]) => { setPeople(next); try { window.localStorage.setItem(accessKey, JSON.stringify(next)); } catch { /* private mode */ } };
  const error = !form.name.trim() ? "Enter their name." : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim()) ? "Enter a valid email." : people.some((item) => item.email.toLowerCase() === form.email.trim().toLowerCase()) ? "That person already has access." : "";
  return <>
    <SectionCard title="Who can see the Portfolio" description="You always can. Add people who need the view across companies." action={<Button size="sm" onClick={() => setAdding(true)}><Plus className="mr-1 size-4" />Add person</Button>}>
      <ul className="divide-y divide-border"><li className="flex items-center justify-between gap-3 py-3 first:pt-0"><div><p className="text-sm font-medium">Pankaj Neema</p><p className="text-xs text-muted-foreground">Owner · every company</p></div><Badge variant="success">Owner</Badge></li>
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
