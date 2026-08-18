"use client";

import * as React from "react";
import { use } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Database,
  FlaskConical,
  GitCompare,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import { useAppStore } from "@/lib/stores/app-store";
import { knowledgeDocuments, getEvaluationsForAgent } from "@/lib/mock-data";
import { AgentTypeBadge, AgentStatusBadge, VerdictBadge, VersionStatusBadge } from "@/components/agents/agent-meta";
import { ChannelBadge } from "@/components/shared/channel-badge";
import { MetricCard } from "@/components/shared/metric-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatDate, formatNumber, formatCurrencyINR, cn } from "@/lib/utils";
import type { AgentVersion } from "@/lib/types";

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const agent = useAppStore((s) => s.agents.find((a) => a.id === id));
  const switchAgentVersion = useAppStore((s) => s.switchAgentVersion);

  const [compareSelection, setCompareSelection] = React.useState<string[]>([]);
  const [showDiff, setShowDiff] = React.useState(false);

  if (!agent) {
    return (
      <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-2 px-6 py-16 text-center">
        <p className="text-[14px] font-medium text-foreground">Agent not found</p>
        <Button size="sm" variant="secondary" asChild>
          <Link href="/agents">Back to agents</Link>
        </Button>
      </div>
    );
  }

  const evaluations = getEvaluationsForAgent(agent.id);
  const latestEvaluation = evaluations[0];

  const autoTools = agent.tools.filter((t) => t.allowed && !t.requiresApproval);
  const approvalTools = agent.tools.filter((t) => t.allowed && t.requiresApproval);
  const disallowedTools = agent.tools.filter((t) => !t.allowed);
  const policySummary =
    approvalTools.length > 0
      ? `${formatList(approvalTools.map((t) => policyLabelForTool(t.name)))} require human approval before execution. All other allowed actions execute automatically.`
      : "All allowed actions execute automatically — no tool currently requires human approval.";

  const estimatedCost = agent.conversationsHandled * 12;

  function toggleCompare(version: string) {
    setShowDiff(false);
    setCompareSelection((sel) => {
      if (sel.includes(version)) return sel.filter((v) => v !== version);
      if (sel.length >= 2) return [sel[1], version];
      return [...sel, version];
    });
  }

  function handleDeploy(version: string) {
    switchAgentVersion(agent!.id, version);
    toast.success(`Deployed ${version}`, { description: `${agent!.name} is now running ${version}.` });
  }

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 px-6 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-semibold tracking-tight text-foreground">{agent.name}</h1>
            <AgentTypeBadge type={agent.type} />
            <AgentStatusBadge status={agent.status} />
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-[12px] text-muted-foreground">
            <span className="text-mono text-foreground">{agent.model}</span>
            <span>·</span>
            <span className="text-mono">Current version {agent.version}</span>
          </div>
        </div>
        <Button variant="secondary" size="sm" asChild>
          <Link href="/agents">
            <ArrowLeft className="size-3.5" />
            All agents
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard label="Success rate" value={`${agent.successRate}%`} />
        <MetricCard label="Conversations handled" value={formatNumber(agent.conversationsHandled)} />
        <MetricCard label="Escalation rate" value={`${agent.escalationRate}%`} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="instructions">Instructions</TabsTrigger>
          <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
          <TabsTrigger value="evaluation">Evaluation</TabsTrigger>
          <TabsTrigger value="versions">Versions</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="grid grid-cols-1 gap-4 pt-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Purpose</p>
              <p className="text-[13px] leading-relaxed text-foreground">{agent.purpose}</p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Channels</p>
              <div className="flex flex-wrap gap-2">
                {agent.channels.map((c) => (
                  <ChannelBadge key={c} channel={c} className="rounded-md border border-border bg-surface-2 px-2 py-1" />
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">At a glance</p>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Model" value={agent.model} />
              <Stat label="Version" value={agent.version} />
              <Stat label="Temperature" value={agent.temperature.toFixed(1)} />
              <Stat label="Tools" value={String(agent.tools.length)} />
              <Stat label="Knowledge docs" value={String(agent.knowledgeDocIds.length)} />
              <Stat label="Channels" value={String(agent.channels.length)} />
            </div>
          </div>
        </TabsContent>

        {/* Instructions */}
        <TabsContent value="instructions" className="pt-4">
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">System prompt</p>
              <span className="text-[11px] text-muted-foreground">{agent.instructions.length} characters</span>
            </div>
            <div className="whitespace-pre-wrap rounded-md border border-border bg-surface-2 p-4 text-mono text-[12.5px] leading-relaxed text-foreground">
              {agent.instructions}
            </div>
          </div>
        </TabsContent>

        {/* Knowledge */}
        <TabsContent value="knowledge" className="pt-4">
          {agent.knowledgeDocIds.length === 0 ? (
            <EmptyState
              icon={Database}
              title="No knowledge documents linked"
              description="This agent doesn't reference any knowledge base documents."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {agent.knowledgeDocIds.map((docId) => {
                const doc = knowledgeDocuments.find((d) => d.id === docId);
                if (!doc) return null;
                const statusTone =
                  doc.status === "published" ? "success" : doc.status === "processing" ? "warning" : doc.status === "archived" ? "outline" : "neutral";
                return (
                  <Link
                    key={docId}
                    href={`/knowledge/${docId}`}
                    className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 transition-colors hover:border-border-strong"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-foreground">{doc.title}</p>
                      <p className="text-[12px] text-muted-foreground">
                        {doc.category} · {doc.chunkCount} chunks · v{doc.version}
                      </p>
                    </div>
                    <Badge variant={statusTone}>{doc.status}</Badge>
                  </Link>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Tools */}
        <TabsContent value="tools" className="grid grid-cols-1 gap-4 pt-4 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <CheckCircle2 className="size-3.5 text-success" />
              Allowed actions
            </p>
            <ul className="flex flex-col gap-2">
              {autoTools.length === 0 && <p className="text-[12px] text-muted-foreground">No auto-executing tools configured.</p>}
              {autoTools.map((t) => (
                <li key={t.name} className="flex items-center gap-2 text-[13px]">
                  <Check className="size-3.5 text-success" />
                  <span className="text-mono text-foreground">{t.name}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <ShieldAlert className="size-3.5 text-warning" />
              Approval required
            </p>
            <ul className="flex flex-col gap-2">
              {approvalTools.length === 0 && <p className="text-[12px] text-muted-foreground">No tools require human approval.</p>}
              {approvalTools.map((t) => (
                <li key={t.name} className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="flex items-center gap-2">
                    <Check className="size-3.5 text-success" />
                    <span className="text-mono text-foreground">{t.name}</span>
                  </span>
                  <Badge variant="warning">Requires approval</Badge>
                </li>
              ))}
            </ul>
          </div>

          {disallowedTools.length > 0 && (
            <div className="rounded-lg border border-border bg-surface p-4 lg:col-span-2">
              <p className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <X className="size-3.5 text-danger" />
                Not allowed
              </p>
              <ul className="flex flex-col gap-2">
                {disallowedTools.map((t) => (
                  <li key={t.name} className="flex items-center gap-2 text-[13px] text-muted-foreground">
                    <X className="size-3.5 text-danger" />
                    <span className="text-mono">{t.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </TabsContent>

        {/* Policies */}
        <TabsContent value="policies" className="grid grid-cols-1 gap-4 pt-4 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Model configuration</p>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Temperature" value={agent.temperature.toFixed(1)} />
              <Stat label="Model" value={agent.model} />
              <Stat label="Version" value={agent.version} />
            </div>
            <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Channels</p>
            <div className="flex flex-wrap gap-2">
              {agent.channels.map((c) => (
                <ChannelBadge key={c} channel={c} className="rounded-md border border-border bg-surface-2 px-2 py-1" />
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-accent-border bg-accent-muted p-4">
            <div className="mb-2 flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-accent" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-accent">Approval policy</span>
            </div>
            <p className="text-[13px] leading-relaxed text-foreground">{policySummary}</p>
            {approvalTools.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1.5">
                {approvalTools.map((t) => (
                  <li key={t.name} className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    <ShieldAlert className="size-3.5 text-warning" />
                    <span className="text-mono text-foreground">{t.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        {/* Evaluation */}
        <TabsContent value="evaluation" className="flex flex-col gap-4 pt-4">
          {!latestEvaluation ? (
            <EmptyState icon={FlaskConical} title="No evaluation runs yet" description="This agent hasn't been evaluated against a dataset." />
          ) : (
            <>
              <div className="rounded-lg border border-border bg-surface p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[13px] font-medium text-foreground">{latestEvaluation.datasetName}</p>
                    <p className="text-[12px] text-muted-foreground">
                      Latest run · {formatDate(latestEvaluation.runAt)}
                      {latestEvaluation.comparedToVersion ? ` · vs ${latestEvaluation.comparedToVersion}` : ""}
                    </p>
                  </div>
                  <VerdictBadge verdict={latestEvaluation.verdict} />
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <EvalMetric label="Accuracy" value={latestEvaluation.accuracy} />
                  <EvalMetric label="Groundedness" value={latestEvaluation.groundedness} />
                  <EvalMetric label="Tool success" value={latestEvaluation.toolSuccess} />
                  <EvalMetric label="Escalation quality" value={latestEvaluation.escalationQuality} />
                  <EvalMetric label="Policy compliance" value={latestEvaluation.policyCompliance} />
                </div>
              </div>

              <div className="rounded-lg border border-border bg-surface">
                <div className="border-b border-border px-4 py-3">
                  <p className="text-[13px] font-semibold text-foreground">All runs</p>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Run date</TableHead>
                      <TableHead>Dataset</TableHead>
                      <TableHead>Accuracy</TableHead>
                      <TableHead>Groundedness</TableHead>
                      <TableHead>Tool success</TableHead>
                      <TableHead>Escalation</TableHead>
                      <TableHead>Policy</TableHead>
                      <TableHead>Verdict</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {evaluations.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-muted-foreground">{formatDate(r.runAt)}</TableCell>
                        <TableCell className="text-mono text-foreground">{r.datasetName}</TableCell>
                        <TableCell className="text-mono">{r.accuracy}%</TableCell>
                        <TableCell className="text-mono">{r.groundedness}%</TableCell>
                        <TableCell className="text-mono">{r.toolSuccess}%</TableCell>
                        <TableCell className="text-mono">{r.escalationQuality}%</TableCell>
                        <TableCell className="text-mono">{r.policyCompliance}%</TableCell>
                        <TableCell>
                          <VerdictBadge verdict={r.verdict} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>

        {/* Versions */}
        <TabsContent value="versions" className="flex flex-col gap-4 pt-4">
          <div className="rounded-lg border border-border bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <p className="text-[13px] font-semibold text-foreground">Version history</p>
              <Button size="sm" variant="secondary" disabled={compareSelection.length !== 2} onClick={() => setShowDiff(true)}>
                <GitCompare className="size-3.5" />
                Compare selected
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-9" />
                  <TableHead>Version</TableHead>
                  <TableHead>Deployed</TableHead>
                  <TableHead>Change summary</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agent.versions.map((v) => (
                  <TableRow key={v.version}>
                    <TableCell>
                      <Checkbox checked={compareSelection.includes(v.version)} onCheckedChange={() => toggleCompare(v.version)} />
                    </TableCell>
                    <TableCell className="text-mono font-medium text-foreground">{v.version}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(v.deployedAt)}</TableCell>
                    <TableCell className="max-w-[360px] whitespace-normal text-foreground">{v.changeSummary}</TableCell>
                    <TableCell>
                      <VersionStatusBadge status={v.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      {v.status === "current" ? (
                        <Button size="sm" variant="secondary" disabled>
                          Rollback
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => handleDeploy(v.version)}>
                          Deploy
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {showDiff && compareSelection.length === 2 && (
            <div className="rounded-lg border border-accent-border bg-accent-muted p-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-accent">
                Comparing {compareSelection[0]} vs {compareSelection[1]}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {compareSelection.map((vNum) => {
                  const v: AgentVersion | undefined = agent.versions.find((x) => x.version === vNum);
                  if (!v) return null;
                  return (
                    <div key={vNum} className="rounded-md border border-border bg-surface p-3">
                      <div className="mb-1.5 flex items-center gap-2">
                        <span className="text-mono text-[13px] font-semibold text-foreground">{v.version}</span>
                        <VersionStatusBadge status={v.status} />
                      </div>
                      <p className="text-[12px] text-muted-foreground">{formatDate(v.deployedAt)}</p>
                      <p className="mt-2 text-[13px] text-foreground">{v.changeSummary}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>

        {/* Usage */}
        <TabsContent value="usage" className="pt-4">
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[13px] font-semibold text-foreground">Estimated usage &amp; cost</p>
              <span className="text-[11px] text-muted-foreground">Estimate only</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Conversations handled" value={formatNumber(agent.conversationsHandled)} />
              <Stat label="Est. cost / conversation" value="₹12" />
              <Stat label="Est. total cost" value={formatCurrencyINR(estimatedCost)} />
              <Stat label="Model" value={agent.model} />
            </div>
            <p className="mt-4 text-[12px] text-muted-foreground">
              Estimated at ₹12 per conversation handled ({formatNumber(agent.conversationsHandled)} conversations × ₹12 ≈{" "}
              {formatCurrencyINR(estimatedCost)}). See the{" "}
              <Link href="/usage" className="text-accent hover:underline">
                Usage
              </Link>{" "}
              page for full billing detail across all agents.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-surface-2 px-3 py-2.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-mono text-[13px] font-medium text-foreground">{value}</span>
    </div>
  );
}

function EvalMetric({ label, value }: { label: string; value: number }) {
  const tone = value >= 90 ? "bg-success" : value >= 75 ? "bg-warning" : "bg-danger";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-mono font-medium text-foreground">{value}%</span>
      </div>
      <Progress value={value} indicatorClassName={cn(tone)} />
    </div>
  );
}

const APPROVAL_VERBS = ["apply", "issue", "send", "create", "update", "get", "schedule", "notify", "run", "reset"];

function policyLabelForTool(name: string): string {
  const clean = name.replace(/\(\)\s*$/, "");
  const parts = clean.split("_").filter(Boolean);
  if (parts.length > 1 && APPROVAL_VERBS.includes(parts[0])) {
    const noun = parts.slice(1).join(" ");
    return pluralize(noun);
  }
  return parts.join(" ");
}

function pluralize(s: string): string {
  return s.endsWith("s") ? s : `${s}s`;
}

function formatList(items: string[]): string {
  if (items.length === 0) return "";
  const capped = items.map((s, i) => (i === 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s));
  if (capped.length === 1) return capped[0];
  if (capped.length === 2) return `${capped[0]} and ${capped[1]}`;
  return `${capped.slice(0, -1).join(", ")} and ${capped[capped.length - 1]}`;
}
