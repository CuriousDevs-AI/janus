"use client";

import * as React from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { FilterChips } from "@/components/shared/stat-tile";
import { Intelligence, KnowledgeCard, usePortfolioApi, WorkInbox, type PortfolioPeriodKey, type PortfolioSummary } from "@/features/portfolio";

/** The three things Janus Intelligence does for one business. Older links to the earlier sections
 * still land on the one that does that job now. */
const views = [
  { value: "ask", label: "Ask Janus" },
  { value: "todo", label: "What needs you" },
  { value: "knowledge", label: "What Janus knows" },
] as const;
type View = (typeof views)[number]["value"];
const earlier: Record<string, View> = { chat: "ask", memory: "ask", history: "ask", insights: "todo", performance: "todo", risks: "todo", planning: "todo", forecasts: "todo", recommendations: "todo" };
export const intelligenceView = (requested: string | null): View => views.find((item) => item.value === requested)?.value ?? earlier[requested ?? ""] ?? "ask";

const periods: { value: PortfolioPeriodKey; label: string }[] = [
  { value: "month", label: "This month" },
  { value: "quarter", label: "This quarter" },
  { value: "fy", label: "This financial year" },
];

/**
 * Janus Intelligence for the company open now: questions answered from its own records (free with
 * Janus rules, or with a model the Owner set up), what needs someone to act, and the facts and
 * documents Janus may use. It is the Portfolio's Janus, limited to this one company.
 */
export function JanusIntelligence({ requested }: { requested: string | null }) {
  const view = intelligenceView(requested);
  const [period, setPeriod] = React.useState<PortfolioPeriodKey>("month");
  const summary = usePortfolioApi<PortfolioSummary>(`/portfolio/summary?period=${period}`, { keepPrevious: true });
  const company = summary.data?.companies.find((item) => item.current);

  return <div className="mx-auto flex max-w-[1240px] flex-col gap-5 px-4 py-6 sm:px-6 sm:py-7">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div>
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-accent"><Sparkles className="size-3" aria-hidden />Janus Intelligence</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{views.find((item) => item.value === view)!.label}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {view === "ask" ? `Ask about ${company?.name ?? "your business"} in plain words. Janus answers from its records and shows the figure behind each answer.`
            : view === "todo" ? "Everything waiting on someone, most urgent first: overdue money, approvals, filings and late work. Open one to deal with it."
            : "What Janus may use beside your records: facts you told it and documents you added. It never remembers anything on its own."}
        </p>
      </div>
      {view === "ask" && <FilterChips label="Period" value={period} options={periods} onChange={setPeriod} />}
    </div>
    <nav className="janus-tab-strip flex gap-1 overflow-x-auto rounded-lg bg-surface-2 p-1" aria-label="Janus Intelligence sections">
      {views.map((item) => <Link key={item.value} replace scroll={false} href={`/ai?workspace=business&view=${item.value}`} aria-current={item.value === view ? "page" : undefined}
        className={`shrink-0 rounded-sm px-3 py-2 text-xs transition-colors ${item.value === view ? "bg-surface font-medium text-foreground shadow-sm" : "text-muted-foreground hover:bg-surface/70 hover:text-foreground"}`}>{item.label}</Link>)}
    </nav>
    {summary.error && !summary.data ? <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">Janus could not read this company&apos;s records: {summary.error}</p>
      : !company ? <p className="text-sm text-muted-foreground" role="status">{summary.loading ? "Reading your records…" : "Your role does not include this company's figures, so Janus has nothing to answer from. Ask the Owner for access."}</p>
      : view === "ask" ? <Intelligence list={[company]} company={company} period={summary.data?.period} />
      : view === "todo" ? <WorkInbox list={[company]} />
      : <KnowledgeCard list={[company]} />}
  </div>;
}
