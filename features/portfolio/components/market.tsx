"use client";

/**
 * The Portfolio's "market" view: each company and the group moving up or down, the way a trading
 * screen shows a holding. Arrows always carry text beside their colour, so the direction never
 * rests on colour alone.
 */

import * as React from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/settings/section-ui";
import { useApi } from "@/lib/api/use-api";
import { inr } from "@/features/portfolio/lib/format";
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
 * up on the same days before, red when down, so the two never disagree. */
export function Sparkline({ values, label, up }: { values: number[]; label: string; up: boolean | null }) {
  const width = 120, height = 32;
  if (values.length < 2 || values.every((value) => value === 0)) return <svg width={width} height={height} role="img" aria-label={`${label}: nothing recorded`}><line x1={0} x2={width} y1={height - 2} y2={height - 2} stroke="var(--border)" strokeDasharray="3 3" /></svg>;
  const max = Math.max(...values), min = Math.min(0, ...values);
  const x = (index: number) => (index / (values.length - 1)) * width;
  const y = (value: number) => height - 2 - ((value - min) / (max - min || 1)) * (height - 4);
  const colour = up === null ? "var(--muted-foreground)" : up ? UP : DOWN;
  return <svg width={width} height={height} role="img" aria-label={`${label}, last ${values.length} days`}>
    <polyline fill="none" stroke={colour} strokeWidth={1.75} strokeLinejoin="round" points={values.map((value, index) => `${x(index)},${y(value)}`).join(" ")} />
    <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={2.5} fill={colour} />
  </svg>;
}

/** One tile per company: this period's figure, its change, and the last 30 days. Opens the company. */
export function TickerRow({ list, money }: { list: PortfolioCompany[]; money: boolean }) {
  const days = useApi<PortfolioTrends>("/portfolio/trends?unit=day&count=30");
  const series = (id: string) => days.data?.companies.find((company) => company.id === id)?.points.map((point) => money ? n(point.netSales) : point.leads) ?? [];
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" role="list" aria-label="Companies at a glance">
    {list.map((item) => {
      const now = money ? n(item.books?.current.netSales) : item.period.current.leads;
      const before = money ? n(item.books?.previous.netSales) : item.period.previous.leads;
      return <Link key={item.id} role="listitem" href={`/portfolio?view=companies&company=${item.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 transition-colors hover:bg-surface-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold" title={item.name}>{item.name}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{money ? inr(now) : `${now} leads`}</p>
          <Delta now={now} before={before} format={money ? inr : String} compact />
        </div>
        <Sparkline values={series(item.id)} label={`${item.name} ${money ? "sales" : "leads"}`} up={now === before ? null : now > before} />
      </Link>;
    })}
  </div>;
}

const ranges = [["1M", "day", 30], ["3M", "week", 13], ["6M", "month", 6], ["1Y", "month", 12]] as const;

/** The group's sales (or value won) over a range, against the same range just before it, dashed. */
export function GroupLine({ money, onOpen }: { money: boolean; onOpen?: (companyId: string) => void }) {
  const [range, setRange] = React.useState<(typeof ranges)[number]>(ranges[0]);
  const [, unit, count] = range;
  // Twice the range: the second half is now, the first half the same range before.
  const data = useApi<PortfolioTrends>(`/portfolio/trends?unit=${unit}&count=${count * 2}`);
  const pick = (point: Point) => money ? n(point.netSales) : n(point.wonValue);
  const total = (index: number) => data.data?.companies.reduce((sum, company) => sum + pick(company.points[index]), 0) ?? 0;
  const rows = data.data ? data.data.labels.slice(count).map((label, index) => ({ label, now: total(count + index), before: total(index) })) : [];
  const now = rows.reduce((sum, row) => sum + row.now, 0), before = rows.reduce((sum, row) => sum + row.before, 0);
  const up = now >= before;
  const leader = data.data?.companies.map((company) => ({ id: company.id, name: company.name, value: company.points.slice(count).reduce((sum, point) => sum + pick(point), 0) })).sort((a, b) => b.value - a.value)[0];
  return <SectionCard title={money ? "Group sales" : "Group value won"} description={`${money ? "Invoiced before GST, every company as it recorded them (sales between your companies included)" : "Deals won, all companies together"}, over the ${({ "1M": "last 30 days", "3M": "last 13 weeks", "6M": "last 6 months", "1Y": "last 12 months" } as Record<string, string>)[range[0]]}, against the same stretch just before (dashed). Not the period chosen above.`} action={<div role="group" aria-label="Range" className="flex gap-1">{ranges.map((entry) => <Button key={entry[0]} size="sm" variant={range[0] === entry[0] ? "default" : "outline"} aria-pressed={range[0] === entry[0]} onClick={() => setRange(entry)}>{entry[0]}</Button>)}</div>}>
    {data.loading ? <p className="text-sm text-muted-foreground" role="status">Loading…</p> : data.error ? <p role="alert" className="text-sm text-danger">{data.error}</p> : <>
      <div className="mb-3 flex flex-wrap items-baseline gap-3"><span className="text-2xl font-semibold tabular-nums">{inr(now)}</span><Delta now={now} before={before} />{leader && leader.value > 0 && <button type="button" className="text-xs text-accent hover:underline" onClick={() => onOpen?.(leader.id)}>Most from {leader.name}</button>}</div>
      {rows.every((row) => !row.now && !row.before) ? <p className="flex h-[220px] items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">Nothing recorded in this range yet.</p>
        : <ResponsiveContainer width="100%" height={240}><LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={axisInr} width={56} />
          <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }} formatter={(value, name) => [inr(Number(value)), name === "now" ? "This stretch" : "Same stretch before"]} />
          <Line type="linear" dataKey="before" stroke="var(--muted-foreground)" strokeDasharray="4 4" strokeWidth={1.5} dot={false} name="before" />
          <Line type="linear" dataKey="now" stroke={up ? UP : DOWN} strokeWidth={2.25} dot={false} activeDot={{ r: 5 }} name="now" />
        </LineChart></ResponsiveContainer>}
    </>}
  </SectionCard>;
}

/** From sales to profit in steps: sales, less costs, less salaries, what is left. */
export function Waterfall({ sales, costs, salaries }: { sales: number; costs: number; salaries: number | null }) {
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
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">{steps.map((step) => <li key={step.label}><span className="font-medium text-foreground">{step.label}</span> {step.tone === "out" ? "−" : ""}{inr(step.value)}</li>)}</ul>
  </div>;
}

/** This month's days, each shaded by the group's sales that day, to spot the quiet ones. */
export function SalesHeatmap({ money }: { money: boolean }) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const dayOfMonth = Number(today.slice(8, 10));
  const data = useApi<PortfolioTrends>(`/portfolio/trends?unit=day&count=${Math.max(2, dayOfMonth)}`);
  if (!data.data) return null;
  const pick = (point: Point) => money ? n(point.netSales) : point.leads;
  const days = data.data.months.map((iso, index) => ({ iso, value: data.data!.companies.reduce((sum, company) => sum + pick(company.points[index]), 0) })).filter((entry) => entry.iso.slice(0, 7) === today.slice(0, 7));
  const max = Math.max(1, ...days.map((entry) => entry.value));
  // One hue, light to dark, by how much was sold; the number is in each square's label.
  const shade = (value: number) => value <= 0 ? "var(--surface-2)" : ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#1c5cab"][Math.min(4, Math.floor((value / max) * 4.999))];
  const first = new Date(`${today.slice(0, 7)}-01T12:00:00+05:30`).getDay();
  const blanks = (first + 6) % 7;
  return <SectionCard title={money ? "Sales by day, this month" : "Leads by day, this month"} description="Darker means more. Pale squares are days with nothing.">
    <div className="grid max-w-[360px] grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((name) => <span key={name}>{name}</span>)}
      {Array.from({ length: blanks }, (_, index) => <span key={`b${index}`} />)}
      {days.map((entry) => <span key={entry.iso} title={`${entry.iso}: ${money ? inr(entry.value) : `${entry.value} leads`}`} aria-label={`${Number(entry.iso.slice(8))}: ${money ? inr(entry.value) : `${entry.value} leads`}`} className="flex aspect-square items-center justify-center rounded text-[10px]" style={{ background: shade(entry.value), color: entry.value / max > 0.6 ? "#fff" : "var(--foreground)" }}>{Number(entry.iso.slice(8))}</span>)}
    </div>
  </SectionCard>;
}
