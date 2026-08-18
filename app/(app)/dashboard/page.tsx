"use client";

import { dashboardKpis, currentUser } from "@/lib/mock-data";
import { useAppStore } from "@/lib/stores/app-store";
import { MetricCard } from "@/components/shared/metric-card";
import { AttentionCenter } from "@/components/dashboard/attention-center";
import { PipelineStrip } from "@/components/dashboard/pipeline-strip";
import { AiOpsPanel } from "@/components/dashboard/ai-ops-panel";
import { ActivityTimeline } from "@/components/shared/activity-timeline";

export default function DashboardPage() {
  const activities = useAppStore((s) => s.activities);
  const recent = [...activities].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 12);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 px-6 py-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground">Good morning, {currentUser.name}.</h1>
        <p className="text-[13px] text-muted-foreground">Here&apos;s what needs your attention.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {dashboardKpis.map((k) => (
          <MetricCard key={k.label} label={k.label} value={k.value} delta={k.delta} trend={k.trend} />
        ))}
      </div>

      <AttentionCenter />
      <PipelineStrip />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="rounded-lg border border-border bg-surface lg:col-span-3">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-[13px] font-semibold text-foreground">Recent activity</h2>
            <span className="text-[11px] text-muted-foreground">Across all customers</span>
          </div>
          <div className="max-h-[440px] overflow-y-auto px-4 py-3">
            <ActivityTimeline activities={recent} showCustomer />
          </div>
        </div>
        <div className="lg:col-span-2">
          <AiOpsPanel />
        </div>
      </div>
    </div>
  );
}
