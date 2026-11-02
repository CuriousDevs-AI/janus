import { attentionOf } from "@/features/portfolio/lib/companies";
import { day, inr } from "@/features/portfolio/lib/format";

const healthWord = { red: "Needs you", amber: "Watch", green: "On track" } as const;
import type { PortfolioCompany } from "@/features/portfolio/types";

export type Answer = { text: string; rows?: [string, string][] };

/** Answers from the figures on the page only, naming the company and the number, and says when it cannot. */
export function answerLive(question: string, list: PortfolioCompany[]): Answer {
  const q = question.toLowerCase();
  const named = list.find((item) => q.includes(item.name.toLowerCase()) || q.includes(item.name.split(" ")[0].toLowerCase()));
  const scope = named ? [named] : list;
  const top = <T,>(pick: (item: PortfolioCompany) => T | null | undefined, value: (item: PortfolioCompany) => number) => [...scope].filter((item) => pick(item) !== null && pick(item) !== undefined).sort((a, b) => value(b) - value(a))[0];
  const why = /why|reason|explain|what changed|drop|fall|fell|rise|rose|grew|declin/.test(q);
  if (why && /sale|revenue|income|turnover/.test(q)) {
    const withBooks = scope.filter((item) => item.books);
    if (!withBooks.length) return { text: "Sales come from the books, and money is not shared with your role." };
    const selling = withBooks.filter((item) => Number(item.books!.current.netSales) || Number(item.books!.previous.netSales));
    if (!selling.length) return { text: "No company has sales in the books for this period or the same days before." };
    const rows = selling.flatMap((item): [string, string][] => {
      const now = Number(item.books!.current.netSales), before = Number(item.books!.previous.netSales);
      const movers = [...item.customers].map((customer) => ({ name: customer.name, diff: Number(customer.current) - Number(customer.previous) })).filter((mover) => mover.diff !== 0).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 3);
      return [[item.name, `${inr(now)} against ${inr(before)} in the same days before (${now >= before ? "+" : "−"}${inr(Math.abs(now - before))})`], ...movers.map((mover): [string, string] => [`↳ customer ${mover.name}`, `${mover.diff > 0 ? "+" : "−"}${inr(Math.abs(mover.diff))}`])];
    });
    return { text: "Sales against the same days before, with the customers who moved most. Sales are invoices before GST.", rows };
  }
  if (why && /lead|enquir|inquir/.test(q)) {
    const rows = scope.flatMap((item): [string, string][] => {
      const movers = item.leadSources.filter((source) => source.current !== source.previous).sort((a, b) => Math.abs(b.current - b.previous) - Math.abs(a.current - a.previous)).slice(0, 3);
      return [[item.name, `${item.period.current.leads} leads against ${item.period.previous.leads} in the same days before`], ...movers.map((source): [string, string] => [`↳ from ${source.source.replace(/_/g, " ")}`, `${source.current} against ${source.previous}`])];
    });
    return { text: "Leads against the same days before, by the channel they came from.", rows };
  }
  if (/worst|weakest|struggl|behind|needs? (me|you|us) most|most attention|which company.*(attention|first|help)/.test(q)) {
    const order = { red: 0, amber: 1, green: 2 };
    const ranked = [...scope].sort((a, b) => order[a.health?.status ?? "green"] - order[b.health?.status ?? "green"] || (b.health?.reasons.length ?? 0) - (a.health?.reasons.length ?? 0));
    const first = ranked[0];
    return { text: first?.health && first.health.status !== "green" ? `${first.name} needs you most: ${first.health.reasons[0]}.` : "Every company is on track right now.", rows: ranked.map((item) => [item.name, item.health ? `${healthWord[item.health.status]}${item.health.reasons.length ? ` · ${item.health.reasons.join("; ")}` : ""}` : "—"]) };
  }
  if (/profit|margin|profitab/.test(q)) {
    const withBooks = scope.filter((item) => item.books);
    if (!withBooks.length) return { text: "Profit comes from the books, and money is not shared with your role." };
    return { text: "Profit before salaries this period: sales before GST less supplier bills. Salaries are not booked yet.", rows: withBooks.map((item) => { const sales = Number(item.books!.current.netSales), profit = Number(item.books!.current.profitBeforePayroll); return [item.name, `${inr(profit)} on ${inr(sales)} of sales${sales > 0 ? ` · ${Math.round((profit / sales) * 100)}% margin` : ""}`]; }) };
  }
  if (/attention|urgent|need|worry|problem|health|red/.test(q)) {
    const items = attentionOf(scope);
    return { text: items.length ? `${items.length} thing${items.length === 1 ? "" : "s"} need you${named ? ` at ${named.name}` : ""}, most urgent first.` : "Nothing needs you right now.", rows: items.slice(0, 8).map((item) => [item.company.name, item.text]) };
  }
  if (/approv|waiting|pending|decide/.test(q)) {
    const rows = scope.flatMap((item) => item.approvals.map((entry): [string, string] => [item.name, `${entry.count} ${(entry.count === 1 ? entry.one : entry.label).toLowerCase()}`]));
    return { text: rows.length ? "These are waiting for a decision." : "No approvals are waiting.", rows };
  }
  if (/payroll|salary|salaries/.test(q)) {
    const best = top((item) => item.people?.monthlyPayroll, (item) => Number(item.people?.monthlyPayroll ?? 0));
    if (!best) return { text: "Payroll is not shared with your role." };
    return { text: named ? `${named.name} pays ${inr(Number(named.people?.monthlyPayroll ?? 0))} a month.` : `${best.name} has the heaviest payroll, ${inr(Number(best.people!.monthlyPayroll))} a month.`, rows: scope.filter((item) => item.people?.monthlyPayroll).map((item) => [item.name, `${inr(Number(item.people!.monthlyPayroll))} a month · ${item.people!.headcount} people`]) };
  }
  if (/people|headcount|staff|employee/.test(q)) return { text: `${scope.reduce((sum, item) => sum + (item.people?.headcount ?? 0), 0)} people${named ? ` at ${named.name}` : " across the companies"}.`, rows: scope.map((item) => [item.name, `${item.people?.headcount ?? 0} people · ${item.people?.onLeaveToday ?? 0} on leave today`]) };
  if (/owe|receivable|overdue|collect|outstanding/.test(q)) {
    const rows = scope.filter((item) => item.money).map((item): [string, string] => [item.name, `${inr(Number(item.money!.receivable))} owed · ${inr(Number(item.money!.overdue))} overdue`]);
    return rows.length ? { text: `Customers owe ${inr(scope.reduce((sum, item) => sum + Number(item.money?.receivable ?? 0), 0))} in all.`, rows } : { text: "Money is not shared with your role." };
  }
  if (/stock|inventory|reorder|expir/.test(q)) return { text: "Stock that needs a look.", rows: scope.map((item) => [item.name, `${item.stock?.belowReorder ?? 0} at or under reorder · ${item.stock?.expiringBatches ?? 0} batches expiring in 30 days`]) };
  if (/project|delivery|milestone|late/.test(q)) return { text: "Delivery across the companies.", rows: scope.map((item) => [item.name, `${item.delivery?.activeProjects ?? 0} active · ${item.delivery?.lateProjects ?? 0} late · ${item.delivery?.overdueMilestones ?? 0} milestones past due`]) };
  if (/gst|tds|compliance|filing|due/.test(q)) {
    const rows = scope.flatMap((item) => item.compliance.filter((due) => due.status === "overdue" || due.status === "due_soon").map((due): [string, string] => [item.name, `${due.label} for ${due.period}, due ${day(due.dueOn)}${due.status === "overdue" ? " (past due, not recorded as filed)" : ""}`]));
    return { text: rows.length ? "Filings past due or due this week." : "No filing is past due or due this week.", rows };
  }
  if (/lead|pipeline|deal|won|sales|revenue|win rate|best|compare/.test(q)) {
    const best = top((item) => item.crm, (item) => Number(item.crm.pipelineValue));
    return { text: named ? `${named.name} has ${inr(Number(named.crm.pipelineValue))} open in ${named.crm.openDeals} deals and has won ${inr(Number(named.crm.wonValue))}.` : `${best?.name} holds the largest open pipeline, ${inr(Number(best?.crm.pipelineValue ?? 0))}.`, rows: scope.map((item) => [item.name, `${item.period.current.leads} leads this period · ${inr(Number(item.crm.pipelineValue))} open · ${inr(Number(item.crm.wonValue))} won`]) };
  }
  return { text: "I could not match that to your records, and I will not guess. I answer from the figures on the Portfolio: why sales or leads changed, which company needs you most, profit, what needs you, approvals, money owed, people and payroll, stock, delivery and filings. Name a company to narrow it." };
}
