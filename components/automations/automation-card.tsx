"use client";

import Link from "next/link";
import { toast } from "sonner";
import { Zap, Copy } from "lucide-react";
import { useAppStore } from "@/lib/stores/app-store";
import { automationTriggerMeta } from "@/lib/status-meta";
import { formatRelativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { automationStatusMeta } from "./automation-meta";
import type { Automation } from "@/lib/types";

export function AutomationCard({ automation }: { automation: Automation }) {
  const toggleAutomation = useAppStore((s) => s.toggleAutomation);
  const statusMeta = automationStatusMeta[automation.status];

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-foreground">{automation.name}</p>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Zap className="size-3 shrink-0 text-accent" />
            <span className="truncate">{automationTriggerMeta[automation.trigger]}</span>
          </p>
        </div>
        <Badge variant={statusMeta.tone} className="shrink-0">
          {statusMeta.label}
        </Badge>
      </div>

      <p className="line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground">{automation.description}</p>

      <div className="grid grid-cols-3 gap-2 rounded-md border border-border bg-surface-2/60 px-3 py-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Runs (30d)</span>
          <span className="text-mono text-[13px] font-semibold text-foreground">{automation.runs30d}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Success</span>
          <span className="text-mono text-[13px] font-semibold text-foreground">{automation.successRate}%</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Last run</span>
          <span className="truncate text-[12px] font-medium text-foreground">
            {automation.lastRunAt ? formatRelativeTime(automation.lastRunAt) : "Never"}
          </span>
        </div>
      </div>

      <div className="mt-1 flex items-center justify-between border-t border-border pt-3">
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="secondary" asChild>
            <Link href={`/automations/${automation.id}`}>Open</Link>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => toast.success("Automation duplicated", { description: automation.name })}
          >
            <Copy className="size-3.5" />
            Duplicate
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">{automation.status === "active" ? "On" : "Off"}</span>
          <Switch
            checked={automation.status === "active"}
            onCheckedChange={() => toggleAutomation(automation.id)}
            aria-label={`Toggle ${automation.name}`}
          />
        </div>
      </div>
    </div>
  );
}
