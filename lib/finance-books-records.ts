"use client";

import { api, message } from "@/lib/api/client";
import { type BankEntry, type BankLine, type BudgetPlan, type Expense, type PettyCashTopUp, useFinanceStore } from "@/lib/stores/finance-store";

/**
 * Expenses and petty cash, bank movements, bank statement lines and their matching, opening cash and
 * share capital, month-end sign-offs and budget plans: kept on the server (GET /finance/books), so
 * they reach profit, cash and the owner's figures and are the same on every device. Each change is
 * saved, then the books are read again, so the page always shows the server's copy.
 */
type Books = {
  expenses: Expense[];
  pettyCashTopUps: PettyCashTopUp[];
  bankEntries: BankEntry[];
  bankLines: BankLine[];
  openingCash: number;
  shareCapital: number;
  closeReviews: string[];
  plans: Omit<BudgetPlan, "id">[];
};

function apply(books: Books) {
  useFinanceStore.setState({
    expenses: books.expenses,
    pettyCashTopUps: books.pettyCashTopUps,
    bankEntries: books.bankEntries,
    bankLines: books.bankLines,
    openingCash: books.openingCash,
    shareCapital: books.shareCapital,
    closeReviews: books.closeReviews,
    plans: books.plans.map((plan) => ({ ...plan, id: `${plan.lineId}:${plan.fiscalYear}:${plan.quarter}` })),
  });
}

export async function syncBooks(): Promise<void> {
  apply(await api<Books>("/finance/books"));
}

/** Saves, then reads the books again; a refusal comes back as its message. */
async function save(path: string, method: "POST" | "PUT", body: unknown): Promise<string | null> {
  try {
    await api(path, { method, body: JSON.stringify(body) });
    await syncBooks();
    return null;
  } catch (error) { return message(error); }
}

export const addExpense = (input: Omit<Expense, "id" | "by">) => save("/finance/expenses", "POST", input);
export const topUpPettyCash = (input: { date: string; amount: number }) => save("/finance/petty-cash", "POST", input);
export const addBankEntry = (input: Omit<BankEntry, "id">) => save("/finance/bank-movements", "POST", input);
export const matchBankLine = (lineId: string, key: string | null) => save(`/finance/bank-lines/${encodeURIComponent(lineId)}/match`, "PUT", { key });
export const setOpeningCash = (amount: number) => save("/finance/settings", "PUT", { openingCash: amount });
export const setShareCapital = (amount: number) => save("/finance/settings", "PUT", { shareCapital: amount });
export const markCloseReviewed = (month: string, item: string) => save("/finance/close-reviews", "POST", { month, item });
export const setBudgetPlan = (lineId: string, fiscalYear: string, quarter: number, planned: number) => save("/finance/budget-plans", "PUT", { lineId, fiscalYear, quarter, planned });

/** Imports "date,description,amount" lines; lines already imported, here or from the Portfolio, are skipped. */
export async function importBankStatement(text: string): Promise<{ imported: number; errors: string[] }> {
  try {
    const result = await api<{ imported: number; skipped: number; errors: string[] }>("/finance/bank-lines/import", { method: "POST", body: JSON.stringify({ text }) });
    await syncBooks();
    return { imported: result.imported, errors: [...result.errors, ...(result.skipped ? [`${result.skipped} line${result.skipped === 1 ? " was" : "s were"} already imported and skipped.`] : [])] };
  } catch (error) { return { imported: 0, errors: [message(error)] }; }
}
