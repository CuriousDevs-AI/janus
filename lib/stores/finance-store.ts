"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { workspaceStorage } from "@/lib/stores/workspace-storage";
import { isFirstCompany } from "@/lib/companies";
import { scoped } from "@/lib/company";
import { periodLockProblem } from "@/lib/stores/period-lock-store";
import { type TrailEntry, trailEntry, withTrail } from "@/lib/stores/audit-trail";
import { useOperationsStore } from "@/lib/stores/operations-store";
import { threeWayMatch } from "@/lib/three-way-match";
import { workflowRules } from "@/lib/stores/workflow-rules-store";

/**
 * Finance & Accounting (phase 1): invoices with GST split, payments, credit notes,
 * fund requests with approval, and budget lines that fund requests allocate to.
 * Every amount is INR, rounded to paise. Each company keeps its own records.
 */

export const GST_RATES = [0, 5, 12, 18, 28] as const;
/** Fund requests above this amount need a second approval from finance. */
export const FUND_OWNER_LIMIT = 50000;

export interface InvoiceLine { item: string; hsn: string; qty: number; rate: number; gstRate: number }
export interface Payment { id: string; amount: number; method: "UPI" | "Bank transfer" | "Cash" | "Cheque"; reference: string; date: string }
export interface Invoice {
  id: string; number: string; customer: string; customerCompany: string; date: string; dueDate: string;
  sameState: boolean; lines: InvoiceLine[]; payments: Payment[]; createdBy: string; cancelled?: boolean; dealId?: string;
}
/** A write-off is bad debt: it clears what the customer owes, but it is a cost in profit and loss, not a cut to sales. */
export interface CreditNote { id: string; number: string; invoiceId: string; amount: number; reason: string; status: "pending" | "approved" | "rejected"; createdBy: string; approvedBy?: string; rejectedBy?: string; rejectedReason?: string; date: string; ticketId?: string; kind?: "credit" | "write-off" }
export interface BudgetLine { id: string; name: string; owner: string; allocated: number; drawn: number }
export interface FundRequest {
  id: string; number: string; purpose: string; amount: number; lineId: string; requestedBy: string; date: string;
  status: "pending" | "awaiting_finance" | "approved" | "rejected"; ownerApprovedBy?: string; financeApprovedBy?: string; rejectedBy?: string; rejectedReason?: string;
}
export interface Draw { id: string; lineId: string; amount: number; note: string; by: string; date: string }
/** A bank movement that is not in the books: bank charges, loan instalments, capital in. Amount is signed: + in, − out. */
export interface BankEntry { id: string; date: string; description: string; amount: number }

/** A line from the bank statement. Amount is signed: + credit (money in), − debit (money out). */
export interface BankLine { id: string; date: string; description: string; amount: number; matchedKey: string | null }

/** A business expense: paid from the petty cash float or from the bank. Amount is ex-GST, as entered. */
export interface Expense { id: string; date: string; category: (typeof EXPENSE_CATEGORIES)[number]; payee: string; amount: number; gstRate: number; paidFrom: "petty cash" | "bank"; by: string }
/** Money moved from the bank into the petty cash float. */
export interface PettyCashTopUp { id: string; date: string; amount: number; by: string }
export const EXPENSE_CATEGORIES = ["Travel", "Office", "Utilities", "Repairs", "Other"] as const;

/** The planned spend for one budget line in one quarter of an Indian financial year (April to March). */
export interface BudgetPlan { id: string; lineId: string; fiscalYear: string; quarter: 1 | 2 | 3 | 4; planned: number }

/** The financial year and quarter a date falls in. 2026-10-23 is Q3 of FY 2026-27. */
export function fiscalPeriod(date: string): { fiscalYear: string; quarter: 1 | 2 | 3 | 4 } {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const startYear = month >= 4 ? year : year - 1;
  const quarter = month >= 4 && month <= 6 ? 1 : month >= 7 && month <= 9 ? 2 : month >= 10 && month <= 12 ? 3 : 4;
  return { fiscalYear: `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`, quarter };
}
/** A bill from a vendor: money the company owes, paid in one or more payments. */
export interface Bill { id: string; number: string; vendor: string; vendorBillNo: string; date: string; dueDate: string; amount: number; payments: Payment[]; createdBy: string; poId?: string }

export const lineTotals = (line: InvoiceLine) => {
  const taxable = Math.round(line.qty * line.rate * 100) / 100;
  const tax = Math.round(taxable * line.gstRate) / 100;
  return { taxable, tax };
};

export function invoiceTotals(invoice: Invoice) {
  let taxable = 0, cgst = 0, sgst = 0, igst = 0;
  for (const line of invoice.lines) {
    const { taxable: t, tax } = lineTotals(line);
    taxable += t;
    if (invoice.sameState) { cgst += tax / 2; sgst += tax / 2; } else igst += tax;
  }
  const round = (value: number) => Math.round(value * 100) / 100;
  taxable = round(taxable); cgst = round(cgst); sgst = round(sgst); igst = round(igst);
  return { taxable, cgst, sgst, igst, total: round(taxable + cgst + sgst + igst) };
}

interface FinanceState {
  invoices: Invoice[];
  creditNotes: CreditNote[];
  budgetLines: BudgetLine[];
  fundRequests: FundRequest[];
  draws: Draw[];
  bills: Bill[];
  plans: BudgetPlan[];
  bankEntries: BankEntry[];
  openingCash: number;
  bankLines: BankLine[];
  /** Checks a person has signed off for a month, e.g. "2026-10:variances". */
  closeReviews: string[];
  expenses: Expense[];
  pettyCashTopUps: PettyCashTopUp[];
  trail: TrailEntry[];
  addInvoice: (invoice: Omit<Invoice, "id" | "number" | "payments" | "createdBy">, by: string) => string;
  recordPayment: (invoiceId: string, payment: Omit<Payment, "id">, by: string) => string | null;
  addBankEntry: (input: Omit<BankEntry, "id">, by: string) => string | null;
  markCloseReviewed: (month: string, item: string, by: string) => string | null;
  addExpense: (input: Omit<Expense, "id" | "by">, by: string) => string | null;
  topUpPettyCash: (input: { date: string; amount: number }, by: string) => string | null;
  importBankStatement: (text: string, by: string) => { imported: number; errors: string[] };
  matchBankLine: (lineId: string, key: string | null, by: string) => string | null;
  setOpeningCash: (amount: number, by: string) => string | null;
  /** Share capital as the company's books state it (Schedule III, equity). Entered once and kept; it is not derived from sales. */
  shareCapital: number;
  setShareCapital: (amount: number, by: string) => string | null;
  setBudgetPlan: (lineId: string, fiscalYear: string, quarter: BudgetPlan["quarter"], planned: number, by: string) => string | null;
  addBill: (input: { vendor: string; vendorBillNo: string; date: string; dueDate: string; amount: number; poId?: string }, by: string) => string | null;
  recordBillPayment: (billId: string, payment: Omit<Payment, "id">, by: string) => string | null;
  addCreditNote: (input: { invoiceId: string; amount: number; reason: string; date: string; ticketId?: string; kind?: "credit" | "write-off" }, by: string) => string | null;
  decideCreditNote: (id: string, by: string) => string | null;
  rejectCreditNote: (id: string, reason: string, by: string) => string | null;
  addFundRequest: (input: { purpose: string; amount: number; lineId: string; date: string }, by: string) => void;
  approveFundRequest: (id: string, step: "owner" | "finance", by: string) => string | null;
  rejectFundRequest: (id: string, reason: string, by: string) => void;
  addBudgetLine: (input: { name: string; owner: string; allocated: number }) => void;
  drawBudget: (lineId: string, amount: number, note: string, by: string, date: string) => string | null;
  /** Hands unused money back to a budget line, for example when a project closes under budget. */
  releaseBudget: (lineId: string, amount: number, note: string, by: string, date: string) => string | null;
}

const today = "2026-10-23";
const seedFinance = (): Pick<FinanceState, "invoices" | "creditNotes" | "budgetLines" | "fundRequests" | "draws" | "bills" | "bankEntries" | "openingCash" | "bankLines" | "closeReviews" | "expenses" | "pettyCashTopUps"> => {
  if (!isFirstCompany) return { invoices: [], creditNotes: [], budgetLines: [], fundRequests: [], draws: [], bills: [], bankEntries: [], openingCash: 0, bankLines: [], closeReviews: [], expenses: [], pettyCashTopUps: [] };
  const lines: BudgetLine[] = [
    { id: "line-sales", name: "Sales and marketing", owner: "Arjun Mehta", allocated: 300000, drawn: 92000 },
    { id: "line-ops", name: "Warehouse operations", owner: "Neha Verma", allocated: 180000, drawn: 64000 },
    { id: "line-it", name: "IT and software", owner: "Pankaj Neema", allocated: 90000, drawn: 22500 },
  ];
  const invoices: Invoice[] = [
    { id: "inv-1", number: "INV-2026-0101", customer: "Kavita Rao", customerCompany: "Northstar Retail", date: "2026-10-01", dueDate: "2026-10-31", sameState: true, createdBy: "Pankaj Neema", lines: [{ item: "Festive staples pack", hsn: "1904", qty: 40, rate: 1200, gstRate: 12 }, { item: "Gift hamper", hsn: "2106", qty: 10, rate: 2400, gstRate: 18 }], payments: [{ id: "pay-1", amount: 30000, method: "UPI", reference: "UPI-88213", date: "2026-10-10" }] },
    { id: "inv-2", number: "INV-2026-0102", customer: "Bhanwar Singh", customerCompany: "Rajputana Wholesale Co-op", date: "2026-09-15", dueDate: "2026-10-15", sameState: false, createdBy: "Arjun Mehta", lines: [{ item: "Basmati rice 25 kg", hsn: "1006", qty: 120, rate: 1450, gstRate: 5 }], payments: [] },
    { id: "inv-3", number: "INV-2026-0103", customer: "Suresh Nair", customerCompany: "Metro Value Mart", date: "2026-10-18", dueDate: "2026-11-17", sameState: true, createdBy: "Aman Verma", lines: [{ item: "Floor cleaner 5 L", hsn: "3402", qty: 60, rate: 380, gstRate: 18 }], payments: [] },
  ];
  const fundRequests: FundRequest[] = [
    { id: "fund-1", number: "FR-2026-0007", purpose: "Trade fair stall for Rajasthan distributors", amount: 42000, lineId: "line-sales", requestedBy: "Arjun Mehta", date: "2026-10-20", status: "pending" },
    { id: "fund-2", number: "FR-2026-0008", purpose: "Warehouse racking for Jaipur dock", amount: 78000, lineId: "line-ops", requestedBy: "Neha Verma", date: "2026-10-21", status: "awaiting_finance", ownerApprovedBy: "Pankaj Neema" },
  ];
  const bills: Bill[] = [
    { id: "bill-1", number: "BILL-2026-0101", vendor: "Gurugram Packaging Co", vendorBillNo: "GPC/2610/88", date: "2026-10-15", dueDate: "2026-10-30", amount: 45000, payments: [], createdBy: "Aman Verma" },
    { id: "bill-2", number: "BILL-2026-0102", vendor: "Udyog Electricals", vendorBillNo: "UE-4471", date: "2026-10-01", dueDate: "2026-10-12", amount: 12500, payments: [{ id: "bpay-1", amount: 12500, method: "Bank transfer", reference: "NEFT-55201", date: "2026-10-11" }], createdBy: "Aman Verma" },
  ];
  const bankEntries: BankEntry[] = [
    { id: "bank-1", date: "2026-10-05", description: "Bank charges, September", amount: -850 },
  ];
  const bankLines: BankLine[] = [
    { id: "bl-1", date: "2026-10-10", description: "NEFT Kavita Rao", amount: 30000, matchedKey: "inv:inv-1:pay-1" },
    { id: "bl-2", date: "2026-10-11", description: "NEFT Udyog Electricals", amount: -12500, matchedKey: "bill:bill-2:bpay-1" },
    { id: "bl-3", date: "2026-10-18", description: "NEFT from unknown remitter", amount: 5000, matchedKey: null },
  ];
  return { invoices, creditNotes: [], budgetLines: lines, fundRequests, draws: [], bills, bankEntries, openingCash: 250000, bankLines, closeReviews: [], expenses: [], pettyCashTopUps: [] };
};

const nextNumber = (prefix: string, count: number) => `${prefix}-2026-${String(101 + count).padStart(4, "0")}`;

export const useFinanceStore = create<FinanceState>()(
  persist(
    (set, get) => ({
      ...seedFinance(),
      trail: [],
      bills: seedFinance().bills,
      plans: [],
      shareCapital: 0,
      setShareCapital: (amount, by) => {
        if (!(amount >= 0)) return "Share capital cannot be negative.";
        set((state) => ({ shareCapital: amount, trail: withTrail(state.trail, trailEntry("finance", today, by, `Set share capital to ₹${amount.toLocaleString("en-IN")}`)) }));
        return null;
      },
      setOpeningCash: (amount, by) => {
        if (!(amount >= 0)) return "The opening cash cannot be negative.";
        set((state) => ({ openingCash: amount, trail: withTrail(state.trail, trailEntry("finance", today, by, `Set opening cash to ₹${amount.toLocaleString("en-IN")}`)) }));
        return null;
      },
      importBankStatement: (text, by) => {
        const errors: string[] = [];
        const lines: BankLine[] = [];
        text.split("\n").map((row) => row.trim()).filter(Boolean).forEach((row, index) => {
          const [date, ...rest] = row.split(",");
          const amountText = rest.pop() ?? "";
          const description = rest.join(",").trim();
          const amount = Number(amountText.trim());
          if (!/^\d{4}-\d{2}-\d{2}$/.test((date ?? "").trim())) return errors.push(`Line ${index + 1}: the date must be YYYY-MM-DD.`);
          if (description.length < 2) return errors.push(`Line ${index + 1}: add a description.`);
          if (!Number.isFinite(amount) || amount === 0) return errors.push(`Line ${index + 1}: the amount must be a number, + for money in and - for money out.`);
          lines.push({ id: `bl-${Date.now()}-${index}`, date: date.trim(), description, amount, matchedKey: null });
        });
        if (lines.length > 0) {
          set((state) => ({
            bankLines: [...lines, ...state.bankLines],
            trail: withTrail(state.trail, trailEntry("finance", today, by, `Imported ${lines.length} bank statement line${lines.length === 1 ? "" : "s"}`)),
          }));
        }
        return { imported: lines.length, errors };
      },
      matchBankLine: (lineId, key, by) => {
        const line = get().bankLines.find((l) => l.id === lineId);
        if (!line) return "Bank line not found.";
        if (key === null) {
          set((state) => ({ bankLines: state.bankLines.map((l) => l.id === lineId ? { ...l, matchedKey: null } : l) }));
          return null;
        }
        const taken = get().bankLines.some((l) => l.id !== lineId && l.matchedKey === key);
        if (taken) return "That payment is already matched to another bank line.";
        const [kind, recordId, paymentId] = key.split(":");
        if (kind === "inv") {
          const invoice = get().invoices.find((i) => i.id === recordId);
          const payment = invoice?.payments.find((p) => p.id === paymentId);
          if (!payment) return "Payment not found.";
          if (line.amount <= 0) return "A money-out line cannot match a customer payment.";
          if (Math.abs(line.amount - payment.amount) > 0.001) return `Amounts differ: the bank line is ₹${line.amount.toLocaleString("en-IN")} and the payment is ₹${payment.amount.toLocaleString("en-IN")}.`;
        } else if (kind === "bill") {
          const bill = get().bills.find((b) => b.id === recordId);
          const payment = bill?.payments.find((p) => p.id === paymentId);
          if (!payment) return "Payment not found.";
          if (line.amount >= 0) return "A money-in line cannot match a bill payment.";
          if (Math.abs(-line.amount - payment.amount) > 0.001) return `Amounts differ: the bank line is ₹${Math.abs(line.amount).toLocaleString("en-IN")} and the payment is ₹${payment.amount.toLocaleString("en-IN")}.`;
        } else return "Choose a payment to match.";
        set((state) => ({
          bankLines: state.bankLines.map((l) => l.id === lineId ? { ...l, matchedKey: key } : l),
          trail: withTrail(state.trail, trailEntry("finance", today, by, `Matched bank line ${line.description} to ${key}`)),
        }));
        return null;
      },
      addBankEntry: (input, by) => {
        const locked = periodLockProblem(input.date);
        if (locked) return locked;
        if (input.description.trim().length < 3) return "Describe the bank movement.";
        if (!(input.amount !== 0)) return "Enter an amount.";
        const entry: BankEntry = { id: `bank-${Date.now()}`, date: input.date, description: input.description.trim(), amount: input.amount };
        set((state) => ({
          bankEntries: [entry, ...state.bankEntries],
          trail: withTrail(state.trail, trailEntry("finance", today, by, `Bank ${input.amount > 0 ? "in" : "out"} ₹${Math.abs(input.amount).toLocaleString("en-IN")}: ${entry.description}`)),
        }));
        return null;
      },
      addInvoice: (input, by) => {
        const number = nextNumber("INV", get().invoices.length);
        const id = `inv-${Date.now()}`;
        const invoice: Invoice = { ...input, id, number, payments: [], createdBy: by };
        const total = invoiceTotals(invoice).total;
        set((state) => ({ invoices: [invoice, ...state.invoices], trail: withTrail(state.trail, trailEntry("finance", today, by, `Created invoice ${number} for ${input.customer} · ₹${total.toLocaleString("en-IN")}`)) }));
        return number;
      },
      recordPayment: (invoiceId, payment, by) => {
        const locked = periodLockProblem(payment.date);
        if (locked) return locked;
        const invoice = get().invoices.find((item) => item.id === invoiceId);
        if (!invoice) return "Invoice not found.";
        const due = dueAmount(invoice, get().creditNotes);
        if (payment.amount <= 0) return "Enter an amount above zero.";
        if (payment.amount > due + 0.001) return `Payment is more than the ₹${due.toLocaleString("en-IN")} still due.`;
        set((state) => ({
          invoices: state.invoices.map((item) => item.id === invoiceId ? { ...item, payments: [...item.payments, { ...payment, id: `pay-${Date.now()}` }] } : item),
          trail: withTrail(state.trail, trailEntry("finance", today, by,`Payment ₹${payment.amount.toLocaleString("en-IN")} recorded on ${invoice.number} (${payment.method})`)),
        }));
        return null;
      },
      addCreditNote: (input, by) => {
        const locked = periodLockProblem(input.date);
        if (locked) return locked;
        const invoice = get().invoices.find((item) => item.id === input.invoiceId);
        if (!invoice) return "Invoice not found.";
        if (input.amount <= 0) return "Enter an amount above zero.";
        const writeOff = input.kind === "write-off";
        const left = writeOff
          ? dueAmount(invoice, get().creditNotes)
          : invoiceTotals(invoice).total - creditedAmount(invoice.id, get().creditNotes, true);
        if (input.amount > left) return writeOff ? "A write-off cannot be more than what the customer still owes." : "A credit note cannot be more than the invoice total left to credit.";
        if (input.reason.trim().length < 3) return writeOff ? "Give the reason this debt cannot be recovered." : "Give a reason for the credit note.";
        const number = nextNumber(writeOff ? "WO" : "CN", get().creditNotes.length);
        const label = writeOff ? "write-off" : "credit note";
        set((state) => ({
          creditNotes: [{ id: `cn-${Date.now()}`, number, status: "pending", createdBy: by, ...input, kind: writeOff ? "write-off" : "credit" }, ...state.creditNotes],
          trail: withTrail(state.trail, trailEntry("finance", today, by, `Requested ${label} ${number} of ₹${input.amount.toLocaleString("en-IN")} against ${invoice.number}`)),
        }));
        return null;
      },
      decideCreditNote: (id, by) => {
        const note = get().creditNotes.find((item) => item.id === id);
        if (!note) return "Credit note not found.";
        if (note.createdBy === by) return "The person who created a credit note cannot approve it.";
        set((state) => ({
          creditNotes: state.creditNotes.map((item) => item.id === id ? { ...item, status: "approved", approvedBy: by } : item),
          trail: withTrail(state.trail, trailEntry("finance", today, by, `Approved credit note ${note.number} of ₹${note.amount.toLocaleString("en-IN")}`)),
        }));
        return null;
      },
      rejectCreditNote: (id, reason, by) => {
        const note = get().creditNotes.find((item) => item.id === id);
        if (!note) return "Credit note not found.";
        if (note.status !== "pending") return "Only a pending credit note can be rejected.";
        if (note.createdBy === by) return "The person who created a credit note cannot reject it.";
        if (reason.trim().length < 3) return "Give the reason for rejecting it.";
        set((state) => ({
          creditNotes: state.creditNotes.map((item) => item.id === id ? { ...item, status: "rejected", rejectedBy: by, rejectedReason: reason.trim() } : item),
          trail: withTrail(state.trail, trailEntry("finance", today, by, `Rejected credit note ${note.number}: ${reason.trim()}`)),
        }));
        return null;
      },
      addExpense: (input, by) => {
        const locked = periodLockProblem(input.date);
        if (locked) return locked;
        if (input.payee.trim().length < 2) return "Enter who was paid.";
        if (!(input.amount > 0)) return "Enter an amount above zero.";
        if (!(input.gstRate >= 0 && input.gstRate <= 28)) return "GST rate must be between 0 and 28.";
        if (input.paidFrom === "petty cash") {
          const balance = pettyCashBalance(get().pettyCashTopUps, get().expenses);
          if (input.amount > balance + 0.001) return `Petty cash has ₹${balance.toLocaleString("en-IN")}. Top it up before paying ₹${input.amount.toLocaleString("en-IN")} from it.`;
        }
        const expense: Expense = { ...input, id: `exp-${Date.now()}`, payee: input.payee.trim(), by };
        set((state) => ({
          expenses: [expense, ...state.expenses],
          trail: withTrail(state.trail, trailEntry("finance", input.date, by, `Expense ${input.category}: ₹${input.amount.toLocaleString("en-IN")} to ${expense.payee}, paid from ${input.paidFrom}`)),
        }));
        return null;
      },
      topUpPettyCash: (input, by) => {
        const locked = periodLockProblem(input.date);
        if (locked) return locked;
        if (!(input.amount > 0)) return "Enter an amount above zero.";
        const topUp: PettyCashTopUp = { id: `pct-${Date.now()}`, date: input.date, amount: input.amount, by };
        set((state) => ({
          pettyCashTopUps: [topUp, ...state.pettyCashTopUps],
          trail: withTrail(state.trail, trailEntry("finance", input.date, by, `Moved ₹${input.amount.toLocaleString("en-IN")} from the bank to petty cash`)),
        }));
        return null;
      },
      markCloseReviewed: (month, item, by) => {
        const key = `${month}:${item}`;
        if (get().closeReviews.includes(key)) return "This check is already signed off.";
        set((state) => ({
          closeReviews: [...state.closeReviews, key],
          trail: withTrail(state.trail, trailEntry("finance", today, by, `Signed off ${item} for ${month}`)),
        }));
        return null;
      },
      setBudgetPlan: (lineId, fiscalYear, quarter, planned, by) => {
        const line = get().budgetLines.find((item) => item.id === lineId);
        if (!line) return "Budget line not found.";
        if (!(planned >= 0)) return "The plan cannot be negative.";
        const existing = get().plans.find((item) => item.lineId === lineId && item.fiscalYear === fiscalYear && item.quarter === quarter);
        const plan: BudgetPlan = existing ? { ...existing, planned } : { id: `plan-${Date.now()}`, lineId, fiscalYear, quarter, planned };
        set((state) => ({
          plans: existing ? state.plans.map((item) => item.id === existing.id ? plan : item) : [...state.plans, plan],
          trail: withTrail(state.trail, trailEntry("finance", today, by, `Planned ₹${planned.toLocaleString("en-IN")} for ${line.name}, Q${quarter} ${fiscalYear}`)),
        }));
        return null;
      },
      addBill: (input, by) => {
        const locked = periodLockProblem(input.date);
        if (locked) return locked;
        if (input.vendor.trim().length < 2) return "Enter the vendor name.";
        if (input.vendorBillNo.trim().length < 2) return "Enter the vendor's bill number.";
        if (!(input.amount > 0)) return "Enter an amount above zero.";
        if (input.dueDate < input.date) return "The due date cannot be before the bill date.";
        if (input.poId) {
          const order = useOperationsStore.getState().purchaseOrders.find((o) => o.id === input.poId);
          if (!order) return "The purchase order was not found.";
          const received = threeWayMatch(input.amount, order, workflowRules().matchTolerancePercent);
          if (received.status === "goods not received") return `No goods have been received against ${order.number} yet.`;
        }
        const number = nextNumber("BILL", get().bills.length);
        const bill: Bill = { id: `bill-${Date.now()}`, number, vendor: input.vendor.trim(), vendorBillNo: input.vendorBillNo.trim(), date: input.date, dueDate: input.dueDate, amount: input.amount, payments: [], createdBy: by, poId: input.poId };
        set((state) => ({
          bills: [bill, ...state.bills],
          trail: withTrail(state.trail, trailEntry("finance", today, by, `Recorded bill ${number} from ${bill.vendor} · ₹${input.amount.toLocaleString("en-IN")}`)),
        }));
        return null;
      },
      recordBillPayment: (billId, payment, by) => {
        const locked = periodLockProblem(payment.date);
        if (locked) return locked;
        const bill = get().bills.find((item) => item.id === billId);
        if (!bill) return "Bill not found.";
        if (bill.poId) {
          const order = useOperationsStore.getState().purchaseOrders.find((o) => o.id === bill.poId);
          const match = threeWayMatch(bill.amount, order, workflowRules().matchTolerancePercent);
          if (!match.matched) return `Payment is held: ${bill.number} does not match its order yet (${match.status}).`;
        }
        const paid = bill.payments.reduce((sum, item) => sum + item.amount, 0);
        const due = Math.round((bill.amount - paid) * 100) / 100;
        if (payment.amount <= 0) return "Enter an amount above zero.";
        if (payment.amount > due + 0.001) return `Payment is more than the ₹${due.toLocaleString("en-IN")} still owed on ${bill.number}.`;
        set((state) => ({
          bills: state.bills.map((item) => item.id === billId ? { ...item, payments: [...item.payments, { ...payment, id: `bpay-${Date.now()}` }] } : item),
          trail: withTrail(state.trail, trailEntry("finance", today, by, `Paid ₹${payment.amount.toLocaleString("en-IN")} on ${bill.number} to ${bill.vendor} (${payment.method})`)),
        }));
        return null;
      },
      addFundRequest: (input, by) => {
        const number = nextNumber("FR", get().fundRequests.length);
        set((state) => ({
          fundRequests: [{ id: `fund-${Date.now()}`, number, status: "pending", requestedBy: by, ...input }, ...state.fundRequests],
          trail: withTrail(state.trail, trailEntry("finance", today, by, `Requested funds ${number} of ₹${input.amount.toLocaleString("en-IN")}: ${input.purpose}`)),
        }));
      },
      approveFundRequest: (id, step, by) => {
        const request = get().fundRequests.find((item) => item.id === id);
        if (!request) return "Request not found.";
        if (request.requestedBy === by) return "You cannot approve your own request.";
        if (step === "owner") {
          if (request.status !== "pending") return "This request is not waiting for the owner.";
          const needsFinance = request.amount > FUND_OWNER_LIMIT;
          const text = needsFinance ? `Owner approved ${request.number}; waiting for finance` : `Owner approved ${request.number}; budget allocated`;
          set((state) => ({
            fundRequests: state.fundRequests.map((item) => item.id === id ? { ...item, ownerApprovedBy: by, status: needsFinance ? "awaiting_finance" : "approved" } : item),
            trail: withTrail(state.trail, trailEntry("finance", today, by, text)),
          }));
          if (!needsFinance) allocate(request.lineId, request.amount);
          return null;
        }
        if (request.status !== "awaiting_finance") return "This request is not waiting for finance.";
        if (request.ownerApprovedBy === by) return "The approver must be a different person from the owner's approval.";
        set((state) => ({
          fundRequests: state.fundRequests.map((item) => item.id === id ? { ...item, financeApprovedBy: by, status: "approved" } : item),
          trail: withTrail(state.trail, trailEntry("finance", today, by, `Finance approved ${request.number}; budget allocated`)),
        }));
        allocate(request.lineId, request.amount);
        return null;
      },
      rejectFundRequest: (id, reason, by) => {
        const request = get().fundRequests.find((item) => item.id === id);
        set((state) => ({
          fundRequests: state.fundRequests.map((item) => item.id === id ? { ...item, status: "rejected", rejectedBy: by, rejectedReason: reason } : item),
          trail: withTrail(state.trail, trailEntry("finance", today, by, `Rejected ${request?.number ?? "a fund request"}: ${reason}`)),
        }));
      },
      addBudgetLine: (input) => {
        set((state) => ({
          budgetLines: [...state.budgetLines, { id: `line-${Date.now()}`, drawn: 0, ...input }],
          trail: withTrail(state.trail, trailEntry("finance", today, "Finance", `Added budget line ${input.name} · ₹${input.allocated.toLocaleString("en-IN")}`)),
        }));
      },
      drawBudget: (lineId, amount, note, by, date) => {
        const locked = periodLockProblem(date);
        if (locked) return locked;
        const line = get().budgetLines.find((item) => item.id === lineId);
        if (!line) return "Budget line not found.";
        if (amount <= 0) return "Enter an amount above zero.";
        if (line.drawn + amount > line.allocated) return `Only ₹${(line.allocated - line.drawn).toLocaleString("en-IN")} is left on this line.`;
        set((state) => ({
          budgetLines: state.budgetLines.map((item) => item.id === lineId ? { ...item, drawn: item.drawn + amount } : item),
          draws: [{ id: `draw-${Date.now()}`, lineId, amount, note, by, date }, ...state.draws],
          trail: withTrail(state.trail, trailEntry("finance", date, by, `Drew ₹${amount.toLocaleString("en-IN")} from ${line.name} for ${note}`)),
        }));
        return null;
      },
      releaseBudget: (lineId, amount, note, by, date) => {
        const locked = periodLockProblem(date);
        if (locked) return locked;
        const line = get().budgetLines.find((item) => item.id === lineId);
        if (!line) return "Budget line not found.";
        if (amount <= 0) return "Nothing to release.";
        if (amount > line.drawn) return `Only ₹${line.drawn.toLocaleString("en-IN")} is drawn on this line.`;
        set((state) => ({
          budgetLines: state.budgetLines.map((item) => item.id === lineId ? { ...item, drawn: item.drawn - amount } : item),
          draws: [{ id: `draw-${Date.now()}`, lineId, amount: -amount, note, by, date }, ...state.draws],
          trail: withTrail(state.trail, trailEntry("finance", date, by, `Released ₹${amount.toLocaleString("en-IN")} to ${line.name} from ${note}`)),
        }));
        return null;
      },
    }),
    { name: scoped("janus.finance.v1"), storage: createJSONStorage(() => workspaceStorage), partialize: (state) => ({ invoices: state.invoices, creditNotes: state.creditNotes, budgetLines: state.budgetLines, fundRequests: state.fundRequests, draws: state.draws, bills: state.bills, plans: state.plans, bankEntries: state.bankEntries, openingCash: state.openingCash, shareCapital: state.shareCapital, bankLines: state.bankLines, closeReviews: state.closeReviews, expenses: state.expenses, pettyCashTopUps: state.pettyCashTopUps, trail: state.trail }) },
  ),
);

function allocate(lineId: string, amount: number) {
  useFinanceStore.setState((state) => ({ budgetLines: state.budgetLines.map((item) => item.id === lineId ? { ...item, allocated: item.allocated + amount } : item) }));
}

/** Credit notes reduce what the customer owes. Pending notes are counted only when `ignorePending` is false. */
/**
 * Profit and loss to date (plan §8.7 V2). Sales are ex-GST. An approved credit note reduces sales by its
 * taxable share of the invoice it refers to. Bills are costs as entered. Payroll and expense claims are
 * not included yet.
 */
export interface GstRow { rate: number; taxable: number; cgst: number; sgst: number; igst: number }

/**
 * GST summary for one month (plan §8.7 V2). Output tax is from the sales invoices, by GST rate; approved credit
 * notes reduce it by their tax share. Input tax is the GST on expenses. This is a summary to check, not a return:
 * it is confirmed with the company's accountant before filing.
 */
export function gstSummary(month: string, invoices: Invoice[], creditNotes: CreditNote[], expenses: Expense[]) {
  const byRate = new Map<number, GstRow>();
  const round = (value: number) => Math.round(value * 100) / 100;
  for (const invoice of invoices.filter((i) => !i.cancelled && i.date.startsWith(month))) {
    for (const line of invoice.lines) {
      const { taxable, tax } = lineTotals(line);
      const row = byRate.get(line.gstRate) ?? { rate: line.gstRate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      row.taxable += taxable;
      if (invoice.sameState) { row.cgst += tax / 2; row.sgst += tax / 2; } else row.igst += tax;
      byRate.set(line.gstRate, row);
    }
  }
  const rows = [...byRate.values()].sort((a, b) => a.rate - b.rate).map((r) => ({ rate: r.rate, taxable: round(r.taxable), cgst: round(r.cgst), sgst: round(r.sgst), igst: round(r.igst) }));
  let creditTax = 0;
  // A bad-debt write-off is a book entry, not a GST credit note: non-payment is not a ground for one under Section 34 of the CGST Act.
  for (const note of creditNotes.filter((n) => n.status === "approved" && n.kind !== "write-off" && n.date.startsWith(month))) {
    const invoice = invoices.find((i) => i.id === note.invoiceId);
    if (!invoice) continue;
    const totals = invoiceTotals(invoice);
    if (totals.total > 0) creditTax += note.amount * ((totals.cgst + totals.sgst + totals.igst) / totals.total);
  }
  const outputTax = round(rows.reduce((sum, r) => sum + r.cgst + r.sgst + r.igst, 0) - creditTax);
  const inputExpenses = expenses.filter((e) => e.date.startsWith(month));
  const inputTax = round(inputExpenses.reduce((sum, e) => sum + e.amount * (e.gstRate / 100), 0));
  return { rows, creditTax: round(creditTax), outputTax, inputTax, netPayable: round(outputTax - inputTax) };
}

export function pettyCashBalance(topUps: PettyCashTopUp[], expenses: Expense[]) {
  const topped = topUps.reduce((sum, t) => sum + t.amount, 0);
  const spent = expenses.filter((e) => e.paidFrom === "petty cash").reduce((sum, e) => sum + e.amount, 0);
  return Math.round((topped - spent) * 100) / 100;
}

export function profitAndLoss(invoices: Invoice[], creditNotes: CreditNote[], bills: Bill[], expenses: Expense[] = []) {
  const live = invoices.filter((invoice) => !invoice.cancelled);
  const sales = live.reduce((sum, invoice) => sum + invoiceTotals(invoice).taxable, 0);
  const credits = creditNotes
    .filter((note) => note.status === "approved" && note.kind !== "write-off")
    .reduce((sum, note) => {
      const invoice = invoices.find((item) => item.id === note.invoiceId);
      if (!invoice) return sum;
      const totals = invoiceTotals(invoice);
      const taxableShare = totals.total > 0 ? totals.taxable / totals.total : 0;
      return sum + note.amount * taxableShare;
    }, 0);
  const writeOffs = creditNotes.filter((note) => note.status === "approved" && note.kind === "write-off").reduce((sum, note) => sum + note.amount, 0);
  const costs = bills.reduce((sum, bill) => sum + bill.amount, 0) + expenses.reduce((sum, e) => sum + e.amount, 0) + writeOffs;
  const round = (value: number) => Math.round(value * 100) / 100;
  const netSales = round(sales - credits);
  const profit = round(netSales - costs);
  return { sales: round(sales), credits: round(credits), netSales, writeOffs: round(writeOffs), costs: round(costs), profit, margin: netSales > 0 ? round((profit / netSales) * 100) : null };
}

export interface CashFlowMonth { month: string; receipts: number; payments: number; other: number; net: number; closing: number }

/**
 * Cash flow by month (plan §8.7 V2). Receipts are customer payments recorded on invoices; payments are bill
 * payments; other is bank movements entered by hand. Closing cash starts from the opening cash.
 */
export function cashFlowByMonth(invoices: Invoice[], bills: Bill[], bankEntries: BankEntry[], openingCash: number, expenses: Expense[] = [], topUps: PettyCashTopUp[] = []): CashFlowMonth[] {
  const byMonth = new Map<string, { receipts: number; payments: number; other: number }>();
  const add = (date: string, key: "receipts" | "payments" | "other", amount: number) => {
    const month = date.slice(0, 7);
    const row = byMonth.get(month) ?? { receipts: 0, payments: 0, other: 0 };
    row[key] += amount;
    byMonth.set(month, row);
  };
  for (const invoice of invoices.filter((i) => !i.cancelled)) for (const payment of invoice.payments) add(payment.date, "receipts", payment.amount);
  for (const bill of bills) for (const payment of bill.payments) add(payment.date, "payments", payment.amount);
  for (const entry of bankEntries) add(entry.date, "other", entry.amount);
  for (const expense of expenses.filter((e) => e.paidFrom === "bank")) add(expense.date, "payments", expense.amount * (1 + expense.gstRate / 100));
  for (const topUp of topUps) add(topUp.date, "payments", topUp.amount);
  const round = (value: number) => Math.round(value * 100) / 100;
  let closing = openingCash;
  return [...byMonth.keys()].sort().map((month) => {
    const row = byMonth.get(month)!;
    const net = round(row.receipts - row.payments + row.other);
    closing = round(closing + net);
    return { month, receipts: round(row.receipts), payments: round(row.payments), other: round(row.other), net, closing };
  });
}

/** Every book payment (customer receipts and bill payments) with the key a bank line matches it by. */
export function bookPayments(invoices: Invoice[], bills: Bill[]) {
  return [
    ...invoices.flatMap((invoice) => invoice.payments.map((p) => ({ key: `inv:${invoice.id}:${p.id}`, date: p.date, amount: p.amount, label: `Receipt ${invoice.number} · ${invoice.customer}`, direction: 1 as const }))),
    ...bills.flatMap((bill) => bill.payments.map((p) => ({ key: `bill:${bill.id}:${p.id}`, date: p.date, amount: p.amount, label: `Payment ${bill.number} · ${bill.vendor}`, direction: -1 as const }))),
  ];
}

export function creditedAmount(invoiceId: string, notes: CreditNote[], includePending: boolean) {
  return notes.filter((note) => note.invoiceId === invoiceId && (note.status === "approved" || (includePending && note.status === "pending"))).reduce((sum, note) => sum + note.amount, 0);
}

export function dueAmount(invoice: Invoice, notes: CreditNote[], options: { ignorePending?: boolean } = {}) {
  const paid = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const credited = creditedAmount(invoice.id, notes, !options.ignorePending);
  return Math.max(0, Math.round((invoiceTotals(invoice).total - paid - credited) * 100) / 100);
}

export function invoiceStatus(invoice: Invoice, notes: CreditNote[]) {
  const due = dueAmount(invoice, notes);
  const paid = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
  if (due <= 0) return "paid" as const;
  if (invoice.dueDate < today) return "overdue" as const;
  return paid > 0 ? "partly paid" as const : "sent" as const;
}

export function agingBucket(invoice: Invoice, notes: CreditNote[]) {
  const due = dueAmount(invoice, notes);
  if (due <= 0) return null;
  const days = Math.floor((Date.parse(today) - Date.parse(invoice.dueDate)) / 86400000);
  if (days <= 0) return "Current";
  if (days <= 30) return "1–30 days";
  if (days <= 60) return "31–60 days";
  if (days <= 90) return "61–90 days";
  return "90+ days";
}

