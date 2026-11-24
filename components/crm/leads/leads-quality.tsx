"use client";

import { TrendingUp, BarChart3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LEAD_STAGES as stages, stageLabel as label } from "@/lib/lead-stages";
import { sourceMeta } from "@/lib/lead-sources";
import { SourceBadge } from "@/components/shared/source-badge";
import { isDue } from "@/components/crm/follow-up";
import type { Row } from "./types";

export function LeadQualityBar({ rows }: { rows: Row[] }) {
  const leads = rows.map(({ lead }) => lead);
  const total = leads.length;
  const converted = leads.filter((l) => l.stage === "converted").length;
  const conversion = total > 0 ? Math.round((converted / total) * 100) : 0;
  const overdue = leads.filter((l) => isDue(l.nextFollowUpOn) && !["converted", "lost"].includes(l.stage)).length;
  const stageNew = leads.filter((l) => l.stage === "new").length;
  const active = leads.filter((l) => !["converted", "lost"].includes(l.stage)).length;
  const qualified = leads.filter((l) => ["qualified", "converted"].includes(l.stage)).length;
  const qualifyRate = total > 0 ? Math.round((qualified / total) * 100) : 0;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-2 text-[11px] text-muted-foreground">
      <span><span className="font-semibold tabular-nums text-foreground">{stageNew}</span> new</span>
      <span><span className="font-semibold tabular-nums text-foreground">{active}</span> active</span>
      <span><span className={cn("font-semibold tabular-nums", qualifyRate >= 30 ? "text-success" : "text-foreground")}>{qualifyRate}%</span> qualified</span>
      <span><span className={cn("font-semibold tabular-nums", conversion >= 25 ? "text-success" : conversion > 0 ? "text-warning" : "text-foreground")}>{conversion}%</span> conversion</span>
      {overdue > 0 && <span className="text-warning"><span className="font-semibold tabular-nums">{overdue}</span> overdue</span>}
    </div>
  );
}

export function LeadQualityAnalysis({ rows }: { rows: Row[] }) {
  const leads = rows.map(({ lead }) => lead);
  const total = leads.length;
  const converted = leads.filter((l) => l.stage === "converted").length;
  const lost = leads.filter((l) => l.stage === "lost").length;
  const active = leads.filter((l) => !["converted", "lost"].includes(l.stage)).length;

  const stageCounts = stages.map((s) => ({ stage: s, count: leads.filter((l) => l.stage === s).length }));
  const maxStage = Math.max(...stageCounts.map((s) => s.count), 1);

  const sourceCounts = leads.reduce<Record<string, { total: number; converted: number; lost: number }>>((acc, l) => {
    if (!acc[l.source]) acc[l.source] = { total: 0, converted: 0, lost: 0 };
    acc[l.source].total++;
    if (l.stage === "converted") acc[l.source].converted++;
    if (l.stage === "lost") acc[l.source].lost++;
    return acc;
  }, {});
  const sourceRows = Object.entries(sourceCounts).sort((a, b) => b[1].total - a[1].total);

  const withFollowUp = leads.filter((l) => l.nextFollowUpOn && !["converted", "lost"].includes(l.stage)).length;
  const overdue = leads.filter((l) => isDue(l.nextFollowUpOn) && !["converted", "lost"].includes(l.stage)).length;
  const noFollowUp = leads.filter((l) => !l.nextFollowUpOn && !["converted", "lost"].includes(l.stage)).length;
  const withEmail = leads.filter((l) => l.email).length;
  const withCompany = leads.filter((l) => l.company).length;
  const unassigned = leads.filter((l) => !l.ownerId).length;
  const conversion = total > 0 ? Math.round((converted / total) * 100) : 0;
  const qualifiedCount = leads.filter((l) => ["qualified", "converted"].includes(l.stage)).length;
  const qualifyRate = total > 0 ? Math.round((qualifiedCount / total) * 100) : 0;
  const dataScore = Math.round(((withEmail / Math.max(total, 1)) * 40 + (withCompany / Math.max(total, 1)) * 30 + (withFollowUp / Math.max(active, 1)) * 30));

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {([
          ["Pipeline Health", `${active} active`, `${converted} converted · ${lost} lost`, conversion >= 25 ? "bg-success" : "bg-warning"],
          ["Conversion Rate", `${conversion}%`, `${converted} of ${converted + lost} closed`, conversion >= 30 ? "bg-success" : conversion >= 15 ? "bg-warning" : "bg-danger"],
          ["Qualification Rate", `${qualifyRate}%`, `${qualifiedCount} of ${total} leads`, qualifyRate >= 40 ? "bg-success" : qualifyRate >= 20 ? "bg-warning" : "bg-danger"],
          ["Data Quality Score", `${dataScore}/100`, `${withEmail} email · ${withCompany} company`, dataScore >= 70 ? "bg-success" : dataScore >= 40 ? "bg-warning" : "bg-danger"],
        ] as const).map(([title, value, detail, dot]) => (
          <div key={title} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center gap-1.5"><span className={cn("size-2 rounded-full", dot)} /><span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</span></div>
            <div className="mt-1.5 text-2xl font-bold tabular-nums">{value}</div>
            <span className="text-[11px] text-muted-foreground">{detail}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold flex items-center gap-2"><TrendingUp className="size-4 text-accent" /> Stage Distribution</h3>
          <div className="space-y-2">
            {stageCounts.map(({ stage: s, count }) => (
              <div key={s} className="flex items-center gap-3">
                <span className="w-24 text-xs text-muted-foreground truncate">{label(s)}</span>
                <div className="flex-1 h-5 rounded bg-surface-2 overflow-hidden">
                  <div className={cn("h-full rounded transition-all", s === "converted" ? "bg-success" : s === "lost" ? "bg-danger" : s === "new" ? "bg-accent" : "bg-accent/60")} style={{ width: `${(count / maxStage) * 100}%` }} />
                </div>
                <span className="w-8 text-right text-xs font-semibold tabular-nums">{count}</span>
                <span className="w-10 text-right text-[10px] text-muted-foreground">{total > 0 ? Math.round((count / total) * 100) : 0}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold flex items-center gap-2"><BarChart3 className="size-4 text-accent" /> Source Performance</h3>
          {sourceRows.length === 0 ? <p className="text-xs text-muted-foreground">No source data available.</p> : (
            <div className="space-y-2.5">
              {sourceRows.slice(0, 8).map(([src, data]) => {
                const srcConv = data.converted + data.lost > 0 ? Math.round((data.converted / (data.converted + data.lost)) * 100) : null;
                return (
                  <div key={src} className="flex items-center gap-3">
                    <SourceBadge source={src} className="w-28 shrink-0" />
                    <div className="flex-1 h-5 rounded bg-surface-2 overflow-hidden">
                      <div className={cn("h-full rounded", sourceMeta(src).bg.replace("/10", "/40"))} style={{ width: `${(data.total / Math.max(sourceRows[0][1].total, 1)) * 100}%` }} />
                    </div>
                    <span className="w-8 text-right text-xs font-semibold tabular-nums">{data.total}</span>
                    {srcConv !== null && <Badge variant={srcConv >= 30 ? "success" : srcConv >= 15 ? "warning" : "neutral"} className="text-[10px]">{srcConv}%</Badge>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold">Follow-up Health</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Follow-ups scheduled</span><span className="text-sm font-semibold">{withFollowUp}<span className="ml-1 text-xs text-muted-foreground font-normal">/ {active} active</span></span></div>
            <div className="h-2.5 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full bg-accent" style={{ width: `${active > 0 ? (withFollowUp / active) * 100 : 0}%` }} /></div>
            {overdue > 0 && <div className="flex items-center gap-1.5 text-xs text-warning font-medium"><span className="size-1.5 rounded-full bg-warning" />{overdue} overdue follow-up{overdue !== 1 ? "s" : ""}</div>}
            {noFollowUp > 0 && <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="size-1.5 rounded-full bg-muted-foreground" />{noFollowUp} active lead{noFollowUp !== 1 ? "s" : ""} without follow-up</div>}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold">Data Completeness</h3>
          <div className="space-y-2.5">
            {([
              ["Has email", withEmail, total],
              ["Has company", withCompany, total],
              ["Assigned", total - unassigned, total],
              ["Follow-up set", withFollowUp, active],
            ] as const).map(([label, count, of]) => (
              <div key={label}>
                <div className="flex items-center justify-between mb-1"><span className="text-xs text-muted-foreground">{label}</span><span className="text-xs font-semibold tabular-nums">{of > 0 ? Math.round((count / of) * 100) : 0}%</span></div>
                <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden"><div className={cn("h-full rounded-full", count / Math.max(of, 1) >= 0.7 ? "bg-success" : count / Math.max(of, 1) >= 0.4 ? "bg-warning" : "bg-danger")} style={{ width: `${of > 0 ? (count / of) * 100 : 0}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold">Pipeline Velocity</h3>
          <div className="space-y-3">
            <div className="text-center py-2">
              <div className="text-3xl font-bold tabular-nums">{active}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Active leads in pipeline</div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg bg-surface-2 p-2.5">
                <div className="text-lg font-bold text-success tabular-nums">{converted}</div>
                <div className="text-[10px] text-muted-foreground">Converted</div>
              </div>
              <div className="rounded-lg bg-surface-2 p-2.5">
                <div className="text-lg font-bold text-danger tabular-nums">{lost}</div>
                <div className="text-[10px] text-muted-foreground">Lost</div>
              </div>
            </div>
            {unassigned > 0 && <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning font-medium">{unassigned} lead{unassigned !== 1 ? "s" : ""} unassigned — assign someone to improve response time</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
