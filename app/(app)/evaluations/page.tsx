"use client";

import * as React from "react";
import { AlertTriangle, Check, FlaskConical, Gauge, ShieldCheck, Zap } from "lucide-react";
import { useWorkspace } from "@/components/layout/workspace-context";

const workspaceLabels: Record<string, string> = {
  business: "Business", "crm-sales": "CRM & Sales", "hr-people": "HR & People",
  "finance-accounting": "Finance", "projects-delivery": "Projects", "customer-support": "Support",
  "operations-inventory": "Operations", "it-infrastructure": "IT", "team-chat": "Team Chat", portfolio: "Portfolio",
};

export default function AIDashboardPage() {
  const { workspaceId, workspace } = useWorkspace();
  const label = workspaceLabels[workspaceId] ?? workspace.name;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 px-4 py-6 sm:px-6 sm:py-7">
      <header>
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-accent">
          <FlaskConical className="size-3" />AI Dashboard
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{label} AI Dashboard</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Monitor AI quality, latency, hallucination rates and trust scores across {label.toLowerCase()} operations.
        </p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Trust Score" value={"—"} detail="Computed once agents run" icon={ShieldCheck} />
        <MetricCard label="Accuracy" value={"—"} detail="Correct answers from verified data" icon={Check} />
        <MetricCard label="Hallucination Rate" value={"—"} detail="Answers with unverified claims" icon={AlertTriangle} />
        <MetricCard label="Avg Latency" value={"—"} detail="Response time" icon={Zap} />
      </div>
      <div className="flex flex-col items-center py-12 text-center">
        <Gauge className="size-10 text-muted-foreground" />
        <h2 className="mt-4 text-base font-semibold">No AI metrics yet</h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          Quality, latency and trust metrics will appear here once your AI agents and workflows
          start running. Create an agent or workflow to begin collecting data.
        </p>
      </div>
    </div>
  );
}

function MetricCard({ label, value, detail, icon: Icon, tone = "neutral" }: { label: string; value: string; detail: string; icon: React.ElementType; tone?: "success" | "warning" | "danger" | "neutral" }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className={`flex size-7 items-center justify-center rounded-md ${tone === "success" ? "bg-emerald-100 text-emerald-700" : tone === "warning" ? "bg-amber-100 text-amber-700" : tone === "danger" ? "bg-red-100 text-red-700" : "bg-surface-2 text-muted-foreground"}`}>
          <Icon className="size-3.5" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
