"use client";

import { use } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Play, Zap } from "lucide-react";
import { useAppStore } from "@/lib/stores/app-store";
import { automationRuns, getCustomerById } from "@/lib/mock-data";
import { automationTriggerMeta } from "@/lib/status-meta";
import { formatDate, formatDateTime, formatRelativeTime, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { MetricCard } from "@/components/shared/metric-card";
import { WorkflowCanvas } from "@/components/automations/workflow-canvas";
import { automationStatusMeta, automationRunStatusMeta } from "@/components/automations/automation-meta";

export default function AutomationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const automation = useAppStore((s) => s.automations.find((a) => a.id === id));
  const toggleAutomation = useAppStore((s) => s.toggleAutomation);
  const runAutomationOnce = useAppStore((s) => s.runAutomationOnce);

  const runs = automationRuns
    .filter((r) => r.automationId === id)
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));

  if (!automation) {
    return (
      <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-2 px-6 py-16 text-center">
        <p className="text-[14px] font-medium text-foreground">Automation not found</p>
        <Button size="sm" variant="secondary" asChild>
          <Link href="/automations">Back to automations</Link>
        </Button>
      </div>
    );
  }

  const statusMeta = automationStatusMeta[automation.status];

  return (
    <div className="mx-auto flex max-w-[1300px] flex-col gap-5 px-6 py-6">
      <Link href="/automations" className="flex w-fit items-center gap-1.5 text-[12px] text-muted-foreground hover:text-accent">
        <ArrowLeft className="size-3.5" />
        Automations
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <h1 className="text-[22px] font-semibold tracking-tight text-foreground">{automation.name}</h1>
            <Badge variant={statusMeta.tone}>{statusMeta.label}</Badge>
          </div>
          <p className="max-w-xl text-[13px] text-muted-foreground">{automation.description}</p>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Zap className="size-3 text-accent" />
            Trigger: {automationTriggerMeta[automation.trigger]}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">
              {automation.status === "active" ? "Active" : "Inactive"}
            </span>
            <Switch
              checked={automation.status === "active"}
              onCheckedChange={() => toggleAutomation(automation.id)}
              aria-label={`Toggle ${automation.name}`}
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              runAutomationOnce(automation.id);
              toast.success("Automation run started");
            }}
          >
            <Play className="size-3.5" />
            Run once
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Runs (30d)" value={String(automation.runs30d)} />
        <MetricCard label="Success rate" value={`${automation.successRate}%`} />
        <MetricCard label="Last run" value={automation.lastRunAt ? formatRelativeTime(automation.lastRunAt) : "Never"} />
        <MetricCard label="Created" value={formatDate(automation.createdAt)} />
      </div>

      <WorkflowCanvas automationId={automation.id} workflowNodes={automation.nodes} />

      <div className="flex flex-col gap-3 pb-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recent runs</p>
        {runs.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">No runs recorded yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {runs.map((run) => {
              const runMeta = automationRunStatusMeta[run.status];
              const customer = getCustomerById(run.customerId);
              return (
                <div key={run.id} className="rounded-lg border border-border bg-surface px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={runMeta.tone}>{runMeta.label}</Badge>
                      <span className="text-[12.5px] text-foreground">{customer?.name ?? "Unknown customer"}</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">Started {formatRelativeTime(run.startedAt)}</span>
                  </div>
                  <div className="mt-2.5 flex flex-col gap-1.5 border-l border-border pl-3">
                    {run.log.map((entry, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2 text-[12px]">
                        <span className="flex items-center gap-1.5 text-foreground">
                          <span
                            className={cn(
                              "size-1.5 shrink-0 rounded-full",
                              entry.result === "ok"
                                ? "bg-success"
                                : entry.result === "failed"
                                  ? "bg-danger"
                                  : "bg-warning"
                            )}
                          />
                          {entry.step}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">{formatDateTime(entry.at)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
