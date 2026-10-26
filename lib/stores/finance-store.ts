"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { isFirstCompany } from "@/lib/companies";
import { scoped } from "@/lib/company";

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
  sameState: boolean; lines: InvoiceLine[]; payments: Payment[]; createdBy: string; cancelled?: boolean;
}
export interface CreditNote { id: string; number: string; invoiceId: string; amount: number; reason: string; status: "pending" | "approved"; createdBy: string; approvedBy?: string; date: string }
export interface BudgetLine { id: string; name: string; owner: string; allocated: number; drawn: number }
export interface FundRequest {
  id: string; number: string; purpose: string; amount: number; lineId: string; requestedBy: string; date: string;
  status: "pending" | "awaiting_finance" | "approved" | "rejected"; ownerApprovedBy?: string; financeApprovedBy?: string; rejectedBy?: string; rejectedReason?: string;
}
export interface Draw { id: string; lineId: string; amount: number; note: string; by: string; date: string }

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
  addInvoice: (invoice: Omit<Invoice, "id" | "number" | "payments" | "createdBy">, by: string) => string;
  recordPayment: (invoiceId: string, payment: Omit<Payment, "id">) => string | null;
  addCreditNote: (input: { invoiceId: string; amount: number; reason: string; date: string }, by: string) => string | null;
  decideCreditNote: (id: string, by: string) => string | null;
  addFundRequest: (input: { purpose: string; amount: number; lineId: string; date: string }, by: string) => void;
  approveFundRequest: (id: string, step: "owner" | "finance", by: string) => string | null;
  rejectFundRequest: (id: string, reason: string, by: string) => void;
  addBudgetLine: (input: { name: string; owner: string; allocated: number }) => void;
  drawBudget: (lineId: string, amount: number, note: string, by: string, date: string) => string | null;
}

const today = "2026-10-23";
const seedFinance = (): Pick<FinanceState, "invoices" | "creditNotes" | "budgetLines" | "fundRequests" | "draws"> => {
  if (!isFirstCompany) return { invoices: [], creditNotes: [], budgetLines: [], fundRequests: [], draws: [] };
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
  return { invoices, creditNotes: [], budgetLines: lines, fundRequests, draws: [] };
};

const nextNumber = (prefix: string, count: number) => `${prefix}-2026-${String(101 + count).padStart(4, "0")}`;

export const useFinanceStore = create<FinanceState>()(
  persist(
    (set, get) => ({
      ...seedFinance(),
      addInvoice: (input, by) => {
        const number = nextNumber("INV", get().invoices.length);
        const id = `inv-${Date.now()}`;
        set((state) => ({ invoices: [{ ...input, id, number, payments: [], createdBy: by }, ...state.invoices] }));
        return number;
      },
      recordPayment: (invoiceId, payment) => {
        const invoice = get().invoices.find((item) => item.id === invoiceId);
        if (!invoice) return "Invoice not found.";
        const due = dueAmount(invoice, get().creditNotes);
        if (payment.amount <= 0) return "Enter an amount above zero.";
        if (payment.amount > due + 0.001) return `Payment is more than the ₹${due.toLocaleString("en-IN")} still due.`;
        set((state) => ({ invoices: state.invoices.map((item) => item.id === invoiceId ? { ...item, payments: [...item.payments, { ...payment, id: `pay-${Date.now()}` }] } : item) }));
        return null;
      },
      addCreditNote: (input, by) => {
        const invoice = get().invoices.find((item) => item.id === input.invoiceId);
        if (!invoice) return "Invoice not found.";
        if (input.amount <= 0) return "Enter an amount above zero.";
        if (input.amount > invoiceTotals(invoice).total - creditedAmount(invoice.id, get().creditNotes, true)) return "A credit note cannot be more than the invoice total left to credit.";
        if (input.reason.trim().length < 3) return "Give a reason for the credit note.";
        const number = nextNumber("CN", get().creditNotes.length);
        set((state) => ({ creditNotes: [{ id: `cn-${Date.now()}`, number, status: "pending", createdBy: by, ...input }, ...state.creditNotes] }));
        return null;
      },
      decideCreditNote: (id, by) => {
        const note = get().creditNotes.find((item) => item.id === id);
        if (!note) return "Credit note not found.";
        if (note.createdBy === by) return "The person who created a credit note cannot approve it.";
        set((state) => ({ creditNotes: state.creditNotes.map((item) => item.id === id ? { ...item, status: "approved", approvedBy: by } : item) }));
        return null;
      },
      addFundRequest: (input, by) => {
        const number = nextNumber("FR", get().fundRequests.length);
        set((state) => ({ fundRequests: [{ id: `fund-${Date.now()}`, number, status: "pending", requestedBy: by, ...input }, ...state.fundRequests] }));
      },
      approveFundRequest: (id, step, by) => {
        const request = get().fundRequests.find((item) => item.id === id);
        if (!request) return "Request not found.";
        if (request.requestedBy === by) return "You cannot approve your own request.";
        if (step === "owner") {
          if (request.status !== "pending") return "This request is not waiting for the owner.";
          const needsFinance = request.amount > FUND_OWNER_LIMIT;
          set((state) => ({ fundRequests: state.fundRequests.map((item) => item.id === id ? { ...item, ownerApprovedBy: by, status: needsFinance ? "awaiting_finance" : "approved" } : item) }));
          if (!needsFinance) allocate(request.lineId, request.amount);
          return null;
        }
        if (request.status !== "awaiting_finance") return "This request is not waiting for finance.";
        if (request.ownerApprovedBy === by) return "The approver must be a different person from the owner's approval.";
        set((state) => ({ fundRequests: state.fundRequests.map((item) => item.id === id ? { ...item, financeApprovedBy: by, status: "approved" } : item) }));
        allocate(request.lineId, request.amount);
        return null;
      },
      rejectFundRequest: (id, reason, by) => {
        set((state) => ({ fundRequests: state.fundRequests.map((item) => item.id === id ? { ...item, status: "rejected", rejectedBy: by, rejectedReason: reason } : item) }));
      },
      addBudgetLine: (input) => {
        set((state) => ({ budgetLines: [...state.budgetLines, { id: `line-${Date.now()}`, drawn: 0, ...input }] }));
      },
      drawBudget: (lineId, amount, note, by, date) => {
        const line = get().budgetLines.find((item) => item.id === lineId);
        if (!line) return "Budget line not found.";
        if (amount <= 0) return "Enter an amount above zero.";
        if (line.drawn + amount > line.allocated) return `Only ₹${(line.allocated - line.drawn).toLocaleString("en-IN")} is left on this line.`;
        set((state) => ({
          budgetLines: state.budgetLines.map((item) => item.id === lineId ? { ...item, drawn: item.drawn + amount } : item),
          draws: [{ id: `draw-${Date.now()}`, lineId, amount, note, by, date }, ...state.draws],
        }));
        return null;
      },
    }),
    { name: scoped("janus.finance.v1"), storage: createJSONStorage(() => localStorage), partialize: (state) => ({ invoices: state.invoices, creditNotes: state.creditNotes, budgetLines: state.budgetLines, fundRequests: state.fundRequests, draws: state.draws }) },
  ),
);

function allocate(lineId: string, amount: number) {
  useFinanceStore.setState((state) => ({ budgetLines: state.budgetLines.map((item) => item.id === lineId ? { ...item, allocated: item.allocated + amount } : item) }));
}

/** Credit notes reduce what the customer owes. Pending notes are counted only when `ignorePending` is false. */
export function creditedAmount(invoiceId: string, notes: CreditNote[], includePending: boolean) {
  return notes.filter((note) => note.invoiceId === invoiceId && (note.status === "approved" || includePending)).reduce((sum, note) => sum + note.amount, 0);
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

