"use client";

import * as React from "react";
import { toast } from "sonner";
import { SectionCard } from "@/components/settings/section-ui";
import { api, message } from "@/lib/api/client";
import { usePortfolioApi } from "@/features/portfolio/lib/use-portfolio-api";
import { useRoles } from "@/features/portfolio/lib/companies";
import { inr } from "@/features/portfolio/lib/format";
import { parseHistory } from "@/features/portfolio/lib/history-csv";
import type { PortfolioCompany, PortfolioTrends } from "@/features/portfolio/types";

/** Each company's last twelve finished months against the same months a year before, from Janus's
 * records or months imported from Tally or Zoho Books. */
export function LastYear({ list }: { list: PortfolioCompany[] }) {
  const { handlesMoney } = useRoles();
  const trends = usePortfolioApi<PortfolioTrends>("/portfolio/trends?unit=month&count=25");
  const editable = list.filter((item) => handlesMoney(item));
  const [companyId, setCompanyId] = React.useState(editable[0]?.id ?? "");
  const [source, setSource] = React.useState<"tally" | "zoho" | "other">("tally");
  const [busy, setBusy] = React.useState(false);
  const upload = async (file: File) => {
    setBusy(true);
    try {
      const parsed = parseHistory(await file.text());
      if (parsed.rows.length === 0) throw new Error("No month with sales was found.");
      const result = await api<{ months: number }>(`/portfolio/companies/${companyId}/history`, { method: "POST", body: JSON.stringify({ source, months: parsed.rows.slice(0, 120) }) });
      toast.success(`${result.months} months imported${parsed.skipped ? `; ${parsed.skipped} rows that were not a month left out` : ""}.`);
      trends.reload();
    } catch (error) { toast.error(message(error)); } finally { setBusy(false); }
  };
  const rows = (trends.data?.companies ?? []).map((company) => {
    // Points are oldest first; the newest is this month, still running, so it is left out.
    const points = company.points.slice(0, -1);
    const recent = points.slice(-12), before = points.slice(-24, -12);
    const sum = (items: typeof points) => items.reduce((total, point) => total + Number(point.netSales ?? 0), 0);
    const known = before.some((point) => Number(point.netSales ?? 0) > 0);
    return { id: company.id, name: company.name, now: sum(recent), then: sum(before), known, imported: points.some((point) => point.imported), money: points.some((point) => point.netSales !== null) };
  }).filter((row) => row.money);
  if (!list.some((item) => item.books)) return null;
  return <SectionCard title="Against last year" description="Sales before GST over the last twelve finished months, against the twelve before, from Janus's records and months imported from Tally or Zoho Books where Janus has none.">
    {trends.loading ? <div role="status" aria-label="Loading" className="h-40 animate-pulse rounded-md bg-surface-2" /> : <ul className="flex flex-col divide-y divide-border">{rows.map((row) => <li key={row.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5 text-sm first:pt-0 last:pb-0">
      <span className="font-medium">{row.name}</span>
      <span className="tabular-nums">{inr(row.now)}</span>
      <span className="text-muted-foreground">{row.known ? `against ${inr(row.then)} the year before` : "no sales on record for the year before"}</span>
      {row.known && row.then > 0 && <span className={`ml-auto tabular-nums font-medium ${row.now >= row.then ? "text-success" : "text-danger"}`}>{row.now >= row.then ? "▲" : "▼"} {Math.abs(Math.round(((row.now - row.then) / row.then) * 100))}%</span>}
      {row.imported && <span className="text-xs text-muted-foreground">includes imported months</span>}
    </li>)}</ul>}
    {editable.length > 0 && <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-3">
      <label className="grid gap-1 text-xs text-muted-foreground">Company<select className="h-9 rounded-md border border-input bg-surface-2 px-2 text-sm text-foreground" value={companyId} onChange={(event) => setCompanyId(event.target.value)}>{editable.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="grid gap-1 text-xs text-muted-foreground">From<select className="h-9 rounded-md border border-input bg-surface-2 px-2 text-sm text-foreground" value={source} onChange={(event) => setSource(event.target.value as typeof source)}><option value="tally">Tally</option><option value="zoho">Zoho Books</option><option value="other">Another system</option></select></label>
      <label className={`inline-flex h-9 cursor-pointer items-center rounded-md border border-border px-3 text-sm ${busy ? "opacity-50" : ""}`}>Import monthly summary (CSV)<input type="file" accept=".csv,text/csv" className="sr-only" disabled={busy || !companyId} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} /></label>
      <p className="w-full text-xs text-muted-foreground">One row a month with the month, sales and purchases or expenses, such as Tally&apos;s monthly Sales and Purchase registers or Zoho Books&apos; profit and loss by month, saved as CSV.</p>
    </div>}
  </SectionCard>;
}
