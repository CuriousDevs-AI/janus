"use client";

import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/settings/section-ui";
import { Kpi } from "@/features/portfolio/components/figures";
import { TargetsCard } from "@/features/portfolio/components/targets";
import { WeeklyEmail } from "@/features/portfolio/components/weekly-email";
import { openIn, total, useRoles, winRate } from "@/features/portfolio/lib/companies";
import { change, day, healthName, healthTone, inr, severityName, severityTone } from "@/features/portfolio/lib/format";
import { workFor } from "@/features/portfolio/lib/work";
import type { PortfolioCompany, PortfolioPeriod } from "@/features/portfolio/types";

const n = (value: string | null | undefined) => Number(value ?? 0);
const pct = (now: number, before: number) => before ? `${now >= before ? "+" : ""}${Math.round(((now - before) / before) * 100)}%` : now ? "new" : "—";

/** The first screen: what needs you, what is coming, and how each company stands. Kept short. */
export function Overview({ list, period }: { list: PortfolioCompany[]; owner: boolean; period: PortfolioPeriod }) {
  const { owns } = useRoles();
  const money = list.some((item) => item.books);
  const work = workFor(list);
  const urgent = work.filter((item) => item.priority === "high");
  const sum = (pick: (item: PortfolioCompany) => number) => list.reduce((acc, item) => acc + pick(item), 0);
  const sales = sum((item) => n(item.books?.current.netSales)) - sum((item) => n(item.intercompany?.sales));
  const salesBefore = sum((item) => n(item.books?.previous.netSales));
  const profit = sales - (sum((item) => n(item.books?.current.costs)) - sum((item) => n(item.intercompany?.purchases)));
  const pastDue = sum((item) => n(item.money?.overdue));
  const leads = total(list, "current", (figures) => figures.leads);
  const leadsBefore = total(list, "previous", (figures) => figures.leads);
  const needYou = list.filter((item) => item.health?.status === "red").length;
  const upcoming = list.flatMap((item) => item.compliance.filter((due) => due.status === "upcoming" || due.status === "due_soon").map((due) => ({ ...due, company: item }))).sort((a, b) => a.dueOn.localeCompare(b.dueOn)).slice(0, 8);
  return <>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
      <Kpi label="Companies needing you" value={`${needYou} of ${list.length}`} detail={needYou ? "Marked red below" : "None is red"} />
      {money ? <Kpi label="Sales" value={inr(sales)} detail={`${change(sales, salesBefore)} · before GST`} /> : <Kpi label="Leads in" value={String(leads)} detail={change(leads, leadsBefore)} />}
      {money ? <Kpi label="Profit before salaries" value={inr(profit)} detail="Sales less supplier bills" /> : <Kpi label="Deals won" value={String(total(list, "current", (figures) => figures.wonDeals))} detail={`Worth ${inr(total(list, "current", (figures) => figures.wonValue))}`} />}
      {money ? <Kpi label="Past due from customers" value={inr(pastDue)} detail={pastDue ? "Chase it from the Work inbox" : "Nothing past due"} /> : <Kpi label="Open pipeline" value={inr(sum((item) => n(item.crm.pipelineValue)))} detail={`${sum((item) => item.crm.openDeals)} open deals`} />}
      <Kpi label="To do" value={String(work.length)} detail={urgent.length ? `${urgent.length} urgent` : "Nothing urgent"} />
    </div>

    <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
      <SectionCard title="Needs you first" description="The most urgent things across your companies." action={<a className="text-sm text-accent hover:underline" href="/portfolio?view=work">All {work.length} in the Work inbox</a>}>
        {work.length === 0 ? <p className="text-sm text-muted-foreground">Nothing needs doing in any company.</p> : <ul className="flex flex-col divide-y divide-border">{work.slice(0, 6).map((item) => <li key={item.key} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0">
          <Badge variant={severityTone[item.priority]}>{severityName[item.priority]}</Badge>
          <span className="min-w-0 flex-1 text-sm"><span className="font-medium">{item.company.name}</span> · {item.title}</span>
          {(item.to.startsWith("/portfolio") || owns(item.company)) && <Button size="sm" variant="secondary" onClick={() => item.to.startsWith("/portfolio") ? window.location.assign(item.to) : openIn(item.company, item.to)}>Open</Button>}
        </li>)}</ul>}
      </SectionCard>
      <SectionCard title="Coming up" description="Filings due in the next 30 days." action={<a className="text-sm text-accent hover:underline" href="/portfolio?view=compliance">Compliance</a>}>
        {upcoming.length === 0 ? <p className="text-sm text-muted-foreground">Nothing due in the next 30 days{list.some((item) => item.compliancePlan?.gstFiling !== "none" || item.compliancePlan?.tds) ? "" : ". Set what each company files in Compliance"}.</p>
          : <ul className="flex flex-col gap-2">{upcoming.map((due) => <li key={`${due.company.id}:${due.key}`} className="flex items-baseline justify-between gap-3 text-sm"><span className="min-w-0"><span className="font-medium">{due.label}</span> <span className="text-muted-foreground">· {due.company.name}</span></span><span className={`shrink-0 text-xs tabular-nums ${due.status === "due_soon" ? "text-warning" : "text-muted-foreground"}`}>{day(due.dueOn)}</span></li>)}</ul>}
      </SectionCard>
    </div>

    <SectionCard title="Company by company" description={`${period.label}, against the same days before. Open a name for its page.`}>
      <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="py-2 pr-3">Company</th><th className="px-3 py-2">Health</th>{money ? <><th className="px-3 py-2">Sales</th><th className="px-3 py-2">Profit</th><th className="px-3 py-2">Past due</th></> : <th className="px-3 py-2">Leads in</th>}<th className="px-3 py-2">Pipeline</th><th className="px-3 py-2">Win rate</th><th className="px-3 py-2">Filings</th><th className="py-2 pl-3" /></tr></thead>
        <tbody>{list.map((item) => { const rate = winRate(item); const filings = item.compliance.filter((due) => due.status === "overdue").length; return <tr key={item.id} className="border-b border-border align-top last:border-0">
          <td className="py-2.5 pr-3"><a className="font-medium text-accent hover:underline" href={`/portfolio?view=companies&company=${item.id}`}>{item.name}</a>{item.current && <span className="ml-1 text-xs text-muted-foreground">· open now</span>}</td>
          <td className="px-3 py-2.5">{item.health ? <><Badge variant={healthTone[item.health.status]}>{healthName[item.health.status]}</Badge>{item.health.reasons[0] && <p className="mt-1 max-w-[260px] text-xs text-muted-foreground">{item.health.reasons[0]}{item.health.reasons.length > 1 ? ` (+${item.health.reasons.length - 1})` : ""}</p>}</> : "—"}</td>
          {money ? <>
            <td className="px-3 py-2.5 tabular-nums">{item.books ? <>{inr(n(item.books.current.netSales))} <span className="text-xs text-muted-foreground">{pct(n(item.books.current.netSales), n(item.books.previous.netSales))}</span></> : "—"}</td>
            <td className="px-3 py-2.5 tabular-nums">{item.books ? inr(n(item.books.current.profitBeforePayroll)) : "—"}</td>
            <td className={`px-3 py-2.5 tabular-nums ${n(item.money?.overdue) ? "text-danger" : ""}`}>{item.money ? inr(n(item.money.overdue)) : "—"}</td>
          </> : <td className="px-3 py-2.5 tabular-nums">{item.period.current.leads} <span className="text-xs text-muted-foreground">{pct(item.period.current.leads, item.period.previous.leads)}</span></td>}
          <td className="px-3 py-2.5 tabular-nums">{inr(n(item.crm.pipelineValue))}</td>
          <td className="px-3 py-2.5 tabular-nums">{rate === null ? "—" : `${rate}%`}</td>
          <td className={`px-3 py-2.5 ${filings ? "text-danger" : "text-muted-foreground"}`}>{filings ? `${filings} past due` : "Up to date"}</td>
          <td className="py-2.5 pl-3 text-right">{owns(item) && <Button size="sm" variant="ghost" className="print:hidden" onClick={() => openIn(item)}>Open<ArrowRight className="ml-1 size-3.5" /></Button>}</td>
        </tr>; })}</tbody>
      </table></div>
    </SectionCard>
    <TargetsCard list={list} period={period} />
    <WeeklyEmail />
  </>;
}
