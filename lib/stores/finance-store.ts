"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { workspaceStorage } from "@/lib/stores/workspace-storage";
import { mergeServerOwned } from "@/lib/stores/server-owned";
import { scoped } from "@/lib/company";
import { periodLockProblem } from "@/lib/stores/period-lock-store";
import { type TrailEntry, trailEntry, withTrail } from "@/lib/stores/audit-trail";
import { useOperationsStore } from "@/lib/stores/operations-store";
import { threeWayMatch } from "@/lib/three-way-match";
import { workflowRules } from "@/lib/stores/workflow-rules-store";

import { api } from "@/lib/api/client";
import { todayIso } from "@/lib/today";

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
  /** The server's total, in rupees, which the amount due is worked from, so no paise are left over. */
  serverTotal?: number;
  /** An opening balance from before Janus: owed and aged like any invoice, but never a sale or GST. */
  opening?: boolean;
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
export const EXPENSE_CATEGORIES = ["Travel", "Office", "Utilities", "Repairs", "Rent", "Professional fees", "Marketing", "Courier & freight", "Insurance", "Subscriptions", "Food & beverages", "Other"] as const;

/** The planned spend for one budget line in one quarter of an Indian financial year (April to March). */
export interface BudgetPlan { id: string; lineId: string; fiscalYear: string; quarter: 1 | 2 | 3 | 4; planned: number }

export interface AccountMaster { code: string; name: string; group: "Assets" | "Liabilities" | "Equity" | "Income" | "Expenses"; subGroup: string; isSystem?: boolean }
export interface CostCenter { id: string; name: string; code: string; head: string; type: "revenue" | "cost" | "profit"; parent?: string; active: boolean }
export interface VendorMaster { id: string; name: string; gstin?: string; pan?: string; address: string; state: string; paymentTermsDays: number; contactName: string; contactEmail: string; contactPhone: string; category: string; msme?: boolean; active: boolean }
export interface CustomerMaster { id: string; name: string; company: string; gstin?: string; pan?: string; address: string; state: string; creditLimitDays: number; creditLimitAmount: number; contactName: string; contactEmail: string; contactPhone: string; segment: string; active: boolean }
export interface Quotation { id: string; number: string; customer: string; customerCompany: string; date: string; validUntil: string; lines: InvoiceLine[]; status: "draft" | "sent" | "accepted" | "rejected" | "expired" | "invoiced"; convertedInvoiceId?: string; createdBy: string; notes: string }
export interface PaymentVoucher { id: string; number: string; date: string; paidTo: string; amount: number; method: "UPI" | "Bank transfer" | "Cash" | "Cheque"; reference: string; narration: string; costCenter?: string; linkedBillId?: string; createdBy: string }
export interface ReceiptVoucher { id: string; number: string; date: string; receivedFrom: string; amount: number; method: "UPI" | "Bank transfer" | "Cash" | "Cheque"; reference: string; narration: string; linkedInvoiceId?: string; createdBy: string }
export interface ContraEntry { id: string; number: string; date: string; from: "cash" | "bank"; to: "cash" | "bank"; amount: number; narration: string; createdBy: string }
export interface AdvancePayment { id: string; date: string; vendor: string; amount: number; poId?: string; billId?: string; adjustedAmount: number; method: "UPI" | "Bank transfer" | "Cash" | "Cheque"; reference: string; createdBy: string }
export interface EInvoiceStatus { invoiceId: string; irn?: string; ackNo?: string; ackDate?: string; status: "pending" | "generated" | "cancelled"; ewayBillNo?: string }
export interface CurrencyRate { code: string; name: string; symbol: string; rateToInr: number; asOf: string }
export interface FyClosing { id: string; fiscalYear: string; status: "open" | "closing" | "closed"; closedBy?: string; closedAt?: string; retainedEarnings: number; openingBalancesCarried: boolean }

const storeMoney = (v: number) => `₹${v.toLocaleString("en-IN")}`;

/** The financial year and quarter a date falls in. 2026-10-23 is Q3 of FY 2026-27. */
export function fiscalPeriod(date: string): { fiscalYear: string; quarter: 1 | 2 | 3 | 4 } {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const startYear = month >= 4 ? year : year - 1;
  const quarter = month >= 4 && month <= 6 ? 1 : month >= 7 && month <= 9 ? 2 : month >= 10 && month <= 12 ? 3 : 4;
  return { fiscalYear: `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`, quarter };
}
/** A bill from a vendor: money the company owes, paid in one or more payments. */
export interface Bill { id: string; number: string; vendor: string; vendorBillNo: string; date: string; dueDate: string; amount: number; payments: Payment[]; createdBy: string; poId?: string; gst?: number; itcBlocked?: boolean; tds?: number; tdsSection?: string }

export const lineTotals = (line: InvoiceLine) => {
  const taxable = Math.round(line.qty * line.rate * 100) / 100;
  const tax = Math.round(taxable * line.gstRate) / 100;
  return { taxable, tax };
};

export function invoiceTotals(invoice: Invoice) {
  // An opening balance has no lines: what is owed is the server's total, and none of it is a sale.
  if (invoice.opening) return { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: invoice.serverTotal ?? 0 };
  let taxable = 0, cgst = 0, sgst = 0, igst = 0;
  for (const line of invoice.lines) {
    const { taxable: t, tax } = lineTotals(line);
    taxable += t;
    if (invoice.sameState) { cgst += tax / 2; sgst += tax / 2; } else igst += tax;
  }
  const round = (value: number) => Math.round(value * 100) / 100;
  taxable = round(taxable); cgst = round(cgst); sgst = round(sgst); igst = round(igst);
  return { taxable, cgst, sgst, igst, total: invoice.serverTotal ?? round(taxable + cgst + sgst + igst) };
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
  approveFundRequest: (id: string, step: "owner" | "finance", by: string) => Promise<string | null>;
  rejectFundRequest: (id: string, reason: string, by: string) => void;
  addBudgetLine: (input: { name: string; owner: string; allocated: number }) => void;
  drawBudget: (lineId: string, amount: number, note: string, by: string, date: string) => string | null;
  /** Hands unused money back to a budget line, for example when a project closes under budget. */
  releaseBudget: (lineId: string, amount: number, note: string, by: string, date: string) => string | null;
  accounts: AccountMaster[];
  costCenters: CostCenter[];
  vendors: VendorMaster[];
  customers: CustomerMaster[];
  quotations: Quotation[];
  paymentVouchers: PaymentVoucher[];
  receiptVouchers: ReceiptVoucher[];
  contraEntries: ContraEntry[];
  advancePayments: AdvancePayment[];
  eInvoiceStatuses: EInvoiceStatus[];
  currencyRates: CurrencyRate[];
  fyClosings: FyClosing[];
  addVendor: (input: Omit<VendorMaster, "id" | "active">, by: string) => string | null;
  updateVendor: (id: string, input: Partial<Omit<VendorMaster, "id">>, by: string) => string | null;
  addCustomer: (input: Omit<CustomerMaster, "id" | "active">, by: string) => string | null;
  updateCustomer: (id: string, input: Partial<Omit<CustomerMaster, "id">>, by: string) => string | null;
  addAccount: (input: AccountMaster, by: string) => string | null;
  updateAccount: (code: string, input: Partial<Omit<AccountMaster, "code">>, by: string) => string | null;
  addCostCenter: (input: Omit<CostCenter, "id">, by: string) => string | null;
  updateCostCenter: (id: string, input: Partial<Omit<CostCenter, "id">>, by: string) => string | null;
  addQuotation: (input: Omit<Quotation, "id" | "number" | "status" | "createdBy">, by: string) => string | null;
  convertQuotation: (id: string, by: string) => string | null;
  addPaymentVoucher: (input: Omit<PaymentVoucher, "id" | "number" | "createdBy">, by: string) => string | null;
  addReceiptVoucher: (input: Omit<ReceiptVoucher, "id" | "number" | "createdBy">, by: string) => string | null;
  addContraEntry: (input: Omit<ContraEntry, "id" | "number" | "createdBy">, by: string) => string | null;
  addAdvancePayment: (input: Omit<AdvancePayment, "id" | "adjustedAmount" | "createdBy">, by: string) => string | null;
  adjustAdvance: (id: string, billId: string, amount: number, by: string) => string | null;
  generateEInvoice: (invoiceId: string, by: string) => string | null;
  bulkGenerateEInvoice: (invoiceIds: string[], by: string) => { generated: number; errors: string[] };
  closeFiscalYear: (fiscalYear: string, by: string) => string | null;
  reopenFiscalYear: (fiscalYear: string, by: string) => string | null;
  updateCurrencyRate: (code: string, rateToInr: number, by: string) => string | null;
}

const today = todayIso();
type FinanceSeed = Pick<FinanceState, "invoices" | "creditNotes" | "budgetLines" | "fundRequests" | "draws" | "bills" | "bankEntries" | "openingCash" | "bankLines" | "closeReviews" | "expenses" | "pettyCashTopUps" | "accounts" | "costCenters" | "vendors" | "customers" | "quotations" | "paymentVouchers" | "receiptVouchers" | "contraEntries" | "advancePayments" | "eInvoiceStatuses" | "currencyRates" | "fyClosings">;
const emptyFinance = (): FinanceSeed => ({ invoices: [], creditNotes: [], budgetLines: [], fundRequests: [], draws: [], bills: [], bankEntries: [], openingCash: 0, bankLines: [], closeReviews: [], expenses: [], pettyCashTopUps: [], accounts: [], costCenters: [], vendors: [], customers: [], quotations: [], paymentVouchers: [], receiptVouchers: [], contraEntries: [], advancePayments: [], eInvoiceStatuses: [], currencyRates: [], fyClosings: [] });
const nextNumber = (prefix: string, count: number) => `${prefix}-2026-${String(101 + count).padStart(4, "0")}`;

export const useFinanceStore = create<FinanceState>()(
  persist(
    (set, get) => ({
      ...emptyFinance(),
      trail: [],
      bills: emptyFinance().bills,
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
          const match = threeWayMatch(bill.amount - (bill.gst ?? 0), order, workflowRules().matchTolerancePercent);
          if (!match.matched) return `Payment is held: ${bill.number} does not match its order yet (${match.status}).`;
        }
        const paid = bill.payments.reduce((sum, item) => sum + item.amount, 0);
        const due = Math.round((bill.amount - (bill.tds ?? 0) - paid) * 100) / 100;
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
      approveFundRequest: async (id, step, by) => {
        const request = get().fundRequests.find((item) => item.id === id);
        if (!request) return "Request not found.";
        if (request.requestedBy === by) return "You cannot approve your own request.";
        if (step === "owner") {
          if (request.status !== "pending") return "This request is not waiting for the owner.";
          const needsFinance = request.amount > FUND_OWNER_LIMIT;
          // Money is allocated before the approval is recorded, so a failed allocation leaves the request as it was.
          if (!needsFinance) {
            const problem = await allocateFunds(request);
            if (problem) return problem;
          }
          const text = needsFinance ? `Owner approved ${request.number}; waiting for finance` : `Owner approved ${request.number}; budget allocated`;
          set((state) => ({
            fundRequests: state.fundRequests.map((item) => item.id === id ? { ...item, ownerApprovedBy: by, status: needsFinance ? "awaiting_finance" : "approved" } : item),
            trail: withTrail(state.trail, trailEntry("finance", today, by, text)),
          }));
          return null;
        }
        if (request.status !== "awaiting_finance") return "This request is not waiting for finance.";
        if (request.ownerApprovedBy === by) return "The approver must be a different person from the owner's approval.";
        const problem = await allocateFunds(request);
        if (problem) return problem;
        set((state) => ({
          fundRequests: state.fundRequests.map((item) => item.id === id ? { ...item, financeApprovedBy: by, status: "approved" } : item),
          trail: withTrail(state.trail, trailEntry("finance", today, by, `Finance approved ${request.number}; budget allocated`)),
        }));
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
        // Real mode moves budget money on the server only (see lib/finance-records.ts).
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
      accounts: emptyFinance().accounts,
      costCenters: emptyFinance().costCenters,
      vendors: emptyFinance().vendors,
      customers: emptyFinance().customers,
      quotations: emptyFinance().quotations,
      paymentVouchers: emptyFinance().paymentVouchers,
      receiptVouchers: emptyFinance().receiptVouchers,
      contraEntries: emptyFinance().contraEntries,
      advancePayments: emptyFinance().advancePayments,
      eInvoiceStatuses: emptyFinance().eInvoiceStatuses,
      currencyRates: emptyFinance().currencyRates,
      fyClosings: emptyFinance().fyClosings,
      addVendor: (input, by) => {
        if (input.name.trim().length < 2) return "Enter the vendor name.";
        const vendor: VendorMaster = { ...input, id: `vm-${Date.now()}`, name: input.name.trim(), active: true };
        set((state) => ({ vendors: [vendor, ...state.vendors], trail: withTrail(state.trail, trailEntry("finance", today, by, `Added vendor ${vendor.name}`)) }));
        return null;
      },
      updateVendor: (id, input, by) => {
        const vendor = get().vendors.find((v) => v.id === id);
        if (!vendor) return "Vendor not found.";
        set((state) => ({ vendors: state.vendors.map((v) => v.id === id ? { ...v, ...input } : v), trail: withTrail(state.trail, trailEntry("finance", today, by, `Updated vendor ${vendor.name}`)) }));
        return null;
      },
      addCustomer: (input, by) => {
        if (input.name.trim().length < 2) return "Enter the customer name.";
        const customer: CustomerMaster = { ...input, id: `cm-${Date.now()}`, name: input.name.trim(), active: true };
        set((state) => ({ customers: [customer, ...state.customers], trail: withTrail(state.trail, trailEntry("finance", today, by, `Added customer ${customer.name} (${customer.company})`)) }));
        return null;
      },
      updateCustomer: (id, input, by) => {
        const customer = get().customers.find((c) => c.id === id);
        if (!customer) return "Customer not found.";
        set((state) => ({ customers: state.customers.map((c) => c.id === id ? { ...c, ...input } : c), trail: withTrail(state.trail, trailEntry("finance", today, by, `Updated customer ${customer.name}`)) }));
        return null;
      },
      addAccount: (input, by) => {
        if (input.code.trim().length < 2) return "Enter an account code.";
        if (input.name.trim().length < 2) return "Enter an account name.";
        if (get().accounts.some((a) => a.code === input.code)) return "Account code already exists.";
        set((state) => ({ accounts: [...state.accounts, input], trail: withTrail(state.trail, trailEntry("finance", today, by, `Added account ${input.code} ${input.name}`)) }));
        return null;
      },
      updateAccount: (code, input, by) => {
        const acc = get().accounts.find((a) => a.code === code);
        if (!acc) return "Account not found.";
        if (acc.isSystem) return "System accounts cannot be modified.";
        set((state) => ({ accounts: state.accounts.map((a) => a.code === code ? { ...a, ...input } : a), trail: withTrail(state.trail, trailEntry("finance", today, by, `Updated account ${code}`)) }));
        return null;
      },
      addCostCenter: (input, by) => {
        if (input.name.trim().length < 2) return "Enter a cost center name.";
        if (input.code.trim().length < 2) return "Enter a cost center code.";
        if (get().costCenters.some((c) => c.code === input.code)) return "Cost center code already exists.";
        const cc: CostCenter = { ...input, id: `cc-${Date.now()}` };
        set((state) => ({ costCenters: [...state.costCenters, cc], trail: withTrail(state.trail, trailEntry("finance", today, by, `Added cost center ${cc.name}`)) }));
        return null;
      },
      updateCostCenter: (id, input, by) => {
        const cc = get().costCenters.find((c) => c.id === id);
        if (!cc) return "Cost center not found.";
        set((state) => ({ costCenters: state.costCenters.map((c) => c.id === id ? { ...c, ...input } : c), trail: withTrail(state.trail, trailEntry("finance", today, by, `Updated cost center ${cc.name}`)) }));
        return null;
      },
      addQuotation: (input, by) => {
        if (input.customer.trim().length < 2) return "Select a customer.";
        if (input.lines.length === 0) return "Add at least one line item.";
        const number = nextNumber("QT", get().quotations.length);
        const quotation: Quotation = { ...input, id: `qt-${Date.now()}`, number, status: "draft", createdBy: by };
        set((state) => ({ quotations: [quotation, ...state.quotations], trail: withTrail(state.trail, trailEntry("finance", today, by, `Created quotation ${number} for ${input.customerCompany}`)) }));
        return null;
      },
      convertQuotation: (id, by) => {
        const qt = get().quotations.find((q) => q.id === id);
        if (!qt) return "Quotation not found.";
        if (qt.status === "invoiced") return "Already converted to an invoice.";
        const invNumber = get().addInvoice({ customer: qt.customer, customerCompany: qt.customerCompany, date: todayIso(), dueDate: todayIso().replace(/\d{2}$/, "30"), sameState: true, lines: qt.lines }, by);
        if (!invNumber) return "Could not create the invoice.";
        set((state) => ({ quotations: state.quotations.map((q) => q.id === id ? { ...q, status: "invoiced" as const, convertedInvoiceId: invNumber } : q) }));
        return null;
      },
      addPaymentVoucher: (input, by) => {
        if (input.paidTo.trim().length < 2) return "Enter who was paid.";
        if (!(input.amount > 0)) return "Enter a positive amount.";
        const number = nextNumber("PV", get().paymentVouchers.length);
        const voucher: PaymentVoucher = { ...input, id: `pv-${Date.now()}`, number, createdBy: by };
        set((state) => ({ paymentVouchers: [voucher, ...state.paymentVouchers], trail: withTrail(state.trail, trailEntry("finance", today, by, `Payment voucher ${number}: ${storeMoney(input.amount)} to ${input.paidTo}`)) }));
        return null;
      },
      addReceiptVoucher: (input, by) => {
        if (input.receivedFrom.trim().length < 2) return "Enter who paid.";
        if (!(input.amount > 0)) return "Enter a positive amount.";
        const number = nextNumber("RV", get().receiptVouchers.length);
        const voucher: ReceiptVoucher = { ...input, id: `rv-${Date.now()}`, number, createdBy: by };
        set((state) => ({ receiptVouchers: [voucher, ...state.receiptVouchers], trail: withTrail(state.trail, trailEntry("finance", today, by, `Receipt voucher ${number}: ${storeMoney(input.amount)} from ${input.receivedFrom}`)) }));
        return null;
      },
      addContraEntry: (input, by) => {
        if (input.from === input.to) return "From and to must be different.";
        if (!(input.amount > 0)) return "Enter a positive amount.";
        const number = nextNumber("CE", get().contraEntries.length);
        const entry: ContraEntry = { ...input, id: `ce-${Date.now()}`, number, createdBy: by };
        set((state) => ({ contraEntries: [entry, ...state.contraEntries], trail: withTrail(state.trail, trailEntry("finance", today, by, `Contra ${number}: ${storeMoney(input.amount)} ${input.from} → ${input.to}`)) }));
        return null;
      },
      addAdvancePayment: (input, by) => {
        if (input.vendor.trim().length < 2) return "Enter the vendor name.";
        if (!(input.amount > 0)) return "Enter a positive amount.";
        const advance: AdvancePayment = { ...input, id: `adv-${Date.now()}`, adjustedAmount: 0, createdBy: by };
        set((state) => ({ advancePayments: [advance, ...state.advancePayments], trail: withTrail(state.trail, trailEntry("finance", today, by, `Advance ${storeMoney(input.amount)} to ${input.vendor}`)) }));
        return null;
      },
      adjustAdvance: (id, billId, amount, by) => {
        const advance = get().advancePayments.find((a) => a.id === id);
        if (!advance) return "Advance not found.";
        const remaining = advance.amount - advance.adjustedAmount;
        if (amount > remaining + 0.01) return `Only ${storeMoney(remaining)} is unadjusted.`;
        set((state) => ({ advancePayments: state.advancePayments.map((a) => a.id === id ? { ...a, adjustedAmount: a.adjustedAmount + amount, billId } : a), trail: withTrail(state.trail, trailEntry("finance", today, by, `Adjusted ${storeMoney(amount)} of advance to ${advance.vendor} against bill`)) }));
        return null;
      },
      generateEInvoice: (invoiceId, by) => {
        const invoice = get().invoices.find((i) => i.id === invoiceId);
        if (!invoice) return "Invoice not found.";
        const existing = get().eInvoiceStatuses.find((e) => e.invoiceId === invoiceId);
        if (existing?.status === "generated") return "E-invoice already generated.";
        const fakeIrn = Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
        const ackNo = `13${invoice.date.replace(/-/g, "")}${String(Math.floor(Math.random() * 100000)).padStart(5, "0")}`;
        const status: EInvoiceStatus = { invoiceId, irn: fakeIrn, ackNo, ackDate: todayIso(), status: "generated" };
        set((state) => ({ eInvoiceStatuses: [...state.eInvoiceStatuses.filter((e) => e.invoiceId !== invoiceId), status], trail: withTrail(state.trail, trailEntry("finance", today, by, `E-invoice generated for ${invoice.number} (IRN: ${fakeIrn.slice(0, 12)}…)`)) }));
        return null;
      },
      closeFiscalYear: (fiscalYear, by) => {
        const existing = get().fyClosings.find((f) => f.fiscalYear === fiscalYear);
        if (existing?.status === "closed") return "This fiscal year is already closed.";
        const pl = profitAndLoss(get().invoices, get().creditNotes, get().bills, get().expenses);
        const closing: FyClosing = { id: `fy-${Date.now()}`, fiscalYear, status: "closed", closedBy: by, closedAt: todayIso(), retainedEarnings: pl.profit, openingBalancesCarried: true };
        set((state) => ({ fyClosings: [...state.fyClosings.filter((f) => f.fiscalYear !== fiscalYear), closing], trail: withTrail(state.trail, trailEntry("finance", today, by, `Closed FY ${fiscalYear} — retained earnings ${storeMoney(pl.profit)}`)) }));
        return null;
      },
      reopenFiscalYear: (fiscalYear, by) => {
        const existing = get().fyClosings.find((f) => f.fiscalYear === fiscalYear);
        if (!existing || existing.status === "open") return "This fiscal year is already open.";
        set((state) => ({ fyClosings: state.fyClosings.map((f) => f.fiscalYear === fiscalYear ? { ...f, status: "open" as const, closedBy: undefined, closedAt: undefined, openingBalancesCarried: false } : f), trail: withTrail(state.trail, trailEntry("finance", today, by, `Reopened FY ${fiscalYear} for adjustments`)) }));
        return null;
      },
      bulkGenerateEInvoice: (invoiceIds, by) => {
        const errors: string[] = [];
        let generated = 0;
        for (const invoiceId of invoiceIds) {
          const err = get().generateEInvoice(invoiceId, by);
          if (err) errors.push(`${invoiceId}: ${err}`);
          else generated++;
        }
        return { generated, errors };
      },
      updateCurrencyRate: (code, rateToInr, by) => {
        const rate = get().currencyRates.find((r) => r.code === code);
        if (!rate) return "Currency not found.";
        if (rateToInr <= 0) return "Rate must be positive.";
        set((state) => ({ currencyRates: state.currencyRates.map((r) => r.code === code ? { ...r, rateToInr, asOf: todayIso() } : r), trail: withTrail(state.trail, trailEntry("finance", today, by, `Updated ${code}/INR rate to ${rateToInr}`)) }));
        return null;
      },
    }),
    { name: scoped("janus.finance.v1"), storage: createJSONStorage(() => workspaceStorage), merge: (persisted, current) => {
      // Invoices, credit notes, budget lines, fund requests and bills come from the server. Expenses,
      // petty cash, draws, bank entries and lines, opening cash and close reviews are saved only in this
      // store (synced as the company's workspace state), so the saved copy is kept, less any demo records.
      return mergeServerOwned<FinanceState>(["trail", "invoices", "creditNotes", "budgetLines", "fundRequests", "bills"])(persisted, current);
    },
    partialize: (state) => ({ invoices: state.invoices, creditNotes: state.creditNotes, budgetLines: state.budgetLines, fundRequests: state.fundRequests, draws: state.draws, bills: state.bills, plans: state.plans, bankEntries: state.bankEntries, openingCash: state.openingCash, shareCapital: state.shareCapital, bankLines: state.bankLines, closeReviews: state.closeReviews, expenses: state.expenses, pettyCashTopUps: state.pettyCashTopUps, trail: state.trail, accounts: state.accounts, costCenters: state.costCenters, vendors: state.vendors, customers: state.customers, quotations: state.quotations, paymentVouchers: state.paymentVouchers, receiptVouchers: state.receiptVouchers, contraEntries: state.contraEntries, advancePayments: state.advancePayments, eInvoiceStatuses: state.eInvoiceStatuses, currencyRates: state.currencyRates, fyClosings: state.fyClosings }) },
  ),
);

async function allocateFunds(request: FundRequest): Promise<string | null> {
  try {
    const result = await api<{ budget: { allocated_paise: number; drawn_paise: number } }>(
      `/finance/budget-lines/${encodeURIComponent(request.lineId)}/allocations`,
      {
        method: "POST",
        headers: { "Idempotency-Key": `fund-${request.id}` },
        body: JSON.stringify({ amount_paise: Math.round(request.amount * 100), note: `${request.number}: ${request.purpose}`, booked_on: today }),
      },
    );
    useFinanceStore.setState((state) => ({
      budgetLines: state.budgetLines.map((item) => item.id === request.lineId ? { ...item, allocated: result.budget.allocated_paise / 100, drawn: result.budget.drawn_paise / 100 } : item),
    }));
    return null;
  } catch (error: unknown) {
    return error instanceof Error ? error.message : "The budget could not be allocated. Try again.";
  }
}

function allocate(lineId: string, amount: number) {
  useFinanceStore.setState((state) => ({ budgetLines: state.budgetLines.map((item) => item.id === lineId ? { ...item, allocated: item.allocated + amount } : item) }));
}

/** Credit notes reduce what the customer owes. Only approved notes count unless `includePending` is set. */
/**
 * Profit and loss to date (plan §8.7 V2). Sales are ex-GST. An approved credit note reduces sales by its
 * taxable share of the invoice it refers to. Bills are costs as entered. Payroll and expense claims are
 * not included yet.
 */
export interface GstRow { rate: number; taxable: number; cgst: number; sgst: number; igst: number }

/**
 * GST summary for one month (plan §8.7 V2). Output tax is from the sales invoices, by GST rate; approved credit
 * notes reduce it by their tax share. Input tax is the GST on expenses plus claimable ITC from bills (where
 * itcBlocked is not true). This is a summary to check, not a return: it is confirmed with the company's
 * accountant before filing.
 */
export function gstSummary(month: string, invoices: Invoice[], creditNotes: CreditNote[], expenses: Expense[], bills: Bill[] = []) {
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
  const expenseItc = inputExpenses.reduce((sum, e) => sum + e.amount * (e.gstRate / 100), 0);
  const billItc = bills.filter((b) => b.date.startsWith(month) && !b.itcBlocked).reduce((sum, b) => sum + (b.gst ?? 0), 0);
  const inputTax = round(expenseItc + billItc);
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
  const billCosts = bills.reduce((sum, bill) => sum + bill.amount - (bill.gst ?? 0), 0);
  const expenseCosts = expenses.reduce((sum, e) => sum + e.amount, 0);
  const costs = billCosts + expenseCosts + writeOffs;
  const round = (value: number) => Math.round(value * 100) / 100;
  const netSales = round(sales - credits);
  const profit = round(netSales - costs);
  return { sales: round(sales), credits: round(credits), netSales, writeOffs: round(writeOffs), billCosts: round(billCosts), expenseCosts: round(expenseCosts), costs: round(costs), profit, margin: netSales > 0 ? round((profit / netSales) * 100) : null };
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
/** Every movement of money the books know about, for matching to bank lines: receipts, bill
 * payments, bank-paid expenses (with their GST), petty cash top-ups and bank movements. */
export function bookPayments(invoices: Invoice[], bills: Bill[], expenses: Expense[] = [], topUps: PettyCashTopUp[] = [], movements: BankEntry[] = []) {
  return [
    ...expenses.filter((e) => e.paidFrom === "bank").map((e) => ({ key: `exp:${e.id}:0`, date: e.date, amount: Math.round(e.amount * (100 + e.gstRate)) / 100, label: `Expense · ${e.payee}`, direction: -1 as const })),
    ...topUps.map((t) => ({ key: `top:${t.id}:0`, date: t.date, amount: t.amount, label: "Petty cash top-up", direction: -1 as const })),
    ...movements.map((m) => ({ key: `mov:${m.id}:0`, date: m.date, amount: Math.abs(m.amount), label: `Bank movement · ${m.description}`, direction: (m.amount > 0 ? 1 : -1) as 1 | -1 })),
    ...invoices.flatMap((invoice) => invoice.payments.map((p) => ({ key: `inv:${invoice.id}:${p.id}`, date: p.date, amount: p.amount, label: `Receipt ${invoice.number} · ${invoice.customer}`, direction: 1 as const }))),
    ...bills.flatMap((bill) => bill.payments.map((p) => ({ key: `bill:${bill.id}:${p.id}`, date: p.date, amount: p.amount, label: `Payment ${bill.number} · ${bill.vendor}`, direction: -1 as const }))),
  ];
}

export function creditedAmount(invoiceId: string, notes: CreditNote[], includePending: boolean) {
  return notes.filter((note) => note.invoiceId === invoiceId && (note.status === "approved" || (includePending && note.status === "pending"))).reduce((sum, note) => sum + note.amount, 0);
}

export function dueAmount(invoice: Invoice, notes: CreditNote[], options: { includePending?: boolean } = {}) {
  const paid = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const credited = creditedAmount(invoice.id, notes, !!options.includePending);
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

