"use client";

import * as React from "react";
import { Sparkles, Send, User } from "lucide-react";
import { useAppStore, useCompany } from "@/lib/stores/app-store";
import { getMemoryForCustomer } from "@/lib/mock-data";
import { answerAboutCustomer, SUGGESTED_QUESTIONS } from "@/lib/services/customer-ai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export function CustomerAIPanel({ customerId }: { customerId: string }) {
  const customer = useAppStore((s) => s.customers.find((c) => c.id === customerId))!;
  const allDeals = useAppStore((s) => s.deals);
  const allTickets = useAppStore((s) => s.tickets);
  const allActivities = useAppStore((s) => s.activities);
  const allConversations = useAppStore((s) => s.conversations);
  const deals = allDeals.filter((d) => d.customerId === customerId);
  const tickets = allTickets.filter((t) => t.customerId === customerId);
  const activities = allActivities.filter((a) => a.customerId === customerId);
  const conversations = allConversations.filter((c) => c.customerId === customerId);
  const company = useCompany(customer.companyId);

  const [input, setInput] = React.useState("");
  const [turns, setTurns] = React.useState<{ question: string; text: string; sources: string[] }[]>([]);
  const [thinking, setThinking] = React.useState(false);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  function ask(question: string) {
    if (!question.trim()) return;
    setInput("");
    setThinking(true);
    window.setTimeout(() => {
      const sorted = [...activities].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      const answer = answerAboutCustomer(question, {
        customer,
        companyName: company?.name ?? "their company",
        deals,
        tickets,
        memory: getMemoryForCustomer(customerId),
        activities: sorted,
        conversationCount: conversations.length,
      });
      setTurns((t) => [...t, { question, text: answer.text, sources: answer.sources }]);
      setThinking(false);
    }, 700);
  }

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [turns.length, thinking]);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="mb-3 flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-accent" />
          <span className="text-[13px] font-semibold text-foreground">Ask anything about this customer</span>
        </div>

        {turns.length === 0 && !thinking && (
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => ask(q)}
                className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] text-muted-foreground hover:border-accent-border hover:text-foreground"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        <div className="mt-3 flex max-h-[420px] flex-col gap-4 overflow-y-auto">
          {turns.map((t, i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5 self-end rounded-md bg-surface-3 px-2.5 py-1.5 text-[12.5px] text-foreground">
                <User className="size-3 text-muted-foreground" />
                {t.question}
              </div>
              <div className="rounded-md border border-accent-border bg-accent-muted px-3 py-2.5">
                <p className="text-[13px] leading-relaxed text-foreground">{t.text}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {t.sources.map((src) => (
                    <Badge key={src} variant="accent">
                      {src}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          ))}
          {thinking && (
            <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
              <Sparkles className="size-3.5 text-accent" />
              Thinking…
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
          className="mt-3 flex items-center gap-2"
        >
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask anything about this customer…" />
          <Button type="submit" size="icon" disabled={!input.trim()}>
            <Send className="size-3.5" />
          </Button>
        </form>
      </div>
    </div>
  );
}
