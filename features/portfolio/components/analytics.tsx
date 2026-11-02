import { SectionCard } from "@/components/settings/section-ui";
import { Bars, palette } from "@/features/portfolio/components/figures";
import { winRate } from "@/features/portfolio/lib/companies";
import { healthName, inr } from "@/features/portfolio/lib/format";
import type { PortfolioCompany } from "@/features/portfolio/types";

const measures: [string, (item: PortfolioCompany) => string][] = [
  ["Leads in this period", (item) => `${item.period.current.leads} (${item.period.previous.leads} before)`],
  ["Won in this period", (item) => `${inr(Number(item.period.current.wonValue))} (${inr(Number(item.period.previous.wonValue))} before)`],
  ["Leads, all time", (item) => String(item.crm.leads)],
  ["Open deals", (item) => String(item.crm.openDeals)],
  ["Won deals", (item) => String(item.crm.wonDeals)],
  ["Lost deals", (item) => String(item.crm.lostDeals)],
  ["Win rate", (item) => { const rate = winRate(item); return rate === null ? "—" : `${rate}%`; }],
  ["Members", (item) => String(item.members)],
  ["Open tickets", (item) => String(item.openTickets)],
  ["Health", (item) => item.health ? healthName[item.health.status] : "—"],
  ["People (on leave today)", (item) => item.people ? `${item.people.headcount} (${item.people.onLeaveToday})` : "—"],
  ["Monthly payroll", (item) => item.people?.monthlyPayroll ? inr(Number(item.people.monthlyPayroll)) : "Not shared"],
  ["Items at or under reorder", (item) => item.stock ? `${item.stock.belowReorder} of ${item.stock.items}` : "—"],
  ["Batches expiring in 30 days", (item) => String(item.stock?.expiringBatches ?? "—")],
  ["Dispatches in transit", (item) => String(item.stock?.dispatchesInTransit ?? "—")],
  ["Projects active (late)", (item) => item.delivery ? `${item.delivery.activeProjects} (${item.delivery.lateProjects})` : "—"],
  ["Milestones past due", (item) => String(item.delivery?.overdueMilestones ?? "—")],
  ["Done, awaiting acceptance", (item) => item.delivery ? `${item.delivery.awaitingAcceptance} · ${inr(Number(item.delivery.awaitingAcceptanceValue))}` : "—"],
  ["Urgent or escalated tickets", (item) => item.support ? `${item.support.urgent} · ${item.support.escalated}` : "—"],
  ["Approvals waiting", (item) => String(item.approvals.reduce((sum, entry) => sum + entry.count, 0))],
  ["Filings past due, not confirmed", (item) => String(item.compliance.filter((due) => due.status === "overdue").length)],
];

export function Analytics({ list }: { list: PortfolioCompany[] }) {
  const color = (index: number) => palette[index % palette.length];
  return <>
    <div className="grid gap-4 lg:grid-cols-2">
      <SectionCard title="Open pipeline" description="Value of deals still in play."><Bars format={inr} rows={list.map((item, index) => ({ id: item.id, label: item.name, value: Number(item.crm.pipelineValue), color: color(index) }))} /></SectionCard>
      <SectionCard title="Won so far" description="Closed deals by company."><Bars format={inr} rows={list.map((item, index) => ({ id: item.id, label: item.name, value: Number(item.crm.wonValue), color: color(index) }))} /></SectionCard>
    </div>
    <SectionCard title="By company" description="Counted from each company's own records.">
      <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="py-2 pr-4">Measure</th>{list.map((item) => <th key={item.id} className="px-3 py-2">{item.name}</th>)}</tr></thead><tbody>{measures.map(([label, value]) => <tr key={label} className="border-b border-border last:border-0"><td className="py-2.5 pr-4 font-medium">{label}</td>{list.map((item) => <td key={item.id} className="px-3 py-2.5 tabular-nums">{value(item)}</td>)}</tr>)}</tbody></table></div>
    </SectionCard>
  </>;
}
