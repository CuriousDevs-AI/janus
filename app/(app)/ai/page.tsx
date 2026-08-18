"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Send, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CustomerAvatar } from "@/components/shared/customer-avatar";
import { TurnCard } from "@/components/ai/turn-card";
import { findAnswer, EXAMPLE_QUESTIONS, type BusinessAnswer } from "@/lib/services/business-ai";
import { getCustomerById } from "@/lib/mock-data";

type Turn = {
  id: string;
  question: string;
  status: "thinking" | "done";
  result?: BusinessAnswer | null;
};

let turnSeq = 0;

export default function AskYourBusinessPage() {
  return (
    <React.Suspense fallback={null}>
      <AskYourBusinessPageInner />
    </React.Suspense>
  );
}

function AskYourBusinessPageInner() {
  const searchParams = useSearchParams();
  const customerId = searchParams.get("customer") ?? undefined;
  const contextCustomer = getCustomerById(customerId);

  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [inputValue, setInputValue] = React.useState("");
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turns.length]);

  const submit = React.useCallback((question: string) => {
    const trimmed = question.trim();
    if (!trimmed) return;

    turnSeq += 1;
    const id = `turn-${turnSeq}`;
    setTurns((prev) => [...prev, { id, question: trimmed, status: "thinking" }]);
    setInputValue("");

    // Simulated "thinking" latency only — the answer itself is resolved
    // deterministically by findAnswer, never randomized.
    const delay = 600 + Math.round(Math.random() * 300);
    window.setTimeout(() => {
      const result = findAnswer(trimmed);
      setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, status: "done", result } : t)));
    }, delay);
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submit(inputValue);
  }

  return (
    <div className="mx-auto flex max-w-[820px] flex-col gap-6 px-6 py-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="inline-flex items-center gap-1.5 border border-accent-border bg-accent-muted px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-accent">
          <Sparkles className="size-3" />
          Ask Your Business
        </div>
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground">What do you want to know?</h1>
        <p className="max-w-lg text-[13px] text-muted-foreground">
          Ask natural-language questions about your CRM and operations. Answers are grounded in real numbers —
          never invented.
        </p>
      </div>

      {contextCustomer && (
        <div className="mx-auto flex items-center gap-2 border border-border bg-surface-2 py-1 pl-1 pr-3 text-[12px] text-muted-foreground">
          <CustomerAvatar name={contextCustomer.name} color={contextCustomer.avatarColor} size="sm" />
          Asking in context of <span className="font-medium text-foreground">{contextCustomer.name}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="What do you want to know?"
          className="h-11 flex-1 text-[14px]"
          aria-label="Ask your business a question"
        />
        <Button type="submit" size="lg" disabled={!inputValue.trim()}>
          <Send className="size-4" />
          Ask
        </Button>
      </form>

      <div className="flex flex-wrap justify-center gap-2">
        {EXAMPLE_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => submit(q)}
            className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-accent-border hover:bg-accent-muted hover:text-accent"
          >
            {q}
          </button>
        ))}
      </div>

      {turns.length > 0 && <Separator />}

      <div className="flex flex-col gap-6 pb-4">
        {turns.map((t) => (
          <TurnCard key={t.id} question={t.question} status={t.status} result={t.result} onFollowup={submit} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
