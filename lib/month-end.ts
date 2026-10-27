import type { BankLine, Bill, CreditNote, Invoice } from "@/lib/stores/finance-store";

/**
 * Month-end close checks (plan §8.7 V2). Most checks read the records; the two review checks need a person to
 * sign them off. The month closes when every check passes or is signed off.
 */

export interface CloseCheck { id: string; label: string; passed: boolean; detail: string; manual: boolean }

export function monthEnd(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}

interface CloseInput {
  month: string;
  invoices: Invoice[];
  bills: Bill[];
  bankLines: BankLine[];
  bookPayments: { key: string; date: string; amount: number }[];
  matchedKeys: Set<string | null>;
  lockedThrough: string | null;
  reviews: string[];
  dueAmount: (invoice: Invoice, notes: CreditNote[]) => number;
  creditNotes: CreditNote[];
}

export function monthEndChecks(input: CloseInput): CloseCheck[] {
  const { month } = input;
  const end = monthEnd(month);
  const inMonth = (date: string) => date.startsWith(month);

  const lines = input.bankLines.filter((l) => inMonth(l.date));
  const unmatchedLines = lines.filter((l) => !l.matchedKey).length;

  const payments = input.bookPayments.filter((p) => inMonth(p.date));
  const unmatchedPayments = payments.filter((p) => !input.matchedKeys.has(p.key)).length;

  const billsDue = input.bills.filter((b) => inMonth(b.dueDate));
  const billsOpen = billsDue.filter((b) => b.amount - b.payments.reduce((sum, p) => sum + p.amount, 0) > 0.001).length;

  const overdue = input.invoices.filter((i) => !i.cancelled && i.dueDate <= end && input.dueAmount(i, input.creditNotes) > 0.001).length;

  const locked = input.lockedThrough !== null && input.lockedThrough >= end;

  return [
    { id: "bank", label: "Every bank line for the month is matched", passed: unmatchedLines === 0, detail: lines.length === 0 ? "No bank lines this month." : `${unmatchedLines} of ${lines.length} not matched.`, manual: false },
    { id: "books", label: "Every payment recorded this month is on a bank line", passed: unmatchedPayments === 0, detail: payments.length === 0 ? "No payments this month." : `${unmatchedPayments} of ${payments.length} not on a statement.`, manual: false },
    { id: "bills", label: "Bills due this month are paid", passed: billsOpen === 0, detail: billsDue.length === 0 ? "No bills due this month." : `${billsOpen} of ${billsDue.length} still owed.`, manual: false },
    { id: "receivables", label: "Overdue receivables reviewed", passed: overdue === 0 || input.reviews.includes("receivables"), detail: overdue === 0 ? "Nothing overdue at month end." : `${overdue} invoice${overdue === 1 ? "" : "s"} overdue. Sign off once the follow-up is agreed.`, manual: true },
    { id: "variances", label: "Budget variances reviewed", passed: input.reviews.includes("variances"), detail: "Compare the quarter's plan and actual on the Budgets view, then sign off.", manual: true },
    { id: "lock", label: "Period locked through month end", passed: locked, detail: locked ? `Locked through ${input.lockedThrough}.` : `Lock through ${end} so entries for the month cannot change.`, manual: false },
  ];
}
