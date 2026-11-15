"use client";

import Link from "next/link";
import { useApi } from "@/lib/api/use-api";
import { formatCurrencyINR } from "@/lib/utils";

type Reason = { category: string; label: string; count: number; value: string };

// What usually fixes the most common reason, the same advice Janus gives the owner.
const fixes: Record<string, string> = {
  price: "Show value before price, offer a smaller first order, and set the most discount anyone may give.",
  competitor: "Ask the next few lost customers whom they chose and why, and answer that in your pitch.",
  no_budget: "Qualify budget on the first call; offer a smaller package or instalments.",
  no_response: "Call new leads within an hour and set a follow-up date on every call.",
  timing: "Set a follow-up months ahead instead of closing these as lost.",
  not_a_fit: "Tighten who your ads and listings reach.",
};

/**
 * Why leads were lost in the last 90 days, by reason, with how many and the deal value lost, for
 * whoever runs the team. The most common reason comes first, with what usually fixes it.
 */
export function LostReasonsCard() {
  const result = useApi<Reason[]>("/lost-reasons?days=90");
  const reasons = result.data ?? [];
  const total = reasons.reduce((sum, item) => sum + item.count, 0);
  const top = reasons[0];
  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-[13px] font-semibold">Why leads are lost</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">The last 90 days, by the reason given when each lead or deal was marked lost.</p>
        </div>
        {total > 0 && <Link href="/leads?workspace=crm-sales" className="text-xs font-medium text-accent hover:underline">{total} lost</Link>}
      </div>
      {result.loading && !result.data ? <p className="mt-3 text-sm text-muted-foreground">Reading your records…</p>
        : result.error ? <p role="alert" className="mt-3 text-sm text-danger">Lost reasons could not be read: {result.error}</p>
        : !total ? <p className="mt-3 text-sm text-muted-foreground">Nothing lost in the last 90 days.</p>
        : <>
          <ul className="mt-3 flex flex-col gap-2.5">{reasons.map((item) => {
            const share = Math.round((item.count / total) * 100);
            return <li key={item.category}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{item.label}</span>
                <span className="tabular-nums text-muted-foreground">{item.count} · {share}%{Number(item.value) > 0 && ` · ${formatCurrencyINR(Number(item.value))}`}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-surface-2"><div className="h-1.5 rounded-full bg-danger/70" style={{ width: `${share}%` }} /></div>
            </li>;
          })}</ul>
          {top && fixes[top.category] && total >= 3 && <p className="mt-4 rounded-md bg-surface-2 px-3 py-2 text-xs"><span className="font-semibold">Most lost to {top.label.toLowerCase()}.</span> {fixes[top.category]}</p>}
        </>}
    </section>
  );
}
