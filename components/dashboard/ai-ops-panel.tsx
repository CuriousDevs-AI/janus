"use client";

import { Bot, UserRound, Wrench, Workflow, AlertTriangle, Timer } from "lucide-react";
import { useApi } from "@/lib/api/use-api";
import { formatNumber } from "@/lib/utils";

interface AiOpsStats { aiHandled: number; humanHandoffs: number; toolActions: number; automationSuccessRate: number; aiErrors: number; avgFirstResponseSeconds: number }

export function AiOpsPanel() {
  const { data, loading } = useApi<AiOpsStats>("/business/reports/ai-ops");
  const stats = data ?? { aiHandled: 0, humanHandoffs: 0, toolActions: 0, automationSuccessRate: 0, aiErrors: 0, avgFirstResponseSeconds: 0 };
  const rows = [
    { label: "AI handled", value: formatNumber(stats.aiHandled), icon: Bot, tone: "text-accent" },
    { label: "Human handoffs", value: formatNumber(stats.humanHandoffs), icon: UserRound, tone: "text-info" },
    { label: "Tool actions", value: formatNumber(stats.toolActions), icon: Wrench, tone: "text-muted-foreground" },
    { label: "Automation success", value: `${stats.automationSuccessRate}%`, icon: Workflow, tone: "text-success" },
    { label: "AI errors (30d)", value: String(stats.aiErrors), icon: AlertTriangle, tone: "text-warning" },
    { label: "Avg first response", value: `${stats.avgFirstResponseSeconds}s`, icon: Timer, tone: "text-muted-foreground" },
  ];
  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-[13px] font-semibold text-foreground">AI Operations</h2>
        <span className="text-[11px] text-muted-foreground">{loading ? "Loading…" : "Last 30 days"}</span>
      </div>
      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2.5 bg-surface px-4 py-3.5">
            <r.icon className={`size-3.5 shrink-0 ${r.tone}`} />
            <div className="flex flex-col">
              <span className="text-mono text-[15px] font-semibold leading-tight text-foreground">{r.value}</span>
              <span className="text-[11px] text-muted-foreground">{r.label}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
