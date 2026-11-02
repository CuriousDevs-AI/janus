import { healthName } from "@/features/portfolio/lib/format";
import type { PortfolioCompany, PortfolioPeriod } from "@/features/portfolio/types";

/** The board pack: one row per measure and a column per company, as a CSV any spreadsheet opens. */
export function boardPack(list: PortfolioCompany[], period: PortfolioPeriod) {
  const money = (value: string | null | undefined) => (value === null || value === undefined ? "" : value);
  const rows: [string, (item: PortfolioCompany) => string | number][] = [
    ["Health", (item) => item.health ? healthName[item.health.status] : ""],
    [`Leads in (${period.label})`, (item) => item.period.current.leads],
    [`Leads in (same days before)`, (item) => item.period.previous.leads],
    [`Value won (${period.label})`, (item) => item.period.current.wonValue],
    ["Open pipeline", (item) => item.crm.pipelineValue],
    ["Open deals", (item) => item.crm.openDeals],
    ["Customers owe", (item) => money(item.money?.receivable)],
    ["Overdue", (item) => money(item.money?.overdue)],
    ["Overdue over 60 days", (item) => money(item.money?.ageing.over60)],
    ["Bills due in 7 days", (item) => money(item.money?.payableDueThisWeek)],
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
  const lines = [["Measure", ...list.map((item) => item.name)], ...rows.map(([label, pick]) => [label, ...list.map(pick)])].map((line) => line.map(cell).join(","));
  return `Janus Portfolio, ${period.label}: ${period.start} to ${period.end}. Money in rupees; blank where your role does not include it.\n${lines.join("\n")}\n`;
}
