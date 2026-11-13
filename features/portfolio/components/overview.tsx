"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/settings/section-ui";
import { Kpi } from "@/features/portfolio/components/figures";
import { Delta, TickerRow } from "@/features/portfolio/components/market";
import { TargetsCard } from "@/features/portfolio/components/targets";
import { WeeklyEmail } from "@/features/portfolio/components/weekly-email";
import { businessName, sells } from "@/features/portfolio/lib/business";
import { groupBooks, groupProfitAfterSalaries, openIn, outsideSales, payrollFor, total, useRoles, winRate, winRateText } from "@/features/portfolio/lib/companies";
import { change, day, healthName, healthTone, inr, severityName, severityTone } from "@/features/portfolio/lib/format";
import { workFor } from "@/features/portfolio/lib/work";
import type { PortfolioCompany, PortfolioPeriod } from "@/features/portfolio/types";
import { fromWork, NotificationDetail, type NoticeItem } from "@/features/portfolio/components/notification-detail";

const n = (value: string | null | undefined) => Number(value ?? 0);
const pct = (now: number, before: number) => before ? `${now >= before ? "+" : ""}${Math.round(((now - before) / before) * 100)}%` : now ? "new" : "—";

/** The first screen: what needs you, what is coming, and how each company stands. Kept short. */
export function Overview({ list, period }: { list: PortfolioCompany[]; owner: boolean; period: PortfolioPeriod }) {
  const [shown, setShown] = React.useState<NoticeItem | null>(null);
  const money = list.some((item) => item.books);
  const work = workFor(list);
  const urgent = work.filter((item) => item.priority === "high");
  const sum = (pick: (item: PortfolioCompany) => number) => list.reduce((acc, item) => acc + pick(item), 0);
  const group = groupBooks(list, "current");
  const groupBefore = groupBooks(list, "previous");
  const sales = group.sales;
  const profit = group.profit;
  const after = groupProfitAfterSalaries(list, period);
  const pastDue = sum((item) => n(item.money?.overdue));
  const leads = total(list, "current", (figures) => figures.leads);
  const leadsBefore = total(list, "previous", (figures) => figures.leads);
  const needYou = list.filter((item) => item.health?.status === "red").length;
  // A tile opens the page behind its figure, in the same period.
  const to = (view: string, extra = "") => `/portfolio?view=${view}${period.key === "month" ? "" : `&period=${period.key}`}${extra}`;
  const upcoming = list.flatMap((item) => item.compliance.filter((due) => due.status === "upcoming" || due.status === "due_soon").map((due) => ({ ...due, company: item }))).sort((a, b) => a.dueOn.localeCompare(b.dueOn)).slice(0, 8);
  return <>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
      <Kpi label="Companies needing you" value={`${needYou} of ${list.length}`} detail={needYou ? "Open to see which, and why" : "None is red"} href={to("companies", needYou ? "&health=red" : "")} />
      {money ? <Kpi label="Sales" value={inr(sales)} detail={`${change(sales, groupBefore.sales)} · group, before GST`} delta={<Delta now={sales} before={groupBefore.sales} compact />} href={to("finance")} /> : <Kpi label="Leads in" value={String(leads)} detail={change(leads, leadsBefore)} delta={<Delta now={leads} before={leadsBefore} format={String} compact />} href={to("analytics")} />}
      {money ? <Kpi label={after.salaries ? "Profit after salaries" : "Profit before salaries"} value={inr(after.salaries ? after.profit : profit)} detail={after.salaries ? `Estimate · ${inr(profit)} before ${inr(after.salaries)} of salaries${after.unknown ? `; salaries unknown for ${after.unknown}` : ""}` : "Salaries not on record: add employees in HR"} href={to("finance")} /> : <Kpi label="Deals won" value={String(total(list, "current", (figures) => figures.wonDeals))} detail={`Worth ${inr(total(list, "current", (figures) => figures.wonValue))}`} />}
      {money ? <Kpi label="Past due from customers" value={inr(pastDue)} detail={pastDue ? "Open to chase it in the Work inbox" : "Nothing past due"} tone={pastDue ? "danger" : undefined} href={to("work", pastDue ? "&kind=collect" : "")} /> : <Kpi label="Open pipeline" value={inr(sum((item) => n(item.crm.pipelineValue)))} detail={`${sum((item) => item.crm.openDeals)} open deals`} />}
      <Kpi label="To do" value={String(work.length)} detail={urgent.length ? `${urgent.length} urgent: open them` : "Nothing urgent"} href={to("work", urgent.length ? "&filter=urgent" : "")} />
    </div>

    {!money && <p className="text-xs text-muted-foreground">Sales, profit and money owed come from each company&apos;s books, which your role does not see, so leads, deals and pipeline are shown instead. Ask the Owner for a role with money if you need them.</p>}
    <TickerRow list={list} money={money} />

    <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
      <SectionCard title="Needs you first" description="The most urgent things across your companies." action={<a className="text-sm text-accent hover:underline" href="/portfolio?view=work">All {work.length} in the Work inbox</a>}>
        {work.length === 0 ? <p className="text-sm text-muted-foreground">Nothing needs doing in any company.</p> : <ul className="flex flex-col divide-y divide-border">{work.slice(0, 6).map((item) => <li key={item.key} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0">
          <Badge variant={severityTone[item.priority]}>{severityName[item.priority]}</Badge>
          <span className="min-w-0 flex-1 text-sm"><span className="font-medium">{item.company.name}</span> · {item.title}</span>
          <Button size="sm" variant="secondary" onClick={() => setShown(fromWork(item))}>Open</Button>
        </li>)}</ul>}
      </SectionCard>
      <SectionCard title="Coming up" description="Filings due in the next 30 days." action={<a className="text-sm text-accent hover:underline" href="/portfolio?view=compliance">Compliance</a>}>
        {upcoming.length === 0 ? <p className="text-sm text-muted-foreground">Nothing due in the next 30 days{list.some((item) => !item.complianceSetUp) ? <>, but <span className="text-warning">{list.filter((item) => !item.complianceSetUp).length} of {list.length} companies track no filings</span>: set them up in Compliance</> : ""}.</p>
          : <ul className="flex flex-col gap-2">{upcoming.map((due) => <li key={`${due.company.id}:${due.key}`} className="flex items-baseline justify-between gap-3 text-sm"><span className="min-w-0"><span className="font-medium">{due.label}</span> <span className="text-muted-foreground">· {due.company.name}</span></span><span className={`shrink-0 text-xs tabular-nums ${due.status === "due_soon" ? "text-warning" : "text-muted-foreground"}`}>{day(due.dueOn)}</span></li>)}</ul>}
      </SectionCard>
    </div>

    <SectionCard title="Company by company" description={`${period.label}, against the same days before. Open a name for its page.${money && (group.internalSales || group.internalBills) ? ` Each row is as the company recorded it, so sales and profit here add up to more than the group figures above: ${inr(group.internalSales)} of sales${group.internalBills ? ` and ${inr(group.internalBills)} of bills` : ""} between your companies ${group.internalSales > group.internalBills ? `take ${inr(group.internalSales - group.internalBills)} off group profit` : group.internalSales < group.internalBills ? `add ${inr(group.internalBills - group.internalSales)} to group profit` : "cancel out in group profit"}. Finance shows the working.` : ""}`}>
      <CompanyRows list={list} money={money} period={period} />
    </SectionCard>
    <TargetsCard list={list} period={period} />
    <WeeklyEmail />
    {shown && <NotificationDetail item={shown} read={false} onClose={() => setShown(null)} />}
  </>;
}

type RowKey = "name" | "health" | "sales" | "profit" | "pastDue" | "leads" | "pipeline" | "win" | "filings";
const healthRank = { red: 0, amber: 1, green: 2 } as const;

/** The company table: click a heading to sort by it (again to reverse), click a row to open the company. */
function CompanyRows({ list, money, period }: { list: PortfolioCompany[]; money: boolean; period: PortfolioPeriod }) {
  const router = useRouter();
  const { owns } = useRoles();
  const [sort, setSort] = React.useState<{ key: RowKey; up: boolean }>({ key: "health", up: true });
  const profitOf = (item: PortfolioCompany) => { if (!item.books) return -Infinity; const pay = payrollFor(item, period); return n(item.books.current.profitBeforePayroll) - (pay ?? 0); };
  const value: Record<RowKey, (item: PortfolioCompany) => number | string> = {
    name: (item) => item.name.toLowerCase(),
    health: (item) => healthRank[item.health?.status ?? "green"],
    sales: (item) => n(item.books?.current.netSales),
    profit: profitOf,
    pastDue: (item) => n(item.money?.overdue),
    leads: (item) => item.period.current.leads,
    pipeline: (item) => n(item.crm.pipelineValue),
    win: (item) => winRate(item) ?? -1,
    filings: (item) => item.compliance.filter((due) => due.status === "overdue").length,
  };
  // Text and "worst first" columns start low to high; money starts high to low.
  const startsUp = (key: RowKey) => key === "name" || key === "health";
  const rows = [...list].sort((a, b) => { const x = value[sort.key](a), y = value[sort.key](b); const order = x < y ? -1 : x > y ? 1 : a.name.localeCompare(b.name); return sort.up ? order : -order; });
  const choose = (key: RowKey) => setSort((now) => now.key === key ? { key, up: !now.up } : { key, up: startsUp(key) });
  const open = (item: PortfolioCompany) => router.push(`/portfolio?view=companies&company=${item.id}`);
  const head = (key: RowKey, label: string, first = false) => <th className={first ? "py-2 pr-3" : "px-3 py-2"} aria-sort={sort.key === key ? (sort.up ? "ascending" : "descending") : "none"}>
    <button type="button" onClick={() => choose(key)} className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground ${sort.key === key ? "text-foreground" : ""}`}>{label}{sort.key === key && (sort.up ? <ArrowUp aria-hidden className="size-3" /> : <ArrowDown aria-hidden className="size-3" />)}</button>
  </th>;
  return <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm">
    <thead className="border-b border-border text-[11px] text-muted-foreground"><tr>{head("name", "Company", true)}{head("health", "Health")}{money ? <>{head("sales", "Sales")}{head("profit", "Profit")}{head("pastDue", "Past due")}</> : head("leads", "Leads in")}{head("pipeline", "Pipeline")}{head("win", "Win rate")}{head("filings", "Filings")}<th className="py-2 pl-3"><span className="sr-only">Open</span></th></tr></thead>
    <tbody>{rows.map((item) => { const filings = item.compliance.filter((due) => due.status === "overdue").length; return <tr key={item.id} onClick={(event) => { if (!(event.target as HTMLElement).closest("a,button")) open(item); }} className="cursor-pointer border-b border-border align-top transition-colors last:border-0 hover:bg-surface-2">
      <td className="py-2.5 pr-3"><a className="font-medium text-accent hover:underline" href={`/portfolio?view=companies&company=${item.id}`}>{item.name}</a>{item.current && <span className="ml-1 text-xs text-muted-foreground">· open now</span>}</td>
      <td className="px-3 py-2.5">{item.health ? <><Badge variant={healthTone[item.health.status]} title={item.health.reasons.join("\n") || undefined}>{healthName[item.health.status]}</Badge>{item.health.reasons[0] && <p className="mt-1 max-w-[260px] text-xs text-muted-foreground">{item.health.reasons[0]}{item.health.reasons.length > 1 ? ` (+${item.health.reasons.length - 1})` : ""}</p>}</> : "—"}</td>
      {money ? <>
        <td className="px-3 py-2.5 tabular-nums">{!sells(item) ? <span className="text-xs text-muted-foreground">No sales · {businessName(item).toLowerCase()}</span> : item.books ? <>{inr(n(item.books.current.netSales))} <span className="text-xs text-muted-foreground" title="Change in sales to customers outside the group">{pct(outsideSales(item, "current"), outsideSales(item, "previous"))}</span>{n(item.intercompany?.sales) > 0 && <p className="text-[11px] text-muted-foreground">{inr(n(item.intercompany?.sales))} to your own companies</p>}</> : "—"}</td>
        <td className="px-3 py-2.5 tabular-nums">{item.books ? (() => { const pay = payrollFor(item, period); const before = n(item.books.current.profitBeforePayroll); return pay === null ? <>{inr(before)}<p className="text-[11px] text-muted-foreground">before salaries</p></> : <span className={before - pay < 0 ? "text-danger" : ""}>{inr(before - pay)}<p className="text-[11px] text-muted-foreground">after salaries, est.</p></span>; })() : "—"}</td>
        <td className={`px-3 py-2.5 tabular-nums ${n(item.money?.overdue) ? "text-danger" : ""}`}>{item.money ? inr(n(item.money.overdue)) : "—"}</td>
      </> : <td className="px-3 py-2.5 tabular-nums">{item.period.current.leads} <span className="text-xs text-muted-foreground">{pct(item.period.current.leads, item.period.previous.leads)}</span></td>}
      <td className="px-3 py-2.5 tabular-nums">{inr(n(item.crm.pipelineValue))}</td>
      <td className="px-3 py-2.5 tabular-nums">{winRateText(item)}</td>
      <td className={`px-3 py-2.5 ${filings ? "text-danger" : "text-muted-foreground"}`}>{filings ? `${filings} past due` : item.complianceSetUp ? "Up to date" : <span className="text-warning">Not set up</span>}</td>
      <td className="py-2.5 pl-3 text-right">{owns(item) && <Button size="sm" variant="ghost" className="print:hidden" onClick={() => openIn(item)}>Open<ArrowRight className="ml-1 size-3.5" /></Button>}</td>
    </tr>; })}</tbody>
  </table></div>;
}
