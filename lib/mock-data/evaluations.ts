import type { EvaluationRun } from "@/lib/types";

export const evaluationRuns: EvaluationRun[] = [
  { id: "eval-1", agentId: "agent-sales", runAt: "2026-10-21T02:00:00+05:30", datasetName: "sales-qualification-v4", accuracy: 91, groundedness: 94, toolSuccess: 97, escalationQuality: 88, policyCompliance: 99, verdict: "pass", comparedToVersion: "v2" },
  { id: "eval-2", agentId: "agent-sales", runAt: "2026-09-06T02:00:00+05:30", datasetName: "sales-qualification-v3", accuracy: 87, groundedness: 90, toolSuccess: 95, escalationQuality: 84, policyCompliance: 97, verdict: "pass", comparedToVersion: "v1" },
  { id: "eval-3", agentId: "agent-support", runAt: "2026-10-22T02:00:00+05:30", datasetName: "support-resolution-v6", accuracy: 83, groundedness: 89, toolSuccess: 92, escalationQuality: 90, policyCompliance: 98, verdict: "pass", comparedToVersion: "v4" },
  { id: "eval-4", agentId: "agent-support", runAt: "2026-08-31T02:00:00+05:30", datasetName: "support-resolution-v5", accuracy: 79, groundedness: 82, toolSuccess: 88, escalationQuality: 74, policyCompliance: 95, verdict: "regression", comparedToVersion: "v3" },
  { id: "eval-5", agentId: "agent-qualification", runAt: "2026-10-16T02:00:00+05:30", datasetName: "qualification-precision-v2", accuracy: 95, groundedness: 96, toolSuccess: 99, escalationQuality: 91, policyCompliance: 100, verdict: "pass", comparedToVersion: "v1" },
  { id: "eval-6", agentId: "agent-analyst", runAt: "2026-10-18T02:00:00+05:30", datasetName: "business-qa-v1", accuracy: 96, groundedness: 98, toolSuccess: 100, escalationQuality: 100, policyCompliance: 100, verdict: "pass" },
  { id: "eval-7", agentId: "agent-support", runAt: "2026-10-08T02:00:00+05:30", datasetName: "support-resolution-v6-preview", accuracy: 81, groundedness: 85, toolSuccess: 90, escalationQuality: 79, policyCompliance: 96, verdict: "warning", comparedToVersion: "v4" },
];

export function getEvaluationsForAgent(agentId: string): EvaluationRun[] {
  return evaluationRuns.filter((e) => e.agentId === agentId).sort((a, b) => (a.runAt < b.runAt ? 1 : -1));
}
