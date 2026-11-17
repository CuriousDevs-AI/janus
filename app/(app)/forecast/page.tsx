"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Target, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { useSession } from "@/components/auth/session-provider";
import { can } from "@/lib/permissions";
import type { ForecastData, RepAttainment, SalesTarget } from "@/lib/api/types";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { formatCurrencyINR } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STAGE_WEIGHTS: Record<string, number> = {
  new: 5, contacted: 10, qualified: 20, demo: 40,
  proposal: 60, negotiation: 75, approval: 90,
};

function periodLabel(p: string) {
  const [y, m] = p.split("-");
  return new Date(Number(y), Number(m) - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function shiftPeriod(p: string, delta: number) {
  const [y, m] = p.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function ForecastPage() {
  const session = useSession();
  const canManage = can(session, "reports:read");
  const [period, setPeriod] = useState(currentPeriod);
  const [setTargetOpen, setSetTargetOpen] = useState(false);
  const [targetAmount, setTargetAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const forecast = useApi<ForecastData>(`/forecast?period=${period}`);
  const reps = useApi<RepAttainment[]>(`/forecast/reps?period=${period}`);
  const targets = useApi<SalesTarget[]>(`/targets?period=${period}`);

  const f = forecast.data;
  const targetVal = Number(f?.targetAmount ?? 0);
  const wonVal = Number(f?.wonToDate ?? 0);
  const pipelineVal = Number(f?.weightedPipeline ?? 0);
  const attainPct = targetVal > 0 ? Math.round((wonVal / targetVal) * 100) : 0;

  async function saveTarget() {
    if (!targetAmount.trim()) { toast.error("Enter a target amount"); return; }
    setBusy(true);
    try {
      await api("/targets", {
        method: "POST",
        body: JSON.stringify({ period, targetAmount: targetAmount.trim(), ownerId: null }),
      });
      toast.success("Target saved");
      setSetTargetOpen(false);
      setTargetAmount("");
      forecast.reload();
      targets.reload();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Sales Forecast"
        description={`Pipeline forecast for ${periodLabel(period)}`}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => { forecast.reload(); reps.reload(); targets.reload(); }}>
              <RefreshCw className="size-3.5" />
            </Button>
            {canManage && (
              <Button size="sm" onClick={() => setSetTargetOpen(true)}>
                <Target className="size-3.5" /> Set Target
              </Button>
            )}
          </div>
        }
      />

      <div className="flex items-center justify-center gap-4 border-b border-border px-6 pb-4">
        <Button size="sm" variant="ghost" onClick={() => setPeriod(shiftPeriod(period, -1))}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-sm font-semibold">{periodLabel(period)}</span>
        <Button size="sm" variant="ghost" onClick={() => setPeriod(shiftPeriod(period, 1))}>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {forecast.error && (
        <p role="alert" className="mx-6 mt-3 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          {forecast.error}
        </p>
      )}

      <div className="flex-1 overflow-auto px-6 py-5 space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard label="Target" value={targetVal > 0 ? formatCurrencyINR(targetVal) : "Not set"} />
          <MetricCard label="Won to date" value={formatCurrencyINR(wonVal)} />
          <MetricCard label="Weighted pipeline" value={formatCurrencyINR(pipelineVal)} />
          <MetricCard label="Attainment" value={targetVal > 0 ? `${attainPct}%` : "—"} />
        </div>

        {targetVal > 0 && (
          <div className="rounded-lg border border-border bg-surface p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Target Progress</h3>
            <div className="mt-3 h-6 overflow-hidden rounded-full bg-surface-3">
              <div
                className="flex h-full items-center rounded-full"
                style={{ width: `${Math.min(100, attainPct + (pipelineVal / targetVal * 100))}%` }}
              >
                <div
                  className="h-full rounded-l-full bg-success"
                  style={{ width: `${Math.min(100, attainPct / (attainPct + pipelineVal / targetVal * 100) * 100)}%` }}
                />
                <div className="h-full flex-1 bg-accent/40" />
              </div>
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
              <span>Won: {formatCurrencyINR(wonVal)}</span>
              <span>Pipeline: {formatCurrencyINR(pipelineVal)}</span>
              <span>Gap: {formatCurrencyINR(Number(f?.gap ?? 0))}</span>
            </div>
          </div>
        )}

        {f && (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Won to Date</p>
              <p className="mt-2 text-xl font-bold tabular-nums text-success">{formatCurrencyINR(wonVal)}</p>
              {targetVal > 0 && <p className="mt-1 text-[11px] text-muted-foreground">{attainPct}% of target</p>}
            </div>
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Weighted Pipeline</p>
              <p className="mt-2 text-xl font-bold tabular-nums text-accent">{formatCurrencyINR(pipelineVal)}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Likely to close this period</p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Gap to Target</p>
              <p className={`mt-2 text-xl font-bold tabular-nums ${Number(f.gap ?? 0) <= 0 ? "text-success" : "text-warning"}`}>
                {Number(f.gap ?? 0) <= 0 ? "On Track" : formatCurrencyINR(Number(f.gap))}
              </p>
              {Number(f.gap ?? 0) > 0 && pipelineVal > 0 && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Pipeline covers {Math.round((pipelineVal / Number(f.gap)) * 100)}% of gap
                </p>
              )}
            </div>
          </div>
        )}

        <section className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-[13px] font-semibold">Pipeline by Stage (Weighted)</h3>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Stage</TableHead>
                <TableHead className="text-right">Deals</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Weight</TableHead>
                <TableHead className="text-right">Weighted Value</TableHead>
                <TableHead className="hidden sm:table-cell">Distribution</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(() => {
                const breakdown = f?.stageBreakdown ?? Object.entries(STAGE_WEIGHTS).map(([stage, weight]) => ({
                  stage, count: 0, value: "0", weight, weightedValue: "0",
                }));
                const maxVal = Math.max(...breakdown.map((s) => Number(s.value)), 1);
                return breakdown.map((s) => (
                  <TableRow key={s.stage}>
                    <TableCell className="capitalize font-medium">{s.stage}</TableCell>
                    <TableCell className="text-right">{s.count}</TableCell>
                    <TableCell className="text-right">{formatCurrencyINR(Number(s.value))}</TableCell>
                    <TableCell className="text-right">{s.weight}%</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrencyINR(Number(s.weightedValue))}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-surface-3">
                        <div className="h-full rounded-full bg-accent/60" style={{ width: `${(Number(s.value) / maxVal) * 100}%` }} />
                      </div>
                    </TableCell>
                  </TableRow>
                ));
              })()}
            </TableBody>
          </Table>
        </section>

        <section className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-[13px] font-semibold">Rep Attainment</h3>
          </div>
          {(reps.data ?? []).length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No rep data for this period.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rep</TableHead>
                  <TableHead className="text-right">Target</TableHead>
                  <TableHead className="text-right">Won</TableHead>
                  <TableHead className="text-right">Pipeline</TableHead>
                  <TableHead className="text-right">Attainment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(reps.data ?? []).map((r) => (
                  <TableRow key={r.ownerId}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-right">{formatCurrencyINR(Number(r.target))}</TableCell>
                    <TableCell className="text-right">{formatCurrencyINR(Number(r.won))}</TableCell>
                    <TableCell className="text-right">{formatCurrencyINR(Number(r.pipeline))}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="hidden w-20 sm:block">
                          <div className="h-2 overflow-hidden rounded-full bg-surface-3">
                            <div
                              className={`h-full rounded-full ${Number(r.attainmentPercent) >= 100 ? "bg-success" : Number(r.attainmentPercent) >= 50 ? "bg-accent" : "bg-amber-500"}`}
                              style={{ width: `${Math.min(100, Number(r.attainmentPercent))}%` }}
                            />
                          </div>
                        </div>
                        <Badge variant={Number(r.attainmentPercent) >= 100 ? "success" : Number(r.attainmentPercent) >= 50 ? "accent" : "neutral"}>
                          {r.attainmentPercent}%
                        </Badge>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      </div>

      <Dialog open={setTargetOpen} onOpenChange={setSetTargetOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Set Sales Target — {periodLabel(period)}</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Target Amount (INR)</Label>
            <Input
              type="number"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              placeholder="e.g. 5000000"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSetTargetOpen(false)}>Cancel</Button>
            <Button onClick={saveTarget} disabled={busy}>{busy ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
