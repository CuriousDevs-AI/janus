"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/settings/section-ui";
import { Basis, Kpi } from "@/features/portfolio/components/figures";
import { groupBooks, openIn, payrollFor, useRoles, type WithMoney } from "@/features/portfolio/lib/companies";
import { change, inr } from "@/features/portfolio/lib/format";
import type { PortfolioBooks, PortfolioPeriod } from "@/features/portfolio/types";

const n = (value: string | null | undefined) => Number(value ?? 0);
const sumBooks = (list: WithMoney[], side: "current" | "previous", key: keyof PortfolioBooks) => list.reduce((total, item) => total + n(item.books?.[side][key]), 0);
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
  const owed = list.reduce((total, item) => total + n(item.money.receivable), 0);
  const overdue = list.reduce((total, item) => total + n(item.money.overdue), 0);
  const coverage = `${list.length} ${list.length === 1 ? "company" : "companies"}${hidden ? `; ${hidden} more ${hidden === 1 ? "does" : "do"} not share money with your role` : ""}`;
  return <>
    <div role="group" aria-label="Show" className="flex gap-2">
      <Button size="sm" variant={mode === "group" ? "default" : "outline"} aria-pressed={mode === "group"} onClick={() => setMode("group")}>Whole group</Button>
      <Button size="sm" variant={mode === "companies" ? "default" : "outline"} aria-pressed={mode === "companies"} onClick={() => setMode("companies")}>Company by company</Button>
    </div>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Kpi label="Sales" value={inr(groupSales)} detail={`Group, before GST, sales between your companies taken out. ${change(groupSales, groupBefore.sales)}`} />
      {payroll ? <Kpi label="Profit after salaries" value={inr(groupSales - groupCosts - payroll)} detail={`Estimate · ${inr(groupSales - groupCosts)} before ${inr(payroll)} of salaries (margin ${margin(groupSales - groupCosts, groupSales)} before)`} />
        : <Kpi label="Profit before salaries" value={inr(groupSales - groupCosts)} detail={`Margin ${margin(groupSales - groupCosts, groupSales)} · salaries not on record`} />}
      <Kpi label="Money in − money out" value={inr(moneyIn - moneyOut)} detail={`${inr(moneyIn)} from customers, ${inr(moneyOut)} to suppliers`} />
      <Kpi label="Customers owe" value={inr(owed)} detail={overdue ? `${inr(overdue)} of it past due` : "Nothing past due"} />
    </div>
    {mode === "group" ? <SectionCard title={`The group, ${period.label}`} description={`Added up across ${coverage}. Bank balances are not connected, so this shows money in and out, not cash in the bank.`}>
      <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm">
        <thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="py-2 pr-4">Measure</th><th className="px-3 py-2">All companies</th><th className="px-3 py-2">Between your companies</th><th className="px-3 py-2">Group</th></tr></thead>
        <tbody>
          <tr className="border-b border-border"><td className="py-2.5 pr-4 font-medium">Sales<Basis /></td><td className="px-3 tabular-nums">{inr(sales)}</td><td className="px-3 tabular-nums text-muted-foreground">−{inr(internalSales)}</td><td className="px-3 font-semibold tabular-nums">{inr(groupSales)}</td></tr>
          <tr className="border-b border-border"><td className="py-2.5 pr-4 font-medium">Costs<Basis /></td><td className="px-3 tabular-nums">{inr(costs)}</td><td className="px-3 tabular-nums text-muted-foreground">−{inr(internalBills)}</td><td className="px-3 font-semibold tabular-nums">{inr(groupCosts)}</td></tr>
          <tr className="border-b border-border"><td className="py-2.5 pr-4 font-medium">Profit before salaries<Basis /></td><td className="px-3 tabular-nums">{inr(sales - costs)}</td><td className="px-3" /><td className="px-3 font-semibold tabular-nums">{inr(groupSales - groupCosts)}</td></tr>
          <tr className="border-b border-border"><td className="py-2.5 pr-4 font-medium">Salaries for the period<Basis estimate title="Monthly salaries on record, scaled to the days in the period; not yet booked" /></td><td className="px-3 tabular-nums">{payroll ? inr(payroll) : "—"}</td><td className="px-3" /><td className="px-3 tabular-nums">{payroll ? inr(payroll) : "—"}</td></tr>
          <tr><td className="py-2.5 pr-4 font-medium">Profit after salaries<Basis estimate /></td><td className="px-3 tabular-nums">{payroll ? inr(sales - costs - payroll) : "—"}</td><td className="px-3" /><td className="px-3 font-semibold tabular-nums">{payroll ? inr(groupSales - groupCosts - payroll) : "—"}</td></tr>
        </tbody>
      </table></div>
      <p className="mt-3 text-xs text-muted-foreground">{internalSales || internalBills
        ? `Sales between your companies are matched by the company name on the invoice or bill${Math.abs(internalSales - internalBills) > 1 ? `. They do not match: ${inr(internalSales)} sold against ${inr(internalBills)} billed, so one side may be missing a record` : ""}.`
        : "No sales between your companies in this period."} Costs are supplier bills as recorded, and may include GST.</p>
    </SectionCard>
    : <SectionCard title="Company by company" description={`From each company's invoices, payments, credit notes and bills, ${period.label}. ${coverage}.`}>
      <ByCompany list={list} period={period} />
    </SectionCard>}
  </>;
}

function ByCompany({ list, period }: { list: WithMoney[]; period: PortfolioPeriod }) {
  const { owns } = useRoles();
  const rows: [React.ReactNode, (item: WithMoney) => string][] = [
    [<>Sales<Basis /></>, (item) => `${inr(n(item.books?.current.netSales))} (${inr(n(item.books?.previous.netSales))} before)`],
    [<>Costs<Basis /></>, (item) => inr(n(item.books?.current.costs))],
    [<>Profit before salaries<Basis /></>, (item) => inr(n(item.books?.current.profitBeforePayroll))],
    ["Margin", (item) => margin(n(item.books?.current.profitBeforePayroll), n(item.books?.current.netSales))],
    [<>Salaries for the period<Basis estimate /></>, (item) => { const pay = payrollFor(item, period); return pay === null ? "Unknown: no salaries in HR" : inr(pay); }],
    [<>Profit after salaries<Basis estimate /></>, (item) => { const pay = payrollFor(item, period); return pay === null ? "—" : inr(n(item.books?.current.profitBeforePayroll) - pay); }],
    ["Money in", (item) => inr(n(item.books?.current.moneyIn))],
    ["Money out", (item) => inr(n(item.books?.current.moneyOut))],
    ["Biggest customer", (item) => { const top = item.customers[0]; const total = n(item.books?.current.netSales); return top && n(top.current) > 0 ? `${top.name} · ${total > 0 ? Math.round((n(top.current) / total) * 100) : 0}% of sales` : "—"; }],
    ["Sales to your other companies", (item) => item.intercompany && n(item.intercompany.sales) ? `${inr(n(item.intercompany.sales))} · ${item.intercompany.partners.join(", ")}` : "None"],
    ["Customers owe", (item) => inr(n(item.money.receivable))],
    ["Past due", (item) => item.money.overdueInvoices ? `${inr(n(item.money.overdue))} · ${item.money.overdueInvoices} invoice${item.money.overdueInvoices === 1 ? "" : "s"}` : "None"],
    ["Late over 60 days", (item) => inr(n(item.money.ageing.over60))],
    ["You owe suppliers", (item) => inr(n(item.money.payable))],
    ["Bills due in 7 days", (item) => inr(n(item.money.payableDueThisWeek))],
  ];
  return <>
    <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="py-2 pr-4">Measure</th>{list.map((item) => <th key={item.id} className="px-3 py-2">{item.name}</th>)}</tr></thead><tbody>{rows.map(([label, value], index) => <tr key={index} className="border-b border-border last:border-0"><td className="py-2.5 pr-4 font-medium">{label}</td>{list.map((item) => <td key={item.id} className="px-3 py-2.5 tabular-nums">{value(item)}</td>)}</tr>)}</tbody></table></div>
    <div className="mt-3 flex flex-wrap gap-2">{list.filter(owns).map((item) => <Button key={item.id} size="sm" variant="outline" onClick={() => openIn(item, "/workspace/finance-accounting?workspace=finance-accounting")}>Open {item.name.split(" ")[0]} Finance</Button>)}</div>
  </>;
}
