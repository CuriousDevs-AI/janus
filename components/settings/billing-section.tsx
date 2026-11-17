"use client";

import * as React from "react";
import Link from "next/link";
import { useSession } from "@/components/auth/session-provider";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/settings/section-ui";

export function BillingSection() {
  return <AccountPlan />;
}

function AccountPlan() {
  const session = useSession();
  const owner = session.tenants.some((item) => item.role === "owner" && item.status === "active");
  return <div className="flex flex-col gap-5">
    <div><p className="text-[11px] font-medium uppercase tracking-wide text-accent">Account</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Plan & Billing</h2></div>
    <SectionCard title="The plan is for the account, not this company" description={`One plan covers every company its Owner owns, ${session.tenant.name} included.`}>
      <p className="text-sm text-muted-foreground">{owner ? "Choose and manage it in the Portfolio, under Plan and billing. Billing is not connected yet, so nothing is charged." : "The Owner of this company chooses and pays for the plan. Nothing here is billed to this company."}</p>
      {owner && <Button asChild size="sm" className="mt-3"><Link href="/portfolio?view=billing">Open Plan and billing</Link></Button>}
    </SectionCard>
  </div>;
}
