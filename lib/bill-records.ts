"use client";

import { api, message } from "@/lib/api/client";
import { demoMode } from "@/lib/demo-mode";
import { toPaise } from "@/lib/finance-records";
import { trailEntry, withTrail } from "@/lib/stores/audit-trail";
import { type Bill, type Payment, useFinanceStore } from "@/lib/stores/finance-store";
import { periodLockProblem } from "@/lib/stores/period-lock-store";
import { todayIso } from "@/lib/today";

/**
 * Vendor bills are recorded on the server, in paise. The server checks each bill against the goods
 * received on its purchase order, holds a payment until the bill matches, and refuses more than is owed.
 * The screen shows what the server returned. Demo mode keeps the local path.
 */

interface ServerPayment { id: string; amount_paise: number; method: Payment["method"]; reference: string; paid_on: string; recorded_by: string }
interface ServerBill {
  id: string;
  number: string;
  vendor: string;
  vendor_bill_no: string;
  bill_date: string;
  due_date: string;
  amount_paise: number;
  po_key: string | null;
  match: string;
  paid_paise: number;
  due_paise: number;
  created_by: string;
  payments: ServerPayment[];
}

const TODAY = todayIso();

const toBill = (row: ServerBill): Bill => ({
  id: row.id,
  number: row.number,
  vendor: row.vendor,
  vendorBillNo: row.vendor_bill_no,
  date: row.bill_date,
  dueDate: row.due_date,
  amount: row.amount_paise / 100,
  payments: row.payments.map((payment) => ({
    id: payment.id,
    amount: payment.amount_paise / 100,
    method: payment.method,
    reference: payment.reference,
    date: payment.paid_on,
  })),
  createdBy: row.created_by,
  poId: row.po_key ?? undefined,
});

function keep(row: ServerBill) {
  const bill = toBill(row);
  useFinanceStore.setState((state) => ({
    bills: state.bills.some((item) => item.id === bill.id)
      ? state.bills.map((item) => (item.id === bill.id ? bill : item))
      : [bill, ...state.bills],
  }));
}

/** Loads the company's bills from the server. Each bill's match and what is still owed come from the server. */
export async function syncBills(): Promise<void> {
  if (demoMode) return;
  const rows = await api<ServerBill[]>("/finance/bills");
  useFinanceStore.setState({ bills: rows.map(toBill) });
}

export async function addBill(
  input: { vendor: string; vendorBillNo: string; date: string; dueDate: string; amount: number; poId?: string },
  by: string,
): Promise<string | null> {
  if (demoMode) return useFinanceStore.getState().addBill(input, by);
  const locked = periodLockProblem(input.date);
  if (locked) return locked;
  try {
    const row = await api<ServerBill>("/finance/bills", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({
        vendor: input.vendor,
        vendor_bill_no: input.vendorBillNo,
        bill_date: input.date,
        due_date: input.dueDate,
        amount_paise: toPaise(input.amount),
        po_key: input.poId ?? null,
      }),
    });
    keep(row);
    useFinanceStore.setState((state) => ({
      trail: withTrail(state.trail, trailEntry("finance", TODAY, by, `Recorded bill ${row.number} from ${row.vendor} · ₹${input.amount.toLocaleString("en-IN")}`)),
    }));
    return null;
  } catch (error: unknown) {
    return message(error);
  }
}

export async function recordBillPayment(billId: string, payment: Omit<Payment, "id">, by: string): Promise<string | null> {
  if (demoMode) return useFinanceStore.getState().recordBillPayment(billId, payment, by);
  const locked = periodLockProblem(payment.date);
  if (locked) return locked;
  try {
    const row = await api<ServerBill>(`/finance/bills/${encodeURIComponent(billId)}/payments`, {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({
        amount_paise: toPaise(payment.amount),
        method: payment.method,
        reference: payment.reference,
        paid_on: payment.date,
      }),
    });
    keep(row);
    useFinanceStore.setState((state) => ({
      trail: withTrail(state.trail, trailEntry("finance", payment.date, by, `Paid ₹${payment.amount.toLocaleString("en-IN")} on ${row.number} to ${row.vendor} (${payment.method})`)),
    }));
    return null;
  } catch (error: unknown) {
    return message(error);
  }
}
