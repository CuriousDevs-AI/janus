"use client";

import { api, message } from "@/lib/api/client";
import { demoMode } from "@/lib/demo-mode";
import { toPaise } from "@/lib/finance-records";
import { trailEntry, withTrail } from "@/lib/stores/audit-trail";
import { type CreditNote, type Invoice, type Payment, useFinanceStore } from "@/lib/stores/finance-store";
import { periodLockProblem } from "@/lib/stores/period-lock-store";
import { todayIso } from "@/lib/today";

/**
 * Invoices, payments and credit notes are recorded on the server, in paise. The server works out the
 * totals and the amount still due, checks each change, and writes the audit row. The screen shows what
 * the server returned. Demo mode keeps the local path.
 */

interface ServerLine { item: string; hsn: string; qty: number; rate_paise: number; gst_rate: number }
interface ServerPayment { id: string; amount_paise: number; method: Payment["method"]; reference: string; paid_on: string; recorded_by: string }
interface ServerNote {
  id: string;
  number: string;
  kind: CreditNote["kind"];
  amount_paise: number;
  reason: string;
  status: CreditNote["status"];
  noted_on: string;
  ticket_ref: string | null;
  created_by: string;
  approved_by: string | null;
  rejected_by: string | null;
  rejected_reason: string | null;
}
interface ServerInvoice {
  id: string;
  number: string;
  customer: string;
  customer_company: string;
  deal_ref: string | null;
  invoice_date: string;
  due_date: string;
  same_state: boolean;
  total_paise: number;
  due_paise: number;
  created_by: string;
  lines: ServerLine[];
  payments: ServerPayment[];
  credit_notes: ServerNote[];
}

const TODAY = todayIso();
const rupees = (paise: number) => paise / 100;
const shown = (value: number) => `₹${value.toLocaleString("en-IN")}`;

const toInvoice = (row: ServerInvoice): Invoice => ({
  id: row.id,
  number: row.number,
  customer: row.customer,
  customerCompany: row.customer_company,
  dealId: row.deal_ref ?? undefined,
  date: row.invoice_date,
  dueDate: row.due_date,
  sameState: row.same_state,
  lines: row.lines.map((line) => ({ item: line.item, hsn: line.hsn, qty: line.qty, rate: rupees(line.rate_paise), gstRate: line.gst_rate })),
  payments: row.payments.map((payment) => ({
    id: payment.id,
    amount: rupees(payment.amount_paise),
    method: payment.method,
    reference: payment.reference,
    date: payment.paid_on,
  })),
  createdBy: row.created_by,
});

const toNote = (row: ServerNote, invoiceId: string): CreditNote => ({
  id: row.id,
  number: row.number,
  invoiceId,
  amount: rupees(row.amount_paise),
  reason: row.reason,
  status: row.status,
  createdBy: row.created_by,
  approvedBy: row.approved_by ?? undefined,
  rejectedBy: row.rejected_by ?? undefined,
  rejectedReason: row.rejected_reason ?? undefined,
  date: row.noted_on,
  ticketId: row.ticket_ref ?? undefined,
  kind: row.kind,
});

/** Puts the server's copy of one invoice, with its credit notes, onto the screen. */
function apply(row: ServerInvoice, entry?: ReturnType<typeof trailEntry>) {
  const invoice = toInvoice(row);
  const notes = row.credit_notes.map((note) => toNote(note, row.id));
  useFinanceStore.setState((state) => ({
    invoices: state.invoices.some((item) => item.id === invoice.id)
      ? state.invoices.map((item) => (item.id === invoice.id ? invoice : item))
      : [invoice, ...state.invoices],
    creditNotes: [...state.creditNotes.filter((note) => note.invoiceId !== invoice.id), ...notes],
    trail: entry ? withTrail(state.trail, entry) : state.trail,
  }));
}

/**
 * Loads the company's invoices and credit notes from the server. In real mode the server's list
 * replaces the screen's copy, so invoices that only exist on this screen are not shown.
 */
export async function syncInvoices(): Promise<void> {
  if (demoMode) return;
  const rows = await api<ServerInvoice[]>("/finance/invoices");
  useFinanceStore.setState({
    invoices: rows.map(toInvoice),
    creditNotes: rows.flatMap((row) => row.credit_notes.map((note) => toNote(note, row.id))),
  });
}

type NewInvoice = Omit<Invoice, "id" | "number" | "payments" | "createdBy">;

/** Books an invoice on the server and returns its number. The server assigns the number and works out the tax. */
export async function createInvoice(input: NewInvoice, by: string): Promise<{ number: string | null; error: string | null }> {
  if (demoMode) {
    const number = useFinanceStore.getState().addInvoice(input, by);
    return { number, error: null };
  }
  const locked = periodLockProblem(input.date);
  if (locked) return { number: null, error: locked };
  try {
    const row = await api<ServerInvoice>("/finance/invoices", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({
        customer: input.customer,
        customer_company: input.customerCompany,
        deal_ref: input.dealId ?? null,
        invoice_date: input.date,
        due_date: input.dueDate,
        same_state: input.sameState,
        lines: input.lines.map((line) => ({ item: line.item, hsn: line.hsn, qty: line.qty, rate_paise: toPaise(line.rate), gst_rate: line.gstRate })),
      }),
    });
    apply(row, trailEntry("finance", input.date, by, `Created invoice ${row.number} for ${input.customer} · ${shown(rupees(row.total_paise))}`));
    return { number: row.number, error: null };
  } catch (error: unknown) {
    return { number: null, error: message(error) };
  }
}

/** Records money received against an invoice. The server refuses more than is still due. */
export async function recordInvoicePayment(invoiceId: string, payment: Omit<Payment, "id">, by: string): Promise<string | null> {
  if (demoMode) return useFinanceStore.getState().recordPayment(invoiceId, payment, by);
  const locked = periodLockProblem(payment.date);
  if (locked) return locked;
  try {
    const row = await api<ServerInvoice>(`/finance/invoices/${encodeURIComponent(invoiceId)}/payments`, {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ amount_paise: toPaise(payment.amount), method: payment.method, reference: payment.reference, paid_on: payment.date }),
    });
    apply(row, trailEntry("finance", payment.date, by, `Payment ${shown(payment.amount)} recorded on ${row.number} (${payment.method})`));
    return null;
  } catch (error: unknown) {
    return message(error);
  }
}

/** Raises a credit note or a write-off. It reduces what is due only after someone else approves it. */
export async function raiseCreditNote(
  input: { invoiceId: string; amount: number; reason: string; date: string; ticketId?: string; kind?: CreditNote["kind"] },
  by: string,
): Promise<string | null> {
  if (demoMode) return useFinanceStore.getState().addCreditNote(input, by);
  const kind = input.kind ?? "credit";
  try {
    const row = await api<ServerInvoice>(`/finance/invoices/${encodeURIComponent(input.invoiceId)}/credit-notes`, {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ amount_paise: toPaise(input.amount), kind, reason: input.reason, noted_on: input.date, ticket_ref: input.ticketId ?? null }),
    });
    const note = row.credit_notes[row.credit_notes.length - 1];
    const label = kind === "write-off" ? "write-off" : "credit note";
    apply(row, trailEntry("finance", input.date, by, `Requested ${label} ${note.number} of ${shown(input.amount)} against ${row.number}`));
    return null;
  } catch (error: unknown) {
    return message(error);
  }
}

/** Approves a pending credit note. The server refuses the person who raised it and any note not pending. */
export async function approveCreditNote(id: string, by: string): Promise<string | null> {
  if (demoMode) return useFinanceStore.getState().decideCreditNote(id, by);
  try {
    const row = await api<ServerInvoice>(`/finance/credit-notes/${encodeURIComponent(id)}/approve`, { method: "POST" });
    const note = row.credit_notes.find((item) => item.id === id);
    apply(row, trailEntry("finance", TODAY, by, `Approved credit note ${note?.number ?? id} of ${shown(rupees(note?.amount_paise ?? 0))}`));
    return null;
  } catch (error: unknown) {
    return message(error);
  }
}

/** Rejects a pending credit note with a reason. */
export async function rejectCreditNote(id: string, reason: string, by: string): Promise<string | null> {
  if (demoMode) return useFinanceStore.getState().rejectCreditNote(id, reason, by);
  try {
    const row = await api<ServerInvoice>(`/finance/credit-notes/${encodeURIComponent(id)}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason: reason.trim() }),
    });
    const note = row.credit_notes.find((item) => item.id === id);
    apply(row, trailEntry("finance", TODAY, by, `Rejected credit note ${note?.number ?? id}: ${reason.trim()}`));
    return null;
  } catch (error: unknown) {
    return message(error);
  }
}
