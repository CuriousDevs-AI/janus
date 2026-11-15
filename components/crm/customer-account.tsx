"use client";

import Link from "next/link";
import { AlertTriangle, Receipt } from "lucide-react";
import { useApi } from "@/lib/api/use-api";
import { formatCurrencyINR } from "@/lib/utils";

type AccountInvoice = { id: string; number: string; invoiceDate: string; dueDate: string; total: string; due: string };
type Account = {
  full: boolean; invoices: number; overdueInvoices: number; oldestOverdueDays: number;
  invoiced: string | null; paid: string | null; credited: string | null; due: string | null; overdue: string | null;
  lastInvoiceOn: string | null; latest: AccountInvoice[];
};

const invoicesHref = "/workspace/finance-accounting?view=invoices";
const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
// Exact amounts: this is what the customer owes, not a headline figure.
const rupees = (value: string | null) => formatCurrencyINR(Number(value ?? 0), false);

/**
 * The customer's account with the business, from Finance: invoiced, paid and still owed, with the
 * latest invoices, for someone who handles money. A salesperson sees only whether invoices are
 * overdue, so nobody offers more credit to a customer who has not paid.
 */
export function CustomerAccount({ contactId }: { contactId: string }) {
  const result = useApi<Account>(`/contacts/${encodeURIComponent(contactId)}/account`);
  const data = result.data;
  return (
    <section className="rounded-lg border border-border bg-surface p-5" aria-label="Account">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Account</h2>
          <p className="mt-1 text-xs text-muted-foreground">What Finance invoiced this customer, what they paid and what they still owe.</p>
        </div>
        <Receipt className="size-4 text-accent" aria-hidden />
      </div>
      {result.loading && !data ? <p role="status" className="mt-4 text-sm text-muted-foreground">Reading their invoices…</p>
        : result.error ? <p role="alert" className="mt-4 text-sm text-danger">Their account could not be read: {result.error}</p>
        : !data || data.invoices === 0 ? <p className="mt-4 text-sm text-muted-foreground">No invoice raised to this customer yet. Invoices from their deals, or to their company name, show here.</p>
        : <>
          {data.overdueInvoices > 0 && <p className="mt-4 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <span>
              {data.overdueInvoices} {data.overdueInvoices === 1 ? "invoice is" : "invoices are"} overdue{data.full && data.overdue ? `: ${rupees(data.overdue)}` : ""}, the oldest by {data.oldestOverdueDays} {data.oldestOverdueDays === 1 ? "day" : "days"}.
              {data.full ? " Ask for payment before offering more credit." : " Check with accounts before offering more credit."}
            </span>
          </p>}
          {data.full ? <>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Invoiced</dt><dd className="mt-1 font-semibold tabular-nums">{rupees(data.invoiced)}</dd><dd className="text-xs text-muted-foreground">{data.invoices} {data.invoices === 1 ? "invoice" : "invoices"}</dd></div>
              <div><dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Paid</dt><dd className="mt-1 font-semibold tabular-nums">{rupees(data.paid)}</dd>{Number(data.credited) > 0 && <dd className="text-xs text-muted-foreground">{rupees(data.credited)} credited</dd>}</div>
              <div><dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Owes</dt><dd className={`mt-1 font-semibold tabular-nums ${Number(data.due) > 0 ? "" : "text-success"}`}>{Number(data.due) > 0 ? rupees(data.due) : "Nothing"}</dd></div>
              <div><dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Last invoice</dt><dd className="mt-1 font-semibold">{data.lastInvoiceOn ? day(data.lastInvoiceOn) : "—"}</dd></div>
            </dl>
            <ul className="mt-4 divide-y divide-border">
              {data.latest.map((invoice) => {
                const late = Number(invoice.due) > 0 && invoice.dueDate < new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
                return <li key={invoice.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0"><span className="font-medium">{invoice.number}</span><span className="ml-2 text-xs text-muted-foreground">{day(invoice.invoiceDate)} · due {day(invoice.dueDate)}</span></span>
                  <span className="shrink-0 text-right tabular-nums">{rupees(invoice.total)}<span className={`block text-xs ${Number(invoice.due) === 0 ? "text-success" : late ? "text-warning" : "text-muted-foreground"}`}>{Number(invoice.due) === 0 ? "Paid" : `${rupees(invoice.due)} ${late ? "overdue" : "to pay"}`}</span></span>
                </li>;
              })}
            </ul>
            <Link href={invoicesHref} className="mt-2 inline-block text-xs font-medium text-accent hover:underline">{data.invoices > data.latest.length ? `All ${data.invoices} invoices in Finance` : "Open invoices in Finance"}</Link>
          </> : data.overdueInvoices === 0 && <p className="mt-4 text-sm text-muted-foreground">{data.invoices} {data.invoices === 1 ? "invoice" : "invoices"} raised; none overdue.</p>}
        </>}
    </section>
  );
}
