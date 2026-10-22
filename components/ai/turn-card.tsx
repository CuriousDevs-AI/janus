"use client";

import { Bot, ChevronRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EXAMPLE_QUESTIONS, type BusinessAnswer } from "@/lib/services/business-ai";
import { MiniBarChart } from "@/components/ai/mini-bar-chart";

const FALLBACK_MESSAGE =
  "Janus could not answer from the connected records. Check the data connection and permissions, then try again.";

function FollowupChips({ questions, onSelect }: { questions: string[]; onSelect: (q: string) => void }) {
  if (questions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {questions.map((q) => (
        <button
          key={q}
          type="button"
          onClick={() => onSelect(q)}
          className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-left text-[12px] text-foreground transition-colors hover:border-accent-border hover:bg-accent-muted hover:text-accent"
        >
          {q}
        </button>
      ))}
    </div>
  );
}

export function TurnCard({
  question,
  status,
  result,
  onFollowup,
}: {
  question: string;
  status: "thinking" | "done";
  result: BusinessAnswer | null | undefined;
  onFollowup: (question: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-lg rounded-tr-sm border border-accent-border bg-accent-muted px-3.5 py-2 text-[13px] leading-relaxed text-foreground">
          {question}
        </div>
      </div>

      <div className="flex gap-2.5">
        <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border border-accent-border bg-accent-muted">
          <Bot className="size-3.5 text-accent" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-lg border border-border bg-surface px-4 py-3.5">
          {status === "thinking" ? (
            <div className="flex items-center gap-2 py-0.5 text-[13px] text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin text-accent" />
              Thinking…
            </div>
          ) : result ? (
            <>
              <p className="text-[13px] leading-relaxed text-foreground">{result.answer}</p>

              {result.chartType === "bar" && result.chartData && result.chartData.length > 0 && (
                <MiniBarChart data={result.chartData} />
              )}

              {result.dataUsed.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Data used</span>
                  {result.dataUsed.map((d) => (
                    <Badge key={d} variant="neutral">
                      {d}
                    </Badge>
                  ))}
                </div>
              )}

              <details className="group rounded-md border border-border bg-surface-2">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-[12px] font-medium text-muted-foreground [&::-webkit-details-marker]:hidden hover:text-foreground">
                  <ChevronRight className="size-3.5 shrink-0 transition-transform group-open:rotate-90" />
                  View how this was calculated
                </summary>
                <dl className="grid grid-cols-1 gap-x-5 gap-y-2.5 border-t border-border px-3 py-3 text-[12px] sm:grid-cols-2">
                  <div>
                    <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Metric</dt>
                    <dd className="mt-0.5 text-foreground">{result.calculation.metric}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Period</dt>
                    <dd className="mt-0.5 text-foreground">{result.calculation.period}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Filters</dt>
                    <dd className="mt-0.5 text-foreground">{result.calculation.filters}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Sources</dt>
                    <dd className="mt-0.5 text-foreground">{result.calculation.sources}</dd>
                  </div>
                </dl>
              </details>

              <FollowupChips questions={result.followups} onSelect={onFollowup} />
            </>
          ) : (
            <>
              <p className="text-[13px] leading-relaxed text-foreground">{FALLBACK_MESSAGE}</p>
              <FollowupChips questions={EXAMPLE_QUESTIONS} onSelect={onFollowup} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
