"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/components/auth/session-provider";
import { hasPermission } from "@/lib/demo-persona";
import { TrailPanel } from "@/components/shared/audit-trail-panel";
import { MoneyApprovalsQueue } from "@/components/approvals/money-approvals-queue";
import { PeriodLockView } from "@/components/finance/period-lock-view";
import { periodLockProblem, usePeriodLockStore } from "@/lib/stores/period-lock-store";
import { monthEnd, monthEndChecks } from "@/lib/month-end";
import { EXPENSE_CATEGORIES, gstSummary, pettyCashBalance } from "@/lib/stores/finance-store";
import { linkedLabel, useCrmLinkOptions } from "@/lib/record-links";
import { RecordDocuments } from "@/components/shared/record-documents";
import { useOperationsStore } from "@/lib/stores/operations-store";
import { useVendorsStore } from "@/lib/stores/vendors-store";
import { threeWayMatch } from "@/lib/three-way-match";
import { workflowRules } from "@/lib/stores/workflow-rules-store";
import { FUND_OWNER_LIMIT, GST_RATES, agingBucket, dueAmount, bookPayments, cashFlowByMonth, fiscalPeriod, invoiceStatus, invoiceTotals, profitAndLoss, useFinanceStore, type CreditNote, type FundRequest, type Invoice, type InvoiceLine } from "@/lib/stores/finance-store";

const money = (value: number) => `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const selectClass = "h-9 w-full rounded-md border border-input bg-surface px-3 text-sm";

/** Views that are not built yet. They say so instead of showing empty tables. */
const comingSoon: Record<string, string> = {
};

export function FinanceWorkspace() {
  const session = useSession();
  const searchParams = useSearchParams();
  const view = searchParams.get("view") ?? "overview";
  const me = session.user.name ?? session.user.email ?? "You";
  const invoices = useFinanceStore((state) => state.invoices);
  const creditNotes = useFinanceStore((state) => state.creditNotes);
  const titles: Record<string, string> = { overview: "Finance overview", invoices: "Invoices", "credit-notes": "Credit notes", funds: "Fund requests & budgets", approvals: "Approvals queue", periods: "Period locks", payables: "Bills & payables", "profit-loss": "Profit & loss", budgets: "Budgets by quarter", "cash-flow": "Cash flow", reconciliation: "Bank reconciliation", "month-end": "Month-end close", expenses: "Expenses & petty cash", gst: "GST summary", reports: "Financial reports" };

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
        {view === "reports" && <ReportsView />}
        {!["invoices", "credit-notes", "funds", "approvals", "periods", "payables", "profit-loss", "budgets", "cash-flow", "reconciliation", "month-end", "expenses", "gst", "reports"].includes(view) && <OverviewView />}
        {!["invoices", "credit-notes", "funds", "approvals", "periods", "payables", "profit-loss", "budgets", "cash-flow", "reconciliation", "month-end", "expenses", "gst", "reports"].includes(view) && <FinanceTrail />}
      </div>
    </div>
  );
}

/** Vendor bills: what the company owes, when it is due, and what has been paid so far. */
function PayablesView({ me }: { me: string }) {
  const bills = useFinanceStore((state) => state.bills);
  const addBill = useFinanceStore((state) => state.addBill);
  const recordBillPayment = useFinanceStore((state) => state.recordBillPayment);
  const [vendor, setVendor] = React.useState("");
  const [vendorBillNo, setVendorBillNo] = React.useState("");
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
  const today = "2026-10-23";

  function create() {
    const problem = addBill({ vendor, vendorBillNo, date: today, dueDate, amount: Number(amount), poId: poId || undefined }, me);
    if (problem) return toast.error(problem);
    toast.success("Bill recorded");
    setVendor(""); setVendorBillNo(""); setAmount(""); setPoId("");
  }

  function pay(billId: string) {
    const problem = recordBillPayment(billId, { amount: Number(payAmounts[billId]), method: "Bank transfer", reference: "Paid from Payables", date: today }, me);
    if (problem) return toast.error(problem);
    toast.success("Payment recorded");
    setPayAmounts((current) => ({ ...current, [billId]: "" }));
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Record a bill</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-xs text-muted-foreground">A bill is what the company owes a vendor. Pay it in one or more payments; each payment cannot be more than the amount still owed.</p>
          <div className="grid gap-3 sm:grid-cols-5">
            <div className="flex flex-col gap-1.5"><Label htmlFor="bill-vendor">Vendor</Label><select id="bill-vendor" className={selectClass} value={vendor} onChange={(e) => chooseVendor(e.target.value)}><option value="">Vendor…</option>{vendors.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}</select></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="bill-no">Vendor&apos;s bill no.</Label><Input id="bill-no" value={vendorBillNo} onChange={(e) => setVendorBillNo(e.target.value)} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="bill-amount">Amount (₹)</Label><Input id="bill-amount" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="bill-due">Due date</Label><Input id="bill-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="bill-po">Purchase order (optional)</Label><select id="bill-po" className={selectClass} value={poId} onChange={(e) => setPoId(e.target.value)}><option value="">No order</option>{purchaseOrders.map((o) => <option key={o.id} value={o.id}>{o.number} · {o.vendor}</option>)}</select></div>
            <Button className="self-end" disabled={!vendor || !vendorBillNo || !(Number(amount) > 0)} onClick={create}>Record bill</Button>
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
                const owed = Math.round((bill.amount - paid) * 100) / 100;
                const status = owed <= 0 ? "paid" : bill.dueDate < today ? "overdue" : paid > 0 ? "part paid" : "open";
                const order = purchaseOrders.find((o) => o.id === bill.poId);
                const match = threeWayMatch(bill.amount, order, workflowRules().matchTolerancePercent);
                const held = bill.poId !== undefined && !match.matched && owed > 0;
                return (
                  <tr key={bill.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium">{bill.number}<span className="block text-xs font-normal text-muted-foreground">{bill.vendor} · {bill.vendorBillNo}</span></td>
                    <td className="px-4 py-3">{bill.dueDate}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(bill.amount)}</td>
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
  const setBudgetPlan = useFinanceStore((state) => state.setBudgetPlan);
  const current = fiscalPeriod("2026-10-23");
  const [fiscalYear] = React.useState(current.fiscalYear);
  const [quarter, setQuarter] = React.useState<1 | 2 | 3 | 4>(current.quarter);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});

  function save(lineId: string) {
    const planned = Number(drafts[lineId] ?? "");
    const problem = setBudgetPlan(lineId, fiscalYear, quarter, planned, me);
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
  const isOwner = session.permissions.includes("*");
  const invoices = useFinanceStore((state) => state.invoices);
  const bills = useFinanceStore((state) => state.bills);
  const bankLines = useFinanceStore((state) => state.bankLines);
  const creditNotes = useFinanceStore((state) => state.creditNotes);
  const closeReviews = useFinanceStore((state) => state.closeReviews);
  const markCloseReviewed = useFinanceStore((state) => state.markCloseReviewed);
  const lockedThrough = usePeriodLockStore((state) => state.lockedThrough);
  const setLockedThrough = usePeriodLockStore((state) => state.setLockedThrough);
  const months = ["2026-08", "2026-09", "2026-10"];
  const [month, setMonth] = React.useState("2026-10");
  const payments = bookPayments(invoices, bills);
  const matchedKeys = new Set<string | null>(bankLines.map((l) => l.matchedKey));
  const checks = monthEndChecks({ month, invoices, bills, bankLines, bookPayments: payments, matchedKeys, lockedThrough, reviews: closeReviews.filter((r) => r.startsWith(`${month}:`)).map((r) => r.slice(month.length + 1)), dueAmount, creditNotes });
  const ready = checks.every((c) => c.passed || (c.manual && closeReviews.includes(`${month}:${c.id}`)));
  const end = monthEnd(month);

  function signOff(item: string) {
    const problem = markCloseReviewed(month, item, me);
    if (problem) return toast.error(problem);
    toast.success("Signed off");
  }

  function lockMonth() {
    const problem = setLockedThrough(end, isOwner);
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
  const addExpense = useFinanceStore((state) => state.addExpense);
  const topUpPettyCash = useFinanceStore((state) => state.topUpPettyCash);
  const balance = pettyCashBalance(topUps, expenses);
  const [date, setDate] = React.useState("2026-10-23");
  const [category, setCategory] = React.useState<(typeof EXPENSE_CATEGORIES)[number]>("Travel");
  const [payee, setPayee] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [gstRate, setGstRate] = React.useState("18");
  const [paidFrom, setPaidFrom] = React.useState<"petty cash" | "bank">("petty cash");
  const [topUp, setTopUp] = React.useState("");

  function save() {
    const problem = addExpense({ date, category, payee, amount: Number(amount), gstRate: Number(gstRate), paidFrom }, me);
    if (problem) return toast.error(problem);
    toast.success("Expense recorded");
    setPayee(""); setAmount("");
  }

  function topUpCash() {
    const problem = topUpPettyCash({ date, amount: Number(topUp) }, me);
    if (problem) return toast.error(problem);
    toast.success("Petty cash topped up");
    setTopUp("");
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Petty cash · ₹{balance.toLocaleString("en-IN")} in hand</CardTitle></CardHeader>
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

/** GST summary for one month: output tax on sales by rate, input tax on expenses, and the net to check. */
function GstView() {
  const invoices = useFinanceStore((state) => state.invoices);
  const creditNotes = useFinanceStore((state) => state.creditNotes);
  const expenses = useFinanceStore((state) => state.expenses);
  const months = ["2026-08", "2026-09", "2026-10"];
  const [month, setMonth] = React.useState("2026-10");
  const summary = gstSummary(month, invoices, creditNotes, expenses);

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">GST summary · {month}</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <div className="flex items-center gap-2"><Label htmlFor="gst-month">Month</Label><select id="gst-month" className={selectClass} value={month} onChange={(e) => setMonth(e.target.value)}>{months.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
          <p className="text-xs text-muted-foreground">A summary to check the month, not a return. Approved credit notes reduce the output tax. Confirm these figures with the company&apos;s accountant before filing.</p>
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
            <div className="flex justify-between"><span>Input tax on expenses</span><span>{money(summary.inputTax)}</span></div>
            <div className="flex justify-between font-semibold"><span>Net to check before filing</span><span>{summary.netPayable < 0 ? `-${money(Math.abs(summary.netPayable))}` : money(summary.netPayable)}</span></div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

/** Key figures for the company across the books: profit, what customers and vendors owe, cash and the aging of receivables. */
function ReportsView() {
  const invoices = useFinanceStore((state) => state.invoices);
  const creditNotes = useFinanceStore((state) => state.creditNotes);
  const bills = useFinanceStore((state) => state.bills);
  const expenses = useFinanceStore((state) => state.expenses);
  const topUps = useFinanceStore((state) => state.pettyCashTopUps);
  const bankEntries = useFinanceStore((state) => state.bankEntries);
  const openingCash = useFinanceStore((state) => state.openingCash);
  const pnl = profitAndLoss(invoices, creditNotes, bills, expenses);
  const live = invoices.filter((i) => !i.cancelled);
  const receivable = live.reduce((sum, i) => sum + dueAmount(i, creditNotes), 0);
  const overdue = live.filter((i) => i.dueDate < "2026-10-23").reduce((sum, i) => sum + dueAmount(i, creditNotes), 0);
  const owedToVendors = bills.reduce((sum, b) => sum + (b.amount - b.payments.reduce((s, p) => s + p.amount, 0)), 0);
  const months = cashFlowByMonth(invoices, bills, bankEntries, openingCash, expenses, topUps);
  const closing = months.length > 0 ? months[months.length - 1].closing : openingCash;
  const buckets = ["Current", "1–30 days", "31–60 days", "61–90 days", "90+ days"];
  const aging = buckets.map((bucket) => ({ bucket, amount: live.filter((i) => agingBucket(i, creditNotes) === bucket).reduce((sum, i) => sum + dueAmount(i, creditNotes), 0) }));
  const cards: [string, number][] = [
    ["Sales (ex-GST)", pnl.sales],
    ["Profit before payroll", pnl.profit],
    ["Owed by customers", receivable],
    ["Overdue from customers", overdue],
    ["Owed to vendors", owedToVendors],
    ["Closing cash", closing],
  ];

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-md border border-border bg-surface p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className={`mt-1 text-xl font-semibold tabular-nums ${value < 0 ? "text-danger" : ""}`}>{money(value)}</p>
          </div>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Receivables aging</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm tabular-nums">
          {aging.map((row) => <div key={row.bucket} className="flex justify-between border-b border-border pb-2 last:border-0"><span>{row.bucket}</span><span>{money(row.amount)}</span></div>)}
          <p className="text-xs text-muted-foreground">Petty cash in hand: {money(pettyCashBalance(topUps, expenses))}. Figures come from the records in this workspace.</p>
        </CardContent>
      </Card>
    </>
  );
}

/** Bank statement lines matched to the payments recorded in the books. A match needs the same amount and direction. */
function ReconciliationView({ me }: { me: string }) {
  const invoices = useFinanceStore((state) => state.invoices);
  const bills = useFinanceStore((state) => state.bills);
  const bankLines = useFinanceStore((state) => state.bankLines);
  const importBankStatement = useFinanceStore((state) => state.importBankStatement);
  const matchBankLine = useFinanceStore((state) => state.matchBankLine);
  const [text, setText] = React.useState("");
  const [errors, setErrors] = React.useState<string[]>([]);
  const payments = bookPayments(invoices, bills);
  const matchedKeys = new Set(bankLines.filter((l) => l.matchedKey).map((l) => l.matchedKey));
  const unmatchedPayments = payments.filter((p) => !matchedKeys.has(p.key));
  const unmatchedLines = bankLines.filter((l) => !l.matchedKey).length;

  function save() {
    const result = importBankStatement(text, me);
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
            const options = payments.filter((p) => (p.direction === 1) === (line.amount > 0) && (!matchedKeys.has(p.key) || p.key === line.matchedKey));
            return (
              <div key={line.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0">
                <span>
                  <span className="text-muted-foreground">{line.date} · </span>{line.description} · <span className="tabular-nums">{line.amount < 0 ? `-${money(Math.abs(line.amount))}` : money(line.amount)}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant={line.matchedKey ? "success" : "warning"}>{line.matchedKey ? "matched" : "not matched"}</Badge>
                  <select aria-label={`Match ${line.description}`} className={selectClass} value={line.matchedKey ?? ""} onChange={(e) => { const p = matchBankLine(line.id, e.target.value || null, me); if (p) toast.error(p); }}>
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
  const setOpeningCash = useFinanceStore((state) => state.setOpeningCash);
  const addBankEntry = useFinanceStore((state) => state.addBankEntry);
  const [opening, setOpening] = React.useState(String(openingCash));
  const [description, setDescription] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [direction, setDirection] = React.useState<"in" | "out">("out");
  const [date, setDate] = React.useState("2026-10-23");
  const months = cashFlowByMonth(invoices, bills, bankEntries, openingCash, expenses, pettyCashTopUps);
  const lastClosing = months.length > 0 ? months[months.length - 1].closing : openingCash;

  function saveOpening() {
    const problem = setOpeningCash(Number(opening), me);
    if (problem) return toast.error(problem);
    toast.success("Opening cash saved");
  }

  function saveEntry() {
    const sign = direction === "in" ? 1 : -1;
    const problem = addBankEntry({ date, description, amount: sign * Math.abs(Number(amount)) }, me);
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
  const pnl = profitAndLoss(invoices, creditNotes, bills, expenses);
  // `|| 0` turns a negative zero into zero, so an empty line does not read "-₹0".
  const rows: [string, number, boolean][] = [
    ["Sales (ex-GST)", pnl.sales, false],
    ["Less approved credit notes (ex-GST)", -pnl.credits || 0, false],
    ["Net sales", pnl.netSales, true],
    ["Less bills recorded", -pnl.costs || 0, false],
    ["Profit before payroll and expenses", pnl.profit, true],
  ];
  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Profit and loss to date</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <p className="text-xs text-muted-foreground">
            Sales are shown without GST. A credit note reduces sales by its share of the invoice before GST. Bills are costs as they were entered. Payroll and expense claims are not in this figure yet.
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
  const totals = invoices.filter((invoice) => !invoice.cancelled).map((invoice) => invoiceTotals(invoice).total);
  const invoiced = totals.reduce((sum, value) => sum + value, 0);
  const collected = invoices.reduce((sum, invoice) => sum + invoice.payments.reduce((s, p) => s + p.amount, 0), 0);
  const outstanding = invoices.reduce((sum, invoice) => sum + dueAmount(invoice, creditNotes), 0);
  const overdue = invoices.filter((invoice) => invoiceStatus(invoice, creditNotes) === "overdue").reduce((sum, invoice) => sum + dueAmount(invoice, creditNotes), 0);
  const buckets = ["Current", "1–30 days", "31–60 days", "61–90 days", "90+ days"].map((label) => ({ label, value: invoices.filter((invoice) => agingBucket(invoice, creditNotes) === label).reduce((sum, invoice) => sum + dueAmount(invoice, creditNotes), 0) }));

  return (
    <>
      {invoices.length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">No invoices yet. Create the first one from Invoices. Finance figures start at zero for a new company.</CardContent></Card>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi label="Invoiced" value={money(invoiced)} />
        <Kpi label="Collected" value={money(collected)} />
        <Kpi label="Outstanding" value={money(outstanding)} />
        <Kpi label="Overdue" value={money(overdue)} tone={overdue > 0 ? "warning" : undefined} />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Receivables aging</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-5">
          {buckets.map((bucket) => (
            <div key={bucket.label} className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">{bucket.label}</p>
              <p className="mt-1 font-semibold tabular-nums">{money(bucket.value)}</p>
            </div>
          ))}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Invoiced is the total of all invoices, including GST. Outstanding subtracts payments and approved credit notes. Janus does not estimate revenue from the pipeline.</p>
    </>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "warning" }) {
  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${tone === "warning" ? "text-amber-700" : ""}`}>{value}</p>
    </div>
  );
}

function InvoicesView({ me }: { me: string }) {
  const invoices = useFinanceStore((state) => state.invoices);
  const creditNotes = useFinanceStore((state) => state.creditNotes);
  const [creating, setCreating] = React.useState(false);
  const [paying, setPaying] = React.useState<Invoice | null>(null);
  const [selected, setSelected] = React.useState<Invoice | null>(null);

  return (
    <>
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
              {invoices.map((invoice) => {
                const status = invoiceStatus(invoice, creditNotes);
                return (
                  <tr key={invoice.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium"><button className="hover:underline" onClick={() => setSelected(invoice)}>{invoice.number}</button></td>
                    <td className="px-4 py-3">{invoice.customer}<span className="block text-xs text-muted-foreground">{invoice.customerCompany}</span></td>
                    <td className="px-4 py-3 text-muted-foreground">{invoice.date}</td>
                    <td className="px-4 py-3 text-muted-foreground">{invoice.dueDate}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(invoiceTotals(invoice).total)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(dueAmount(invoice, creditNotes))}</td>
                    <td className="px-4 py-3"><Badge variant={status === "overdue" ? "warning" : status === "paid" ? "success" : "neutral"}>{status}</Badge></td>
                    <td className="px-4 py-3 text-right"><Button size="sm" variant="secondary" disabled={status === "paid"} onClick={() => setPaying(invoice)}>Record payment</Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {creating ? <NewInvoiceDialog me={me} onClose={() => setCreating(false)} /> : null}
      {paying ? <PaymentDialog invoice={paying} onClose={() => setPaying(null)} /> : null}
      {selected ? <InvoiceDetail invoice={selected} onClose={() => setSelected(null)} /> : null}
    </>
  );
}

function NewInvoiceDialog({ me, onClose }: { me: string; onClose: () => void }) {
  const session = useSession();
  const canCreate = hasPermission(session.permissions, "invoice:create");
  const addInvoice = useFinanceStore((state) => state.addInvoice);
  const [customer, setCustomer] = React.useState("");
  const [customerCompany, setCustomerCompany] = React.useState("");
  const [dealId, setDealId] = React.useState("");
  const links = useCrmLinkOptions();
  const [sameState, setSameState] = React.useState(true);
  const [dueDays, setDueDays] = React.useState("30");
  const [lines, setLines] = React.useState<InvoiceLine[]>([{ item: "", hsn: "", qty: 1, rate: 0, gstRate: 18 }]);
  const [error, setError] = React.useState("");
  const today = "2026-10-23";
  const due = new Date(Date.parse(today) + Number(dueDays || 0) * 86400000).toISOString().slice(0, 10);
  const preview = invoiceTotals({ sameState, lines, id: "", number: "", customer, customerCompany, date: today, dueDate: due, payments: [], createdBy: me });

  function update(index: number, patch: Partial<InvoiceLine>) {
    setLines((current) => current.map((line, i) => i === index ? { ...line, ...patch } : line));
  }
  function save() {
    if (customer.trim().length < 2) return setError("Enter the customer name.");
    if (lines.some((line) => line.item.trim().length < 2 || !/^\d{4,8}$/.test(line.hsn.trim()) || line.qty <= 0 || line.rate <= 0)) return setError("Each line needs an item, an HSN code (4 to 8 digits), a quantity and a rate above zero.");
    const locked = periodLockProblem(today);
    if (locked) return setError(locked);
    const number = addInvoice({ customer: customer.trim(), customerCompany: customerCompany.trim(), dealId: dealId || undefined, date: today, dueDate: due, sameState, lines: lines.map((line) => ({ ...line, item: line.item.trim(), hsn: line.hsn.trim() })) }, me);
    toast.success(`Invoice ${number} created`);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>New invoice</DialogTitle><DialogDescription>GST tax invoice. Choose whether the customer is in the same state.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5"><Label htmlFor="inv-customer">Customer</Label><Input id="inv-customer" value={customer} onChange={(e) => setCustomer(e.target.value)} /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="inv-company">Company</Label><Input id="inv-company" value={customerCompany} onChange={(e) => setCustomerCompany(e.target.value)} /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="inv-deal">CRM deal (optional)</Label><select id="inv-deal" className={selectClass} value={dealId} onChange={(e) => setDealId(e.target.value)}><option value="">None</option>{links.deals.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></div>
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
        <DialogFooter><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!canCreate} title={canCreate ? undefined : "Needs the invoice:create permission"} onClick={save}>Create invoice</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentDialog({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const session = useSession();
  const me = session.user.name ?? session.user.email ?? "You";
  const recordPayment = useFinanceStore((state) => state.recordPayment);
  const creditNotes = useFinanceStore((state) => state.creditNotes);
  const due = dueAmount(invoice, creditNotes);
  const [amount, setAmount] = React.useState(String(due));
  const [method, setMethod] = React.useState<"UPI" | "Bank transfer" | "Cash" | "Cheque">("UPI");
  const [reference, setReference] = React.useState("");
  const [error, setError] = React.useState("");
  function save() {
    if (reference.trim().length < 3) return setError("Enter the payment reference (UTR, cheque number or receipt).");
    const problem = recordPayment(invoice.id, { amount: Number(amount), method, reference: reference.trim(), date: "2026-10-23" }, me);
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
        <div className="border-t border-border pt-3"><p className="mb-2 text-sm font-medium">Documents</p><RecordDocuments recordKind="invoice" recordId={invoice.id} addedBy={me} today="2026-10-23" /></div>
        <p className="text-xs text-muted-foreground">Created by {invoice.createdBy}. Tax rules to be confirmed by the company&apos;s accountant before filing.</p>
        <DialogFooter><Button variant="secondary" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreditNotesView({ me }: { me: string }) {
  const invoices = useFinanceStore((state) => state.invoices);
  const creditNotes = useFinanceStore((state) => state.creditNotes);
  const addCreditNote = useFinanceStore((state) => state.addCreditNote);
  const decide = useFinanceStore((state) => state.decideCreditNote);
  const [invoiceId, setInvoiceId] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [date] = React.useState("2026-10-23");
  const [ticketId, setTicketId] = React.useState("");
  const [docsFor, setDocsFor] = React.useState<CreditNote | null>(null);
  const links = useCrmLinkOptions();
  const invoice = invoices.find((item) => item.id === invoiceId);

  function create() {
    const problem = addCreditNote({ invoiceId, amount: Number(amount), reason, date, ticketId: ticketId || undefined }, me);
    if (problem) return toast.error(problem);
    toast.success("Credit note raised. It takes effect once approved by someone else.");
    setAmount(""); setReason(""); setTicketId("");
  }
  return (
    <>
      <Dialog open={docsFor !== null} onOpenChange={(open) => !open && setDocsFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Documents for {docsFor?.number}</DialogTitle><DialogDescription>Approval notes, the customer&apos;s letter or the stock report behind this credit note.</DialogDescription></DialogHeader>
          {docsFor ? <RecordDocuments recordKind="credit-note" recordId={docsFor.id} addedBy={me} today="2026-10-23" /> : null}
        </DialogContent>
      </Dialog>
      <Card>
        <CardHeader><CardTitle className="text-base">Raise a credit note</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-xs text-muted-foreground">Credit notes refer to an original invoice. They reduce what the customer owes once approved. Another person must approve, not the one who raised it.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5"><Label htmlFor="cn-invoice">Invoice</Label><select id="cn-invoice" className={selectClass} value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}><option value="">Choose…</option>{invoices.map((item) => <option key={item.id} value={item.id}>{item.number} · {item.customer}</option>)}</select></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="cn-amount">Amount (₹, incl. GST)</Label><Input id="cn-amount" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="cn-reason">Reason</Label><Input id="cn-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. 4 cartons damaged in transit" /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="cn-ticket">Support ticket (optional)</Label><select id="cn-ticket" className={selectClass} value={ticketId} onChange={(e) => setTicketId(e.target.value)}><option value="">None</option>{links.openTickets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div>
          </div>
          {invoice ? <p className="text-xs text-muted-foreground">Invoice total {money(invoiceTotals(invoice).total)}.</p> : null}
          <Button className="w-fit" disabled={!invoiceId || !amount || !reason} onClick={create}>Raise credit note</Button>
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
                    <td className="px-4 py-3 font-medium">{note.number}</td>
                    <td className="px-4 py-3">{original?.number ?? "—"}{linkedLabel(links.tickets, note.ticketId) ? <span className="block text-xs text-muted-foreground">{linkedLabel(links.tickets, note.ticketId)}</span> : null}</td>
                    <td className="px-4 py-3 text-muted-foreground">{note.reason}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(note.amount)}</td>
                    <td className="px-4 py-3"><Badge variant={note.status === "approved" ? "success" : note.status === "rejected" ? "danger" : "warning"}>{note.status}</Badge></td>
                    <td className="px-4 py-3 text-right"><Button size="sm" variant="ghost" onClick={() => setDocsFor(note)}>Documents</Button>{note.status === "pending" ? <Button size="sm" variant="secondary" onClick={() => { const problem = decide(note.id, me); if (problem) toast.error(problem); else toast.success("Credit note approved"); }}>Approve</Button> : <span className="text-xs text-muted-foreground">by {note.approvedBy}</span>}</td>
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
  const add = useFinanceStore((state) => state.addFundRequest);
  const approve = useFinanceStore((state) => state.approveFundRequest);
  const reject = useFinanceStore((state) => state.rejectFundRequest);
  const drawBudget = useFinanceStore((state) => state.drawBudget);
  const [purpose, setPurpose] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [lineId, setLineId] = React.useState("");
  const [drawLine, setDrawLine] = React.useState("");
  const [drawAmount, setDrawAmount] = React.useState("");
  const [drawNote, setDrawNote] = React.useState("");
  const [rejecting, setRejecting] = React.useState<FundRequest | null>(null);
  const [reason, setReason] = React.useState("");

  const statusTone = (status: FundRequest["status"]) => status === "approved" ? "success" : status === "rejected" ? "danger" : "warning";
  const statusLabel = (status: FundRequest["status"]) => status === "awaiting_finance" ? "awaiting finance" : status;

  return (
    <>
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
          <Button className="w-fit" disabled={purpose.trim().length < 3 || !(Number(amount) > 0) || !lineId} onClick={() => { add({ purpose: purpose.trim(), amount: Number(amount), lineId, date: "2026-10-23" }, me); toast.success("Fund request sent for approval"); setPurpose(""); setAmount(""); }}>Send request</Button>
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
                          <Button size="sm" variant="secondary" onClick={() => { const p = approve(request.id, request.status === "pending" ? "owner" : "finance", me); if (p) toast.error(p); else toast.success("Approved"); }}>{request.status === "pending" ? "Owner approve" : "Finance approve"}</Button>
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
          <Button className="w-fit" disabled={!drawLine || !(Number(drawAmount) > 0) || drawNote.trim().length < 3} onClick={() => { const p = drawBudget(drawLine, Number(drawAmount), drawNote.trim(), me, "2026-10-23"); if (p) return toast.error(p); toast.success("Spend recorded"); setDrawAmount(""); setDrawNote(""); }}>Record spend</Button>
          {draws.length > 0 ? <ul className="text-xs text-muted-foreground">{draws.slice(0, 5).map((draw) => <li key={draw.id}>{draw.date} · {lines.find((l) => l.id === draw.lineId)?.name} · {money(draw.amount)} · {draw.note} · by {draw.by}</li>)}</ul> : null}
        </CardContent>
      </Card>

      {rejecting ? (
        <Dialog open onOpenChange={(open) => !open && setRejecting(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Reject {rejecting.number}</DialogTitle><DialogDescription>Give a reason, so the requester knows what to change.</DialogDescription></DialogHeader>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
            <DialogFooter><Button variant="secondary" onClick={() => setRejecting(null)}>Cancel</Button><Button disabled={reason.trim().length < 3} onClick={() => { reject(rejecting.id, reason.trim(), me); setRejecting(null); setReason(""); toast.success("Request rejected"); }}>Reject request</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      <p className="text-xs text-muted-foreground"><Link href="/workspace/hr-people?view=expenses&workspace=hr-people" className="underline">Expense claims</Link> are approved in HR &amp; People.</p>
    </>
  );
}
