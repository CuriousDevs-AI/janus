"use client";

import { Building2, CreditCard, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/settings/section-ui";
import { useSession } from "@/components/auth/session-provider";
import { useRoles } from "@/features/portfolio/lib/companies";
import type { PortfolioCompany } from "@/features/portfolio/types";

/**
 * The account's plan and billing. A plan belongs to the person's login, the way a membership does,
 * and covers every company they own; it is never set company by company. Billing is not connected to
 * a payment provider yet, so this says so rather than showing a plan, seats or invoices.
 */
export function Plan({ list }: { list: PortfolioCompany[] }) {
  const session = useSession();
  const { owns } = useRoles();
  const owned = list.filter(owns);
  const people = owned.reduce((sum, item) => sum + item.members, 0);
  if (!owned.length) return <SectionCard title="Plan and billing" description="The plan belongs to the Owner's account.">
    <p className="text-sm text-muted-foreground">The Owner of these companies chooses and pays for the plan. Nothing here is billed to you.</p>
  </SectionCard>;
  return <>
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 md:flex-row md:items-center md:justify-between">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-muted text-accent"><CreditCard className="size-5" aria-hidden /></span>
        <div>
          <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">No plan yet</h2><Badge variant="neutral">Nothing is charged</Badge></div>
          <p className="mt-1 text-sm text-muted-foreground">Your plan is for your account, {session.user.name} ({session.user.email}), and covers every company you own. Billing is not connected yet, so there is no plan, payment method or invoice to show.</p>
        </div>
      </div>
    </section>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      <Figure icon={<Building2 className="size-3.5" />} label="Companies covered" value={String(owned.length)} detail="Every company you own, under one plan" />
      <Figure icon={<Users className="size-3.5" />} label="People using Janus" value={String(people)} detail="Active logins across those companies" />
      <Figure icon={<CreditCard className="size-3.5" />} label="Billed to" value="Your account" detail="Not to any one company" />
    </div>
    <SectionCard title="Companies on this plan" description="A company you add joins the same plan. A company someone else owns is on their plan, not yours.">
      <ul className="divide-y divide-border">{owned.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm first:pt-0 last:pb-0">
        <span className="font-medium">{item.name}</span><span className="text-xs text-muted-foreground">{item.members} {item.members === 1 ? "login" : "logins"}</span>
      </li>)}</ul>
    </SectionCard>
  </>;
}

function Figure({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return <div className="rounded-xl border border-border bg-surface p-4"><p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{icon}{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p><p className="text-xs text-muted-foreground">{detail}</p></div>;
}
