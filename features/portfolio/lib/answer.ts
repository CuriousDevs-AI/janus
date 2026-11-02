import { attentionOf } from "@/features/portfolio/lib/companies";
import { day, inr } from "@/features/portfolio/lib/format";
import type { PortfolioCompany } from "@/features/portfolio/types";

export type Answer = { text: string; rows?: [string, string][] };

/** Answers from the figures on the page only, naming the company and the number, and says when it cannot. */
export function answerLive(question: string, list: PortfolioCompany[]): Answer {
  const q = question.toLowerCase();
  const named = list.find((item) => q.includes(item.name.toLowerCase()) || q.includes(item.name.split(" ")[0].toLowerCase()));
  const scope = named ? [named] : list;
  const top = <T,>(pick: (item: PortfolioCompany) => T | null | undefined, value: (item: PortfolioCompany) => number) => [...scope].filter((item) => pick(item) !== null && pick(item) !== undefined).sort((a, b) => value(b) - value(a))[0];
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
    const rows = scope.flatMap((item) => item.compliance.filter((due) => due.status === "overdue" || due.status === "due_soon").map((due): [string, string] => [item.name, `${due.label} for ${due.period}, due ${day(due.dueOn)}${due.status === "overdue" ? " (overdue)" : ""}`]));
    return { text: rows.length ? "Filings overdue or due this week." : "No filing is overdue or due this week.", rows };
  }
  if (/lead|pipeline|deal|won|sales|revenue|win rate|best|compare/.test(q)) {
    const best = top((item) => item.crm, (item) => Number(item.crm.pipelineValue));
    return { text: named ? `${named.name} has ${inr(Number(named.crm.pipelineValue))} open in ${named.crm.openDeals} deals and has won ${inr(Number(named.crm.wonValue))}.` : `${best?.name} holds the largest open pipeline, ${inr(Number(best?.crm.pipelineValue ?? 0))}.`, rows: scope.map((item) => [item.name, `${item.period.current.leads} leads this period · ${inr(Number(item.crm.pipelineValue))} open · ${inr(Number(item.crm.wonValue))} won`]) };
  }
  return { text: "I answer from the figures on this page: what needs you, approvals, sales, people and payroll, money owed, stock, delivery and filings. Try one of those, or name a company." };
}
