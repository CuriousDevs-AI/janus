import { agingBucket, cashFlowByMonth, dueAmount, invoiceTotals, profitAndLoss, type Bill } from "@/lib/stores/finance-store";
import type { CompanyBook } from "@/lib/portfolio/books";
import { inRange, lastMonths, type Period, type Range } from "@/lib/portfolio/period";
import { todayIso } from "@/lib/today";

/**
 * Every Portfolio figure is computed here, from one company's records at a time, and then added up.
 * Each measure has a written definition and a source (METRICS). A measure a company cannot supply is null,
 * never zero, so a missing workspace is never mistaken for a bad month.
 */

export type Basis = "verified" | "estimate";
export interface MetricDefinition { label: string; definition: string; source: string; basis: Basis }
export const METRICS = {
  netSales: { label: "Net sales", definition: "Taxable value of invoices dated in the period (GST excluded), less approved credit notes. Cancelled invoices are left out.", source: "Finance & Accounting · invoices and credit notes", basis: "verified" },
  costs: { label: "Booked costs", definition: "Vendor bills dated in the period, plus business expenses (ex-GST) and approved write-offs.", source: "Finance & Accounting · bills, expenses, credit notes", basis: "verified" },
  profit: { label: "Profit before payroll", definition: "Net sales less booked costs. Payroll is not yet posted to the books, so it is shown separately.", source: "Finance & Accounting", basis: "verified" },
  margin: { label: "Margin before payroll", definition: "Profit before payroll as a share of net sales.", source: "Finance & Accounting", basis: "verified" },
  payroll: { label: "Payroll run-rate", definition: "Sum of the monthly salaries of active employees, scaled to the period's length. It is the cost the salary records commit to, not booked salary payments.", source: "HR & People · employee salaries", basis: "estimate" },
  profitAfterPayroll: { label: "Profit after payroll (estimate)", definition: "Profit before payroll less the payroll run-rate for the same period.", source: "Finance & Accounting + HR & People", basis: "estimate" },
  cash: { label: "Cash position", definition: "Opening cash plus every receipt, less every payment, bank charge and petty-cash top-up recorded so far.", source: "Finance & Accounting · cash flow", basis: "verified" },
  collections: { label: "Cash collected", definition: "Customer payments received in the period.", source: "Finance & Accounting · invoice payments", basis: "verified" },
  receivables: { label: "Receivables", definition: "What customers still owe on live invoices (GST included), after payments and credit notes, including pending credit notes.", source: "Finance & Accounting · invoices", basis: "verified" },
  overdueReceivables: { label: "Overdue receivables", definition: "Receivables on invoices whose due date has passed.", source: "Finance & Accounting · invoices", basis: "verified" },
  payables: { label: "Payables", definition: "What the company still owes vendors on recorded bills.", source: "Finance & Accounting · bills", basis: "verified" },
  runway: { label: "Cash runway", definition: "Cash position divided by the average monthly net outflow of the last three months. Shown only when cash is going down.", source: "Finance & Accounting · cash flow", basis: "estimate" },
  pipeline: { label: "Open pipeline", definition: "Value of deals in an open stage (new to approval) today. Not revenue until invoiced.", source: "CRM & Sales · deals", basis: "verified" },
  wonValue: { label: "Deals won", definition: "Value of deals marked won whose last update falls in the period. A sales figure, not booked revenue.", source: "CRM & Sales · deals", basis: "verified" },
  leads: { label: "New leads", definition: "Leads created in the period, from every channel.", source: "CRM & Sales · leads", basis: "verified" },
  winRate: { label: "Win rate", definition: "Won deals as a share of deals closed (won + lost) in the period. Falls back to all records when fewer than three closed in the period.", source: "CRM & Sales · deals", basis: "verified" },
  conversion: { label: "Lead conversion", definition: "Leads created in the period that are now won, as a share of leads created in the period.", source: "CRM & Sales · leads", basis: "verified" },
  newCustomers: { label: "New customers", definition: "Customers whose first won deal falls in the period.", source: "CRM & Sales · deals", basis: "verified" },
  headcount: { label: "People", definition: "Employees not archived, today.", source: "HR & People · employees", basis: "verified" },
} satisfies Record<string, MetricDefinition>;
export type MetricKey = keyof typeof METRICS;

const OPEN = new Set(["new", "qualified", "demo", "proposal", "negotiation", "approval"]);
const r2 = (value: number) => Math.round(value * 100) / 100;
const sum = <T,>(items: T[], fn: (item: T) => number) => items.reduce((total, item) => total + fn(item), 0);
const daysIn = (range: Range) => Math.max(1, Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86400000) + 1);

export interface FinanceFigures {
  netSales: number; costs: number; profit: number; margin: number | null; collections: number; paymentsOut: number;
  cash: number; receivables: number; overdueReceivables: number; overdueInvoices: number; payables: number; overduePayables: number; payablesDue30: number;
  runwayMonths: number | null; aging: { bucket: string; amount: number }[]; invoiceCount: number;
  budgetAllocated: number; budgetDrawn: number; topCustomerShare: { name: string; share: number } | null;
}
export interface SalesFigures { leads: number; wonValue: number; wonCount: number; lostCount: number; winRate: number | null; conversion: number | null; pipeline: number; openDeals: number; avgDeal: number | null; newCustomers: number; quietLeads: number; slippedDeals: number; slippedValue: number }
export interface PeopleFigures { headcount: number; departments: number; payrollMonthly: number; payrollPeriod: number; pendingLeave: number; claimsPending: number; claimsValue: number; onLeaveToday: number }
export interface CompanyFigures { id: string; finance: FinanceFigures | null; sales: SalesFigures | null; people: PeopleFigures | null }

function financeFigures(book: CompanyBook, range: Range, today: string): FinanceFigures | null {
  const f = book.finance;
  if (!f) return null;
  const invoices = f.invoices.filter((item) => inRange(item.date, range));
  const notes = f.creditNotes.filter((item) => inRange(item.date, range));
  const bills = f.bills.filter((item) => inRange(item.date, range));
  const expenses = f.expenses.filter((item) => inRange(item.date, range));
  const pnl = profitAndLoss(invoices, notes, bills, expenses);
  // Credit notes on invoices from an earlier period still reduce this period's sales: pass every invoice for lookup.
  const credits = profitAndLoss(f.invoices, notes, [], []).credits;
  const netSales = r2(pnl.sales - credits);
  const profit = r2(netSales - pnl.costs);
  const live = f.invoices.filter((item) => !item.cancelled);
  const flow = cashFlowByMonth(f.invoices, f.bills, f.bankEntries, f.openingCash, f.expenses, f.pettyCashTopUps);
  const cash = flow.length ? flow[flow.length - 1].closing : f.openingCash;
  const recent = flow.slice(-3);
  const burn = recent.length ? -sum(recent, (row) => row.net) / recent.length : 0;
  const owed = (bill: Bill) => Math.max(0, bill.amount - sum(bill.payments, (p) => p.amount));
  const receivables = sum(live, (item) => dueAmount(item, f.creditNotes));
  const overdue = live.filter((item) => item.dueDate < today && dueAmount(item, f.creditNotes) > 0);
  const buckets = ["Current", "1–30 days", "31–60 days", "61–90 days", "90+ days"];
  const byCustomer = new Map<string, number>();
  for (const invoice of invoices.filter((item) => !item.cancelled)) byCustomer.set(invoice.customerCompany || invoice.customer, (byCustomer.get(invoice.customerCompany || invoice.customer) ?? 0) + invoiceTotals(invoice).taxable);
  const top = [...byCustomer.entries()].sort((a, b) => b[1] - a[1])[0];
  const salesGross = sum([...byCustomer.values()], (value) => value);
  return {
    netSales, costs: pnl.costs, profit, margin: netSales > 0 ? r2((profit / netSales) * 100) : null,
    collections: r2(sum(live, (item) => sum(item.payments.filter((p) => inRange(p.date, range)), (p) => p.amount))),
    paymentsOut: r2(sum(f.bills, (bill) => sum(bill.payments.filter((p) => inRange(p.date, range)), (p) => p.amount))),
    cash, receivables: r2(receivables), overdueReceivables: r2(sum(overdue, (item) => dueAmount(item, f.creditNotes))), overdueInvoices: overdue.length,
    payables: r2(sum(f.bills, owed)), overduePayables: r2(sum(f.bills.filter((bill) => bill.dueDate < today), owed)),
    payablesDue30: r2(sum(f.bills.filter((bill) => bill.dueDate >= today && bill.dueDate <= addDaysIso(today, 30)), owed)),
    runwayMonths: burn > 0 ? Math.round((cash / burn) * 10) / 10 : null,
    aging: buckets.map((bucket) => ({ bucket, amount: r2(sum(live.filter((item) => agingBucket(item, f.creditNotes) === bucket), (item) => dueAmount(item, f.creditNotes))) })),
    invoiceCount: invoices.length,
    budgetAllocated: sum(f.budgetLines, (line) => line.allocated), budgetDrawn: sum(f.budgetLines, (line) => line.drawn),
    topCustomerShare: top && salesGross > 0 && byCustomer.size > 1 ? { name: top[0], share: Math.round((top[1] / salesGross) * 100) } : null,
  };
}
const addDaysIso = (value: string, days: number) => { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };

function salesFigures(book: CompanyBook, range: Range, today: string): SalesFigures | null {
  if (!book.on.crm) return null;
  const leads = book.leads.filter((item) => inRange(item.createdAt, range));
  const closedIn = book.deals.filter((item) => ["won", "lost"].includes(item.stage) && inRange(item.updatedAt, range));
  const won = closedIn.filter((item) => item.stage === "won");
  const lost = closedIn.filter((item) => item.stage === "lost");
  const allWon = book.deals.filter((item) => item.stage === "won").length;
  const allLost = book.deals.filter((item) => item.stage === "lost").length;
  const winRate = won.length + lost.length >= 3 ? Math.round((won.length / (won.length + lost.length)) * 100) : allWon + allLost > 0 ? Math.round((allWon / (allWon + allLost)) * 100) : null;
  const open = book.deals.filter((item) => OPEN.has(item.stage));
  const firstWin = new Map<string, string>();
  for (const deal of book.deals.filter((item) => item.stage === "won")) { const seen = firstWin.get(deal.customerId); if (!seen || deal.updatedAt < seen) firstWin.set(deal.customerId, deal.updatedAt); }
  const slipped = open.filter((item) => item.expectedCloseAt && item.expectedCloseAt.slice(0, 10) < today);
  const now = Date.parse(`${today}T12:00:00+05:30`);
  return {
    leads: leads.length, wonValue: sum(won, (item) => Number(item.amount)), wonCount: won.length, lostCount: lost.length, winRate,
    conversion: leads.length ? Math.round((leads.filter((item) => item.stage === "won").length / leads.length) * 100) : null,
    pipeline: sum(open, (item) => Number(item.amount)), openDeals: open.length,
    avgDeal: won.length ? Math.round(sum(won, (item) => Number(item.amount)) / won.length) : null,
    newCustomers: [...firstWin.values()].filter((date) => inRange(date, range)).length,
    quietLeads: book.leads.filter((item) => !["won", "lost"].includes(item.stage) && (now - Date.parse(item.lastActivityAt)) / 86400000 >= 4).length,
    slippedDeals: slipped.length, slippedValue: sum(slipped, (item) => Number(item.amount)),
  };
}

function peopleFigures(book: CompanyBook, range: Range, today: string): PeopleFigures | null {
  if (!book.on.hr) return null;
  const monthly = sum(book.employees, (item) => item.salaryMonthly);
  return {
    headcount: book.employees.length, departments: new Set(book.employees.map((item) => item.department)).size,
    payrollMonthly: monthly, payrollPeriod: Math.round(monthly * (daysIn(range) / 30.4)),
    pendingLeave: book.leave.filter((item) => item.status === "pending" || item.status === "needs_clarification").length,
    claimsPending: book.claims.filter((item) => ["submitted", "manager_review", "hr_review"].includes(item.status)).length,
    claimsValue: sum(book.claims.filter((item) => ["submitted", "manager_review", "hr_review"].includes(item.status)), (item) => item.amount),
    onLeaveToday: book.leave.filter((item) => item.status === "approved" && item.from <= today && item.to >= today).length,
  };
}

export function figuresFor(book: CompanyBook, range: Range, today = todayIso()): CompanyFigures {
  return { id: book.record.id, finance: financeFigures(book, range, today), sales: salesFigures(book, range, today), people: peopleFigures(book, range, today) };
}

/* ---------- Inter-company ---------- */

const normal = (value: string) => value.toLowerCase().replace(/&/g, " and ").replace(/\b(pvt|private|ltd|limited|llp|the|co|company|india)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
export interface IntercompanyItem { kind: "sale" | "purchase"; companyId: string; counterpartyId: string; number: string; date: string; amount: number; outstanding: number }

/** Invoices raised to, and bills received from, another company in the Portfolio, matched by name. */
export function intercompany(books: CompanyBook[]): IntercompanyItem[] {
  const names = books.map((book) => ({ id: book.record.id, keys: [book.record.name, book.legal.legalName, book.spec.company.short].filter(Boolean).map(normal).filter((key) => key.length > 2) }));
  const match = (text: string, self: string) => { const key = normal(text); return names.find((item) => item.id !== self && item.keys.some((name) => key === name))?.id ?? null; };
  const out: IntercompanyItem[] = [];
  for (const book of books) {
    const f = book.finance;
    if (!f) continue;
    for (const invoice of f.invoices.filter((item) => !item.cancelled)) {
      const other = match(invoice.customerCompany, book.record.id) ?? match(invoice.customer, book.record.id);
      if (other) out.push({ kind: "sale", companyId: book.record.id, counterpartyId: other, number: invoice.number, date: invoice.date, amount: invoiceTotals(invoice).taxable, outstanding: dueAmount(invoice, f.creditNotes) });
    }
    for (const bill of f.bills) {
      const other = match(bill.vendor, book.record.id);
      if (other) out.push({ kind: "purchase", companyId: book.record.id, counterpartyId: other, number: bill.number, date: bill.date, amount: bill.amount, outstanding: Math.max(0, bill.amount - sum(bill.payments, (p) => p.amount)) });
    }
  }
  return out;
}

/* ---------- Consolidation ---------- */

export interface Consolidated {
  /** How many companies supplied each part. */
  coverage: { finance: number; sales: number; people: number; total: number };
  combined: { netSales: number; costs: number; profit: number; collections: number; cash: number; receivables: number; overdueReceivables: number; payables: number; payablesDue30: number; pipeline: number; wonValue: number; leads: number; headcount: number; payroll: number; payrollPeriod: number };
  eliminations: { sales: number; costs: number; receivables: number; payables: number; items: IntercompanyItem[] };
  consolidated: { netSales: number; costs: number; profit: number; margin: number | null; receivables: number; payables: number; profitAfterPayroll: number | null };
}

export function consolidate(books: CompanyBook[], figures: CompanyFigures[], range: Range): Consolidated {
  const fin = figures.filter((item) => item.finance).map((item) => item.finance!);
  const sales = figures.filter((item) => item.sales).map((item) => item.sales!);
  const people = figures.filter((item) => item.people).map((item) => item.people!);
  const items = intercompany(books);
  const inPeriod = items.filter((item) => inRange(item.date, range));
  const elimSales = sum(inPeriod.filter((item) => item.kind === "sale"), (item) => item.amount);
  const elimCosts = sum(inPeriod.filter((item) => item.kind === "purchase"), (item) => item.amount);
  const elimRecv = sum(items.filter((item) => item.kind === "sale"), (item) => item.outstanding);
  const elimPay = sum(items.filter((item) => item.kind === "purchase"), (item) => item.outstanding);
  const combined = {
    netSales: sum(fin, (f) => f.netSales), costs: sum(fin, (f) => f.costs), profit: sum(fin, (f) => f.profit), collections: sum(fin, (f) => f.collections), cash: sum(fin, (f) => f.cash),
    receivables: sum(fin, (f) => f.receivables), overdueReceivables: sum(fin, (f) => f.overdueReceivables), payables: sum(fin, (f) => f.payables), payablesDue30: sum(fin, (f) => f.payablesDue30),
    pipeline: sum(sales, (s) => s.pipeline), wonValue: sum(sales, (s) => s.wonValue), leads: sum(sales, (s) => s.leads),
    headcount: sum(people, (p) => p.headcount), payroll: sum(people, (p) => p.payrollMonthly), payrollPeriod: sum(people, (p) => p.payrollPeriod),
  };
  const netSales = r2(combined.netSales - elimSales);
  const costs = r2(combined.costs - elimCosts);
  const profit = r2(netSales - costs);
  // Payroll is subtracted only for companies that also keep books; otherwise the estimate would mix scopes.
  const payrollWithBooks = sum(figures.filter((item) => item.finance && item.people), (item) => item.people!.payrollPeriod);
  return {
    coverage: { finance: fin.length, sales: sales.length, people: people.length, total: figures.length },
    combined,
    eliminations: { sales: r2(elimSales), costs: r2(elimCosts), receivables: r2(elimRecv), payables: r2(elimPay), items },
    consolidated: { netSales, costs, profit, margin: netSales > 0 ? r2((profit / netSales) * 100) : null, receivables: r2(combined.receivables - elimRecv), payables: r2(combined.payables - elimPay), profitAfterPayroll: fin.length ? r2(profit - payrollWithBooks) : null },
  };
}

/* ---------- Trends ---------- */

export interface MonthPoint { key: string; label: string; leads: number | null; wonValue: number | null; netSales: number | null; collections: number | null; costs: number | null }
/** Month-by-month figures for one company, from dated records only. */
export function monthlyTrend(book: CompanyBook, months = 6, today = todayIso()): MonthPoint[] {
  return lastMonths(months, today).map((month) => {
    const f = figuresFor(book, month, today);
    return { key: month.key, label: month.label, leads: f.sales?.leads ?? null, wonValue: f.sales?.wonValue ?? null, netSales: f.finance?.netSales ?? null, collections: f.finance?.collections ?? null, costs: f.finance?.costs ?? null };
  });
}

/** Change between two values, in percent, or null when there is nothing to compare against. */
export const change = (now: number | null | undefined, before: number | null | undefined) => now == null || before == null || before === 0 ? null : Math.round(((now - before) / Math.abs(before)) * 100);

export function figuresForPeriod(books: CompanyBook[], period: Period, today = todayIso()) {
  const now = books.map((book) => figuresFor(book, period, today));
  const before = period.previous ? books.map((book) => figuresFor(book, period.previous!, today)) : null;
  return { now, before };
}

export const rupees = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`;
/** Indian short form: ₹4.2L, ₹1.3Cr. Exact figures stay available in tooltips and tables. */
export function inr(value: number | null | undefined) {
  if (value == null) return "—";
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2).replace(/\.?0+$/, "")}Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2).replace(/\.?0+$/, "")}L`;
  return `${sign}₹${Math.round(abs).toLocaleString("en-IN")}`;
}
