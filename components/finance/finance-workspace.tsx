"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import type { Deal as ApiDeal } from "@/lib/api/types";
import { can } from "@/lib/permissions";
import * as books from "@/lib/finance-books-records";
import { PageHeader } from "@/components/shared/page-header";
import { FilterChips, StatTile as Kpi, rowClick, workspaceHref } from "@/components/shared/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/components/auth/session-provider";
import { TrailPanel } from "@/components/shared/audit-trail-panel";
import { MoneyApprovalsQueue } from "@/components/approvals/money-approvals-queue";
import { PeriodLockView } from "@/components/finance/period-lock-view";
import { periodLockProblem, usePeriodLockStore } from "@/lib/stores/period-lock-store";
import { monthEnd, monthEndChecks } from "@/lib/month-end";
import { EXPENSE_CATEGORIES, gstSummary, pettyCashBalance } from "@/lib/stores/finance-store";
import { moveBudget, syncBudgetLines } from "@/lib/finance-records";
import { addBill, recordBillPayment, setBlockedCredit, syncBills } from "@/lib/bill-records";
import { addFundRequest, approveFundRequest, rejectFundRequest, syncFundRequests } from "@/lib/fund-records";
import { setPeriodLock, syncCompanyRules } from "@/lib/company-rules-records";
import { approveCreditNote, createInvoice, raiseCreditNote, recordInvoicePayment, syncInvoices } from "@/lib/invoice-records";
import { linkedLabel, useCrmLinkOptions } from "@/lib/record-links";
import { RecordDocuments } from "@/components/shared/record-documents";
import { stockOn, useOperationsStore } from "@/lib/stores/operations-store";
import { syncOperations } from "@/lib/operations-records";
import { useVendorsStore } from "@/lib/stores/vendors-store";
import { threeWayMatch } from "@/lib/three-way-match";
import { workflowRules } from "@/lib/stores/workflow-rules-store";
import { FUND_OWNER_LIMIT, GST_RATES, agingBucket, dueAmount, bookPayments, cashFlowByMonth, fiscalPeriod, invoiceStatus, invoiceTotals, profitAndLoss, useFinanceStore, type CreditNote, type FundRequest, type Invoice, type InvoiceLine, type AccountMaster, type VendorMaster, type CustomerMaster, type CostCenter } from "@/lib/stores/finance-store";
import { todayIso } from "@/lib/today";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { useHrOperationsStore } from "@/lib/stores/hr-operations-store";
import { canDecideExpense, nextExpenseStatus, expenseLabels } from "@/components/hr-people/expenses";
import { canManageHr } from "@/lib/hr-people-access";
import type { HrDemoRole } from "@/lib/types";

// Rupees in Indian grouping; paise shown as two digits when there are any (₹1,234.50, not ₹1,234.5).
const money = (value: number) => `₹${value.toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(Math.round(value * 100) / 100) ? 0 : 2, maximumFractionDigits: 2 })}`;
const selectClass = "h-9 w-full rounded-md border border-input bg-surface px-3 text-sm";

/** Months that have at least one record, plus the current calendar month, sorted ascending. */
function dataMonths(invoices: { date: string }[], bills: { date: string }[], expenses: { date: string }[]): string[] {
  const today = todayIso();
  const set = new Set<string>();
  set.add(today.slice(0, 7));
  for (const i of invoices) set.add(i.date.slice(0, 7));
  for (const b of bills) set.add(b.date.slice(0, 7));
  for (const e of expenses) set.add(e.date.slice(0, 7));
  return [...set].sort();
}

/** Views that are not built yet. They say so instead of showing empty tables. */
const comingSoon: Record<string, string> = {
};

export function FinanceWorkspace() {
  const session = useSession();
  const searchParams = useSearchParams();
  const view = searchParams.get("view") ?? "overview";
  const me = session.user.name ?? session.user.email ?? "You";
  React.useEffect(() => {
    syncCompanyRules().catch((error: unknown) => toast.warning(`Period lock not loaded from the server: ${message(error)}`));
    // The overview and receivables read these records, so they load before the page shows figures.
    syncInvoices().catch((error: unknown) => toast.warning(`Invoices not loaded from the server: ${message(error)}`));
    syncBills().catch((error: unknown) => toast.warning(`Bills not loaded from the server: ${message(error)}`));
    syncFundRequests().catch((error: unknown) => toast.warning(`Fund requests not loaded from the server: ${message(error)}`));
    syncBudgetLines().catch((error: unknown) => toast.warning(`Budget not loaded from the server: ${message(error)}`));
    books.syncBooks().catch((error: unknown) => toast.warning(`Expenses, bank lines and cash not loaded from the server: ${message(error)}`));
    // The bill form matches a bill to a purchase order, so the orders load here too.
    // Only load operations data when the user has the stock:adjust permission; accountants
    // without it would get a 403 toast on every page load.
    if (can(session, "stock:adjust")) {
      syncOperations().catch(() => {/* PO data is optional for Finance */});
    }
  }, [session.permissions]);
  const invoices = useFinanceStore((state) => state.invoices);
  const creditNotes = useFinanceStore((state) => state.creditNotes);
  const titles: Record<string, string> = { overview: "Finance overview", invoices: "Invoices", "credit-notes": "Credit notes", funds: "Fund requests & budgets", approvals: "Approvals queue", periods: "Period locks", payables: "Bills & payables", receivables: "Payments & receivables", "profit-loss": "Profit & loss", budgets: "Budgets by quarter", "cash-flow": "Cash flow", reconciliation: "Bank reconciliation", "month-end": "Month-end close", expenses: "Expenses & petty cash", gst: "GST summary", "balance-sheet": "Balance Sheet", "hr-costs": "Payroll & HR costs", income: "Income & Revenue", tds: "TDS Compliance", "fixed-assets": "Fixed Assets Register", "debit-notes": "Debit Notes", "trial-balance": "Trial Balance", "journal-entries": "Journal Entries", ratios: "Financial Ratios", "party-ledger": "Party Ledger", "recurring-invoices": "Recurring Invoices", "payment-reminders": "Payment Reminders", "chart-of-accounts": "Chart of Accounts", "cost-centers": "Cost Centers", "vendor-master": "Vendor Master", "customer-master": "Customer Master", quotations: "Quotations & Pro-forma", "payment-vouchers": "Payment Vouchers", "receipt-vouchers": "Receipt Vouchers", "contra-entries": "Contra Entries", "cash-bank-book": "Cash & Bank Book", "day-book": "Day Book", "e-invoicing": "E-Invoicing & E-Way Bill", "advance-payments": "Advance Payments", "fy-closing": "FY Closing", "multi-currency": "Multi-Currency Rates", "purchase-orders": "Purchase Orders", "audit-export": "Audit Trail Export" };

  if (view in comingSoon) {
    return (
      <div className="mx-auto flex max-w-[1200px] flex-col">
        <PageHeader title="Coming soon" description="Finance & Accounting" />
        <div className="px-6 pb-10"><Card><CardContent className="p-6 text-sm text-muted-foreground">{comingSoon[view]}</CardContent></Card></div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col">
      <PageHeader title={titles[view] ?? "Finance overview"} description="Invoices, payments, credit notes, fund requests and budgets. Figures come only from records in this workspace." actions={<Badge variant="neutral">{invoices.length} invoices · {creditNotes.length} credit notes</Badge>} />
      <div className="flex flex-col gap-4 px-6 pb-10">
        {view === "receivables" && <ReceivablesView />}
        {view === "invoices" && <InvoicesView me={me} />}
        {view === "credit-notes" && <CreditNotesView me={me} />}
        {view === "funds" && <FundsView me={me} />}
        {view === "approvals" && <MoneyApprovalsQueue />}
        {view === "periods" && <PeriodLockView />}
        {view === "payables" && <PayablesView me={me} />}
        {view === "profit-loss" && <ProfitLossView />}
        {view === "budgets" && <BudgetsView me={me} />}
        {view === "cash-flow" && <CashFlowView me={me} />}
        {view === "reconciliation" && <ReconciliationView me={me} />}
        {view === "month-end" && <MonthEndView me={me} />}
        {view === "expenses" && <ExpensesView me={me} />}
        {view === "gst" && <GstView />}
        {view === "balance-sheet" && <BalanceSheetView />}
        {view === "hr-costs" && <PayrollHrCostsView />}
        {view === "income" && <IncomeView />}
        {view === "tds" && <TdsComplianceView />}
        {view === "fixed-assets" && <FixedAssetsView />}
        {view === "debit-notes" && <DebitNotesView me={me} />}
        {view === "trial-balance" && <TrialBalanceView />}
        {view === "journal-entries" && <JournalEntriesView me={me} />}
        {view === "ratios" && <FinancialRatiosView />}
        {view === "party-ledger" && <PartyLedgerView />}
        {view === "recurring-invoices" && <RecurringInvoicesView me={me} />}
        {view === "payment-reminders" && <PaymentRemindersView />}
        {view === "chart-of-accounts" && <ChartOfAccountsView me={me} />}
        {view === "cost-centers" && <CostCentersView me={me} />}
        {view === "vendor-master" && <VendorMasterView me={me} />}
        {view === "customer-master" && <CustomerMasterView me={me} />}
        {view === "quotations" && <QuotationsView me={me} />}
        {view === "payment-vouchers" && <PaymentVouchersView me={me} />}
        {view === "receipt-vouchers" && <ReceiptVouchersView me={me} />}
        {view === "contra-entries" && <ContraEntriesView me={me} />}
        {view === "cash-bank-book" && <CashBankBookView />}
        {view === "day-book" && <DayBookView />}
        {view === "e-invoicing" && <EInvoicingView me={me} />}
        {view === "advance-payments" && <AdvancePaymentsView me={me} />}
        {view === "fy-closing" && <FyClosingView me={me} />}
        {view === "multi-currency" && <MultiCurrencyView me={me} />}
        {view === "purchase-orders" && <PurchaseOrdersView />}
        {view === "audit-export" && <AuditExportView />}
        {(view === "overview" || !(view in titles)) && <OverviewView />}
        {(view === "overview" || !(view in titles)) && <FinanceTrail />}
      </div>
    </div>
  );
}

/** Who owes what, oldest due first: each customer with the invoices still unpaid and how late each is,
 * so chasing starts with the oldest money. Amounts under a rupee left by rounding are not listed. */
function ReceivablesView() {
  const invoices = useFinanceStore((state) => state.invoices);
  const creditNotes = useFinanceStore((state) => state.creditNotes);
  const today = todayIso();
  const open = invoices.filter((i) => !i.cancelled).map((i) => ({ invoice: i, owed: dueAmount(i, creditNotes), late: Math.floor((Date.parse(today) - Date.parse(i.dueDate)) / 86_400_000) })).filter((row) => row.owed >= 1).sort((a, b) => a.invoice.dueDate.localeCompare(b.invoice.dueDate));
  const byCustomer = new Map<string, typeof open>();
  for (const row of open) { const name = row.invoice.customerCompany || row.invoice.customer; byCustomer.set(name, [...(byCustomer.get(name) ?? []), row]); }
  const [lateOnly, setLateOnly] = React.useState(false);
  const customers = [...byCustomer.entries()].filter(([, rows]) => !lateOnly || rows.some((row) => row.late > 0)).map(([name, rows]) => [name, lateOnly ? rows.filter((row) => row.late > 0) : rows] as const);
  const lateCustomers = [...byCustomer.values()].filter((rows) => rows.some((row) => row.late > 0)).length;
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0"><CardTitle className="text-base">Who owes what, oldest first</CardTitle>
        {byCustomer.size > 0 ? <FilterChips<"all" | "late"> label="Show customers" value={lateOnly ? "late" : "all"} onChange={(value) => setLateOnly(value === "late")} options={[{ value: "all", label: "Everyone who owes", count: byCustomer.size }, { value: "late", label: "Past due", count: lateCustomers, tone: "warning" }]} /> : null}
      </CardHeader>
      <CardContent className="grid gap-4 text-sm">
        {customers.length === 0 ? <p className="text-muted-foreground">{lateOnly ? "No customer is past due." : "No customer owes anything."}</p> : customers.map(([name, rows]) => {
          const total = rows.reduce((sum, row) => sum + row.owed, 0), late = rows.filter((row) => row.late > 0).reduce((sum, row) => sum + row.owed, 0);
          return <div key={name} className="grid gap-1.5">
            <p className="flex flex-wrap items-baseline justify-between gap-2"><span className="font-medium">{name}</span><span className="tabular-nums">{money(total)} owed{late > 0 ? <span className="text-danger"> · {money(late)} past due</span> : null}</span></p>
            <ul className="grid gap-1 text-xs">{rows.map((row) => <li key={row.invoice.id} className="flex flex-wrap justify-between gap-2 border-b border-border pb-1 last:border-0"><span>{row.invoice.number} · dated {row.invoice.date} · due {row.invoice.dueDate}</span><span className={`tabular-nums ${row.late > 0 ? "text-danger" : "text-muted-foreground"}`}>{money(row.owed)} · {row.late > 0 ? `${row.late} day${row.late === 1 ? "" : "s"} late` : row.late === 0 ? "due today" : `due in ${-row.late} day${row.late === -1 ? "" : "s"}`}</span></li>)}</ul>
          </div>;
        })}
        <p className="text-xs text-muted-foreground">Record a payment against an invoice in Invoices.</p>
      </CardContent>
    </Card>
  );
}

/** Vendor bills: what the company owes, when it is due, and what has been paid so far. */
function PayablesView({ me }: { me: string }) {
  const bills = useFinanceStore((state) => state.bills);
  const [vendor, setVendor] = React.useState("");
  const [vendorBillNo, setVendorBillNo] = React.useState("");
  const [gst, setGst] = React.useState("");
  const [itcBlocked, setItcBlocked] = React.useState(false);
  const [tds, setTds] = React.useState("");
  const [tdsSection, setTdsSection] = React.useState("194C");
  const [amount, setAmount] = React.useState("");
  const [dueDate, setDueDate] = React.useState("2026-11-15");
  /** A vendor's payment terms set the due date: the bill date plus its days. Vendors without terms use 30 days. */
  function chooseVendor(name: string) {
    setVendor(name);
    const days = vendors.find((v) => v.name === name)?.paymentTermsDays ?? 30;
    setDueDate(new Date(Date.parse(today) + days * 86400000).toISOString().slice(0, 10));
  }
  const [poId, setPoId] = React.useState("");
  const purchaseOrders = useOperationsStore((state) => state.purchaseOrders);
  const vendors = useVendorsStore((state) => state.vendors);
  const [payAmounts, setPayAmounts] = React.useState<Record<string, string>>({});
  const today = todayIso();

  React.useEffect(() => {
    syncBills().catch((error: unknown) => toast.warning(`Bills not loaded from the server: ${message(error)}`));
  }, []);

  async function create() {
    const problem = await addBill({ vendor, vendorBillNo, date: today, dueDate, amount: Number(amount), gst: Number(gst) || 0, itcBlocked, tds: Number(tds) || 0, tdsSection: Number(tds) > 0 ? tdsSection : undefined, poId: poId || undefined }, me);
    if (problem) return toast.error(problem);
    toast.success("Bill recorded");
    setVendor(""); setVendorBillNo(""); setAmount(""); setGst(""); setItcBlocked(false); setTds(""); setPoId("");
  }

  async function pay(billId: string) {
    const problem = await recordBillPayment(billId, { amount: Number(payAmounts[billId]), method: "Bank transfer", reference: "Paid from Payables", date: today }, me);
    if (problem) return toast.error(problem);
    toast.success("Payment recorded");
    setPayAmounts((current) => ({ ...current, [billId]: "" }));
  }

  async function toggleBlocked(billId: string, blocked: boolean) {
    const problem = await setBlockedCredit(billId, blocked);
    if (problem) return toast.error(problem);
    toast.success(blocked ? "GST on this bill is now blocked credit, not taken." : "GST on this bill is taken as input credit.");
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Record a bill</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-xs text-muted-foreground">A bill is what the company owes a vendor. Where the company deducts TDS, enter it with its section: the vendor is then owed the bill less the TDS, which the company deposits with the government. Pay it in one or more payments; each payment cannot be more than the amount still owed.</p>
          <div className="grid gap-3 sm:grid-cols-5">
            <div className="flex flex-col gap-1.5"><Label htmlFor="bill-vendor">Vendor</Label><select id="bill-vendor" className={selectClass} value={vendor} onChange={(e) => chooseVendor(e.target.value)}><option value="">Vendor…</option>{vendors.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}</select></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="bill-no">Vendor&apos;s bill no.</Label><Input id="bill-no" value={vendorBillNo} onChange={(e) => setVendorBillNo(e.target.value)} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="bill-amount">Amount with GST (₹)</Label><Input id="bill-amount" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="bill-gst">GST in this bill (₹)</Label><Input id="bill-gst" type="number" min={0} placeholder="As on the bill" value={gst} onChange={(e) => setGst(e.target.value)} /><label className="flex items-center gap-1.5 text-xs text-muted-foreground"><input type="checkbox" disabled={!(Number(gst) > 0)} checked={itcBlocked && Number(gst) > 0} onChange={(e) => setItcBlocked(e.target.checked)} />Credit blocked (food, cars, personal use)</label></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="bill-tds">TDS deducted (₹)</Label><div className="flex gap-1"><Input id="bill-tds" type="number" min={0} placeholder="0" value={tds} onChange={(e) => setTds(e.target.value)} /><select aria-label="TDS section" className={selectClass} value={tdsSection} onChange={(e) => setTdsSection(e.target.value)}>{["194C", "194J", "194I", "194H", "194Q", "194A"].map((code) => <option key={code}>{code}</option>)}</select></div></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="bill-due">Due date</Label><Input id="bill-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="bill-po">Purchase order (optional)</Label><select id="bill-po" className={selectClass} value={poId} onChange={(e) => setPoId(e.target.value)}><option value="">No order</option>{purchaseOrders.map((o) => <option key={o.id} value={o.id}>{o.number} · {o.vendor}</option>)}</select></div>
            <Button className="self-end" disabled={!vendor || !vendorBillNo || !(Number(amount) > 0) || Number(gst) >= Number(amount) || Number(tds) >= Number(amount) - (Number(gst) || 0)} onClick={create}>Record bill</Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="px-4 py-2">Bill</th><th className="px-4 py-2">Due</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2 text-right">Owed</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Order match</th><th className="px-4 py-2">Pay</th></tr></thead>
            <tbody>
              {bills.length === 0 ? <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">No bills yet.</td></tr> : null}
              {bills.map((bill) => {
                const paid = bill.payments.reduce((sum, item) => sum + item.amount, 0);
                const owed = Math.round((bill.amount - (bill.tds ?? 0) - paid) * 100) / 100;
                const status = owed <= 0 ? "paid" : bill.dueDate < today ? "overdue" : paid > 0 ? "part paid" : "open";
                const order = purchaseOrders.find((o) => o.id === bill.poId);
                const match = threeWayMatch(bill.amount - (bill.gst ?? 0), order, workflowRules().matchTolerancePercent);
                const held = bill.poId !== undefined && !match.matched && owed > 0;
                return (
                  <tr key={bill.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium">{bill.number}<span className="block text-xs font-normal text-muted-foreground">{bill.vendor} · {bill.vendorBillNo}</span></td>
                    <td className="px-4 py-3">{bill.dueDate}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(bill.amount)}{bill.gst ? <span className="block text-xs text-muted-foreground">GST {money(bill.gst)} · <button type="button" className="underline-offset-2 hover:underline" title="Section 17(5): GST on food, cars and personal use cannot be taken as input credit" onClick={() => void toggleBlocked(bill.id, !bill.itcBlocked)}>{bill.itcBlocked ? "credit blocked" : "credit taken"}</button></span> : null}{bill.tds ? <span className="block text-xs text-muted-foreground">TDS {money(bill.tds)}{bill.tdsSection ? ` · ${bill.tdsSection}` : ""}</span> : null}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(owed)}</td>
                    <td className="px-4 py-3"><Badge variant={status === "paid" ? "success" : status === "overdue" ? "danger" : "warning"}>{status}</Badge></td>
                    <td className="px-4 py-3 text-xs">{order ? <span className={match.matched ? "text-success" : "text-warning"}>{order.number}: {match.status}</span> : <span className="text-muted-foreground">no order</span>}</td>
                    <td className="px-4 py-3">
                      {owed > 0 ? (
                        <div className="flex items-center gap-2">
                          <Input aria-label={`Amount to pay on ${bill.number}`} type="number" min={0} className="h-8 w-28" value={payAmounts[bill.id] ?? ""} onChange={(e) => setPayAmounts((current) => ({ ...current, [bill.id]: e.target.value }))} />
                          <Button size="sm" variant="secondary" disabled={held || !(Number(payAmounts[bill.id]) > 0)} title={held ? `Held: ${match.status}` : undefined} onClick={() => pay(bill.id)}>Pay</Button>
                        </div>
                      ) : <span className="text-xs text-muted-foreground">Settled</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}

/** Profit and loss to date, from invoices, approved credit notes and bills. Payroll and expense claims come later. */
/** Plan against actual for each budget line, for one quarter of the financial year. */
function BudgetsView({ me }: { me: string }) {
  const lines = useFinanceStore((state) => state.budgetLines);
  const draws = useFinanceStore((state) => state.draws);
  const plans = useFinanceStore((state) => state.plans);
  const current = fiscalPeriod(todayIso());
  const [fiscalYear] = React.useState(current.fiscalYear);
  const [quarter, setQuarter] = React.useState<1 | 2 | 3 | 4>(current.quarter);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});

  async function save(lineId: string) {
    const planned = Number(drafts[lineId] ?? "");
    const problem = await books.setBudgetPlan(lineId, fiscalYear, quarter, planned);
    if (problem) return toast.error(problem);
    toast.success("Plan saved");
    setDrafts((current) => ({ ...current, [lineId]: "" }));
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Budget plan, FY {fiscalYear}</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <p className="text-xs text-muted-foreground">Plan what each budget line may spend in a quarter. Actual is the spend recorded in that quarter, from the dated draws on the line.</p>
          <div className="flex items-center gap-2"><Label htmlFor="bp-quarter">Quarter</Label><select id="bp-quarter" className={selectClass} value={quarter} onChange={(e) => setQuarter(Number(e.target.value) as 1 | 2 | 3 | 4)}>{[1, 2, 3, 4].map((q) => <option key={q} value={q}>Q{q}</option>)}</select></div>
          <table className="w-full text-sm tabular-nums">
            <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="py-2">Budget line</th><th className="text-right">Planned</th><th className="text-right">Actual</th><th className="text-right">Left</th><th className="text-right">Set plan</th></tr></thead>
            <tbody>
              {lines.map((line) => {
                const plan = plans.find((item) => item.lineId === line.id && item.fiscalYear === fiscalYear && item.quarter === quarter);
                const actual = draws.filter((draw) => draw.lineId === line.id && fiscalPeriod(draw.date).fiscalYear === fiscalYear && fiscalPeriod(draw.date).quarter === quarter).reduce((sum, draw) => sum + draw.amount, 0);
                const planned = plan?.planned ?? 0;
                const left = planned - actual;
                return (
                  <tr key={line.id} className="border-b border-border last:border-0">
                    <td className="py-2">{line.name}<span className="block text-xs text-muted-foreground">{line.owner}</span></td>
                    <td className="text-right">{plan ? money(planned) : <span className="text-muted-foreground">not planned</span>}</td>
                    <td className="text-right">{money(actual)}</td>
                    <td className={`text-right ${plan && left < 0 ? "text-danger" : ""}`}>{plan ? (left < 0 ? `over by ${money(Math.abs(left))}` : money(left)) : "—"}</td>
                    <td className="text-right">
                      <div className="flex justify-end gap-2">
                        <Input aria-label={`Plan for ${line.name}`} type="number" min={0} className="h-8 w-28" value={drafts[line.id] ?? ""} onChange={(e) => setDrafts((current) => ({ ...current, [line.id]: e.target.value }))} />
                        <Button size="sm" variant="secondary" disabled={!(Number(drafts[line.id]) >= 0) || drafts[line.id] === undefined || drafts[line.id] === ""} onClick={() => save(line.id)}>Save</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}

/** Month-end close: the checks for one month, the sign-offs still needed, and the period lock that closes the books. */
function MonthEndView({ me }: { me: string }) {
  const session = useSession();
  const isOwner = can(session, "billing:manage");
  const invoices = useFinanceStore((state) => state.invoices);
  const bills = useFinanceStore((state) => state.bills);
  const bankLines = useFinanceStore((state) => state.bankLines);
  const creditNotes = useFinanceStore((state) => state.creditNotes);
  const closeReviews = useFinanceStore((state) => state.closeReviews);
  const lockedThrough = usePeriodLockStore((state) => state.lockedThrough);
  const matchExpenses = useFinanceStore((state) => state.expenses);
  const months = dataMonths(invoices, bills, matchExpenses);
  const [month, setMonth] = React.useState(() => todayIso().slice(0, 7));
  const matchTopUps = useFinanceStore((state) => state.pettyCashTopUps);
  const matchMovements = useFinanceStore((state) => state.bankEntries);
  const payments = bookPayments(invoices, bills, matchExpenses, matchTopUps, matchMovements);
  const matchedKeys = new Set<string | null>(bankLines.map((l) => l.matchedKey));
  const checks = monthEndChecks({ month, invoices, bills, bankLines, bookPayments: payments, matchedKeys, lockedThrough, reviews: closeReviews.filter((r) => r.startsWith(`${month}:`)).map((r) => r.slice(month.length + 1)), dueAmount, creditNotes });
  const ready = checks.filter((c) => c.id !== "lock").every((c) => c.passed || (c.manual && closeReviews.includes(`${month}:${c.id}`)));
  const end = monthEnd(month);

  async function signOff(item: string) {
    const problem = await books.markCloseReviewed(month, item);
    if (problem) return toast.error(problem);
    toast.success("Signed off");
  }

  async function lockMonth() {
    const problem = await setPeriodLock(end, isOwner);
    if (problem) return toast.error(problem);
    toast.success(`Books locked through ${end}`);
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Month-end close · {month}</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="close-month">Month</Label>
            <select id="close-month" className={selectClass} value={month} onChange={(e) => setMonth(e.target.value)}>{months.map((m) => <option key={m} value={m}>{m}</option>)}</select>
            <Badge variant={ready ? "success" : "warning"}>{ready ? "ready to close" : "not ready"}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">Checks read the records. Two need a person to sign them off. The owner then locks the books through the month end, so nothing dated in it can change.</p>
          {checks.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0">
              <span>
                <span className="font-medium">{c.label}</span>
                <span className="block text-xs text-muted-foreground">{c.detail}</span>
              </span>
              <span className="flex items-center gap-2">
                <Badge variant={c.passed ? "success" : "warning"}>{c.passed ? "passed" : c.manual ? "to sign off" : "open"}</Badge>
                {c.manual && !c.passed ? <Button size="sm" variant="secondary" onClick={() => signOff(c.id)}>Sign off</Button> : null}
              </span>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button disabled={!ready || !isOwner || (lockedThrough !== null && lockedThrough >= end)} onClick={lockMonth}>Lock books through {end}</Button>
            {!isOwner ? <span className="text-xs text-muted-foreground">Only the owner can lock the books.</span> : null}
          </div>
        </CardContent>
      </Card>
    </>
  );
}

/** Business expenses, paid from the petty cash float or the bank, and the petty cash balance. */
function ExpensesView({ me }: { me: string }) {
  const expenses = useFinanceStore((state) => state.expenses);
  const topUps = useFinanceStore((state) => state.pettyCashTopUps);
  const balance = pettyCashBalance(topUps, expenses);
  const [date, setDate] = React.useState(todayIso());
  const [category, setCategory] = React.useState<(typeof EXPENSE_CATEGORIES)[number]>("Travel");
  const [payee, setPayee] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [gstRate, setGstRate] = React.useState("18");
  const [paidFrom, setPaidFrom] = React.useState<"petty cash" | "bank">("petty cash");
  const [topUp, setTopUp] = React.useState("");

  async function save() {
    const problem = await books.addExpense({ date, category, payee, amount: Number(amount), gstRate: Number(gstRate), paidFrom });
    if (problem) return toast.error(problem);
    toast.success("Expense recorded");
    setPayee(""); setAmount("");
  }

  async function topUpCash() {
    const problem = await books.topUpPettyCash({ date, amount: Number(topUp) });
    if (problem) return toast.error(problem);
    toast.success("Petty cash topped up");
    setTopUp("");
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Petty cash · {money(balance)} in hand</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <p className="text-xs text-muted-foreground">Petty cash is a float kept for small payments. Top it up from the bank; a petty cash expense cannot be more than what is in hand.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Input aria-label="Top-up amount" type="number" min={0} className="h-8 w-40" placeholder="Top-up ₹" value={topUp} onChange={(e) => setTopUp(e.target.value)} />
            <Button size="sm" variant="secondary" disabled={!(Number(topUp) > 0)} onClick={topUpCash}>Top up from bank</Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Record an expense</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <Input aria-label="Expense date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <select aria-label="Expense category" className={selectClass} value={category} onChange={(e) => setCategory(e.target.value as (typeof EXPENSE_CATEGORIES)[number])}>{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <Input aria-label="Paid to" placeholder="Paid to" value={payee} onChange={(e) => setPayee(e.target.value)} />
            <Input aria-label="Expense amount" type="number" min={0} placeholder="Amount ex-GST ₹" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Input aria-label="GST rate" type="number" min={0} max={28} placeholder="GST %" value={gstRate} onChange={(e) => setGstRate(e.target.value)} />
            <select aria-label="Paid from" className={selectClass} value={paidFrom} onChange={(e) => setPaidFrom(e.target.value as "petty cash" | "bank")}><option value="petty cash">Petty cash</option><option value="bank">Bank</option></select>
            <Button disabled={payee.trim().length < 2 || !(Number(amount) > 0)} onClick={save}>Record expense</Button>
          </div>
          <p className="text-xs text-muted-foreground">An expense counts as a cost in profit and loss at its amount before GST. A bank expense is paid with GST in cash flow.</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm tabular-nums">
            <thead><tr className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="px-4 py-2">Date</th><th className="px-4 py-2">Category</th><th className="px-4 py-2">Paid to</th><th className="px-4 py-2">Paid from</th><th className="px-4 py-2 text-right">Ex-GST</th></tr></thead>
            <tbody>
              {expenses.length === 0 ? <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No expenses yet.</td></tr> : null}
              {expenses.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">{e.date}</td>
                  <td className="px-4 py-3">{e.category}</td>
                  <td className="px-4 py-3">{e.payee}</td>
                  <td className="px-4 py-3">{e.paidFrom}</td>
                  <td className="px-4 py-3 text-right">{money(e.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}

/** GST summary for one month: output tax on sales by rate, input tax on purchases and expenses, and the net to check. */
function GstView() {
  const invoices = useFinanceStore((state) => state.invoices);
  const creditNotes = useFinanceStore((state) => state.creditNotes);
  const expenses = useFinanceStore((state) => state.expenses);
  const bills = useFinanceStore((state) => state.bills);
  const months = dataMonths(invoices, bills, expenses);
  const [month, setMonth] = React.useState(() => todayIso().slice(0, 7));
  const summary = gstSummary(month, invoices, creditNotes, expenses, bills);

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">GST summary · {month}</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <div className="flex items-center gap-2"><Label htmlFor="gst-month">Month</Label><select id="gst-month" className={selectClass} value={month} onChange={(e) => setMonth(e.target.value)}>{months.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
          <p className="text-xs text-muted-foreground">A summary to check the month, not a return. Approved credit notes reduce the output tax. Bad-debt write-offs are not GST credit notes, so they are not included here. Confirm these figures with the company&apos;s accountant before filing.</p>
          <table className="w-full text-sm tabular-nums">
            <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="py-2">GST rate</th><th className="text-right">Taxable</th><th className="text-right">CGST</th><th className="text-right">SGST</th><th className="text-right">IGST</th></tr></thead>
            <tbody>
              {summary.rows.length === 0 ? <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">No sales invoices this month.</td></tr> : null}
              {summary.rows.map((r) => (
                <tr key={r.rate} className="border-b border-border last:border-0"><td className="py-2">{r.rate}%</td><td className="text-right">{money(r.taxable)}</td><td className="text-right">{money(r.cgst)}</td><td className="text-right">{money(r.sgst)}</td><td className="text-right">{money(r.igst)}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="grid gap-1 text-sm tabular-nums">
            <div className="flex justify-between"><span>Output tax on sales</span><span>{money(summary.outputTax)}</span></div>
            <div className="flex justify-between text-xs text-muted-foreground"><span>Less tax on approved credit notes this month</span><span>{money(summary.creditTax)}</span></div>
            <div className="flex justify-between"><span>Input tax on purchases and expenses</span><span>{money(summary.inputTax)}</span></div>
            <div className="flex justify-between font-semibold"><span>Net to check before filing</span><span>{summary.netPayable < 0 ? `-${money(Math.abs(summary.netPayable))}` : money(summary.netPayable)}</span></div>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">GSTR-1 prep (outward supplies)</CardTitle></CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p className="text-xs text-muted-foreground">Summary of outward supplies for GSTR-1 filing. Due by the 11th of the next month. Verify with your GST consultant before filing.</p>
            {(() => {
              const monthInv = invoices.filter((i) => !i.cancelled && i.date.startsWith(month));
              const b2b = monthInv.filter((i) => i.customerCompany);
              const b2c = monthInv.filter((i) => !i.customerCompany);
              const b2bTotal = b2b.reduce((s, i) => s + invoiceTotals(i).total, 0);
              const b2cTotal = b2c.reduce((s, i) => s + invoiceTotals(i).total, 0);
              const cnInMonth = creditNotes.filter((c) => c.status === "approved" && c.kind !== "write-off" && c.date.startsWith(month));
              const cnTotal = cnInMonth.reduce((s, c) => s + c.amount, 0);
              return <>
                <div className="flex justify-between border-b border-border pb-1"><span>B2B invoices (registered buyers)</span><span className="tabular-nums">{b2b.length} · {money(b2bTotal)}</span></div>
                <div className="flex justify-between border-b border-border pb-1"><span>B2C invoices (unregistered buyers)</span><span className="tabular-nums">{b2c.length} · {money(b2cTotal)}</span></div>
                <div className="flex justify-between border-b border-border pb-1"><span>Credit / debit notes</span><span className="tabular-nums">{cnInMonth.length} · {money(cnTotal)}</span></div>
                <div className="flex justify-between font-semibold"><span>Total outward supplies</span><span className="tabular-nums">{money(b2bTotal + b2cTotal - cnTotal)}</span></div>
              </>;
            })()}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">GSTR-3B prep (monthly return)</CardTitle></CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p className="text-xs text-muted-foreground">Summary for GSTR-3B filing. Due by the 20th of the next month. This return covers output tax, input tax credit (ITC) and net liability.</p>
            {(() => {
              const monthBills = bills.filter((b) => b.date.startsWith(month));
              const blockedItc = monthBills.filter((b) => b.itcBlocked).reduce((s, b) => s + (b.gst ?? 0), 0);
              const eligibleItc = monthBills.filter((b) => !b.itcBlocked).reduce((s, b) => s + (b.gst ?? 0), 0);
              const expItc = expenses.filter((e) => e.date.startsWith(month)).reduce((s, e) => s + e.amount * (e.gstRate / 100), 0);
              return <>
                <div className="flex justify-between border-b border-border pb-1"><span>Output tax liability</span><span className="tabular-nums">{money(summary.outputTax)}</span></div>
                <div className="flex justify-between border-b border-border pb-1"><span>Eligible ITC (bills)</span><span className="tabular-nums">{money(eligibleItc)}</span></div>
                <div className="flex justify-between border-b border-border pb-1"><span>ITC on expenses</span><span className="tabular-nums">{money(Math.round(expItc * 100) / 100)}</span></div>
                {blockedItc > 0 ? <div className="flex justify-between border-b border-border pb-1 text-warning"><span>Blocked ITC (Sec 17(5))</span><span className="tabular-nums">{money(blockedItc)}</span></div> : null}
                <div className="flex justify-between font-semibold"><span>Net GST payable</span><span className="tabular-nums">{summary.netPayable < 0 ? <Badge variant="success">ITC carry-forward {money(Math.abs(summary.netPayable))}</Badge> : money(summary.netPayable)}</span></div>
              </>;
            })()}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

/** Key figures for the company across the books: profit, what customers and vendors owe, cash and the aging of receivables. */
function BalanceSheetView() {
  const invoices = useFinanceStore((state) => state.invoices);
  const creditNotes = useFinanceStore((state) => state.creditNotes);
  const bills = useFinanceStore((state) => state.bills);
  const expenses = useFinanceStore((state) => state.expenses);
  const topUps = useFinanceStore((state) => state.pettyCashTopUps);
  const bankEntries = useFinanceStore((state) => state.bankEntries);
  const openingCash = useFinanceStore((state) => state.openingCash);
  const items = useOperationsStore((state) => state.items);
  const movements = useOperationsStore((state) => state.movements);
  const session = useSession();
  const me = session.user.name ?? session.user.email ?? "You";
  const shareCapital = useFinanceStore((state) => state.shareCapital);
  const [capitalInput, setCapitalInput] = React.useState(String(shareCapital));

  const flow = cashFlowByMonth(invoices, bills, bankEntries, openingCash, expenses, topUps);
  const cash = flow.length > 0 ? flow[flow.length - 1].closing : openingCash;
  const receivables = invoices.filter((i) => !i.cancelled).reduce((sum, i) => sum + dueAmount(i, creditNotes), 0);
  const stock = items.reduce((sum, item) => sum + stockOn(movements, item.id) * item.rate, 0);
  const payables = bills.reduce((sum, bill) => sum + Math.max(0, bill.amount - (bill.tds ?? 0) - bill.payments.reduce((paid, p) => paid + p.amount, 0)), 0);
  const pnl = profitAndLoss(invoices, creditNotes, bills, expenses);
  const reserves = pnl.profit;
  const equity = shareCapital + reserves;

  const faData = [
    { cost: 420000, salvage: 42000, life: 10, method: "SLM" as const, purchased: "2025-04-01" },
    { cost: 350000, salvage: 35000, life: 6, method: "WDV" as const, purchased: "2025-07-15" },
    { cost: 180000, salvage: 18000, life: 10, method: "SLM" as const, purchased: "2026-01-10" },
    { cost: 1850000, salvage: 185000, life: 8, method: "WDV" as const, purchased: "2025-10-01" },
    { cost: 650000, salvage: 0, life: 5, method: "SLM" as const, purchased: "2025-04-01" },
  ];
  const today = todayIso();
  const totalFixedAssets = faData.reduce((sum, a) => {
    const age = Math.max(0, (Date.parse(today) - Date.parse(a.purchased)) / (365.25 * 86400000));
    if (a.method === "SLM") { const dep = (a.cost - a.salvage) / a.life; return sum + Math.max(a.salvage, Math.round(a.cost - dep * Math.min(age, a.life))); }
    const rate = 1 - Math.pow(a.salvage / Math.max(1, a.cost), 1 / a.life);
    return sum + Math.max(a.salvage, Math.round(a.cost * Math.pow(1 - rate, Math.min(age, a.life))));
  }, 0);
  const currentAssets = cash + receivables + stock;
  const totalAssets = currentAssets + totalFixedAssets;
  const totalLiabilitiesAndEquity = equity + payables;
  const difference = Math.round((totalAssets - totalLiabilitiesAndEquity) * 100) / 100;

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="mt-4 first:mt-0">
      <p className="mb-2 border-b border-border pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      {children}
    </div>
  );
  const Row = ({ label, value, bold, indent }: { label: string; value: number; bold?: boolean; indent?: boolean }) => (
    <div className={`flex justify-between border-b border-border py-1.5 text-sm tabular-nums ${bold ? "font-semibold" : ""} ${indent ? "pl-4" : ""}`}>
      <span>{label}</span>
      <span className={value < 0 ? "text-danger" : ""}>{value < 0 ? `-${money(Math.abs(value))}` : money(value)}</span>
    </div>
  );

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Balance Sheet — Schedule III (Vertical)</CardTitle></CardHeader>
        <CardContent className="max-w-xl">
          <p className="mb-4 text-xs text-muted-foreground">Laid out per the Companies Act 2013, Schedule III. Enter share capital from the company&apos;s records. A non-zero difference means entries are still missing.</p>
          <form className="mb-4 flex flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); const p = await books.setShareCapital(Number(capitalInput) || 0); if (p) toast.error(p); else toast.success("Share capital saved"); }}>
            <Label htmlFor="share-capital-bs" className="grid gap-1 text-xs">Share capital (₹)<Input id="share-capital-bs" type="number" min={0} value={capitalInput} onChange={(e) => setCapitalInput(e.target.value)} className="w-40" /></Label>
            <Button type="submit" size="sm" variant="secondary">Save</Button>
          </form>

          <Section title="I. Equity and Liabilities">
            <Section title="(A) Shareholders' Funds">
              <Row label="Share capital" value={shareCapital} indent />
              <Row label="Reserves and surplus (profit to date)" value={reserves} indent />
              <Row label="Total equity" value={equity} bold />
            </Section>
            <Section title="(B) Current Liabilities">
              <Row label="Trade payables (bills still owed)" value={payables} indent />
              <Row label="Total current liabilities" value={payables} bold />
            </Section>
            <Row label="Total equity and liabilities" value={totalLiabilitiesAndEquity} bold />
          </Section>

          <Section title="II. Assets">
            <Section title="(A) Non-Current Assets">
              <Row label="Property, plant and equipment" value={totalFixedAssets} indent />
              <Row label="Total non-current assets" value={totalFixedAssets} bold />
            </Section>
            <Section title="(B) Current Assets">
              <Row label="Cash and bank balances" value={cash} indent />
              <Row label="Trade receivables" value={receivables} indent />
              <Row label="Inventories (at item rate)" value={stock} indent />
              <Row label="Total current assets" value={currentAssets} bold />
            </Section>
            <Row label="Total assets" value={totalAssets} bold />
          </Section>

          {difference !== 0 && (
            <div className="mt-4 rounded-md border border-warning-border bg-warning-muted p-3 text-sm">
              <span className="font-semibold">Difference to reconcile: {money(Math.abs(difference))}</span>
              <span className="ml-2 text-muted-foreground">— check opening balances, fixed assets, or other missing entries.</span>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi label="Total equity" value={money(equity)} detail={`Capital ${money(shareCapital)} + Reserves`} />
        <Kpi label="Total assets" value={money(totalAssets)} detail={`Fixed ${money(totalFixedAssets)} + Current`} />
        <Kpi label="Net working capital" value={money(currentAssets - payables)} detail="Current assets − current liabilities" tone={currentAssets - payables < 0 ? "warning" : undefined} />
        <Kpi label="Debt-equity ratio" value={equity > 0 ? (payables / equity).toFixed(2) : "—"} detail="Payables ÷ equity" />
      </div>
    </>
  );
}

/** Bank statement lines matched to the payments recorded in the books. A match needs the same amount and direction. */
function ReconciliationView({ me }: { me: string }) {
  const invoices = useFinanceStore((state) => state.invoices);
  const bills = useFinanceStore((state) => state.bills);
  const bankLines = useFinanceStore((state) => state.bankLines);
  const [text, setText] = React.useState("");
  const [errors, setErrors] = React.useState<string[]>([]);
  const matchExpenses = useFinanceStore((state) => state.expenses);
  const matchTopUps = useFinanceStore((state) => state.pettyCashTopUps);
  const matchMovements = useFinanceStore((state) => state.bankEntries);
  const payments = bookPayments(invoices, bills, matchExpenses, matchTopUps, matchMovements);
  const matchedKeys = new Set(bankLines.filter((l) => l.matchedKey).map((l) => l.matchedKey));
  const unmatchedPayments = payments.filter((p) => !matchedKeys.has(p.key));
  const unmatchedLines = bankLines.filter((l) => !l.matchedKey).length;

  async function save() {
    const result = await books.importBankStatement(text);
    setErrors(result.errors);
    if (result.imported > 0) {
      toast.success(`${result.imported} line${result.imported === 1 ? "" : "s"} imported`);
      setText("");
    }
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Import a bank statement</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <p className="text-xs text-muted-foreground">Paste one line per bank entry: date, description, amount. Use a plus for money in and a minus for money out, for example 2026-10-20,NEFT from Kavita Rao,30000 or 2026-10-21,NEFT to Vendor Co,-12500.</p>
          <Textarea aria-label="Bank statement lines" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="2026-10-20,NEFT from Kavita Rao,30000" />
          {errors.length > 0 ? <ul className="list-disc pl-5 text-xs text-danger">{errors.map((e) => <li key={e}>{e}</li>)}</ul> : null}
          <Button className="w-fit" disabled={text.trim().length === 0} onClick={save}>Import lines</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Statement lines · {unmatchedLines} not matched</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {bankLines.length === 0 ? <p className="text-muted-foreground">No statement lines yet.</p> : null}
          {bankLines.map((line) => {
            // Exact amounts first, then the nearest: the right match is usually at the top.
            const options = payments.filter((p) => (p.direction === 1) === (line.amount > 0) && (!matchedKeys.has(p.key) || p.key === line.matchedKey)).sort((a, b) => Math.abs(a.amount - Math.abs(line.amount)) - Math.abs(b.amount - Math.abs(line.amount)));
            return (
              <div key={line.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0">
                <span>
                  <span className="text-muted-foreground">{line.date} · </span>{line.description} · <span className="tabular-nums">{line.amount < 0 ? `-${money(Math.abs(line.amount))}` : money(line.amount)}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant={line.matchedKey ? "success" : "warning"}>{line.matchedKey ? "matched" : "not matched"}</Badge>
                  <select aria-label={`Match ${line.description}`} className={selectClass} value={line.matchedKey ?? ""} onChange={async (e) => { const key = e.target.value || null; const p = await books.matchBankLine(line.id, key); if (p) toast.error(p); }}>
                    <option value="">{line.matchedKey ? "Unmatch…" : "Match to a payment…"}</option>
                    {options.map((o) => <option key={o.key} value={o.key}>{o.label} · {money(o.amount)} · {o.date}</option>)}
                  </select>
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Payments in the books not on a statement line · {unmatchedPayments.length}</CardTitle></CardHeader>
        <CardContent className="grid gap-1 text-sm">
          {unmatchedPayments.length === 0 ? <p className="text-muted-foreground">Every recorded payment is on a statement line.</p> : null}
          {unmatchedPayments.map((p) => <p key={p.key}><span className="text-muted-foreground">{p.date} · </span>{p.label} · {money(p.amount)}</p>)}
        </CardContent>
      </Card>
    </>
  );
}

/** Cash in and out by month, from the invoice payments and bill payments recorded, plus bank movements entered by hand. */
function CashFlowView({ me }: { me: string }) {
  const invoices = useFinanceStore((state) => state.invoices);
  const bills = useFinanceStore((state) => state.bills);
  const bankEntries = useFinanceStore((state) => state.bankEntries);
  const expenses = useFinanceStore((state) => state.expenses);
  const pettyCashTopUps = useFinanceStore((state) => state.pettyCashTopUps);
  const openingCash = useFinanceStore((state) => state.openingCash);
  const [opening, setOpening] = React.useState(String(openingCash));
  const [description, setDescription] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [direction, setDirection] = React.useState<"in" | "out">("out");
  const [date, setDate] = React.useState(todayIso());
  const months = cashFlowByMonth(invoices, bills, bankEntries, openingCash, expenses, pettyCashTopUps);
  const lastClosing = months.length > 0 ? months[months.length - 1].closing : openingCash;

  async function saveOpening() {
    const problem = await books.setOpeningCash(Number(opening));
    if (problem) return toast.error(problem);
    toast.success("Opening cash saved");
  }

  async function saveEntry() {
    const sign = direction === "in" ? 1 : -1;
    const problem = await books.addBankEntry({ date, description, amount: sign * Math.abs(Number(amount)) });
    if (problem) return toast.error(problem);
    toast.success("Bank movement recorded");
    setDescription(""); setAmount("");
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Cash position</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <p className="text-xs text-muted-foreground">Cash in is customer payments recorded on invoices. Cash out is bill payments. Bank charges, loans and other bank movements that are not in the books are entered below. Compare the closing figure with the bank statement; any difference is a movement not yet entered.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="cf-opening">Opening cash (₹)</Label>
            <Input id="cf-opening" type="number" min={0} className="h-8 w-40" value={opening} onChange={(e) => setOpening(e.target.value)} />
            <Button size="sm" variant="secondary" onClick={saveOpening}>Save opening cash</Button>
          </div>
          <p>Closing cash to date: <span className="font-semibold tabular-nums">{money(lastClosing)}</span></p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm tabular-nums">
            <thead><tr className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="px-4 py-2">Month</th><th className="px-4 py-2 text-right">Cash in</th><th className="px-4 py-2 text-right">Cash out</th><th className="px-4 py-2 text-right">Bank movements</th><th className="px-4 py-2 text-right">Net</th><th className="px-4 py-2 text-right">Closing</th></tr></thead>
            <tbody>
              {months.length === 0 ? <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No cash movements yet.</td></tr> : null}
              {months.map((row) => (
                <tr key={row.month} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">{row.month}</td>
                  <td className="px-4 py-3 text-right">{money(row.receipts)}</td>
                  <td className="px-4 py-3 text-right">{money(row.payments)}</td>
                  <td className={`px-4 py-3 text-right ${row.other < 0 ? "text-danger" : ""}`}>{row.other < 0 ? `-${money(Math.abs(row.other))}` : money(row.other)}</td>
                  <td className={`px-4 py-3 text-right ${row.net < 0 ? "text-danger" : ""}`}>{row.net < 0 ? `-${money(Math.abs(row.net))}` : money(row.net)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{money(row.closing)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Bank movement not in the books</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-5">
            <Input aria-label="Bank movement date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <Input aria-label="Bank movement description" placeholder="e.g. Bank charges, September" value={description} onChange={(e) => setDescription(e.target.value)} />
            <Input aria-label="Bank movement amount" type="number" min={0} placeholder="Amount ₹" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <select aria-label="Direction" className={selectClass} value={direction} onChange={(e) => setDirection(e.target.value as "in" | "out")}><option value="out">Money out</option><option value="in">Money in</option></select>
            <Button disabled={description.trim().length < 3 || !(Number(amount) > 0)} onClick={saveEntry}>Record movement</Button>
          </div>
          {bankEntries.map((entry) => (
            <p key={entry.id} className="text-xs"><span className="text-muted-foreground">{entry.date} · </span>{entry.description} · {entry.amount < 0 ? `-${money(Math.abs(entry.amount))}` : money(entry.amount)}</p>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

function ProfitLossView() {
  const invoices = useFinanceStore((state) => state.invoices);
  const creditNotes = useFinanceStore((state) => state.creditNotes);
  const bills = useFinanceStore((state) => state.bills);
  const expenses = useFinanceStore((state) => state.expenses);
  const payrollRuns = useHrPeopleStore((state) => state.payrollRuns);
  const paidClaims = useHrPeopleStore((state) => state.expenseClaims).filter((c) => c.status === "paid");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const inPeriod = (date: string) => (!from || date >= from) && (!to || date <= to);
  const pnl = profitAndLoss(
    invoices.filter((i) => inPeriod(i.date)),
    creditNotes.filter((c) => inPeriod(c.date)),
    bills.filter((b) => inPeriod(b.date)),
    expenses.filter((e) => inPeriod(e.date)),
  );
  const lockedRuns = payrollRuns.filter((r) => r.status === "locked" && inPeriod(r.id.replace(/^pay-/, "") + "-01"));
  const payrollNet = lockedRuns.reduce((sum, r) => sum + r.net, 0);
  const reimbursements = paidClaims.filter((c) => inPeriod(c.submittedAt)).reduce((sum, c) => sum + c.amount, 0);
  const profitAfterPayroll = Math.round((pnl.profit - payrollNet - reimbursements) * 100) / 100;
  const rows: [string, number, boolean][] = [
    ["Sales (ex-GST)", pnl.sales, false],
    ["Less approved credit notes (ex-GST)", -pnl.credits || 0, false],
    ["Net sales", pnl.netSales, true],
    ["Less bills recorded (ex-GST)", -pnl.billCosts || 0, false],
    ["Less expenses", -pnl.expenseCosts || 0, false],
    ["Less bad debt written off", -pnl.writeOffs || 0, false],
    ["Profit before payroll", pnl.profit, true],
    ...(payrollNet > 0 || reimbursements > 0 ? [
      ["Less payroll (locked runs)", -payrollNet || 0, false] as [string, number, boolean],
      ["Less employee reimbursements (paid)", -reimbursements || 0, false] as [string, number, boolean],
      ["Net profit", profitAfterPayroll, true] as [string, number, boolean],
    ] : []),
  ];
  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Profit and loss{from || to ? " for the period" : " to date"}</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <div className="flex flex-wrap items-end gap-3 text-xs">
            <label className="grid gap-1">From <Input type="date" aria-label="Period from" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="grid gap-1">To <Input type="date" aria-label="Period to" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            {from || to ? <Button size="sm" variant="ghost" onClick={() => { setFrom(""); setTo(""); }}>Clear period</Button> : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Sales are shown without GST. A credit note reduces sales by its share of the invoice before GST. Bills are costs at their amount before GST. Expenses are costs at their entered amount. Payroll costs come from locked HR payroll runs; paid employee reimbursements are from HR expenses.
          </p>
          <table className="w-full text-sm tabular-nums">
            <tbody>
              {rows.map(([label, value, strong]) => (
                <tr key={label} className={`border-b border-border last:border-0 ${strong ? "font-semibold" : ""}`}>
                  <td className="py-2">{label}</td>
                  <td className={`py-2 text-right ${value < 0 ? "text-danger" : ""}`}>{value < 0 ? `-${money(Math.abs(value))}` : money(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-sm">Margin on net sales: {pnl.margin === null ? "not available yet" : `${pnl.margin}%`}</p>
        </CardContent>
      </Card>
      <BalanceSheetCard />
    </>
  );
}

/**
 * Balance sheet to date (plan §8.7 V2, Schedule III layout). Every figure comes from a record: cash from the cash flow
 * closing balance, receivables from invoices still owed, stock at the item rate, and payables from bills still owed.
 * Equity is the share capital entered plus reserves and surplus (the profit to date). Any gap is shown as a difference.
 */
function BalanceSheetCard() {
  const invoices = useFinanceStore((state) => state.invoices);
  const creditNotes = useFinanceStore((state) => state.creditNotes);
  const bills = useFinanceStore((state) => state.bills);
  const bankEntries = useFinanceStore((state) => state.bankEntries);
  const openingCash = useFinanceStore((state) => state.openingCash);
  const expenses = useFinanceStore((state) => state.expenses);
  const topUps = useFinanceStore((state) => state.pettyCashTopUps);
  const items = useOperationsStore((state) => state.items);
  const movements = useOperationsStore((state) => state.movements);
  const session = useSession();
  const me = session.user.name ?? session.user.email ?? "You";
  const shareCapital = useFinanceStore((state) => state.shareCapital);
  const [capitalInput, setCapitalInput] = React.useState(String(shareCapital));
  const flow = cashFlowByMonth(invoices, bills, bankEntries, openingCash, expenses, topUps);
  const cash = flow.length > 0 ? flow[flow.length - 1].closing : openingCash;
  const receivables = invoices.filter((i) => !i.cancelled).reduce((sum, i) => sum + dueAmount(i, creditNotes), 0);
  const stock = items.reduce((sum, item) => sum + stockOn(movements, item.id) * item.rate, 0);
  const payables = bills.reduce((sum, bill) => sum + Math.max(0, bill.amount - (bill.tds ?? 0) - bill.payments.reduce((paid, p) => paid + p.amount, 0)), 0);
  // Schedule III, vertical form: equity is share capital plus reserves and surplus; reserves include the profit to date.
  const reserves = profitAndLoss(invoices, creditNotes, bills, expenses).profit;
  const equity = shareCapital + reserves;
  const assets = cash + receivables + stock;
  const liabilitiesAndEquity = equity + payables;
  const difference = Math.round((assets - liabilitiesAndEquity) * 100) / 100;
  const rows: [string, number, boolean][] = [
    ["Share capital", shareCapital, false],
    ["Reserves and surplus (profit to date)", reserves, false],
    ["Total equity", equity, true],
    ["Trade payables (bills still owed)", payables, false],
    ["Total equity and liabilities", liabilitiesAndEquity, true],
    ["Cash and bank", cash, false],
    ["Trade receivables (owed by customers)", receivables, false],
    ["Inventories (at item rate)", stock, false],
    ["Total assets", assets, true],
    ["Difference to reconcile", difference, false],
  ];
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Balance sheet to date</CardTitle></CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <p className="text-xs text-muted-foreground">Laid out as Schedule III requires: equity and liabilities, then assets. Enter the share capital from the company&apos;s records. A difference other than zero means some entries are still missing, such as opening balances or fixed assets, and is shown rather than hidden.</p>
        <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); const p = await books.setShareCapital(Number(capitalInput) || 0); if (p) toast.error(p); else toast.success("Share capital saved"); }}>
          <Label htmlFor="share-capital" className="grid gap-1 text-xs">Share capital (₹)<Input id="share-capital" type="number" min={0} value={capitalInput} onChange={(e) => setCapitalInput(e.target.value)} className="w-40" /></Label>
          <Button type="submit" size="sm" variant="secondary">Save share capital</Button>
        </form>
        <table className="w-full text-sm tabular-nums">
          <tbody>
            {rows.map(([label, value, strong]) => (
              <tr key={label} className={`border-b border-border last:border-0 ${strong ? "font-semibold" : ""}`}>
                <td className="py-2">{label}</td>
                <td className={`py-2 text-right ${value < 0 ? "text-danger" : ""}`}>{value < 0 ? `-${money(Math.abs(value))}` : money(value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function PayrollHrCostsView() {
  const payrollRuns = useHrPeopleStore((state) => state.payrollRuns);
  const expenseClaims = useHrPeopleStore((state) => state.expenseClaims);
  const employees = useHrPeopleStore((state) => state.employees);
  const activeCount = employees.filter((e) => e.status !== "archived").length;

  const locked = payrollRuns.filter((r) => r.status === "locked");
  const totalPayrollNet = locked.reduce((sum, r) => sum + r.net, 0);
  const totalPayrollGross = locked.reduce((sum, r) => sum + r.gross, 0);
  const totalDeductions = locked.reduce((sum, r) => sum + r.deductions, 0);
  const latestRun = payrollRuns[0];

  const approved = expenseClaims.filter((c) => c.status === "approved");
  const paid = expenseClaims.filter((c) => c.status === "paid");
  const pendingAmount = approved.reduce((sum, c) => sum + c.amount, 0);
  const paidAmount = paid.reduce((sum, c) => sum + c.amount, 0);

  const monthLabel = (key: string) => { try { return new Date(`${key}-01T12:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" }); } catch { return key; } };
  const to = (view: string) => workspaceHref("finance-accounting", view);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi label="Payroll (locked)" value={money(totalPayrollNet)} detail={`${locked.length} months · ${activeCount} employees`} href={to("hr-costs")} />
        <Kpi label="Gross pay (locked)" value={money(totalPayrollGross)} detail={`Deductions ${money(totalDeductions)}`} />
        <Kpi label="Reimbursements pending" value={money(pendingAmount)} detail={`${approved.length} claims approved, awaiting payment`} tone={approved.length > 0 ? "warning" : undefined} />
        <Kpi label="Reimbursements paid" value={money(paidAmount)} detail={`${paid.length} claims settled`} />
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Payroll run summary</CardTitle>
          <Button size="sm" variant="outline" asChild><Link href="/workspace/hr-people?view=payroll">Open HR Payroll</Link></Button>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="px-4 py-2">Month</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Employees</th><th className="px-4 py-2 text-right">Gross</th><th className="px-4 py-2 text-right">Deductions</th><th className="px-4 py-2 text-right">Net pay</th></tr></thead>
            <tbody>
              {payrollRuns.length === 0 ? <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No payroll runs in HR yet.</td></tr> : null}
              {payrollRuns.map((run) => {
                const key = run.id.replace(/^pay-/, "");
                return (
                  <tr key={run.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium">{monthLabel(key)}</td>
                    <td className="px-4 py-3"><Badge variant={run.status === "locked" ? "success" : run.status === "approved" ? "info" : "neutral"}>{run.status}</Badge></td>
                    <td className="px-4 py-3">{run.employeeCount || "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{run.gross ? money(run.gross) : "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{run.deductions ? money(run.deductions) : "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">{run.net ? money(run.net) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
            {locked.length > 1 ? <tfoot><tr className="border-t border-border bg-surface-2 text-sm font-semibold"><td className="px-4 py-2" colSpan={3}>Total (locked runs)</td><td className="px-4 py-2 text-right tabular-nums">{money(totalPayrollGross)}</td><td className="px-4 py-2 text-right tabular-nums">{money(totalDeductions)}</td><td className="px-4 py-2 text-right tabular-nums">{money(totalPayrollNet)}</td></tr></tfoot> : null}
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Employee reimbursements</CardTitle>
          <Button size="sm" variant="outline" asChild><Link href="/workspace/hr-people?view=expenses">Open HR Expenses</Link></Button>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="px-4 py-2">Employee</th><th className="px-4 py-2">Category</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2">Submitted</th><th className="px-4 py-2">Status</th></tr></thead>
            <tbody>
              {[...approved, ...paid].length === 0 ? <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No approved or paid employee reimbursements.</td></tr> : null}
              {[...approved, ...paid].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).map((claim) => (
                <tr key={claim.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">{claim.employeeName}</td>
                  <td className="px-4 py-3">{expenseLabels[claim.category]}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(claim.amount)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{claim.submittedAt.slice(0, 10)}</td>
                  <td className="px-4 py-3"><Badge variant={claim.status === "paid" ? "success" : "warning"}>{claim.status === "approved" ? "Approved · awaiting payment" : "Paid"}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          <p>Payroll is processed in the HR workspace. Only locked payroll runs count as a cost in Profit & Loss. Employee reimbursements go through the HR approval chain (employee → manager → HR); Finance marks them paid in HR Expenses. <Link href="/workspace/hr-people?view=payroll" className="text-accent hover:underline">Go to HR Payroll</Link> · <Link href="/workspace/hr-people?view=expenses" className="text-accent hover:underline">Go to HR Expenses</Link></p>
        </CardContent>
      </Card>
    </>
  );
}

/** Income by customer and month: revenue from invoices (ex-GST), broken down to see where the money comes from. */
function IncomeView() {
  const invoices = useFinanceStore((state) => state.invoices);
  const creditNotes = useFinanceStore((state) => state.creditNotes);
  const live = invoices.filter((i) => !i.cancelled);
  const months = [...new Set(live.map((i) => i.date.slice(0, 7)))].sort().reverse();
  const [month, setMonth] = React.useState(() => months[0] ?? todayIso().slice(0, 7));
  const inMonth = live.filter((i) => i.date.startsWith(month));
  const taxable = inMonth.reduce((s, i) => s + invoiceTotals(i).taxable, 0);
  const gstCollected = inMonth.reduce((s, i) => { const t = invoiceTotals(i); return s + t.cgst + t.sgst + t.igst; }, 0);
  const credited = creditNotes.filter((c) => c.status === "approved" && c.date.startsWith(month)).reduce((s, c) => s + c.amount, 0);
  const byCustomer = new Map<string, { count: number; taxable: number; total: number }>();
  for (const inv of inMonth) {
    const name = inv.customerCompany || inv.customer;
    const totals = invoiceTotals(inv);
    const prev = byCustomer.get(name) ?? { count: 0, taxable: 0, total: 0 };
    byCustomer.set(name, { count: prev.count + 1, taxable: prev.taxable + totals.taxable, total: prev.total + totals.total });
  }
  const sorted = [...byCustomer.entries()].sort((a, b) => b[1].taxable - a[1].taxable);
  const monthLabel = (m: string) => { try { return new Date(`${m}-01T12:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" }); } catch { return m; } };
  const to = (view: string) => workspaceHref("finance-accounting", view);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi label="Revenue (ex-GST)" value={money(taxable)} detail={monthLabel(month)} href={to("income")} />
        <Kpi label="GST collected" value={money(gstCollected)} detail="Output tax" />
        <Kpi label="Credit notes" value={money(credited)} detail="Approved this month" tone={credited > 0 ? "warning" : undefined} />
        <Kpi label="Net revenue" value={money(taxable - credited)} detail="After credit notes" />
      </div>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Revenue by customer · {monthLabel(month)}</CardTitle>
          <select aria-label="Month" className={selectClass} value={month} onChange={(e) => setMonth(e.target.value)}>{months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[500px] text-sm">
            <thead><tr className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="px-4 py-2">Customer</th><th className="px-4 py-2 text-right">Invoices</th><th className="px-4 py-2 text-right">Taxable (ex-GST)</th><th className="px-4 py-2 text-right">Total (incl. GST)</th><th className="px-4 py-2 text-right">Share</th></tr></thead>
            <tbody>
              {sorted.length === 0 ? <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No invoices this month.</td></tr> : null}
              {sorted.map(([name, data]) => <tr key={name} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium">{name}</td>
                <td className="px-4 py-3 text-right tabular-nums">{data.count}</td>
                <td className="px-4 py-3 text-right tabular-nums">{money(data.taxable)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{money(data.total)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{taxable > 0 ? `${Math.round((data.taxable / taxable) * 100)}%` : "—"}</td>
              </tr>)}
            </tbody>
            {sorted.length > 1 ? <tfoot><tr className="border-t border-border bg-surface-2 text-sm font-semibold"><td className="px-4 py-2">Total</td><td className="px-4 py-2 text-right tabular-nums">{inMonth.length}</td><td className="px-4 py-2 text-right tabular-nums">{money(taxable)}</td><td className="px-4 py-2 text-right tabular-nums">{money(inMonth.reduce((s, i) => s + invoiceTotals(i).total, 0))}</td><td className="px-4 py-2 text-right">100%</td></tr></tfoot> : null}
          </table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Monthly revenue trend</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[400px] text-sm">
            <thead><tr className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="px-4 py-2">Month</th><th className="px-4 py-2 text-right">Invoices</th><th className="px-4 py-2 text-right">Revenue (ex-GST)</th><th className="px-4 py-2">Bar</th></tr></thead>
            <tbody>{(() => {
              const allMonths = [...new Set(live.map((i) => i.date.slice(0, 7)))].sort();
              const maxRev = Math.max(1, ...allMonths.map((m) => live.filter((i) => i.date.startsWith(m)).reduce((s, i) => s + invoiceTotals(i).taxable, 0)));
              return allMonths.map((m) => {
                const inM = live.filter((i) => i.date.startsWith(m));
                const rev = inM.reduce((s, i) => s + invoiceTotals(i).taxable, 0);
                return <tr key={m} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">{monthLabel(m)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{inM.length}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(rev)}</td>
                  <td className="px-4 py-3"><div className="h-3 bg-surface-2"><div className="h-3 bg-accent" style={{ width: `${(rev / maxRev) * 100}%` }} /></div></td>
                </tr>;
              });
            })()}</tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}

/** TDS compliance: amounts deducted by section, challan tracking and Form 26Q summary. */
function TdsComplianceView() {
  const bills = useFinanceStore((state) => state.bills);
  const withTds = bills.filter((b) => (b.tds ?? 0) > 0);
  const months = [...new Set(withTds.map((b) => b.date.slice(0, 7)))].sort().reverse();
  const [month, setMonth] = React.useState(() => months[0] ?? todayIso().slice(0, 7));
  const inMonth = withTds.filter((b) => b.date.startsWith(month));

  const bySection: Record<string, { count: number; billAmount: number; tdsAmount: number }> = {};
  for (const b of inMonth) {
    const sec = b.tdsSection ?? "Unknown";
    const prev = bySection[sec] ?? { count: 0, billAmount: 0, tdsAmount: 0 };
    bySection[sec] = { count: prev.count + 1, billAmount: prev.billAmount + b.amount, tdsAmount: prev.tdsAmount + (b.tds ?? 0) };
  }
  const sections = Object.entries(bySection).sort((a, b) => b[1].tdsAmount - a[1].tdsAmount);
  const totalTds = inMonth.reduce((s, b) => s + (b.tds ?? 0), 0);

  const sectionNames: Record<string, string> = {
    "194C": "Payments to contractors", "194J": "Professional / technical fees", "194I": "Rent",
    "194H": "Commission / brokerage", "194Q": "Purchase of goods (₹50L+)", "194A": "Interest other than securities",
  };

  type ChallanStatus = "pending" | "deposited" | "overdue";
  interface Challan { month: string; section: string; amount: number; dueDate: string; status: ChallanStatus; bsrCode: string | null; depositDate: string | null }
  const [challans, setChallans] = React.useState<Challan[]>(() => {
    return months.slice(0, 3).flatMap((m) => {
      const bills = withTds.filter((b) => b.date.startsWith(m));
      const secs = [...new Set(bills.map((b) => b.tdsSection ?? "194C"))];
      const dueDay = `${m}-07`;
      const today = todayIso();
      return secs.map((sec) => {
        const amt = bills.filter((b) => (b.tdsSection ?? "194C") === sec).reduce((s, b) => s + (b.tds ?? 0), 0);
        const deposited = m < today.slice(0, 7);
        return { month: m, section: sec, amount: amt, dueDate: dueDay, status: (deposited ? "deposited" : dueDay < today ? "overdue" : "pending") as ChallanStatus, bsrCode: deposited ? `BSR-${Math.random().toString(36).slice(2, 9).toUpperCase()}` : null, depositDate: deposited ? `${m}-05` : null };
      });
    });
  });

  function markDeposited(idx: number) {
    setChallans((prev) => prev.map((c, i) => i === idx ? { ...c, status: "deposited" as ChallanStatus, depositDate: todayIso(), bsrCode: `BSR-${crypto.randomUUID().slice(0, 7).toUpperCase()}` } : c));
    toast.success("Challan marked as deposited");
  }

  const monthLabel = (m: string) => { try { return new Date(`${m}-01T12:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" }); } catch { return m; } };

  const qtr = (m: string) => { const mo = parseInt(m.slice(5)); if (mo <= 3) return "Q4 (Jan–Mar)"; if (mo <= 6) return "Q1 (Apr–Jun)"; if (mo <= 9) return "Q2 (Jul–Sep)"; return "Q3 (Oct–Dec)"; };

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi label="TDS deducted" value={money(totalTds)} detail={monthLabel(month)} />
        <Kpi label="Bills with TDS" value={String(inMonth.length)} detail={`${sections.length} sections`} />
        <Kpi label="Challans pending" value={String(challans.filter((c) => c.status === "pending").length)} detail="To be deposited by 7th" tone={challans.some((c) => c.status === "overdue") ? "warning" : undefined} />
        <Kpi label="Quarter" value={qtr(month)} detail="For Form 26Q" />
      </div>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">TDS by section · {monthLabel(month)}</CardTitle>
          {months.length > 0 && <select aria-label="Month" className={selectClass} value={month} onChange={(e) => setMonth(e.target.value)}>{months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select>}
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[500px] text-sm">
            <thead><tr className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="px-4 py-2">Section</th><th className="px-4 py-2">Nature</th><th className="px-4 py-2 text-right">Bills</th><th className="px-4 py-2 text-right">Bill amount</th><th className="px-4 py-2 text-right">TDS deducted</th></tr></thead>
            <tbody>
              {sections.length === 0 ? <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No TDS deductions this month.</td></tr> : null}
              {sections.map(([sec, data]) => <tr key={sec} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium">{sec}</td>
                <td className="px-4 py-3 text-muted-foreground">{sectionNames[sec] ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums">{data.count}</td>
                <td className="px-4 py-3 text-right tabular-nums">{money(data.billAmount)}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">{money(data.tdsAmount)}</td>
              </tr>)}
            </tbody>
            {sections.length > 1 ? <tfoot><tr className="border-t border-border bg-surface-2 text-sm font-semibold"><td className="px-4 py-2" colSpan={3}>Total</td><td className="px-4 py-2 text-right tabular-nums">{money(inMonth.reduce((s, b) => s + b.amount, 0))}</td><td className="px-4 py-2 text-right tabular-nums">{money(totalTds)}</td></tr></tfoot> : null}
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Vendor-wise TDS · {monthLabel(month)}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[500px] text-sm">
            <thead><tr className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="px-4 py-2">Vendor</th><th className="px-4 py-2">Bill no.</th><th className="px-4 py-2">Section</th><th className="px-4 py-2 text-right">Bill amount</th><th className="px-4 py-2 text-right">TDS</th></tr></thead>
            <tbody>
              {inMonth.length === 0 ? <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No TDS deductions.</td></tr> : null}
              {inMonth.map((b) => <tr key={b.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium">{b.vendor}</td>
                <td className="px-4 py-3 text-muted-foreground">{b.vendorBillNo}</td>
                <td className="px-4 py-3">{b.tdsSection ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums">{money(b.amount)}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">{money(b.tds ?? 0)}</td>
              </tr>)}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">TDS challans</CardTitle><p className="text-xs text-muted-foreground">TDS must be deposited by the 7th of the following month. Mark each challan deposited once the payment is confirmed with BSR code.</p></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="px-4 py-2">Period</th><th className="px-4 py-2">Section</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2">Due</th><th className="px-4 py-2">BSR code</th><th className="px-4 py-2">Status</th><th className="px-4 py-2" /></tr></thead>
            <tbody>
              {challans.length === 0 ? <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">No challans generated yet.</td></tr> : null}
              {challans.map((c, i) => <tr key={`${c.month}-${c.section}`} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium">{monthLabel(c.month)}</td>
                <td className="px-4 py-3">{c.section}</td>
                <td className="px-4 py-3 text-right tabular-nums">{money(c.amount)}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.dueDate}</td>
                <td className="px-4 py-3 font-mono text-xs">{c.bsrCode ?? "—"}</td>
                <td className="px-4 py-3"><Badge variant={c.status === "deposited" ? "success" : c.status === "overdue" ? "danger" : "warning"}>{c.status}</Badge></td>
                <td className="px-4 py-3">{c.status !== "deposited" && <Button size="sm" variant="secondary" onClick={() => markDeposited(i)}>Mark deposited</Button>}</td>
              </tr>)}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          <p>TDS on vendor bills is deducted at the time of bill entry. The company deposits TDS with the government by the 7th of the next month (Challan 281). Quarterly returns (Form 26Q for non-salary, 24Q for salary) are filed within 31 days of the quarter end. Form 16A is issued to vendors after filing.</p>
        </CardContent>
      </Card>
    </>
  );
}

/** Fixed assets: capital items with their purchase cost, depreciation schedule and current book value. */
function FixedAssetsView() {
  type DepMethod = "SLM" | "WDV";
  interface FixedAsset { id: string; name: string; category: string; purchaseDate: string; cost: number; usefulLifeYears: number; depMethod: DepMethod; salvageValue: number; notes: string }
  const today = todayIso();

  const [assets, setAssets] = React.useState<FixedAsset[]>([
    { id: "fa-1", name: "Office furniture (desks & chairs)", category: "Furniture & fittings", purchaseDate: "2025-04-01", cost: 420000, usefulLifeYears: 10, depMethod: "SLM", salvageValue: 42000, notes: "Head office, 2nd floor" },
    { id: "fa-2", name: "Dell PowerEdge server", category: "Plant & machinery", purchaseDate: "2025-07-15", cost: 350000, usefulLifeYears: 6, depMethod: "WDV", salvageValue: 35000, notes: "On-prem server rack" },
    { id: "fa-3", name: "Air conditioning system", category: "Plant & machinery", purchaseDate: "2026-01-10", cost: 180000, usefulLifeYears: 10, depMethod: "SLM", salvageValue: 18000, notes: "" },
    { id: "fa-4", name: "Company vehicle (Innova)", category: "Vehicles", purchaseDate: "2025-10-01", cost: 1850000, usefulLifeYears: 8, depMethod: "WDV", salvageValue: 185000, notes: "Company transport" },
    { id: "fa-5", name: "Leasehold improvements", category: "Building", purchaseDate: "2025-04-01", cost: 650000, usefulLifeYears: 5, depMethod: "SLM", salvageValue: 0, notes: "Office fit-out" },
  ]);
  const [adding, setAdding] = React.useState(false);

  function bookValue(a: FixedAsset): number {
    const ageYears = Math.max(0, (Date.parse(today) - Date.parse(a.purchaseDate)) / (365.25 * 86400000));
    if (a.depMethod === "SLM") {
      const annualDep = (a.cost - a.salvageValue) / a.usefulLifeYears;
      return Math.max(a.salvageValue, Math.round(a.cost - annualDep * Math.min(ageYears, a.usefulLifeYears)));
    }
    const rate = 1 - Math.pow(a.salvageValue / Math.max(1, a.cost), 1 / a.usefulLifeYears);
    return Math.max(a.salvageValue, Math.round(a.cost * Math.pow(1 - rate, Math.min(ageYears, a.usefulLifeYears))));
  }

  function bookValueAt(a: FixedAsset, asOf: string): number {
    const ageYears = Math.max(0, (Date.parse(asOf) - Date.parse(a.purchaseDate)) / (365.25 * 86400000));
    if (a.depMethod === "SLM") {
      const annualDep = (a.cost - a.salvageValue) / a.usefulLifeYears;
      return Math.max(a.salvageValue, Math.round(a.cost - annualDep * Math.min(ageYears, a.usefulLifeYears)));
    }
    const rate = 1 - Math.pow(a.salvageValue / Math.max(1, a.cost), 1 / a.usefulLifeYears);
    return Math.max(a.salvageValue, Math.round(a.cost * Math.pow(1 - rate, Math.min(ageYears, a.usefulLifeYears))));
  }

  function depThisYear(a: FixedAsset): number {
    const yr = Number(today.slice(0, 4));
    const mo = Number(today.slice(5, 7));
    const fyStartYear = mo >= 4 ? yr : yr - 1;
    const fyStart = `${fyStartYear}-04-01`;
    const fyEnd = `${fyStartYear + 1}-03-31`;
    if (a.purchaseDate > fyEnd) return 0;
    if (a.depMethod === "SLM") {
      const annual = (a.cost - a.salvageValue) / a.usefulLifeYears;
      const monthsUsed = Math.max(0, (Date.parse(today) - Math.max(Date.parse(a.purchaseDate), Date.parse(fyStart))) / (30.44 * 86400000));
      return Math.round(Math.min(annual, (annual / 12) * Math.min(12, monthsUsed)));
    }
    const bvAtFyStart = bookValueAt(a, a.purchaseDate > fyStart ? a.purchaseDate : fyStart);
    const bvNow = bookValueAt(a, today);
    return Math.max(0, Math.round(bvAtFyStart - bvNow));
  }

  const totalCost = assets.reduce((s, a) => s + a.cost, 0);
  const totalBv = assets.reduce((s, a) => s + bookValue(a), 0);
  const totalDep = assets.reduce((s, a) => s + (a.cost - bookValue(a)), 0);
  const thisYearDep = assets.reduce((s, a) => s + depThisYear(a), 0);
  const categories = [...new Set(assets.map((a) => a.category))];

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi label="Total cost" value={money(totalCost)} detail={`${assets.length} assets`} />
        <Kpi label="Book value" value={money(totalBv)} detail="Net of depreciation" />
        <Kpi label="Accumulated depreciation" value={money(totalDep)} detail="Since purchase" />
        <Kpi label="Depreciation this FY" value={money(thisYearDep)} detail={`FY ${Number(today.slice(5, 7)) >= 4 ? today.slice(0, 4) : Number(today.slice(0, 4)) - 1}–${Number(today.slice(5, 7)) >= 4 ? Number(today.slice(0, 4)) + 1 : today.slice(0, 4)}`} />
      </div>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Fixed asset register</CardTitle>
          <Button size="sm" onClick={() => setAdding(true)}>Add asset</Button>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[800px] text-sm">
            <thead><tr className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="px-4 py-2">Asset</th><th className="px-4 py-2">Category</th><th className="px-4 py-2">Purchased</th><th className="px-4 py-2 text-right">Cost</th><th className="px-4 py-2">Method</th><th className="px-4 py-2 text-right">Book value</th><th className="px-4 py-2 text-right">Depreciation</th><th className="px-4 py-2 text-right">Life left</th></tr></thead>
            <tbody>
              {assets.map((a) => {
                const bv = bookValue(a);
                const ageYears = (Date.parse(today) - Date.parse(a.purchaseDate)) / (365.25 * 86400000);
                const lifeLeft = Math.max(0, a.usefulLifeYears - ageYears);
                return <tr key={a.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3"><p className="font-medium">{a.name}</p>{a.notes && <p className="text-xs text-muted-foreground">{a.notes}</p>}</td>
                  <td className="px-4 py-3">{a.category}</td>
                  <td className="px-4 py-3 text-muted-foreground">{a.purchaseDate}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(a.cost)}</td>
                  <td className="px-4 py-3"><Badge variant="neutral">{a.depMethod}</Badge></td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">{money(bv)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{money(a.cost - bv)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{lifeLeft < 1 ? <Badge variant="warning">Fully depreciated</Badge> : `${lifeLeft.toFixed(1)} yrs`}</td>
                </tr>;
              })}
            </tbody>
            <tfoot><tr className="border-t border-border bg-surface-2 text-sm font-semibold"><td className="px-4 py-2" colSpan={3}>Total</td><td className="px-4 py-2 text-right tabular-nums">{money(totalCost)}</td><td /><td className="px-4 py-2 text-right tabular-nums">{money(totalBv)}</td><td className="px-4 py-2 text-right tabular-nums">{money(totalDep)}</td><td /></tr></tfoot>
          </table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Depreciation by category</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((cat) => {
            const inCat = assets.filter((a) => a.category === cat);
            const catCost = inCat.reduce((s, a) => s + a.cost, 0);
            const catBv = inCat.reduce((s, a) => s + bookValue(a), 0);
            const pct = catCost > 0 ? Math.round(((catCost - catBv) / catCost) * 100) : 0;
            return <div key={cat} className="border border-border p-4">
              <p className="text-sm font-medium">{cat}</p>
              <p className="mt-1 text-xs text-muted-foreground">{inCat.length} asset{inCat.length !== 1 ? "s" : ""}</p>
              <div className="mt-2 flex justify-between text-sm tabular-nums"><span>Cost: {money(catCost)}</span><span>Book: {money(catBv)}</span></div>
              <div className="mt-2 h-1.5 bg-surface-2"><div className="h-1.5 bg-accent" style={{ width: `${pct}%` }} /></div>
              <p className="mt-1 text-xs text-muted-foreground">{pct}% depreciated</p>
            </div>;
          })}
        </CardContent>
      </Card>
      {adding && <FixedAssetDialog onClose={() => setAdding(false)} onAdd={(a) => { setAssets((prev) => [a, ...prev]); toast.success(`${a.name} added to register`); setAdding(false); }} />}
      <Card><CardContent className="p-4 text-sm text-muted-foreground"><p>Depreciation is calculated from the purchase date. SLM (Straight Line) spreads the cost evenly; WDV (Written Down Value) charges more in earlier years, as allowed under the Income Tax Act. Salvage value is the estimated residual at the end of the asset&apos;s useful life. IT assets (laptops, monitors) are tracked in the IT workspace.</p></CardContent></Card>
    </>
  );
}

function FixedAssetDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (a: { id: string; name: string; category: string; purchaseDate: string; cost: number; usefulLifeYears: number; depMethod: "SLM" | "WDV"; salvageValue: number; notes: string }) => void }) {
  const [name, setName] = React.useState("");
  const [category, setCategory] = React.useState("Furniture & fittings");
  const [purchaseDate, setPurchaseDate] = React.useState(todayIso());
  const [cost, setCost] = React.useState("");
  const [life, setLife] = React.useState("10");
  const [method, setMethod] = React.useState<"SLM" | "WDV">("SLM");
  const [salvage, setSalvage] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const categories = ["Furniture & fittings", "Plant & machinery", "Vehicles", "Building", "Computers & IT", "Intangible assets", "Office equipment"];
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add fixed asset</DialogTitle><DialogDescription>Register a capital asset in the fixed asset register.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2"><Label htmlFor="fa-name">Asset name</Label><Input id="fa-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Office furniture" /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="fa-cat">Category</Label><select id="fa-cat" className={selectClass} value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="fa-date">Purchase date</Label><Input id="fa-date" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="fa-cost">Cost (₹)</Label><Input id="fa-cost" type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="fa-life">Useful life (years)</Label><Input id="fa-life" type="number" min={1} max={30} value={life} onChange={(e) => setLife(e.target.value)} /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="fa-method">Depreciation method</Label><select id="fa-method" className={selectClass} value={method} onChange={(e) => setMethod(e.target.value as "SLM" | "WDV")}><option value="SLM">SLM (Straight Line)</option><option value="WDV">WDV (Written Down Value)</option></select></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="fa-salvage">Salvage value (₹)</Label><Input id="fa-salvage" type="number" min={0} value={salvage} onChange={(e) => setSalvage(e.target.value)} placeholder="0" /></div>
          <div className="flex flex-col gap-1.5 sm:col-span-2"><Label htmlFor="fa-notes">Notes</Label><Input id="fa-notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={name.trim().length < 2 || !(Number(cost) > 0)} onClick={() => onAdd({ id: `fa-${crypto.randomUUID().slice(0, 8)}`, name: name.trim(), category, purchaseDate, cost: Number(cost), usefulLifeYears: Number(life) || 10, depMethod: method, salvageValue: Number(salvage) || 0, notes: notes.trim() })}>Add asset</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Debit notes: adjustments to vendor bills (counterpart of customer credit notes). */
function DebitNotesView({ me }: { me: string }) {
  const bills = useFinanceStore((state) => state.bills);
  type DebitNoteStatus = "pending" | "approved" | "rejected";
  interface DebitNote { id: string; number: string; billId: string; amount: number; reason: string; date: string; status: DebitNoteStatus; raisedBy: string; approvedBy: string | null }
  const [notes, setNotes] = React.useState<DebitNote[]>([
    { id: "dn-1", number: "DN-001", billId: bills[0]?.id ?? "", amount: 15000, reason: "Short delivery — 3 cartons missing from consignment", date: "2026-11-05", status: "approved", raisedBy: me, approvedBy: "Finance Manager" },
    { id: "dn-2", number: "DN-002", billId: bills[1]?.id ?? "", amount: 8500, reason: "Damaged goods — defective material returned", date: "2026-11-12", status: "pending", raisedBy: me, approvedBy: null },
  ]);
  const [billId, setBillId] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");

  function create() {
    if (!billId || !(Number(amount) > 0) || reason.trim().length < 3) return;
    const num = `DN-${String(notes.length + 1).padStart(3, "0")}`;
    setNotes((prev) => [...prev, { id: `dn-${crypto.randomUUID().slice(0, 8)}`, number: num, billId, amount: Number(amount), reason: reason.trim(), date: todayIso(), status: "pending", raisedBy: me, approvedBy: null }]);
    toast.success(`Debit note ${num} raised`);
    setBillId(""); setAmount(""); setReason("");
  }
  function approve(id: string) {
    setNotes((prev) => prev.map((n) => n.id === id ? { ...n, status: "approved" as DebitNoteStatus, approvedBy: me } : n));
    toast.success("Debit note approved");
  }

  const totalPending = notes.filter((n) => n.status === "pending").reduce((s, n) => s + n.amount, 0);
  const totalApproved = notes.filter((n) => n.status === "approved").reduce((s, n) => s + n.amount, 0);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Total debit notes" value={String(notes.length)} detail={`${notes.filter((n) => n.status === "pending").length} pending`} />
        <Kpi label="Pending amount" value={money(totalPending)} detail="Awaiting approval" tone={totalPending > 0 ? "warning" : undefined} />
        <Kpi label="Approved amount" value={money(totalApproved)} detail="Adjusted against vendors" />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Raise a debit note</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-xs text-muted-foreground">A debit note is raised against a vendor bill when goods are short, defective or the bill amount is wrong. The vendor then owes the company the debit note amount. It needs approval from someone else before it adjusts the payable.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5"><Label htmlFor="dn-bill">Against bill</Label><select id="dn-bill" className={selectClass} value={billId} onChange={(e) => setBillId(e.target.value)}><option value="">Choose…</option>{bills.map((b) => <option key={b.id} value={b.id}>{b.number} · {b.vendor}</option>)}</select></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="dn-amount">Amount (₹)</Label><Input id="dn-amount" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="dn-reason">Reason</Label><Input id="dn-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Short delivery" /></div>
          </div>
          <Button className="w-fit" disabled={!billId || !(Number(amount) > 0) || reason.trim().length < 3} onClick={create}>Raise debit note</Button>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="px-4 py-2">Debit note</th><th className="px-4 py-2">Against bill</th><th className="px-4 py-2">Reason</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2">Date</th><th className="px-4 py-2">Status</th><th className="px-4 py-2" /></tr></thead>
            <tbody>
              {notes.length === 0 ? <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">No debit notes yet.</td></tr> : null}
              {notes.map((n) => {
                const bill = bills.find((b) => b.id === n.billId);
                return <tr key={n.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">{n.number}</td>
                  <td className="px-4 py-3">{bill ? `${bill.number} · ${bill.vendor}` : "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{n.reason}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(n.amount)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{n.date}</td>
                  <td className="px-4 py-3"><Badge variant={n.status === "approved" ? "success" : n.status === "rejected" ? "danger" : "warning"}>{n.status}</Badge>{n.approvedBy ? <span className="block text-xs text-muted-foreground">by {n.approvedBy}</span> : null}</td>
                  <td className="px-4 py-3">{n.status === "pending" && n.raisedBy !== me ? <Button size="sm" variant="secondary" onClick={() => approve(n.id)}>Approve</Button> : n.status === "pending" ? <span className="text-xs text-muted-foreground">Raised by you</span> : null}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}

/** Trial balance: all account heads with their debit and credit totals. The difference must be zero when the books are balanced. */
function TrialBalanceView() {
  const invoices = useFinanceStore((state) => state.invoices);
  const creditNotes = useFinanceStore((state) => state.creditNotes);
  const bills = useFinanceStore((state) => state.bills);
  const expenses = useFinanceStore((state) => state.expenses);
  const bankEntries = useFinanceStore((state) => state.bankEntries);
  const openingCash = useFinanceStore((state) => state.openingCash);
  const topUps = useFinanceStore((state) => state.pettyCashTopUps);
  const payrollRuns = useHrPeopleStore((state) => state.payrollRuns);
  const shareCapital = useFinanceStore((state) => state.shareCapital);
  const items = useOperationsStore((state) => state.items);
  const movements = useOperationsStore((state) => state.movements);

  const pnl = profitAndLoss(invoices, creditNotes, bills, expenses);
  const live = invoices.filter((i) => !i.cancelled);
  const receivable = live.reduce((s, i) => s + dueAmount(i, creditNotes), 0);
  const payable = bills.reduce((s, b) => s + Math.max(0, b.amount - (b.tds ?? 0) - b.payments.reduce((ps, p) => ps + p.amount, 0)), 0);
  const flow = cashFlowByMonth(invoices, bills, bankEntries, openingCash, expenses, topUps);
  const cash = flow.length > 0 ? flow[flow.length - 1].closing : openingCash;
  const stock = items.reduce((s, item) => s + stockOn(movements, item.id) * item.rate, 0);
  const lockedPayroll = payrollRuns.filter((r) => r.status === "locked").reduce((s, r) => s + r.net, 0);
  const tdsPayable = bills.reduce((s, b) => s + (b.tds ?? 0), 0);
  const gstCollected = live.reduce((s, i) => { const t = invoiceTotals(i); return s + t.cgst + t.sgst + t.igst; }, 0);
  const gstPaid = bills.reduce((s, b) => s + (b.gst ?? 0), 0) + expenses.reduce((s, e) => s + e.amount * (e.gstRate / 100), 0);
  const reserves = pnl.profit - lockedPayroll;

  type TbEntry = { account: string; group: string; debit: number; credit: number };
  const entries: TbEntry[] = [
    { account: "Cash & bank", group: "Assets", debit: Math.max(0, cash), credit: Math.max(0, -cash) },
    { account: "Trade receivables", group: "Assets", debit: receivable, credit: 0 },
    { account: "Inventory", group: "Assets", debit: stock, credit: 0 },
    { account: "Trade payables", group: "Liabilities", debit: 0, credit: payable },
    { account: "TDS payable", group: "Liabilities", debit: 0, credit: tdsPayable },
    { account: "GST payable (output − input)", group: "Liabilities", debit: gstPaid, credit: gstCollected },
    { account: "Share capital", group: "Equity", debit: 0, credit: shareCapital },
    { account: "Reserves & surplus", group: "Equity", debit: reserves < 0 ? Math.abs(reserves) : 0, credit: reserves > 0 ? reserves : 0 },
    { account: "Sales revenue", group: "Income", debit: 0, credit: pnl.netSales },
    { account: "Cost of goods (bills)", group: "Expenses", debit: pnl.billCosts, credit: 0 },
    { account: "Operating expenses", group: "Expenses", debit: pnl.expenseCosts, credit: 0 },
    { account: "Payroll costs", group: "Expenses", debit: lockedPayroll, credit: 0 },
    { account: "Bad debt written off", group: "Expenses", debit: pnl.writeOffs, credit: 0 },
  ].filter((e) => e.debit > 0 || e.credit > 0);

  const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0);
  const difference = Math.round((totalDebit - totalCredit) * 100) / 100;

  const groups = ["Assets", "Liabilities", "Equity", "Income", "Expenses"];

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Total debit" value={money(totalDebit)} detail={`${entries.filter((e) => e.debit > 0).length} accounts`} />
        <Kpi label="Total credit" value={money(totalCredit)} detail={`${entries.filter((e) => e.credit > 0).length} accounts`} />
        <Kpi label="Difference" value={money(Math.abs(difference))} detail={difference === 0 ? "Books balanced" : "Needs reconciliation"} tone={difference !== 0 ? "warning" : undefined} />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Trial balance as at {todayIso()}</CardTitle><p className="text-xs text-muted-foreground">A trial balance lists every account head with its debit or credit total. When the books are correct, total debits equal total credits. A difference means entries are missing.</p></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[500px] text-sm">
            <thead><tr className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="px-4 py-2">Account</th><th className="px-4 py-2">Group</th><th className="px-4 py-2 text-right">Debit</th><th className="px-4 py-2 text-right">Credit</th></tr></thead>
            <tbody>
              {groups.map((group) => {
                const inGroup = entries.filter((e) => e.group === group);
                if (inGroup.length === 0) return null;
                return <React.Fragment key={group}>
                  <tr className="bg-surface-2"><td colSpan={4} className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group}</td></tr>
                  {inGroup.map((e) => <tr key={e.account} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 pl-8 font-medium">{e.account}</td>
                    <td className="px-4 py-2 text-muted-foreground">{e.group}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{e.debit > 0 ? money(e.debit) : ""}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{e.credit > 0 ? money(e.credit) : ""}</td>
                  </tr>)}
                </React.Fragment>;
              })}
            </tbody>
            <tfoot><tr className="border-t-2 border-border bg-surface-2 text-sm font-semibold"><td className="px-4 py-2" colSpan={2}>Total</td><td className="px-4 py-2 text-right tabular-nums">{money(totalDebit)}</td><td className="px-4 py-2 text-right tabular-nums">{money(totalCredit)}</td></tr>
            {difference !== 0 ? <tr className="bg-warning/10"><td className="px-4 py-2 font-medium text-warning" colSpan={2}>Difference to reconcile</td><td className="px-4 py-2 text-right tabular-nums text-warning" colSpan={2}>{money(Math.abs(difference))}</td></tr> : null}
            </tfoot>
          </table>
        </CardContent>
      </Card>
    </>
  );
}

/** Journal entries: manual double-entry bookkeeping adjustments — provisions, year-end, corrections, opening balances. */
function JournalEntriesView({ me }: { me: string }) {
  interface JournalLine { account: string; debit: number; credit: number }
  interface JournalEntry { id: string; number: string; date: string; narration: string; lines: JournalLine[]; createdBy: string; reversed: boolean }
  const [entries, setEntries] = React.useState<JournalEntry[]>([
    { id: "je-1", number: "JV-001", date: "2026-04-01", narration: "Opening balance — sundry debtors from previous year", lines: [{ account: "Trade receivables", debit: 125000, credit: 0 }, { account: "Reserves & surplus", debit: 0, credit: 125000 }], createdBy: me, reversed: false },
    { id: "je-2", number: "JV-002", date: "2026-11-10", narration: "Provision for doubtful debts — 2% of receivables", lines: [{ account: "Bad debt expense", debit: 4500, credit: 0 }, { account: "Provision for doubtful debts", debit: 0, credit: 4500 }], createdBy: me, reversed: false },
    { id: "je-3", number: "JV-003", date: "2026-11-15", narration: "Prepaid insurance — annual premium apportioned", lines: [{ account: "Insurance expense", debit: 12000, credit: 0 }, { account: "Prepaid insurance", debit: 0, credit: 12000 }], createdBy: me, reversed: false },
  ]);
  const [adding, setAdding] = React.useState(false);
  const [date, setDate] = React.useState(todayIso());
  const [narration, setNarration] = React.useState("");
  const [lines, setLines] = React.useState<JournalLine[]>([{ account: "", debit: 0, credit: 0 }, { account: "", debit: 0, credit: 0 }]);
  const accounts = ["Cash & bank", "Trade receivables", "Trade payables", "Inventory", "Share capital", "Reserves & surplus", "Sales revenue", "Cost of goods sold", "Operating expenses", "Payroll costs", "Bad debt expense", "Provision for doubtful debts", "Prepaid insurance", "Insurance expense", "Depreciation expense", "Accumulated depreciation", "Loan payable", "Interest expense", "TDS payable", "GST payable", "Advance from customers", "Security deposit"];
  const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  function create() {
    if (!balanced || narration.trim().length < 3) return;
    const num = `JV-${String(entries.length + 1).padStart(3, "0")}`;
    setEntries((prev) => [{ id: `je-${crypto.randomUUID().slice(0, 8)}`, number: num, date, narration: narration.trim(), lines: lines.filter((l) => l.account && (l.debit > 0 || l.credit > 0)), createdBy: me, reversed: false }, ...prev]);
    toast.success(`Journal entry ${num} posted`);
    setAdding(false); setNarration(""); setLines([{ account: "", debit: 0, credit: 0 }, { account: "", debit: 0, credit: 0 }]);
  }

  function reverse(id: string) {
    const original = entries.find((e) => e.id === id);
    if (!original || original.reversed) return;
    const num = `JV-${String(entries.length + 1).padStart(3, "0")}`;
    const reversedLines = original.lines.map((l) => ({ account: l.account, debit: l.credit, credit: l.debit }));
    setEntries((prev) => [{ id: `je-${crypto.randomUUID().slice(0, 8)}`, number: num, date: todayIso(), narration: `Reversal of ${original.number}: ${original.narration}`, lines: reversedLines, createdBy: me, reversed: false }, ...prev.map((e) => e.id === id ? { ...e, reversed: true } : e)]);
    toast.success(`${original.number} reversed as ${num}`);
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Journal entries" value={String(entries.length)} detail={`${entries.filter((e) => !e.reversed).length} active`} />
        <Kpi label="Total debits posted" value={money(entries.filter((e) => !e.reversed).reduce((s, e) => s + e.lines.reduce((ls, l) => ls + l.debit, 0), 0))} detail="Active entries" />
        <Kpi label="Reversed" value={String(entries.filter((e) => e.reversed).length)} detail="Cancelled entries" />
      </div>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Journal vouchers</CardTitle>
          <Button size="sm" onClick={() => setAdding(true)}>New journal entry</Button>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[700px] text-sm">
            <thead><tr className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="px-4 py-2">No.</th><th className="px-4 py-2">Date</th><th className="px-4 py-2">Narration</th><th className="px-4 py-2">Accounts</th><th className="px-4 py-2 text-right">Debit</th><th className="px-4 py-2 text-right">Credit</th><th className="px-4 py-2" /></tr></thead>
            <tbody>
              {entries.length === 0 ? <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">No journal entries yet.</td></tr> : null}
              {entries.map((e) => {
                const dr = e.lines.reduce((s, l) => s + l.debit, 0);
                return <tr key={e.id} className={`border-b border-border last:border-0 ${e.reversed ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3 font-medium">{e.number}</td>
                  <td className="px-4 py-3 text-muted-foreground">{e.date}</td>
                  <td className="px-4 py-3">{e.narration}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{e.lines.map((l) => `${l.account} (${l.debit ? "Dr" : "Cr"})`).join(", ")}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(dr)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(dr)}</td>
                  <td className="px-4 py-3">{e.reversed ? <Badge variant="neutral">Reversed</Badge> : <Button size="sm" variant="ghost" onClick={() => reverse(e.id)}>Reverse</Button>}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {adding && (
        <Dialog open onOpenChange={(open) => !open && setAdding(false)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>New journal entry</DialogTitle><DialogDescription>Every entry must balance: total debits must equal total credits. Each line debits or credits one account.</DialogDescription></DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5"><Label htmlFor="je-date">Date</Label><Input id="je-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div className="flex flex-col gap-1.5 sm:col-span-2"><Label htmlFor="je-narration">Narration</Label><Input id="je-narration" value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="e.g. Provision for doubtful debts" /></div>
            </div>
            {lines.map((line, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
                <select aria-label={`Account ${i + 1}`} className={selectClass} value={line.account} onChange={(e) => setLines((prev) => prev.map((l, j) => j === i ? { ...l, account: e.target.value } : l))}><option value="">Account…</option>{accounts.map((a) => <option key={a}>{a}</option>)}</select>
                <Input aria-label={`Debit ${i + 1}`} type="number" min={0} placeholder="Debit ₹" value={line.debit || ""} onChange={(e) => setLines((prev) => prev.map((l, j) => j === i ? { ...l, debit: Number(e.target.value) || 0, credit: Number(e.target.value) > 0 ? 0 : l.credit } : l))} />
                <Input aria-label={`Credit ${i + 1}`} type="number" min={0} placeholder="Credit ₹" value={line.credit || ""} onChange={(e) => setLines((prev) => prev.map((l, j) => j === i ? { ...l, credit: Number(e.target.value) || 0, debit: Number(e.target.value) > 0 ? 0 : l.debit } : l))} />
                <Button variant="ghost" size="sm" disabled={lines.length <= 2} onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}>Remove</Button>
              </div>
            ))}
            <div className="flex items-center gap-3">
              <Button variant="secondary" size="sm" onClick={() => setLines((prev) => [...prev, { account: "", debit: 0, credit: 0 }])}>Add line</Button>
              <span className={`text-sm tabular-nums ${balanced ? "text-success" : "text-warning"}`}>Dr {money(totalDebit)} · Cr {money(totalCredit)} {balanced ? "— balanced" : "— not balanced"}</span>
            </div>
            <DialogFooter><Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button><Button disabled={!balanced || narration.trim().length < 3} onClick={create}>Post entry</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      <Card><CardContent className="p-4 text-sm text-muted-foreground"><p>Journal entries record adjustments that do not arise from invoices, bills or payments: opening balances, provisions, year-end entries, corrections and inter-account transfers. Each entry must balance (total debits = total credits). Reversed entries cancel the original by swapping debits and credits.</p></CardContent></Card>
    </>
  );
}

/** Financial ratios: key indicators a CFO monitors — liquidity, efficiency, profitability and leverage. */
function FinancialRatiosView() {
  const invoices = useFinanceStore((state) => state.invoices);
  const creditNotes = useFinanceStore((state) => state.creditNotes);
  const bills = useFinanceStore((state) => state.bills);
  const expenses = useFinanceStore((state) => state.expenses);
  const bankEntries = useFinanceStore((state) => state.bankEntries);
  const openingCash = useFinanceStore((state) => state.openingCash);
  const topUps = useFinanceStore((state) => state.pettyCashTopUps);
  const shareCapital = useFinanceStore((state) => state.shareCapital);
  const items = useOperationsStore((state) => state.items);
  const movements = useOperationsStore((state) => state.movements);
  const payrollRuns = useHrPeopleStore((state) => state.payrollRuns);

  const pnl = profitAndLoss(invoices, creditNotes, bills, expenses);
  const live = invoices.filter((i) => !i.cancelled);
  const receivable = live.reduce((s, i) => s + dueAmount(i, creditNotes), 0);
  const payable = bills.reduce((s, b) => s + Math.max(0, b.amount - (b.tds ?? 0) - b.payments.reduce((ps, p) => ps + p.amount, 0)), 0);
  const flow = cashFlowByMonth(invoices, bills, bankEntries, openingCash, expenses, topUps);
  const cash = flow.length > 0 ? flow[flow.length - 1].closing : openingCash;
  const stock = items.reduce((s, item) => s + stockOn(movements, item.id) * item.rate, 0);
  const lockedPayroll = payrollRuns.filter((r) => r.status === "locked").reduce((s, r) => s + r.net, 0);
  const reserves = pnl.profit - lockedPayroll;
  const equity = shareCapital + reserves;

  const currentAssets = cash + receivable + stock;
  const currentLiabilities = payable;
  const currentRatio = currentLiabilities > 0 ? currentAssets / currentLiabilities : null;
  const quickRatio = currentLiabilities > 0 ? (cash + receivable) / currentLiabilities : null;
  const workingCapital = currentAssets - currentLiabilities;

  const dailySales = pnl.netSales > 0 ? pnl.netSales / 365 : 0;
  const dailyCogs = pnl.billCosts > 0 ? pnl.billCosts / 365 : 0;
  const dso = dailySales > 0 ? Math.round(receivable / dailySales) : null;
  const dpo = dailyCogs > 0 ? Math.round(payable / dailyCogs) : null;
  const ccc = dso !== null && dpo !== null ? dso - dpo : null;

  const grossMargin = pnl.netSales > 0 ? Math.round(((pnl.netSales - pnl.billCosts) / pnl.netSales) * 1000) / 10 : null;
  const netMargin = pnl.netSales > 0 ? Math.round(((pnl.profit - lockedPayroll) / pnl.netSales) * 1000) / 10 : null;
  const roe = equity > 0 ? Math.round(((pnl.profit - lockedPayroll) / equity) * 1000) / 10 : null;
  const debtToEquity = equity > 0 ? Math.round((payable / equity) * 100) / 100 : null;

  const fmt = (v: number | null, suffix = "") => v === null ? "—" : `${v}${suffix}`;
  type RatioCard = { label: string; value: string; detail: string; tone?: "warning" | "danger" };

  const ratios: { group: string; items: RatioCard[] }[] = [
    { group: "Liquidity", items: [
      { label: "Current ratio", value: fmt(currentRatio ? Math.round(currentRatio * 100) / 100 : null, "x"), detail: "Current assets / current liabilities. Above 1.5x is healthy.", tone: currentRatio !== null && currentRatio < 1 ? "danger" : currentRatio !== null && currentRatio < 1.5 ? "warning" : undefined },
      { label: "Quick ratio", value: fmt(quickRatio ? Math.round(quickRatio * 100) / 100 : null, "x"), detail: "(Cash + receivables) / current liabilities. Above 1x means bills can be paid without selling stock.", tone: quickRatio !== null && quickRatio < 1 ? "warning" : undefined },
      { label: "Working capital", value: workingCapital >= 0 ? money(workingCapital) : `-${money(Math.abs(workingCapital))}`, detail: "Current assets minus current liabilities.", tone: workingCapital < 0 ? "danger" : undefined },
    ]},
    { group: "Efficiency", items: [
      { label: "DSO (days sales outstanding)", value: fmt(dso, " days"), detail: "Average days to collect from customers. Lower is better.", tone: dso !== null && dso > 60 ? "warning" : undefined },
      { label: "DPO (days payable outstanding)", value: fmt(dpo, " days"), detail: "Average days to pay vendors. Higher preserves cash but mind relationships." },
      { label: "Cash conversion cycle", value: fmt(ccc, " days"), detail: "DSO − DPO. Days between paying vendors and collecting from customers. Negative means you collect before you pay.", tone: ccc !== null && ccc > 90 ? "warning" : undefined },
    ]},
    { group: "Profitability", items: [
      { label: "Gross margin", value: fmt(grossMargin, "%"), detail: "(Net sales − cost of goods) / net sales." },
      { label: "Net margin", value: fmt(netMargin, "%"), detail: "Net profit / net sales, after all costs including payroll.", tone: netMargin !== null && netMargin < 0 ? "danger" : undefined },
      { label: "Return on equity", value: fmt(roe, "%"), detail: "Net profit / equity. The return the company earns on shareholder funds." },
    ]},
    { group: "Leverage", items: [
      { label: "Debt-to-equity", value: fmt(debtToEquity, "x"), detail: "Payables / equity. Below 1x means the company is funded more by equity than debt.", tone: debtToEquity !== null && debtToEquity > 2 ? "warning" : undefined },
    ]},
  ];

  return (
    <>
      {ratios.map((group) => (
        <Card key={group.group}>
          <CardHeader><CardTitle className="text-base">{group.group}</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            {group.items.map((r) => (
              <div key={r.label} className="border border-border p-4">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{r.label}</p>
                <p className={`mt-1 text-xl font-semibold tabular-nums ${r.tone === "danger" ? "text-danger" : r.tone === "warning" ? "text-warning" : ""}`}>{r.value}</p>
                <p className="mt-2 text-xs text-muted-foreground">{r.detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
      <Card><CardContent className="p-4 text-sm text-muted-foreground"><p>Ratios are computed from the records in this workspace. DSO and DPO use a 365-day year. Working capital is current assets (cash + receivables + stock) minus current liabilities (payables). Confirm these figures with the company&apos;s accountant.</p></CardContent></Card>
    </>
  );
}

/** Party ledger: all transactions with one customer or vendor in one place — Tally-style. */
function PartyLedgerView() {
  const invoices = useFinanceStore((state) => state.invoices);
  const creditNotes = useFinanceStore((state) => state.creditNotes);
  const bills = useFinanceStore((state) => state.bills);
  const [partyType, setPartyType] = React.useState<"customer" | "vendor">("customer");
  const [party, setParty] = React.useState("");

  const customerNames = [...new Set(invoices.map((i) => i.customerCompany || i.customer))].sort();
  const vendorNames = [...new Set(bills.map((b) => b.vendor))].sort();
  const parties = partyType === "customer" ? customerNames : vendorNames;

  type LedgerRow = { date: string; type: string; ref: string; debit: number; credit: number; balance: number };

  const rows: LedgerRow[] = React.useMemo(() => {
    if (!party) return [];
    const lines: Omit<LedgerRow, "balance">[] = [];
    if (partyType === "customer") {
      const partyInvoices = invoices.filter((i) => (i.customerCompany || i.customer) === party && !i.cancelled);
      for (const inv of partyInvoices) {
        lines.push({ date: inv.date, type: "Invoice", ref: inv.number, debit: invoiceTotals(inv).total, credit: 0 });
        for (const p of inv.payments) lines.push({ date: p.date, type: `Payment (${p.method})`, ref: p.reference, debit: 0, credit: p.amount });
      }
      const partyCns = creditNotes.filter((cn) => cn.status === "approved" && partyInvoices.some((i) => i.id === cn.invoiceId));
      for (const cn of partyCns) lines.push({ date: cn.date, type: cn.kind === "write-off" ? "Write-off" : "Credit note", ref: cn.number, debit: 0, credit: cn.amount });
    } else {
      const partyBills = bills.filter((b) => b.vendor === party);
      for (const bill of partyBills) {
        lines.push({ date: bill.date, type: "Bill", ref: `${bill.number} (${bill.vendorBillNo})`, debit: 0, credit: bill.amount - (bill.tds ?? 0) });
        if (bill.tds) lines.push({ date: bill.date, type: `TDS (${bill.tdsSection ?? ""})`, ref: bill.number, debit: bill.tds, credit: 0 });
        for (const p of bill.payments) lines.push({ date: p.date, type: `Payment (${p.method})`, ref: p.reference, debit: p.amount, credit: 0 });
      }
    }
    lines.sort((a, b) => a.date.localeCompare(b.date));
    let balance = 0;
    return lines.map((l) => { balance += l.debit - l.credit; return { ...l, balance }; });
  }, [party, partyType, invoices, creditNotes, bills]);

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const closing = rows.length > 0 ? rows[rows.length - 1].balance : 0;

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Party ledger</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <p className="text-xs text-muted-foreground">Shows every transaction with one customer or vendor in date order, with a running balance. For customers: invoices are debit (they owe more), payments and credit notes are credit (they owe less). For vendors: bills are credit (you owe more), payments are debit (you owe less).</p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5"><Label htmlFor="pl-type">Party type</Label><select id="pl-type" className={selectClass} value={partyType} onChange={(e) => { setPartyType(e.target.value as "customer" | "vendor"); setParty(""); }}><option value="customer">Customer</option><option value="vendor">Vendor</option></select></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="pl-party">{partyType === "customer" ? "Customer" : "Vendor"}</Label><select id="pl-party" className={selectClass} value={party} onChange={(e) => setParty(e.target.value)}><option value="">Choose…</option>{parties.map((p) => <option key={p}>{p}</option>)}</select></div>
          </div>
        </CardContent>
      </Card>
      {party && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi label="Total debit" value={money(totalDebit)} detail={partyType === "customer" ? "Invoiced" : "Paid to vendor"} />
            <Kpi label="Total credit" value={money(totalCredit)} detail={partyType === "customer" ? "Received + credited" : "Bills owed"} />
            <Kpi label="Closing balance" value={closing >= 0 ? money(closing) : `-${money(Math.abs(closing))}`} detail={partyType === "customer" ? (closing > 0 ? "They owe you" : closing < 0 ? "You owe them (overpaid)" : "Settled") : (closing < 0 ? "You owe them" : closing > 0 ? "They owe you (overpaid)" : "Settled")} tone={Math.abs(closing) > 0 ? "warning" : undefined} />
          </div>
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[640px] text-sm">
                <thead><tr className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="px-4 py-2">Date</th><th className="px-4 py-2">Type</th><th className="px-4 py-2">Reference</th><th className="px-4 py-2 text-right">Debit</th><th className="px-4 py-2 text-right">Credit</th><th className="px-4 py-2 text-right">Balance</th></tr></thead>
                <tbody>
                  {rows.length === 0 ? <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No transactions.</td></tr> : null}
                  {rows.map((r, i) => <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 text-muted-foreground">{r.date}</td>
                    <td className="px-4 py-2">{r.type}</td>
                    <td className="px-4 py-2 font-medium">{r.ref}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.debit > 0 ? money(r.debit) : ""}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.credit > 0 ? money(r.credit) : ""}</td>
                    <td className={`px-4 py-2 text-right tabular-nums font-medium ${r.balance < 0 ? "text-danger" : ""}`}>{r.balance < 0 ? `-${money(Math.abs(r.balance))}` : money(r.balance)}</td>
                  </tr>)}
                </tbody>
                {rows.length > 0 ? <tfoot><tr className="border-t border-border bg-surface-2 text-sm font-semibold"><td className="px-4 py-2" colSpan={3}>Total</td><td className="px-4 py-2 text-right tabular-nums">{money(totalDebit)}</td><td className="px-4 py-2 text-right tabular-nums">{money(totalCredit)}</td><td className={`px-4 py-2 text-right tabular-nums ${closing < 0 ? "text-danger" : ""}`}>{closing < 0 ? `-${money(Math.abs(closing))}` : money(closing)}</td></tr></tfoot> : null}
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}

/** Recurring invoices: auto-generated invoices on a schedule for subscription or retainer billing. */
function RecurringInvoicesView({ me }: { me: string }) {
  type Frequency = "monthly" | "quarterly" | "half-yearly" | "yearly";
  interface RecurringInvoice { id: string; customer: string; customerCompany: string; item: string; hsn: string; rate: number; gstRate: number; sameState: boolean; frequency: Frequency; nextDate: string; active: boolean; invoicesRaised: number; createdBy: string }
  const [schedules, setSchedules] = React.useState<RecurringInvoice[]>([
    { id: "ri-1", customer: "Priya Sharma", customerCompany: "TechNova Solutions Pvt Ltd", item: "Monthly SaaS subscription — Enterprise plan", hsn: "998314", rate: 75000, gstRate: 18, sameState: true, frequency: "monthly", nextDate: "2026-12-01", active: true, invoicesRaised: 3, createdBy: me },
    { id: "ri-2", customer: "Vikram Kapoor", customerCompany: "Greenfield Agritech", item: "Quarterly support retainer", hsn: "998313", rate: 125000, gstRate: 18, sameState: false, frequency: "quarterly", nextDate: "2027-01-01", active: true, invoicesRaised: 2, createdBy: me },
    { id: "ri-3", customer: "Anjali Desai", customerCompany: "Meridian Consulting", item: "Annual AMC — hardware maintenance", hsn: "998719", rate: 240000, gstRate: 18, sameState: true, frequency: "yearly", nextDate: "2027-04-01", active: false, invoicesRaised: 1, createdBy: me },
  ]);
  const [adding, setAdding] = React.useState(false);
  const [customer, setCustomer] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [item, setItem] = React.useState("");
  const [hsn, setHsn] = React.useState("");
  const [rate, setRate] = React.useState("");
  const [gstRate, setGstRate] = React.useState("18");
  const [sameState, setSameState] = React.useState(true);
  const [frequency, setFrequency] = React.useState<Frequency>("monthly");
  const [nextDate, setNextDate] = React.useState(todayIso());

  const freqLabel: Record<Frequency, string> = { monthly: "Monthly", quarterly: "Quarterly", "half-yearly": "Half-yearly", yearly: "Yearly" };
  const activeCount = schedules.filter((s) => s.active).length;
  const monthlyValue = schedules.filter((s) => s.active).reduce((sum, s) => {
    const mult = s.frequency === "monthly" ? 1 : s.frequency === "quarterly" ? 1 / 3 : s.frequency === "half-yearly" ? 1 / 6 : 1 / 12;
    return sum + s.rate * mult;
  }, 0);

  function create() {
    if (customer.trim().length < 2 || item.trim().length < 2 || !(Number(rate) > 0) || !/^\d{4,8}$/.test(hsn.trim())) return;
    setSchedules((prev) => [{ id: `ri-${crypto.randomUUID().slice(0, 8)}`, customer: customer.trim(), customerCompany: company.trim(), item: item.trim(), hsn: hsn.trim(), rate: Number(rate), gstRate: Number(gstRate), sameState, frequency, nextDate, active: true, invoicesRaised: 0, createdBy: me }, ...prev]);
    toast.success("Recurring invoice schedule created");
    setAdding(false); setCustomer(""); setCompany(""); setItem(""); setHsn(""); setRate("");
  }

  function toggle(id: string) {
    setSchedules((prev) => prev.map((s) => s.id === id ? { ...s, active: !s.active } : s));
  }

  const addInvoice = useFinanceStore((state) => state.addInvoice);

  function generate(schedule: RecurringInvoice) {
    const dueDate = new Date(Date.parse(schedule.nextDate) + 30 * 86400000).toISOString().slice(0, 10);
    const number = addInvoice({ customer: schedule.customer, customerCompany: schedule.customerCompany, date: schedule.nextDate, dueDate, sameState: schedule.sameState, lines: [{ item: schedule.item, hsn: schedule.hsn, qty: 1, rate: schedule.rate, gstRate: schedule.gstRate }] }, me);
    if (!number) { toast.error("Could not create the invoice."); return; }
    setSchedules((prev) => prev.map((s) => {
      if (s.id !== schedule.id) return s;
      const months = s.frequency === "monthly" ? 1 : s.frequency === "quarterly" ? 3 : s.frequency === "half-yearly" ? 6 : 12;
      const next = new Date(Date.parse(s.nextDate) + months * 30.44 * 86400000).toISOString().slice(0, 10);
      return { ...s, nextDate: next, invoicesRaised: s.invoicesRaised + 1 };
    }));
    toast.success(`Invoice ${number} generated for ${schedule.customerCompany || schedule.customer}`);
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Active schedules" value={String(activeCount)} detail={`${schedules.length} total`} />
        <Kpi label="Monthly recurring value" value={money(Math.round(monthlyValue))} detail="Normalised to monthly" />
        <Kpi label="Invoices generated" value={String(schedules.reduce((s, r) => s + r.invoicesRaised, 0))} detail="From all schedules" />
      </div>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Recurring invoice schedules</CardTitle>
          <Button size="sm" onClick={() => setAdding(true)}>New schedule</Button>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[800px] text-sm">
            <thead><tr className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="px-4 py-2">Customer</th><th className="px-4 py-2">Item</th><th className="px-4 py-2 text-right">Rate (₹)</th><th className="px-4 py-2">GST</th><th className="px-4 py-2">Frequency</th><th className="px-4 py-2">Next invoice</th><th className="px-4 py-2">Raised</th><th className="px-4 py-2">Status</th><th className="px-4 py-2" /></tr></thead>
            <tbody>
              {schedules.length === 0 ? <tr><td colSpan={9} className="px-4 py-6 text-center text-muted-foreground">No recurring invoices set up.</td></tr> : null}
              {schedules.map((s) => <tr key={s.id} className={`border-b border-border last:border-0 ${!s.active ? "opacity-50" : ""}`}>
                <td className="px-4 py-3"><p className="font-medium">{s.customerCompany || s.customer}</p><p className="text-xs text-muted-foreground">{s.customer}</p></td>
                <td className="px-4 py-3">{s.item}<span className="block text-xs text-muted-foreground">HSN {s.hsn}</span></td>
                <td className="px-4 py-3 text-right tabular-nums">{money(s.rate)}</td>
                <td className="px-4 py-3">{s.gstRate}% · {s.sameState ? "CGST+SGST" : "IGST"}</td>
                <td className="px-4 py-3"><Badge variant="neutral">{freqLabel[s.frequency]}</Badge></td>
                <td className="px-4 py-3 text-muted-foreground">{s.nextDate}</td>
                <td className="px-4 py-3 tabular-nums">{s.invoicesRaised}</td>
                <td className="px-4 py-3"><Badge variant={s.active ? "success" : "neutral"}>{s.active ? "Active" : "Paused"}</Badge></td>
                <td className="px-4 py-3"><div className="flex gap-1">{s.active && <Button size="sm" variant="secondary" onClick={() => generate(s)}>Generate now</Button>}<Button size="sm" variant="ghost" onClick={() => toggle(s.id)}>{s.active ? "Pause" : "Resume"}</Button></div></td>
              </tr>)}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {adding && (
        <Dialog open onOpenChange={(open) => !open && setAdding(false)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>New recurring invoice</DialogTitle><DialogDescription>Set up a schedule to auto-generate invoices at a fixed interval. The same item and rate apply each time.</DialogDescription></DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5"><Label htmlFor="ri-customer">Customer</Label><Input id="ri-customer" value={customer} onChange={(e) => setCustomer(e.target.value)} /></div>
              <div className="flex flex-col gap-1.5"><Label htmlFor="ri-company">Company</Label><Input id="ri-company" value={company} onChange={(e) => setCompany(e.target.value)} /></div>
              <div className="flex flex-col gap-1.5 sm:col-span-2"><Label htmlFor="ri-item">Item / description</Label><Input id="ri-item" value={item} onChange={(e) => setItem(e.target.value)} placeholder="e.g. Monthly SaaS subscription" /></div>
              <div className="flex flex-col gap-1.5"><Label htmlFor="ri-hsn">HSN / SAC code</Label><Input id="ri-hsn" value={hsn} onChange={(e) => setHsn(e.target.value)} placeholder="e.g. 998314" /></div>
              <div className="flex flex-col gap-1.5"><Label htmlFor="ri-rate">Rate per period (₹)</Label><Input id="ri-rate" type="number" min={0} value={rate} onChange={(e) => setRate(e.target.value)} /></div>
              <div className="flex flex-col gap-1.5"><Label htmlFor="ri-gst">GST rate</Label><select id="ri-gst" className={selectClass} value={gstRate} onChange={(e) => setGstRate(e.target.value)}>{GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}</select></div>
              <div className="flex flex-col gap-1.5"><Label htmlFor="ri-state">Supply</Label><select id="ri-state" className={selectClass} value={sameState ? "same" : "other"} onChange={(e) => setSameState(e.target.value === "same")}><option value="same">Same state</option><option value="other">Other state</option></select></div>
              <div className="flex flex-col gap-1.5"><Label htmlFor="ri-freq">Frequency</Label><select id="ri-freq" className={selectClass} value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>{(Object.keys(freqLabel) as Frequency[]).map((f) => <option key={f} value={f}>{freqLabel[f]}</option>)}</select></div>
              <div className="flex flex-col gap-1.5"><Label htmlFor="ri-next">First invoice date</Label><Input id="ri-next" type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} /></div>
            </div>
            <DialogFooter><Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button><Button disabled={customer.trim().length < 2 || item.trim().length < 2 || !(Number(rate) > 0) || !/^\d{4,8}$/.test(hsn.trim())} onClick={create}>Create schedule</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      <Card><CardContent className="p-4 text-sm text-muted-foreground"><p>Recurring invoices auto-generate a tax invoice at the set frequency. Click &quot;Generate now&quot; to create the invoice for the current period. The schedule advances to the next date after each generation. Pause a schedule to skip future invoices without deleting the setup.</p></CardContent></Card>
    </>
  );
}

function PaymentRemindersView() {
  const invoices = useFinanceStore((state) => state.invoices);
  const creditNotes = useFinanceStore((state) => state.creditNotes);
  const live = invoices.filter((i) => !i.cancelled);
  const today = todayIso();

  type Reminder = { invoiceId: string; sentAt: string; method: "email" | "phone" | "whatsapp"; note: string };
  const [reminders, setReminders] = React.useState<Reminder[]>([
    { invoiceId: live.find((i) => invoiceStatus(i, creditNotes) === "overdue")?.id ?? "", sentAt: "2026-11-10", method: "email", note: "First reminder — payment overdue by 15 days" },
    { invoiceId: live.find((i) => invoiceStatus(i, creditNotes) === "overdue")?.id ?? "", sentAt: "2026-11-15", method: "phone", note: "Called accounts team, promised payment by Friday" },
  ]);
  type Show = "all" | "overdue" | "due-soon";
  const [show, setShow] = React.useState<Show>("overdue");
  const [recording, setRecording] = React.useState<string | null>(null);
  const [method, setMethod] = React.useState<"email" | "phone" | "whatsapp">("email");
  const [note, setNote] = React.useState("");

  const daysUntilDue = (inv: Invoice) => Math.round((Date.parse(inv.dueDate) - Date.parse(today)) / 86400000);

  const rows = live
    .filter((i) => dueAmount(i, creditNotes) > 0.5)
    .map((i) => ({ invoice: i, due: dueAmount(i, creditNotes), days: daysUntilDue(i), status: invoiceStatus(i, creditNotes), reminders: reminders.filter((r) => r.invoiceId === i.id) }))
    .filter((r) => show === "all" || (show === "overdue" && r.days < 0) || (show === "due-soon" && r.days >= 0 && r.days <= 7))
    .sort((a, b) => a.days - b.days);

  const overdueCount = live.filter((i) => invoiceStatus(i, creditNotes) === "overdue" && dueAmount(i, creditNotes) > 0.5).length;
  const overdueTotal = live.filter((i) => invoiceStatus(i, creditNotes) === "overdue").reduce((s, i) => s + dueAmount(i, creditNotes), 0);
  const dueSoon = live.filter((i) => { const d = daysUntilDue(i); return d >= 0 && d <= 7 && dueAmount(i, creditNotes) > 0.5; });
  const dueSoonTotal = dueSoon.reduce((s, i) => s + dueAmount(i, creditNotes), 0);

  function recordReminder(invoiceId: string) {
    if (note.trim().length < 3) return;
    setReminders((prev) => [...prev, { invoiceId, sentAt: today, method, note: note.trim() }]);
    toast.success("Follow-up recorded");
    setRecording(null); setNote("");
  }

  const urgency = (days: number) => days < -30 ? "danger" as const : days < -7 ? "warning" as const : days < 0 ? "accent" as const : "neutral" as const;
  const urgencyLabel = (days: number) => days < -30 ? "Critical" : days < -7 ? "Overdue" : days < 0 ? "Just overdue" : days === 0 ? "Due today" : `Due in ${days}d`;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Overdue invoices" value={String(overdueCount)} detail={money(overdueTotal)} tone={overdueCount > 0 ? "warning" : undefined} />
        <Kpi label="Due within 7 days" value={String(dueSoon.length)} detail={money(dueSoonTotal)} />
        <Kpi label="Follow-ups recorded" value={String(reminders.length)} detail="Total reminders sent" />
      </div>
      <FilterChips<Show> label="Show" value={show} onChange={setShow} options={[{ value: "overdue", label: "Overdue", count: overdueCount }, { value: "due-soon", label: "Due soon", count: dueSoon.length }, { value: "all", label: "All unpaid" }]} />
      <Card>
        <CardHeader><CardTitle className="text-base">Collection follow-up</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[800px] text-sm">
            <thead><tr className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="px-4 py-2">Invoice</th><th className="px-4 py-2">Customer</th><th className="px-4 py-2">Due date</th><th className="px-4 py-2 text-right">Amount due</th><th className="px-4 py-2">Urgency</th><th className="px-4 py-2">Last follow-up</th><th className="px-4 py-2" /></tr></thead>
            <tbody>
              {rows.length === 0 ? <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">{show === "overdue" ? "No overdue invoices — well done!" : show === "due-soon" ? "Nothing due within the next 7 days." : "All invoices are paid."}</td></tr> : null}
              {rows.map((r) => {
                const lastReminder = r.reminders.length > 0 ? r.reminders[r.reminders.length - 1] : null;
                return <React.Fragment key={r.invoice.id}>
                  <tr className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium">{r.invoice.number}</td>
                    <td className="px-4 py-3">{r.invoice.customerCompany || r.invoice.customer}<span className="block text-xs text-muted-foreground">{r.invoice.customer}</span></td>
                    <td className="px-4 py-3 text-muted-foreground">{r.invoice.dueDate}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">{money(r.due)}</td>
                    <td className="px-4 py-3"><Badge variant={urgency(r.days)}>{urgencyLabel(r.days)}</Badge></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{lastReminder ? <><span className="capitalize">{lastReminder.method}</span> · {lastReminder.sentAt}<br />{lastReminder.note}</> : <span className="italic">No follow-up yet</span>}</td>
                    <td className="px-4 py-3"><Button size="sm" variant="secondary" onClick={() => { setRecording(recording === r.invoice.id ? null : r.invoice.id); setNote(""); }}>{recording === r.invoice.id ? "Cancel" : "Log follow-up"}</Button></td>
                  </tr>
                  {recording === r.invoice.id && <tr className="border-b border-border bg-surface-2"><td colSpan={7} className="px-4 py-3">
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="flex flex-col gap-1.5"><Label htmlFor="pr-method">Method</Label><select id="pr-method" className={selectClass} value={method} onChange={(e) => setMethod(e.target.value as "email" | "phone" | "whatsapp")}><option value="email">Email</option><option value="phone">Phone</option><option value="whatsapp">WhatsApp</option></select></div>
                      <div className="flex flex-1 flex-col gap-1.5"><Label htmlFor="pr-note">Note</Label><Input id="pr-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Spoke to accounts — payment promised by Friday" /></div>
                      <Button size="sm" disabled={note.trim().length < 3} onClick={() => recordReminder(r.invoice.id)}>Save</Button>
                    </div>
                  </td></tr>}
                </React.Fragment>;
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {reminders.length > 0 && <Card>
        <CardHeader><CardTitle className="text-base">Follow-up history</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[500px] text-sm">
            <thead><tr className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="px-4 py-2">Invoice</th><th className="px-4 py-2">Date</th><th className="px-4 py-2">Method</th><th className="px-4 py-2">Note</th></tr></thead>
            <tbody>{[...reminders].reverse().map((r, i) => {
              const inv = invoices.find((inv) => inv.id === r.invoiceId);
              return <tr key={i} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-medium">{inv?.number ?? "—"}</td>
                <td className="px-4 py-2 text-muted-foreground">{r.sentAt}</td>
                <td className="px-4 py-2"><Badge variant="neutral" className="capitalize">{r.method}</Badge></td>
                <td className="px-4 py-2 text-muted-foreground">{r.note}</td>
              </tr>;
            })}</tbody>
          </table>
        </CardContent>
      </Card>}
      <Card><CardContent className="p-4 text-sm text-muted-foreground"><p>Track collection follow-ups for unpaid invoices. Log each reminder sent (email, phone, WhatsApp) with a note. Overdue invoices are sorted by urgency — 30+ days overdue is critical. Due-soon shows invoices due within the next 7 days so you can follow up proactively.</p></CardContent></Card>
    </>
  );
}

/* ── Enterprise views ─────────────────────────────────────────────────── */

function ChartOfAccountsView({ me }: { me: string }) {
  const accounts = useFinanceStore((s) => s.accounts);
  const addAccount = useFinanceStore((s) => s.addAccount);
  const updateAccount = useFinanceStore((s) => s.updateAccount);
  const groups = ["Assets", "Liabilities", "Equity", "Income", "Expenses"] as const;
  const [filter, setFilter] = React.useState<string>("all");
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<AccountMaster | null>(null);
  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");
  const [group, setGroup] = React.useState<AccountMaster["group"]>("Assets");
  const [subGroup, setSubGroup] = React.useState("");
  const filtered = filter === "all" ? accounts : accounts.filter((a) => a.group === filter);
  const byGroup = groups.map((g) => ({ group: g, items: filtered.filter((a) => a.group === g) })).filter((g) => g.items.length > 0);
  const subGroups = [...new Set(accounts.map((a) => a.subGroup))];

  function openAdd() { setCode(""); setName(""); setGroup("Assets"); setSubGroup(""); setAdding(true); }
  function openEdit(a: AccountMaster) { setCode(a.code); setName(a.name); setGroup(a.group); setSubGroup(a.subGroup); setEditing(a); }
  function save() {
    if (editing) {
      const err = updateAccount(editing.code, { name, group, subGroup }, me);
      if (err) { toast.error(err); return; }
      toast.success(`Account ${editing.code} updated`);
      setEditing(null);
    } else {
      const err = addAccount({ code, name, group, subGroup }, me);
      if (err) { toast.error(err); return; }
      toast.success(`Account ${code} added`);
      setAdding(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <FilterChips label="Account group" value={filter} onChange={setFilter} options={[{ value: "all", label: "All groups" }, ...groups.map((g) => ({ value: g, label: g }))]} />
        <Badge variant="neutral">{accounts.length} accounts · {subGroups.length} sub-groups</Badge>
      </div>
      <div className="flex justify-end"><Button size="sm" onClick={openAdd}>Add account</Button></div>
      {byGroup.map((g) => {
        const subs = [...new Set(g.items.map((a) => a.subGroup))];
        return (
          <Card key={g.group}>
            <CardHeader><CardTitle className="text-base">{g.group}</CardTitle></CardHeader>
            <CardContent className="p-0">
              {subs.map((sub) => (
                <div key={sub}>
                  <div className="border-b border-border bg-surface-2 px-4 py-2 text-xs font-medium text-muted-foreground">{sub}</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm"><tbody>{g.items.filter((a) => a.subGroup === sub).map((a) => (
                      <tr key={a.code} className="border-b border-border hover:bg-surface-2 cursor-pointer" onClick={() => !a.isSystem && openEdit(a)}>
                        <td className="px-4 py-2 font-mono text-xs tabular-nums w-20">{a.code}</td>
                        <td className="px-4 py-2">{a.name}{a.isSystem && <Badge variant="neutral" className="ml-2 text-[10px]">System</Badge>}</td>
                        <td className="px-4 py-2 text-right text-xs text-muted-foreground">{a.subGroup}</td>
                      </tr>
                    ))}</tbody></table>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
      <Dialog open={adding || !!editing} onOpenChange={(open) => { if (!open) { setAdding(false); setEditing(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit account" : "Add account"}</DialogTitle><DialogDescription>{editing ? "Modify account details. System accounts cannot be edited." : "Create a new ledger account in the chart."}</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Account code</Label><Input value={code} onChange={(e) => setCode(e.target.value)} disabled={!!editing} placeholder="e.g. 3010" /></div>
              <div><Label>Account name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sales Discount" /></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Group</Label><select className={selectClass} value={group} onChange={(e) => setGroup(e.target.value as AccountMaster["group"])}>{groups.map((g) => <option key={g}>{g}</option>)}</select></div>
              <div><Label>Sub-group</Label><Input value={subGroup} onChange={(e) => setSubGroup(e.target.value)} placeholder="e.g. Direct Income" /></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => { setAdding(false); setEditing(null); }}>Cancel</Button><Button onClick={save}>{editing ? "Update" : "Add account"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Card><CardContent className="p-4 text-sm text-muted-foreground">The chart of accounts is the backbone of double-entry accounting. Each account code follows the Indian Schedule III grouping. System accounts (Cash, Bank, Receivables, Payables) are created automatically and cannot be edited. Click any non-system account to edit it.</CardContent></Card>
    </>
  );
}

function CostCentersView({ me }: { me: string }) {
  const costCenters = useFinanceStore((s) => s.costCenters);
  const invoices = useFinanceStore((s) => s.invoices);
  const bills = useFinanceStore((s) => s.bills);
  const expenses = useFinanceStore((s) => s.expenses);
  const pvs = useFinanceStore((s) => s.paymentVouchers);
  const addCostCenter = useFinanceStore((s) => s.addCostCenter);
  const updateCostCenter = useFinanceStore((s) => s.updateCostCenter);
  const revenueCenters = costCenters.filter((c) => c.type === "revenue" || c.type === "profit");
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0) + bills.reduce((s, b) => s + b.amount, 0);
  const totalRevenue = invoices.filter((i) => !i.cancelled).reduce((s, i) => s + invoiceTotals(i).taxable, 0);
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<CostCenter | null>(null);
  const [ccName, setCcName] = React.useState("");
  const [ccCode, setCcCode] = React.useState("");
  const [ccHead, setCcHead] = React.useState("");
  const [ccType, setCcType] = React.useState<CostCenter["type"]>("cost");

  function openAdd() { setCcName(""); setCcCode(""); setCcHead(""); setCcType("cost"); setAdding(true); }
  function openEdit(cc: CostCenter) { setCcName(cc.name); setCcCode(cc.code); setCcHead(cc.head); setCcType(cc.type); setEditing(cc); }
  function save() {
    if (editing) {
      const err = updateCostCenter(editing.id, { name: ccName, head: ccHead, type: ccType }, me);
      if (err) { toast.error(err); return; }
      toast.success(`Cost center ${ccName} updated`); setEditing(null);
    } else {
      const err = addCostCenter({ name: ccName, code: ccCode, head: ccHead, type: ccType, active: true }, me);
      if (err) { toast.error(err); return; }
      toast.success(`Cost center ${ccName} added`); setAdding(false);
    }
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Cost Centers" value={String(costCenters.length)} detail="Active departments" />
        <Kpi label="Revenue Centers" value={String(revenueCenters.length)} detail="Revenue / Profit centers" />
        <Kpi label="Total Revenue" value={money(totalRevenue)} detail="Allocated across centers" />
        <Kpi label="Total Expenses" value={money(totalExpenses)} detail="Tracked by center" />
      </div>
      <div className="flex justify-end"><Button size="sm" onClick={openAdd}>Add cost center</Button></div>
      <Card>
        <CardHeader><CardTitle className="text-base">Cost Center Directory</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm"><thead className="border-b border-border bg-surface-2"><tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Code</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Name</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Head</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Type</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Expenses Allocated</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
          </tr></thead><tbody className="divide-y divide-border">{costCenters.map((cc) => {
            const allocated = pvs.filter((p) => p.costCenter === cc.id).reduce((s, p) => s + p.amount, 0);
            return (
              <tr key={cc.id} className="hover:bg-surface-2 cursor-pointer" onClick={() => openEdit(cc)}>
                <td className="px-4 py-3 font-mono text-xs">{cc.code}</td>
                <td className="px-4 py-3 font-medium">{cc.name}</td>
                <td className="px-4 py-3">{cc.head}</td>
                <td className="px-4 py-3"><Badge variant={cc.type === "revenue" ? "success" : cc.type === "profit" ? "accent" : "neutral"} className="capitalize">{cc.type}</Badge></td>
                <td className="px-4 py-3 text-right tabular-nums">{money(allocated)}</td>
                <td className="px-4 py-3"><Badge variant={cc.active ? "success" : "neutral"}>{cc.active ? "Active" : "Inactive"}</Badge></td>
              </tr>
            );
          })}</tbody></table>
        </CardContent>
      </Card>
      <Dialog open={adding || !!editing} onOpenChange={(open) => { if (!open) { setAdding(false); setEditing(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit cost center" : "Add cost center"}</DialogTitle><DialogDescription>{editing ? "Modify department details." : "Create a new department or project cost center."}</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Code</Label><Input value={ccCode} onChange={(e) => setCcCode(e.target.value)} disabled={!!editing} placeholder="e.g. CC-MKT" /></div>
              <div><Label>Name</Label><Input value={ccName} onChange={(e) => setCcName(e.target.value)} placeholder="e.g. Marketing" /></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Head</Label><Input value={ccHead} onChange={(e) => setCcHead(e.target.value)} placeholder="Department head" /></div>
              <div><Label>Type</Label><select className={selectClass} value={ccType} onChange={(e) => setCcType(e.target.value as CostCenter["type"])}><option value="cost">Cost Center</option><option value="revenue">Revenue Center</option><option value="profit">Profit Center</option></select></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => { setAdding(false); setEditing(null); }}>Cancel</Button><Button onClick={save}>{editing ? "Update" : "Add"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Card><CardContent className="p-4 text-sm text-muted-foreground">Cost centers track expenses and revenue by department or project. Click any row to edit. Payment vouchers are tagged to a cost center for departmental P&L.</CardContent></Card>
    </>
  );
}

function VendorMasterView({ me }: { me: string }) {
  const vendors = useFinanceStore((s) => s.vendors);
  const bills = useFinanceStore((s) => s.bills);
  const addVendor = useFinanceStore((s) => s.addVendor);
  const updateVendor = useFinanceStore((s) => s.updateVendor);
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<VendorMaster | null>(null);
  const [name, setName] = React.useState("");
  const [state, setState] = React.useState("Rajasthan");
  const [terms, setTerms] = React.useState("30");
  const [category, setCategory] = React.useState("");
  const [contact, setContact] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [msme, setMsme] = React.useState(false);
  const msmeCount = vendors.filter((v) => v.msme).length;
  const totalOwed = bills.reduce((s, b) => s + Math.max(0, b.amount - (b.tds ?? 0) - b.payments.reduce((ps, p) => ps + p.amount, 0)), 0);

  function openEdit(v: VendorMaster) { setName(v.name); setState(v.state); setTerms(String(v.paymentTermsDays)); setCategory(v.category); setContact(v.contactName); setEmail(v.contactEmail); setPhone(v.contactPhone); setAddress(v.address); setMsme(!!v.msme); setEditing(v); }
  function openAdd() { setName(""); setState("Rajasthan"); setTerms("30"); setCategory(""); setContact(""); setEmail(""); setPhone(""); setAddress(""); setMsme(false); setAdding(true); }
  function save() {
    if (editing) {
      const err = updateVendor(editing.id, { name, address, state, paymentTermsDays: Number(terms) || 30, contactName: contact, contactEmail: email, contactPhone: phone, category, msme }, me);
      if (err) { toast.error(err); return; }
      toast.success(`Vendor ${name} updated`); setEditing(null);
    } else {
      const err = addVendor({ name, address, state, paymentTermsDays: Number(terms) || 30, contactName: contact, contactEmail: email, contactPhone: phone, category, msme }, me);
      if (err) { toast.error(err); return; }
      toast.success(`Vendor ${name} added`); setAdding(false);
    }
    setName(""); setCategory(""); setContact(""); setEmail(""); setPhone(""); setAddress("");
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Total Vendors" value={String(vendors.length)} detail={`${vendors.filter((v) => v.active).length} active`} />
        <Kpi label="MSME Vendors" value={String(msmeCount)} detail="Registered MSME" />
        <Kpi label="Total Payable" value={money(totalOwed)} detail="Outstanding to vendors" />
        <Kpi label="Categories" value={String(new Set(vendors.map((v) => v.category)).size)} detail="Vendor categories" />
      </div>
      <div className="flex justify-end"><Button size="sm" onClick={openAdd}>Add vendor</Button></div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm"><thead className="border-b border-border bg-surface-2"><tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Vendor</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">GSTIN</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">State</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Category</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Terms</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Contact</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Outstanding</th>
          </tr></thead><tbody className="divide-y divide-border">{vendors.map((v) => {
            const owed = bills.filter((b) => b.vendor.includes(v.name.split(" ")[0])).reduce((s, b) => s + Math.max(0, b.amount - (b.tds ?? 0) - b.payments.reduce((ps, p) => ps + p.amount, 0)), 0);
            return (
              <tr key={v.id} className="hover:bg-surface-2 cursor-pointer" onClick={() => openEdit(v)}>
                <td className="px-4 py-3"><p className="font-medium">{v.name}</p>{v.msme && <Badge variant="accent" className="text-[10px]">MSME</Badge>}</td>
                <td className="px-4 py-3 font-mono text-xs">{v.gstin ?? "—"}</td>
                <td className="px-4 py-3 text-xs">{v.state}</td>
                <td className="px-4 py-3"><Badge variant="neutral">{v.category}</Badge></td>
                <td className="px-4 py-3 text-xs">{v.paymentTermsDays} days</td>
                <td className="px-4 py-3 text-xs">{v.contactName}<br />{v.contactPhone}</td>
                <td className="px-4 py-3 text-right tabular-nums">{money(owed)}</td>
              </tr>
            );
          })}</tbody></table>
        </CardContent>
      </Card>
      <Dialog open={adding || !!editing} onOpenChange={(open) => { if (!open) { setAdding(false); setEditing(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit vendor" : "Add vendor"}</DialogTitle><DialogDescription>{editing ? "Update vendor details." : "Register a new vendor with compliance and payment details."}</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Vendor name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Company name" /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Category</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Packaging" /></div>
              <div><Label>State</Label><Input value={state} onChange={(e) => setState(e.target.value)} /></div>
            </div>
            <div><Label>Address</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Full address" /></div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div><Label>Contact name</Label><Input value={contact} onChange={(e) => setContact(e.target.value)} /></div>
              <div><Label>Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" /></div>
              <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Payment terms (days)</Label><Input type="number" value={terms} onChange={(e) => setTerms(e.target.value)} /></div>
              <div className="flex items-center gap-2 pt-5"><input type="checkbox" checked={msme} onChange={(e) => setMsme(e.target.checked)} /><Label>MSME registered</Label></div>
            </div>
            {editing && <div className="flex items-center gap-2"><input type="checkbox" checked={!editing.active} onChange={(e) => { const err = updateVendor(editing.id, { active: !e.target.checked }, me); if (err) toast.error(err); else { toast.success(e.target.checked ? "Vendor deactivated" : "Vendor reactivated"); setEditing(null); } }} /><Label className="text-danger">Deactivate vendor</Label></div>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => { setAdding(false); setEditing(null); }}>Cancel</Button><Button onClick={save}>{editing ? "Update vendor" : "Save vendor"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CustomerMasterView({ me }: { me: string }) {
  const customers = useFinanceStore((s) => s.customers);
  const invoices = useFinanceStore((s) => s.invoices);
  const creditNotes = useFinanceStore((s) => s.creditNotes);
  const addCustomer = useFinanceStore((s) => s.addCustomer);
  const updateCustomer = useFinanceStore((s) => s.updateCustomer);
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<CustomerMaster | null>(null);
  const [name, setName] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [state, setState] = React.useState("Rajasthan");
  const [segment, setSegment] = React.useState("");
  const [limitDays, setLimitDays] = React.useState("30");
  const [limitAmt, setLimitAmt] = React.useState("500000");
  const [contact, setContact] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [address, setAddress] = React.useState("");

  function openEdit(c: CustomerMaster) { setName(c.name); setCompany(c.company); setState(c.state); setSegment(c.segment); setLimitDays(String(c.creditLimitDays)); setLimitAmt(String(c.creditLimitAmount)); setContact(c.contactName); setEmail(c.contactEmail); setPhone(c.contactPhone); setAddress(c.address); setEditing(c); }
  function openAdd() { setName(""); setCompany(""); setState("Rajasthan"); setSegment(""); setLimitDays("30"); setLimitAmt("500000"); setContact(""); setEmail(""); setPhone(""); setAddress(""); setAdding(true); }
  function save() {
    if (editing) {
      const err = updateCustomer(editing.id, { name, company, address, state, creditLimitDays: Number(limitDays) || 30, creditLimitAmount: Number(limitAmt) || 0, contactName: contact, contactEmail: email, contactPhone: phone, segment }, me);
      if (err) { toast.error(err); return; }
      toast.success(`Customer ${company} updated`); setEditing(null);
    } else {
      const err = addCustomer({ name, company, address, state, creditLimitDays: Number(limitDays) || 30, creditLimitAmount: Number(limitAmt) || 0, contactName: contact, contactEmail: email, contactPhone: phone, segment }, me);
      if (err) { toast.error(err); return; }
      toast.success(`Customer ${company} added`); setAdding(false);
    }
    setName(""); setCompany(""); setSegment(""); setContact(""); setEmail(""); setPhone(""); setAddress("");
  }

  const totalReceivable = invoices.filter((i) => !i.cancelled).reduce((s, i) => s + dueAmount(i, creditNotes), 0);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Total Customers" value={String(customers.length)} detail={`${customers.filter((c) => c.active).length} active`} />
        <Kpi label="Segments" value={String(new Set(customers.map((c) => c.segment)).size)} detail="Customer segments" />
        <Kpi label="Total Receivable" value={money(totalReceivable)} detail="Outstanding from customers" />
        <Kpi label="With GSTIN" value={String(customers.filter((c) => c.gstin).length)} detail="GST registered" />
      </div>
      <div className="flex justify-end"><Button size="sm" onClick={openAdd}>Add customer</Button></div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm"><thead className="border-b border-border bg-surface-2"><tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Customer</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">GSTIN</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Segment</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Credit Limit</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Terms</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Outstanding</th>
          </tr></thead><tbody className="divide-y divide-border">{customers.map((c) => {
            const owed = invoices.filter((i) => !i.cancelled && i.customerCompany === c.company).reduce((s, i) => s + dueAmount(i, creditNotes), 0);
            const overLimit = owed > c.creditLimitAmount;
            return (
              <tr key={c.id} className="hover:bg-surface-2 cursor-pointer" onClick={() => openEdit(c)}>
                <td className="px-4 py-3"><p className="font-medium">{c.company}</p><p className="text-xs text-muted-foreground">{c.contactName} · {c.contactPhone}</p></td>
                <td className="px-4 py-3 font-mono text-xs">{c.gstin ?? "—"}</td>
                <td className="px-4 py-3"><Badge variant="neutral">{c.segment}</Badge></td>
                <td className="px-4 py-3 text-xs tabular-nums">{money(c.creditLimitAmount)}</td>
                <td className="px-4 py-3 text-xs">{c.creditLimitDays} days</td>
                <td className="px-4 py-3 text-right tabular-nums">{overLimit ? <span className="text-danger font-medium">{money(owed)}</span> : money(owed)}</td>
              </tr>
            );
          })}</tbody></table>
        </CardContent>
      </Card>
      <Dialog open={adding || !!editing} onOpenChange={(open) => { if (!open) { setAdding(false); setEditing(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit customer" : "Add customer"}</DialogTitle><DialogDescription>{editing ? "Update customer details." : "Register a customer with credit terms and compliance details."}</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2"><div><Label>Contact name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div><div><Label>Company</Label><Input value={company} onChange={(e) => setCompany(e.target.value)} /></div></div>
            <div className="grid gap-3 sm:grid-cols-2"><div><Label>Segment</Label><Input value={segment} onChange={(e) => setSegment(e.target.value)} placeholder="e.g. Retail" /></div><div><Label>State</Label><Input value={state} onChange={(e) => setState(e.target.value)} /></div></div>
            <div><Label>Address</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
            <div className="grid gap-3 sm:grid-cols-3"><div><Label>Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" /></div><div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div><div><Label>Credit limit (days)</Label><Input type="number" value={limitDays} onChange={(e) => setLimitDays(e.target.value)} /></div></div>
            <div><Label>Credit limit (amount)</Label><Input type="number" value={limitAmt} onChange={(e) => setLimitAmt(e.target.value)} /></div>
            {editing && <div className="flex items-center gap-2"><input type="checkbox" checked={!editing.active} onChange={(e) => { const err = updateCustomer(editing.id, { active: !e.target.checked }, me); if (err) toast.error(err); else { toast.success(e.target.checked ? "Customer deactivated" : "Customer reactivated"); setEditing(null); } }} /><Label className="text-danger">Deactivate customer</Label></div>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => { setAdding(false); setEditing(null); }}>Cancel</Button><Button onClick={save}>{editing ? "Update customer" : "Save customer"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function QuotationsView({ me }: { me: string }) {
  const quotations = useFinanceStore((s) => s.quotations);
  const customers = useFinanceStore((s) => s.customers);
  const convertQuotation = useFinanceStore((s) => s.convertQuotation);
  const addQuotation = useFinanceStore((s) => s.addQuotation);
  const [adding, setAdding] = React.useState(false);
  const [custId, setCustId] = React.useState("");
  const [validDays, setValidDays] = React.useState("30");
  const [itemName, setItemName] = React.useState("");
  const [itemQty, setItemQty] = React.useState("1");
  const [itemRate, setItemRate] = React.useState("");
  const [itemGst, setItemGst] = React.useState("18");
  const [lines, setLines] = React.useState<{ item: string; hsn: string; qty: number; rate: number; gstRate: number }[]>([]);
  const [notes, setNotes] = React.useState("");
  const statusColor = (s: string) => s === "accepted" ? "success" : s === "sent" ? "accent" : s === "invoiced" ? "info" : s === "expired" || s === "rejected" ? "warning" : "neutral";
  const totalValue = quotations.reduce((s, q) => { let t = 0; for (const l of q.lines) { t += l.qty * l.rate * (1 + l.gstRate / 100); } return s + t; }, 0);
  const pipeline = quotations.filter((q) => q.status === "sent" || q.status === "accepted");
  const pipelineValue = pipeline.reduce((s, q) => { let t = 0; for (const l of q.lines) { t += l.qty * l.rate * (1 + l.gstRate / 100); } return s + t; }, 0);

  function addLine() {
    if (!itemName || !Number(itemRate)) return;
    setLines([...lines, { item: itemName, hsn: "", qty: Number(itemQty) || 1, rate: Number(itemRate), gstRate: Number(itemGst) }]);
    setItemName(""); setItemRate(""); setItemQty("1");
  }
  function save() {
    const cust = customers.find((c) => c.id === custId);
    if (!cust) { toast.error("Select a customer"); return; }
    const validUntil = new Date(Date.now() + (Number(validDays) || 30) * 86400000).toISOString().slice(0, 10);
    const err = addQuotation({ customer: cust.contactName, customerCompany: cust.company, date: todayIso(), validUntil, lines, notes }, me);
    if (err) { toast.error(err); return; }
    toast.success("Quotation created"); setAdding(false); setLines([]); setNotes(""); setCustId("");
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Total Quotations" value={String(quotations.length)} detail="All quotes" />
        <Kpi label="Pipeline" value={String(pipeline.length)} detail="Sent + Accepted" />
        <Kpi label="Pipeline Value" value={money(pipelineValue)} detail="Incl. GST" />
        <Kpi label="Total Value" value={money(totalValue)} detail="All quotations" />
      </div>
      <div className="flex justify-end"><Button size="sm" onClick={() => setAdding(true)}>New quotation</Button></div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm"><thead className="border-b border-border bg-surface-2"><tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Number</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Customer</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Date</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Valid Until</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Items</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Amount</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground" />
          </tr></thead><tbody className="divide-y divide-border">{quotations.map((q) => {
            let total = 0; for (const l of q.lines) total += l.qty * l.rate * (1 + l.gstRate / 100);
            return (
              <tr key={q.id}>
                <td className="px-4 py-3 font-mono text-xs">{q.number}</td>
                <td className="px-4 py-3"><p className="font-medium">{q.customerCompany}</p><p className="text-xs text-muted-foreground">{q.customer}</p></td>
                <td className="px-4 py-3 text-xs tabular-nums">{q.date}</td>
                <td className="px-4 py-3 text-xs tabular-nums">{q.validUntil}</td>
                <td className="px-4 py-3 text-xs">{q.lines.length} item{q.lines.length !== 1 ? "s" : ""}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">{money(total)}</td>
                <td className="px-4 py-3"><Badge variant={statusColor(q.status)} className="capitalize">{q.status}</Badge></td>
                <td className="px-4 py-3">{q.status === "accepted" && <Button size="sm" onClick={() => { const err = convertQuotation(q.id, me); if (err) toast.error(err); else toast.success(`Converted to invoice`); }}>Convert to invoice</Button>}</td>
              </tr>
            );
          })}</tbody></table>
        </CardContent>
      </Card>
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader><DialogTitle>New quotation</DialogTitle><DialogDescription>Create a pro-forma estimate for a customer.</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Customer</Label><select className={selectClass} value={custId} onChange={(e) => setCustId(e.target.value)}><option value="">Select customer…</option>{customers.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}</select></div>
              <div><Label>Valid for (days)</Label><Input type="number" value={validDays} onChange={(e) => setValidDays(e.target.value)} /></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-4 items-end">
              <div><Label>Item</Label><Input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="Item name" /></div>
              <div><Label>Qty</Label><Input type="number" value={itemQty} onChange={(e) => setItemQty(e.target.value)} /></div>
              <div><Label>Rate</Label><Input type="number" value={itemRate} onChange={(e) => setItemRate(e.target.value)} placeholder="₹ per unit" /></div>
              <Button size="sm" variant="outline" onClick={addLine}>Add line</Button>
            </div>
            {lines.length > 0 && <div className="text-xs space-y-1">{lines.map((l, i) => <div key={i} className="flex justify-between border-b border-border pb-1"><span>{l.item} × {l.qty}</span><span>{money(l.qty * l.rate)} + {l.gstRate}% GST</span></div>)}</div>}
            <div><Label>Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button><Button onClick={save} disabled={lines.length === 0}>Create quotation</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Card><CardContent className="p-4 text-sm text-muted-foreground">Quotations are pre-sale estimates sent to customers before invoicing. When a customer accepts a quote, convert it to a real invoice with one click.</CardContent></Card>
    </>
  );
}

function PaymentVouchersView({ me }: { me: string }) {
  const vouchers = useFinanceStore((s) => s.paymentVouchers);
  const costCenters = useFinanceStore((s) => s.costCenters);
  const addPV = useFinanceStore((s) => s.addPaymentVoucher);
  const [adding, setAdding] = React.useState(false);
  const [paidTo, setPaidTo] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<"Bank transfer" | "UPI" | "Cash" | "Cheque">("Bank transfer");
  const [reference, setReference] = React.useState("");
  const [narration, setNarration] = React.useState("");
  const [cc, setCc] = React.useState("");
  const totalPaid = vouchers.reduce((s, v) => s + v.amount, 0);
  const byMethod = ["Bank transfer", "UPI", "Cash", "Cheque"].map((m) => ({ method: m, total: vouchers.filter((v) => v.method === m).reduce((s, v) => s + v.amount, 0) }));

  function save() {
    const err = addPV({ date: todayIso(), paidTo, amount: Number(amount), method, reference, narration, costCenter: cc || undefined }, me);
    if (err) { toast.error(err); return; }
    toast.success("Payment voucher created"); setAdding(false); setPaidTo(""); setAmount(""); setReference(""); setNarration("");
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Total Vouchers" value={String(vouchers.length)} detail="Payment vouchers" />
        <Kpi label="Total Paid" value={money(totalPaid)} detail="All payment vouchers" />
        {byMethod.filter((m) => m.total > 0).slice(0, 2).map((m) => <Kpi key={m.method} label={m.method} value={money(m.total)} detail="By method" />)}
      </div>
      <div className="flex justify-end"><Button size="sm" onClick={() => setAdding(true)}>New payment voucher</Button></div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm"><thead className="border-b border-border bg-surface-2"><tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Voucher #</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Date</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Paid To</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Amount</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Method</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Reference</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Cost Center</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Narration</th>
          </tr></thead><tbody className="divide-y divide-border">{vouchers.map((v) => (
            <tr key={v.id}>
              <td className="px-4 py-3 font-mono text-xs">{v.number}</td>
              <td className="px-4 py-3 text-xs tabular-nums">{v.date}</td>
              <td className="px-4 py-3 font-medium">{v.paidTo}</td>
              <td className="px-4 py-3 text-right tabular-nums font-medium">{money(v.amount)}</td>
              <td className="px-4 py-3"><Badge variant="neutral">{v.method}</Badge></td>
              <td className="px-4 py-3 font-mono text-xs">{v.reference}</td>
              <td className="px-4 py-3 text-xs">{costCenters.find((c) => c.id === v.costCenter)?.name ?? "—"}</td>
              <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">{v.narration}</td>
            </tr>
          ))}</tbody></table>
        </CardContent>
      </Card>
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader><DialogTitle>New payment voucher</DialogTitle><DialogDescription>Record a formal payment with cost center and narration.</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Paid to</Label><Input value={paidTo} onChange={(e) => setPaidTo(e.target.value)} /></div>
            <div className="grid gap-3 sm:grid-cols-2"><div><Label>Amount</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
              <div><Label>Method</Label><select className={selectClass} value={method} onChange={(e) => setMethod(e.target.value as typeof method)}><option>Bank transfer</option><option>UPI</option><option>Cash</option><option>Cheque</option></select></div></div>
            <div className="grid gap-3 sm:grid-cols-2"><div><Label>Reference</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="NEFT/UTR number" /></div>
              <div><Label>Cost center</Label><select className={selectClass} value={cc} onChange={(e) => setCc(e.target.value)}><option value="">None</option>{costCenters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div></div>
            <div><Label>Narration</Label><Input value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="Purpose of payment" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button><Button onClick={save}>Create voucher</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReceiptVouchersView({ me }: { me: string }) {
  const vouchers = useFinanceStore((s) => s.receiptVouchers);
  const addRV = useFinanceStore((s) => s.addReceiptVoucher);
  const [adding, setAdding] = React.useState(false);
  const [from, setFrom] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<"Bank transfer" | "UPI" | "Cash" | "Cheque">("UPI");
  const [reference, setReference] = React.useState("");
  const [narration, setNarration] = React.useState("");
  const totalReceived = vouchers.reduce((s, v) => s + v.amount, 0);

  function save() {
    const err = addRV({ date: todayIso(), receivedFrom: from, amount: Number(amount), method, reference, narration }, me);
    if (err) { toast.error(err); return; }
    toast.success("Receipt voucher created"); setAdding(false); setFrom(""); setAmount(""); setReference(""); setNarration("");
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Total Receipts" value={String(vouchers.length)} detail="Receipt vouchers" />
        <Kpi label="Total Received" value={money(totalReceived)} detail="All receipt vouchers" />
      </div>
      <div className="flex justify-end"><Button size="sm" onClick={() => setAdding(true)}>New receipt voucher</Button></div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm"><thead className="border-b border-border bg-surface-2"><tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Voucher #</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Date</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Received From</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Amount</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Method</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Reference</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Narration</th>
          </tr></thead><tbody className="divide-y divide-border">{vouchers.map((v) => (
            <tr key={v.id}>
              <td className="px-4 py-3 font-mono text-xs">{v.number}</td>
              <td className="px-4 py-3 text-xs tabular-nums">{v.date}</td>
              <td className="px-4 py-3 font-medium">{v.receivedFrom}</td>
              <td className="px-4 py-3 text-right tabular-nums font-medium">{money(v.amount)}</td>
              <td className="px-4 py-3"><Badge variant="neutral">{v.method}</Badge></td>
              <td className="px-4 py-3 font-mono text-xs">{v.reference}</td>
              <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">{v.narration}</td>
            </tr>
          ))}</tbody></table>
        </CardContent>
      </Card>
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader><DialogTitle>New receipt voucher</DialogTitle><DialogDescription>Record a formal receipt of money.</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Received from</Label><Input value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div className="grid gap-3 sm:grid-cols-2"><div><Label>Amount</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
              <div><Label>Method</Label><select className={selectClass} value={method} onChange={(e) => setMethod(e.target.value as typeof method)}><option>UPI</option><option>Bank transfer</option><option>Cash</option><option>Cheque</option></select></div></div>
            <div className="grid gap-3 sm:grid-cols-2"><div><Label>Reference</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} /></div>
              <div><Label>Narration</Label><Input value={narration} onChange={(e) => setNarration(e.target.value)} /></div></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button><Button onClick={save}>Create receipt</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ContraEntriesView({ me }: { me: string }) {
  const entries = useFinanceStore((s) => s.contraEntries);
  const addContra = useFinanceStore((s) => s.addContraEntry);
  const [adding, setAdding] = React.useState(false);
  const [from, setFrom] = React.useState<"cash" | "bank">("bank");
  const [amount, setAmount] = React.useState("");
  const [narration, setNarration] = React.useState("");
  const cashToBank = entries.filter((e) => e.from === "cash").reduce((s, e) => s + e.amount, 0);
  const bankToCash = entries.filter((e) => e.from === "bank").reduce((s, e) => s + e.amount, 0);

  function save() {
    const err = addContra({ date: todayIso(), from, to: from === "cash" ? "bank" : "cash", amount: Number(amount), narration }, me);
    if (err) { toast.error(err); return; }
    toast.success("Contra entry created"); setAdding(false); setAmount(""); setNarration("");
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Total Entries" value={String(entries.length)} detail="Contra entries" />
        <Kpi label="Cash → Bank" value={money(cashToBank)} detail="Cash deposited" />
        <Kpi label="Bank → Cash" value={money(bankToCash)} detail="Cash withdrawn" />
        <Kpi label="Net Movement" value={money(cashToBank - bankToCash)} detail="Net deposit to bank" />
      </div>
      <div className="flex justify-end"><Button size="sm" onClick={() => setAdding(true)}>New contra entry</Button></div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm"><thead className="border-b border-border bg-surface-2"><tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Entry #</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Date</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">From</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">To</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Amount</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Narration</th>
          </tr></thead><tbody className="divide-y divide-border">{entries.map((e) => (
            <tr key={e.id}>
              <td className="px-4 py-3 font-mono text-xs">{e.number}</td>
              <td className="px-4 py-3 text-xs tabular-nums">{e.date}</td>
              <td className="px-4 py-3"><Badge variant={e.from === "bank" ? "accent" : "neutral"} className="capitalize">{e.from}</Badge></td>
              <td className="px-4 py-3"><Badge variant={e.to === "bank" ? "accent" : "neutral"} className="capitalize">{e.to}</Badge></td>
              <td className="px-4 py-3 text-right tabular-nums font-medium">{money(e.amount)}</td>
              <td className="px-4 py-3 text-sm text-muted-foreground">{e.narration}</td>
            </tr>
          ))}</tbody></table>
        </CardContent>
      </Card>
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader><DialogTitle>New contra entry</DialogTitle><DialogDescription>Transfer money between cash and bank accounts.</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Direction</Label><select className={selectClass} value={from} onChange={(e) => setFrom(e.target.value as "cash" | "bank")}><option value="bank">Bank → Cash (withdrawal)</option><option value="cash">Cash → Bank (deposit)</option></select></div>
            <div><Label>Amount</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div><Label>Narration</Label><Input value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="Purpose of transfer" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button><Button onClick={save}>Create contra</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CashBankBookView() {
  const invoices = useFinanceStore((s) => s.invoices);
  const bills = useFinanceStore((s) => s.bills);
  const expenses = useFinanceStore((s) => s.expenses);
  const bankEntries = useFinanceStore((s) => s.bankEntries);
  const topUps = useFinanceStore((s) => s.pettyCashTopUps);
  const contraEntries = useFinanceStore((s) => s.contraEntries);
  const openingCash = useFinanceStore((s) => s.openingCash);
  const [tab, setTab] = React.useState<"bank" | "cash">("bank");

  type Txn = { date: string; particular: string; debit: number; credit: number };
  const bankTxns: Txn[] = [];
  for (const inv of invoices) for (const p of inv.payments) if (p.method !== "Cash") bankTxns.push({ date: p.date, particular: `Receipt: ${inv.customer} (${inv.number})`, debit: p.amount, credit: 0 });
  for (const bill of bills) for (const p of bill.payments) bankTxns.push({ date: p.date, particular: `Payment: ${bill.vendor} (${bill.number})`, debit: 0, credit: p.amount });
  for (const exp of expenses.filter((e) => e.paidFrom === "bank")) bankTxns.push({ date: exp.date, particular: `Expense: ${exp.payee}`, debit: 0, credit: Math.round(exp.amount * (100 + exp.gstRate)) / 100 });
  for (const e of bankEntries) bankTxns.push({ date: e.date, particular: e.description, debit: e.amount > 0 ? e.amount : 0, credit: e.amount < 0 ? -e.amount : 0 });
  for (const t of topUps) bankTxns.push({ date: t.date, particular: "Transfer to petty cash", debit: 0, credit: t.amount });
  for (const c of contraEntries) { if (c.from === "cash") bankTxns.push({ date: c.date, particular: `Contra: ${c.narration}`, debit: c.amount, credit: 0 }); else bankTxns.push({ date: c.date, particular: `Contra: ${c.narration}`, debit: 0, credit: c.amount }); }
  bankTxns.sort((a, b) => a.date.localeCompare(b.date));

  const cashTxns: Txn[] = [];
  for (const inv of invoices) for (const p of inv.payments) if (p.method === "Cash") cashTxns.push({ date: p.date, particular: `Receipt: ${inv.customer}`, debit: p.amount, credit: 0 });
  for (const exp of expenses.filter((e) => e.paidFrom === "petty cash")) cashTxns.push({ date: exp.date, particular: `Expense: ${exp.payee}`, debit: 0, credit: exp.amount });
  for (const t of topUps) cashTxns.push({ date: t.date, particular: "Top-up from bank", debit: t.amount, credit: 0 });
  for (const c of contraEntries) { if (c.from === "bank") cashTxns.push({ date: c.date, particular: `Contra: ${c.narration}`, debit: c.amount, credit: 0 }); else cashTxns.push({ date: c.date, particular: `Contra: ${c.narration}`, debit: 0, credit: c.amount }); }
  cashTxns.sort((a, b) => a.date.localeCompare(b.date));

  const txns = tab === "bank" ? bankTxns : cashTxns;
  let running = tab === "bank" ? openingCash : 0;
  const rows = txns.map((t) => { running += t.debit - t.credit; return { ...t, balance: running }; });
  const totalDebit = txns.reduce((s, t) => s + t.debit, 0);
  const totalCredit = txns.reduce((s, t) => s + t.credit, 0);

  return (
    <>
      <div className="flex gap-1 border-b border-border">{(["bank", "cash"] as const).map((t) => <button key={t} type="button" onClick={() => setTab(t)} className={`px-4 py-2 text-sm capitalize ${tab === t ? "border-b-2 border-accent font-medium" : "text-muted-foreground"}`}>{t === "bank" ? "Bank Book" : "Cash Book"}</button>)}</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Opening" value={money(tab === "bank" ? openingCash : 0)} detail={tab === "bank" ? "Bank opening" : "Cash opening"} />
        <Kpi label="Total Debit" value={money(totalDebit)} detail="Money in" />
        <Kpi label="Total Credit" value={money(totalCredit)} detail="Money out" />
        <Kpi label="Closing" value={money(rows.length > 0 ? rows[rows.length - 1].balance : (tab === "bank" ? openingCash : 0))} detail="Current balance" />
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm tabular-nums"><thead className="border-b border-border bg-surface-2"><tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Date</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Particulars</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Debit (In)</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Credit (Out)</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Balance</th>
          </tr></thead><tbody className="divide-y divide-border">{rows.map((r, i) => (
            <tr key={i}>
              <td className="px-4 py-2 text-xs">{r.date}</td>
              <td className="px-4 py-2">{r.particular}</td>
              <td className="px-4 py-2 text-right">{r.debit > 0 ? money(r.debit) : ""}</td>
              <td className="px-4 py-2 text-right">{r.credit > 0 ? money(r.credit) : ""}</td>
              <td className="px-4 py-2 text-right font-medium">{money(r.balance)}</td>
            </tr>
          ))}</tbody></table>
        </CardContent>
      </Card>
    </>
  );
}

function DayBookView() {
  const invoices = useFinanceStore((s) => s.invoices);
  const bills = useFinanceStore((s) => s.bills);
  const expenses = useFinanceStore((s) => s.expenses);
  const creditNotes = useFinanceStore((s) => s.creditNotes);
  const pvs = useFinanceStore((s) => s.paymentVouchers);
  const rvs = useFinanceStore((s) => s.receiptVouchers);
  const contraEntries = useFinanceStore((s) => s.contraEntries);

  type Entry = { date: string; type: string; number: string; party: string; debit: number; credit: number };
  const entries: Entry[] = [];
  for (const inv of invoices.filter((i) => !i.cancelled)) entries.push({ date: inv.date, type: "Invoice", number: inv.number, party: inv.customerCompany, debit: invoiceTotals(inv).total, credit: 0 });
  for (const bill of bills) entries.push({ date: bill.date, type: "Bill", number: bill.number, party: bill.vendor, debit: 0, credit: bill.amount });
  for (const exp of expenses) entries.push({ date: exp.date, type: "Expense", number: exp.id.slice(0, 8), party: exp.payee, debit: 0, credit: exp.amount });
  for (const cn of creditNotes.filter((n) => n.status === "approved")) entries.push({ date: cn.date, type: "Credit Note", number: cn.number, party: invoices.find((i) => i.id === cn.invoiceId)?.customerCompany ?? "—", debit: 0, credit: cn.amount });
  for (const pv of pvs) entries.push({ date: pv.date, type: "Payment", number: pv.number, party: pv.paidTo, debit: 0, credit: pv.amount });
  for (const rv of rvs) entries.push({ date: rv.date, type: "Receipt", number: rv.number, party: rv.receivedFrom, debit: rv.amount, credit: 0 });
  for (const ce of contraEntries) entries.push({ date: ce.date, type: "Contra", number: ce.number, party: `${ce.from} → ${ce.to}`, debit: ce.from === "cash" ? ce.amount : 0, credit: ce.from === "bank" ? ce.amount : 0 });
  entries.sort((a, b) => a.date.localeCompare(b.date));
  const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Total Entries" value={String(entries.length)} detail="All transactions" />
        <Kpi label="Total Debit" value={money(totalDebit)} detail="Money in / sales" />
        <Kpi label="Total Credit" value={money(totalCredit)} detail="Money out / purchases" />
        <Kpi label="Difference" value={money(totalDebit - totalCredit)} detail="Debit − Credit" />
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm tabular-nums"><thead className="border-b border-border bg-surface-2"><tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Date</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Type</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Number</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Party</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Debit</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Credit</th>
          </tr></thead><tbody className="divide-y divide-border">{entries.map((e, i) => (
            <tr key={i}>
              <td className="px-4 py-2 text-xs">{e.date}</td>
              <td className="px-4 py-2"><Badge variant={e.type === "Invoice" || e.type === "Receipt" ? "success" : e.type === "Contra" ? "accent" : "neutral"}>{e.type}</Badge></td>
              <td className="px-4 py-2 font-mono text-xs">{e.number}</td>
              <td className="px-4 py-2">{e.party}</td>
              <td className="px-4 py-2 text-right">{e.debit > 0 ? money(e.debit) : ""}</td>
              <td className="px-4 py-2 text-right">{e.credit > 0 ? money(e.credit) : ""}</td>
            </tr>
          ))}
          <tr className="bg-surface-2 font-semibold">
            <td className="px-4 py-2" colSpan={4}>Total</td>
            <td className="px-4 py-2 text-right">{money(totalDebit)}</td>
            <td className="px-4 py-2 text-right">{money(totalCredit)}</td>
          </tr>
          </tbody></table>
        </CardContent>
      </Card>
      <Card><CardContent className="p-4 text-sm text-muted-foreground">The day book is a chronological journal of every financial transaction — invoices, bills, expenses, credit notes, payments, receipts and contra entries. It is the primary record from which all other books are derived.</CardContent></Card>
    </>
  );
}

function EInvoicingView({ me }: { me: string }) {
  const invoices = useFinanceStore((s) => s.invoices);
  const eStatuses = useFinanceStore((s) => s.eInvoiceStatuses);
  const generateEInvoice = useFinanceStore((s) => s.generateEInvoice);
  const bulkGenerate = useFinanceStore((s) => s.bulkGenerateEInvoice);
  const live = invoices.filter((i) => !i.cancelled);
  const generated = eStatuses.filter((e) => e.status === "generated").length;
  const pending = eStatuses.filter((e) => e.status === "pending").length;
  const noStatus = live.length - eStatuses.length;
  const pendingIds = live.filter((inv) => { const es = eStatuses.find((e) => e.invoiceId === inv.id); return !es || es.status === "pending"; }).map((inv) => inv.id);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Total Invoices" value={String(live.length)} detail="Active invoices" />
        <Kpi label="E-Invoice Generated" value={String(generated)} detail="IRN issued" />
        <Kpi label="Pending" value={String(pending + Math.max(0, noStatus))} detail="Awaiting generation" />
        <Kpi label="With E-Way Bill" value={String(eStatuses.filter((e) => e.ewayBillNo).length)} detail="Transport document" />
      </div>
      {pendingIds.length > 0 && <div className="flex justify-end"><Button size="sm" onClick={() => { const r = bulkGenerate(pendingIds, me); toast.success(`${r.generated} e-invoices generated${r.errors.length > 0 ? `, ${r.errors.length} errors` : ""}`); }}>Generate all pending ({pendingIds.length})</Button></div>}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm"><thead className="border-b border-border bg-surface-2"><tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Invoice</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Customer</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Amount</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">IRN</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Ack #</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">E-Way Bill</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground" />
          </tr></thead><tbody className="divide-y divide-border">{live.map((inv) => {
            const es = eStatuses.find((e) => e.invoiceId === inv.id);
            return (
              <tr key={inv.id}>
                <td className="px-4 py-3 font-mono text-xs">{inv.number}</td>
                <td className="px-4 py-3">{inv.customerCompany}</td>
                <td className="px-4 py-3 text-right tabular-nums">{money(invoiceTotals(inv).total)}</td>
                <td className="px-4 py-3 font-mono text-[10px] max-w-[120px] truncate">{es?.irn ?? "—"}</td>
                <td className="px-4 py-3 font-mono text-xs">{es?.ackNo ?? "—"}</td>
                <td className="px-4 py-3 font-mono text-xs">{es?.ewayBillNo ?? "—"}</td>
                <td className="px-4 py-3"><Badge variant={es?.status === "generated" ? "success" : es?.status === "cancelled" ? "danger" : "warning"}>{es?.status ?? "pending"}</Badge></td>
                <td className="px-4 py-3">{(!es || es.status === "pending") && <Button size="sm" onClick={() => { const err = generateEInvoice(inv.id, me); if (err) toast.error(err); else toast.success(`E-invoice generated for ${inv.number}`); }}>Generate IRN</Button>}</td>
              </tr>
            );
          })}</tbody></table>
        </CardContent>
      </Card>
      <Card><CardContent className="p-4 text-sm text-muted-foreground">E-invoicing is mandatory in India for businesses with turnover above ₹5 Cr. Each invoice gets an Invoice Reference Number (IRN) from the government portal. The E-way bill is required for goods movement above ₹50,000. This view tracks generation status and lets you generate IRNs for pending invoices.</CardContent></Card>
    </>
  );
}

function AdvancePaymentsView({ me }: { me: string }) {
  const advances = useFinanceStore((s) => s.advancePayments);
  const addAdvance = useFinanceStore((s) => s.addAdvancePayment);
  const [adding, setAdding] = React.useState(false);
  const [vendor, setVendor] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<"Bank transfer" | "UPI" | "Cash" | "Cheque">("Bank transfer");
  const [reference, setReference] = React.useState("");
  const totalAdvances = advances.reduce((s, a) => s + a.amount, 0);
  const totalAdjusted = advances.reduce((s, a) => s + a.adjustedAmount, 0);
  const unadjusted = totalAdvances - totalAdjusted;

  function save() {
    const err = addAdvance({ date: todayIso(), vendor, amount: Number(amount), method, reference }, me);
    if (err) { toast.error(err); return; }
    toast.success("Advance recorded"); setAdding(false); setVendor(""); setAmount(""); setReference("");
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Total Advances" value={money(totalAdvances)} detail={`${advances.length} advance(s)`} />
        <Kpi label="Adjusted" value={money(totalAdjusted)} detail="Against bills" />
        <Kpi label="Unadjusted" value={money(unadjusted)} detail="Pending adjustment" />
      </div>
      <div className="flex justify-end"><Button size="sm" onClick={() => setAdding(true)}>Record advance</Button></div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm"><thead className="border-b border-border bg-surface-2"><tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Date</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Vendor</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Amount</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Adjusted</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Unadjusted</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Method</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Reference</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
          </tr></thead><tbody className="divide-y divide-border">{advances.map((a) => (
            <tr key={a.id}>
              <td className="px-4 py-3 text-xs tabular-nums">{a.date}</td>
              <td className="px-4 py-3 font-medium">{a.vendor}</td>
              <td className="px-4 py-3 text-right tabular-nums">{money(a.amount)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{money(a.adjustedAmount)}</td>
              <td className="px-4 py-3 text-right tabular-nums font-medium">{money(a.amount - a.adjustedAmount)}</td>
              <td className="px-4 py-3"><Badge variant="neutral">{a.method}</Badge></td>
              <td className="px-4 py-3 font-mono text-xs">{a.reference}</td>
              <td className="px-4 py-3"><Badge variant={a.adjustedAmount >= a.amount ? "success" : a.adjustedAmount > 0 ? "warning" : "accent"}>{a.adjustedAmount >= a.amount ? "Fully adjusted" : a.adjustedAmount > 0 ? "Partly adjusted" : "Unadjusted"}</Badge></td>
            </tr>
          ))}</tbody></table>
        </CardContent>
      </Card>
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record advance payment</DialogTitle><DialogDescription>Record an advance paid to a vendor, to be adjusted against future bills.</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Vendor</Label><Input value={vendor} onChange={(e) => setVendor(e.target.value)} /></div>
            <div className="grid gap-3 sm:grid-cols-2"><div><Label>Amount</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
              <div><Label>Method</Label><select className={selectClass} value={method} onChange={(e) => setMethod(e.target.value as typeof method)}><option>Bank transfer</option><option>UPI</option><option>Cash</option><option>Cheque</option></select></div></div>
            <div><Label>Reference</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="NEFT/UTR number" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button><Button onClick={save}>Record advance</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FyClosingView({ me }: { me: string }) {
  const fyClosings = useFinanceStore((s) => s.fyClosings);
  const closeFY = useFinanceStore((s) => s.closeFiscalYear);
  const reopenFY = useFinanceStore((s) => s.reopenFiscalYear);
  const invoices = useFinanceStore((s) => s.invoices);
  const creditNotes = useFinanceStore((s) => s.creditNotes);
  const bills = useFinanceStore((s) => s.bills);
  const expenses = useFinanceStore((s) => s.expenses);
  const pl = profitAndLoss(invoices, creditNotes, bills, expenses);
  const currentFy = fiscalPeriod(todayIso());

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Current FY" value={currentFy.fiscalYear} detail={`Quarter ${currentFy.quarter}`} />
        <Kpi label="Current Year P&L" value={money(pl.profit)} detail={pl.margin !== null ? `${pl.margin}% margin` : "No sales"} />
        <Kpi label="Net Sales" value={money(pl.netSales)} detail="Revenue minus credits" />
        <Kpi label="Total Costs" value={money(pl.costs)} detail="Bills + Expenses + Write-offs" />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Fiscal Year Status</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm"><thead className="border-b border-border bg-surface-2"><tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Fiscal Year</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Closed By</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Closed At</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Retained Earnings</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Opening Balances</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground" />
          </tr></thead><tbody className="divide-y divide-border">{fyClosings.map((fy) => (
            <tr key={fy.id}>
              <td className="px-4 py-3 font-medium">{fy.fiscalYear}</td>
              <td className="px-4 py-3"><Badge variant={fy.status === "closed" ? "success" : fy.status === "closing" ? "warning" : "accent"}>{fy.status}</Badge></td>
              <td className="px-4 py-3 text-xs">{fy.closedBy ?? "—"}</td>
              <td className="px-4 py-3 text-xs tabular-nums">{fy.closedAt ?? "—"}</td>
              <td className="px-4 py-3 text-right tabular-nums font-medium">{money(fy.retainedEarnings)}</td>
              <td className="px-4 py-3"><Badge variant={fy.openingBalancesCarried ? "success" : "neutral"}>{fy.openingBalancesCarried ? "Carried" : "Pending"}</Badge></td>
              <td className="px-4 py-3 space-x-2">{fy.status === "open" && <Button size="sm" variant="outline" onClick={() => { const err = closeFY(fy.fiscalYear, me); if (err) toast.error(err); else toast.success(`FY ${fy.fiscalYear} closed`); }}>Close FY</Button>}{fy.status === "closed" && <Button size="sm" variant="outline" onClick={() => { const err = reopenFY(fy.fiscalYear, me); if (err) toast.error(err); else toast.success(`FY ${fy.fiscalYear} reopened`); }}>Reopen</Button>}</td>
            </tr>
          ))}</tbody></table>
        </CardContent>
      </Card>
      <Card><CardContent className="p-4 text-sm text-muted-foreground">Financial year closing transfers the current year&apos;s profit or loss to retained earnings, carries forward opening balances to the new year, and locks the closed year from further entries. In India the financial year runs April to March. Close the year only after all adjustments, provisions and audit are complete.</CardContent></Card>
    </>
  );
}

function MultiCurrencyView({ me }: { me: string }) {
  const rates = useFinanceStore((s) => s.currencyRates);
  const updateRate = useFinanceStore((s) => s.updateCurrencyRate);
  const invoices = useFinanceStore((s) => s.invoices);
  const totalInrRevenue = invoices.filter((i) => !i.cancelled).reduce((s, i) => s + invoiceTotals(i).taxable, 0);
  const [convertAmt, setConvertAmt] = React.useState("100000");
  const [fromCur, setFromCur] = React.useState("USD");
  const [editCode, setEditCode] = React.useState("");
  const [editRate, setEditRate] = React.useState("");
  const selectedRate = rates.find((r) => r.code === fromCur);
  const converted = selectedRate ? Number(convertAmt) / selectedRate.rateToInr : 0;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Currencies Tracked" value={String(rates.length)} detail="Exchange rates" />
        <Kpi label="Base Currency" value="INR (₹)" detail="Indian Rupee" />
        <Kpi label="Revenue (INR)" value={money(totalInrRevenue)} detail="Domestic currency" />
        <Kpi label="Last Updated" value={rates[0]?.asOf ?? "—"} detail="Rate date" />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Exchange Rates (to INR)</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm"><thead className="border-b border-border bg-surface-2"><tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Currency</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Code</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Symbol</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">1 Unit = INR</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">₹1 Lakh =</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">As Of</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground" />
          </tr></thead><tbody className="divide-y divide-border">{rates.map((r) => (
            <tr key={r.code}>
              <td className="px-4 py-3 font-medium">{r.name}</td>
              <td className="px-4 py-3 font-mono">{r.code}</td>
              <td className="px-4 py-3 text-lg">{r.symbol}</td>
              <td className="px-4 py-3 text-right tabular-nums font-medium">{money(r.rateToInr)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{r.symbol}{(100000 / r.rateToInr).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>
              <td className="px-4 py-3 text-xs">{r.asOf}</td>
              <td className="px-4 py-3"><Button size="sm" variant="outline" onClick={() => { setEditCode(r.code); setEditRate(String(r.rateToInr)); }}>Edit</Button></td>
            </tr>
          ))}</tbody></table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Currency Converter</CardTitle></CardHeader>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div><Label>INR Amount</Label><Input type="number" value={convertAmt} onChange={(e) => setConvertAmt(e.target.value)} className="w-40 tabular-nums" /></div>
            <div><Label>Convert to</Label><select className={selectClass} value={fromCur} onChange={(e) => setFromCur(e.target.value)}>{rates.map((r) => <option key={r.code} value={r.code}>{r.code} — {r.name}</option>)}</select></div>
            <div className="pb-1 text-lg font-semibold tabular-nums">{selectedRate ? `${selectedRate.symbol}${converted.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "—"}</div>
          </div>
        </CardContent>
      </Card>
      <Dialog open={!!editCode} onOpenChange={(open) => { if (!open) setEditCode(""); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Update {editCode}/INR rate</DialogTitle><DialogDescription>Set the current exchange rate for {editCode} to INR.</DialogDescription></DialogHeader>
          <div><Label>Rate (1 {editCode} = ₹)</Label><Input type="number" step="0.01" value={editRate} onChange={(e) => setEditRate(e.target.value)} /></div>
          <DialogFooter><Button variant="outline" onClick={() => setEditCode("")}>Cancel</Button><Button onClick={() => { const err = updateRate(editCode, Number(editRate), me); if (err) { toast.error(err); return; } toast.success(`${editCode} rate updated to ₹${editRate}`); setEditCode(""); }}>Update rate</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PurchaseOrdersView() {
  const purchaseOrders = useOperationsStore((s) => s.purchaseOrders);
  const bills = useFinanceStore((s) => s.bills);
  const totalPOValue = purchaseOrders.reduce((s, po) => s + po.lines.reduce((ls, l) => ls + l.qty * l.rate, 0), 0);
  const billedPOs = new Set(bills.filter((b) => b.poId).map((b) => b.poId));
  const unbilled = purchaseOrders.filter((po) => !billedPOs.has(po.id));

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Total POs" value={String(purchaseOrders.length)} detail="Purchase orders" />
        <Kpi label="Total Value" value={money(totalPOValue)} detail="All PO value" />
        <Kpi label="Billed" value={String(billedPOs.size)} detail="Bill received" />
        <Kpi label="Unbilled" value={String(unbilled.length)} detail="Awaiting bill" />
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm"><thead className="border-b border-border bg-surface-2"><tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">PO #</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Vendor</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Date</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Items</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Value</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Bill Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">3-Way Match</th>
          </tr></thead><tbody className="divide-y divide-border">{purchaseOrders.map((po) => {
            const value = po.lines.reduce((s, l) => s + l.qty * l.rate, 0);
            const bill = bills.find((b) => b.poId === po.id);
            const matchResult = bill ? threeWayMatch(bill.amount - (bill.gst ?? 0), po, workflowRules().matchTolerancePercent) : null;
            return (
              <tr key={po.id}>
                <td className="px-4 py-3 font-mono text-xs">{po.number}</td>
                <td className="px-4 py-3 font-medium">{po.vendor}</td>
                <td className="px-4 py-3 text-xs tabular-nums">{po.date}</td>
                <td className="px-4 py-3 text-xs">{po.lines.length} line{po.lines.length !== 1 ? "s" : ""}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">{money(value)}</td>
                <td className="px-4 py-3"><Badge variant={bill ? "success" : "warning"}>{bill ? `${bill.number}` : "No bill"}</Badge></td>
                <td className="px-4 py-3">{matchResult ? <Badge variant={matchResult.matched ? "success" : "warning"}>{matchResult.matched ? "Matched" : matchResult.status}</Badge> : <span className="text-xs text-muted-foreground">—</span>}</td>
              </tr>
            );
          })}</tbody></table>
        </CardContent>
      </Card>
      <Card><CardContent className="p-4 text-sm text-muted-foreground">Purchase orders created in Operations are matched here with vendor bills for the 3-way match (PO → Goods Receipt → Bill). Payment is released only when all three match within tolerance. This prevents paying for goods not ordered or not received.</CardContent></Card>
    </>
  );
}

function AuditExportView() {
  const trail = useFinanceStore((s) => s.trail);
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const filtered = trail.filter((t) => (!dateFrom || t.at >= dateFrom) && (!dateTo || t.at <= dateTo));

  function exportCsv() {
    const header = "Date,Time,Who,What\n";
    const rows = filtered.map((t) => `${t.at},${t.ts ?? ""},${t.by.replace(/,/g, "")},${t.text.replace(/,/g, " ")}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `audit-trail-${todayIso()}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} entries`);
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Total Entries" value={String(trail.length)} detail="All audit trail" />
        <Kpi label="Filtered" value={String(filtered.length)} detail="In date range" />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div><Label>From</Label><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" /></div>
        <div><Label>To</Label><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" /></div>
        <Button onClick={exportCsv}>Export CSV ({filtered.length} entries)</Button>
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm"><thead className="border-b border-border bg-surface-2"><tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Date</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Who</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Action</th>
          </tr></thead><tbody className="divide-y divide-border">{filtered.slice(0, 50).map((t, i) => (
            <tr key={i}>
              <td className="px-4 py-2 text-xs tabular-nums">{t.at}</td>
              <td className="px-4 py-2 font-medium text-xs">{t.by}</td>
              <td className="px-4 py-2 text-xs">{t.text}</td>
            </tr>
          ))}{filtered.length > 50 && <tr><td className="px-4 py-2 text-xs text-muted-foreground" colSpan={3}>Showing first 50 of {filtered.length} entries. Export CSV for the full log.</td></tr>}</tbody></table>
        </CardContent>
      </Card>
      <Card><CardContent className="p-4 text-sm text-muted-foreground">The audit trail is an immutable log of every financial action — who did what, when. Export it as a CSV for external auditors, compliance reviews or internal controls. Date filters let you narrow the export to a specific period.</CardContent></Card>
    </>
  );
}

function FinanceTrail() {
  const trail = useFinanceStore((state) => state.trail);
  return <TrailPanel entries={trail} />;
}

function OverviewView() {
  const invoices = useFinanceStore((state) => state.invoices);
  const creditNotes = useFinanceStore((state) => state.creditNotes);
  const bills = useFinanceStore((state) => state.bills);
  const expenses = useFinanceStore((state) => state.expenses);
  const topUps = useFinanceStore((state) => state.pettyCashTopUps);
  const bankEntries = useFinanceStore((state) => state.bankEntries);
  const openingCash = useFinanceStore((state) => state.openingCash);
  const live = invoices.filter((invoice) => !invoice.cancelled);
  const invoiced = live.reduce((sum, invoice) => sum + invoiceTotals(invoice).total, 0);
  const collected = invoices.reduce((sum, invoice) => sum + invoice.payments.reduce((s, p) => s + p.amount, 0), 0);
  const outstanding = invoices.reduce((sum, invoice) => sum + dueAmount(invoice, creditNotes), 0);
  const overdue = live.filter((invoice) => invoiceStatus(invoice, creditNotes) === "overdue").reduce((sum, invoice) => sum + dueAmount(invoice, creditNotes), 0);
  const pnl = profitAndLoss(invoices, creditNotes, bills, expenses);
  const owedToVendors = bills.reduce((sum, b) => sum + Math.max(0, b.amount - (b.tds ?? 0) - b.payments.reduce((s, p) => s + p.amount, 0)), 0);
  const flow = cashFlowByMonth(invoices, bills, bankEntries, openingCash, expenses, topUps);
  const closing = flow.length > 0 ? flow[flow.length - 1].closing : openingCash;
  const buckets = ["Current", "1–30 days", "31–60 days", "61–90 days", "90+ days"].map((label) => { const inBucket = invoices.filter((invoice) => agingBucket(invoice, creditNotes) === label); return { label, count: inBucket.length, value: inBucket.reduce((sum, invoice) => sum + dueAmount(invoice, creditNotes), 0) }; });
  const widest = Math.max(1, ...buckets.map((bucket) => bucket.value));
  const to = (view: string, extra: Record<string, string> = {}) => workspaceHref("finance-accounting", view, extra);
  const collectionRate = pnl.netSales > 0 ? Math.round((collected / pnl.netSales) * 100) : 0;

  const expByCategory = new Map<string, number>();
  for (const e of expenses) expByCategory.set(e.category, (expByCategory.get(e.category) ?? 0) + e.amount);
  const sortedExp = [...expByCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxExp = Math.max(1, ...sortedExp.map(([, v]) => v));

  return (
    <>
      {invoices.length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">No invoices yet. Create the first one from Invoices. Finance figures start at zero for a new company.</CardContent></Card>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi label="Revenue (ex-GST)" value={money(pnl.netSales)} detail={`${live.length} invoices`} href={to("income")} />
        <Kpi label="Profit" value={money(pnl.profit)} detail={pnl.margin !== null ? `${pnl.margin}% margin` : undefined} tone={pnl.profit < 0 ? "warning" : undefined} href={to("profit-loss")} />
        <Kpi label="Cash position" value={money(closing)} detail="Closing balance" href={to("cash-flow")} />
        <Kpi label="Overdue" value={money(overdue)} detail={overdue > 0 ? "Receivables past due" : "Nothing late"} tone={overdue > 0 ? "warning" : undefined} href={to("receivables")} />
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi label="Invoiced (incl. GST)" value={money(invoiced)} detail={`Collected ${money(collected)}`} href={to("invoices")} />
        <Kpi label="Outstanding" value={money(outstanding)} detail="Who owes what" href={to("receivables")} />
        <Kpi label="Payables" value={money(owedToVendors)} detail={`${bills.filter((b) => b.payments.reduce((s, p) => s + p.amount, 0) < b.amount - (b.tds ?? 0)).length} bills unpaid`} href={to("payables")} />
        <Kpi label="Collection rate" value={`${collectionRate}%`} detail={`${money(collected)} of ${money(pnl.netSales)}`} tone={collectionRate < 70 ? "warning" : undefined} />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Receivables aging</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-5">
          {buckets.map((bucket, index) => {
            const body = <>
              <p className="text-xs text-muted-foreground">{bucket.label}{bucket.count ? ` · ${bucket.count}` : ""}</p>
              <p className={`mt-1 font-semibold tabular-nums ${index >= 2 && bucket.value > 0 ? "text-danger" : ""}`}>{money(bucket.value)}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className={`h-full rounded-full ${index === 0 ? "bg-accent" : index === 1 ? "bg-amber-500" : "bg-danger"}`} style={{ width: `${bucket.value ? Math.max(4, (bucket.value / widest) * 100) : 0}%` }} /></div>
            </>;
            return bucket.count ? <Link key={bucket.label} href={to("invoices", { aging: bucket.label })} title={`Open the ${bucket.count} invoice${bucket.count === 1 ? "" : "s"} ${bucket.label === "Current" ? "not yet due" : `${bucket.label} late`}`} className="rounded-md border border-border p-3 transition-colors hover:border-accent-border hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{body}</Link>
              : <div key={bucket.label} className="rounded-md border border-border p-3">{body}</div>;
          })}
        </CardContent>
      </Card>
      {sortedExp.length > 0 && <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0"><CardTitle className="text-base">Top expenses by category</CardTitle><Button size="sm" variant="outline" asChild><Link href={to("expenses")}>All expenses</Link></Button></CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {sortedExp.map(([cat, amt]) => <div key={cat} className="grid gap-1">
            <div className="flex justify-between text-sm"><span>{cat}</span><span className="tabular-nums">{money(amt)}</span></div>
            <div className="h-1.5 bg-surface-2"><div className="h-1.5 bg-accent" style={{ width: `${(amt / maxExp) * 100}%` }} /></div>
          </div>)}
        </CardContent>
      </Card>}
      <BalanceSheetCard />
      <PayrollOverviewCard />
      <p className="text-xs text-muted-foreground">Revenue is ex-GST from non-cancelled invoices. Outstanding subtracts payments and approved credit notes. Cash position includes all bank movements.</p>
    </>
  );
}

function PayrollOverviewCard() {
  const payrollRuns = useHrPeopleStore((state) => state.payrollRuns);
  const expenseClaims = useHrPeopleStore((state) => state.expenseClaims);
  const latest = payrollRuns[0];
  const locked = payrollRuns.filter((r) => r.status === "locked");
  const monthlyNet = latest?.net ?? 0;
  const approved = expenseClaims.filter((c) => c.status === "approved");
  const to = (view: string) => workspaceHref("finance-accounting", view);
  if (!latest && approved.length === 0) return null;
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">HR costs</CardTitle>
        <Button size="sm" variant="outline" asChild><Link href={to("hr-costs")}>View details</Link></Button>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
        {latest ? <div><p className="text-xs text-muted-foreground">Latest payroll ({latest.status})</p><p className="mt-1 font-semibold tabular-nums">{money(monthlyNet)} net</p></div> : null}
        <div><p className="text-xs text-muted-foreground">Total payroll (locked)</p><p className="mt-1 font-semibold tabular-nums">{money(locked.reduce((sum, r) => sum + r.net, 0))}</p></div>
        {approved.length > 0 ? <div><p className="text-xs text-muted-foreground">Reimbursements awaiting payment</p><p className="mt-1 font-semibold tabular-nums text-warning">{money(approved.reduce((sum, c) => sum + c.amount, 0))} · {approved.length} claims</p></div> : <div><p className="text-xs text-muted-foreground">Reimbursements awaiting payment</p><p className="mt-1 text-muted-foreground">None</p></div>}
      </CardContent>
    </Card>
  );
}

function InvoicesView({ me }: { me: string }) {
  React.useEffect(() => {
    syncInvoices().catch((error: unknown) => toast.warning(`Invoices not loaded from the server: ${message(error)}`));
  }, []);
  const invoices = useFinanceStore((state) => state.invoices);
  const creditNotes = useFinanceStore((state) => state.creditNotes);
  const params = useSearchParams();
  // "Raise the invoice" on a won deal opens this with the deal chosen.
  const fromDeal = params.get("deal") ?? "";
  const [creating, setCreating] = React.useState(Boolean(fromDeal));
  const [paying, setPaying] = React.useState<Invoice | null>(null);
  const [selected, setSelected] = React.useState<Invoice | null>(null);
  type Show = "all" | "unpaid" | "overdue" | "paid";
  const [show, setShow] = React.useState<Show>(() => { const asked = params.get("status"); return asked === "unpaid" || asked === "overdue" || asked === "paid" ? asked : "all"; });
  const [aging, setAging] = React.useState(() => params.get("aging") ?? "");
  const [find, setFind] = React.useState(() => params.get("q") ?? "");
  const live = invoices.filter((invoice) => !invoice.cancelled);
  const statusOf = (invoice: Invoice) => invoiceStatus(invoice, creditNotes);
  const counts = { all: invoices.length, unpaid: live.filter((invoice) => statusOf(invoice) !== "paid").length, overdue: live.filter((invoice) => statusOf(invoice) === "overdue").length, paid: invoices.filter((invoice) => statusOf(invoice) === "paid").length };
  const term = find.trim().toLowerCase();
  const shown = invoices.filter((invoice) => {
    const status = statusOf(invoice);
    if (show === "unpaid" && (status === "paid" || invoice.cancelled)) return false;
    if (show === "overdue" && (status !== "overdue" || invoice.cancelled)) return false;
    if (show === "paid" && status !== "paid") return false;
    if (aging && agingBucket(invoice, creditNotes) !== aging) return false;
    return !term || `${invoice.number} ${invoice.customer} ${invoice.customerCompany ?? ""}`.toLowerCase().includes(term);
  });
  const shownDue = shown.reduce((sum, invoice) => sum + dueAmount(invoice, creditNotes), 0);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips<Show> label="Show invoices" value={show} onChange={(value) => { setShow(value); setAging(""); }} options={[{ value: "all", label: "All", count: counts.all }, { value: "unpaid", label: "Unpaid", count: counts.unpaid }, { value: "overdue", label: "Overdue", count: counts.overdue, tone: "warning" }, { value: "paid", label: "Paid", count: counts.paid }]} />
        <Input aria-label="Find an invoice" placeholder="Find by number or customer" value={find} onChange={(event) => setFind(event.target.value)} className="h-8 w-full max-w-[240px]" />
      </div>
      {aging ? <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">Showing invoices {aging === "Current" ? "not yet due" : `${aging} late`}.<button type="button" className="text-accent hover:underline" onClick={() => setAging("")}>Show all ages</button></p> : null}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Each invoice carries GST: same state splits into CGST and SGST, another state uses IGST.</p>
        <Button size="sm" onClick={() => setCreating(true)}>New invoice</Button>
      </div>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="px-4 py-2">Invoice</th><th className="px-4 py-2">Customer</th><th className="px-4 py-2">Date</th><th className="px-4 py-2">Due</th><th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2 text-right">Due now</th><th className="px-4 py-2">Status</th><th className="px-4 py-2" /></tr></thead>
            <tbody>
              {invoices.length === 0 ? <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">No invoices yet.</td></tr> : null}
              {invoices.length > 0 && shown.length === 0 ? <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">No invoice matches. <button type="button" className="text-accent hover:underline" onClick={() => { setShow("all"); setAging(""); setFind(""); }}>Show all</button></td></tr> : null}
              {shown.map((invoice) => {
                const status = invoiceStatus(invoice, creditNotes);
                return (
                  <tr key={invoice.id} onClick={(event) => rowClick(event, () => setSelected(invoice))} className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-surface-2">
                    <td className="px-4 py-3 font-medium"><button className="hover:underline" onClick={() => setSelected(invoice)}>{invoice.number}</button></td>
                    <td className="px-4 py-3">{invoice.customer}<span className="block text-xs text-muted-foreground">{invoice.customerCompany}</span></td>
                    <td className="px-4 py-3 text-muted-foreground">{invoice.date}</td>
                    <td className="px-4 py-3 text-muted-foreground">{invoice.dueDate}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(invoiceTotals(invoice).total)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(dueAmount(invoice, creditNotes))}</td>
                    <td className="px-4 py-3"><Badge variant={status === "overdue" ? "warning" : status === "paid" ? "success" : "neutral"}>{status}</Badge></td>
                    <td className="px-4 py-3 text-right"><div className="flex justify-end gap-1">{status !== "paid" && <Button size="sm" variant="secondary" onClick={() => setPaying(invoice)}>Record payment</Button>}{status === "overdue" ? <Button size="sm" variant="ghost" asChild><Link href={`/workspace/finance-accounting?view=credit-notes&workspace=finance-accounting&invoice=${invoice.id}&kind=write-off`}>Write off</Link></Button> : null}</div></td>
                  </tr>
                );
              })}
            </tbody>
            {shown.length > 1 && (show !== "all" || aging || term) ? <tfoot><tr className="border-t border-border bg-surface-2 text-sm font-medium"><td className="px-4 py-2" colSpan={5}>{shown.length} invoices shown</td><td className="px-4 py-2 text-right tabular-nums">{money(shownDue)}</td><td colSpan={2} /></tr></tfoot> : null}
          </table>
        </CardContent>
      </Card>
      {creating ? <NewInvoiceDialog me={me} initialDeal={fromDeal} onClose={() => setCreating(false)} /> : null}
      {paying ? <PaymentDialog invoice={paying} onClose={() => setPaying(null)} /> : null}
      {selected ? <InvoiceDetail invoice={selected} onClose={() => setSelected(null)} /> : null}
    </>
  );
}

function NewInvoiceDialog({ me, initialDeal = "", onClose }: { me: string; initialDeal?: string; onClose: () => void }) {
  const session = useSession();
  const canCreate = can(session, "billing:manage");
  const [customer, setCustomer] = React.useState("");
  const [customerCompany, setCustomerCompany] = React.useState("");
  const [dealId, setDealId] = React.useState("");
  const links = useCrmLinkOptions();
  const [sameState, setSameState] = React.useState(true);
  const [dueDays, setDueDays] = React.useState("30");
  const [lines, setLines] = React.useState<InvoiceLine[]>([{ item: "", hsn: "", qty: 1, rate: 0, gstRate: 18 }]);
  const [error, setError] = React.useState("");
  // The company's deals with their figures, won first: choosing one fills in who and what is invoiced.
  const crmDeals = useApi<ApiDeal[]>("/deals?limit=100&after_id=0");
  const dealChoices = [...(crmDeals.data ?? [])].sort((a, b) => Number(b.stage === "won") - Number(a.stage === "won")).map((d) => ({ id: d.id, label: `${d.name} · ${d.customerName}${d.stage === "won" ? " · won" : ` · ${d.stage}`}` }));
  const chooseDeal = React.useCallback((id: string) => {
    setDealId(id);
    const deal = crmDeals.data?.find((item) => item.id === id);
    if (!deal) return;
    setCustomer(deal.customerName);
    setCustomerCompany(deal.company ?? "");
    setLines((current) => current.length === 1 && !current[0].item.trim() && !current[0].rate ? [{ ...current[0], item: deal.name, qty: 1, rate: Number(deal.amount) }] : current);
  }, [crmDeals.data]);
  const [chosenInitial, setChosenInitial] = React.useState(false);
  if (initialDeal && !chosenInitial && crmDeals.data) { setChosenInitial(true); chooseDeal(initialDeal); }
  const today = todayIso();
  const due = new Date(Date.parse(today) + Number(dueDays || 0) * 86400000).toISOString().slice(0, 10);
  const preview = invoiceTotals({ sameState, lines, id: "", number: "", customer, customerCompany, date: today, dueDate: due, payments: [], createdBy: me });

  function update(index: number, patch: Partial<InvoiceLine>) {
    setLines((current) => current.map((line, i) => i === index ? { ...line, ...patch } : line));
  }
  async function save() {
    if (customer.trim().length < 2) return setError("Enter the customer name.");
    if (lines.some((line) => line.item.trim().length < 2 || !/^\d{4,8}$/.test(line.hsn.trim()) || line.qty <= 0 || line.rate <= 0)) return setError("Each line needs an item, an HSN code (4 to 8 digits), a quantity and a rate above zero.");
    const locked = periodLockProblem(today);
    if (locked) return setError(locked);
    const created = await createInvoice({ customer: customer.trim(), customerCompany: customerCompany.trim(), dealId: dealId || undefined, date: today, dueDate: due, sameState, lines: lines.map((line) => ({ ...line, item: line.item.trim(), hsn: line.hsn.trim() })) }, me);
    if (created.error) return setError(created.error);
    toast.success(`Invoice ${created.number} created`);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>New invoice</DialogTitle><DialogDescription>GST tax invoice. Choose whether the customer is in the same state.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5"><Label htmlFor="inv-customer">Customer</Label><Input id="inv-customer" value={customer} onChange={(e) => setCustomer(e.target.value)} /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="inv-company">Company</Label><Input id="inv-company" value={customerCompany} onChange={(e) => setCustomerCompany(e.target.value)} /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="inv-deal">CRM deal (optional)</Label><select id="inv-deal" className={selectClass} value={dealId} onChange={(e) => chooseDeal(e.target.value)}><option value="">None</option>{dealChoices.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="inv-supply">Place of supply</Label><select id="inv-supply" className={selectClass} value={sameState ? "same" : "other"} onChange={(e) => setSameState(e.target.value === "same")}><option value="same">Same state (CGST + SGST)</option><option value="other">Other state (IGST)</option></select></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="inv-due">Payment due in (days)</Label><Input id="inv-due" type="number" min={0} value={dueDays} onChange={(e) => setDueDays(e.target.value)} /></div>
        </div>
        <div className="flex flex-col gap-2">
          {lines.map((line, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[2fr_1fr_0.8fr_1fr_1fr_auto]">
              <Input aria-label={`Item ${index + 1}`} placeholder="Item" value={line.item} onChange={(e) => update(index, { item: e.target.value })} />
              <Input aria-label={`HSN ${index + 1}`} placeholder="HSN" value={line.hsn} onChange={(e) => update(index, { hsn: e.target.value })} />
              <Input aria-label={`Quantity ${index + 1}`} type="number" min={0} value={line.qty} onChange={(e) => update(index, { qty: Number(e.target.value) })} />
              <Input aria-label={`Rate ${index + 1}`} type="number" min={0} value={line.rate} onChange={(e) => update(index, { rate: Number(e.target.value) })} />
              <select aria-label={`GST rate ${index + 1}`} className={selectClass} value={line.gstRate} onChange={(e) => update(index, { gstRate: Number(e.target.value) })}>{GST_RATES.map((rate) => <option key={rate} value={rate}>GST {rate}%</option>)}</select>
              <Button variant="ghost" size="sm" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, i) => i !== index))}>Remove</Button>
            </div>
          ))}
          <Button variant="secondary" size="sm" className="w-fit" onClick={() => setLines((current) => [...current, { item: "", hsn: "", qty: 1, rate: 0, gstRate: 18 }])}>Add line</Button>
        </div>
        <div className="grid gap-1 rounded-md bg-surface-2 p-3 text-sm tabular-nums">
          <div className="flex justify-between"><span>Taxable value</span><span>{money(preview.taxable)}</span></div>
          {sameState ? <><div className="flex justify-between"><span>CGST</span><span>{money(preview.cgst)}</span></div><div className="flex justify-between"><span>SGST</span><span>{money(preview.sgst)}</span></div></> : <div className="flex justify-between"><span>IGST</span><span>{money(preview.igst)}</span></div>}
          <div className="flex justify-between font-semibold"><span>Total</span><span>{money(preview.total)}</span></div>
        </div>
        {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
        <DialogFooter><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!canCreate} title={canCreate ? undefined : "Needs the billing:manage permission"} onClick={save}>Create invoice</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentDialog({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const session = useSession();
  const me = session.user.name ?? session.user.email ?? "You";
  const creditNotes = useFinanceStore((state) => state.creditNotes);
  const due = dueAmount(invoice, creditNotes);
  const [amount, setAmount] = React.useState(String(due));
  const [method, setMethod] = React.useState<"UPI" | "Bank transfer" | "Cash" | "Cheque">("UPI");
  const [reference, setReference] = React.useState("");
  const [error, setError] = React.useState("");
  async function save() {
    if (reference.trim().length < 3) return setError("Enter the payment reference (UTR, cheque number or receipt).");
    const problem = await recordInvoicePayment(invoice.id, { amount: Number(amount), method, reference: reference.trim(), date: todayIso() }, me);
    if (problem) return setError(problem);
    toast.success("Payment recorded");
    onClose();
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Record payment</DialogTitle><DialogDescription>{invoice.number} · {money(due)} still due</DialogDescription></DialogHeader>
        <div className="grid gap-3">
          <div className="flex flex-col gap-1.5"><Label htmlFor="pay-amount">Amount (₹)</Label><Input id="pay-amount" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="pay-method">Method</Label><select id="pay-method" className={selectClass} value={method} onChange={(e) => setMethod(e.target.value as typeof method)}><option>UPI</option><option>Bank transfer</option><option>Cash</option><option>Cheque</option></select></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="pay-ref">Reference</Label><Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR, cheque no. or receipt no." /></div>
          {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
        </div>
        <DialogFooter><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Record payment</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InvoiceDetail({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const creditNotes = useFinanceStore((state) => state.creditNotes);
  const links = useCrmLinkOptions();
  const deal = linkedLabel(links.deals, invoice.dealId);
  const session = useSession();
  const me = session.user.name ?? session.user.email ?? "You";
  const totals = invoiceTotals(invoice);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{invoice.number}</DialogTitle><DialogDescription>{invoice.customer}, {invoice.customerCompany} · due {invoice.dueDate}{deal ? ` · deal: ${deal}` : ""}</DialogDescription></DialogHeader>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="py-2">Item</th><th>HSN</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">GST</th></tr></thead>
          <tbody>{invoice.lines.map((line, i) => <tr key={i} className="border-b border-border last:border-0"><td className="py-2">{line.item}</td><td>{line.hsn}</td><td className="text-right">{line.qty}</td><td className="text-right tabular-nums">{money(line.rate)}</td><td className="text-right">{line.gstRate}%</td></tr>)}</tbody>
        </table>
        <div className="grid gap-1 text-sm tabular-nums">
          <div className="flex justify-between"><span>Taxable value</span><span>{money(totals.taxable)}</span></div>
          {invoice.sameState ? <><div className="flex justify-between"><span>CGST</span><span>{money(totals.cgst)}</span></div><div className="flex justify-between"><span>SGST</span><span>{money(totals.sgst)}</span></div></> : <div className="flex justify-between"><span>IGST</span><span>{money(totals.igst)}</span></div>}
          <div className="flex justify-between font-semibold"><span>Total</span><span>{money(totals.total)}</span></div>
          <div className="flex justify-between"><span>Paid</span><span>{money(invoice.payments.reduce((s, p) => s + p.amount, 0))}</span></div>
          <div className="flex justify-between"><span>Credited (approved)</span><span>{money(creditNotes.filter((n) => n.invoiceId === invoice.id && n.status === "approved").reduce((s, n) => s + n.amount, 0))}</span></div>
          <div className="flex justify-between font-semibold"><span>Due now</span><span>{money(dueAmount(invoice, creditNotes))}</span></div>
        </div>
        <div className="border-t border-border pt-3"><p className="mb-2 text-sm font-medium">Documents</p><RecordDocuments recordKind="invoice" recordId={invoice.id} addedBy={me} today={todayIso()} /></div>
        <p className="text-xs text-muted-foreground">Created by {invoice.createdBy}. Tax rules to be confirmed by the company&apos;s accountant before filing.</p>
        <DialogFooter><Button variant="secondary" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreditNotesView({ me }: { me: string }) {
  React.useEffect(() => {
    syncInvoices().catch((error: unknown) => toast.warning(`Credit notes not loaded from the server: ${message(error)}`));
  }, []);
  const invoices = useFinanceStore((state) => state.invoices);
  const creditNotes = useFinanceStore((state) => state.creditNotes);
  // The invoices view links an overdue invoice here with the invoice and type already chosen.
  const params = useSearchParams();
  const [invoiceId, setInvoiceId] = React.useState(() => params.get("invoice") ?? "");
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [date] = React.useState(todayIso());
  const [ticketId, setTicketId] = React.useState("");
  const [kind, setKind] = React.useState<"credit" | "write-off">(() => (params.get("kind") === "write-off" ? "write-off" : "credit"));
  const [docsFor, setDocsFor] = React.useState<CreditNote | null>(null);
  const links = useCrmLinkOptions();
  const invoice = invoices.find((item) => item.id === invoiceId);

  async function create() {
    const problem = await raiseCreditNote({ invoiceId, amount: Number(amount), reason, date, ticketId: ticketId || undefined, kind }, me);
    if (problem) return toast.error(problem);
    toast.success(kind === "write-off" ? "Write-off raised. It takes effect once approved by someone else." : "Credit note raised. It takes effect once approved by someone else.");
    setAmount(""); setReason(""); setTicketId("");
  }
  return (
    <>
      <Dialog open={docsFor !== null} onOpenChange={(open) => !open && setDocsFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Documents for {docsFor?.number}</DialogTitle><DialogDescription>Approval notes, the customer&apos;s letter or the stock report behind this credit note.</DialogDescription></DialogHeader>
          {docsFor ? <RecordDocuments recordKind="credit-note" recordId={docsFor.id} addedBy={me} today={todayIso()} /> : null}
        </DialogContent>
      </Dialog>
      <Card>
        <CardHeader><CardTitle className="text-base">Raise a credit note</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-xs text-muted-foreground">Credit notes refer to an original invoice. They reduce what the customer owes once approved. Another person must approve, not the one who raised it. A write-off clears debt the customer will not pay; it is booked as bad debt in profit and loss, not as a cut to sales.</p>
          <div className="flex flex-col gap-1.5 sm:w-64"><Label htmlFor="cn-kind">Type</Label><select id="cn-kind" className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as "credit" | "write-off")}><option value="credit">Credit note</option><option value="write-off">Write off bad debt</option></select></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5"><Label htmlFor="cn-invoice">Invoice</Label><select id="cn-invoice" className={selectClass} value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}><option value="">Choose…</option>{invoices.map((item) => <option key={item.id} value={item.id}>{item.number} · {item.customer}</option>)}</select></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="cn-amount">Amount (₹, incl. GST)</Label><Input id="cn-amount" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="cn-reason">Reason</Label><Input id="cn-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. 4 cartons damaged in transit" /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="cn-ticket">Support ticket (optional)</Label><select id="cn-ticket" className={selectClass} value={ticketId} onChange={(e) => setTicketId(e.target.value)}><option value="">None</option>{links.openTickets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div>
          </div>
          {invoice ? <p className="text-xs text-muted-foreground">Invoice total {money(invoiceTotals(invoice).total)}.</p> : null}
          <Button className="w-fit" disabled={!invoiceId || !amount || !reason} onClick={create}>{kind === "write-off" ? "Raise write-off" : "Raise credit note"}</Button>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="px-4 py-2">Credit note</th><th className="px-4 py-2">Invoice</th><th className="px-4 py-2">Reason</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2">Status</th><th className="px-4 py-2" /></tr></thead>
            <tbody>
              {creditNotes.length === 0 ? <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No credit notes yet.</td></tr> : null}
              {creditNotes.map((note) => {
                const original = invoices.find((item) => item.id === note.invoiceId);
                return (
                  <tr key={note.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium">{note.number}{note.kind === "write-off" ? <span className="block text-xs font-normal text-muted-foreground">Bad debt write-off</span> : null}</td>
                    <td className="px-4 py-3">{original?.number ?? "—"}{linkedLabel(links.tickets, note.ticketId) ? <span className="block text-xs text-muted-foreground">{linkedLabel(links.tickets, note.ticketId)}</span> : null}</td>
                    <td className="px-4 py-3 text-muted-foreground">{note.reason}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(note.amount)}</td>
                    <td className="px-4 py-3"><Badge variant={note.status === "approved" ? "success" : note.status === "rejected" ? "danger" : "warning"}>{note.status}</Badge></td>
                    <td className="px-4 py-3 text-right"><Button size="sm" variant="ghost" onClick={() => setDocsFor(note)}>Documents</Button>{note.status === "pending" ? (note.createdBy === me ? <span className="text-xs text-muted-foreground" title="The person who raised a credit note cannot approve it.">Raised by you</span> : <Button size="sm" variant="secondary" onClick={async () => { const problem = await approveCreditNote(note.id, me); if (problem) toast.error(problem); else toast.success("Credit note approved"); }}>Approve</Button>) : <span className="text-xs text-muted-foreground">by {note.approvedBy}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}

function FundsView({ me }: { me: string }) {
  const lines = useFinanceStore((state) => state.budgetLines);
  const requests = useFinanceStore((state) => state.fundRequests);
  const draws = useFinanceStore((state) => state.draws);
  React.useEffect(() => {
    // The balances shown are the server's. Lines that only exist on this screen are created on the server.
    syncBudgetLines().catch((error: unknown) => toast.warning(`Budget not loaded from the server: ${message(error)}`));
    syncFundRequests().catch((error: unknown) => toast.warning(`Fund requests not loaded from the server: ${message(error)}`));
  }, []);
  const [purpose, setPurpose] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [lineId, setLineId] = React.useState("");
  const [drawLine, setDrawLine] = React.useState("");
  const [drawAmount, setDrawAmount] = React.useState("");
  const [drawNote, setDrawNote] = React.useState("");
  const [rejecting, setRejecting] = React.useState<FundRequest | null>(null);
  const [reason, setReason] = React.useState("");
  const addBudgetLine = useFinanceStore((state) => state.addBudgetLine);
  const [lineName, setLineName] = React.useState("");
  const [lineOwner, setLineOwner] = React.useState(me);
  const [lineAllocated, setLineAllocated] = React.useState("");

  const statusTone = (status: FundRequest["status"]) => status === "approved" ? "success" : status === "rejected" ? "danger" : "warning";
  const statusLabel = (status: FundRequest["status"]) => status === "awaiting_finance" ? "awaiting finance" : status;

  function createLine(event: React.FormEvent) {
    event.preventDefault();
    const allocated = Number(lineAllocated);
    if (lineName.trim().length < 2) return toast.error("Name the budget line.");
    if (!(allocated > 0)) return toast.error("Enter the amount the line may spend.");
    addBudgetLine({ name: lineName.trim(), owner: lineOwner.trim() || me, allocated });
    syncBudgetLines()
      .then(() => { setLineName(""); setLineAllocated(""); toast.success(`${lineName.trim()} is on the budget.`); })
      .catch((error: unknown) => toast.error(`The budget line was not saved: ${message(error)}`));
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Add a budget line</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={createLine} className="grid gap-3 sm:grid-cols-4">
            <div className="flex flex-col gap-1.5"><Label htmlFor="line-name">Name</Label><Input id="line-name" value={lineName} onChange={(e) => setLineName(e.target.value)} placeholder="e.g. Sales and marketing" /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="line-owner">Owner</Label><Input id="line-owner" value={lineOwner} onChange={(e) => setLineOwner(e.target.value)} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="line-allocated">Amount (₹)</Label><Input id="line-allocated" type="number" min="1" value={lineAllocated} onChange={(e) => setLineAllocated(e.target.value)} /></div>
            <div className="flex items-end"><Button type="submit" disabled={lineName.trim().length < 2 || !(Number(lineAllocated) > 0)}>Add budget line</Button></div>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">Projects, fund requests and requisitions draw from a budget line, so add one before them.</p>
        </CardContent>
      </Card>
      <div className="grid gap-3 sm:grid-cols-3">
        {lines.map((line) => (
          <Card key={line.id}><CardContent className="p-4">
            <p className="text-sm font-medium">{line.name}</p>
            <p className="text-xs text-muted-foreground">Owner: {line.owner}</p>
            <p className="mt-2 text-sm tabular-nums">{money(line.drawn)} of {money(line.allocated)} used</p>
            <p className="text-xs text-muted-foreground">Left: {money(line.allocated - line.drawn)}</p>
          </CardContent></Card>
        ))}
        {lines.length === 0 ? <p className="text-sm text-muted-foreground">No budget lines yet. Approved fund requests add to a line.</p> : null}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Request funds</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-xs text-muted-foreground">Up to {money(FUND_OWNER_LIMIT)} the owner approves. Above that, a second approval from finance is needed. You cannot approve your own request.</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="flex flex-col gap-1.5 sm:col-span-2"><Label htmlFor="fr-purpose">Purpose</Label><Input id="fr-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="fr-amount">Amount (₹)</Label><Input id="fr-amount" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="fr-line">Budget line</Label><select id="fr-line" className={selectClass} value={lineId} onChange={(e) => setLineId(e.target.value)}><option value="">Choose…</option>{lines.map((line) => <option key={line.id} value={line.id}>{line.name}</option>)}</select></div>
          </div>
          <Button className="w-fit" disabled={purpose.trim().length < 3 || !(Number(amount) > 0) || !lineId} onClick={async () => { const p = await addFundRequest({ purpose: purpose.trim(), amount: Number(amount), lineId, date: todayIso() }, me); if (p) { toast.error(p); return; } toast.success("Fund request sent for approval"); setPurpose(""); setAmount(""); }}>Send request</Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="px-4 py-2">Request</th><th className="px-4 py-2">Line</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2">Requested by</th><th className="px-4 py-2">Status</th><th className="px-4 py-2" /></tr></thead>
            <tbody>
              {requests.length === 0 ? <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No fund requests yet.</td></tr> : null}
              {requests.map((request) => {
                const line = lines.find((item) => item.id === request.lineId);
                const open = request.status === "pending" || request.status === "awaiting_finance";
                return (
                  <tr key={request.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3"><span className="font-medium">{request.number}</span><span className="block text-xs text-muted-foreground">{request.purpose}</span></td>
                    <td className="px-4 py-3">{line?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(request.amount)}</td>
                    <td className="px-4 py-3">{request.requestedBy}</td>
                    <td className="px-4 py-3"><Badge variant={statusTone(request.status)}>{statusLabel(request.status)}</Badge>{request.rejectedReason ? <span className="block text-xs text-muted-foreground">{request.rejectedReason}</span> : null}</td>
                    <td className="px-4 py-3 text-right">
                      {open ? (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="secondary" onClick={async () => { const p = await approveFundRequest(request.id, request.status === "pending" ? "owner" : "finance", me); if (p) toast.error(p); else toast.success("Approved"); }}>{request.status === "pending" ? "Owner approve" : "Finance approve"}</Button>
                          <Button size="sm" variant="ghost" onClick={() => setRejecting(request)}>Reject</Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Record spend against a line</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="flex flex-col gap-1.5"><Label htmlFor="dr-line">Line</Label><select id="dr-line" className={selectClass} value={drawLine} onChange={(e) => setDrawLine(e.target.value)}><option value="">Choose…</option>{lines.map((line) => <option key={line.id} value={line.id}>{line.name}</option>)}</select></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="dr-amount">Amount (₹)</Label><Input id="dr-amount" type="number" min={0} value={drawAmount} onChange={(e) => setDrawAmount(e.target.value)} /></div>
            <div className="flex flex-col gap-1.5 sm:col-span-2"><Label htmlFor="dr-note">Note</Label><Input id="dr-note" value={drawNote} onChange={(e) => setDrawNote(e.target.value)} /></div>
          </div>
          <Button className="w-fit" disabled={!drawLine || !(Number(drawAmount) > 0) || drawNote.trim().length < 3} onClick={async () => { const p = await moveBudget("draw", drawLine, Number(drawAmount), drawNote.trim(), me, todayIso()); if (p) return toast.error(p); toast.success("Spend recorded"); setDrawAmount(""); setDrawNote(""); }}>Record spend</Button>
          {draws.length > 0 ? <ul className="text-xs text-muted-foreground">{draws.slice(0, 5).map((draw) => <li key={draw.id}>{draw.date} · {lines.find((l) => l.id === draw.lineId)?.name} · {draw.amount < 0 ? `Released ${money(-draw.amount)}` : money(draw.amount)} · {draw.note} · by {draw.by}</li>)}</ul> : null}
        </CardContent>
      </Card>

      {rejecting ? (
        <Dialog open onOpenChange={(open) => !open && setRejecting(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Reject {rejecting.number}</DialogTitle><DialogDescription>Give a reason, so the requester knows what to change.</DialogDescription></DialogHeader>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
            <DialogFooter><Button variant="secondary" onClick={() => setRejecting(null)}>Cancel</Button><Button disabled={reason.trim().length < 3} onClick={async () => { const p = await rejectFundRequest(rejecting.id, reason.trim(), me); setRejecting(null); setReason(""); if (p) toast.error(p); else toast.success("Request rejected"); }}>Reject request</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      <p className="text-xs text-muted-foreground"><Link href="/workspace/hr-people?view=expenses&workspace=hr-people" className="underline">Expense claims</Link> are approved in HR &amp; People.</p>
    </>
  );
}
