"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, CircleCheck, Copy, MessageCircle, Target, TrendingDown, TrendingUp, UserRoundX, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { workspaceHref } from "@/components/shared/stat-tile";
import { useSession } from "@/components/auth/session-provider";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { day, inr, todayIst, usePortfolioApi, type PortfolioCompany, type PortfolioRetention, type PortfolioTrends } from "@/features/portfolio";

const n = (value: string | null | undefined) => Number(value ?? 0);
const card = "rounded-xl border border-[#e4e4df] bg-white p-5";
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
const percent = (now: number, before: number) => before > 0 ? Math.round(((now - before) / before) * 100) : null;
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

type TrendPoint = PortfolioTrends["companies"][number]["points"][number];

/** The last seven months for this company, oldest first; the last is this month so far. */
export function useMonths(companyId: string) {
  const trends = usePortfolioApi<PortfolioTrends>("/portfolio/trends?unit=month&count=7");
  const company = trends.data?.companies.find((item) => item.id === companyId);
  return { points: company?.points ?? [], labels: trends.data?.labels ?? [], loading: trends.loading, error: trends.error };
}

/**
 * Is the business growing: sales and money collected month by month, and the last three full
 * months against the three before. Where sales run ahead of collections, cash is being lent to
 * customers, so the gap is called out.
 */
export function GrowthTrend({ points, labels, loading, money }: { points: TrendPoint[]; labels: string[]; loading: boolean; money: boolean }) {
  if (loading && !points.length) return <section className={card}><h3 className="text-sm font-semibold">Is it growing?</h3><p className="mt-3 text-sm text-muted-foreground">Loading the last six months…</p></section>;
  const sales = points.map((point) => money ? n(point.netSales) : n(point.wonValue));
  const collected = points.map((point) => n(point.collected));
  const full = sales.slice(0, -1);
  const recent = sum(full.slice(-3)), earlier = sum(full.slice(-6, -3));
  const move = percent(recent, earlier);
  const recentCollected = sum(collected.slice(0, -1).slice(-3));
  const top = Math.max(1, ...sales, ...(money ? collected : []));
  const word = money ? "Sales" : "Won value";
  return <section className={card} aria-label="Is it growing">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">{move !== null && move < 0 ? <TrendingDown className="size-4 text-warning" aria-hidden /> : <TrendingUp className="size-4 text-success" aria-hidden />}Is it growing?</h3>
        <p className="mt-1 text-sm text-muted-foreground">{move === null ? `${word} in the last three full months: ${inr(recent)}.` : <>{word} in the last three full months: <span className="font-medium text-foreground">{inr(recent)}</span>, <span className={move < 0 ? "font-medium text-warning" : "font-medium text-success"}>{move > 0 ? "+" : ""}{move}%</span> on the three before.</>}</p>
      </div>
      {money && <span className="flex items-center gap-3 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-accent" />Sales</span><span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-success/70" />Collected</span></span>}
    </div>
    <div className="mt-4 flex h-40 items-end gap-2 sm:gap-3" role="img" aria-label={points.map((_, index) => `${labels[index]}: ${word.toLowerCase()} ${inr(sales[index])}${money ? `, collected ${inr(collected[index])}` : ""}`).join("; ")}>
      {points.map((point, index) => {
        const last = index === points.length - 1;
        return <div key={point.month} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <span className="whitespace-nowrap text-[10px] tabular-nums text-muted-foreground">{inr(sales[index])}</span>
          <div className="flex h-28 w-full items-end justify-center gap-0.5">
            <div className={`w-1/2 max-w-6 rounded-t ${last ? "bg-accent/40" : "bg-accent"}`} style={{ height: `${Math.max(2, (sales[index] / top) * 100)}%` }} />
            {money && <div className={`w-1/2 max-w-6 rounded-t ${last ? "bg-success/30" : "bg-success/70"}`} style={{ height: `${Math.max(2, (collected[index] / top) * 100)}%` }} />}
          </div>
          <span className="h-6 whitespace-nowrap text-center text-[10px] leading-tight text-muted-foreground">{labels[index]}{last && <span className="block">so far</span>}</span>
        </div>;
      })}
    </div>
    {money && recent > 0 && recentCollected < recent * 0.85 && <p className="mt-3 rounded-md bg-warning-muted px-3 py-2 text-xs text-foreground">You collected {inr(recentCollected)} against {inr(recent)} sold in the last three months. The gap of {inr(recent - recentCollected)} is cash your customers are holding.</p>}
  </section>;
}

/**
 * This month against the Owner's monthly targets, with the pace a target needs by today, so a
 * slow month shows up in its second week and not after it ends. The Owner sets the targets here.
 */
export function MonthTargets({ company, point, onSaved }: { company: PortfolioCompany; point: TrendPoint | undefined; onSaved: () => void }) {
  const session = useSession();
  // Only the company's Owner sets its targets (PUT /portfolio/companies/{id}/targets).
  const owner = session.permissions.includes("*") || session.tenant.role === "owner";
  const [editing, setEditing] = React.useState(false);
  const targets = company.targets;
  const today = todayIst();
  const dayOfMonth = Number(today.slice(8, 10));
  const daysInMonth = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate();
  const share = dayOfMonth / daysInMonth;
  const lines = [
    { key: "leads", label: "Leads in", now: point?.leads ?? 0, target: targets?.leads, money: false },
    { key: "wonValue", label: "Deals won", now: n(point?.wonValue), target: targets?.wonValue, money: true },
    ...(company.money ? [{ key: "collected", label: "Collected", now: n(point?.collected), target: targets?.collected, money: true }] : []),
  ];
  const set = lines.filter((line) => line.target != null && n(line.target) > 0);
  const show = (value: number, money: boolean) => money ? inr(value) : String(Math.round(value));

  return <section className={card} aria-label="This month's targets">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Target className="size-4 text-muted-foreground" aria-hidden />This month&apos;s targets</h3>
        <p className="mt-1 text-xs text-muted-foreground">Day {dayOfMonth} of {daysInMonth}. Where you should be by today is marked on each bar.</p>
      </div>
      {owner && !editing && <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>{set.length ? "Change" : "Set targets"}</Button>}
    </div>
    {editing ? <TargetForm company={company} onDone={(saved) => { setEditing(false); if (saved) onSaved(); }} />
      : set.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No targets yet. A monthly number for leads, deals won and money collected shows by the second week whether the month will land{owner ? "" : ". The Owner sets them"}.</p>
      : <ul className="mt-4 flex flex-col gap-4">{set.map((line) => {
        const target = n(line.target), expected = target * share;
        const gap = line.now - expected;
        const behind = gap < -target * 0.05;
        return <li key={line.key}>
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm"><span className="font-medium">{line.label}</span><span className="tabular-nums"><span className="font-semibold">{show(line.now, line.money)}</span> <span className="text-muted-foreground">of {show(target, line.money)}</span></span></div>
          <div className="relative mt-1.5 h-2 rounded-full bg-surface-2"><div className={`h-2 rounded-full ${line.now >= target ? "bg-success" : behind ? "bg-warning" : "bg-accent"}`} style={{ width: `${Math.min(100, (line.now / target) * 100)}%` }} /><span className="absolute -top-0.5 h-3 w-0.5 bg-foreground/60" style={{ left: `${Math.min(100, share * 100)}%` }} title="Where you should be by today" /></div>
          <p className={`mt-1 text-xs ${behind ? "text-warning" : "text-muted-foreground"}`}>{line.now >= target ? "Target reached." : behind ? `Behind pace by ${show(-gap, line.money)}. ${show(target - line.now, line.money)} to go in ${daysInMonth - dayOfMonth} days.` : gap > target * 0.05 ? `Ahead of pace by ${show(gap, line.money)}.` : "On pace."}</p>
        </li>;
      })}</ul>}
  </section>;
}

function TargetForm({ company, onDone }: { company: PortfolioCompany; onDone: (saved: boolean) => void }) {
  const [values, setValues] = React.useState({ leads: company.targets?.leads ?? "", wonValue: company.targets?.wonValue ?? "", collected: company.targets?.collected ?? "" });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const field = (key: keyof typeof values, label: string, hint: string) => <div><Label htmlFor={`target-${key}`}>{label}</Label><Input id={`target-${key}`} inputMode="numeric" value={values[key].replace(/\.0+$/, "")} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value.replace(/[^0-9]/g, "") }))} placeholder={hint} className="mt-1" /></div>;
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true); setError(null);
    const value = (text: string) => text.trim() === "" ? null : Number(text);
    try {
      await api(`/portfolio/companies/${company.id}/targets`, { method: "PUT", body: JSON.stringify({ leads: value(values.leads), wonValue: value(values.wonValue), ...(company.money ? { collected: value(values.collected) } : {}) }) });
      onDone(true);
    } catch (caught) { setError(message(caught)); setSaving(false); }
  }
  return <form onSubmit={save} className="mt-4 flex flex-col gap-3">
    <div className="grid gap-3 sm:grid-cols-3">
      {field("leads", "Leads a month", "e.g. 40")}
      {field("wonValue", "Deals won, ₹ a month", "e.g. 1000000")}
      {company.money && field("collected", "Collected, ₹ a month", "e.g. 800000")}
    </div>
    <p className="text-xs text-muted-foreground">Leave a box empty for no target. Rupees in full, without commas.</p>
    {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    <div className="flex gap-2"><Button size="sm" type="submit" disabled={saving}>{saving ? "Saving…" : "Save targets"}</Button><Button size="sm" type="button" variant="ghost" onClick={() => onDone(false)}>Cancel</Button></div>
  </form>;
}

type Invoice = { number: string; customer: string; customer_company: string; invoice_date: string; due_date: string; total_paise: number; due_paise: number; payments: { paid_on: string }[] };

/**
 * Get paid faster: who owes the most past due, how late, and a reminder ready to send. Also how
 * long customers take to pay in full, from invoices settled in the last six months.
 */
export function ChaseList({ companyName }: { companyName: string }) {
  const invoices = useApi<Invoice[]>("/finance/invoices");
  const [copied, setCopied] = React.useState<string | null>(null);
  const today = todayIst();
  const rows = invoices.data ?? [];
  const late = new Map<string, { due: number; invoices: Invoice[] }>();
  for (const invoice of rows) {
    if (invoice.due_paise <= 0 || invoice.due_date >= today) continue;
    // The customer is the company billed; `customer` is the person there.
    const name = invoice.customer_company || invoice.customer;
    const entry = late.get(name) ?? { due: 0, invoices: [] };
    entry.due += invoice.due_paise / 100; entry.invoices.push(invoice);
    late.set(name, entry);
  }
  const debtors = [...late.entries()].map(([customer, entry]) => ({ customer, ...entry, oldest: entry.invoices.reduce((min, item) => item.due_date < min ? item.due_date : min, today) })).sort((a, b) => b.due - a.due);
  const settled = rows.filter((invoice) => invoice.due_paise <= 0 && invoice.payments.length && daysBetween(invoice.payments.reduce((max, item) => item.paid_on > max ? item.paid_on : max, ""), today) <= 183);
  const lastPaid = (invoice: Invoice) => invoice.payments.reduce((max, item) => item.paid_on > max ? item.paid_on : max, "");
  const daysToPay = settled.length ? Math.round(sum(settled.map((invoice) => daysBetween(invoice.invoice_date, lastPaid(invoice)))) / settled.length) : null;
  const onTime = settled.length ? Math.round((settled.filter((invoice) => lastPaid(invoice) <= invoice.due_date).length / settled.length) * 100) : null;
  const reminder = (debtor: (typeof debtors)[number]) => `Hello ${debtor.customer}, a reminder that ${debtor.invoices.length === 1 ? `invoice ${debtor.invoices[0].number}` : `invoices ${debtor.invoices.map((item) => item.number).join(", ")}`} for ${inr(debtor.due)} ${debtor.invoices.length === 1 ? `was due on ${day(debtor.oldest)}` : `are past due, the oldest since ${day(debtor.oldest)}`}. Please let us know when we can expect the payment. Thank you, ${companyName}`;
  async function copy(debtor: (typeof debtors)[number]) {
    try { await navigator.clipboard.writeText(reminder(debtor)); setCopied(debtor.customer); window.setTimeout(() => setCopied(null), 2000); } catch { setCopied(null); }
  }

  return <section className={card} aria-label="Get paid faster">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Wallet className="size-4 text-muted-foreground" aria-hidden />Get paid faster</h3>
        <p className="mt-1 text-xs text-muted-foreground">{daysToPay === null ? "Who owes you past the due date, largest first." : `Customers take ${daysToPay} days on average to pay in full; ${onTime}% pay by the due date (invoices settled in the last six months).`}</p>
      </div>
      <Link href={workspaceHref("finance-accounting", "invoices", { status: "overdue" })} className="shrink-0 text-xs font-medium text-accent hover:underline">All overdue</Link>
    </div>
    {invoices.loading ? <p className="mt-3 text-sm text-muted-foreground">Loading invoices…</p>
      : invoices.error ? <p className="mt-3 text-sm text-muted-foreground">Invoices could not be loaded: {invoices.error}</p>
      : debtors.length === 0 ? <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><CircleCheck className="size-4 text-success" aria-hidden />No customer is past due.</p>
      : <ul className="mt-3 flex flex-col divide-y divide-border">{debtors.slice(0, 5).map((debtor) => {
        const daysLate = daysBetween(debtor.oldest, today);
        return <li key={debtor.customer} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <Link href={workspaceHref("finance-accounting", "invoices", { status: "overdue", q: debtor.customer })} className="text-sm font-medium hover:text-accent hover:underline">{debtor.customer}</Link>
            <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{inr(debtor.due)}</span> on {debtor.invoices.length} {debtor.invoices.length === 1 ? "invoice" : "invoices"} · oldest <span className={daysLate > 60 ? "font-medium text-danger" : daysLate > 30 ? "font-medium text-warning" : ""}>{daysLate} days late</span></p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <Button size="sm" variant="secondary" asChild><a href={`https://wa.me/?text=${encodeURIComponent(reminder(debtor))}`} target="_blank" rel="noreferrer"><MessageCircle className="size-3.5" />WhatsApp</a></Button>
            <Button size="sm" variant="ghost" onClick={() => copy(debtor)} aria-label={`Copy a reminder for ${debtor.customer}`}><Copy className="size-3.5" />{copied === debtor.customer ? "Copied" : "Copy"}</Button>
          </div>
        </li>;
      })}</ul>}
    {debtors.length > 5 && <p className="mt-2 text-xs text-muted-foreground">{debtors.length - 5} more customers are past due.</p>}
  </section>;
}

/**
 * Customers who bought in the twelve months before last and nothing since, largest first: the
 * cheapest sales to win back. With how many customers the company kept, and how many are new.
 */
export function WinBack({ company }: { company: PortfolioCompany }) {
  const retention = usePortfolioApi<PortfolioRetention>("/portfolio/customers");
  const mine = retention.data?.companies.find((item) => item.companyId === company.id);
  const note = (name: string) => `Hello ${name}, it has been a while since we last worked together. We would like to know how we can help you again. ${company.name}`;
  return <section className={card} aria-label="Customers to win back">
    <h3 className="flex items-center gap-2 text-sm font-semibold"><UserRoundX className="size-4 text-muted-foreground" aria-hidden />Customers to win back</h3>
    {retention.loading && !mine ? <p className="mt-3 text-sm text-muted-foreground">Loading customers…</p>
      : !mine || mine.before === 0 ? <p className="mt-3 text-sm text-muted-foreground">This needs a year of sales to compare. {mine?.new ? `${mine.new} customers bought in the last twelve months.` : "It fills in as invoices build up."}</p>
      : <>
        <p className="mt-1 text-xs text-muted-foreground">Of {mine.before} customers who bought in the twelve months before last, {mine.kept} bought again in the last twelve{mine.rate !== null ? ` (${mine.rate}%)` : ""}. {mine.new} new {mine.new === 1 ? "customer" : "customers"} joined.</p>
        {mine.lost.length === 0 ? <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><CircleCheck className="size-4 text-success" aria-hidden />Every customer from the year before bought again.</p>
          : <ul className="mt-3 flex flex-col divide-y divide-border">{[...mine.lost].sort((a, b) => n(b.salesBefore) - n(a.salesBefore)).slice(0, 5).map((item) => <li key={item.name} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0"><p className="truncate text-sm font-medium">{item.name}</p><p className="text-xs text-muted-foreground">Bought {inr(n(item.salesBefore))} · last on {day(item.lastBought)}</p></div>
            <Button size="sm" variant="secondary" asChild><a href={`https://wa.me/?text=${encodeURIComponent(note(item.name))}`} target="_blank" rel="noreferrer"><MessageCircle className="size-3.5" />Reach out</a></Button>
          </li>)}</ul>}
        {mine.lostCount > 5 && <p className="mt-2 text-xs text-muted-foreground">{mine.lostCount - 5} more did not buy again.</p>}
      </>}
    <Link href={`/portfolio?view=analytics&company=${company.id}`} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">Customer history<ArrowRight className="size-3" aria-hidden /></Link>
  </section>;
}

