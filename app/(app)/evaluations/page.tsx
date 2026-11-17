"use client";

import * as React from "react";
import { Activity, AlertTriangle, Bot, BrainCircuit, Check, Clock, FlaskConical, Gauge, ShieldCheck, Sparkles, TrendingUp, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/settings/section-ui";
import { useWorkspace } from "@/components/layout/workspace-context";
import { demoMode } from "@/lib/demo-mode";

type Tab = "overview" | "quality" | "latency" | "hallucination" | "agents" | "workflows";

const workspaceLabels: Record<string, string> = {
  business: "Business", "crm-sales": "CRM & Sales", "hr-people": "HR & People",
  "finance-accounting": "Finance", "projects-delivery": "Projects", "customer-support": "Support",
  "operations-inventory": "Operations", "it-infrastructure": "IT", "team-chat": "Team Chat", portfolio: "Portfolio",
};

export default function AIDashboardPage() {
  const { workspaceId, workspace } = useWorkspace();
  const [tab, setTab] = React.useState<Tab>("overview");
  const label = workspaceLabels[workspaceId] ?? workspace.name;
  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "overview", label: "Overview" },
    { key: "quality", label: "Quality & Eval" },
    { key: "latency", label: "Latency" },
    { key: "hallucination", label: "Hallucination" },
    { key: "agents", label: "Agent Performance" },
    { key: "workflows", label: "Workflow Efficiency" },
  ];

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 px-4 py-6 sm:px-6 sm:py-7">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-accent">
            <FlaskConical className="size-3" />AI Dashboard
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{label} AI Dashboard</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Monitor AI quality, latency, hallucination rates and trust scores across {label.toLowerCase()} operations.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={demoMode ? "neutral" : "success"}>{demoMode ? "Demo metrics" : "Live metrics"}</Badge>
          <Badge variant="outline">{label} scope</Badge>
        </div>
      </header>

      <nav className="janus-tab-strip sticky top-0 z-20 flex gap-1 overflow-x-auto rounded-lg bg-surface-2 p-1" aria-label="AI Dashboard tabs">
        {tabs.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`shrink-0 rounded-sm px-3 py-2 text-xs transition-colors ${t.key === tab ? "bg-white font-medium text-foreground shadow-sm" : "text-muted-foreground hover:bg-white/70 hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && <OverviewTab label={label} />}
      {tab === "quality" && <QualityTab label={label} />}
      {tab === "latency" && <LatencyTab label={label} />}
      {tab === "hallucination" && <HallucinationTab label={label} />}
      {tab === "agents" && <AgentPerformanceTab label={label} />}
      {tab === "workflows" && <WorkflowEfficiencyTab label={label} />}
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

function TrustScore({ score }: { score: number }) {
  const color = score >= 90 ? "text-emerald-600" : score >= 70 ? "text-amber-600" : "text-red-600";
  const bg = score >= 90 ? "bg-emerald-500" : score >= 70 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <ShieldCheck className="size-3.5" />Overall Trust Score
      </div>
      <div className="mt-3 flex items-end gap-3">
        <span className={`text-4xl font-bold tabular-nums ${color}`}>{score}%</span>
        <span className="mb-1 text-xs text-muted-foreground">Composite of accuracy, groundedness, latency and hallucination rate</span>
      </div>
      <div className="mt-3 h-2 rounded-full bg-[#efefea]">
        <div className={`h-2 rounded-full transition-all ${bg}`} style={{ width: `${score}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
        <span>0%</span><span>50%</span><span>100%</span>
      </div>
    </div>
  );
}

function BarChart({ data, height = 160 }: { data: Array<{ label: string; value: number; max?: number }>; height?: number }) {
  const max = Math.max(...data.map((d) => d.max ?? d.value), 1);
  return (
    <div className="rounded-lg bg-surface-2 p-3">
      <div className="flex items-end gap-2" style={{ height }}>
        {data.map((d, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-2">
            <div className="relative w-full">
              {d.max && <div className="absolute bottom-0 w-full rounded-t-md bg-[#efefea]" style={{ height: `${(d.max / max) * height * 0.85}px` }} />}
              <div className="relative w-full rounded-t-md bg-accent" style={{ height: `${(d.value / max) * height * 0.85}px` }} />
            </div>
            <span className="text-[10px] text-muted-foreground">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OverviewTab({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-5">
      <TrustScore score={87} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Accuracy" value="92.4%" detail="Correct answers from verified data" icon={Check} tone="success" />
        <MetricCard label="Hallucination Rate" value="2.1%" detail="Answers containing unverified claims" icon={AlertTriangle} tone="success" />
        <MetricCard label="Avg Latency" value="340ms" detail="p50 response time" icon={Zap} tone="success" />
        <MetricCard label="Groundedness" value="94.8%" detail="Claims traceable to source records" icon={ShieldCheck} tone="success" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Quality Trend (7 days)" description="Accuracy and groundedness scores over the last week.">
          <BarChart data={[
            { label: "Mon", value: 91, max: 94 }, { label: "Tue", value: 93, max: 95 },
            { label: "Wed", value: 90, max: 93 }, { label: "Thu", value: 94, max: 96 },
            { label: "Fri", value: 92, max: 95 }, { label: "Sat", value: 93, max: 95 },
            { label: "Sun", value: 92, max: 95 },
          ]} />
          <div className="mt-2 flex gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-sm bg-accent" /> Accuracy</span>
            <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-sm bg-[#efefea]" /> Groundedness</span>
          </div>
        </SectionCard>

        <SectionCard title="Latency Distribution" description="Response time percentiles across all AI operations.">
          <div className="grid gap-3">
            {[["p50", "340ms", 34], ["p75", "580ms", 58], ["p90", "920ms", 92], ["p95", "1.2s", 100], ["p99", "2.8s", 100]].map(([percentile, value, width]) => (
              <div key={percentile as string}>
                <div className="flex justify-between text-xs">
                  <span className="font-medium">{percentile as string}</span><span className="text-muted-foreground">{value as string}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-[#efefea]">
                  <div className={`h-2 rounded-full ${(width as number) <= 50 ? "bg-emerald-500" : (width as number) <= 80 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${width as number}%` }} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Token Usage (Today)" description="Tokens consumed across AI operations.">
          <div className="grid gap-3">
            <div className="flex justify-between text-sm"><span>Input tokens</span><span className="font-semibold tabular-nums">24,580</span></div>
            <div className="flex justify-between text-sm"><span>Output tokens</span><span className="font-semibold tabular-nums">8,420</span></div>
            <div className="flex justify-between text-sm"><span>Total</span><span className="font-semibold tabular-nums">33,000</span></div>
            <div className="border-t border-border pt-2 text-xs text-muted-foreground">Estimated cost: ₹12.40 today</div>
          </div>
        </SectionCard>

        <SectionCard title="Active Agents" description="Agent health across the workspace.">
          <div className="grid gap-2">
            {[["Business Health Monitor", "active", "96%"], ["Lead Follow-up Agent", "active", "92%"], ["Support Triage Agent", "paused", "98%"]].map(([name, status, rate]) => (
              <div key={name} className="flex items-center justify-between gap-2 rounded-md border border-border p-2.5">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs tabular-nums text-muted-foreground">{rate}</span>
                  <Badge variant={status === "active" ? "success" : "neutral"}>{status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Recent Issues" description="Problems detected in the last 24 hours.">
          <div className="grid gap-2">
            {[
              ["Hallucination detected", "Invoice amount cited without source match", "warning"],
              ["High latency", "RAG query took 4.2s (p99 threshold: 3s)", "danger"],
              ["Low confidence", "HR policy answer scored 62% groundedness", "warning"],
            ].map(([title, detail, tone]) => (
              <div key={title} className="flex items-start gap-2 rounded-md border border-border p-2.5">
                <AlertTriangle className={`mt-0.5 size-3.5 shrink-0 ${tone === "danger" ? "text-red-600" : "text-amber-600"}`} />
                <div>
                  <p className="text-xs font-medium">{title}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function QualityTab({ label }: { label: string }) {
  const evalRuns = [
    { id: "eval-1", agent: "Business Health Monitor", dataset: "owner-briefs-v2", date: "Today 09:00", accuracy: 94, groundedness: 96, toolSuccess: 100, policyCompliance: 98, verdict: "pass" },
    { id: "eval-2", agent: "Lead Follow-up Agent", dataset: "lead-qualification-v3", date: "Today 08:42", accuracy: 91, groundedness: 93, toolSuccess: 95, policyCompliance: 100, verdict: "pass" },
    { id: "eval-3", agent: "Support Triage Agent", dataset: "ticket-triage-v2", date: "Yesterday 17:20", accuracy: 96, groundedness: 97, toolSuccess: 98, policyCompliance: 100, verdict: "pass" },
    { id: "eval-4", agent: "Lead Follow-up Agent", dataset: "lead-qualification-v3", date: "2 days ago", accuracy: 88, groundedness: 85, toolSuccess: 92, policyCompliance: 100, verdict: "regression" },
    { id: "eval-5", agent: "Business Health Monitor", dataset: "owner-briefs-v2", date: "3 days ago", accuracy: 92, groundedness: 94, toolSuccess: 100, policyCompliance: 96, verdict: "pass" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Avg Accuracy" value="92.4%" detail="Across all eval runs" icon={Check} tone="success" />
        <MetricCard label="Groundedness" value="94.8%" detail="Claims with source match" icon={ShieldCheck} tone="success" />
        <MetricCard label="Tool Success" value="97.0%" detail="Tool calls that succeeded" icon={Zap} tone="success" />
        <MetricCard label="Policy Compliance" value="98.8%" detail="Answers within policy" icon={ShieldCheck} tone="success" />
        <MetricCard label="Regressions" value="1" detail="In the last 7 days" icon={AlertTriangle} tone="warning" />
      </div>

      <SectionCard title="Evaluation Runs" description="Automated quality checks against test datasets.">
        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            <div className="grid grid-cols-[1.5fr_1.2fr_1fr_0.6fr_0.6fr_0.6fr_0.6fr_0.6fr] gap-3 border-b border-border px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Agent</span><span>Dataset</span><span>Run Date</span><span>Accuracy</span><span>Grounded</span><span>Tool</span><span>Policy</span><span>Verdict</span>
            </div>
            {evalRuns.map((run) => (
              <div key={run.id} className="grid grid-cols-[1.5fr_1.2fr_1fr_0.6fr_0.6fr_0.6fr_0.6fr_0.6fr] items-center gap-3 border-b border-border px-2 py-3 text-xs last:border-0">
                <span className="font-medium">{run.agent}</span>
                <span className="font-mono text-muted-foreground">{run.dataset}</span>
                <span className="text-muted-foreground">{run.date}</span>
                <span className="tabular-nums">{run.accuracy}%</span>
                <span className="tabular-nums">{run.groundedness}%</span>
                <span className="tabular-nums">{run.toolSuccess}%</span>
                <span className="tabular-nums">{run.policyCompliance}%</span>
                <Badge variant={run.verdict === "pass" ? "success" : "danger"}>{run.verdict}</Badge>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Quality by Category" description="How AI performs across different question types.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Factual Lookups", "96%", "Direct data retrieval", "success"],
            ["Analysis & Insights", "89%", "Pattern recognition", "success"],
            ["Recommendations", "84%", "Actionable suggestions", "warning"],
            ["Multi-step Reasoning", "78%", "Complex chains", "warning"],
          ].map(([title, score, detail, tone]) => (
            <div key={title} className="rounded-lg border border-border p-3">
              <p className="text-xs font-semibold">{title}</p>
              <p className={`mt-2 text-xl font-bold tabular-nums ${tone === "success" ? "text-emerald-600" : "text-amber-600"}`}>{score}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">{detail}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function LatencyTab({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="p50 Latency" value="340ms" detail="Median response time" icon={Zap} tone="success" />
        <MetricCard label="p95 Latency" value="1.2s" detail="95th percentile" icon={Clock} tone="warning" />
        <MetricCard label="p99 Latency" value="2.8s" detail="99th percentile" icon={Clock} tone="danger" />
        <MetricCard label="Timeout Rate" value="0.3%" detail="Requests exceeding 10s" icon={AlertTriangle} tone="success" />
      </div>

      <SectionCard title="Latency by Operation" description="Response times broken down by AI operation type.">
        <div className="overflow-x-auto">
          <div className="min-w-[700px]">
            <div className="grid grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr_0.8fr_0.6fr] gap-3 border-b border-border px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Operation</span><span>p50</span><span>p75</span><span>p95</span><span>p99</span><span>Calls/day</span>
            </div>
            {[
              ["Chat completion", "280ms", "450ms", "980ms", "2.1s", "142"],
              ["RAG retrieval", "120ms", "200ms", "380ms", "620ms", "89"],
              ["Embedding generation", "45ms", "65ms", "110ms", "180ms", "234"],
              ["Agent reasoning", "1.8s", "3.2s", "5.4s", "8.1s", "24"],
              ["Knowledge search", "90ms", "140ms", "260ms", "420ms", "67"],
            ].map(([op, p50, p75, p95, p99, calls]) => (
              <div key={op} className="grid grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr_0.8fr_0.6fr] items-center gap-3 border-b border-border px-2 py-3 text-xs last:border-0">
                <span className="font-medium">{op}</span>
                <span className="tabular-nums">{p50}</span>
                <span className="tabular-nums">{p75}</span>
                <span className="tabular-nums text-amber-600">{p95}</span>
                <span className="tabular-nums text-red-600">{p99}</span>
                <span className="tabular-nums text-muted-foreground">{calls}</span>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Latency Trend (7 days)" description="p50 response time trend.">
          <BarChart data={[
            { label: "Mon", value: 32 }, { label: "Tue", value: 35 },
            { label: "Wed", value: 38 }, { label: "Thu", value: 31 },
            { label: "Fri", value: 34 }, { label: "Sat", value: 29 },
            { label: "Sun", value: 34 },
          ]} />
          <p className="mt-2 text-[10px] text-muted-foreground">Values represent p50 latency in tens of milliseconds</p>
        </SectionCard>

        <SectionCard title="Slow Queries" description="Queries exceeding the p95 threshold in the last 24h.">
          <div className="grid gap-2">
            {[
              ["What is our revenue trend across all departments?", "4.2s", "Multi-workspace query"],
              ["Summarize all open projects with risks", "3.8s", "Cross-workspace aggregation"],
              ["Compare Q3 performance across teams", "3.1s", "Historical analysis"],
            ].map(([query, time, reason]) => (
              <div key={query} className="rounded-md border border-border p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium">{query}</p>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-red-600">{time}</span>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">{reason}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function HallucinationTab({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Hallucination Rate" value="2.1%" detail="Answers with unverified claims" icon={AlertTriangle} tone="success" />
        <MetricCard label="Detected Today" value="3" detail="Out of 142 responses" icon={ShieldCheck} tone="warning" />
        <MetricCard label="Auto-Blocked" value="1" detail="Prevented from reaching user" icon={Check} tone="success" />
        <MetricCard label="Groundedness" value="94.8%" detail="Claims with verified source" icon={BrainCircuit} tone="success" />
      </div>

      <SectionCard title="Detection Pipeline" description="How Janus identifies and handles hallucinated content.">
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ["Source Verification", "Every claim cross-checked against indexed knowledge and workspace records.", "98.2%"],
            ["Confidence Scoring", "LLM confidence calibrated against historical accuracy per question type.", "94.1%"],
            ["Factual Consistency", "Numbers, dates and amounts verified against structured data.", "99.4%"],
            ["Policy Alignment", "Answers checked against business policies and compliance rules.", "98.8%"],
          ].map(([title, detail, score]) => (
            <div key={title} className="rounded-lg border border-border p-3">
              <p className="text-xs font-semibold">{title}</p>
              <p className="mt-2 text-lg font-bold tabular-nums text-emerald-600">{score}</p>
              <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{detail}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Recent Hallucination Incidents" description="Flagged responses in the last 7 days.">
        <div className="overflow-x-auto">
          <div className="min-w-[700px]">
            <div className="grid grid-cols-[2fr_1.5fr_0.8fr_0.8fr_0.6fr] gap-3 border-b border-border px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Query</span><span>Issue</span><span>Confidence</span><span>Source Match</span><span>Action</span>
            </div>
            {[
              ["What invoices are overdue?", "Cited ₹4.5L amount not in records", "72%", "No match", "Blocked"],
              ["Who approved the discount?", "Named a person not in audit log", "58%", "Partial", "Flagged"],
              ["Show HR headcount trend", "Included outdated employee count", "81%", "Stale data", "Corrected"],
            ].map(([query, issue, confidence, source, action]) => (
              <div key={query} className="grid grid-cols-[2fr_1.5fr_0.8fr_0.8fr_0.6fr] items-center gap-3 border-b border-border px-2 py-3 text-xs last:border-0">
                <span className="font-medium">{query}</span>
                <span className="text-red-600">{issue}</span>
                <span className="tabular-nums">{confidence}</span>
                <span className="text-muted-foreground">{source}</span>
                <Badge variant={action === "Blocked" ? "danger" : action === "Flagged" ? "warning" : "neutral"}>{action}</Badge>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Hallucination by Category" description="Where unverified claims appear most.">
          <div className="grid gap-3">
            {[
              ["Financial figures", 4, "Amount or revenue claims"],
              ["People & approvals", 2, "Who approved or did what"],
              ["Dates & deadlines", 1, "Incorrect timeline references"],
              ["Policy details", 1, "Misquoted business rules"],
            ].map(([category, count, detail]) => (
              <div key={category as string} className="flex items-center justify-between gap-3 rounded-md border border-border p-2.5">
                <div>
                  <p className="text-xs font-medium">{category as string}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{detail as string}</p>
                </div>
                <span className="text-sm font-semibold tabular-nums">{count as number}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Hallucination Trend" description="Weekly hallucination rate over the last month.">
          <BarChart data={[
            { label: "W1", value: 4 }, { label: "W2", value: 3 },
            { label: "W3", value: 2 }, { label: "W4", value: 2 },
          ]} height={120} />
          <p className="mt-2 text-[10px] text-muted-foreground">Hallucination count per week. Trend: improving.</p>
        </SectionCard>
      </div>
    </div>
  );
}

function AgentPerformanceTab({ label }: { label: string }) {
  const agents = [
    { name: "Business Health Monitor", status: "active", accuracy: 94, groundedness: 96, latencyP50: "320ms", hallucination: "1.2%", runs7d: 18, success: "96%", tokens7d: "48.2K", trust: 93 },
    { name: "Lead Follow-up Agent", status: "active", accuracy: 91, groundedness: 93, latencyP50: "380ms", hallucination: "2.8%", runs7d: 34, success: "92%", tokens7d: "82.4K", trust: 88 },
    { name: "Support Triage Agent", status: "paused", accuracy: 96, groundedness: 97, latencyP50: "260ms", hallucination: "0.8%", runs7d: 11, success: "98%", tokens7d: "24.1K", trust: 95 },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Active Agents" value="2" detail="Running in this workspace" icon={Bot} tone="success" />
        <MetricCard label="Total Runs (7d)" value="63" detail="Across all agents" icon={Activity} tone="neutral" />
        <MetricCard label="Avg Trust Score" value="92%" detail="Weighted by run volume" icon={ShieldCheck} tone="success" />
        <MetricCard label="Token Cost (7d)" value="₹48.20" detail="Across all agents" icon={Gauge} tone="neutral" />
      </div>

      <SectionCard title="Agent Comparison" description="Side-by-side performance metrics for all AI agents.">
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[1.5fr_0.5fr_0.6fr_0.6fr_0.6fr_0.6fr_0.6fr_0.6fr_0.6fr_0.5fr] gap-2 border-b border-border px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Agent</span><span>Status</span><span>Accuracy</span><span>Grounded</span><span>p50</span><span>Halluc.</span><span>Runs</span><span>Success</span><span>Tokens</span><span>Trust</span>
            </div>
            {agents.map((a) => (
              <div key={a.name} className="grid grid-cols-[1.5fr_0.5fr_0.6fr_0.6fr_0.6fr_0.6fr_0.6fr_0.6fr_0.6fr_0.5fr] items-center gap-2 border-b border-border px-2 py-3 text-xs last:border-0">
                <span className="font-medium">{a.name}</span>
                <Badge variant={a.status === "active" ? "success" : "neutral"}>{a.status}</Badge>
                <span className="tabular-nums">{a.accuracy}%</span>
                <span className="tabular-nums">{a.groundedness}%</span>
                <span className="tabular-nums">{a.latencyP50}</span>
                <span className={`tabular-nums ${parseFloat(a.hallucination) > 2 ? "text-amber-600" : "text-emerald-600"}`}>{a.hallucination}</span>
                <span className="tabular-nums">{a.runs7d}</span>
                <span className="tabular-nums">{a.success}</span>
                <span className="tabular-nums text-muted-foreground">{a.tokens7d}</span>
                <span className={`font-semibold tabular-nums ${a.trust >= 90 ? "text-emerald-600" : "text-amber-600"}`}>{a.trust}%</span>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      {agents.map((a) => (
        <SectionCard key={a.name} title={a.name} description={`Trust score: ${a.trust}% · ${a.runs7d} runs in the last 7 days`}>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-md border border-border p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Accuracy</p>
              <p className="mt-1 text-lg font-bold tabular-nums">{a.accuracy}%</p>
              <div className="mt-2 h-1.5 rounded-full bg-[#efefea]"><div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${a.accuracy}%` }} /></div>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Groundedness</p>
              <p className="mt-1 text-lg font-bold tabular-nums">{a.groundedness}%</p>
              <div className="mt-2 h-1.5 rounded-full bg-[#efefea]"><div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${a.groundedness}%` }} /></div>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Hallucination</p>
              <p className={`mt-1 text-lg font-bold tabular-nums ${parseFloat(a.hallucination) > 2 ? "text-amber-600" : "text-emerald-600"}`}>{a.hallucination}</p>
              <div className="mt-2 h-1.5 rounded-full bg-[#efefea]"><div className={`h-1.5 rounded-full ${parseFloat(a.hallucination) > 2 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(parseFloat(a.hallucination) * 10, 100)}%` }} /></div>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Latency (p50)</p>
              <p className="mt-1 text-lg font-bold tabular-nums">{a.latencyP50}</p>
              <div className="mt-2 h-1.5 rounded-full bg-[#efefea]"><div className="h-1.5 rounded-full bg-accent" style={{ width: `${Math.min(parseInt(a.latencyP50) / 5, 100)}%` }} /></div>
            </div>
          </div>
        </SectionCard>
      ))}
    </div>
  );
}

function WorkflowEfficiencyTab({ label }: { label: string }) {
  const workflows = [
    { name: "Lead Assignment", triggers: 128, avgDuration: "2.1s", successRate: 98, timeSaved: "32h" },
    { name: "Follow-up Reminder", triggers: 342, avgDuration: "1.4s", successRate: 99, timeSaved: "86h" },
    { name: "Quote Generation", triggers: 48, avgDuration: "8.2s", successRate: 94, timeSaved: "24h" },
    { name: "Deal Stage Update", triggers: 215, avgDuration: "0.8s", successRate: 100, timeSaved: "18h" },
    { name: "Ticket Routing", triggers: 96, avgDuration: "3.6s", successRate: 96, timeSaved: "42h" },
    { name: "Report Generation", triggers: 18, avgDuration: "24.5s", successRate: 89, timeSaved: "54h" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Automation Success" value="94.2%" detail="Workflows completing without error" icon={Check} tone="success" />
        <MetricCard label="Avg Duration" value="12.4s" detail="Mean workflow execution time" icon={Zap} tone="success" />
        <MetricCard label="Tasks Automated" value="847/wk" detail="Automated vs 1,240 manual" icon={Activity} tone="success" />
        <MetricCard label="Manual Override" value="5.8%" detail="Workflows requiring human step" icon={AlertTriangle} tone="warning" />
      </div>

      <SectionCard title="CRM Workflow Performance" description="Automated workflows running across your CRM operations.">
        <div className="overflow-x-auto">
          <div className="min-w-[700px]">
            <div className="grid grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr_0.8fr] gap-3 border-b border-border px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Workflow</span><span>Triggers/wk</span><span>Avg Duration</span><span>Success Rate</span><span>Time Saved</span>
            </div>
            {workflows.map((w) => (
              <div key={w.name} className="grid grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr_0.8fr] items-center gap-3 border-b border-border px-2 py-3 text-xs last:border-0">
                <span className="font-medium">{w.name}</span>
                <span className="tabular-nums">{w.triggers}</span>
                <span className="tabular-nums">{w.avgDuration}</span>
                <span className={`tabular-nums font-semibold ${w.successRate >= 95 ? "text-emerald-600" : w.successRate >= 90 ? "text-amber-600" : "text-red-600"}`}>{w.successRate}%</span>
                <span className="tabular-nums text-muted-foreground">{w.timeSaved}</span>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="AI vs Manual Comparison" description="How automated workflows compare to manual processes.">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border-2 border-accent/30 bg-accent/5 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-accent">
                <Sparkles className="size-3.5" /> AI-Automated
              </div>
              <div className="mt-3 space-y-2">
                <div className="flex justify-between text-xs"><span>Avg process time</span><span className="font-semibold">12.4s</span></div>
                <div className="flex justify-between text-xs"><span>Error rate</span><span className="font-semibold text-emerald-600">1.8%</span></div>
                <div className="flex justify-between text-xs"><span>Cost per task</span><span className="font-semibold">₹0.42</span></div>
                <div className="flex justify-between text-xs"><span>Availability</span><span className="font-semibold">24/7</span></div>
              </div>
            </div>
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <Activity className="size-3.5" /> Manual Process
              </div>
              <div className="mt-3 space-y-2">
                <div className="flex justify-between text-xs"><span>Avg process time</span><span className="font-semibold">8.5 min</span></div>
                <div className="flex justify-between text-xs"><span>Error rate</span><span className="font-semibold text-amber-600">6.4%</span></div>
                <div className="flex justify-between text-xs"><span>Cost per task</span><span className="font-semibold">₹18.50</span></div>
                <div className="flex justify-between text-xs"><span>Availability</span><span className="font-semibold">Business hrs</span></div>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Efficiency Trend (4 weeks)" description="Automation adoption and performance over time.">
          <BarChart data={[
            { label: "W1", value: 72, max: 85 }, { label: "W2", value: 78, max: 88 },
            { label: "W3", value: 84, max: 91 }, { label: "W4", value: 89, max: 94 },
          ]} />
          <div className="mt-2 flex gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-sm bg-accent" /> Success Rate</span>
            <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-sm bg-[#efefea]" /> Target</span>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
