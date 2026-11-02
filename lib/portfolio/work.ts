import type { CompanyBook } from "@/lib/portfolio/books";
import type { Obligation } from "@/lib/portfolio/compliance";
import type { Severity, Signal } from "@/lib/portfolio/intelligence";
import { addDays } from "@/lib/portfolio/period";
import { dueAmount, FUND_OWNER_LIMIT } from "@/lib/stores/finance-store";
import { inr } from "@/lib/portfolio/metrics";
import { todayIso } from "@/lib/today";

/**
 * The Portfolio's work inbox: everything across the companies that waits on a decision or an action. It reads
 * each company's records and links to where the action is taken there; it does not copy the record. Deadlines
 * come from the record (due dates, close dates, filing dates). Where the record has none, none is shown.
 */

export type WorkType = "approval" | "finance" | "sales" | "compliance" | "people" | "janus";
export const WORK_TYPE_LABEL: Record<WorkType, string> = { approval: "Approvals & decisions", finance: "Financial follow-ups", sales: "Sales & customers", compliance: "Compliance", people: "People", janus: "Janus recommendations" };
export interface WorkItem {
  id: string; companyId: string; type: WorkType; title: string; detail: string; priority: Severity; owner: string;
  deadline: string | null; status: string; overdue: boolean; href: string; inCompany: boolean; money: boolean;
}

const FIN = "/workspace/finance-accounting?workspace=finance-accounting&view=";
const HR = "/workspace/hr-people?workspace=hr-people&view=";

export function workFor(books: CompanyBook[], obligations: Obligation[], signals: Signal[], today = todayIso()): WorkItem[] {
  const out: WorkItem[] = [];
  const soon = addDays(today, 7);
  for (const book of books) {
    const id = book.record.id;
    const f = book.finance;
    if (f) {
      for (const request of f.fundRequests.filter((item) => item.status === "pending" || item.status === "awaiting_finance")) out.push({ id: `${id}:fund:${request.id}`, companyId: id, type: "approval", title: `Fund request ${request.number}: ${request.purpose}`, detail: `${inr(request.amount)} requested by ${request.requestedBy} on ${request.date}${request.amount > FUND_OWNER_LIMIT ? ". Above the owner limit, so finance approves too." : "."}`, priority: request.amount > FUND_OWNER_LIMIT ? "high" : "medium", owner: request.status === "pending" ? "Owner" : "Finance", deadline: null, status: request.status === "pending" ? "Waiting for owner" : "Waiting for finance", overdue: false, href: `${FIN}approvals`, inCompany: true, money: true });
      for (const note of f.creditNotes.filter((item) => item.status === "pending")) out.push({ id: `${id}:cn:${note.id}`, companyId: id, type: "approval", title: `${note.kind === "write-off" ? "Write-off" : "Credit note"} ${note.number}`, detail: `${inr(note.amount)}: ${note.reason}. Raised by ${note.createdBy}.`, priority: "medium", owner: "Owner", deadline: null, status: "Waiting for approval", overdue: false, href: `${FIN}credit-notes`, inCompany: true, money: true });
      for (const invoice of f.invoices.filter((item) => !item.cancelled && item.dueDate < today && dueAmount(item, f.creditNotes) > 0)) {
        const due = dueAmount(invoice, f.creditNotes);
        const late = Math.round((Date.parse(today) - Date.parse(invoice.dueDate)) / 86400000);
        out.push({ id: `${id}:inv:${invoice.id}`, companyId: id, type: "finance", title: `Collect ${inr(due)} from ${invoice.customerCompany || invoice.customer}`, detail: `Invoice ${invoice.number}, ${late} day${late === 1 ? "" : "s"} overdue.`, priority: late > 30 || due >= 100000 ? "high" : "medium", owner: invoice.createdBy, deadline: invoice.dueDate, status: "Overdue", overdue: true, href: `${FIN}invoices`, inCompany: true, money: true });
      }
      for (const bill of f.bills) {
        const owed = bill.amount - bill.payments.reduce((sum, item) => sum + item.amount, 0);
        if (owed <= 0.001 || bill.dueDate > soon) continue;
        const overdue = bill.dueDate < today;
        out.push({ id: `${id}:bill:${bill.id}`, companyId: id, type: "finance", title: `Pay ${bill.vendor} ${inr(owed)}`, detail: `Bill ${bill.number} (${bill.vendorBillNo}), due ${bill.dueDate}.`, priority: overdue ? "high" : "medium", owner: bill.createdBy, deadline: bill.dueDate, status: overdue ? "Overdue" : "Due soon", overdue, href: `${FIN}payables`, inCompany: true, money: true });
      }
    }
    if (book.on.hr) {
      for (const leave of book.leave.filter((item) => item.status === "pending" || item.status === "needs_clarification")) out.push({ id: `${id}:leave:${leave.id}`, companyId: id, type: "people", title: `Leave: ${leave.employeeName}, ${leave.days} day${leave.days === 1 ? "" : "s"}`, detail: `${leave.from} to ${leave.to}. ${leave.reason}`, priority: leave.from <= addDays(today, 2) ? "high" : "low", owner: leave.step === "hr" ? "HR" : leave.managerName || "Manager", deadline: leave.from, status: leave.status === "needs_clarification" ? "Needs clarification" : "Waiting for decision", overdue: leave.from < today, href: `${HR}approvals`, inCompany: true, money: false });
      for (const claim of book.claims.filter((item) => ["submitted", "manager_review", "hr_review"].includes(item.status))) out.push({ id: `${id}:claim:${claim.id}`, companyId: id, type: "approval", title: `Expense claim: ${claim.employeeName}, ${inr(claim.amount)}`, detail: `${claim.category} · submitted ${claim.submittedAt.slice(0, 10)}${claim.receiptAttached ? "" : " · no receipt attached"}.`, priority: claim.receiptAttached ? "low" : "medium", owner: claim.approverName || "Approver", deadline: null, status: "Waiting for approval", overdue: false, href: `${HR}expenses`, inCompany: true, money: true });
    }
    if (book.on.crm) {
      for (const deal of book.deals.filter((item) => ["proposal", "negotiation", "approval"].includes(item.stage) && item.expectedCloseAt && item.expectedCloseAt.slice(0, 10) <= soon)) {
        const close = (deal.expectedCloseAt ?? "").slice(0, 10);
        out.push({ id: `${id}:deal:${deal.id}`, companyId: id, type: "sales", title: `${deal.name} · ${deal.company}`, detail: `${inr(Number(deal.amount))} in ${deal.stage}. ${close < today ? "The expected close date has passed." : "Expected to close this week."}`, priority: close < today || Number(deal.amount) >= 300000 ? "high" : "medium", owner: deal.ownerName ?? "Unassigned", deadline: close, status: close < today ? "Close date passed" : "Closing soon", overdue: close < today, href: "/deals?workspace=crm-sales", inCompany: true, money: false });
      }
    }
  }
  for (const item of obligations.filter((entry) => entry.status === "unconfirmed" || entry.status === "due-soon")) out.push({ id: `${item.companyId}:ob:${item.key}`, companyId: item.companyId, type: "compliance", title: `${item.form}: ${item.title}`, detail: `${item.period} · ${item.authority}${item.blockedBy ? ` · ${item.blockedBy}` : ""}`, priority: item.status === "unconfirmed" ? "high" : "medium", owner: item.owner || "Unassigned", deadline: item.due, status: item.status === "unconfirmed" ? "Not confirmed" : "Due soon", overdue: item.status === "unconfirmed", href: `/portfolio?view=compliance&company=${item.companyId}`, inCompany: false, money: false });
  // Janus findings that call for a decision and are not already an item above.
  for (const signal of signals.filter((item) => item.companyId && item.action && !item.positive && item.severity !== "low" && !["compliance", "setup"].includes(item.category) && !item.id.endsWith(":overdue"))) out.push({ id: `janus:${signal.id}`, companyId: signal.companyId!, type: "janus", title: signal.title, detail: signal.detail, priority: signal.severity, owner: "Unassigned", deadline: null, status: signal.basis === "estimate" ? "Recommendation (estimate)" : "Recommendation", overdue: false, href: signal.action!.href, inCompany: Boolean(signal.action!.companyId), money: signal.money });
  const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => order[a.priority] - order[b.priority] || Number(b.overdue) - Number(a.overdue) || (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"));
}
