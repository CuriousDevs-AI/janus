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
import { TrailPanel } from "@/components/shared/audit-trail-panel";
import { MoneyApprovalsQueue } from "@/components/approvals/money-approvals-queue";
import { PeriodLockView } from "@/components/finance/period-lock-view";
import { periodLockProblem } from "@/lib/stores/period-lock-store";
import { linkedLabel, useCrmLinkOptions } from "@/lib/record-links";
import { RecordDocuments } from "@/components/shared/record-documents";
import { useOperationsStore } from "@/lib/stores/operations-store";
import { threeWayMatch } from "@/lib/three-way-match";
import { FUND_OWNER_LIMIT, GST_RATES, agingBucket, dueAmount, fiscalPeriod, invoiceStatus, invoiceTotals, profitAndLoss, useFinanceStore, type CreditNote, type FundRequest, type Invoice, type InvoiceLine } from "@/lib/stores/finance-store";

const money = (value: number) => `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const selectClass = "h-9 w-full rounded-md border border-input bg-surface px-3 text-sm";

/** Views that are not built yet. They say so instead of showing empty tables. */
const comingSoon: Record<string, string> = {
  expenses: "Expense claims live in HR & People (Expenses & Reimbursements). Finance pay-out and register come next.",
  "cash-flow": "Cash flow needs bank statements. Planned for phase 2.",
  reports: "Financial reports come after invoices, payments and credit notes are in use.",
};

export function FinanceWorkspace() {
  const session = useSession();
  const searchParams = useSearchParams();
  const view = searchParams.get("view") ?? "overview";
  const me = session.user.name ?? session.user.email ?? "You";
  const invoices = useFinanceStore((state) => state.invoices);
  const creditNotes = useFinanceStore((state) => state.creditNotes);
  const titles: Record<string, string> = { overview: "Finance overview", invoices: "Invoices", "credit-notes": "Credit notes", funds: "Fund requests & budgets", approvals: "Approvals queue", periods: "Period locks", payables: "Bills & payables", "profit-loss": "Profit & loss", budgets: "Budgets by quarter" };

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
        {!["invoices", "credit-notes", "funds", "approvals", "periods", "payables", "profit-loss", "budgets"].includes(view) && <OverviewView />}
        {!["invoices", "credit-notes", "funds", "approvals", "periods", "payables", "profit-loss", "budgets"].includes(view) && <FinanceTrail />}
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
  const [poId, setPoId] = React.useState("");
  const purchaseOrders = useOperationsStore((state) => state.purchaseOrders);
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
            <div className="flex flex-col gap-1.5"><Label htmlFor="bill-vendor">Vendor</Label><Input id="bill-vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} /></div>
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
                const match = threeWayMatch(bill.amount, order);
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

function ProfitLossView() {
  const invoices = useFinanceStore((state) => state.invoices);
  const creditNotes = useFinanceStore((state) => state.creditNotes);
  const bills = useFinanceStore((state) => state.bills);
  const pnl = profitAndLoss(invoices, creditNotes, bills);
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
        <DialogFooter><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Create invoice</Button></DialogFooter>
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
