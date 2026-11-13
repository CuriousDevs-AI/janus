"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, message } from "@/lib/api/client";
import { ChangePlan } from "@/features/portfolio/components/plan";
import { usePortfolioApi } from "@/features/portfolio/lib/use-portfolio-api";
import type { Billing, BillingPlan } from "@/features/portfolio/types";

const rupees = (value: string) => Number(value).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

/**
 * The first thing a new Owner sees: the plans, to choose one before going on. Free starts at once;
 * a paid plan goes through checkout (or test mode). Afterwards the page reloads into where they
 * were going, so the shell asks no more.
 */
export function ChoosePlan() {
  const params = useSearchParams();
  const next = params.get("next");
  const target = next && next.startsWith("/") && !next.startsWith("//") && next !== "/choose-plan" ? next : "/setup";
  const billing = usePortfolioApi<Billing>("/billing");
  const [moving, setMoving] = React.useState<BillingPlan | null>(null);
  const [busy, setBusy] = React.useState(false);
  const go = () => window.location.assign(target);
  async function free() {
    setBusy(true);
    try { await api("/billing/plan", { method: "PUT", body: JSON.stringify({ plan: "free", keep: [] }) }); go(); }
    catch (error) { toast.error(message(error)); setBusy(false); }
  }
  const data = billing.data;
  return <div className="min-h-dvh bg-background px-4 py-10 sm:px-8">
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">Welcome to Janus</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Choose your plan</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">One plan for your account covers every company you own. Start free and move up when you add companies or people; you can change it any time in the Portfolio, under Plan and billing.</p>
      </div>
      {!data ? <div role="status" aria-label="Loading the plans" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((index) => <div key={index} className="h-[420px] animate-pulse rounded-2xl border border-border bg-surface-2" />)}</div>
        : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{data.plans.map((plan) => <section key={plan.id} aria-label={`${plan.name} plan`} className={`flex flex-col rounded-2xl border bg-surface p-5 ${plan.id === "startup" ? "border-accent ring-2 ring-accent/20" : "border-border"}`}>
          <div className="flex items-center justify-between gap-2"><h2 className="text-lg font-semibold">{plan.name}</h2>{plan.id === "startup" && <Badge variant="success">Most founders</Badge>}</div>
          <p className="mt-0.5 text-xs text-muted-foreground">{plan.tagline}</p>
          <p className="mt-4 text-3xl font-semibold tabular-nums">{plan.price === null ? "Custom" : rupees(plan.price)}{plan.price !== null && <span className="text-xs font-normal text-muted-foreground"> / month + GST</span>}</p>
          <ul className="mt-4 flex flex-1 flex-col gap-2 text-[13px]">{plan.features.map((feature) => <li key={feature} className="flex items-start gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />{feature}</li>)}</ul>
          <div className="mt-5">{plan.id === "free" ? <Button variant="outline" className="w-full" disabled={busy} onClick={() => void free()}>Start free</Button>
            : plan.id === "enterprise" ? <Button variant="outline" className="w-full" onClick={() => toast.message("Enterprise is set up with the Janus team, on agreed terms.", { description: "Start on another plan meanwhile; we will move you when it is agreed." })}>Talk to us</Button>
            : <Button className="w-full" variant={plan.id === "startup" ? "default" : "outline"} disabled={busy || data.payments === "off"} title={data.payments === "off" ? "Paid plans open once payments are connected" : undefined} onClick={() => setMoving(plan)}>Choose {plan.name}</Button>}</div>
        </section>)}</div>}
      {data?.payments === "test" && <p className="text-center text-xs text-warning">Test mode: payments are not connected, so a paid plan starts at once and nothing is charged.</p>}
    </div>
    {moving && data && <ChangePlan first from={data.plans[0]} to={moving} pay={data.payments === "razorpay"} onClose={() => setMoving(null)} onDone={go} />}
  </div>;
}
