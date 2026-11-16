"use client";

import Link from "next/link";
import type { Deal, Lead } from "@/lib/api/types";
import { formatCurrencyINR } from "@/lib/utils";

type Row = { key: string; name: string; open: number; dueToday: number; overdue: number; pipeline: number; wonThisMonth: number; wonValue: number };

const todayIst = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const monthOf = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 7);

/**
 * The sales team at a glance for whoever runs it: each person's open leads, the calls they owe today
 * and those already late, their open pipeline and what they won this month, with the leads nobody
 * owns last. Built from the leads and deals on the page.
 */
export function TeamToday({ leads, deals }: { leads: Lead[]; deals: Deal[] }) {
  const today = todayIst();
  const month = today.slice(0, 7);
  const rows = new Map<string, Row>();
  const row = (id: string | null, name: string | null) => {
    const key = id ?? "nobody";
    if (!rows.has(key)) rows.set(key, { key, name: id ? name || "A former member" : "Nobody yet", open: 0, dueToday: 0, overdue: 0, pipeline: 0, wonThisMonth: 0, wonValue: 0 });
    return rows.get(key)!;
  };
  for (const lead of leads) {
    if (["won", "lost"].includes(lead.stage)) continue;
    const item = row(lead.ownerId, lead.ownerName);
    item.open += 1;
    if (lead.nextFollowUpOn === today) item.dueToday += 1;
    else if (lead.nextFollowUpOn && lead.nextFollowUpOn < today) item.overdue += 1;
  }
  for (const deal of deals) {
    const item = row(deal.ownerId, deal.ownerName);
    if (!["won", "lost"].includes(deal.stage)) item.pipeline += Number(deal.amount);
    if (deal.stage === "won" && monthOf(deal.updatedAt) === month) { item.wonThisMonth += 1; item.wonValue += Number(deal.amount); }
  }
  const list = [...rows.values()].sort((a, b) => Number(a.key === "nobody") - Number(b.key === "nobody") || b.overdue - a.overdue || b.pipeline - a.pipeline);
  if (!list.length) return null;
  return <section className="rounded-lg border border-border bg-surface p-5">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <div><h2 className="text-[13px] font-semibold">Team today</h2><p className="mt-1 text-[11px] text-muted-foreground">Each person&apos;s open leads, the calls they owe today and those already late, their open pipeline and this month&apos;s wins.</p></div>
      <Link href="/leads?workspace=crm-sales" className="text-xs font-medium text-accent hover:underline">Assign leads</Link>
    </div>
    <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[620px] text-sm">
      <thead><tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground"><th className="py-2 pr-3">Person</th><th className="px-3 py-2 text-right">Open leads</th><th className="px-3 py-2 text-right">Calls today</th><th className="px-3 py-2 text-right">Overdue</th><th className="px-3 py-2 text-right">Open pipeline</th><th className="py-2 pl-3 text-right">Won this month</th></tr></thead>
      <tbody>{list.map((item) => <tr key={item.key} className="border-b border-border last:border-0">
        <td className={`py-2 pr-3 ${item.key === "nobody" ? "text-warning" : "font-medium"}`}>{item.name}</td>
        <td className="px-3 py-2 text-right tabular-nums">{item.open}</td>
        <td className="px-3 py-2 text-right tabular-nums">{item.dueToday || "—"}</td>
        <td className={`px-3 py-2 text-right tabular-nums ${item.overdue ? "font-semibold text-warning" : ""}`}>{item.overdue || "—"}</td>
        <td className="px-3 py-2 text-right tabular-nums">{item.pipeline ? formatCurrencyINR(item.pipeline) : "—"}</td>
        <td className="py-2 pl-3 text-right tabular-nums">{item.wonThisMonth ? `${item.wonThisMonth} · ${formatCurrencyINR(item.wonValue)}` : "—"}</td>
      </tr>)}</tbody>
    </table></div>
  </section>;
}
