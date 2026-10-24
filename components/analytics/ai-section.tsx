import { useCrmStats } from "@/lib/use-crm-stats";
import { formatNumber } from "@/lib/utils";
import { MetricCard } from "@/components/shared/metric-card";

export function AiSection() {
  const { aiOpsStats } = useCrmStats();
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <MetricCard label="AI Handled" value={formatNumber(aiOpsStats.aiHandled)} />
      <MetricCard label="Human Handoffs" value={formatNumber(aiOpsStats.humanHandoffs)} />
      <MetricCard label="Tool Actions" value={formatNumber(aiOpsStats.toolActions)} />
      <MetricCard label="Automation Success" value={`${aiOpsStats.automationSuccessRate}%`} />
      <MetricCard label="AI Errors (30d)" value={String(aiOpsStats.aiErrors)} />
      <MetricCard label="Avg First Response" value={`${aiOpsStats.avgFirstResponseSeconds}s`} />
    </div>
  );
}
