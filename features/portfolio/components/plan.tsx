"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Building2, Check, CreditCard, FileText, Printer, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionCard } from "@/components/settings/section-ui";
import { useSession } from "@/components/auth/session-provider";
import { api, message } from "@/lib/api/client";
import { day } from "@/features/portfolio/lib/format";
import { usePortfolioApi } from "@/features/portfolio/lib/use-portfolio-api";
import type { Billing, BillingCheckout, BillingInvoice, BillingPlan, BillingPreview } from "@/features/portfolio/types";

type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayCheckout = { open: () => void; on: (event: "payment.failed", handler: (failure: { error?: { description?: string } }) => void) => void };
declare global { interface Window { Razorpay?: new (options: Record<string, unknown>) => RazorpayCheckout } }

/** Loads Razorpay's Checkout script once, when someone first pays. */
function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Razorpay's checkout could not be loaded. Check the connection and try again."));
    document.body.appendChild(script);
  });
}

/** Exact rupees, as on an invoice: ₹2,358.82. */
const rupees = (value: string | number) => Number(value).toLocaleString("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: Number(value) % 1 ? 2 : 0, maximumFractionDigits: 2 });
const limit = (value: number | null, one: string, many: string) => value === null ? `${many} as agreed` : `${value} ${value === 1 ? one : many}`;

/**
 * The account's plan and invoices. A plan belongs to the person's login and covers every company
 * they own; it is never set company by company. Payments are not connected yet: outside production
 * a plan changes at once with nothing charged, and invoices shown are samples made for testing.
 */
export function Plan() {
  const billing = usePortfolioApi<Billing>("/billing");
  const [moving, setMoving] = React.useState<BillingPlan | null>(null);
  const [viewing, setViewing] = React.useState<BillingInvoice | null>(null);
  if (billing.loading) return <div role="status" aria-label="Loading your plan" className="h-[420px] animate-pulse rounded-xl border border-border bg-surface-2" />;
  if (billing.error || !billing.data) return <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-danger">{billing.error}<Button size="sm" variant="secondary" onClick={billing.reload}>Try again</Button></div>;
  const data = billing.data;
  if (!data.owner) return <SectionCard title="Plan and billing" description="The plan belongs to the Owner's account.">
    <p className="text-sm text-muted-foreground">The Owner of these companies chooses and pays for the plan. Nothing here is billed to you.</p>
  </SectionCard>;
  const current = data.plans.find((plan) => plan.id === data.plan) ?? data.plans[0];
  const rank = (plan: BillingPlan) => data.plans.findIndex((item) => item.id === plan.id);
  return <>
    <CurrentPlan data={data} plan={current} />
    {data.payments === "test" && <p className="rounded-lg border border-warning/30 bg-warning-muted px-3 py-2 text-xs text-warning">Test mode: payments are not connected yet, so a change here takes effect at once and nothing is charged. Invoices marked Sample were made for testing.</p>}
    {data.payments === "razorpay" && <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted-foreground">Paid plans are paid through Razorpay, by card, UPI or net banking, a month at a time. The plan changes once the payment is confirmed, and a GST invoice is issued.</p>}

    <div>
      <h2 className="mb-3 text-sm font-semibold">Plans</h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{data.plans.map((plan) => {
        const here = plan.id === current.id;
        const up = rank(plan) > rank(current);
        return <section key={plan.id} aria-label={`${plan.name} plan`} className={`flex flex-col rounded-xl border bg-surface p-4 ${here ? "border-accent ring-2 ring-accent/20" : "border-border"}`}>
          <div className="flex items-center justify-between gap-2"><h3 className="text-base font-semibold">{plan.name}</h3>{here && <Badge variant="success">Your plan</Badge>}{plan.id === "growth" && !here && <Badge variant="neutral">Most groups</Badge>}</div>
          <p className="mt-0.5 text-xs text-muted-foreground">{plan.tagline}</p>
          <p className="mt-3 text-2xl font-semibold tabular-nums">{plan.price === null ? "Custom" : rupees(plan.price)}{plan.price !== null && <span className="text-xs font-normal text-muted-foreground"> / month + GST</span>}</p>
          <p className="mt-1 text-xs text-muted-foreground">{limit(plan.companies, "company", "companies")} · {limit(plan.logins, "person", "people")}</p>
          <ul className="mt-3 flex flex-1 flex-col gap-1.5 text-[13px]">{plan.features.map((feature) => <li key={feature} className="flex items-start gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />{feature}</li>)}</ul>
          <div className="mt-4">{here ? <Button size="sm" variant="secondary" className="w-full" disabled>Current plan</Button>
            : plan.id === "enterprise" ? <Button size="sm" variant="outline" className="w-full" onClick={() => toast.message("Enterprise is set up with the Janus team, on agreed terms.", { description: "Tell us how many companies and people you run, and we will get in touch." })}>Talk to us</Button>
            : <Button size="sm" variant={up ? "default" : "outline"} className="w-full" disabled={data.payments === "off" && plan.id !== "free"} title={data.payments === "off" && plan.id !== "free" ? "Paid plans open once payments are connected" : undefined} onClick={() => setMoving(plan)}>{up ? <><ArrowUp className="size-3.5" />Upgrade to {plan.name}</> : <><ArrowDown className="size-3.5" />Move to {plan.name}</>}</Button>}</div>
        </section>;
      })}</div>
    </div>

    {data.archived.length > 0 && <SectionCard title="Archived by your plan" description={`${current.name} holds fewer companies than you have. These are kept as they were and come back when you move up.`}>
      <ul className="flex flex-wrap gap-2">{data.archived.map((item) => <li key={item.id}><Badge variant="neutral">{item.name}</Badge></li>)}</ul>
    </SectionCard>}

    {data.refunds.length > 0 && <SectionCard title="Refunds" description="The unused days of a paid month, when you moved to another plan.">
      <ul className="divide-y divide-border">{data.refunds.map((refund, index) => <li key={index} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm first:pt-0 last:pb-0">
        <span><span className="font-medium">{rupees(refund.amount)}</span> <span className="text-muted-foreground">for {refund.daysUnused} unused of {refund.daysTotal} days of {refund.plan} · {refund.invoice} · {day(refund.createdOn)}</span></span>
        {refund.status === "refunded" ? <Badge variant="success">Refunded to your payment</Badge> : refund.status === "failed" ? <Badge variant="danger">Razorpay refused it: we will refund by hand</Badge> : <Badge variant="neutral">Test: recorded only</Badge>}
      </li>)}</ul>
    </SectionCard>}

    <SectionCard title="Invoices" description={`Monthly, from Janus to your account, with ${data.gstRate}% GST.`}>
      {data.invoices.length === 0 ? <p className="text-sm text-muted-foreground">No invoices yet.</p>
        : <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="py-2 pr-3">Invoice</th><th className="px-3 py-2">For</th><th className="px-3 py-2">Plan</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2">Status</th><th className="py-2 pl-3" /></tr></thead>
          <tbody>{data.invoices.map((invoice) => <tr key={invoice.number} className="border-b border-border last:border-0">
            <td className="py-2.5 pr-3"><span className="font-medium">{invoice.number}</span>{invoice.sample && <Badge variant="neutral" className="ml-2">Sample</Badge>}<p className="text-xs text-muted-foreground">Issued {day(invoice.issuedOn)}</p></td>
            <td className="px-3 text-muted-foreground">{day(invoice.periodStart)} to {day(invoice.periodEnd)}</td>
            <td className="px-3">{invoice.plan}</td>
            <td className="px-3 text-right tabular-nums">{rupees(invoice.total)}<p className="text-xs text-muted-foreground">{rupees(invoice.amount)} + {rupees(invoice.gst)} GST</p></td>
            <td className="px-3">{invoice.status === "paid" ? <Badge variant="success">Paid {invoice.paidOn ? day(invoice.paidOn) : ""}</Badge> : <Badge variant="warning">Due</Badge>}</td>
            <td className="py-2.5 pl-3 text-right"><Button size="sm" variant="ghost" onClick={() => setViewing(invoice)}><FileText className="size-3.5" />View</Button></td>
          </tr>)}</tbody>
        </table></div>}
    </SectionCard>

    {moving && <ChangePlan from={current} to={moving} pay={data.payments === "razorpay" && moving.price !== null && Number(moving.price) > 0} onClose={() => setMoving(null)} onDone={() => { setMoving(null); billing.reload(); }} />}
    {viewing && <InvoiceView invoice={viewing} gstRate={data.gstRate} onClose={() => setViewing(null)} />}
  </>;
}

function CurrentPlan({ data, plan }: { data: Billing; plan: BillingPlan }) {
  const session = useSession();
  const meter = (label: string, icon: React.ReactNode, used: number, of: number | null) => {
    const over = of !== null && used > of;
    return <div className="min-w-[180px] flex-1">
      <div className="flex items-center justify-between text-xs"><span className="flex items-center gap-1.5 text-muted-foreground">{icon}{label}</span><span className={`tabular-nums ${over ? "font-medium text-danger" : ""}`}>{used} of {of ?? "any"}</span></div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className={`h-full rounded-full ${over ? "bg-danger" : "bg-accent"}`} style={{ width: `${of ? Math.min(100, (used / of) * 100) : 8}%` }} /></div>
      {over && <p className="mt-1 text-[11px] text-danger">More than {plan.name} includes. Upgrade to keep within it.</p>}
    </div>;
  };
  return <section aria-label="Your plan" className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-muted text-accent"><CreditCard className="size-5" aria-hidden /></span>
        <div>
          <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{plan.name} plan</h2><Badge variant={plan.id === "free" ? "neutral" : "success"}>{plan.id === "free" ? "Free" : "Active"}</Badge></div>
          <p className="mt-0.5 text-sm text-muted-foreground">For your account, {session.user.name}, covering every company you own.</p>
          <p className="mt-1 text-xs text-muted-foreground">{data.startedOn ? `Since ${day(data.startedOn)}` : "Never upgraded"}{data.renewsOn ? ` · renews ${day(data.renewsOn)}` : ""}</p>
        </div>
      </div>
      <p className="text-2xl font-semibold tabular-nums">{plan.price === null ? "Custom" : rupees(plan.price)}{plan.price !== null && <span className="text-xs font-normal text-muted-foreground"> / month + GST</span>}</p>
    </div>
    <div className="flex flex-wrap gap-6 border-t border-border pt-4">
      {meter("Companies", <Building2 className="size-3.5" />, data.usage.companies, plan.companies)}
      {meter("People using Janus", <Users className="size-3.5" />, data.usage.logins, plan.logins)}
    </div>
    {data.usage.byCompany.length > 0 && <div className="border-t border-border pt-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">People by company</p>
      <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-left text-sm">
        <thead className="text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="py-1.5 pr-3 font-medium">Company</th><th className="px-3 py-1.5 text-right font-medium">Can sign in</th><th className="px-3 py-1.5 text-right font-medium">Invited</th><th className="py-1.5 pl-3 text-right font-medium">Seats counted</th></tr></thead>
        <tbody>{data.usage.byCompany.map((row) => <tr key={row.id} className="border-t border-border">
          <td className="py-2 pr-3 font-medium">{row.name}</td>
          <td className="px-3 py-2 text-right tabular-nums">{row.people}</td>
          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{row.invited || "—"}</td>
          <td className="py-2 pl-3 text-right tabular-nums">{row.people + row.invited}</td>
        </tr>)}</tbody>
        <tfoot><tr className="border-t border-border font-semibold"><td className="py-2 pr-3">All companies</td><td className="px-3 py-2 text-right tabular-nums">{data.usage.byCompany.reduce((sum, row) => sum + row.people, 0)}</td><td className="px-3 py-2 text-right tabular-nums">{data.usage.byCompany.reduce((sum, row) => sum + row.invited, 0) || "—"}</td><td className="py-2 pl-3 text-right tabular-nums">{data.usage.logins}{plan.logins !== null ? ` of ${plan.logins}` : ""}</td></tr></tfoot>
      </table></div>
      <p className="mt-2 text-[11px] text-muted-foreground">An open invitation holds a seat until it is accepted or withdrawn. Someone in two companies takes a seat in each.</p>
    </div>}
  </section>;
}

export function ChangePlan({ from, to, pay, first = false, onClose, onDone }: { from: BillingPlan; to: BillingPlan; pay: boolean; first?: boolean; onClose: () => void; onDone: () => void }) {
  const [saving, setSaving] = React.useState(false);
  const [keep, setKeep] = React.useState<string[] | null>(null);
  // The preview follows the companies chosen to keep, and says exactly what the move will do.
  const preview = usePortfolioApi<BillingPreview>(`/billing/preview?plan=${to.id}${keep ? `&keep=${keep.join(",")}` : ""}`, { keepPrevious: true });
  const seen = preview.data;
  const chosen = keep ?? seen?.companies.filter((item) => item.keep).map((item) => item.id) ?? [];
  const limit = seen?.companyLimit ?? null;
  const toggle = (id: string) => setKeep(chosen.includes(id) ? chosen.filter((item) => item !== id) : [...chosen, id]);
  async function confirm() {
    setSaving(true);
    if (!pay) {
      try { await api("/billing/plan", { method: "PUT", body: JSON.stringify({ plan: to.id, keep: chosen }) }); toast.success(`You are on the ${to.name} plan.`); onDone(); }
      catch (error) { toast.error(message(error)); setSaving(false); }
      return;
    }
    try {
      const order = await api<BillingCheckout>("/billing/checkout", { method: "POST", body: JSON.stringify({ plan: to.id, keep: chosen }) });
      await loadRazorpay();
      const checkout = new window.Razorpay!({
        key: order.keyId, order_id: order.orderId, amount: order.amount, currency: order.currency,
        name: "Janus", description: order.description, prefill: { name: order.name, email: order.email },
        theme: { color: "#2563eb" },
        handler: async (paid: RazorpayResponse) => {
          try {
            await api("/billing/checkout/verify", { method: "POST", body: JSON.stringify({ orderId: paid.razorpay_order_id, paymentId: paid.razorpay_payment_id, signature: paid.razorpay_signature }) });
            toast.success(`Paid. You are on the ${to.name} plan.`);
            onDone();
          } catch (error) { toast.error(`Razorpay took the payment, but Janus could not confirm it yet: ${message(error)} It will be confirmed when Razorpay notifies Janus.`); setSaving(false); }
        },
        modal: { ondismiss: () => setSaving(false) },
      });
      checkout.on("payment.failed", (failure) => { toast.error(failure.error?.description ?? "The payment did not go through."); setSaving(false); });
      checkout.open();
    } catch (error) { toast.error(message(error)); setSaving(false); }
  }
  const tooMany = limit !== null && chosen.length > limit;
  const list = (title: string, items: { name: string; company?: string }[], tone: "warn" | "good") => items.length > 0 && <div><p className={`text-xs font-semibold ${tone === "warn" ? "text-warning" : "text-success"}`}>{title}</p><ul className="mt-1 grid gap-0.5 text-sm">{items.map((item, index) => <li key={index}>{item.name}{item.company ? <span className="text-muted-foreground"> · {item.company}</span> : null}</li>)}</ul></div>;
  return <Dialog open onOpenChange={(open) => !open && !saving && onClose()}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
    <DialogHeader><DialogTitle>{first ? `Start on ${to.name}?` : `Move from ${from.name} to ${to.name}?`}</DialogTitle><DialogDescription>{to.price === null || Number(to.price) === 0 ? `${to.name} costs nothing.` : `${rupees(to.price)} a month plus GST, from today, renewing monthly.`}{first ? "" : " Nothing is deleted: what does not fit is archived, and comes back when your plan has room again."}</DialogDescription></DialogHeader>
    {!seen ? <div role="status" aria-label="Working out the change" className="h-40 animate-pulse rounded-lg bg-surface-2" /> : <div className={`grid gap-4 text-sm transition-opacity ${preview.stale ? "opacity-60" : ""}`}>
      {seen.archiveCompanies.length > 0 || tooMany ? <fieldset className="grid gap-1.5 rounded-lg border border-warning/30 bg-warning-muted/40 p-3">
        <legend className="px-1 text-xs font-semibold text-warning">{to.name} holds {limit} {limit === 1 ? "company" : "companies"}. Choose which to keep</legend>
        {seen.companies.map((item) => <label key={item.id} className="flex items-center gap-2"><input type="checkbox" checked={item.current || chosen.includes(item.id)} disabled={item.current || saving} onChange={() => toggle(item.id)} />{item.name}{item.current && <span className="text-xs text-muted-foreground">(open now, always kept)</span>}</label>)}
        {tooMany ? <p role="alert" className="text-xs text-danger">Keep no more than {limit}.</p> : <p className="text-xs text-muted-foreground">The others are archived: nobody can open them until you move up again.</p>}
      </fieldset> : null}
      {list("Archived", seen.archiveCompanies, "warn")}
      {list("People archived (they cannot sign in to that company)", seen.archivePeople, "warn")}
      {list("Invitations withdrawn", seen.withdrawInvitations, "warn")}
      {list("Coming back", seen.restoreCompanies, "good")}
      {list("People coming back", seen.restorePeople, "good")}
      <div className="rounded-lg border border-border px-3 py-2">
        {first ? null : seen.refund ? <div className="flex justify-between gap-3 py-1"><span className="text-muted-foreground">Refund for {seen.refund.daysUnused} unused of {seen.refund.daysTotal} days of {seen.refund.plan} ({seen.refund.invoice}){seen.refund.method === "test" ? ", recorded only: nothing was paid" : ", back to your Razorpay payment"}</span><span className="font-medium tabular-nums text-success">{rupees(seen.refund.amount)}</span></div> : <p className="py-1 text-muted-foreground">No refund: no paid days left on {from.name}.</p>}
        {seen.charge && <div className="flex justify-between gap-3 border-t border-border py-1 pt-2"><span className="text-muted-foreground">{pay ? "You pay now, GST included" : "A month of " + to.name + " (test mode: not charged)"}</span><span className="font-medium tabular-nums">{rupees(seen.charge)}</span></div>}
      </div>
    </div>}
    {preview.error && <p role="alert" className="text-xs text-danger">{preview.error}</p>}
    <DialogFooter><Button variant="outline" disabled={saving} onClick={onClose}>{first ? "Back" : `Keep ${from.name}`}</Button><Button disabled={saving || !seen || tooMany || preview.stale} onClick={() => void confirm()}>{saving ? (pay ? "Opening Razorpay…" : "Moving…") : pay && seen?.charge ? `Pay ${rupees(seen.charge)}` : first ? `Start ${to.name}` : `Move to ${to.name}`}</Button></DialogFooter>
  </DialogContent></Dialog>;
}

function InvoiceView({ invoice, gstRate, onClose }: { invoice: BillingInvoice; gstRate: number; onClose: () => void }) {
  const session = useSession();
  const row = (label: string, value: string, strong = false) => <div className={`flex justify-between gap-4 py-1.5 ${strong ? "border-t border-border pt-2 font-semibold" : ""}`}><span className={strong ? "" : "text-muted-foreground"}>{label}</span><span className="tabular-nums">{value}</span></div>;
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Invoice {invoice.number}</DialogTitle><DialogDescription>{invoice.sample ? "A sample made for testing: no payment was taken." : `Issued ${day(invoice.issuedOn)}.`}</DialogDescription></DialogHeader>
    <div className="grid gap-4 text-sm">
      <div className="grid grid-cols-2 gap-3"><div><p className="text-xs text-muted-foreground">Billed to</p><p className="font-medium">{session.user.name}</p><p className="text-xs text-muted-foreground">{session.user.email}</p></div><div className="text-right"><p className="text-xs text-muted-foreground">Issued</p><p className="font-medium">{day(invoice.issuedOn)}</p><p className="text-xs text-muted-foreground">{invoice.status === "paid" ? `Paid ${invoice.paidOn ? day(invoice.paidOn) : ""}` : "Due"}</p></div></div>
      <div className="rounded-lg border border-border px-3 py-2">
        {row(`Janus ${invoice.plan} plan, ${day(invoice.periodStart)} to ${day(invoice.periodEnd)}`, rupees(invoice.amount))}
        {row(`GST at ${gstRate}%`, rupees(invoice.gst))}
        {row("Total", rupees(invoice.total), true)}
      </div>
    </div>
    <DialogFooter><Button variant="outline" onClick={() => window.print()}><Printer className="size-3.5" />Print</Button><Button onClick={onClose}>Close</Button></DialogFooter>
  </DialogContent></Dialog>;
}
