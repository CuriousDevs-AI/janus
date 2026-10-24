"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Building2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/settings/section-ui";
import { activeCompanyId, readCompanies, subscribeCompanies, switchCompany, seedCompanies } from "@/lib/company";
import { summarise, type AttentionItem, type CompanySummary } from "@/lib/group-summary";
import { lakh } from "@/lib/demo-universe";

const rank = { high: 0, medium: 1, low: 2 } as const;
const tone = { high: "danger", medium: "warning", low: "neutral" } as const;
const money = (value: number) => lakh(value);

/** Every company the Owner runs, side by side. Each company's numbers are read from its own records and never mixed. */
export function GroupDashboard() {
  const registry = React.useSyncExternalStore(subscribeCompanies, () => JSON.stringify(readCompanies()), () => JSON.stringify(seedCompanies));
  const summaries = React.useMemo<CompanySummary[]>(() => (JSON.parse(registry) as ReturnType<typeof readCompanies>).map((record) => summarise(record)), [registry]);
  const hydrated = React.useSyncExternalStore(() => () => {}, () => true, () => false);
  if (!hydrated) return <div className="p-6 text-sm text-muted-foreground" role="status">Loading your companies…</div>;
  const total = {
    companies: summaries.length,
    people: summaries.reduce((sum, item) => sum + item.hr.people, 0),
    pipeline: summaries.reduce((sum, item) => sum + (item.crm?.pipeline ?? 0), 0),
    waiting: summaries.reduce((sum, item) => sum + item.hr.pendingLeave, 0),
  };
  const attention = summaries.flatMap((item) => item.attention.map((entry) => ({ ...entry, company: item.company }))).sort((a, b) => rank[a.severity] - rank[b.severity]);
  const open = (id: string, to?: string) => id === activeCompanyId() && to ? window.location.assign(to) : switchCompany(id, to);

  return <div className="mt-3 flex flex-col gap-6 rounded-xl bg-[#faf9f5] p-1 sm:mt-4 sm:p-2">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <div className="flex flex-wrap items-center gap-2"><p className="text-[11px] font-semibold uppercase tracking-wide text-accent">Owner only</p><Badge variant="neutral">{total.companies} companies</Badge></div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">All companies</h2>
        <p className="mt-1 text-sm text-muted-foreground">The highlights of every company you run, in one place. Open a company to manage it.</p>
      </div>
      <Button size="sm" asChild><Link href="/setup?new=1"><Plus className="mr-1 size-4" />Add a company</Link></Button>
    </div>

    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {[["Companies", String(total.companies), "Under your login"], ["People", String(total.people), "Across all companies"], ["Open pipeline", money(total.pipeline), "Companies with CRM"], ["Leave waiting", String(total.waiting), "Requests to decide"]].map(([label, value, detail]) => <div key={label} className="rounded-xl border border-[#e4e4df] bg-white p-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>)}
    </div>

    <SectionCard title="Needs your attention" description="From every company, most urgent first.">
      {attention.length === 0 ? <p className="text-sm text-muted-foreground">Nothing is waiting on you in any company.</p> : <ul className="flex flex-col divide-y divide-border">{attention.map((item: AttentionItem & { company: CompanySummary["company"] }, index) => <li key={`${item.company.id}-${index}`} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"><Badge variant={tone[item.severity]}>{item.severity === "high" ? "High" : item.severity === "medium" ? "Medium" : "Low"}</Badge><span className="min-w-0 flex-1 text-sm"><span className="font-medium">{item.company.name}</span> · {item.text}</span><Button size="sm" variant="secondary" onClick={() => open(item.company.id, item.to)}>Open</Button></li>)}</ul>}
    </SectionCard>

    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {summaries.map((item) => <section key={item.company.id} aria-label={item.company.name} className="flex flex-col gap-4 rounded-xl border border-[#e4e4df] bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-muted text-accent"><Building2 className="size-4" aria-hidden /></span><div className="min-w-0"><h3 className="truncate text-sm font-semibold">{item.company.name}</h3><p className="truncate text-xs text-muted-foreground">{item.company.industry} · {item.company.city}</p></div></div>
          {item.company.id === activeCompanyId() ? <Badge variant="success">Open now</Badge> : <Badge variant={item.company.setupDone ? "neutral" : "warning"}>{item.company.setupDone ? "Active" : "Setup unfinished"}</Badge>}
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-[11px] text-muted-foreground">People</dt><dd className="font-semibold tabular-nums">{item.hr.people}</dd></div>
          <div><dt className="text-[11px] text-muted-foreground">On leave today</dt><dd className="font-semibold tabular-nums">{item.hr.onLeaveToday}</dd></div>
          <div><dt className="text-[11px] text-muted-foreground">Monthly payroll</dt><dd className="font-semibold tabular-nums">{money(item.hr.monthlyPay)}</dd></div>
          <div><dt className="text-[11px] text-muted-foreground">Leave waiting</dt><dd className="font-semibold tabular-nums">{item.hr.pendingLeave}</dd></div>
          {item.crm ? <>
            <div><dt className="text-[11px] text-muted-foreground">Open pipeline</dt><dd className="font-semibold tabular-nums">{money(item.crm.pipeline)}</dd></div>
            <div><dt className="text-[11px] text-muted-foreground">Open deals · leads</dt><dd className="font-semibold tabular-nums">{item.crm.openDeals} · {item.crm.leads}</dd></div>
            <div><dt className="text-[11px] text-muted-foreground">Won so far</dt><dd className="font-semibold tabular-nums">{money(item.crm.wonValue)}</dd></div>
            <div><dt className="text-[11px] text-muted-foreground">Win rate</dt><dd className="font-semibold tabular-nums">{item.crm.winRate}%</dd></div>
          </> : <div className="col-span-2 text-xs text-muted-foreground">CRM & Sales is not switched on for this company.</div>}
        </dl>
        <div className="flex flex-wrap gap-1.5">{item.company.workspaces.map((id) => <Badge key={id} variant="neutral">{id === "crm-sales" ? "CRM & Sales" : id === "hr-people" ? "HR & People" : id}</Badge>)}</div>
        <Button variant="secondary" size="sm" className="self-start" onClick={() => open(item.company.id)}>Open company<ArrowRight className="ml-1 size-4" /></Button>
      </section>)}
    </div>

    <SectionCard title="Side by side" description="The same measures for every company.">
      <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="py-2 pr-4">Measure</th>{summaries.map((item) => <th key={item.company.id} className="px-3 py-2">{item.company.name.split(" ")[0]}</th>)}</tr></thead><tbody>
        {[["People", (item: CompanySummary) => String(item.hr.people)], ["Departments", (item: CompanySummary) => String(item.hr.departments)], ["Monthly payroll", (item: CompanySummary) => money(item.hr.monthlyPay)], ["Open pipeline", (item: CompanySummary) => item.crm ? money(item.crm.pipeline) : "—"], ["Won so far", (item: CompanySummary) => item.crm ? money(item.crm.wonValue) : "—"], ["Win rate", (item: CompanySummary) => item.crm ? `${item.crm.winRate}%` : "—"], ["Pipeline per person", (item: CompanySummary) => item.crm ? money(item.crm.pipeline / Math.max(1, item.hr.people)) : "—"]].map(([label, fn]) => <tr key={label as string} className="border-b border-border last:border-0"><td className="py-2.5 pr-4 font-medium">{label as string}</td>{summaries.map((item) => <td key={item.company.id} className="px-3 py-2.5 tabular-nums">{(fn as (item: CompanySummary) => string)(item)}</td>)}</tr>)}
      </tbody></table></div>
    </SectionCard>
  </div>;
}
