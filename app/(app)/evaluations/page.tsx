"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, FlaskConical } from "lucide-react";
import { agents, evaluationRuns, getAgentById, getEvaluationsForAgent } from "@/lib/mock-data";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { EmptyState } from "@/components/shared/empty-state";
import { VerdictBadge } from "@/components/agents/agent-meta";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate } from "@/lib/utils";

export default function EvaluationsPage() {
  const [agentFilter, setAgentFilter] = React.useState<string>("all");

  const latestByAgent = agents
    .map((a) => getEvaluationsForAgent(a.id)[0])
    .filter((r): r is NonNullable<typeof r> => Boolean(r));

  const avgAccuracy = latestByAgent.length
    ? Math.round(latestByAgent.reduce((sum, r) => sum + r.accuracy, 0) / latestByAgent.length)
    : 0;

  const regressionRuns = evaluationRuns.filter((r) => r.verdict === "regression");

  const rows = evaluationRuns
    .filter((r) => agentFilter === "all" || r.agentId === agentFilter)
    .sort((a, b) => (a.runAt < b.runAt ? 1 : -1));

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 px-6 pb-6">
      <PageHeader title="Evaluations" description={`${evaluationRuns.length} runs across ${agents.length} agents`} actions={<Badge variant="neutral">Demo data</Badge>} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Avg accuracy (latest)" value={`${avgAccuracy}%`} />
        <MetricCard label="Total runs" value={String(evaluationRuns.length)} />
        <MetricCard label="Regressions" value={String(regressionRuns.length)} />
        <MetricCard label="Agents evaluated" value={String(latestByAgent.length)} />
      </div>

      {regressionRuns.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger-muted px-4 py-3 text-[13px] text-danger">
          <AlertTriangle className="size-4 shrink-0" />
          {regressionRuns.length} evaluation run{regressionRuns.length === 1 ? "" : "s"} show
          {regressionRuns.length === 1 ? "s" : ""} a regression — review before promoting to production.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Agent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All agents</SelectItem>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-[12px] text-muted-foreground">
          {rows.length} of {evaluationRuns.length} runs
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={FlaskConical} title="No evaluation runs" description="No runs match the selected agent filter." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agent</TableHead>
              <TableHead>Dataset</TableHead>
              <TableHead>Run date</TableHead>
              <TableHead>Accuracy</TableHead>
              <TableHead>Groundedness</TableHead>
              <TableHead>Tool Success</TableHead>
              <TableHead>Escalation Quality</TableHead>
              <TableHead>Policy Compliance</TableHead>
              <TableHead>Verdict</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const agent = getAgentById(r.agentId);
              return (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={`/agents/${r.agentId}`} className="font-medium text-foreground hover:text-accent">
                      {agent?.name ?? r.agentId}
                    </Link>
                  </TableCell>
                  <TableCell className="text-mono text-muted-foreground">{r.datasetName}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(r.runAt)}</TableCell>
                  <TableCell className="text-mono">{r.accuracy}%</TableCell>
                  <TableCell className="text-mono">{r.groundedness}%</TableCell>
                  <TableCell className="text-mono">{r.toolSuccess}%</TableCell>
                  <TableCell className="text-mono">{r.escalationQuality}%</TableCell>
                  <TableCell className="text-mono">{r.policyCompliance}%</TableCell>
                  <TableCell>
                    <VerdictBadge verdict={r.verdict} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
