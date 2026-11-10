"use client";

import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { SectionCard } from "@/components/settings/section-ui";
import { Basis, Kpi } from "@/features/portfolio/components/figures";
import { Delta, Waterfall } from "@/features/portfolio/components/market";
import { groupBooks, openIn, payrollFor, salariesRecorded, useRoles, type WithMoney } from "@/features/portfolio/lib/companies";
import { parseStatement } from "@/features/portfolio/lib/bank-csv";
import { change, day, inr } from "@/features/portfolio/lib/format";
import type { PortfolioBooksAmount, PortfolioIntercompanyLink, PortfolioPeriod } from "@/features/portfolio/types";

const n = (value: string | null | undefined) => Number(value ?? 0);
const sumBooks = (list: WithMoney[], side: "current" | "previous", key: PortfolioBooksAmount) => list.reduce((total, item) => total + n(item.books?.[side][key]), 0);
const margin = (profit: number, sales: number) => sales > 0 ? `${Math.round((profit / sales) * 100)}%` : "—";

/** Money across the companies whose money the person's role includes; `hidden` counts the rest. */
export function Finance({ list, hidden, period }: { list: WithMoney[]; hidden: number; period: PortfolioPeriod }) {
  const [mode, setMode] = React.useState<"group" | "companies">("group");
  const sales = sumBooks(list, "current", "netSales");
  const costs = sumBooks(list, "current", "costs");
  const moneyIn = sumBooks(list, "current", "moneyIn");
  const moneyOut = sumBooks(list, "current", "moneyOut");
  const group = groupBooks(list, "current");
  const groupBefore = groupBooks(list, "previous");
  const { internalSales, internalBills } = group;
  const groupSales = group.sales;
  const groupCosts = group.costs;
  const payroll = list.reduce((total, item) => total + (payrollFor(item, period) ?? 0), 0);
  const recorded = salariesRecorded(list);
  const owed = list.reduce((total, item) => total + n(item.money.receivable), 0);
  const overdue = list.reduce((total, item) => total + n(item.money.overdue), 0);
  const coverage = `${list.length} ${list.length === 1 ? "company" : "companies"}${hidden ? `; ${hidden} more ${hidden === 1 ? "does" : "do"} not share money with your role` : ""}`;
  return <>
    <div role="group" aria-label="Show" className="flex gap-2">
      <Button size="sm" variant={mode === "group" ? "default" : "outline"} aria-pressed={mode === "group"} onClick={() => setMode("group")}>Whole group</Button>
      <Button size="sm" variant={mode === "companies" ? "default" : "outline"} aria-pressed={mode === "companies"} onClick={() => setMode("companies")}>Company by company</Button>
    </div>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Kpi label="Sales" value={inr(groupSales)} detail={`Group, before GST, sales between your companies taken out. ${change(groupSales, groupBefore.sales)}`} delta={<Delta now={groupSales} before={groupBefore.sales} compact />} />
      {payroll ? <Kpi label="Profit after salaries" value={inr(groupSales - groupCosts - payroll)} detail={`${recorded ? "Salaries posted" : "Estimate"} · ${inr(groupSales - groupCosts)} before ${inr(payroll)} of salaries (margin ${margin(groupSales - groupCosts, groupSales)} before)`} />
        : <Kpi label="Profit before salaries" value={inr(groupSales - groupCosts)} detail={`Margin ${margin(groupSales - groupCosts, groupSales)} · salaries not on record`} />}
      <Kpi label="Money in − money out" value={inr(moneyIn - moneyOut)} detail={`${inr(moneyIn)} from customers, ${inr(moneyOut)} to suppliers`} />
      <Kpi label="Customers owe" value={inr(owed)} detail={overdue ? `${inr(overdue)} of it past due` : "Nothing past due"} />
    </div>
    {mode === "group" && <SectionCard title="From sales to profit" description={`The group, ${period.label}: sales before GST, less supplier bills, less salaries where they are in HR (an estimate).`}>
      <Waterfall sales={groupSales} costs={groupCosts} salaries={payroll || null} />
    </SectionCard>}
    {mode === "group" ? <SectionCard title={`The group, ${period.label}`} description={`Added up across ${coverage}. Bank balances are not connected, so this shows money in and out, not cash in the bank.`}>
      <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm">
        <thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="py-2 pr-4">Measure</th><th className="px-3 py-2">All companies</th><th className="px-3 py-2">Between your companies</th><th className="px-3 py-2">Group</th></tr></thead>
        <tbody>
          <tr className="border-b border-border"><td className="py-2.5 pr-4 font-medium">Sales<Basis /></td><td className="px-3 tabular-nums">{inr(sales)}</td><td className="px-3 tabular-nums text-muted-foreground">−{inr(internalSales)}</td><td className="px-3 font-semibold tabular-nums">{inr(groupSales)}</td></tr>
          <tr className="border-b border-border"><td className="py-2.5 pr-4 font-medium">Costs<Basis /></td><td className="px-3 tabular-nums">{inr(costs)}</td><td className="px-3 tabular-nums text-muted-foreground">−{inr(internalBills)}</td><td className="px-3 font-semibold tabular-nums">{inr(groupCosts)}</td></tr>
          <tr className="border-b border-border"><td className="py-2.5 pr-4 font-medium">Profit before salaries<Basis /></td><td className="px-3 tabular-nums">{inr(sales - costs)}</td><td className="px-3" /><td className="px-3 font-semibold tabular-nums">{inr(groupSales - groupCosts)}</td></tr>
          <tr className="border-b border-border"><td className="py-2.5 pr-4 font-medium">Salaries for the period<Basis estimate={!recorded} title={recorded ? "Salaries posted to the books for every month of the period" : "Monthly salaries on record, scaled to the days in the period; not posted for every month"} /></td><td className="px-3 tabular-nums">{payroll ? inr(payroll) : "—"}</td><td className="px-3" /><td className="px-3 tabular-nums">{payroll ? inr(payroll) : "—"}</td></tr>
          <tr><td className="py-2.5 pr-4 font-medium">Profit after salaries<Basis estimate={!recorded} /></td><td className="px-3 tabular-nums">{payroll ? inr(sales - costs - payroll) : "—"}</td><td className="px-3" /><td className="px-3 font-semibold tabular-nums">{payroll ? inr(groupSales - groupCosts - payroll) : "—"}</td></tr>
        </tbody>
      </table></div>
      <p className="mt-3 text-xs text-muted-foreground">{internalSales || internalBills
        ? `Sales between your companies are matched by the company name on the invoice or bill${Math.abs(internalSales - internalBills) > 1 ? `. They do not match: ${inr(internalSales)} sold against ${inr(internalBills)} billed, so one side may be missing a record` : ""}.`
        : "No sales between your companies in this period."} Costs are supplier bills before the GST recorded on them; a bill recorded without its GST counts in full.</p>
    </SectionCard>
    : <SectionCard title="Company by company" description={`From each company's invoices, payments, credit notes and bills, ${period.label}. ${coverage}.`}>
      <ByCompany list={list} period={period} />
    </SectionCard>}
    <CashCard list={list} />
    <SalariesCard list={list} />
    <GstCard list={list} />
    {list.length > 1 && <IntercompanyCard />}
  </>;
}

function ByCompany({ list, period }: { list: WithMoney[]; period: PortfolioPeriod }) {
  const { owns } = useRoles();
  const rows: [React.ReactNode, (item: WithMoney) => string][] = [
    [<>Sales<Basis /></>, (item) => `${inr(n(item.books?.current.netSales))} (${inr(n(item.books?.previous.netSales))} before)`],
    [<>Costs<Basis /></>, (item) => inr(n(item.books?.current.costs))],
    [<>Profit before salaries<Basis /></>, (item) => inr(n(item.books?.current.profitBeforePayroll))],
    ["Margin", (item) => margin(n(item.books?.current.profitBeforePayroll), n(item.books?.current.netSales))],
    [<>Salaries for the period<Basis estimate={!salariesRecorded(list)} /></>, (item) => { const pay = payrollFor(item, period); return pay === null ? "Unknown: no salaries in HR" : `${inr(pay)}${item.books?.current.salariesComplete ? " · posted" : " · estimate"}`; }],
    [<>Profit after salaries<Basis estimate={!salariesRecorded(list)} /></>, (item) => { const pay = payrollFor(item, period); return pay === null ? "—" : inr(n(item.books?.current.profitBeforePayroll) - pay); }],
    ["Money in", (item) => inr(n(item.books?.current.moneyIn))],
    ["Money out", (item) => inr(n(item.books?.current.moneyOut))],
    ["Biggest customer", (item) => { const top = item.customers[0]; const total = n(item.books?.current.netSales); return top && n(top.current) > 0 ? `${top.name} · ${total > 0 ? Math.round((n(top.current) / total) * 100) : 0}% of sales` : "—"; }],
    ["Sales to your other companies", (item) => item.intercompany && n(item.intercompany.sales) ? `${inr(n(item.intercompany.sales))} · ${item.intercompany.partners.join(", ")}` : "None"],
    ["Customers owe", (item) => inr(n(item.money.receivable))],
    ["Past due", (item) => item.money.overdueInvoices ? `${inr(n(item.money.overdue))} · ${item.money.overdueInvoices} invoice${item.money.overdueInvoices === 1 ? "" : "s"}` : "None"],
    ["Late over 60 days", (item) => inr(n(item.money.ageing.over60))],
    ["You owe suppliers", (item) => inr(n(item.money.payable))],
    ["Bills already late", (item) => n(item.money.payableLate) ? inr(n(item.money.payableLate)) : "None"],
    ["Bills due in the next 7 days", (item) => inr(Math.max(0, n(item.money.payableDueThisWeek) - n(item.money.payableLate)))],
  ];
  return <>
    <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="py-2 pr-4">Measure</th>{list.map((item) => <th key={item.id} className="px-3 py-2">{item.name}</th>)}</tr></thead><tbody>{rows.map(([label, value], index) => <tr key={index} className="border-b border-border last:border-0"><td className="py-2.5 pr-4 font-medium">{label}</td>{list.map((item) => <td key={item.id} className="px-3 py-2.5 tabular-nums">{value(item)}</td>)}</tr>)}</tbody></table></div>
    <div className="mt-3 flex flex-wrap gap-2">{list.filter(owns).map((item) => <Button key={item.id} size="sm" variant="outline" onClick={() => openIn(item, "/workspace/finance-accounting?workspace=finance-accounting")}>Open {item.name} Finance</Button>)}</div>
  </>;
}


/** GST to pay per GSTIN, from the books: GST charged on invoices less GST recorded on supplier
 * bills. Each company has one GSTIN in Janus. TDS is not recorded in Janus, so it is not shown. */
function GstCard({ list }: { list: WithMoney[] }) {
  const withGst = list.filter((item) => item.gst);
  if (withGst.length === 0) return null;
  const pay = (value: string) => n(value) >= 0 ? inr(n(value)) : `${inr(-n(value))} credit`;
  return <SectionCard title="GST to pay" description="From the books: GST charged on invoices, less GST recorded on supplier bills (input credit). Last month's is what GSTR-3B pays by the 20th. An estimate for your CA: credit carried from earlier months, blocked credit and credit notes are not counted.">
    <ul className="flex flex-col divide-y divide-border">{withGst.map((item) => {
      const gst = item.gst!;
      return <li key={item.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 text-sm">
        <p className="flex flex-wrap items-baseline justify-between gap-2"><span className="font-medium">{item.name}</span><span className="text-xs text-muted-foreground">{gst.gstin ? `GSTIN ${gst.gstin}` : "No GSTIN recorded"}</span></p>
        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">{[gst.lastMonth, gst.thisMonth].map((month, index) => <div key={month.month} className="flex flex-wrap justify-between gap-2"><dt className="text-muted-foreground">{month.label}{index === 1 ? " so far" : ""}</dt><dd className="tabular-nums"><span className="font-medium">{pay(month.payable)}</span> <span className="text-xs text-muted-foreground">({inr(n(month.output))} charged − {inr(n(month.input))} credit)</span></dd></div>)}</dl>
        {(gst.lastMonth.billsWithoutGst + gst.thisMonth.billsWithoutGst) > 0 && <p className="text-xs text-warning">{gst.lastMonth.billsWithoutGst + gst.thisMonth.billsWithoutGst} supplier bills have no GST recorded, so the credit may be higher and the GST to pay lower.</p>}
      </li>;
    })}</ul>
    <p className="mt-3 text-xs text-muted-foreground">TDS deducted and deposited is not recorded in Janus yet, so it is not shown here; the TDS filings are in Compliance.</p>
  </SectionCard>;
}

/** Invoices between your own companies, each with the bill the buying company recorded for it.
 * A missing bill is recorded in one step, so both sides of the group agree. */
function IntercompanyCard() {
  const links = useApi<PortfolioIntercompanyLink[]>("/portfolio/intercompany");
  const [busy, setBusy] = React.useState<string | null>(null);
  const record = async (link: PortfolioIntercompanyLink) => {
    setBusy(link.invoice);
    try {
      const made = await api<PortfolioIntercompanyLink>("/portfolio/intercompany/bills", { method: "POST", body: JSON.stringify({ sellerId: link.sellerId, invoice: link.invoice }) });
      toast.success(`Bill ${made.bill} recorded in ${made.buyer}.`); links.reload();
    } catch (error) { toast.error(message(error)); } finally { setBusy(null); }
  };
  const all = links.data ?? [];
  const missing = all.filter((link) => !link.bill).length;
  if (!links.loading && all.length === 0) return null;
  return <SectionCard title="Between your companies" description={`Invoices one of your companies raised to another since last April, each with the bill the other recorded for it (linked by the invoice number). ${missing ? `${missing} bill${missing === 1 ? " is" : "s are"} missing, so the group's costs and GST credit are short.` : "Every one has its bill."}`}>
    {links.error ? <p className="text-sm text-danger">{links.error}</p> : <ul className="flex flex-col divide-y divide-border">{all.slice(0, 50).map((link) => <li key={`${link.sellerId}-${link.invoice}`} className="flex flex-wrap items-center gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
      <Badge variant={link.bill ? "success" : "warning"}>{link.bill ? "Matched" : "Bill missing"}</Badge>
      <span className="min-w-0 flex-1"><span className="font-medium">{link.seller} → {link.buyer}</span> <span className="text-muted-foreground">· {link.invoice} · {day(link.invoiceDate)} · {inr(n(link.amount))} with {inr(n(link.gst))} GST{link.bill ? ` · bill ${link.bill}` : ""}</span></span>
      {!link.bill && link.canRecord && <Button size="sm" variant="outline" disabled={busy === link.invoice} onClick={() => void record(link)}>Record the bill in {link.buyer}</Button>}
    </li>)}</ul>}
  </SectionCard>;
}

/** Last month's salaries per company: posted to the books, or a button to post them from HR. */
function SalariesCard({ list }: { list: WithMoney[] }) {
  const { handlesMoney } = useRoles();
  const [posted, setPosted] = React.useState<Record<string, boolean>>({});
  const shown = list.filter((item) => item.payroll && (item.payroll.posted || n(item.payroll.fromHr) > 0));
  if (shown.length === 0) return null;
  const post = async (item: WithMoney) => {
    try { await api(`/portfolio/companies/${item.id}/payroll`, { method: "POST", body: JSON.stringify({ month: item.payroll!.month }) }); setPosted((current) => ({ ...current, [item.id]: true })); toast.success(`${item.payroll!.label} salaries posted for ${item.name}. Reload to see profit with them.`); }
    catch (error) { toast.error(message(error)); }
  };
  return <SectionCard title="Salaries in the books" description="Janus has no payroll run: HR keeps each person's monthly salary. Posting a finished month records those salaries as that month's expense, so profit after salaries is recorded instead of estimated. A month is posted once, with the salaries as they stand when you post.">
    <ul className="flex flex-col divide-y divide-border">{shown.map((item) => { const pay = item.payroll!; const done = pay.posted ?? (posted[item.id] ? pay.fromHr : null); return <li key={item.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
      <Badge variant={done ? "success" : "warning"}>{done ? "Posted" : "Not posted"}</Badge>
      <span className="min-w-0 flex-1"><span className="font-medium">{item.name}</span> <span className="text-muted-foreground">· {pay.label} · {done ? `${inr(n(done))} posted` : `${inr(n(pay.fromHr))} from HR's salaries today`}</span></span>
      {!done && handlesMoney(item) && <Button size="sm" variant="outline" onClick={() => void post(item)}>Post {pay.label} salaries</Button>}
    </li>; })}</ul>
  </SectionCard>;
}

/** Cash in the bank, per company, from bank statements imported here, and how long it lasts. */
function CashCard({ list }: { list: WithMoney[] }) {
  const { handlesMoney } = useRoles();
  const editable = list.filter((item) => handlesMoney(item));
  const [companyId, setCompanyId] = React.useState(editable[0]?.id ?? "");
  const [account, setAccount] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const withCash = list.filter((item) => item.cash);
  const total = withCash.reduce((sum, item) => sum + n(item.cash!.total), 0);
  const upload = async (file: File) => {
    setBusy(true);
    try {
      const parsed = parseStatement(await file.text());
      if (parsed.rows.length === 0) throw new Error("No lines with a date and an amount were found.");
      const result = await api<{ added: number; skipped: number }>(`/portfolio/companies/${companyId}/bank-statement`, { method: "POST", body: JSON.stringify({ account: account.trim() || file.name.replace(/\.csv$/i, ""), rows: parsed.rows.slice(0, 5000) }) });
      toast.success(`${result.added} lines added${result.skipped ? `, ${result.skipped} already there` : ""}${parsed.skipped ? `; ${parsed.skipped} rows without a date or amount left out` : ""}. Reload to see the cash.`);
    } catch (error) { toast.error(message(error)); } finally { setBusy(false); }
  };
  return <SectionCard title="Cash in the bank" description="From bank statements imported here; Janus is not connected to your bank. How long the cash lasts uses the statement's last 90 days of money out less money in.">
    {withCash.length > 0 ? <>
      <p className="mb-3 text-sm"><span className="text-2xl font-semibold tabular-nums">{inr(total)}</span> <span className="text-muted-foreground">across {withCash.length} {withCash.length === 1 ? "company" : "companies"}</span></p>
      <ul className="flex flex-col divide-y divide-border">{withCash.map((item) => { const cash = item.cash!; return <li key={item.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5 text-sm first:pt-0 last:pb-0">
        <span className="font-medium">{item.name}</span>
        <span className="tabular-nums">{cash.total ? inr(n(cash.total)) : "Balance not in the statement"}</span>
        <span className="text-muted-foreground">as of {day(cash.asOf)} · {cash.accounts.map((a) => a.account).join(", ")}</span>
        <span className={`ml-auto ${cash.runwayMonths !== null && cash.runwayMonths < 3 ? "font-medium text-danger" : "text-muted-foreground"}`}>{cash.runwayMonths !== null ? `lasts about ${cash.runwayMonths} months at ${inr(n(cash.monthlyBurn))} a month` : "more came in than went out"}</span>
      </li>; })}</ul>
    </> : <p className="text-sm text-muted-foreground">No statement imported yet. Download your account statement as CSV from net banking and add it below.</p>}
    {editable.length > 0 && <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-3">
      <label className="grid gap-1 text-xs text-muted-foreground">Company<select className="h-9 rounded-md border border-input bg-surface-2 px-2 text-sm text-foreground" value={companyId} onChange={(event) => setCompanyId(event.target.value)}>{editable.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="grid gap-1 text-xs text-muted-foreground">Account<input className="h-9 rounded-md border border-input bg-surface-2 px-2 text-sm text-foreground" maxLength={80} placeholder="HDFC current 1234" value={account} onChange={(event) => setAccount(event.target.value)} /></label>
      <label className={`inline-flex h-9 cursor-pointer items-center rounded-md border border-border px-3 text-sm ${busy ? "opacity-50" : ""}`}>Import statement (CSV)<input type="file" accept=".csv,text/csv" className="sr-only" disabled={busy || !companyId} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} /></label>
    </div>}
  </SectionCard>;
}
