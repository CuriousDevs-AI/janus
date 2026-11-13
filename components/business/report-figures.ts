import { workspaceHref } from "@/components/shared/stat-tile";
import { change, day, inr, type PortfolioCompany } from "@/features/portfolio";

/** One line of a Business Report: the figure now, and for the period before where there is one. */
export type ReportRow = { label: string; value: string; before?: string; change?: string; href?: string; warn?: boolean };
/** What a report shows: its lines, what they cover, and where the full records are. */
export type ReportFigures = { rows: ReportRow[]; covers: "period" | "now" | "month"; note?: string };

const n = (value: string | null | undefined) => Number(value ?? 0);
const finance = (view: string, extra: Record<string, string> = {}) => workspaceHref("finance-accounting", view, extra);

/** A money line this period against the same days before. */
function money(label: string, now: string | null | undefined, before: string | null | undefined, href?: string): ReportRow {
  const a = n(now), b = n(before);
  // A percentage on a loss or a nil base misleads (−250%), so a net figure moves by rupees.
  const moved = b < 0 || (a < 0 && b > 0) ? (a === b ? "Same as before" : `${a > b ? "Up" : "Down"} ${inr(Math.abs(a - b))}`) : change(a, b);
  return { label, value: inr(a), before: inr(b), change: moved, href };
}
function count(label: string, now: number, before: number, href?: string): ReportRow {
  return { label, value: String(now), before: String(before), change: change(now, before), href };
}

/**
 * The figures for a ready-made report, from the company's own records as the Portfolio reads them
 * (GET /portfolio/summary). Null when the records it needs are not there, or the person's role
 * does not include them, so the report stays locked rather than showing a made-up number.
 */
export function reportFigures(id: string, company: PortfolioCompany): ReportFigures | null {
  const now = company.period.current, before = company.period.previous;
  const books = company.books, owed = company.money;
  const crm = (path: string) => `${path}?workspace=crm-sales`;
  switch (id) {
    case "sales-summary":
      return { covers: "period", rows: [
        count("Leads in", now.leads, before.leads, crm("/leads")),
        count("Deals won", now.wonDeals, before.wonDeals, crm("/deals")),
        money("Won value", now.wonValue, before.wonValue, crm("/deals")),
        ...(books ? [money("Sales before GST", books.current.netSales, books.previous.netSales, finance("invoices"))] : []),
      ] };
    case "sales-pipeline":
      return { covers: "now", rows: [
        { label: "Open deals", value: String(company.crm.openDeals), href: crm("/deals") },
        { label: "Open pipeline", value: inr(n(company.crm.pipelineValue)), href: crm("/deals") },
        { label: "Won, all time", value: `${company.crm.wonDeals} · ${inr(n(company.crm.wonValue))}` },
        { label: "Lost, all time", value: String(company.crm.lostDeals) },
      ] };
    case "lead-sources":
      if (!company.leadSources.length) return null;
      return { covers: "period", rows: [...company.leadSources].sort((a, b) => b.current - a.current).map((item) => count(item.source.charAt(0).toUpperCase() + item.source.slice(1).replaceAll("_", " "), item.current, item.previous, crm("/leads"))) };
    case "profit-loss":
      if (!books) return null;
      return { covers: "period", note: books.current.salariesComplete ? undefined : "Salaries are not posted to the books for every month in this period, so profit after salaries is not shown.", rows: [
        money("Sales before GST", books.current.netSales, books.previous.netSales, finance("invoices")),
        money("Supplier bills", books.current.costs, books.previous.costs, finance("payables")),
        { ...money("Profit before salaries", books.current.profitBeforePayroll, books.previous.profitBeforePayroll, finance("profit-loss")), warn: n(books.current.profitBeforePayroll) < 0 },
        ...(books.current.salariesComplete ? [money("Salaries posted", books.current.salariesPosted, books.previous.salariesPosted), { ...money("Profit after salaries", String(n(books.current.profitBeforePayroll) - n(books.current.salariesPosted)), String(n(books.previous.profitBeforePayroll) - n(books.previous.salariesPosted))), warn: n(books.current.profitBeforePayroll) < n(books.current.salariesPosted) }] : []),
      ] };
    case "cash-flow":
      if (!books) return null;
      return { covers: "period", rows: [
        money("Money in", books.current.moneyIn, books.previous.moneyIn, finance("cash-flow")),
        money("Money out", books.current.moneyOut, books.previous.moneyOut, finance("cash-flow")),
        { ...money("Net cash flow", String(n(books.current.moneyIn) - n(books.current.moneyOut)), String(n(books.previous.moneyIn) - n(books.previous.moneyOut))), warn: n(books.current.moneyIn) < n(books.current.moneyOut) },
        ...(company.cash?.total != null ? [{ label: `Cash in the bank, ${day(company.cash.asOf)}`, value: inr(n(company.cash.total)), change: company.cash.runwayMonths != null ? `Lasts about ${company.cash.runwayMonths} months` : undefined }] : []),
      ] };
    case "receivables-aging":
      if (!owed) return null;
      return { covers: "now", rows: [
        { label: "Customers owe", value: inr(n(owed.receivable)), href: finance("receivables") },
        { label: "Overdue", value: inr(n(owed.overdue)), change: `${owed.overdueInvoices} invoices`, href: finance("invoices", { status: "overdue" }), warn: n(owed.overdue) > 0 },
        { label: "Overdue up to 30 days", value: inr(n(owed.ageing.days0to30)), href: finance("receivables") },
        { label: "Overdue 31–60 days", value: inr(n(owed.ageing.days31to60)), href: finance("receivables", { aging: "31–60 days" }) },
        { label: "Overdue over 60 days", value: inr(n(owed.ageing.over60)), href: finance("receivables"), warn: n(owed.ageing.over60) > 0 },
      ] };
    case "expenses":
      if (!books || !owed) return null;
      return { covers: "period", rows: [
        money("Supplier bills", books.current.costs, books.previous.costs, finance("payables")),
        { label: "You owe suppliers", value: inr(n(owed.payable)), href: finance("payables") },
        { label: "Bills past due", value: inr(n(owed.payableLate)), href: finance("payables"), warn: n(owed.payableLate) > 0 },
        { label: "Bills due this week", value: inr(n(owed.payableDueThisWeek)), href: finance("payables") },
      ] };
    case "gst-summary": {
      const gst = company.gst;
      if (!gst) return null;
      const line = (label: string, key: "output" | "input" | "creditNotes" | "blocked" | "payable") => ({ label, value: inr(n(gst.thisMonth[key])), before: inr(n(gst.lastMonth[key])) });
      return { covers: "month", note: `${gst.thisMonth.label} to date against ${gst.lastMonth.label}. A payable below zero is credit carried forward.${gst.thisMonth.billsWithoutGst ? ` ${gst.thisMonth.billsWithoutGst} bills this month have no GST recorded.` : ""}`, rows: [
        line("GST on sales", "output"), line("GST on credit notes", "creditNotes"), line("Input credit on bills", "input"), line("Credit you cannot claim", "blocked"), { ...line("GST to pay", "payable"), href: finance("gst"), warn: n(gst.thisMonth.payable) > 0 },
      ] };
    }
    case "headcount":
      if (!company.people) return null;
      return { covers: "now", rows: [
        { label: "People", value: String(company.people.headcount), href: workspaceHref("hr-people", "employees") },
        { label: "On leave today", value: String(company.people.onLeaveToday) },
        { label: "Members who can sign in", value: String(company.members), href: "/settings?tab=team" },
      ] };
    case "attendance-leave":
      if (!company.people) return null;
      return { covers: "now", rows: [
        { label: "On leave today", value: String(company.people.onLeaveToday) },
        { label: "Leave waiting for approval", value: String(company.people.pendingLeave), href: workspaceHref("hr-people", "leave"), warn: company.people.pendingLeave > 0 },
        { label: "Claims waiting", value: String(company.people.pendingClaims), change: company.people.claimsValue ? inr(n(company.people.claimsValue)) : undefined },
      ] };
    case "payroll-cost": {
      const people = company.people;
      if (!people?.monthlyPayroll) return null;
      const total = n(people.monthlyPayroll);
      return { covers: "now", rows: [
        { label: "Monthly gross pay", value: inr(total), href: workspaceHref("hr-people", "employees") },
        { label: "People on payroll", value: String(people.headcount) },
        { label: "Average per person", value: inr(total / Math.max(1, people.headcount)) },
        { label: "Per year", value: inr(total * 12) },
        ...(company.payroll ? [{ label: `${company.payroll.label} salaries in the books`, value: company.payroll.posted ? inr(n(company.payroll.posted)) : "Not posted", change: `HR's salaries come to ${inr(n(company.payroll.fromHr))}`, warn: !company.payroll.posted }] : []),
      ] };
    }
    case "tickets-sla": {
      const support = company.support;
      if (!support) return null;
      const queues = (show: string) => workspaceHref("customer-support", "queues", { show });
      return { covers: "now", rows: [
        { label: "Open tickets", value: String(support.open), href: queues("all") },
        { label: "Urgent", value: String(support.urgent), href: queues("all"), warn: support.urgent > 0 },
        { label: "Escalated", value: String(support.escalated), href: queues("escalated"), warn: support.escalated > 0 },
        { label: "Open more than a week", value: String(support.olderThanWeek), href: queues("all"), warn: support.olderThanWeek > 0 },
      ] };
    }
    case "stock-levels": {
      const stock = company.stock;
      if (!stock?.items) return null;
      const products = (extra: Record<string, string> = {}) => workspaceHref("operations-inventory", "products", extra);
      return { covers: "now", rows: [
        { label: "Items", value: String(stock.items), href: products() },
        { label: "Below reorder level", value: String(stock.belowReorder), href: products({ stock: "low" }), warn: stock.belowReorder > 0 },
        { label: "Batches expiring soon", value: String(stock.expiringBatches), warn: stock.expiringBatches > 0 },
        { label: "Dispatches on the way", value: String(stock.dispatchesInTransit) },
        ...(stock.stockValue != null ? [{ label: "Stock value", value: inr(n(stock.stockValue)) }] : []),
      ] };
    }
    case "project-status": {
      const delivery = company.delivery;
      if (!delivery?.activeProjects) return null;
      const projects = (extra: Record<string, string> = {}) => workspaceHref("projects-delivery", "projects", extra);
      return { covers: "now", rows: [
        { label: "Active projects", value: String(delivery.activeProjects), href: projects() },
        { label: "Late", value: String(delivery.lateProjects), href: projects({ health: "late" }), warn: delivery.lateProjects > 0 },
        { label: "Milestones overdue", value: String(delivery.overdueMilestones), warn: delivery.overdueMilestones > 0 },
        { label: "Tasks overdue", value: String(delivery.overdueTasks), href: workspaceHref("projects-delivery", "tasks", { show: "overdue" }), warn: delivery.overdueTasks > 0 },
        { label: "Waiting for the customer to accept", value: String(delivery.awaitingAcceptance), change: inr(n(delivery.awaitingAcceptanceValue)) },
      ] };
    }
    default:
      return null;
  }
}

/** Reports reportFigures can fill from records; the others need work the API does not do yet. */
export const reportsFromRecords = new Set(["sales-summary", "sales-pipeline", "lead-sources", "profit-loss", "cash-flow", "receivables-aging", "expenses", "gst-summary", "headcount", "attendance-leave", "payroll-cost", "tickets-sla", "stock-levels", "project-status"]);
