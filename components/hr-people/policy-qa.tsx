"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { loadHrFile, useHrDocumentStore } from "@/lib/stores/hr-document-store";
import { useHrOperationsStore, type HrPolicyQuestion } from "@/lib/stores/hr-operations-store";
import { canManageHr } from "@/lib/hr-people-access";
import { answerQuestion, policySource, settingsSource, type Answer, type Citation, type PolicySource } from "@/lib/hr-policy-qa";
import { HrEmpty, HrField, HrModal, HrPanel, HrStats, HrStatus, hrDate } from "@/components/hr-people/operations-ui";
import type { HrDemoRole } from "@/lib/types";

const suggestions = ["How many sick days do I get?", "Who approves my leave?", "When am I marked late?", "How do I claim a reimbursement?", "What should I do if I lose my laptop?"];
const when = (value: string) => new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
interface Asked { id: string; question: string; answer: Answer; at: string }

export function HrPolicyQaView({ role, actorId }: { role: HrDemoRole; actorId: string }) {
  const { employees } = useHrPeopleStore();
  const { policies, extras } = useHrDocumentStore();
  const { settings, policyQuestions, addPolicyQuestion, replyPolicyQuestion } = useHrOperationsStore();
  const [tab, setTab] = React.useState<"ask" | "mine" | "inbox">("ask");
  const [text, setText] = React.useState("");
  const [asked, setAsked] = React.useState<Asked[]>([]);
  const [escalating, setEscalating] = React.useState<Asked | null>(null);
  const [viewing, setViewing] = React.useState<Citation | null>(null);
  const [fileText, setFileText] = React.useState<Record<string, string>>({});
  const manager = canManageHr(role);
  const actor = employees.find((item) => item.id === actorId);
  const actorName = actor?.name ?? "HR";

  const uploaded = React.useMemo(() => policies.filter((item) => extras[item.id]?.fileKey), [policies, extras]);
  React.useEffect(() => {
    let cancelled = false;
    uploaded.filter((item) => extras[item.id]?.mime?.startsWith("text/")).forEach((item) => {
      const key = extras[item.id].fileKey!;
      loadHrFile(key).then((blob) => blob?.text()).then((value) => { if (!cancelled && value) setFileText((current) => current[item.id] === value ? current : { ...current, [item.id]: value }); }).catch(() => undefined);
    });
    return () => { cancelled = true; };
  }, [uploaded, extras]);

  const sources: PolicySource[] = React.useMemo(() => [
    ...policies.filter((item) => item.status !== "archived").map((item) => policySource(item, extras[item.id]?.fileKey ? (fileText[item.id] ?? "") : item.body)),
    settingsSource(settings),
  ], [policies, extras, fileText, settings]);
  const unsearchable = uploaded.filter((item) => !extras[item.id]?.mime?.startsWith("text/"));
  const mine = policyQuestions.filter((item) => item.employeeId === actorId);
  const open = policyQuestions.filter((item) => item.status === "open");
  const gaps = policyQuestions.filter((item) => item.gap);

  function ask(question: string) {
    const trimmed = question.trim();
    if (trimmed.length < 3) return;
    const answer = answerQuestion(trimmed, sources, employees, actorName);
    setAsked((current) => [{ id: crypto.randomUUID(), question: trimmed, answer, at: new Date().toISOString() }, ...current]);
    setText("");
  }

  return <div className="space-y-5">
    <HrStats items={[{ label: "Policies searched", value: sources.filter((item) => item.paragraphs.length).length, hint: `${sources.reduce((sum, item) => sum + item.paragraphs.length, 0)} passages` }, { label: "My questions to HR", value: mine.length, hint: `${mine.filter((item) => item.status === "open").length} waiting for a reply` }, ...(manager ? [{ label: "Open employee questions", value: open.length, hint: "Waiting for an HR reply" }, { label: "Policy gaps", value: gaps.length, hint: "Questions no policy answered" }] : [])]} />
    <div role="tablist" className="flex gap-1 border-b border-border">{([["ask", "Ask a question"], ["mine", `My questions${mine.length ? ` (${mine.length})` : ""}`], ...(manager ? [["inbox", `Employee questions${open.length ? ` (${open.length})` : ""}`]] : [])] as [typeof tab, string][]).map(([key, label]) => <button key={key} id={`pqa-tab-${key}`} role="tab" aria-selected={tab === key} aria-controls="pqa-panel" tabIndex={tab === key ? 0 : -1} onClick={() => setTab(key)} onKeyDown={(event) => { const keys = ["ask", "mine", ...(manager ? ["inbox"] : [])] as (typeof tab)[]; const at = keys.indexOf(tab); if (event.key === "ArrowRight") setTab(keys[(at + 1) % keys.length]); if (event.key === "ArrowLeft") setTab(keys[(at - 1 + keys.length) % keys.length]); }} className={`px-4 py-2 text-sm ${tab === key ? "border-b-2 border-accent font-medium" : "text-muted-foreground"}`}>{label}</button>)}</div>

    <div id="pqa-panel" role="tabpanel" aria-labelledby={`pqa-tab-${tab}`} className="space-y-5">
    {tab === "ask" && <>
      <HrPanel title="Ask about company policy" description="Answers are quoted from your company's policy documents and HR settings, with sources you can open. This is not legal advice.">
        <form className="space-y-3 p-5" onSubmit={(event) => { event.preventDefault(); ask(text); }}>
          <div className="flex gap-2"><Input aria-label="Your question" value={text} maxLength={200} onChange={(event) => setText(event.target.value)} placeholder="e.g. How many casual leaves do I get?" className="rounded-none" /><Button disabled={text.trim().length < 3}>Ask</Button></div>
          <div className="flex flex-wrap gap-2">{suggestions.map((item) => <button key={item} type="button" onClick={() => ask(item)} className="border border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-accent hover:text-accent">{item}</button>)}</div>
        </form>
      </HrPanel>
      {asked.map((item) => <article key={item.id} aria-label={`Answer to ${item.question}`} className="border border-border bg-surface">
        <header className="border-b border-border bg-surface-2 px-5 py-3"><p className="text-sm font-medium">{item.question}</p><p className="text-[11px] text-muted-foreground">{when(item.at)}</p></header>
        <div className="space-y-3 px-5 py-4 text-sm">
          {item.answer.kind === "answer" ? <>
            <p className="text-xs text-muted-foreground">From your company policies:</p>
            <ul className="space-y-2">{item.answer.lines.map((line, index) => <li key={index} className="flex gap-2"><span className="mt-1 size-1.5 shrink-0 bg-accent" aria-hidden /><span>{line.text} <button type="button" className="align-super text-[11px] font-semibold text-accent hover:underline" aria-label={`Open source ${line.cite}`} onClick={() => setViewing(item.answer.kind === "answer" ? item.answer.citations[line.cite - 1] : null)}>[{line.cite}]</button></span></li>)}</ul>
            <div className="flex flex-wrap gap-2 border-t border-border pt-3">{item.answer.citations.map((citation) => <button key={citation.n} type="button" onClick={() => setViewing(citation)} className="border border-border px-2 py-1 text-xs hover:border-accent"><span className="font-semibold text-accent">[{citation.n}]</span> {citation.title}{citation.version ? ` · v${citation.version}` : ""} · passage {citation.paragraphIndex + 1} · {citation.confidence === "high" ? "strong match" : "partial match"}</button>)}</div>
          </> : <div className="space-y-2"><p>{item.answer.reason}</p>{item.answer.kind === "none" && <p className="text-xs text-muted-foreground">I won&apos;t guess. HR can answer this and, if it keeps coming up, add it to the policy.</p>}</div>}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3"><p className="text-[11px] text-muted-foreground">Summaries quote the policy. Check the source before relying on them.</p><Button size="sm" variant={item.answer.kind === "answer" ? "outline" : "default"} onClick={() => setEscalating(item)}>{item.answer.kind === "answer" ? "Not what you need? Ask HR" : "Ask HR"}</Button></div>
        </div>
      </article>)}
      {!asked.length && <HrEmpty>Ask a question above, or pick one of the examples.</HrEmpty>}
      <HrPanel title="What I search" description="Only these documents. Personal records such as salary or leave balances are never read here.">
        <ul className="divide-y divide-border text-sm">{sources.map((source) => <li key={source.id} className="flex items-center justify-between gap-3 px-5 py-2"><span>{source.title}{source.version ? <span className="text-muted-foreground"> · v{source.version}</span> : <span className="text-muted-foreground"> · live from HR Settings</span>}</span><span className="text-xs text-muted-foreground">{source.paragraphs.length} passages</span></li>)}
          {unsearchable.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 px-5 py-2 text-sm"><span>{item.name}</span><span className="text-xs text-warning">Not searchable yet. Upload a text version.</span></li>)}</ul>
      </HrPanel>
    </>}

    {tab === "mine" && <HrPanel title="My questions to HR" description="Questions you sent to HR and their replies.">{mine.length ? <ul className="divide-y divide-border">{mine.map((item) => <QuestionRow key={item.id} item={item} />)}</ul> : <HrEmpty>You haven&apos;t asked HR anything yet. Use “Ask HR” under an answer.</HrEmpty>}</HrPanel>}

    {tab === "inbox" && manager && <>
      <HrPanel title="Employee questions" description="Reply to questions the policy search couldn't settle.">{policyQuestions.length ? <ul className="divide-y divide-border">{policyQuestions.map((item) => <QuestionRow key={item.id} item={item} name={employees.find((person) => person.id === item.employeeId)?.name} onReply={(reply) => { replyPolicyQuestion(item.id, reply, actorId); toast.success("Reply sent"); }} />)}</ul> : <HrEmpty>No questions yet.</HrEmpty>}</HrPanel>
      {gaps.length > 0 && <HrPanel title="Policy gaps" description="Questions no policy answered. Consider adding these to a policy."><ul className="divide-y divide-border text-sm">{gaps.map((item) => <li key={item.id} className="px-5 py-2">{item.question}<span className="ml-2 text-xs text-muted-foreground">{hrDate(item.createdAt)}</span></li>)}</ul></HrPanel>}
    </>}

    </div>
    {viewing && <SourceDialog citation={viewing} source={sources.find((item) => item.id === viewing.sourceId)} onClose={() => setViewing(null)} />}
    {escalating && <AskHrDialog asked={escalating} onClose={() => setEscalating(null)} onSend={(note) => {
      const answer = escalating.answer;
      addPolicyQuestion({ id: `pq-${crypto.randomUUID()}`, employeeId: actorId, question: escalating.question, note, answerGiven: answer.kind === "answer" ? answer.lines.map((line) => line.text).join(" ") : null, sources: answer.kind === "answer" ? answer.citations.map((citation) => citation.title) : [], gap: answer.kind !== "answer", status: "open", createdAt: new Date().toISOString() });
      toast.success("Sent to HR. You'll see the reply under My questions.");
      setEscalating(null); setTab("mine");
    }} />}
  </div>;
}

function QuestionRow({ item, name, onReply }: { item: HrPolicyQuestion; name?: string; onReply?: (reply: string) => void }) {
  const [reply, setReply] = React.useState("");
  return <li className="space-y-2 px-5 py-3 text-sm">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium">{item.question}</p><p className="text-xs text-muted-foreground">{name ? `${name} · ` : ""}{when(item.createdAt)}{item.gap ? " · no policy answered this" : ""}</p></div>{item.status === "open" ? <HrStatus status="pending" /> : <span className="border border-success/30 bg-success-muted px-2 py-0.5 text-xs text-success">Answered</span>}</div>
    {item.note && <p className="text-xs text-muted-foreground">Note: {item.note}</p>}
    {item.answerGiven && <p className="border border-border bg-surface-2 px-3 py-2 text-xs"><span className="font-medium">Answer shown:</span> {item.answerGiven}</p>}
    {item.reply ? <p className="border border-success/30 bg-success-muted px-3 py-2 text-xs text-success"><span className="font-medium">HR reply:</span> {item.reply}</p> : onReply ? <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (reply.trim().length >= 5) { onReply(reply.trim()); setReply(""); } }}><Textarea aria-label={`Reply to ${item.question}`} rows={2} maxLength={500} value={reply} onChange={(event) => setReply(event.target.value)} className="rounded-none text-sm" placeholder="Write a reply" /><Button disabled={reply.trim().length < 5}>Reply</Button></form> : <p className="text-xs text-muted-foreground">Waiting for HR to reply.</p>}
  </li>;
}

function SourceDialog({ citation, source, onClose }: { citation: Citation; source?: PolicySource; onClose: () => void }) {
  const near = source?.paragraphs.slice(Math.max(0, citation.paragraphIndex - 1), citation.paragraphIndex + 2) ?? [];
  return <HrModal open onOpenChange={(value) => !value && onClose()} title={citation.title} description={`${citation.version ? `Version ${citation.version}` : "Live from HR Settings"}${source?.issuedAt ? ` · issued ${hrDate(source.issuedAt)}` : ""} · passage ${citation.paragraphIndex + 1}`}>
    {near.length ? <div className="space-y-3 text-sm">{near.map((paragraph) => <p key={paragraph.id} className={paragraph.id === citation.paragraphId ? "border-l-2 border-accent bg-accent-muted px-3 py-2" : "px-3 text-muted-foreground"}>{paragraph.text}</p>)}<p className="text-[11px] text-muted-foreground">The highlighted passage is what the answer was taken from.</p></div> : <HrEmpty>This passage is no longer in the policy. It may have been replaced by a newer version.</HrEmpty>}
  </HrModal>;
}

function AskHrDialog({ asked, onClose, onSend }: { asked: { question: string; answer: Answer }; onClose: () => void; onSend: (note: string) => void }) {
  const [note, setNote] = React.useState("");
  return <HrModal open onOpenChange={(value) => !value && onClose()} title="Ask HR" description="HR sees your question and the answer you were shown. They'll reply here.">
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); onSend(note.trim()); }}>
      <p className="border border-border bg-surface-2 px-3 py-2 text-sm font-medium">{asked.question}</p>
      <HrField label="Anything HR should know? · optional"><Textarea maxLength={400} value={note} onChange={(event) => setNote(event.target.value)} className="rounded-none" placeholder="e.g. My situation is different because…" /></HrField>
      <p className="text-xs text-muted-foreground">Don&apos;t include passwords, bank details or other sensitive numbers.</p>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button>Send to HR</Button></div>
    </form>
  </HrModal>;
}
