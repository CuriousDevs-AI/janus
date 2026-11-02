import type { CompanyBook } from "@/lib/portfolio/books";
import type { LogEntry } from "@/lib/portfolio/state";
import { invoiceTotals } from "@/lib/stores/finance-store";
import { inr } from "@/lib/portfolio/metrics";

/**
 * One timeline across every company, built from dated records: leads, deals, invoices, payments, bills,
 * approvals, leave and claims, the finance audit trail, and changes made in the Portfolio itself.
 */

export type ActivityType = "sales" | "finance" | "team" | "approval" | "company" | "compliance" | "access";
export const ACTIVITY_LABEL: Record<ActivityType, string> = { sales: "Sales & customers", finance: "Financial", team: "Team", approval: "Approvals & decisions", company: "Company profile", compliance: "Compliance", access: "Access" };
export interface ActivityEvent { id: string; companyId: string | null; date: string; time: string; type: ActivityType; user: string; text: string; href?: string; money: boolean }

const time = (value: string) => value.length > 10 ? value : `${value}T00:00:00`;

export function activityFor(books: CompanyBook[], log: LogEntry[]): ActivityEvent[] {
  const out: ActivityEvent[] = [];
  for (const book of books) {
    const id = book.record.id;
    out.push({ id: `${id}:created`, companyId: id, date: book.record.createdAt, time: time(book.record.createdAt), type: "company", user: "Pankaj Neema", text: `${book.record.name} was added to the Portfolio`, money: false });
    for (const lead of book.leads) out.push({ id: `${id}:lead:${lead.id}`, companyId: id, date: lead.createdAt.slice(0, 10), time: lead.createdAt, type: "sales", user: lead.ownerName ?? "Unassigned", text: `New lead from ${lead.company || lead.contactName} via ${lead.source === "phone_call" ? "phone" : lead.source === "whatsapp" ? "WhatsApp" : "website"}`, href: "/leads?workspace=crm-sales", money: false });
    for (const deal of book.deals.filter((item) => item.stage === "won" || item.stage === "lost")) out.push({ id: `${id}:deal:${deal.id}`, companyId: id, date: deal.updatedAt.slice(0, 10), time: deal.updatedAt, type: "sales", user: deal.ownerName ?? "Unassigned", text: `Deal ${deal.stage}: ${deal.name} with ${deal.company} (${inr(Number(deal.amount))})${deal.stage === "lost" && deal.lostReason ? `. Reason: ${deal.lostReason}` : ""}`, href: "/deals?workspace=crm-sales", money: false });
    const f = book.finance;
    if (f) {
      for (const invoice of f.invoices) {
        out.push({ id: `${id}:inv:${invoice.id}`, companyId: id, date: invoice.date, time: time(invoice.date), type: "finance", user: invoice.createdBy, text: `Invoice ${invoice.number} raised to ${invoice.customerCompany || invoice.customer}: ${inr(invoiceTotals(invoice).total)}${invoice.cancelled ? " (cancelled)" : ""}`, href: "/workspace/finance-accounting?workspace=finance-accounting&view=invoices", money: true });
        for (const payment of invoice.payments) out.push({ id: `${id}:pay:${payment.id}`, companyId: id, date: payment.date, time: time(payment.date), type: "finance", user: invoice.createdBy, text: `Received ${inr(payment.amount)} from ${invoice.customerCompany || invoice.customer} by ${payment.method} (${invoice.number})`, money: true });
      }
      for (const bill of f.bills) {
        out.push({ id: `${id}:bill:${bill.id}`, companyId: id, date: bill.date, time: time(bill.date), type: "finance", user: bill.createdBy, text: `Bill ${bill.number} from ${bill.vendor}: ${inr(bill.amount)}`, money: true });
        for (const payment of bill.payments) out.push({ id: `${id}:bpay:${payment.id}`, companyId: id, date: payment.date, time: time(payment.date), type: "finance", user: bill.createdBy, text: `Paid ${bill.vendor} ${inr(payment.amount)} (${bill.number})`, money: true });
      }
      for (const request of f.fundRequests) out.push({ id: `${id}:fund:${request.id}`, companyId: id, date: request.date, time: time(request.date), type: "approval", user: request.requestedBy, text: `Fund request ${request.number} for ${inr(request.amount)}: ${request.purpose} (${request.status.replace("_", " ")})`, money: true });
      for (const note of f.creditNotes) out.push({ id: `${id}:cn:${note.id}`, companyId: id, date: note.date, time: time(note.date), type: "approval", user: note.approvedBy ?? note.rejectedBy ?? note.createdBy, text: `${note.kind === "write-off" ? "Write-off" : "Credit note"} ${note.number} for ${inr(note.amount)} ${note.status}`, money: true });
      for (const entry of f.trail) out.push({ id: `${id}:trail:${entry.id}`, companyId: id, date: entry.at, time: entry.ts, type: "finance", user: entry.by, text: entry.text, money: true });
    }
    if (book.on.hr) {
      for (const leave of book.leave) out.push({ id: `${id}:leave:${leave.id}`, companyId: id, date: leave.createdAt.slice(0, 10), time: leave.createdAt, type: "team", user: leave.employeeName, text: `Leave request ${leave.from} to ${leave.to} (${leave.days} day${leave.days === 1 ? "" : "s"}): ${leave.status.replace("_", " ")}`, money: false });
      for (const claim of book.claims) out.push({ id: `${id}:claim:${claim.id}`, companyId: id, date: claim.submittedAt.slice(0, 10), time: claim.submittedAt, type: "team", user: claim.employeeName, text: `Expense claim ${inr(claim.amount)} (${claim.category}): ${claim.status.replace(/_/g, " ")}`, money: true });
      for (const person of book.employees.filter((item) => item.joiningDate)) out.push({ id: `${id}:join:${person.id}`, companyId: id, date: person.joiningDate, time: time(person.joiningDate), type: "team", user: person.name, text: `${person.name} joined as ${person.title}, ${person.department}`, money: false });
    }
  }
  const known = new Set(books.map((book) => book.record.id));
  for (const entry of log.filter((item) => item.companyId === null || known.has(item.companyId))) out.push({ id: entry.id, companyId: entry.companyId, date: entry.date, time: entry.at, type: entry.type === "target" ? "company" : entry.type, user: entry.by, text: entry.text, money: entry.type === "target" });
  return out.sort((a, b) => b.time.localeCompare(a.time));
}
