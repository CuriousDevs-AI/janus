"use client";

import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/settings/section-ui";
import { Kpi } from "@/features/portfolio/components/figures";
import { openIn, total, useRoles, type WithMoney } from "@/features/portfolio/lib/companies";
import { change, inr } from "@/features/portfolio/lib/format";

const rows: [string, (item: WithMoney) => string][] = [
  ["Customers owe", (item) => inr(Number(item.money.receivable))],
  ["Overdue", (item) => item.money.overdueInvoices ? `${inr(Number(item.money.overdue))} · ${item.money.overdueInvoices} invoice${item.money.overdueInvoices === 1 ? "" : "s"}` : "None"],
  ["Late 1–30 days", (item) => inr(Number(item.money.ageing.days0to30))],
  ["Late 31–60 days", (item) => inr(Number(item.money.ageing.days31to60))],
  ["Late over 60 days", (item) => inr(Number(item.money.ageing.over60))],
  ["You owe suppliers", (item) => inr(Number(item.money.payable))],
  ["Bills due in 7 days", (item) => inr(Number(item.money.payableDueThisWeek))],
  ["Invoiced in this period", (item) => `${inr(Number(item.period.current.invoiced))} (${inr(Number(item.period.previous.invoiced))} before)`],
  ["Collected in this period", (item) => `${inr(Number(item.period.current.collected))} (${inr(Number(item.period.previous.collected))} before)`],
];

/** Money across the companies whose money the person's role includes; `hidden` counts the rest. */
export function Finance({ list, hidden }: { list: WithMoney[]; hidden: number }) {
  const { owns } = useRoles();
  const sum = (pick: (item: WithMoney) => string) => list.reduce((total, item) => total + Number(pick(item)), 0);
  const collected = total(list, "current", (figures) => figures.collected);
  const before = total(list, "previous", (figures) => figures.collected);
  return <>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Kpi label="Customers owe" value={inr(sum((item) => item.money.receivable))} detail="Unpaid invoices, all companies" />
      <Kpi label="Overdue" value={inr(sum((item) => item.money.overdue))} detail={`${list.reduce((total, item) => total + item.money.overdueInvoices, 0)} invoices past due`} />
      <Kpi label="Bills due in 7 days" value={inr(sum((item) => item.money.payableDueThisWeek))} detail={`${inr(sum((item) => item.money.payable))} owed to suppliers in all`} />
      <Kpi label="Collected in this period" value={inr(collected)} detail={`${change(collected, before)} (${inr(before)})`} />
    </div>
    <SectionCard title="By company" description={`From each company's invoices, payments, approved credit notes and bills. Bank balances are not connected, so Janus does not show cash.${hidden ? ` ${hidden} more ${hidden === 1 ? "company does" : "companies do"} not share money with your role.` : ""}`}>
      <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="py-2 pr-4">Measure</th>{list.map((item) => <th key={item.id} className="px-3 py-2">{item.name}</th>)}</tr></thead><tbody>{rows.map(([label, value]) => <tr key={label} className="border-b border-border last:border-0"><td className="py-2.5 pr-4 font-medium">{label}</td>{list.map((item) => <td key={item.id} className="px-3 py-2.5 tabular-nums">{value(item)}</td>)}</tr>)}</tbody></table></div>
      <div className="mt-3 flex flex-wrap gap-2">{list.filter(owns).map((item) => <Button key={item.id} size="sm" variant="outline" onClick={() => openIn(item, "/workspace/finance-accounting?workspace=finance-accounting")}>Open {item.name.split(" ")[0]} Finance</Button>)}</div>
    </SectionCard>
  </>;
}
