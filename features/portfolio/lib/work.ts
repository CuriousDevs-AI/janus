/**
 * The Work Inbox: everything across the companies that needs someone to act, built from the same
 * summary the Portfolio shows. Each item says which company, what to do, how urgent, by when if
 * there is a date, and opens the screen where it is done. The record there stays the truth.
 */

import { inr, monthsOrPart } from "@/features/portfolio/lib/format";
import type { PortfolioCompany } from "@/features/portfolio/types";

export type WorkKind = "approve" | "collect" | "pay" | "tax" | "file" | "renew" | "books" | "fix" | "deliver" | "support" | "stock";
export type WorkItem = {
  key: string;
  company: PortfolioCompany;
  kind: WorkKind;
  priority: "high" | "medium" | "low";
  title: string;
  detail: string;
  /** A date it is due by, when there is one (ISO day). */
  due: string | null;
  to: string;
};

export const workKinds: Record<WorkKind, string> = {
  approve: "Approve",
  collect: "Collect money",
  pay: "Pay suppliers",
  tax: "Deposit tax",
  file: "File returns",
  renew: "Renewals",
  books: "Books and cash",
  fix: "Fill in details",
  deliver: "Delivery",
  support: "Customer support",
  stock: "Stock",
};

const FINANCE = "/workspace/finance-accounting";
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

const OPS = "/workspace/operations-inventory?workspace=operations-inventory";
const PROJECTS = "/workspace/projects-delivery?workspace=projects-delivery";
const TICKETS = "/tickets?workspace=customer-support";

export function workFor(list: PortfolioCompany[]): WorkItem[] {
  const items: WorkItem[] = [];
  for (const company of list) {
    const add = (item: Omit<WorkItem, "company" | "key">) => items.push({ ...item, company, key: `${company.id}:${item.kind}:${item.title}` });
    for (const entry of company.approvals) {
      add({ kind: "approve", priority: entry.count > 5 ? "high" : "medium", title: `${entry.count} ${(entry.count === 1 ? entry.one : entry.label).toLowerCase()} waiting`, detail: "Decide it in the company, where its rules apply.", due: null, to: entry.to });
    }
    const money = company.money;
    if (money && money.overdueInvoices > 0) {
      const late = Number(money.ageing.over60) > 0;
      add({ kind: "collect", priority: late ? "high" : "medium", title: `Collect ${inr(Number(money.overdue))} past due`, detail: `${money.overdueInvoices} invoice${money.overdueInvoices === 1 ? "" : "s"}${late ? `, ${inr(Number(money.ageing.over60))} more than 60 days late` : ""}.`, due: null, to: `${FINANCE}?view=receivables&workspace=finance-accounting` });
    }
    const billsLate = Number(money?.payableLate ?? 0);
    const billsSoon = Math.max(0, Number(money?.payableDueThisWeek ?? 0) - billsLate);
    if (billsLate > 0) add({ kind: "pay", priority: "high", title: `Pay ${inr(billsLate)} of supplier bills already late`, detail: billsSoon ? `${inr(billsSoon)} more falls due within 7 days.` : "Past their due dates.", due: null, to: `${FINANCE}?view=payables&workspace=finance-accounting` });
    else if (billsSoon > 0) add({ kind: "pay", priority: "medium", title: `Pay ${inr(billsSoon)} of supplier bills`, detail: "Due within the next 7 days.", due: null, to: `${FINANCE}?view=payables&workspace=finance-accounting` });

    if (!company.complianceSetUp && company.attention.some((entry) => entry.text.startsWith("Compliance not set up"))) {
      const people = company.people?.headcount ?? 0;
      add({ kind: "file", priority: people ? "high" : "medium", title: "Set up which filings apply", detail: people ? `${people} people on the payroll, but no GST, TDS, PF or ESI filings are tracked.` : "No filings are tracked, so nothing can be called up to date.", due: null, to: "/portfolio?view=compliance" });
    }
    // Past due filings are one item per company, so a company that has just set up its calendar
    // does not bury everything else; each due this week is its own item.
    const late = company.compliance.filter((entry) => entry.status === "overdue");
    if (late.length) add({ kind: "file", priority: "high", title: late.length === 1 ? `${late[0].label} for ${late[0].period}` : `${late.length} filings past due`, detail: `Not recorded as filed${late.length > 1 ? `, the oldest ${late[0].label} for ${late[0].period}` : ""}. File them, or record the ones already done.`, due: late[0].dueOn, to: "/portfolio?view=compliance" });
    for (const due of company.compliance.filter((entry) => entry.status === "due_soon")) {
      add({ kind: "file", priority: "medium", title: `${due.label} for ${due.period}`, detail: "Due within 7 days.", due: due.dueOn, to: "/portfolio?view=compliance" });
    }
    // TDS deducted last month and not yet deposited, with the interest building on it.
    const tds = company.tds;
    if (tds && Number(tds.toDeposit) > 0) {
      const late = tds.dueOn < today;
      const months = late ? monthsOrPart(tds.dueOn, today) : 0;
      add({ kind: "tax", priority: late ? "high" : "medium", title: `Deposit ${inr(Number(tds.toDeposit))} of TDS for ${tds.label}`, detail: late ? `Interest so far about ${inr(Number(tds.toDeposit) * 0.015 * months)} (1.5% a month or part).` : `Deducted from bills and salaries; record the challan with the TDS payment.`, due: tds.dueOn, to: "/portfolio?view=finance" });
    }
    // Last month's GST to pay with GSTR-3B, while that return is not recorded as filed.
    const gst = company.gst?.lastMonth;
    const gstr3b = gst ? company.compliance.find((entry) => entry.key === `gstr3b_${gst.month}`) : undefined;
    if (gst && Number(gst.payable) > 0 && gstr3b && gstr3b.status !== "filed") {
      add({ kind: "tax", priority: gstr3b.status === "overdue" ? "high" : "medium", title: `Pay ${inr(Number(gst.payable))} of GST for ${gst.label}`, detail: `Paid with GSTR-3B${gstr3b.status === "overdue" ? `; interest is 18% a year on it from the due day` : ""}.`, due: gstr3b.dueOn, to: "/portfolio?view=finance" });
    }
    for (const doc of company.documents ?? []) {
      if (doc.status === "expired") add({ kind: "renew", priority: "high", title: `Renew ${doc.name}`, detail: "It has expired. Renew it, then record the new expiry date.", due: doc.expiresOn, to: `/portfolio?view=companies&company=${company.id}` });
      else if (doc.status === "expiring") add({ kind: "renew", priority: "medium", title: `Renew ${doc.name}`, detail: `Expires in ${doc.daysLeft} day${doc.daysLeft === 1 ? "" : "s"}.`, due: doc.expiresOn, to: `/portfolio?view=companies&company=${company.id}` });
    }
    const pay = company.payroll;
    if (pay && !pay.posted && Number(pay.fromHr) > 0) add({ kind: "books", priority: "low", title: `Post ${pay.label} salaries to the books`, detail: `${inr(Number(pay.fromHr))} from HR, so profit after salaries is recorded, not estimated.`, due: null, to: "/portfolio?view=finance" });
    const cash = company.cash;
    if (cash?.runwayMonths !== null && cash?.runwayMonths !== undefined && cash.runwayMonths < 6) add({ kind: "books", priority: cash.runwayMonths < 3 ? "high" : "medium", title: `Cash lasts about ${cash.runwayMonths} months`, detail: `${inr(Number(cash.total))} in the bank, ${inr(Number(cash.monthlyBurn))} a month more going out than coming in.`, due: null, to: "/portfolio?view=finance" });
    for (const gap of company.complianceGaps.filter((entry) => entry.kind === "missing")) {
      const head = gap.text.split(":")[0];
      const rest = gap.text.includes(":") ? gap.text.slice(gap.text.indexOf(":") + 1).trim() : "Needed for the compliance calendar.";
      // Missing details on a company with people on its payroll put its statutory filings at risk.
      add({ kind: "fix", priority: (company.people?.headcount ?? 0) > 0 ? "medium" : "low", title: head.startsWith("No ") ? head : `Missing ${head}`, detail: `${rest.charAt(0).toUpperCase()}${rest.slice(1)}${/[.!?]$/.test(rest) ? "" : "."}`, due: null, to: "/portfolio?view=compliance" });
    }
    const work = company.delivery;
    if (work?.lateProjects) add({ kind: "deliver", priority: "high", title: `${work.lateProjects} project${work.lateProjects === 1 ? "" : "s"} past the end date`, detail: "Move the date or close the work.", due: null, to: PROJECTS });
    if (work?.overdueMilestones) add({ kind: "deliver", priority: "medium", title: `${work.overdueMilestones} milestone${work.overdueMilestones === 1 ? "" : "s"} past due`, detail: "Billing waits on these.", due: null, to: PROJECTS });
    if (work?.awaitingAcceptance) add({ kind: "deliver", priority: "low", title: `${work.awaitingAcceptance} milestone${work.awaitingAcceptance === 1 ? "" : "s"} done, waiting for the customer`, detail: `${inr(Number(work.awaitingAcceptanceValue))} to bill once accepted.`, due: null, to: PROJECTS });
    const support = company.support;
    if (support && (support.urgent || support.escalated)) add({ kind: "support", priority: "high", title: `${support.urgent} urgent ticket${support.urgent === 1 ? "" : "s"}, ${support.escalated} escalated`, detail: "Customers waiting on an answer.", due: null, to: TICKETS });
    else if (support?.olderThanWeek) add({ kind: "support", priority: "medium", title: `${support.olderThanWeek} ticket${support.olderThanWeek === 1 ? "" : "s"} open over a week`, detail: "Answer or close them.", due: null, to: TICKETS });
    const stock = company.stock;
    if (stock?.belowReorder) add({ kind: "stock", priority: "medium", title: `Reorder ${stock.belowReorder} item${stock.belowReorder === 1 ? "" : "s"}`, detail: "At or under the reorder level.", due: null, to: OPS });
    if (stock?.expiringBatches) add({ kind: "stock", priority: "medium", title: `${stock.expiringBatches} batch${stock.expiringBatches === 1 ? "" : "es"} expiring within 30 days`, detail: "Sell, move or write them off.", due: null, to: OPS });
  }
  // Sales between your companies this period with no matching bill on the other side: the group's
  // costs and GST credit are short until it is recorded.
  const sold = list.reduce((sum, item) => sum + Number(item.intercompany?.sales ?? 0), 0);
  const billed = list.reduce((sum, item) => sum + Number(item.intercompany?.purchases ?? 0), 0);
  const seller = list.find((item) => Number(item.intercompany?.sales ?? 0) > 0);
  if (seller && sold - billed >= 1) items.push({ key: "group:intercompany", company: seller, kind: "books", priority: "medium", title: `Record ${inr(sold - billed)} of bills between your companies`, detail: `${inr(sold)} sold between them this period, ${inr(billed)} recorded as bills. Record the missing ones in one step under Finance.`, due: null, to: "/portfolio?view=finance" });
  const order = { high: 0, medium: 1, low: 2 };
  return items.sort((a, b) => order[a.priority] - order[b.priority] || (a.due ?? "9999").localeCompare(b.due ?? "9999"));
}
