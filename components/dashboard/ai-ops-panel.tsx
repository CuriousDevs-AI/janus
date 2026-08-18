import { Bot, UserRound, Wrench, Workflow, AlertTriangle, Timer } from "lucide-react";
import { aiOpsStats } from "@/lib/mock-data";
import { formatNumber } from "@/lib/utils";

const rows = [
  { label: "AI handled", value: formatNumber(aiOpsStats.aiHandled), icon: Bot, tone: "text-accent" },
  { label: "Human handoffs", value: formatNumber(aiOpsStats.humanHandoffs), icon: UserRound, tone: "text-info" },
  { label: "Tool actions", value: formatNumber(aiOpsStats.toolActions), icon: Wrench, tone: "text-muted-foreground" },
  { label: "Automation success", value: `${aiOpsStats.automationSuccessRate}%`, icon: Workflow, tone: "text-success" },
  { label: "AI errors (30d)", value: String(aiOpsStats.aiErrors), icon: AlertTriangle, tone: "text-warning" },
  { label: "Avg first response", value: `${aiOpsStats.avgFirstResponseSeconds}s`, icon: Timer, tone: "text-muted-foreground" },
];

export function AiOpsPanel() {
  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-[13px] font-semibold text-foreground">AI Operations</h2>
        <span className="text-[11px] text-muted-foreground">Last 30 days</span>
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
