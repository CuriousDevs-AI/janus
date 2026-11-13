"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/settings/section-ui";
import { usePortfolioApi } from "@/features/portfolio/lib/use-portfolio-api";
import type { PortfolioActivity, PortfolioCompany } from "@/features/portfolio/types";

const dayName = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/** One timeline of what happened in every company, newest first, grouped by day. */
export function Activity({ list }: { list: PortfolioCompany[] }) {
  const [days, setDays] = React.useState(7);
  const feed = usePortfolioApi<PortfolioActivity>(`/portfolio/activity?days=${days}`, { keepPrevious: true });
  const [company, setCompany] = React.useState("all");
  const [area, setArea] = React.useState("all");
  const items = (feed.data?.items ?? []).filter((item) => (company === "all" || item.companyId === company) && (area === "all" || item.area === area));
  const areas = [...new Set((feed.data?.items ?? []).map((item) => item.area))].sort();
  const groups = items.reduce<[string, typeof items][]>((out, item) => {
    const label = dayName(item.at);
    const last = out[out.length - 1];
    if (last && last[0] === label) last[1].push(item); else out.push([label, [item]]);
    return out;
  }, []);
  return <SectionCard title="What happened" description="Across every company you see. Invoices, bills and payments show their number and amount where your role includes money. Several of one kind close together read as one line.">
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div role="group" aria-label="How far back" className="flex gap-1">{[1, 7, 30].map((value) => <Button key={value} size="sm" variant={days === value ? "default" : "outline"} aria-pressed={days === value} onClick={() => setDays(value)}>{value === 1 ? "Today" : `${value} days`}</Button>)}</div>
      <select aria-label="Company" className="h-8 rounded-md border border-input bg-surface-2 px-2 text-[13px]" value={company} onChange={(event) => setCompany(event.target.value)}><option value="all">All companies</option>{list.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select aria-label="Area" className="h-8 rounded-md border border-input bg-surface-2 px-2 text-[13px]" value={area} onChange={(event) => setArea(event.target.value)}><option value="all">Every area</option>{areas.map((value) => <option key={value}>{value}</option>)}</select>
    </div>
    {feed.loading ? <div role="status" aria-label="Loading" className="h-40 animate-pulse rounded-md bg-surface-2" />
      : feed.error ? <div role="alert" className="flex items-center gap-3 text-sm text-danger">{feed.error}<Button size="sm" variant="secondary" onClick={feed.reload}>Try again</Button></div>
      : groups.length === 0 ? <p className="text-sm text-muted-foreground">Nothing happened in this time{company !== "all" || area !== "all" ? " that matches the filters" : ""}.</p>
      : <div className="flex flex-col gap-5">{groups.map(([label, entries]) => <section key={label}><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</h3><ul className="flex flex-col divide-y divide-border rounded-md border border-border">{entries.map((item, index) => <li key={`${item.at}-${index}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2 text-sm"><span className="w-16 shrink-0 text-xs tabular-nums text-muted-foreground">{time(item.at)}</span><span className="min-w-0 flex-1"><span className="font-medium">{item.who}</span> {item.text}{item.amount && <span className="font-medium tabular-nums">, {item.amount}</span>}{item.flag && <span className={`ml-2 rounded border px-1 py-px align-middle text-[10px] font-medium ${item.flag === "reversal" ? "border-danger/40 text-danger" : "border-warning/40 text-warning"}`}>{item.flag === "reversal" ? "Reversal" : "Edit"}</span>}{item.detail && <span className="block text-xs text-muted-foreground">{item.detail}</span>}</span><span className="text-xs text-muted-foreground">{item.company} · {item.area}</span></li>)}</ul></section>)}</div>}
  </SectionCard>;
}
