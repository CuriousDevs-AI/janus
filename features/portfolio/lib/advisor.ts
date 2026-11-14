import { inr } from "@/features/portfolio/lib/format";
import type { PortfolioCompany } from "@/features/portfolio/types";

/**
 * Janus as a business advisor: what it sees in one company's own figures, why that matters to an
 * owner, what to do this week, and a 30-day plan with a target that can be checked against the
 * figures later. Plain rules over the records, written from how small Indian businesses run: cash
 * first, then collections, compliance, follow-up and the team. Nothing here is guessed or forecast.
 */

export type Area = "sales" | "money" | "compliance" | "team" | "operations";
export type Severity = "high" | "medium" | "low";
export type Finding = {
  /** Stable, so a plan item committed to today can be checked again next week. */
  id: string;
  area: Area;
  severity: Severity;
  title: string;
  /** What Janus sees, with the figures. */
  sees: string;
  /** Why an owner should care. */
  matters: string;
  /** What to do this week. */
  action: string;
  href: string;
  /** The 30-day plan line, with a target the figures can confirm. */
  plan: string;
  /** The figure the plan moves, now, to compare against when it was committed. */
  measure: { label: string; now: number; target: number; better: "lower" | "higher"; money?: true };
};

export const areaNames: Record<Area, string> = { sales: "Sales", money: "Money", compliance: "Compliance", team: "Team", operations: "Operations" };
const weight: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
const n = (value: string | null | undefined) => Number(value ?? 0);
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const crm = (path: string) => `${path}?workspace=crm-sales`;
const finance = (view: string) => `/workspace/finance-accounting?view=${view}&workspace=finance-accounting`;

/** Everything Janus would raise with the owner of this company, most serious first. */
export function findings(company: PortfolioCompany): Finding[] {
  const out: Finding[] = [];
  const now = company.period.current, before = company.period.previous;
  const money = company.money, books = company.books?.current;

  // Money: cash runway, won work not invoiced, overdue customers, losses.
  const runway = company.cash?.runwayMonths;
  if (runway != null && runway < 3) out.push({
    id: "cash-runway", area: "money", severity: runway < 1.5 ? "high" : "medium",
    title: "Cash runs short", sees: `Cash in the bank covers about ${runway} month${runway === 1 ? "" : "s"} of spending.`,
    matters: "A business with less than three months of cash has no room for a late customer or a slow month; most small businesses that close run out of cash, not profit.",
    action: "List every payment due in the next 30 days, collect the oldest overdue invoices first, and hold spending that can wait.", href: finance("cash-flow"),
    plan: "Lift cash to cover three months of spending.", measure: { label: "months of cash", now: runway, target: 3, better: "higher" },
  });
  const wonNotBilled = money && books && n(now.wonValue) > 0 && n(books.netSales) === 0;
  if (wonNotBilled) out.push({
    id: "won-not-invoiced", area: "money", severity: "high",
    title: "Won deals are not invoiced", sees: `Deals worth ${inr(n(now.wonValue))} were won this period, but no invoice has been raised.`,
    matters: "Until it is invoiced, won work is not a sale: nobody owes you for it, no GST is accounted, and the clock to get paid has not started.",
    action: "Raise the invoices for this period's won deals in Finance & Accounting.", href: finance("invoices"),
    plan: "Invoice every won deal within a day of winning it.", measure: { label: "won but not invoiced", now: n(now.wonValue), target: 0, better: "lower", money: true },
  });
  if (money && n(money.overdue) > 0) {
    const share = n(money.receivable) ? Math.round((n(money.overdue) / n(money.receivable)) * 100) : 100;
    out.push({
      id: "overdue-receivables", area: "money", severity: share >= 30 ? "high" : "medium",
      title: "Customers are paying late", sees: `${inr(n(money.overdue))} is overdue on ${plural(money.overdueInvoices, "invoice")}, ${share}% of what customers owe.`,
      matters: "Money owed past its due date is cash you have already earned and are lending your customers for free; the older it gets, the less of it comes in.",
      action: "Call the three largest overdue customers this week and agree a date for each.", href: finance("receivables"),
      plan: "Halve the overdue amount in 30 days.", measure: { label: "overdue", now: n(money.overdue), target: Math.round(n(money.overdue) / 2), better: "lower", money: true },
    });
  }
  if (books && n(books.netSales) > 0 && n(books.profitBeforePayroll) < 0) out.push({
    id: "loss", area: "money", severity: "high",
    title: "Selling at a loss", sees: `Supplier bills of ${inr(n(books.costs))} are more than sales of ${inr(n(books.netSales))} this period, before salaries.`,
    matters: "More sales at today's prices would deepen the loss: the gap is in pricing or in costs, not in volume.",
    action: "Check the margin on your three biggest sales and the three biggest bills; raise prices or cut the cost that does not pay back.", href: finance("profit-loss"),
    plan: "Bring the period back to a profit before salaries.", measure: { label: "profit before salaries", now: n(books.profitBeforePayroll), target: 0, better: "higher", money: true },
  });
  const top = [...company.customers].sort((a, b) => n(b.current) - n(a.current))[0];
  const sales = company.customers.reduce((sum, item) => sum + n(item.current), 0);
  if (top && sales > 0 && n(top.current) / sales >= 0.4 && company.customers.length > 1) out.push({
    id: "customer-concentration", area: "money", severity: "medium",
    title: "One customer carries the business", sees: `${top.name} is ${Math.round((n(top.current) / sales) * 100)}% of this period's sales.`,
    matters: "If one customer leaves, pays late or asks for a lower price, the whole business feels it at once.",
    action: "Pick two more customers like your best one and put them in the pipeline this month.", href: crm("/leads"),
    plan: `Bring ${top.name} under 40% of sales.`, measure: { label: `% of sales from ${top.name}`, now: Math.round((n(top.current) / sales) * 100), target: 40, better: "lower" },
  });
  if (!money) out.push({
    id: "no-books", area: "money", severity: "medium",
    title: "Money is not in Janus", sees: "Janus has no invoices, payments or bills for this company, or your role does not include them.",
    matters: "Without the books, Janus cannot tell you who owes you, whether you make a profit, or how long your cash lasts.",
    action: "Switch on Finance & Accounting and record this month's invoices and bills.", href: "/settings?tab=workspace&view=workspaces&workspace=business&activate=finance-accounting",
    plan: "Keep this month's invoices and bills in Janus.", measure: { label: "books in Janus", now: 0, target: 1, better: "higher" },
  });

  // Compliance: nothing tracked, filings missed, registration gaps.
  if (!company.complianceSetUp) out.push({
    id: "compliance-off", area: "compliance", severity: "high",
    title: "No filings are tracked", sees: "Janus does not know which returns this company files, so it cannot warn you before a due date.",
    matters: "A missed GST, TDS or PF return costs a late fee every day and interest on the tax, and repeated misses can block input credit or invite a notice.",
    action: "Choose what the company files (GST, TDS, PF and the rest) so each due date is tracked.", href: `/portfolio?view=compliance&company=${company.id}`,
    plan: "Track every filing the company owes.", measure: { label: "filings tracked", now: 0, target: 1, better: "higher" },
  });
  const late = company.compliance.filter((item) => item.status === "overdue");
  if (late.length) out.push({
    id: "filings-overdue", area: "compliance", severity: "high",
    title: "Filings are past due", sees: `${plural(late.length, "filing")} past due: ${late.slice(0, 3).map((item) => `${item.label} for ${item.period}`).join(", ")}.`,
    matters: "Late fees and interest grow each day a return is late, and a late GSTR-1 holds up your customers' input credit.",
    action: "File the oldest one first, then mark it filed in Compliance.", href: `/portfolio?view=compliance&company=${company.id}`,
    plan: "Clear every past-due filing.", measure: { label: "filings past due", now: late.length, target: 0, better: "lower" },
  });
  const gaps = company.complianceGaps.filter((item) => item.kind === "missing");
  if (gaps.length) out.push({
    id: "registration-gaps", area: "compliance", severity: "low",
    title: "Registration details are missing", sees: `Missing: ${gaps.slice(0, 4).map((item) => item.text.replace(/\.$/, "")).join(", ")}.`,
    matters: "Janus decides which filings apply from the entity type, PAN and registrations; with gaps it can miss one.",
    action: "Fill in the company's legal details in Business Settings.", href: "/settings?tab=workspace&view=settings&workspace=business",
    plan: "Complete the company's legal details.", measure: { label: "details missing", now: gaps.length, target: 0, better: "lower" },
  });

  // Sales: follow-up, ownership, conversion, lead flow, a pipeline on one deal.
  const quiet = company.crm.quietLeads ?? 0;
  if (quiet > 0) out.push({
    id: "quiet-leads", area: "sales", severity: quiet >= 3 ? "high" : "medium",
    title: "Leads are going cold", sees: `${plural(quiet, "open lead")} had no call, message or move for 3 days or more.`,
    matters: "An enquiry answered within a day is far likelier to buy than one answered after a week; a quiet lead is usually a lost one.",
    action: "Call each quiet lead today, or close the ones that are not real.", href: crm("/leads"),
    plan: "No open lead goes 3 days without a follow-up.", measure: { label: "quiet leads", now: quiet, target: 0, better: "lower" },
  });
  const unowned = (company.reps ?? []).filter((rep) => !rep.assigned).reduce((sum, rep) => sum + rep.openLeads, 0);
  if (unowned > 0) out.push({
    id: "unowned-leads", area: "team", severity: "medium",
    title: "Leads have no owner", sees: `${plural(unowned, "open lead")} belong${unowned === 1 ? "s" : ""} to nobody.`,
    matters: "A lead everyone can see and nobody owns is a lead nobody calls.",
    action: "Give each open lead an owner in CRM & Sales.", href: crm("/leads"),
    plan: "Every open lead has an owner.", measure: { label: "leads with no owner", now: unowned, target: 0, better: "lower" },
  });
  const funnel = company.funnel?.current;
  if (funnel && funnel.leads >= 5) {
    const rate = Math.round((funnel.won / funnel.leads) * 100);
    if (rate < 15) out.push({
      id: "low-conversion", area: "sales", severity: "medium",
      title: "Few leads become sales", sees: `${funnel.won} of this period's ${funnel.leads} leads have been won (${rate}%); ${funnel.lost} lost.`,
      matters: "Winning more of the leads you already pay for is the cheapest growth there is.",
      action: "Read the lost reasons on this period's lost deals and fix the most common one (price, speed or fit).", href: crm("/deals"),
      plan: "Raise conversion to 20% of leads.", measure: { label: "% of leads won", now: rate, target: 20, better: "higher" },
    });
  }
  if (before.leads >= 5 && now.leads < before.leads * 0.7) out.push({
    id: "lead-drop", area: "sales", severity: "medium",
    title: "Fewer leads are coming in", sees: `${now.leads} leads this period against ${before.leads} in the same days before.`,
    matters: "Fewer enquiries today are fewer sales next month.",
    action: "Check which channel fell in the Lead sources report and restart it.", href: "/analytics?workspace=business&tab=library&report=lead-sources",
    plan: `Get back to ${before.leads} leads a period.`, measure: { label: "leads this period", now: now.leads, target: before.leads, better: "higher" },
  });
  if (company.crm.openDeals === 1 && n(company.crm.pipelineValue) > 0) out.push({
    id: "thin-pipeline", area: "sales", severity: "low",
    title: "The pipeline rests on one deal", sees: `Your whole open pipeline is one deal worth ${inr(n(company.crm.pipelineValue))}.`,
    matters: "If that deal slips, next month has nothing behind it.",
    action: "Turn two more of this period's leads into deals with a value and a close date.", href: crm("/deals"),
    plan: "Keep at least three open deals.", measure: { label: "open deals", now: 1, target: 3, better: "higher" },
  });

  // Team and operations.
  if (company.members <= 1) out.push({
    id: "single-person", area: "team", severity: "low",
    title: "Only one person can sign in", sees: "You are the only member of this company in Janus.",
    matters: "If you are away or lose access to your email, nobody can approve, invoice or answer customers.",
    action: "Invite a trusted partner or manager as an Admin.", href: "/settings?tab=team&workspace=business",
    plan: "Have a second person who can run the business in Janus.", measure: { label: "people who can sign in", now: company.members, target: 2, better: "higher" },
  });
  if (company.support && (company.support.urgent > 0 || company.support.olderThanWeek > 0)) out.push({
    id: "support-backlog", area: "operations", severity: company.support.urgent > 0 ? "high" : "medium",
    title: "Customers are waiting on support", sees: `${plural(company.support.urgent, "urgent ticket")} and ${plural(company.support.olderThanWeek, "ticket")} open for over a week.`,
    matters: "An unanswered complaint is the most common reason a customer does not buy again.",
    action: "Answer the urgent tickets today and give each week-old one a reply and a date.", href: "/tickets?workspace=customer-support",
    plan: "No ticket waits more than a week.", measure: { label: "week-old tickets", now: company.support.olderThanWeek, target: 0, better: "lower" },
  });
  if (company.stock && company.stock.belowReorder > 0) out.push({
    id: "low-stock", area: "operations", severity: "medium",
    title: "Stock is running low", sees: `${plural(company.stock.belowReorder, "item")} at or under the reorder level.`,
    matters: "Running out of a selling item loses the sale and often the customer.",
    action: "Raise purchase orders for the items under their reorder level.", href: "/workspace/operations-inventory?view=inventory&workspace=operations-inventory",
    plan: "No item under its reorder level.", measure: { label: "items under reorder", now: company.stock.belowReorder, target: 0, better: "lower" },
  });
  if (company.delivery && company.delivery.lateProjects > 0) out.push({
    id: "late-projects", area: "operations", severity: "medium",
    title: "Projects are running late", sees: `${plural(company.delivery.lateProjects, "project")} past the end date, ${plural(company.delivery.overdueTasks, "task")} overdue.`,
    matters: "Late delivery delays the invoice that depends on it and strains the customer.",
    action: "Agree a new date with each late project's customer and the one task that unblocks it.", href: "/workspace/projects-delivery?view=projects&workspace=projects-delivery",
    plan: "No project past its end date.", measure: { label: "late projects", now: company.delivery.lateProjects, target: 0, better: "lower" },
  });
  return out.sort((a, b) => weight[a.severity] - weight[b.severity]);
}

/** How each area stands: the worst finding in it, or on track. */
export function areas(list: Finding[]): { area: Area; status: "red" | "amber" | "green"; reason: string }[] {
  return (Object.keys(areaNames) as Area[]).map((area) => {
    const worst = list.find((item) => item.area === area);
    return { area, status: !worst ? "green" : worst.severity === "high" ? "red" : "amber", reason: worst ? worst.title : "Nothing here needs you." };
  });
}

/** A plan item the owner committed to, as kept in what Janus knows: "Plan · <finding> · <due day>". */
export const PLAN_PREFIX = "Plan · ";
export const planTitle = (finding: Finding, due: string) => `${PLAN_PREFIX}${finding.id} · ${due}`;
export function readPlan(title: string): { id: string; due: string } | null {
  if (!title.startsWith(PLAN_PREFIX)) return null;
  const [id, due] = title.slice(PLAN_PREFIX.length).split(" · ");
  return id && due ? { id, due } : null;
}

/** A measure's figure in words: "₹1.3L" for money, the number otherwise. */
export const measured = (finding: Finding, value: number) => finding.measure.money ? inr(value) : String(value);
