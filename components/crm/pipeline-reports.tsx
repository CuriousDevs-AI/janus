"use client";

import { useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { useApi } from "@/lib/api/use-api";
import type { DashboardStats, FunnelData, RepData, SourceBreakdown, DailyPoint } from "@/lib/api/types";
import { MetricCard } from "@/components/shared/metric-card";
import { formatCurrencyINR, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Area, AreaChart, CartesianGrid,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

function toCsv(headers: string[], rows: string[][]): string {
  return [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function PipelineReports({ days = 30 }: { days?: number }) {
  const [period, setPeriod] = useState(days);
  const stats = useApi<DashboardStats>("/dashboard/stats");
  const funnel = useApi<FunnelData[]>(`/dashboard/funnel?days=${period}`);
  const reps = useApi<RepData[]>(`/dashboard/reps?days=${period}`);
  const sources = useApi<SourceBreakdown[]>(`/dashboard/sources?days=${period}`);
  const daily = useApi<DailyPoint[]>(`/dashboard/daily?days=${period}`);

  const s = stats.data;
  const funnelData = funnel.data ?? [];
  const maxCount = Math.max(1, ...funnelData.map((f) => f.count));

  function reload() {
    stats.reload();
    funnel.reload();
    reps.reload();
    sources.reload();
    daily.reload();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setPeriod(d)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                period === d ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground hover:bg-surface-3",
              )}
            >
              {d}d
            </button>
          ))}
        </div>
        <Button size="sm" variant="ghost" onClick={reload}><RefreshCw className="size-3.5" /></Button>
      </div>

      {s && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <MetricCard label="Total Leads" value={String(s.totalLeads)} />
          <MetricCard label="Open Deals" value={String(s.openDeals)} />
          <MetricCard label="Pipeline" value={formatCurrencyINR(Number(s.pipelineValue))} />
          <MetricCard label="Won" value={formatCurrencyINR(Number(s.wonValue))} />
          <MetricCard label="Conversion" value={`${s.conversionRate}%`} />
        </div>
      )}

      <section className="rounded-lg border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-[13px] font-semibold">Sales Funnel</h3>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => downloadCsv("funnel.csv", toCsv(
              ["Stage", "Count", "Value"],
              funnelData.map((f) => [f.stage, String(f.count), f.value]),
            ))}
          >
            <Download className="size-3.5" />
          </Button>
        </div>
        <div className="p-4 space-y-2">
          {funnelData.map((f) => (
            <div key={f.stage} className="flex items-center gap-3">
              <span className="w-24 text-xs capitalize font-medium">{f.stage}</span>
              <div className="flex-1 h-6 bg-surface-3 rounded overflow-hidden">
                <div
                  className="h-full bg-accent rounded transition-all"
                  style={{ width: `${(f.count / maxCount) * 100}%` }}
                />
              </div>
              <span className="w-10 text-right text-xs font-semibold">{f.count}</span>
              <span className="w-24 text-right text-xs text-muted-foreground">{formatCurrencyINR(Number(f.value))}</span>
            </div>
          ))}
        </div>
      </section>

      {(daily.data ?? []).length > 0 && (
        <section className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between pb-3">
            <h3 className="text-[13px] font-semibold">Daily Trend</h3>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => downloadCsv("daily.csv", toCsv(
                ["Date", "Leads", "Won Deals", "Won Value"],
                (daily.data ?? []).map((d) => [d.date, String(d.leads), String(d.wonDeals), d.wonValue]),
              ))}
            >
              <Download className="size-3.5" />
            </Button>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily.data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                <Tooltip contentStyle={{ borderRadius: 8, borderColor: "var(--border)", background: "var(--surface)", fontSize: 12 }} />
                <Area type="monotone" dataKey="leads" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.15} strokeWidth={2} />
                <Area type="monotone" dataKey="wonDeals" stroke="var(--success)" fill="var(--success)" fillOpacity={0.1} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <section className="rounded-lg border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-[13px] font-semibold">Rep Leaderboard</h3>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => downloadCsv("reps.csv", toCsv(
              ["Rep", "Leads", "Won Deals", "Won Value", "Open Leads", "Conversion %"],
              (reps.data ?? []).map((r) => [r.name, String(r.leads), String(r.wonDeals), r.wonValue, String(r.openLeads), r.conversionRate]),
            ))}
          >
            <Download className="size-3.5" />
          </Button>
        </div>
        {(reps.data ?? []).length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">No rep data for this period.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rep</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">Won</TableHead>
                <TableHead className="text-right">Won Value</TableHead>
                <TableHead className="text-right">Open</TableHead>
                <TableHead className="text-right">Conv %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(reps.data ?? []).map((r, i) => (
                <TableRow key={r.ownerId ?? i}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right">{r.leads}</TableCell>
                  <TableCell className="text-right">{r.wonDeals}</TableCell>
                  <TableCell className="text-right">{formatCurrencyINR(Number(r.wonValue))}</TableCell>
                  <TableCell className="text-right">{r.openLeads}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={Number(r.conversionRate) >= 30 ? "success" : "neutral"}>{r.conversionRate}%</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="rounded-lg border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-[13px] font-semibold">Source ROI</h3>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => downloadCsv("sources.csv", toCsv(
              ["Source", "Leads", "Won", "Won Value", "Conversion %"],
              (sources.data ?? []).map((s) => [s.source, String(s.leads), String(s.won), s.wonValue, s.conversionRate]),
            ))}
          >
            <Download className="size-3.5" />
          </Button>
        </div>
        {(sources.data ?? []).length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">No source data for this period.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">Won</TableHead>
                <TableHead className="text-right">Won Value</TableHead>
                <TableHead className="text-right">Conv %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(sources.data ?? []).map((s) => (
                <TableRow key={s.source}>
                  <TableCell className="font-medium capitalize">{s.source.replace(/_/g, " ")}</TableCell>
                  <TableCell className="text-right">{s.leads}</TableCell>
                  <TableCell className="text-right">{s.won}</TableCell>
                  <TableCell className="text-right">{formatCurrencyINR(Number(s.wonValue))}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={Number(s.conversionRate) >= 20 ? "success" : "neutral"}>{s.conversionRate}%</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
