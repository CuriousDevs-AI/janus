"use client";

import * as React from "react";
import { AlertTriangle, Loader2, Send, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionCard } from "@/components/settings/section-ui";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { answerLive, type Answer } from "@/features/portfolio/lib/answer";
import { PreviewRole } from "@/features/portfolio/lib/companies";
import { KnowledgeCard, ModelSetup } from "@/features/portfolio/components/intelligence-setup";
import type { PortfolioAsked, PortfolioCompany, PortfolioModels, PortfolioPeriod, PortfolioSource } from "@/features/portfolio/types";

const suggestions = ["Which company needs me most?", "Why did sales change?", "Who is my biggest customer?", "Compare profit across companies", "What approvals are waiting?", "Any GST or TDS due?"];
const RULES = "rules";
const rulesOnly: PortfolioModels = { options: [{ id: RULES, label: "Janus rules (no AI)", provider: null, company: null, free: true, note: "Fixed answers from the figures on the page. Free, and works with no model." }], companies: [] };

/** One turn: Janus rules answer on the page; a model answers on the server with the facts it cited. */
type Turn = { q: string; rules?: Answer; ai?: PortfolioAsked; pending?: boolean; error?: string };

export function Intelligence({ list, period }: { list: PortfolioCompany[]; period?: PortfolioPeriod }) {
  const preview = React.useContext(PreviewRole);
  const models = useApi<PortfolioModels>(preview ? null : "/portfolio/intelligence/models");
  const history = useApi<PortfolioAsked[]>(preview ? null : "/portfolio/intelligence/history");
  const available = models.data ?? rulesOnly;
  const [chosen, setChosen] = React.useState(RULES);
  const model = available.options.find((option) => option.id === chosen) ?? available.options[0];
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [q, setQ] = React.useState("");
  const [cleared, setCleared] = React.useState(false);
  const earlier = cleared ? [] : (history.data ?? []);

  const ask = async (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setQ("");
    if (model.id === RULES) { setTurns((current) => [...current, { q: clean, rules: answerLive(clean, list, period) }]); return; }
    const index = turns.length;
    setTurns((current) => [...current, { q: clean, pending: true }]);
    try {
      const answer = await api<PortfolioAsked>("/portfolio/intelligence/ask", { method: "POST", body: JSON.stringify({ question: clean, model: model.id, period: period?.key ?? "month" }) });
      setTurns((current) => current.map((turn, at) => at === index ? { q: clean, ai: answer } : turn));
    } catch (error) {
      setTurns((current) => current.map((turn, at) => at === index ? { q: clean, error: message(error) } : turn));
    }
  };

  const forget = async () => {
    try { await api("/portfolio/intelligence/history", { method: "DELETE" }); setCleared(true); setTurns((current) => current.filter((turn) => !turn.ai)); toast.success("Janus no longer remembers your earlier questions."); }
    catch (error) { toast.error(message(error)); }
  };

  const shown: Turn[] = [...earlier.map((item) => ({ q: item.question, ai: item })), ...turns];
  return <div className="flex flex-col gap-4">
    <SectionCard title="Ask across your companies" description="Every answer comes from the figures on the Portfolio and the knowledge you approved, with each source shown. Janus does not guess or forecast.">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[260px] flex-col gap-1 text-xs font-medium text-muted-foreground">Answer with
            <Select value={model.id} onValueChange={setChosen}>
              <SelectTrigger aria-label="Answer with"><SelectValue /></SelectTrigger>
              <SelectContent>{available.options.map((option) => <SelectItem key={option.id} value={option.id}>{option.label}{option.company ? ` · ${option.company}` : ""}{option.free ? " · free" : ""}</SelectItem>)}</SelectContent>
            </Select>
          </label>
          <p className="flex-1 text-xs text-muted-foreground">{preview ? "Only Janus rules while previewing a role: a model would be asked as you, with your figures." : model.note}{!preview && available.options.length === 1 && !models.loading ? " Set up a model below to ask in your own words." : ""}</p>
          {earlier.length > 0 && <Button size="sm" variant="ghost" onClick={forget}><Trash2 className="mr-1 size-4" />Forget earlier questions</Button>}
        </div>
        {shown.length === 0 && <div className="flex flex-wrap gap-2">{suggestions.map((item) => <Button key={item} size="sm" variant="outline" onClick={() => ask(item)}>{item}</Button>)}</div>}
        <ol className="flex flex-col gap-4" aria-live="polite">{shown.map((turn, index) => <li key={index} className="flex flex-col gap-2">
          <p className="self-end bg-accent-muted px-3 py-2 text-sm">{turn.q}</p>
          <div className="border border-border bg-surface-2 p-3 text-sm">
            {turn.pending && <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden />Reading your companies…</p>}
            {turn.error && <p className="flex items-start gap-2 text-danger"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{turn.error}</p>}
            {turn.rules && <RulesAnswer answer={turn.rules} />}
            {turn.ai && <ModelAnswer answer={turn.ai} />}
          </div>
        </li>)}</ol>
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void ask(q); }}><Input aria-label="Ask Janus" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Ask why sales changed, which company needs you, profit, filings…" /><Button type="submit" disabled={!q.trim()}><Send className="mr-1 size-4" />Ask</Button></form>
      </div>
    </SectionCard>
    {!preview && <KnowledgeCard list={list} />}
    {!preview && models.data && <ModelSetup models={models.data} onChange={models.reload} />}
  </div>;
}

function RulesAnswer({ answer }: { answer: Answer }) {
  return <>
    <p className="flex items-start gap-2"><Sparkles className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />{answer.text}</p>
    {answer.rows && answer.rows.length > 0 && <dl className="mt-3 divide-y divide-border border-t border-border">{answer.rows.map(([label, value], row) => <div key={row} className="flex flex-wrap justify-between gap-2 py-2"><dt className="font-medium">{label}</dt><dd className="text-muted-foreground">{value}</dd></div>)}</dl>}
    <p className="mt-2 text-[11px] text-muted-foreground">Janus rules · free</p>
  </>;
}

const kindWord: Record<PortfolioSource["kind"], string> = { figure: "Portfolio figure", knowledge: "Approved fact", document: "Document" };

function ModelAnswer({ answer }: { answer: PortfolioAsked }) {
  return <>
    <p className="flex items-start gap-2 whitespace-pre-line"><Sparkles className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />{answer.answer}</p>
    {!answer.grounded && <p className="mt-2 flex items-center gap-1.5 text-xs text-warning"><AlertTriangle className="size-3.5" aria-hidden />This answer cites none of your figures. Check it before relying on it.</p>}
    {answer.sources.length > 0 && <details className="mt-3 border-t border-border pt-2" open>
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Sources ({answer.sources.length})</summary>
      <ul className="mt-2 flex flex-col gap-1.5">{answer.sources.map((source) => <li key={source.id} className="flex gap-2 text-xs"><span className="shrink-0 rounded border border-border px-1 font-mono">{source.id}</span><span><span className="text-muted-foreground">{kindWord[source.kind]}{source.title ? `, ${source.title}` : ""}: </span>{source.text}</span></li>)}</ul>
    </details>}
    {answer.suggested.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Janus suggests remembering: {answer.suggested.join("; ")}. It waits for your approval under What Janus knows.</p>}
    <p className="mt-2 text-[11px] text-muted-foreground">{answer.model}{answer.costUsd ? ` · about $${Number(answer.costUsd).toFixed(4)}` : ""}</p>
  </>;
}
