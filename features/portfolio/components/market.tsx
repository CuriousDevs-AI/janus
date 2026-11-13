"use client";

/**
 * The Portfolio's "market" view: each company and the group moving up or down, the way a trading
 * screen shows a holding. Arrows always carry text beside their colour, so the direction never
 * rests on colour alone.
 */

import * as React from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/settings/section-ui";
import { usePortfolioApi } from "@/features/portfolio/lib/use-portfolio-api";
import { businessName, salesName, sells } from "@/features/portfolio/lib/business";
import { outsideSales } from "@/features/portfolio/lib/companies";
import { inr } from "@/features/portfolio/lib/format";
import { palette } from "@/features/portfolio/components/figures";
import type { PortfolioCompany, PortfolioTrends } from "@/features/portfolio/types";

type Point = PortfolioTrends["companies"][number]["points"][number];
const n = (value: string | number | null | undefined) => Number(value ?? 0);
const axis = { fontSize: 11, fill: "var(--muted-foreground)" };
const axisInr = (value: number) => Math.abs(value) >= 1e7 ? `₹${(value / 1e7).toFixed(1)}Cr` : Math.abs(value) >= 1e5 ? `₹${(value / 1e5).toFixed(1)}L` : Math.abs(value) >= 1e3 ? `₹${Math.round(value / 1e3)}K` : `₹${value}`;
const UP = "var(--success)";
const DOWN = "var(--danger)";

/** ▲ +12% (+₹40,000) in green, ▼ −8% in red, or "no change"; "new" when there was nothing before. */
export function Delta({ now, before, format = inr, compact = false }: { now: number; before: number; format?: (value: number) => string; compact?: boolean }) {
  if (now === before) return <span className="text-xs text-muted-foreground">no change</span>;
  const up = now > before;
  const percent = before ? Math.round(((now - before) / Math.abs(before)) * 100) : null;
  return <span className="inline-flex items-center gap-1 text-xs font-medium tabular-nums" style={{ color: up ? UP : DOWN }}>
    <span aria-hidden>{up ? "▲" : "▼"}</span>
    <span>{percent === null ? "new" : `${up ? "+" : "−"}${Math.abs(percent)}%`}</span>
    {!compact && <span className="font-normal text-muted-foreground">({up ? "+" : "−"}{format(Math.abs(now - before))})</span>}
    <span className="sr-only">{up ? "up" : "down"} on the same days before</span>
  </span>;
}

/** A tiny line of the last days, in the same colour as the arrow beside it: green when the period is
 * up on the same days before, red when down, so the two never disagree. Pointing at it shows the
 * day and its figure. */
export function Sparkline({ values, label, up, days, format = inr }: { values: number[]; label: string; up: boolean | null; days?: string[]; format?: (value: number) => string }) {
  const [at, setAt] = React.useState<number | null>(null);
  const width = 120, height = 44, top = 12;
  if (values.length < 2 || values.every((value) => value === 0)) return <svg width={width} height={height} role="img" aria-label={`${label}: nothing recorded`}><line x1={0} x2={width} y1={height - 2} y2={height - 2} stroke="var(--border)" strokeDasharray="3 3" /></svg>;
  const max = Math.max(...values), min = Math.min(0, ...values);
  const x = (index: number) => (index / (values.length - 1)) * width;
  const y = (value: number) => height - 2 - ((value - min) / (max - min || 1)) * (height - top - 4);
  const colour = up === null ? "var(--muted-foreground)" : up ? UP : DOWN;
  const point = at ?? values.length - 1;
  const move = (event: React.MouseEvent<SVGRectElement>) => { const box = event.currentTarget.getBoundingClientRect(); setAt(Math.max(0, Math.min(values.length - 1, Math.round(((event.clientX - box.left) / box.width) * (values.length - 1))))); };
  const when = days?.[point] ? new Date(`${days[point]}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : null;
  return <svg width={width} height={height} role="img" aria-label={`${label}, last ${values.length} days`} className="overflow-visible">
    {at !== null && <><line x1={x(at)} x2={x(at)} y1={top} y2={height} stroke="var(--border)" /><text x={Math.min(width, Math.max(0, x(at)))} y={8} textAnchor={at > values.length * 0.6 ? "end" : at < values.length * 0.4 ? "start" : "middle"} fontSize={10} fill="var(--foreground)" className="tabular-nums">{when ? `${when} · ` : ""}{format(values[at])}</text></>}
    <polyline fill="none" stroke={colour} strokeWidth={1.75} strokeLinejoin="round" points={values.map((value, index) => `${x(index)},${y(value)}`).join(" ")} />
    <circle cx={x(point)} cy={y(values[point])} r={at === null ? 2.5 : 3.5} fill={colour} />
    <rect x={0} y={0} width={width} height={height} fill="transparent" onMouseMove={move} onMouseLeave={() => setAt(null)} />
  </svg>;
}

/** One tile per company: this period's figure, its change, and the last 30 days. Opens the company. */
export function TickerRow({ list, money }: { list: PortfolioCompany[]; money: boolean }) {
  const days = usePortfolioApi<PortfolioTrends>("/portfolio/trends?unit=day&count=30");
  const series = (id: string) => days.data?.companies.find((company) => company.id === id)?.points.map((point) => money ? n(point.netSales) : point.leads) ?? [];
  const dates = days.data?.months;
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" role="list" aria-label="Companies at a glance">
    {list.map((item) => {
      // A company that does not sell (a holding company, one not trading yet) shows its cash, not a flat ₹0 line.
      if (!sells(item)) return <Link key={item.id} role="listitem" href={`/portfolio?view=companies&company=${item.id}`} className="flex flex-col justify-center rounded-xl border border-border bg-surface p-3 transition-colors hover:bg-surface-2">
        <p className="truncate text-xs font-semibold" title={item.name}>{item.name}</p>
        <p className="mt-1 text-lg font-semibold tabular-nums">{item.cash?.total != null ? inr(n(item.cash.total)) : "No sales"}</p>
        <p className="text-xs text-muted-foreground">{item.cash?.total != null ? `Cash in the bank · ${businessName(item).toLowerCase()}` : businessName(item)}</p>
      </Link>;
      const now = money ? n(item.books?.current.netSales) : item.period.current.leads;
      const before = money ? n(item.books?.previous.netSales) : item.period.previous.leads;
      // The change is judged on sales outside the group, and says what went to your own companies.
      const internal = money ? n(item.intercompany?.sales) : 0;
      return <Link key={item.id} role="listitem" href={`/portfolio?view=companies&company=${item.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 transition-[background-color,border-color] hover:border-accent-border hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold" title={item.name}>{item.name}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{money ? inr(now) : `${now} leads`}</p>
          {money ? <Delta now={outsideSales(item, "current")} before={outsideSales(item, "previous")} format={inr} compact /> : <Delta now={now} before={before} format={String} compact />}
          {internal > 0 && <p className="text-[11px] text-muted-foreground">{inr(internal)} to your own companies</p>}
        </div>
        <Sparkline values={series(item.id)} label={`${item.name} ${money ? salesName(item).toLowerCase() : "leads"}`} up={now === before ? null : now > before} days={dates} format={money ? inr : (value) => `${value} leads`} />
      </Link>;
    })}
  </div>;
}

const ranges = [["1M", "day", 30], ["3M", "week", 13], ["6M", "month", 6], ["1Y", "month", 12]] as const;

/** The group's sales (or value won) over a range: one bar per day, week or month, split by company,
 * against the same range just before it (dashed). Click a company in the legend to leave it out or
 * bring it back; click a bar's part to open that company. */
export function GroupLine({ money, color, onOpen }: { money: boolean; color: Map<string, string>; onOpen?: (companyId: string) => void }) {
  const [range, setRange] = React.useState<(typeof ranges)[number]>(ranges[0]);
  const [off, setOff] = React.useState<string[]>([]);
  const [, unit, count] = range;
  // Twice the range: the second half is now, the first half the same range before.
  const data = usePortfolioApi<PortfolioTrends>(`/portfolio/trends?unit=${unit}&count=${count * 2}`, { keepPrevious: true });
  const pick = (point: Point | undefined) => point ? money ? n(point.netSales) : n(point.wonValue) : 0;
  const companies = data.data?.companies ?? [];
  const on = companies.filter((company) => !off.includes(company.id));
  const rows = data.data ? data.data.labels.slice(count).map((label, index) => ({
    label,
    before: on.reduce((sum, company) => sum + pick(company.points[index]), 0),
    ...Object.fromEntries(on.map((company) => [company.id, pick(company.points[count + index])])),
  })) : [];
  const nowOf = (id: string) => companies.find((company) => company.id === id)?.points.slice(count).reduce((sum, point) => sum + pick(point), 0) ?? 0;
  const now = on.reduce((sum, company) => sum + nowOf(company.id), 0);
  const before = rows.reduce((sum, row) => sum + row.before, 0);
  const leader = [...on].sort((a, b) => nowOf(b.id) - nowOf(a.id))[0];
  const toggle = (id: string) => setOff((items) => items.includes(id) ? items.filter((item) => item !== id) : on.length > 1 ? [...items, id] : items);
  const name = (id: string) => companies.find((company) => company.id === id)?.name ?? id;
  const stretch = ({ "1M": "last 30 days", "3M": "last 13 weeks", "6M": "last 6 months", "1Y": "last 12 months" } as Record<string, string>)[range[0]];
  return <SectionCard title={money ? "Group sales" : "Group value won"} description={`${money ? "Invoiced before GST, every company as it recorded them (sales between your companies included)" : "Deals won, all companies together"}, over the ${stretch}, against the same stretch just before (the dashed marks). Not the period chosen above.`} action={<div role="group" aria-label="Range" className="flex gap-1">{ranges.map((entry) => <Button key={entry[0]} size="sm" variant={range[0] === entry[0] ? "default" : "outline"} aria-pressed={range[0] === entry[0]} onClick={() => setRange(entry)}>{entry[0]}</Button>)}</div>}>
    {data.loading ? <div role="status" aria-label="Loading" className="h-[316px] animate-pulse rounded-md bg-surface-2" /> : data.error ? <p role="alert" className="text-sm text-danger">{data.error}</p> : <div className={`transition-opacity ${data.stale ? "opacity-50" : ""}`}>
      <div className="mb-3 flex flex-wrap items-baseline gap-3"><span className="text-2xl font-semibold tabular-nums">{inr(now)}</span><Delta now={now} before={before} />{off.length > 0 && <span className="text-xs text-muted-foreground">{on.length} of {companies.length} companies</span>}{leader && nowOf(leader.id) > 0 && <button type="button" className="text-xs text-accent hover:underline" onClick={() => onOpen?.(leader.id)}>Most from {leader.name}</button>}</div>
      <div role="group" aria-label="Companies in the chart" className="mb-3 flex flex-wrap gap-1.5">{companies.map((company) => { const shown = !off.includes(company.id); return <button key={company.id} type="button" aria-pressed={shown} title={shown ? "Leave this company out" : "Bring this company back"} onClick={() => toggle(company.id)} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${shown ? "border-border bg-surface hover:bg-surface-2" : "border-dashed border-border text-muted-foreground line-through opacity-70 hover:opacity-100"}`}>
        <span aria-hidden className="size-2 rounded-full" style={{ background: shown ? color.get(company.id) ?? palette[0] : "var(--muted-foreground)" }} />{company.name}<span className="tabular-nums text-muted-foreground">{inr(nowOf(company.id))}</span>
      </button>; })}</div>
      {rows.every((row) => !row.before && on.every((company) => !(row as Record<string, unknown>)[company.id])) ? <p className="flex h-[220px] items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">Nothing recorded in this range yet.</p>
        : <ResponsiveContainer width="100%" height={240}><ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={axisInr} width={56} />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0].payload as Record<string, number>;
            const parts = on.map((company) => ({ id: company.id, value: row[company.id] ?? 0 })).filter((part) => part.value);
            const sum = parts.reduce((acc, part) => acc + part.value, 0);
            return <div className="min-w-[180px] rounded-lg border border-border bg-surface p-2.5 text-xs shadow-md">
              <p className="mb-1.5 font-semibold">{label}</p>
              {parts.length === 0 ? <p className="text-muted-foreground">Nothing recorded</p> : parts.map((part) => <p key={part.id} className="flex items-center justify-between gap-4"><span className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: color.get(part.id) }} />{name(part.id)}</span><span className="tabular-nums">{inr(part.value)}</span></p>)}
              <p className="mt-1.5 flex justify-between gap-4 border-t border-border pt-1.5 font-medium"><span>Total</span><span className="tabular-nums">{inr(sum)}</span></p>
              <p className="flex justify-between gap-4 text-muted-foreground"><span>Same stretch before</span><span className="tabular-nums">{inr(row.before ?? 0)}</span></p>
            </div>;
          }} />
          {on.map((company, index) => <Bar key={company.id} dataKey={company.id} name={company.name} stackId="now" fill={color.get(company.id) ?? palette[index % palette.length]} maxBarSize={36} radius={index === on.length - 1 ? [3, 3, 0, 0] : 0} className={onOpen ? "cursor-pointer" : undefined} onClick={() => onOpen?.(company.id)} isAnimationActive={false} />)}
          {/* The same stretch before: a short grey mark at its level on each bar, none where it was nothing. */}
          <Line dataKey="before" stroke="none" name="Same stretch before" isAnimationActive={false} activeDot={false} dot={(props: { cx?: number; cy?: number; index?: number; value?: number }) => <line key={`before-${props.index}`} x1={(props.cx ?? 0) - 9} x2={(props.cx ?? 0) + 9} y1={props.cy} y2={props.cy} stroke={props.value ? "var(--foreground)" : "none"} strokeOpacity={0.55} strokeWidth={2} strokeDasharray="3 2" />} />
        </ComposedChart></ResponsiveContainer>}
    </div>}
  </SectionCard>;
}

/** From sales to profit in steps: sales, less costs, less salaries, what is left. */
export function Waterfall({ sales, costs, salaries }: { sales: number; costs: number; salaries: number | null }) {
  // Nothing recorded draws an empty chart with a ₹0–₹1 axis; say so instead.
  if (!sales && !costs && !salaries) return <p className="flex h-[220px] items-center justify-center rounded-md border border-dashed border-border px-4 text-center text-sm text-muted-foreground">No sales, supplier bills or salaries recorded in this period yet.</p>;
  const steps: { label: string; base: number; value: number; tone: "in" | "out" | "result" }[] = [];
  steps.push({ label: "Sales", base: 0, value: sales, tone: "in" });
  steps.push({ label: "Costs", base: Math.min(sales, sales - costs), value: Math.abs(costs), tone: "out" });
  let left = sales - costs;
  if (salaries !== null) { steps.push({ label: "Salaries (est.)", base: Math.min(left, left - salaries), value: Math.abs(salaries), tone: "out" }); left -= salaries; }
  steps.push({ label: left < 0 ? "Loss" : "Profit", base: Math.min(0, left), value: Math.abs(left), tone: "result" });
  const colour = (step: (typeof steps)[number]) => step.tone === "in" ? "#2a78d6" : step.tone === "out" ? "var(--muted-foreground)" : left < 0 ? DOWN : UP;
  return <div>
    <ResponsiveContainer width="100%" height={220}><BarChart data={steps} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
      <CartesianGrid stroke="var(--border)" vertical={false} />
      <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
      <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={axisInr} width={56} />
      <Tooltip cursor={{ fill: "var(--surface-2)" }} contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }} formatter={(value, name) => name === "base" ? [null, null] : [inr(Number(value)), "Amount"]} />
      <Bar dataKey="base" stackId="w" fill="transparent" />
      <Bar dataKey="value" stackId="w" radius={[4, 4, 0, 0]} maxBarSize={56}>{steps.map((step) => <Cell key={step.label} fill={colour(step)} />)}</Bar>
    </BarChart></ResponsiveContainer>
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">{steps.map((step) => <li key={step.label}><span className="font-medium text-foreground">{step.label}</span> {step.tone === "out" && step.value ? "−" : ""}{inr(step.value)}</li>)}</ul>
  </div>;
}

/** This month's days, each shaded by the group's sales that day, to spot the quiet ones. Click a day
 * to see what each company sold on it. */
export function SalesHeatmap({ money, color }: { money: boolean; color: Map<string, string> }) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const dayOfMonth = Number(today.slice(8, 10));
  const data = usePortfolioApi<PortfolioTrends>(`/portfolio/trends?unit=day&count=${Math.max(2, dayOfMonth)}`);
  const [chosen, setChosen] = React.useState<string | null>(null);
  if (!data.data) return <div aria-hidden className="h-[260px] w-full animate-pulse rounded-xl border border-border bg-surface-2 xl:w-[392px]" />;
  const trends = data.data;
  const pick = (point: Point | undefined) => point ? money ? n(point.netSales) : point.leads : 0;
  const days = trends.months.map((iso, index) => ({ iso, index, value: trends.companies.reduce((sum, company) => sum + pick(company.points[index]), 0) })).filter((entry) => entry.iso.slice(0, 7) === today.slice(0, 7));
  const max = Math.max(1, ...days.map((entry) => entry.value));
  // One hue, light to dark, by how much was sold; the number is in each square's label.
  const shade = (value: number) => value <= 0 ? "var(--surface-2)" : ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#1c5cab"][Math.min(4, Math.floor((value / max) * 4.999))];
  const first = new Date(`${today.slice(0, 7)}-01T12:00:00+05:30`).getDay();
  const blanks = (first + 6) % 7;
  const show = (value: number) => money ? inr(value) : `${value} ${value === 1 ? "lead" : "leads"}`;
  const picked = days.find((entry) => entry.iso === chosen);
  const parts = picked ? trends.companies.map((company) => ({ id: company.id, name: company.name, value: pick(company.points[picked.index]) })).filter((part) => part.value).sort((a, b) => b.value - a.value) : [];
  const best = days.reduce<(typeof days)[number] | null>((top, entry) => !top || entry.value > top.value ? entry : top, null);
  const quiet = days.filter((entry) => entry.value <= 0 && entry.iso <= today).length;
  return <SectionCard title={money ? "Sales by day, this month" : "Leads by day, this month"} description="Darker means more. Click a day to see each company.">
    <div className="grid max-w-[360px] grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((name) => <span key={name}>{name}</span>)}
      {Array.from({ length: blanks }, (_, index) => <span key={`b${index}`} />)}
      {days.map((entry) => <button key={entry.iso} type="button" aria-pressed={chosen === entry.iso} title={`${entry.iso}: ${show(entry.value)}`} aria-label={`${Number(entry.iso.slice(8))}: ${show(entry.value)}`} onClick={() => setChosen(chosen === entry.iso ? null : entry.iso)} className={`flex aspect-square items-center justify-center rounded text-[10px] transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${chosen === entry.iso ? "ring-2 ring-foreground" : ""} ${entry.iso === today ? "font-bold underline" : ""}`} style={{ background: shade(entry.value), color: entry.value / max > 0.6 ? "#fff" : "var(--foreground)" }}>{Number(entry.iso.slice(8))}</button>)}
    </div>
    <div className="mt-3 min-h-[72px] max-w-[360px] border-t border-border pt-3 text-xs" aria-live="polite">
      {picked ? <>
        <p className="mb-1.5 flex justify-between font-semibold"><span>{new Date(`${picked.iso}T12:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</span><span className="tabular-nums">{show(picked.value)}</span></p>
        {parts.length === 0 ? <p className="text-muted-foreground">Nothing recorded in any company.</p> : <ul className="flex flex-col gap-1">{parts.map((part) => <li key={part.id}>
          <div className="flex justify-between gap-3"><span className="flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full" style={{ background: color.get(part.id) ?? palette[0] }} />{part.name}</span><span className="tabular-nums">{show(part.value)}</span></div>
          <div className="mt-0.5 h-1 rounded bg-surface-2"><div className="h-1 rounded" style={{ width: `${Math.max(3, (part.value / picked.value) * 100)}%`, background: color.get(part.id) ?? palette[0] }} /></div>
        </li>)}</ul>}
      </> : <p className="text-muted-foreground">{best && best.value > 0 ? <>Best day so far: <button type="button" className="text-accent hover:underline" onClick={() => setChosen(best.iso)}>{Number(best.iso.slice(8))}{" "}{new Date(`${best.iso}T12:00:00+05:30`).toLocaleDateString("en-IN", { month: "short" })}, {show(best.value)}</button>. </> : null}{quiet} {quiet === 1 ? "day" : "days"} with nothing recorded.</p>}
    </div>
  </SectionCard>;
}
