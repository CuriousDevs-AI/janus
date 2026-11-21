"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Check, ShieldCheck, Zap } from "lucide-react";
import { AiPageShell } from "@/components/ai/ai-shell";
import { useWorkspace } from "@/components/layout/workspace-context";
import { useSession } from "@/components/auth/session-provider";
import { useApi } from "@/lib/api/use-api";
import { Badge } from "@/components/ui/badge";
import type { PortfolioAsked } from "@/features/portfolio";

type Usage = { id: string; date: string; provider: string; model: string; status: "pending" | "succeeded" | "failed"; latencyMs: number | null; errorCode: string | null };

const percent = (part: number, whole: number) => whole ? `${Math.round((part / whole) * 100)}%` : "—";

/**
 * How well Janus's model answers hold up, from what actually happened: each answer the model gave
 * (did it cite the records it was given, and were those figures from the books), and each call to the
 * provider (how long it took, whether it failed). Janus rules answers are fixed lookups, so they are
 * not scored here. Nothing is estimated: with no model answers yet, the cards say so.
 */
export default function AIDashboardPage() {
  const { workspaceId, workspace } = useWorkspace();
  const { permissions } = useSession();
  const canSeeUsage = permissions.includes("*") || permissions.includes("ai:manage");
  const history = useApi<PortfolioAsked[]>("/portfolio/intelligence/history");
  const usage = useApi<Usage[]>(canSeeUsage ? "/ai/usage?limit=100" : null);
  const answers = history.data ?? [];
  const calls = (usage.data ?? []).filter((row) => row.status !== "pending");

  const grounded = answers.filter((item) => item.grounded).length;
  const fromRecords = answers.filter((item) => item.sources.some((source) => source.kind === "figure")).length;
  const timed = calls.filter((row) => row.status === "succeeded" && row.latencyMs !== null);
  const latency = timed.length ? Math.round(timed.reduce((sum, row) => sum + (row.latencyMs ?? 0), 0) / timed.length) : null;
  const failed = calls.filter((row) => row.status === "failed").length;
  const assistant = workspaceId === "portfolio" ? "/portfolio?view=intelligence" : `/ai?workspace=${workspaceId}`;
  const loading = history.loading || usage.loading;

  return (
    <AiPageShell page="dashboard" title="AI Dashboard"
      description={`How Janus's model answers hold up for ${workspace.name}: whether each one cites your records, how often it answered without them, and how fast the model replied. Janus rules answers are fixed lookups and are not scored.`}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Trust score" value={percent(grounded, answers.length)} detail={answers.length ? `${grounded} of ${answers.length} answers cite your records` : "Scored once a model answers"} icon={ShieldCheck} tone={tone(grounded, answers.length, 0.9, 0.7)} />
        <MetricCard label="Accuracy" value={percent(fromRecords, answers.length)} detail={answers.length ? `${fromRecords} answers rest on a figure from your books` : "Answers backed by verified figures"} icon={Check} tone={tone(fromRecords, answers.length, 0.8, 0.5)} />
        <MetricCard label="Hallucination rate" value={percent(answers.length - grounded, answers.length)} detail={answers.length ? `${answers.length - grounded} answers cite nothing Janus gave the model` : "Answers that cite nothing"} icon={AlertTriangle} tone={answers.length ? tone(grounded, answers.length, 0.95, 0.8) : "neutral"} />
        <MetricCard label="Avg latency" value={latency === null ? "—" : latency < 1000 ? `${latency} ms` : `${(latency / 1000).toFixed(1)} s`} detail={!canSeeUsage ? "Needs the AI permission" : calls.length ? `${timed.length} calls timed${failed ? `, ${failed} failed` : ""}` : "Timed once a model answers"} icon={Zap} />
      </div>

      {loading && !answers.length ? <p className="text-sm text-muted-foreground" role="status">Reading Janus&apos;s answers…</p>
        : history.error ? <p role="alert" className="text-sm text-danger">{history.error}</p>
        : !answers.length ? <div className="rounded-lg border border-dashed border-border bg-surface px-6 py-10 text-center">
          <h2 className="text-base font-semibold">No model answers to score yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Ask a question with a model in the <Link href={assistant} className="text-accent hover:underline">AI Assistant</Link>. Each answer is scored here: whether it cited your records, and how long it took.</p>
        </div>
        : <section className="rounded-lg border border-border bg-surface">
          <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">Latest model answers</h2>
          <ul className="divide-y divide-border">{[...answers].reverse().slice(0, 20).map((item) => <li key={item.id} className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0"><p className="font-medium">{item.question}</p><p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.answer}</p></div>
            <div className="flex shrink-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <Badge variant={item.grounded ? "success" : "warning"}>{item.grounded ? `Cites ${item.sources.length}` : "Cites nothing"}</Badge>
              <span>{item.model}</span>
            </div>
          </li>)}</ul>
        </section>}
      <p className="text-xs text-muted-foreground">Answers are the questions you asked with a model, across your companies. Latency and failures are this company&apos;s calls to its AI provider.</p>
    </AiPageShell>
  );
}

function tone(part: number, whole: number, good: number, fair: number): "success" | "warning" | "danger" | "neutral" {
  if (!whole) return "neutral";
  const share = part / whole;
  return share >= good ? "success" : share >= fair ? "warning" : "danger";
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
