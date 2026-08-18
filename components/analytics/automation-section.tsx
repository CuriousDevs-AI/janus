import { automationStats } from "@/lib/mock-data";
import { formatNumber } from "@/lib/utils";
import { MetricCard } from "@/components/shared/metric-card";

export function AutomationSection() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <MetricCard label="Runs (30d)" value={formatNumber(automationStats.totalRuns30d)} />
      <MetricCard label="Success Rate" value={`${automationStats.successRate}%`} />
      <MetricCard label="Failed Runs (30d)" value={String(automationStats.failedRuns30d)} />
      <MetricCard label="Approvals Triggered" value={String(automationStats.approvalsTriggered30d)} />
    </div>
  );
}
