"use client";

import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/settings/section-ui";
import { ApprovalsCard, AttentionList } from "@/features/portfolio/components/attention";
import { Kpi } from "@/features/portfolio/components/figures";
import { TargetsCard } from "@/features/portfolio/components/targets";
import { WeeklyEmail } from "@/features/portfolio/components/weekly-email";
import { openIn, total, useRoles, winRate } from "@/features/portfolio/lib/companies";
import { change, healthName, healthTone, inr } from "@/features/portfolio/lib/format";
import type { PortfolioCompany, PortfolioPeriod, PortfolioPeriodFigures } from "@/features/portfolio/types";

export function Overview({ list, owner, period }: { list: PortfolioCompany[]; owner: boolean; period: PortfolioPeriod }) {
  const { owns } = useRoles();
  const sum = (pick: (item: PortfolioCompany) => number) => list.reduce((total, item) => total + pick(item), 0);
  return <>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
      <Kpi label="Companies" value={String(list.length)} detail={owner ? "Owned or shared with you" : "Shared with you"} />
      <Kpi label="Members" value={String(sum((item) => item.members))} detail="Active logins, all companies" />
      <Kpi label="Open pipeline" value={inr(sum((item) => Number(item.crm.pipelineValue)))} detail={`${sum((item) => item.crm.openDeals)} open deals`} />
      <Kpi label="Won so far" value={inr(sum((item) => Number(item.crm.wonValue)))} detail={`${sum((item) => item.crm.wonDeals)} deals won`} />
      <Kpi label="Open tickets" value={String(sum((item) => item.openTickets))} detail="Support, all companies" />
    </div>
    <PeriodKpis list={list} />
    <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
      <SectionCard title="Needs your attention" description="From every company, most urgent first. Open one to deal with it.">
        <AttentionList list={list} limit={6} />
        {list.reduce((sum, item) => sum + item.attention.length, 0) > 6 && <a className="mt-3 inline-block text-sm text-accent hover:underline" href="/portfolio?view=notifications">See all in Notifications</a>}
      </SectionCard>
      <ApprovalsCard list={list} />
    </div>
    <TargetsCard list={list} period={period} />
    <WeeklyEmail />
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {list.map((item) => { const rate = winRate(item); return <section key={item.id} aria-label={item.name} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-sm font-semibold">{item.name}</h3><p className="truncate text-xs text-muted-foreground">{item.industry || "Industry not set"} · since {item.createdAt}</p></div><div className="flex shrink-0 gap-1">{item.current && <Badge variant="neutral">Open now</Badge>}{item.health && <Badge variant={healthTone[item.health.status]} title={item.health.reasons.join("\n") || "Nothing needs attention"}>{healthName[item.health.status]}</Badge>}</div></div>
        {item.health && item.health.reasons.length > 0 && <p className="text-xs text-muted-foreground">{item.health.reasons[0]}{item.health.reasons.length > 1 ? `, and ${item.health.reasons.length - 1} more` : ""}</p>}
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-[11px] text-muted-foreground">Leads</dt><dd className="font-semibold tabular-nums">{item.crm.leads}</dd></div>
          <div><dt className="text-[11px] text-muted-foreground">Open pipeline</dt><dd className="font-semibold tabular-nums">{inr(Number(item.crm.pipelineValue))}</dd></div>
          <div><dt className="text-[11px] text-muted-foreground">Win rate</dt><dd className="font-semibold tabular-nums">{rate === null ? "—" : `${rate}%`}</dd></div>
          <div><dt className="text-[11px] text-muted-foreground">Open tickets</dt><dd className="font-semibold tabular-nums">{item.openTickets}</dd></div>
          <div><dt className="text-[11px] text-muted-foreground">People</dt><dd className="font-semibold tabular-nums">{item.people?.headcount ?? 0}</dd></div>
          <div><dt className="text-[11px] text-muted-foreground">Late projects</dt><dd className="font-semibold tabular-nums">{item.delivery?.lateProjects ?? 0}</dd></div>
        </dl>
        {owns(item) && <Button variant="secondary" size="sm" className="self-start print:hidden" onClick={() => openIn(item)}>Open {item.name.split(" ")[0]}<ArrowRight className="ml-1 size-4" /></Button>}
      </section>; })}
    </div>
  </>;
}

/** What came in during the period, with the change on the same days of the period before. */
function PeriodKpis({ list }: { list: PortfolioCompany[] }) {
  const money = list.some((item) => item.period.current.invoiced !== null);
  const kpi = (label: string, pick: (figures: PortfolioPeriodFigures) => number | string | null, format: (value: number) => string) => {
    const current = total(list, "current", pick);
    const previous = total(list, "previous", pick);
    return <Kpi key={label} label={label} value={format(current)} detail={`${change(current, previous)} (${format(previous)})`} />;
  };
  return <div className={`grid grid-cols-2 gap-3 ${money ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
    {kpi("Leads in", (figures) => figures.leads, String)}
    {kpi("Deals won", (figures) => figures.wonDeals, String)}
    {kpi("Won value", (figures) => figures.wonValue, inr)}
    {money && kpi("Collected", (figures) => figures.collected, inr)}
  </div>;
}
