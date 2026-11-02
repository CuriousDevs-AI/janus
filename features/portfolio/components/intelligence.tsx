"use client";

import * as React from "react";
import { Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/settings/section-ui";
import { answerLive, type Answer } from "@/features/portfolio/lib/answer";
import type { PortfolioCompany } from "@/features/portfolio/types";

const suggestions = ["What needs my attention?", "Which company has the heaviest payroll?", "What approvals are waiting?", "Any GST or TDS due?"];

export function Intelligence({ list }: { list: PortfolioCompany[] }) {
  const [turns, setTurns] = React.useState<{ q: string; a: Answer }[]>([]);
  const [q, setQ] = React.useState("");
  const ask = (text: string) => { const clean = text.trim(); if (!clean) return; setTurns((current) => [...current, { q: clean, a: answerLive(clean, list) }]); setQ(""); };
  return <SectionCard title="Ask across your companies" description="Answers come from the figures on the Portfolio, with the numbers shown. Janus does not guess.">
    <div className="flex flex-col gap-4">
      {turns.length === 0 && <div className="flex flex-wrap gap-2">{suggestions.map((item) => <Button key={item} size="sm" variant="outline" onClick={() => ask(item)}>{item}</Button>)}</div>}
      <ol className="flex flex-col gap-4" aria-live="polite">{turns.map((turn, index) => <li key={index} className="flex flex-col gap-2"><p className="self-end bg-accent-muted px-3 py-2 text-sm">{turn.q}</p><div className="border border-border bg-surface-2 p-3 text-sm"><p className="flex items-start gap-2"><Sparkles className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />{turn.a.text}</p>{turn.a.rows && turn.a.rows.length > 0 && <dl className="mt-3 divide-y divide-border border-t border-border">{turn.a.rows.map(([label, value], row) => <div key={row} className="flex flex-wrap justify-between gap-2 py-2"><dt className="font-medium">{label}</dt><dd className="text-muted-foreground">{value}</dd></div>)}</dl>}</div></li>)}</ol>
      <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); ask(q); }}><Input aria-label="Ask Janus" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Ask about what needs you, approvals, money, stock, delivery or filings" /><Button type="submit" disabled={!q.trim()}><Send className="mr-1 size-4" />Ask</Button></form>
    </div>
  </SectionCard>;
}
