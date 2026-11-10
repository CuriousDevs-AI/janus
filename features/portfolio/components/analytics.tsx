"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/settings/section-ui";
import { useApi } from "@/lib/api/use-api";
import { Kpi, palette } from "@/features/portfolio/components/figures";
import { CustomersKept } from "@/features/portfolio/components/customers-kept";
import { LastYear } from "@/features/portfolio/components/last-year";
import { Delta, GroupLine, SalesHeatmap } from "@/features/portfolio/components/market";
import { groupBooks, RATE_MINIMUM, total, winRate, winRateText } from "@/features/portfolio/lib/companies";
import { change, healthName, inr } from "@/features/portfolio/lib/format";
import type { PortfolioCompany, PortfolioPeriod, PortfolioTrends } from "@/features/portfolio/types";

const n = (value: string | number | null | undefined) => Number(value ?? 0);
const percent = (part: number, whole: number) => whole ? Math.round((part / whole) * 100) : null;
const axis = { fontSize: 11, fill: "var(--muted-foreground)" };
const tooltipStyle = { contentStyle: { borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }, labelStyle: { fontWeight: 600 } };
/** Short rupees for an axis: ₹4.2L, ₹1.3Cr, ₹12K. */
const axisInr = (value: number) => Math.abs(value) >= 1e7 ? `₹${(value / 1e7).toFixed(1)}Cr` : Math.abs(value) >= 1e5 ? `₹${(value / 1e5).toFixed(1)}L` : Math.abs(value) >= 1e3 ? `₹${Math.round(value / 1e3)}K` : `₹${value}`;
const sourceName = (source: string) => ({ webhook: "Website and forms", whatsapp: "WhatsApp", csv: "Imported file", manual: "Added by hand", api: "API", phone_call: "Phone calls", embed: "Website form" } as Record<string, string>)[source] ?? source.replace(/_/g, " ");

/** Comparison and trends across the companies: how each is moving, against the others and itself. */
export function Analytics({ list, period }: { list: PortfolioCompany[]; period: PortfolioPeriod }) {
  const router = useRouter();
  const [months, setMonths] = React.useState(6);
  const trends = useApi<PortfolioTrends>(`/portfolio/trends?months=${months}`);
  const money = list.some((item) => item.books);
  // A company keeps its colour by its place in the Portfolio.
  const color = new Map(list.map((item, index) => [item.id, palette[index % palette.length]]));
  // The group's figures, as on the Overview and Finance: sales between the companies taken out.
  const group = groupBooks(list, "current");
  const salesNow = group.sales;
  const salesBefore = groupBooks(list, "previous").sales;
  const profit = group.profit;
  const leads = total(list, "current", (figures) => figures.leads);
  const leadsBefore = total(list, "previous", (figures) => figures.leads);
  const won = total(list, "current", (figures) => figures.wonDeals);
  const wonValue = total(list, "current", (figures) => figures.wonValue);
  const wonBefore = total(list, "previous", (figures) => figures.wonValue);
  const collected = total(list, "current", (figures) => figures.collected);
  const collectedBefore = total(list, "previous", (figures) => figures.collected);
  return <>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
      {money && <Kpi label="Sales" value={inr(salesNow)} detail={`${change(salesNow, salesBefore)} · group, before GST`} delta={<Delta now={salesNow} before={salesBefore} compact />} />}
      {money && <Kpi label="Margin" value={salesNow ? `${percent(profit, salesNow)}%` : "—"} detail={`${inr(profit)} profit before salaries`} />}
      <Kpi label="Leads in" value={String(leads)} detail={change(leads, leadsBefore)} delta={<Delta now={leads} before={leadsBefore} format={String} compact />} />
      <Kpi label="Lead to win" value={leads ? `${percent(won, leads)}%` : "—"} detail={`Deals won this period ÷ leads that came in: ${won} of ${leads}`} />
      <Kpi label="Average deal" value={won ? inr(wonValue / won) : "—"} detail={`${inr(wonValue)} won · ${change(wonValue, wonBefore)}`} />
      {money && <Kpi label="Collected" value={inr(collected)} detail={change(collected, collectedBefore)} delta={<Delta now={collected} before={collectedBefore} compact />} />}
    </div>

    <Leaders list={list} money={money} />

    <div className="grid gap-4 xl:grid-cols-[1fr_auto]">
      <GroupLine money={money} onOpen={(id) => router.push(`/portfolio?view=companies&company=${id}`)} />
      <SalesHeatmap money={money} />
    </div>

    {money && <LastYear list={list} />}
    {money && <CustomersKept list={list} />}

    <div className="flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold">Month by month</h2>
      <div role="group" aria-label="How many months" className="flex gap-1">{[6, 12].map((value) => <Button key={value} size="sm" variant={months === value ? "default" : "outline"} aria-pressed={months === value} onClick={() => setMonths(value)}>{value} months</Button>)}</div>
    </div>
    {trends.loading ? <p className="text-sm text-muted-foreground" role="status">Loading the months…</p>
      : trends.error ? <div role="alert" className="flex items-center gap-3 text-sm text-danger">{trends.error}<Button size="sm" variant="secondary" onClick={trends.reload}>Try again</Button></div>
      : trends.data && <Trends data={trends.data} money={money} color={color} onOpen={(id) => router.push(`/portfolio?view=companies&company=${id}`)} />}

    <div className="grid gap-4 lg:grid-cols-2">
      {money && <Share list={list} color={color} period={period} />}
      <Conversion list={list} color={color} />
    </div>
    <Channels list={list} />
    <Details list={list} />
  </>;
}

/** Who leads on each measure this period, so the standouts are visible without reading tables. */
function Leaders({ list, money }: { list: PortfolioCompany[]; money: boolean }) {
  if (list.length < 2) return null;
  const best = (pick: (item: PortfolioCompany) => number | null, format: (value: number) => string, low = false) => {
    const scored = list.map((item) => ({ item, value: pick(item) })).filter((entry): entry is { item: PortfolioCompany; value: number } => entry.value !== null && Number.isFinite(entry.value));
    if (!scored.length) return null;
    const top = scored.sort((a, b) => low ? a.value - b.value : b.value - a.value)[0];
    return { name: top.item.name, value: format(top.value) };
  };
  const growth = (item: PortfolioCompany) => { const now = money ? n(item.books?.current.netSales) : item.period.current.leads; const before = money ? n(item.books?.previous.netSales) : item.period.previous.leads; return before ? ((now - before) / before) * 100 : null; };
  const scoredGrowth = list.map(growth).filter((value): value is number => value !== null);
  const cards: [string, { name: string; value: string } | null][] = [
    // When every company fell, the leader fell least: never call a fall growth.
    [scoredGrowth.length && scoredGrowth.every((value) => value < 0) ? "Falling least" : "Growing fastest", best(growth, (value) => `${value >= 0 ? "+" : ""}${Math.round(value)}% ${money ? "sales" : "leads"}`)],
    ["Biggest pipeline", best((item) => n(item.crm.pipelineValue) || null, inr)],
    [`Best win rate (${RATE_MINIMUM}+ closed deals)`, best((item) => item.crm.wonDeals + item.crm.lostDeals >= RATE_MINIMUM ? winRate(item) : null, (value) => `${value}%`)],
    money ? ["Best margin", best((item) => n(item.books?.current.netSales) ? percent(n(item.books?.current.profitBeforePayroll), n(item.books?.current.netSales)) : null, (value) => `${value}%`)] : ["Most leads", best((item) => item.period.current.leads || null, String)],
    money ? ["Most past due", best((item) => n(item.money?.overdue) || null, inr)] : ["Most open tickets", best((item) => item.openTickets || null, String)],
  ];
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">{cards.map(([label, entry]) => <div key={label} className="rounded-xl border border-border bg-surface p-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>{entry ? <><p className="mt-2 truncate text-sm font-semibold">{entry.name}</p><p className="text-xs tabular-nums text-muted-foreground">{entry.value}</p></> : <p className="mt-2 text-xs text-muted-foreground">Not enough records yet</p>}</div>)}</div>;
}

/** A chart with its own table view, for reading exact figures or without colour. */
function ChartCard({ title, description, table, children }: { title: string; description: string; table: React.ReactNode; children: React.ReactNode }) {
  const [asTable, setAsTable] = React.useState(false);
  return <SectionCard title={title} description={description} action={<Button size="sm" variant="ghost" aria-pressed={asTable} onClick={() => setAsTable(!asTable)}>{asTable ? "Show chart" : "Show table"}</Button>}>
    {asTable ? <div className="overflow-x-auto">{table}</div> : children}
  </SectionCard>;
}

function SeriesTable({ labels, rows, format }: { labels: string[]; rows: { name: string; values: (number | null)[] }[]; format: (value: number) => string }) {
  return <table className="w-full min-w-[480px] text-left text-sm"><thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="py-2 pr-3">Company</th>{labels.map((label) => <th key={label} className="px-2 py-2 text-right">{label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.name} className="border-b border-border last:border-0"><td className="py-2 pr-3 font-medium">{row.name}</td>{row.values.map((value, index) => <td key={index} className="px-2 py-2 text-right tabular-nums">{value === null ? "—" : format(value)}</td>)}</tr>)}</tbody></table>;
}

function Trends({ data, money, color, onOpen }: { data: PortfolioTrends; money: boolean; color: Map<string, string>; onOpen: (companyId: string) => void }) {
  const companies = data.companies;
  const series = (pick: (point: PortfolioTrends["companies"][number]["points"][number]) => number | null) => data.labels.map((label, index) => Object.fromEntries([["label", label], ...companies.map((company) => [company.id, pick(company.points[index])])]));
  const rows = (pick: (point: PortfolioTrends["companies"][number]["points"][number]) => number | null) => companies.map((company) => ({ name: company.name, values: company.points.map(pick) }));
  const salesPick = money ? (point: PortfolioTrends["companies"][number]["points"][number]) => point.netSales === null ? null : n(point.netSales) : (point: PortfolioTrends["companies"][number]["points"][number]) => n(point.wonValue);
  const profitPick = (point: PortfolioTrends["companies"][number]["points"][number]) => point.netSales === null ? null : n(point.netSales) - n(point.costs);
  const groupProfit = data.labels.map((label, index) => ({ label, profit: companies.reduce((sum, company) => sum + (profitPick(company.points[index]) ?? 0), 0) }));
  // A chart of nothing but zeros draws a meaningless ₹0–₹4 axis: say there is nothing yet instead.
  const empty = (pick: (point: PortfolioTrends["companies"][number]["points"][number]) => number | null) => companies.every((company) => company.points.every((point) => !pick(point)));
  const nothing = (text: string) => <p className="flex h-[200px] items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">{text}</p>;
  const line = (pick: typeof salesPick, format: (value: number) => string) => empty(pick) ? nothing("Nothing recorded in these months yet.") : <ResponsiveContainer width="100%" height={260}><LineChart data={series(pick)} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
    <CartesianGrid stroke="var(--border)" vertical={false} />
    <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
    <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={format} width={56} />
    <Tooltip {...tooltipStyle} formatter={(value) => format(Number(value))} />
    <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" />
    {companies.map((company) => <Line key={company.id} type="linear" dataKey={company.id} name={company.name} stroke={color.get(company.id)} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5, cursor: "pointer", onClick: () => onOpen(company.id) }} connectNulls />)}
  </LineChart></ResponsiveContainer>;
  return <div className="grid gap-4 lg:grid-cols-2">
    <ChartCard title={money ? "Sales by month" : "Value won by month"} description={money ? "Invoiced before GST, less credit notes. This month runs to today." : "Deals won each month. Money from the books is not shared with your role."} table={<SeriesTable labels={data.labels} rows={rows(salesPick)} format={inr} />}>
      {line(salesPick, axisInr)}
    </ChartCard>
    <ChartCard title="Leads by month" description="New leads each company took in." table={<SeriesTable labels={data.labels} rows={rows((point) => point.leads)} format={String} />}>
      {empty((point) => point.leads) ? nothing("No leads in these months yet.") : <ResponsiveContainer width="100%" height={260}><BarChart data={series((point) => point.leads)} margin={{ top: 8, right: 16, bottom: 0, left: 0 }} barGap={2}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
        <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
        <Tooltip {...tooltipStyle} cursor={{ fill: "var(--surface-2)" }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {companies.map((company) => <Bar key={company.id} dataKey={company.id} name={company.name} fill={color.get(company.id)} radius={[4, 4, 0, 0]} maxBarSize={18} cursor="pointer" onClick={() => onOpen(company.id)} />)}
      </BarChart></ResponsiveContainer>}
    </ChartCard>
    {money && <ChartCard title="Group profit by month" description="Sales less supplier bills, all companies together, before salaries. Below the line is a loss." table={<SeriesTable labels={data.labels} rows={[{ name: "Group", values: groupProfit.map((point) => point.profit) }]} format={inr} />}>
      {groupProfit.every((point) => !point.profit) ? nothing("No sales or bills in these months yet.") : <ResponsiveContainer width="100%" height={240}><BarChart data={groupProfit} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
        <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={axisInr} width={56} />
        <Tooltip {...tooltipStyle} cursor={{ fill: "var(--surface-2)" }} formatter={(value) => inr(Number(value))} />
        <Bar dataKey="profit" name="Profit before salaries" fill={palette[0]} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart></ResponsiveContainer>}
    </ChartCard>}
    {money && <ChartCard title="Collected by month" description="Money received from customers each month." table={<SeriesTable labels={data.labels} rows={rows((point) => point.collected === null ? null : n(point.collected))} format={inr} />}>
      {line((point) => point.collected === null ? null : n(point.collected), axisInr)}
    </ChartCard>}
  </div>;
}

/** Each company's part of the group's sales this period, as one bar split by company. */
function Share({ list, color, period }: { list: PortfolioCompany[]; color: Map<string, string>; period: PortfolioPeriod }) {
  const rows = list.map((item) => ({ item, value: Math.max(0, n(item.books?.current.netSales)) })).filter((row) => row.item.books);
  const sum = rows.reduce((acc, row) => acc + row.value, 0);
  return <SectionCard title="Share of group sales" description={`${period.label}. Sales between your own companies are included here, as each company recorded them.`}>
    {sum === 0 ? <p className="text-sm text-muted-foreground">No sales in the books for this period.</p> : <>
      <div className="flex h-4 w-full gap-0.5 overflow-hidden rounded" role="img" aria-label={rows.map((row) => `${row.item.name} ${percent(row.value, sum)}%`).join(", ")}>{rows.filter((row) => row.value > 0).map((row) => <div key={row.item.id} title={`${row.item.name}: ${inr(row.value)} (${percent(row.value, sum)}%)`} style={{ width: `${(row.value / sum) * 100}%`, background: color.get(row.item.id) }} />)}</div>
      <ul className="mt-4 grid gap-2">{rows.sort((a, b) => b.value - a.value).map((row) => <li key={row.item.id} className="flex items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2"><span className="size-2.5 rounded-sm" style={{ background: color.get(row.item.id) }} aria-hidden />{row.item.name}</span><span className="tabular-nums text-muted-foreground">{inr(row.value)} · {percent(row.value, sum)}%</span></li>)}</ul>
    </>}
  </SectionCard>;
}

/** From leads in to deals won, per company, this period. */
function Conversion({ list, color }: { list: PortfolioCompany[]; color: Map<string, string> }) {
  return <SectionCard title="Lead to win" description="Leads that came in this period, deals won, and the share that turned into a win.">
    <ul className="grid gap-3">{list.map((item) => { const leads = item.period.current.leads, won = item.period.current.wonDeals; const rate = percent(won, leads); return <li key={item.id}>
      <div className="mb-1 flex items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2 font-medium"><span className="size-2.5 rounded-sm" style={{ background: color.get(item.id) }} aria-hidden />{item.name}</span><span className="tabular-nums text-muted-foreground">{won} of {leads} · {rate === null ? "—" : `${rate}%`}</span></div>
      <div className="h-2 rounded bg-surface-2"><div className="h-2 rounded" style={{ width: `${Math.min(100, rate ?? 0)}%`, background: color.get(item.id) }} /></div>
    </li>; })}</ul>
  </SectionCard>;
}

/** Where leads came from this period, all companies together and by company. */
function Channels({ list }: { list: PortfolioCompany[] }) {
  const sources = [...new Set(list.flatMap((item) => item.leadSources.map((source) => source.source)))];
  if (!sources.length) return <SectionCard title="Where leads come from" description="By channel, this period against the same days before."><p className="text-sm text-muted-foreground">No leads in this period or the same days before.</p></SectionCard>;
  const count = (item: PortfolioCompany, source: string, side: "current" | "previous") => item.leadSources.find((entry) => entry.source === source)?.[side] ?? 0;
  const rows = sources.map((source) => ({ source, now: list.reduce((sum, item) => sum + count(item, source, "current"), 0), before: list.reduce((sum, item) => sum + count(item, source, "previous"), 0) })).sort((a, b) => b.now - a.now);
  const max = Math.max(1, ...rows.map((row) => Math.max(row.now, row.before)));
  return <SectionCard title="Where leads come from" description="By channel, this period against the same days before, all companies together.">
    <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="py-2 pr-3">Channel</th><th className="w-[40%] px-3 py-2">This period</th><th className="px-3 py-2 text-right">Before</th>{list.map((item) => <th key={item.id} className="px-3 py-2 text-right">{item.name}</th>)}</tr></thead>
      <tbody>{rows.map((row) => <tr key={row.source} className="border-b border-border last:border-0"><td className="py-2 pr-3 font-medium">{sourceName(row.source)}</td><td className="px-3 py-2"><div className="flex items-center gap-2"><div className="h-2 rounded" style={{ width: `${(row.now / max) * 100}%`, minWidth: row.now ? 4 : 0, background: palette[0] }} /><span className="tabular-nums">{row.now}</span></div></td><td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{row.before}</td>{list.map((item) => <td key={item.id} className="px-3 py-2 text-right tabular-nums">{count(item, row.source, "current")}</td>)}</tr>)}</tbody></table></div>
  </SectionCard>;
}

const measures: [string, (item: PortfolioCompany) => string][] = [
  ["Leads, all time", (item) => String(item.crm.leads)],
  ["Open deals", (item) => String(item.crm.openDeals)],
  ["Won deals, all time", (item) => String(item.crm.wonDeals)],
  ["Lost deals, all time", (item) => String(item.crm.lostDeals)],
  ["Win rate, all time (won ÷ closed)", (item) => winRateText(item)],
  ["Members", (item) => String(item.members)],
  ["Health", (item) => item.health ? healthName[item.health.status] : "—"],
  ["People (on leave today)", (item) => item.people ? `${item.people.headcount} (${item.people.onLeaveToday})` : "—"],
  ["Items at or under reorder", (item) => item.stock ? `${item.stock.belowReorder} of ${item.stock.items}` : "—"],
  ["Projects active (late)", (item) => item.delivery ? `${item.delivery.activeProjects} (${item.delivery.lateProjects})` : "—"],
  ["Open tickets (urgent)", (item) => item.support ? `${item.support.open} (${item.support.urgent})` : "—"],
  ["Approvals waiting", (item) => String(item.approvals.reduce((sum, entry) => sum + entry.count, 0))],
  ["Filings past due, not confirmed", (item) => String(item.compliance.filter((due) => due.status === "overdue").length)],
];

function Details({ list }: { list: PortfolioCompany[] }) {
  const [open, setOpen] = React.useState(false);
  return <SectionCard title="Every measure, by company" description="The operating figures side by side." action={<Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Hide" : "Show"}</Button>}>
    {open ? <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="py-2 pr-4">Measure</th>{list.map((item) => <th key={item.id} className="px-3 py-2">{item.name}</th>)}</tr></thead><tbody>{measures.map(([label, value]) => <tr key={label} className="border-b border-border last:border-0"><td className="py-2.5 pr-4 font-medium">{label}</td>{list.map((item) => <td key={item.id} className="px-3 py-2.5 tabular-nums">{value(item)}</td>)}</tr>)}</tbody></table></div>
      : <p className="text-sm text-muted-foreground">{measures.length} measures for {list.length} companies.</p>}
  </SectionCard>;
}
