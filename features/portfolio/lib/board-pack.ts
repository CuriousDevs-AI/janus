import { groupBooks, payrollFor } from "@/features/portfolio/lib/companies";
import { healthName } from "@/features/portfolio/lib/format";
import type { PortfolioCompany, PortfolioPeriod } from "@/features/portfolio/types";

/** The board pack: the P&L first, then the rest, one row per measure and a column per company and
 * one for the group, as a CSV any spreadsheet opens. Money is blank where the role lacks it. */
export function boardPack(list: PortfolioCompany[], period: PortfolioPeriod) {
  const money = (value: string | number | null | undefined) => (value === null || value === undefined ? "" : typeof value === "number" ? value.toFixed(2) : value);
  const books = (item: PortfolioCompany, side: "current" | "previous", key: "netSales" | "costs" | "profitBeforePayroll" | "moneyIn" | "moneyOut") => money(item.books?.[side][key]);
  const salaries = (item: PortfolioCompany) => { const pay = item.books ? payrollFor(item, period) : null; return pay === null ? "" : pay.toFixed(2); };
  const after = (item: PortfolioCompany) => { const pay = item.books ? payrollFor(item, period) : null; return pay === null ? "" : (Number(item.books!.current.profitBeforePayroll) - pay).toFixed(2); };
  const anyMoney = list.some((item) => item.books);
  const group = groupBooks(list, "current"), before = groupBooks(list, "previous");
  const groupSalaries = list.reduce((sum, item) => sum + (item.books ? payrollFor(item, period) ?? 0 : 0), 0);
  // The group column, for the rows that add up across companies (sales between them taken out).
  const groupColumn: Record<string, string> = anyMoney ? {
    [`Sales before GST (${period.label})`]: group.sales.toFixed(2),
    "Sales before GST (same days before)": before.sales.toFixed(2),
    "Costs (supplier bills as recorded)": group.costs.toFixed(2),
    "Profit before salaries": group.profit.toFixed(2),
    "Salaries for the period (estimate)": groupSalaries ? groupSalaries.toFixed(2) : "",
    "Profit after salaries (estimate)": groupSalaries ? (group.profit - groupSalaries).toFixed(2) : "",
  } : {};
  const rows: [string, (item: PortfolioCompany) => string | number][] = [
    [`Sales before GST (${period.label})`, (item) => books(item, "current", "netSales")],
    ["Sales before GST (same days before)", (item) => books(item, "previous", "netSales")],
    ["Costs (supplier bills as recorded)", (item) => books(item, "current", "costs")],
    ["Profit before salaries", (item) => books(item, "current", "profitBeforePayroll")],
    ["Salaries for the period (estimate)", salaries],
    ["Profit after salaries (estimate)", after],
    ["Money in from customers", (item) => books(item, "current", "moneyIn")],
    ["Money out to suppliers", (item) => books(item, "current", "moneyOut")],
    ["Sales to your other companies", (item) => money(item.intercompany?.sales)],
    ["Health", (item) => item.health ? healthName[item.health.status] : ""],
    [`Leads in (${period.label})`, (item) => item.period.current.leads],
    [`Leads in (same days before)`, (item) => item.period.previous.leads],
    [`Value won (${period.label})`, (item) => item.period.current.wonValue],
    ["Open pipeline", (item) => item.crm.pipelineValue],
    ["Open deals", (item) => item.crm.openDeals],
    ["Customers owe", (item) => money(item.money?.receivable)],
    ["Overdue", (item) => money(item.money?.overdue)],
    ["Overdue over 60 days", (item) => money(item.money?.ageing.over60)],
    ["Bills already late", (item) => money(item.money?.payableLate)],
    ["Bills due in the next 7 days", (item) => item.money ? (Number(item.money.payableDueThisWeek) - Number(item.money.payableLate)).toFixed(2) : ""],
    [`Collected (${period.label})`, (item) => money(item.period.current.collected)],
    ["Headcount", (item) => item.people?.headcount ?? ""],
    ["Monthly payroll", (item) => money(item.people?.monthlyPayroll)],
    ["Items at or under reorder", (item) => item.stock?.belowReorder ?? ""],
    ["Stock value", (item) => money(item.stock?.stockValue)],
    ["Late projects", (item) => item.delivery?.lateProjects ?? ""],
    ["Open tickets", (item) => item.support?.open ?? ""],
    ["Approvals waiting", (item) => item.approvals.reduce((sum, entry) => sum + entry.count, 0)],
    ["Filings past due, not confirmed", (item) => item.compliance.filter((due) => due.status === "overdue").length],
  ];
  const cell = (value: string | number) => { const text = String(value); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
  const lines = [["Measure", ...list.map((item) => item.name), "Group"], ...rows.map(([label, pick]) => [label, ...list.map(pick), groupColumn[label] ?? ""])].map((line) => line.map(cell).join(","));
  return `Janus Portfolio, ${period.label}: ${period.start} to ${period.end}. Money in rupees; blank where your role does not include it. Group sales and costs take out sales between these companies. Salaries are an estimate from the monthly salaries in HR.\n${lines.join("\n")}\n`;
}
