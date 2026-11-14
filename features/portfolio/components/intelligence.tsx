"use client";

import * as React from "react";
import { AlertTriangle, ArrowUp, BookOpen, Building2, Check, Copy, Cpu, FileCheck2, Landmark, MessageSquarePlus, Scale, Sparkles, Trash2, TrendingDown, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSession } from "@/components/auth/session-provider";
import { api, message } from "@/lib/api/client";
import { answerLive, type Answer } from "@/features/portfolio/lib/answer";
import { PreviewRole } from "@/features/portfolio/lib/companies";
import { usePortfolioApi } from "@/features/portfolio/lib/use-portfolio-api";
import { KnowledgeCard } from "@/features/portfolio/components/intelligence-setup";
import { SetupModelDialog } from "@/features/portfolio/components/ai-setup";
import type { PortfolioAsked, PortfolioCompany, PortfolioModels, PortfolioPeriod, PortfolioSource } from "@/features/portfolio/types";

const suggestions: [string, React.ComponentType<{ className?: string }>][] = [
  ["Which company needs immediate attention?", TriangleAlert],
  ["Which company is performing worst this month, and why?", TrendingDown],
  ["Compare profit across companies", Scale],
  ["What are the biggest financial risks?", Landmark],
  ["Who is my biggest customer?", Building2],
  ["Any GST or TDS due?", FileCheck2],
];
/** The first questions for one business on its own: what an owner asks most days. */
const ownSuggestions: [string, React.ComponentType<{ className?: string }>][] = [
  ["What needs my attention?", TriangleAlert],
  ["Why did sales change?", TrendingDown],
  ["How much profit did we make?", Scale],
  ["What are the biggest financial risks?", Landmark],
  ["Who is my biggest customer?", Building2],
  ["Any GST or TDS due?", FileCheck2],
];
/** Questions about one company that Janus rules can answer when the company is named. */
const about = (name: string): string[] => [
  `What needs attention at ${name}?`,
  `Why did ${name}'s sales change?`,
  `How much profit did ${name} make?`,
  `What is owed to ${name}?`,
  `Any GST or TDS due at ${name}?`,
];
const RULES = "rules";
const rulesOnly: PortfolioModels = { options: [{ id: RULES, label: "Janus rules (no AI)", provider: null, company: null, free: true, note: "Fixed answers from the figures on the page. Free, and works with no model." }], companies: [], free: [], portfolioKeys: [], canAddKeys: false };

/** One turn: Janus rules answer on the page; a model answers on the server with the facts it cited. */
type Turn = { q: string; rules?: Answer; ai?: PortfolioAsked; pending?: boolean; error?: string };

/** This page load's conversation, per person, so moving to another Portfolio page and back keeps it. */
const conversations = new Map<string, Turn[]>();

/**
 * Janus answers questions from the Portfolio's figures and what it was told. Given one `company`
 * (Business Management), it answers about that company alone, and a model reads only its records.
 */
export function Intelligence({ list: all, period, company }: { list: PortfolioCompany[]; period?: PortfolioPeriod; company?: PortfolioCompany }) {
  const list = company ? [company] : all;
  const preview = React.useContext(PreviewRole);
  const who = useSession().user.id;
  const models = usePortfolioApi<PortfolioModels>(preview ? null : "/portfolio/intelligence/models");
  const history = usePortfolioApi<PortfolioAsked[]>(preview ? null : "/portfolio/intelligence/history");
  const available = models.data ?? rulesOnly;
  const [chosen, setChosen] = React.useState(RULES);
  const model = available.options.find((option) => option.id === chosen) ?? available.options[0];
  const [turns, setTurnsState] = React.useState<Turn[]>(() => conversations.get(who) ?? []);
  const setTurns = (change: (current: Turn[]) => Turn[]) => setTurnsState((current) => { const next = change(current); conversations.set(who, next); return next; });
  const [q, setQ] = React.useState("");
  const [cleared, setCleared] = React.useState(false);
  const [panel, setPanel] = React.useState<"knowledge" | null>(null);
  const [settingUp, setSettingUp] = React.useState(false);
  const [focus, setFocus] = React.useState<string | null>(null);
  const focused = company ?? list.find((item) => item.id === focus);
  const tries = company ? ownSuggestions.map(([text]) => text) : focused ? about(focused.name) : suggestions.map(([text]) => text);
  const earlier = cleared ? [] : (history.data ?? []);
  const shown: Turn[] = [...earlier.map((item) => ({ q: item.question, ai: item })), ...turns];
  const busy = turns.some((turn) => turn.pending);

  const scroller = React.useRef<HTMLDivElement>(null);
  const box = React.useRef<HTMLTextAreaElement>(null);
  // Keep the newest message in view as the conversation grows.
  React.useEffect(() => { if (shown.length) scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [shown.length, busy]);

  const ask = async (text: string) => {
    const clean = text.trim();
    if (!clean || busy) return;
    setQ("");
    if (box.current) box.current.style.height = "auto";
    box.current?.focus({ preventScroll: true });
    if (model.id === RULES) { setTurns((current) => [...current, { q: clean, rules: answerLive(clean, list, period) }]); return; }
    setTurns((current) => [...current, { q: clean, pending: true }]);
    const settle = (done: Turn) => setTurns((current) => current.map((turn) => turn.pending && turn.q === clean ? done : turn));
    try {
      const answer = await api<PortfolioAsked>("/portfolio/intelligence/ask", { method: "POST", body: JSON.stringify({ question: clean, model: model.id, period: period?.key ?? "month", ...(company ? { companyId: company.id } : {}) }) });
      settle({ q: clean, ai: answer });
    } catch (error) {
      settle({ q: clean, error: message(error) });
    }
  };

  const forget = async () => {
    try { await api("/portfolio/intelligence/history", { method: "DELETE" }); setCleared(true); setTurns((current) => current.filter((turn) => !turn.ai)); toast.success("Janus no longer remembers your earlier questions."); }
    catch (error) { toast.error(message(error)); }
  };

  return <div className="flex flex-col gap-4">
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <section aria-label="Conversation with Janus" className="flex h-[calc(100vh-220px)] min-h-[520px] flex-col overflow-hidden rounded-xl border border-border bg-surface">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground"><Sparkles className="size-4" aria-hidden /></span>
            <div className="min-w-0"><p className="text-sm font-semibold">Janus</p><p className="truncate text-xs text-muted-foreground">{company ? company.name : `Across ${list.length} ${list.length === 1 ? "company" : "companies"}`}{period ? ` · ${period.label}` : ""} · answers only from your figures</p></div>
          </div>
          {turns.length > 0 && <Button size="sm" variant="ghost" onClick={() => setTurns(() => [])} title="Start a new conversation"><MessageSquarePlus className="size-4" />New chat</Button>}
        </header>

        <div ref={scroller} className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {shown.length === 0 ? <Welcome count={list.length} company={company} onAsk={(text) => void ask(text)} />
            : <ol className="mx-auto flex max-w-3xl flex-col gap-6" aria-live="polite">{shown.map((turn, index) => <li key={index} className="flex flex-col gap-3">
              <p className="max-w-[85%] self-end whitespace-pre-line rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-sm text-accent-foreground">{turn.q}</p>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-muted text-accent"><Sparkles className="size-3.5" aria-hidden /></span>
                <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-border bg-surface-2 px-4 py-3 text-sm">
                  {turn.pending && <Thinking />}
                  {turn.error && <p className="flex items-start gap-2 text-danger"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{turn.error}</p>}
                  {turn.rules && <RulesAnswer answer={turn.rules} />}
                  {turn.ai && <ModelAnswer answer={turn.ai} />}
                  {(turn.rules || turn.ai) && <CopyAnswer text={turn.ai ? turn.ai.answer : [turn.rules!.text, ...(turn.rules!.rows ?? []).map(([label, value]) => `${label.replace(/^↳\s*/, "")}: ${value}`)].join("\n")} />}
                </div>
              </div>
            </li>)}</ol>}
        </div>

        <form className="border-t border-border p-3" onSubmit={(event) => { event.preventDefault(); void ask(q); }}>
          <div className="flex items-end gap-2 rounded-xl border border-input bg-surface-2 px-3 py-2 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
            <textarea ref={box} aria-label="Ask Janus" rows={1} value={q} placeholder={company ? "Ask about sales, profit, money owed, customers or filings…" : "Ask about sales, profit, money owed, filings or a company…"}
              onChange={(event) => { setQ(event.target.value); event.target.style.height = "auto"; event.target.style.height = `${Math.min(event.target.scrollHeight, 140)}px`; }}
              onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void ask(q); } }}
              className="max-h-[140px] min-h-[24px] flex-1 resize-none bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground" />
            <Button type="submit" size="icon" className="size-8 shrink-0 rounded-lg" disabled={!q.trim() || busy} aria-label="Send"><ArrowUp className="size-4" /></Button>
          </div>
          <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">Enter to send, Shift+Enter for a new line. Answering with {model.label}{model.company ? ` (${model.company})` : ""}. Janus does not guess or forecast.</p>
        </form>
      </section>

      <aside className="flex flex-col gap-4">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Cpu className="size-3.5" aria-hidden />Answer with</p>
          <Select value={model.id} onValueChange={setChosen}>
            <SelectTrigger aria-label="Answer with"><SelectValue /></SelectTrigger>
            <SelectContent>{available.options.map((option) => <SelectItem key={option.id} value={option.id}>{option.label}{option.company ? ` · ${option.company}` : ""}{option.free ? " · free" : ""}</SelectItem>)}</SelectContent>
          </Select>
          <p className="mt-2 text-xs text-muted-foreground">{preview ? "Only Janus rules while previewing a role: a model would be asked as you, with your figures." : model.note}</p>
          {!preview && <Button size="sm" variant="outline" className="mt-3 w-full" disabled={!models.data} onClick={() => setSettingUp(true)}>Set up model</Button>}
          {!preview && available.options.length > 1 && <a className="mt-2 block text-center text-xs text-accent hover:underline" href="/portfolio?view=ai-keys">Manage AI keys</a>}
        </div>
        {!company && list.length > 1 && <div className="rounded-xl border border-border bg-surface p-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Building2 className="size-3.5" aria-hidden />Ask about</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Ask about">
            <button type="button" aria-pressed={!focused} onClick={() => setFocus(null)} className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${!focused ? "border-accent bg-accent-muted text-accent" : "border-border hover:bg-surface-2"}`}>All companies</button>
            {list.map((item) => <button key={item.id} type="button" aria-pressed={focus === item.id} onClick={() => setFocus(focus === item.id ? null : item.id)} className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${focus === item.id ? "border-accent bg-accent-muted text-accent" : "border-border hover:bg-surface-2"}`}>{item.name}</button>)}
          </div>
        </div>}
        {(shown.length > 0 || focused) && <div className="rounded-xl border border-border bg-surface p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{focused && !company ? `Try asking about ${focused.name}` : "Try asking"}</p>
          <ul className="flex flex-col gap-1">{tries.map((text) => <li key={text}><button type="button" disabled={busy} onClick={() => void ask(text)} className="w-full rounded-md px-2 py-1.5 text-left text-[13px] text-foreground transition-colors hover:bg-surface-2 disabled:opacity-50">{text}</button></li>)}</ul>
        </div>}
        {!preview && <div className="rounded-xl border border-border bg-surface p-4">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><BookOpen className="size-3.5" aria-hidden />What Janus knows</p>
          <p className="text-xs text-muted-foreground">Facts and documents you approved, used beside your records. Janus never remembers anything on its own.</p>
          <Button size="sm" variant="outline" className="mt-3 w-full" aria-expanded={panel === "knowledge"} onClick={() => setPanel(panel === "knowledge" ? null : "knowledge")}>{panel === "knowledge" ? "Hide knowledge" : "See and add knowledge"}</Button>
          {earlier.length > 0 && <Button size="sm" variant="ghost" className="mt-1 w-full text-muted-foreground" onClick={forget}><Trash2 className="size-3.5" />Forget earlier questions</Button>}
        </div>}
      </aside>
    </div>
    {!preview && panel === "knowledge" && <KnowledgeCard list={list} />}
    {settingUp && models.data && <SetupModelDialog models={models.data} onClose={() => setSettingUp(false)} onSaved={(id) => { setSettingUp(false); setChosen(id); models.reload(); }} />}
  </div>;
}

function Welcome({ count, company, onAsk }: { count: number; company?: PortfolioCompany; onAsk: (text: string) => void }) {
  const offered: [string, React.ComponentType<{ className?: string }>][] = company ? ownSuggestions : suggestions;
  return <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center gap-6 py-6 text-center">
    <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-muted text-accent"><Sparkles className="size-6" aria-hidden /></span>
    <div>
      <h2 className="text-lg font-semibold">{company ? `Ask about ${company.name}` : `Ask about all ${count} ${count === 1 ? "company" : "companies"}`}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{company ? "Every answer gives the figure behind it, and says when the records cannot answer." : "Every answer names the company and the figure behind it, and says when the records cannot answer."}</p>
    </div>
    <div className="grid w-full gap-2 sm:grid-cols-2">{offered.map(([text, Icon]) => <button key={text} type="button" onClick={() => onAsk(text)} className="flex items-start gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-3 text-left text-[13px] transition-colors hover:border-accent-border hover:bg-accent-muted">
      <Icon className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden /><span>{text}</span>
    </button>)}</div>
  </div>;
}

/** Copies an answer, so it can go into a message or a note. */
function CopyAnswer({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }
    catch { toast.error("Could not copy. Select the answer and copy it instead."); }
  };
  return <button type="button" onClick={() => void copy()} className="mt-2 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-surface hover:text-foreground">{copied ? <><Check className="size-3" aria-hidden />Copied</> : <><Copy className="size-3" aria-hidden />Copy answer</>}</button>;
}

function Thinking() {
  return <p className="flex items-center gap-2 text-muted-foreground" role="status"><span className="flex gap-1" aria-hidden>{[0, 1, 2].map((dot) => <span key={dot} className="size-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: `${dot * 120}ms` }} />)}</span>Reading your companies…</p>;
}

function Rows({ rows }: { rows: [string, string][] }) {
  return <dl className="mt-3 overflow-hidden rounded-lg border border-border bg-surface">{rows.map(([label, value], row) => <div key={row} className={`grid gap-x-4 gap-y-0.5 px-3 py-2 sm:grid-cols-[minmax(140px,0.35fr)_1fr] ${row ? "border-t border-border" : ""} ${label.startsWith("↳") ? "bg-surface-2/60 pl-6" : ""}`}><dt className="font-medium">{label.replace(/^↳\s*/, "")}</dt><dd className="text-muted-foreground">{value}</dd></div>)}</dl>;
}

function RulesAnswer({ answer }: { answer: Answer }) {
  return <>
    <p className="leading-relaxed">{answer.text}</p>
    {answer.rows && answer.rows.length > 0 && <Rows rows={answer.rows} />}
    <p className="mt-2.5 text-[11px] text-muted-foreground">Janus rules · free · from the figures on the Portfolio</p>
  </>;
}

const kindWord: Record<PortfolioSource["kind"], string> = { figure: "Portfolio figure", knowledge: "Approved fact", document: "Document" };

function ModelAnswer({ answer }: { answer: PortfolioAsked }) {
  return <>
    <p className="whitespace-pre-line leading-relaxed">{answer.answer}</p>
    {!answer.grounded && <p className="mt-2 flex items-center gap-1.5 text-xs text-warning"><AlertTriangle className="size-3.5" aria-hidden />This answer cites none of your figures. Check it before relying on it.</p>}
    {answer.sources.length > 0 && <details className="mt-3 rounded-lg border border-border bg-surface px-3 py-2">
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Sources ({answer.sources.length})</summary>
      <ul className="mt-2 flex flex-col gap-1.5">{answer.sources.map((source) => <li key={source.id} className="flex gap-2 text-xs"><span className="shrink-0 rounded border border-border px-1 font-mono">{source.id}</span><span><span className="text-muted-foreground">{kindWord[source.kind]}{source.title ? `, ${source.title}` : ""}: </span>{source.text}</span></li>)}</ul>
    </details>}
    {answer.suggested.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Janus suggests remembering: {answer.suggested.join("; ")}. It waits for your approval under What Janus knows.</p>}
    <p className="mt-2.5 text-[11px] text-muted-foreground">{answer.model}{answer.costUsd ? ` · about $${Number(answer.costUsd).toFixed(4)}` : ""}</p>
  </>;
}
