"use client";

import * as React from "react";
import { company, conversations, dealRows, lakh, leadRows, stats as crm } from "@/lib/demo-universe";
import { tickets } from "@/lib/mock-data/tickets";
import { useSearchParams } from "next/navigation";
import { Bookmark, Check, Globe2, Link2, Loader2, MessageSquare, MessageSquarePlus, Pencil, Plus, Search, Send, Sparkles, Upload } from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { TurnCard } from "@/components/ai/turn-card";
import { EXAMPLE_QUESTIONS, type BusinessAnswer } from "@/lib/services/business-answer";
import { api } from "@/lib/api/client";
import { useWorkspace } from "@/components/layout/workspace-context";
import { SectionCard } from "@/components/settings/section-ui";
import { Badge } from "@/components/ui/badge";
import { useApi } from "@/lib/api/use-api";
import { demoMode } from "@/lib/demo-mode";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const INTELLIGENCE_VIEWS = [
  { value: "chat", label: "Business AI Chat" },
  { value: "knowledge", label: "Knowledge" },
  { value: "memory", label: "Memory" },
  { value: "insights", label: "Insights" },
  { value: "performance", label: "Performance Analysis" },
  { value: "risks", label: "Risk & Alerts" },
  { value: "planning", label: "Forecasts & Planning" },
] as const;

const AI_VIEWER_ID = "pankaj";
const topDeal = [...dealRows].filter((item) => !["won", "lost"].includes(item.stage)).sort((a, b) => Number(b.amount) - Number(a.amount))[0];
const stalled = dealRows.filter((item) => ["proposal", "negotiation"].includes(item.stage));
function stalledText() { return stalled.length ? `${stalled.length} deal${stalled.length === 1 ? " is" : "s are"} in proposal or negotiation. The largest is ${topDeal?.company} at ${lakh(Number(topDeal?.amount))}.` : "No deal is waiting on a decision right now."; }

type Turn = {
  id: string;
  question: string;
  status: "thinking" | "done";
  result?: BusinessAnswer | null;
};

function demoCrmAnswer(question: string): BusinessAnswer {
  const normalized = question.toLowerCase();
  const open = dealRows.filter((item) => !["won", "lost"].includes(item.stage));
  const top = [...open].sort((x, y) => Number(y.amount) - Number(x.amount)).slice(0, 2);
  const quietLeads = leadRows.filter((item) => item.stage === "new").slice(0, 3);
  const openTickets = tickets.filter((item) => !["resolved", "closed"].includes(item.status));
  const urgent = openTickets.filter((item) => item.priority === "urgent" || item.status === "escalated");
  if (normalized.includes("lead") || normalized.includes("attention")) {
    return {
      question,
      answer: `${top[0]?.company} has the biggest open deal at ${lakh(Number(top[0]?.amount))} and is waiting on a reply. ${quietLeads.map((item) => `${item.contactName} (${item.company})`).join(", ")} are new enquiries with no first response yet.`,
      dataUsed: [`${crm.leads} leads`, `${crm.deals} deals`, "Unified chat activity"],
      calculation: { metric: "Lead priority and next action", period: "Current CRM snapshot", filters: "open leads sorted by deal value and age", sources: "Leads, deals and conversations" },
      followups: ["Show the open deals", `Draft a WhatsApp follow-up for ${top[0]?.customerName}`, `Create a callback task for ${quietLeads[0]?.contactName}`],
    };
  }
  if (normalized.includes("pipeline") || normalized.includes("deal") || normalized.includes("revenue")) {
    return {
      question,
      answer: `The open pipeline is ${lakh(crm.pipeline)} across ${crm.openDeals} active deals. The largest are ${top.map((item) => `${item.name} at ${lakh(Number(item.amount))} in ${item.stage}`).join(" and ")}. ${crm.wonDeals} deals are won, worth ${lakh(crm.wonValue)}.`,
      dataUsed: [`${crm.deals} deals`, `${crm.buyers} customers`, "Pipeline stages"],
      calculation: { metric: "Open pipeline value", period: "Current CRM snapshot", filters: "stages excluding Won and Lost", sources: "Deals" },
      followups: ["Which deal should I follow up first?", "Show proposal-stage activity", "Create a next-step task"],
    };
  }
  if (normalized.includes("support") || normalized.includes("ticket")) {
    return {
      question,
      answer: `There are ${tickets.length} support tickets and ${openTickets.length} are still open, ${urgent.length} urgent or escalated. Start with ${urgent[0]?.number}: ${urgent[0]?.subject}.`,
      dataUsed: [`${tickets.length} tickets`, "Customer timeline", "SLA status"],
      calculation: { metric: "Open support workload", period: "Current CRM snapshot", filters: "open, escalated and AI-handling tickets", sources: "Tickets" },
      followups: ["Show escalated tickets", "Which customers are at risk?", "Draft a customer update"],
    };
  }
  return {
    question,
    answer: `Janus is using the connected records for ${company.short}: ${crm.leads} leads, ${crm.openDeals} open deals worth ${lakh(crm.pipeline)}, ${crm.buyers} customers, ${tickets.length} support tickets and ${conversations.length} conversations. Ask about leads, pipeline, customer risk or support to see a grounded answer.`,
    dataUsed: ["Leads", "Deals", "Customers", "Tickets", "Chats"],
    calculation: { metric: "Connected CRM snapshot", period: "Current records", filters: "CRM & Sales workspace", sources: "Janus records" },
    followups: ["Which leads need attention today?", "What is our open pipeline?", "What support needs attention?"],
  };
}

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
  const { workspaceId, workspace } = useWorkspace();
  const departmentChat = workspaceId !== "business" && workspaceId !== "crm-sales";
  const crmAssistant = workspaceId === "crm-sales";
  const requestedIntelligenceView = searchParams.get("view");
  const intelligenceView = requestedIntelligenceView === "history" ? "insights" : requestedIntelligenceView === "forecasts" || requestedIntelligenceView === "recommendations" ? "planning" : requestedIntelligenceView ?? (workspaceId === "business" ? "knowledge" : "chat");
  const reportSummary = useApi<{
    leads: number;
    openDeals: number;
    wonDeals: number;
    pipelineValue: string;
    unavailable: string[];
  }>(workspaceId === "business" && intelligenceView === "performance" ? "/business/reports/summary" : null);

  const [turns, setTurns] = React.useState<Turn[]>(() => {
    if (!demoMode || (!departmentChat && !crmAssistant)) return [];
    return [
      {
        id: "demo-assistant-turn-1",
        question: "Which leads need attention today?",
        status: "done",
        result: demoCrmAnswer("Which leads need attention today?"),
      },
      {
        id: "demo-assistant-turn-2",
        question: "What is our open pipeline?",
        status: "done",
        result: demoCrmAnswer("What is our open pipeline?"),
      },
    ];
  });
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

    if (demoMode && (departmentChat || crmAssistant)) {
      setTurns((prev) => prev.map((t) => t.id === id ? {
        ...t,
        status: "done",
        result: demoCrmAnswer(trimmed),
      } : t));
      return;
    }

    void api<{ answer: string; sources: string[] }>("/business/intelligence/ask", {
      method: "POST",
      body: JSON.stringify({ question: trimmed, workspaceId: searchParams.get("workspace") ?? workspaceId }),
    }).then((result) => setTurns((prev) => prev.map((t) => t.id === id ? {
      ...t,
      status: "done",
      result: {
        question: trimmed,
        answer: result.answer,
        dataUsed: result.sources,
        calculation: {
          metric: "Grounded business records",
          period: "Current records",
          filters: workspaceId,
          sources: result.sources.join(", "),
        },
        followups: [],
      },
    } : t))).catch(() => setTurns((prev) => prev.map((t) => t.id === id ? { ...t, status: "done", result: null } : t)));
  }, [crmAssistant, departmentChat, searchParams, workspaceId]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submit(inputValue);
  }

  if (workspaceId === "business" && intelligenceView === "knowledge") {
    return <BusinessKnowledgeView />;
  }

  if (workspaceId === "business" && intelligenceView === "memory") {
    return <BusinessMemoryView />;
  }

  if (workspaceId === "business" && intelligenceView === "chat") {
    return <BusinessChatView />;
  }

  if (workspaceId === "business" && intelligenceView !== "chat") {
    return <BusinessIntelligenceView view={intelligenceView} reportSummary={reportSummary} />;
  }

  if (crmAssistant) {
    return <CrmAssistantView />;
  }

  return (
    <div className="mx-auto flex max-w-[820px] flex-col gap-6 px-6 py-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="inline-flex items-center gap-1.5 border border-accent-border bg-accent-muted px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-accent">
          <Sparkles className="size-3" />
          {departmentChat ? `${workspace.name} AI Chat` : crmAssistant ? "CRM & Sales AI Assistant" : "Janus Intelligence"}
          
        </div>
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
          {departmentChat ? `Ask ${workspace.name}` : crmAssistant ? "CRM & Sales AI Assistant" : "Understand your business"}
        </h1>
        <p className="max-w-lg text-[13px] text-muted-foreground">
          {departmentChat
            ? `Ask questions about authorized ${workspace.name} data. The answer will identify which records are available.`
            : crmAssistant
              ? "Ask about leads, deals, customers, chats and tickets. Answers are grounded in your CRM records."
            : "Ask natural-language questions about your business. Answers are grounded in connected records and identify unavailable data."}
        </p>
      </div>

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

type ChatMessage = { id: string; role: "user" | "assistant"; text: string; day: string; time: string };
type ChatThread = { id: string; title: string; date: string; stored: boolean; ownerId: string; messages: ChatMessage[] };

const initialChatThreads: ChatThread[] = [
  {
    id: "chat-weekly-review",
    title: "Weekly business review",
    date: "Today",
    stored: true,
    ownerId: AI_VIEWER_ID,
    messages: [
      { id: "m-1", role: "user", text: "What should I focus on this week?", day: "Today", time: "09:18" },
      { id: "m-2", role: "assistant", text: "Focus on the 6 deals that have been in Proposal for more than 10 days. They represent ₹14.2L of pipeline. Collections are also behind by ₹3.1L, so reviewing overdue invoices is the second priority.", day: "Today", time: "09:19" },
    ],
  },
  {
    id: "chat-pipeline-risk",
    title: "Pipeline risk scan",
    date: "Yesterday",
    stored: true,
    ownerId: AI_VIEWER_ID,
    messages: [
      { id: "m-3", role: "user", text: "Which deals need attention?", day: "Yesterday", time: "17:35" },
      { id: "m-4", role: "assistant", text: stalledText(), day: "Yesterday", time: "17:36" },
    ],
  },
  {
    id: "chat-new",
    title: "New conversation",
    date: "Earlier",
    stored: false,
    ownerId: AI_VIEWER_ID,
    messages: [],
  },
];

const initialCrmChatThreads: ChatThread[] = [
  {
    id: "crm-chat-priority",
    title: "Lead follow-up priorities",
    date: "Today",
    stored: true,
    ownerId: AI_VIEWER_ID,
    messages: [
      { id: "crm-m-1", role: "user", text: "Which leads need attention today?", day: "Today", time: "09:42" },
      { id: "crm-m-2", role: "assistant", text: demoCrmAnswer("Which leads need attention today?").answer, day: "Today", time: "09:42" },
    ],
  },
  {
    id: "crm-chat-pipeline",
    title: "Open pipeline review",
    date: "Yesterday",
    stored: true,
    ownerId: AI_VIEWER_ID,
    messages: [
      { id: "crm-m-3", role: "user", text: "What is our open pipeline?", day: "Yesterday", time: "16:18" },
      { id: "crm-m-4", role: "assistant", text: demoCrmAnswer("What is our open pipeline?").answer, day: "Yesterday", time: "16:18" },
    ],
  },
  {
    id: "crm-chat-support",
    title: "Support triage",
    date: "22 Oct",
    stored: true,
    ownerId: AI_VIEWER_ID,
    messages: [
      { id: "crm-m-5", role: "user", text: "What support needs attention?", day: "22 Oct", time: "11:06" },
      { id: "crm-m-6", role: "assistant", text: demoCrmAnswer("What support needs attention?").answer, day: "22 Oct", time: "11:06" },
    ],
  },
  {
    id: "crm-chat-new",
    title: "New conversation",
    date: "Just now",
    stored: false,
    ownerId: AI_VIEWER_ID,
    messages: [],
  },
];

function CrmAssistantView() {
  const blankThread: ChatThread = { id: "crm-chat-new", title: "New conversation", date: "Just now", stored: false, ownerId: AI_VIEWER_ID, messages: [] };
  const [threads, setThreads] = React.useState<ChatThread[]>(() => demoMode ? initialCrmChatThreads : [blankThread]);
  const [activeThreadId, setActiveThreadId] = React.useState(() => demoMode ? initialCrmChatThreads[0].id : blankThread.id);
  const [question, setQuestion] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [notice, setNotice] = React.useState<string | null>(null);
  const visibleThreads = threads.filter((thread) => thread.ownerId === AI_VIEWER_ID);
  const filteredThreads = visibleThreads.filter((thread) => {
    const query = search.trim().toLowerCase();
    return !query || `${thread.title} ${thread.messages.map((message) => message.text).join(" ")}`.toLowerCase().includes(query);
  });
  const activeThread = visibleThreads.find((thread) => thread.id === activeThreadId) ?? visibleThreads[0];

  function newChat() {
    const thread: ChatThread = { id: `crm-chat-${Date.now()}`, title: "New conversation", date: "Just now", stored: false, ownerId: AI_VIEWER_ID, messages: [] };
    setThreads((current) => [thread, ...current]);
    setActiveThreadId(thread.id);
    setQuestion("");
    setNotice(null);
  }

  function storeChat() {
    if (!demoMode) {
      setNotice("Chat storage is not connected yet. This conversation remains on this page until storage is enabled.");
      return;
    }
    setThreads((current) => current.map((thread) => thread.id === activeThread.id ? { ...thread, stored: true } : thread));
    setNotice("Conversation stored privately for your account. Other members cannot see it.");
  }

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || !activeThread) return;
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const userMessage: ChatMessage = { id: `crm-m-${Date.now()}`, role: "user", text: trimmed, day: "Today", time };
    const activeId = activeThread.id;
    setThreads((current) => current.map((thread) => thread.id === activeId ? { ...thread, title: thread.messages.length === 0 ? trimmed.slice(0, 42) : thread.title, date: "Today", messages: [...thread.messages, userMessage] } : thread));
    setQuestion("");

    if (demoMode) {
      const result = demoCrmAnswer(trimmed);
      const assistantMessage: ChatMessage = { id: `crm-m-${Date.now()}-answer`, role: "assistant", text: result.answer, day: "Today", time };
      setThreads((current) => current.map((thread) => thread.id === activeId ? { ...thread, messages: [...thread.messages, assistantMessage] } : thread));
      setNotice(`Answer grounded in your CRM records · ${crm.leads} leads · ${crm.deals} deals · ${tickets.length} tickets.`);
      return;
    }

    try {
      const result = await api<{ answer: string; sources: string[]; unavailable?: string[] }>("/business/intelligence/ask", {
        method: "POST",
        body: JSON.stringify({ question: trimmed, workspaceId: "crm-sales" }),
      });
      const assistantMessage: ChatMessage = { id: `crm-m-${Date.now()}-answer`, role: "assistant", text: result.answer, day: "Today", time: "Just now" };
      setThreads((current) => current.map((thread) => thread.id === activeId ? { ...thread, messages: [...thread.messages, assistantMessage] } : thread));
      setNotice(result.unavailable?.length ? `Answer grounded in connected records. Unavailable: ${result.unavailable.join(", ")}.` : "Answer grounded in connected CRM records.");
    } catch {
      setNotice("Janus could not load a verified answer. Check the connected CRM data and try again.");
    }
  }

  if (!activeThread) return null;

  return (
    <div className="crm-assistant-shell mx-auto flex h-full min-h-0 max-w-[1240px] flex-col gap-5 overflow-hidden px-4 py-6 sm:px-6 sm:py-7">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-accent"><Sparkles className="size-3" />CRM &amp; Sales AI</div>
          <div className="mt-2 flex flex-wrap items-center gap-2"><h1 className="sr-only">CRM Assistant</h1><Badge variant="neutral">{demoMode ? "Demo data" : "Connected records"}</Badge></div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Ask about leads, deals, customers, chats and tickets. Every answer stays scoped to CRM &amp; Sales.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2"><Badge variant="success">CRM scope</Badge><Badge variant="outline">Private to you</Badge></div>
      </header>

      {notice && <DemoNotice>{notice}</DemoNotice>}

      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-4 md:grid-cols-[220px_minmax(0,1fr)] md:grid-rows-1">
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface p-3">
          <div className="mb-3 flex items-center justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your chats</p><p className="mt-1 text-[10px] text-muted-foreground">Private to your account</p></div><Button size="sm" variant="secondary" onClick={newChat}><Plus className="size-3.5" />New chat</Button></div>
          <div className="relative mb-3"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search chats" className="h-8 pl-8 text-xs" aria-label="Search CRM assistant chats" /></div>
          <div className="min-h-0 max-h-[180px] flex-1 overflow-y-auto pr-1 md:max-h-none">{filteredThreads.map((thread) => <button key={thread.id} type="button" onClick={() => { setActiveThreadId(thread.id); setNotice(null); }} className={`flex items-start gap-2 rounded-md px-2.5 py-2.5 text-left transition-colors ${thread.id === activeThreadId ? "bg-accent-muted text-accent" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"}`}><MessageSquare className="mt-0.5 size-3.5 shrink-0" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{thread.title}</span><span className="mt-0.5 block text-[10px] opacity-70">{thread.date}{thread.stored ? " · Stored privately" : ""}</span></span></button>)}{filteredThreads.length === 0 && <p className="px-2 py-4 text-center text-xs text-muted-foreground">No chats match your search.</p>}</div>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-col">
          <SectionCard className="crm-assistant-card flex min-h-0 flex-1 flex-col" title={activeThread.title} description={`${activeThread.date} · ${activeThread.stored ? "Stored privately" : "Not stored yet"}`}>
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                {activeThread.messages.length === 0 ? <div className="flex min-h-[340px] flex-col items-center justify-center text-center"><span className="mb-3 flex size-11 items-center justify-center rounded-full bg-accent-muted text-accent"><Sparkles className="size-5" /></span><p className="text-sm font-medium">Start a CRM conversation</p><p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">Ask for a lead priority list, pipeline review, customer risk or a suggested follow-up.</p></div> : <div className="flex flex-col gap-4">{activeThread.messages.map((message, index) => <React.Fragment key={message.id}>{(index === 0 || activeThread.messages[index - 1].day !== message.day) && <div className="flex items-center gap-3 py-1"><Separator className="flex-1" /><span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{message.day}</span><Separator className="flex-1" /></div>}<div className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[88%] rounded-xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "bg-accent text-accent-foreground" : "bg-surface-2 text-foreground"}`}><div className="mb-1 flex items-center justify-between gap-4 text-[10px] font-semibold uppercase tracking-wide opacity-70"><span>{message.role === "user" ? "You" : "Janus"}</span><span>{message.time}</span></div>{message.text}</div></div></React.Fragment>)}</div>}
              </div>
              <form onSubmit={ask} className="mt-5 border-t border-border pt-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-end"><Textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about leads, pipeline, customers or support…" aria-label="Ask the CRM assistant" rows={2} className="min-h-[70px] resize-none text-sm" /><Button type="submit" className="h-10 shrink-0" disabled={!question.trim()}><Send className="size-3.5" />Ask Janus</Button></div><p className="mt-2 text-[10px] text-muted-foreground">Answers use CRM records only. Consequential actions still require your approval.</p></form>
            </div>
          </SectionCard>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap gap-2">{["Which leads need attention?", "What is our open pipeline?", "What support needs attention?", "Draft a follow-up for Riya"].map((item) => <button key={item} type="button" onClick={() => setQuestion(item)} className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent-border hover:text-accent">{item}</button>)}</div><Button variant="secondary" onClick={storeChat}><Bookmark className="size-3.5" />{activeThread.stored ? "Stored" : "Store chat"}</Button></div>
        </main>
      </div>

      <div className="grid gap-3 sm:grid-cols-3"><KnowledgeStat label="CRM records" value="3 leads" detail="Ready for assistant questions" tone="success" /><KnowledgeStat label="Open pipeline" value="₹7.55L" detail="Across 2 active deals" tone="neutral" /><KnowledgeStat label="Support queue" value="8 tickets" detail="4 currently need attention" tone="warning" /></div>
    </div>
  );
}

function BusinessChatView() {
  const blankThread: ChatThread = { id: "chat-new", title: "New conversation", date: "Just now", stored: false, ownerId: AI_VIEWER_ID, messages: [] };
  const [threads, setThreads] = React.useState<ChatThread[]>(() => demoMode ? initialChatThreads : [blankThread]);
  const [activeThreadId, setActiveThreadId] = React.useState(() => demoMode ? initialChatThreads[0].id : blankThread.id);
  const [question, setQuestion] = React.useState("");
  const [notice, setNotice] = React.useState<string | null>(null);
  const visibleThreads = threads.filter((thread) => thread.ownerId === AI_VIEWER_ID);
  const activeThread = visibleThreads.find((thread) => thread.id === activeThreadId) ?? visibleThreads[0];

  function newChat() {
    const thread: ChatThread = { id: `chat-${Date.now()}`, title: "New conversation", date: "Just now", stored: false, ownerId: AI_VIEWER_ID, messages: [] };
    setThreads((current) => [thread, ...current]);
    setActiveThreadId(thread.id);
    setQuestion("");
    setNotice(null);
  }

  function storeChat() {
    if (!demoMode) {
      setNotice("Chat storage is not connected yet. This conversation remains on this page until storage is enabled.");
      return;
    }
    setThreads((current) => current.map((thread) => thread.id === activeThread.id ? { ...thread, stored: true } : thread));
    setNotice("Conversation stored privately for your account. Other members cannot see it.");
  }

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed) return;
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const userMessage: ChatMessage = { id: `m-${Date.now()}`, role: "user", text: trimmed, day: "Today", time };
    setThreads((current) => current.map((thread) => thread.id === activeThread.id ? { ...thread, title: thread.messages.length === 0 ? trimmed.slice(0, 36) : thread.title, date: "Today", messages: [...thread.messages, userMessage] } : thread));
    setQuestion("");
    try {
      const result = await api<{ answer: string; sources: string[]; unavailable?: string[]; requiresApproval?: boolean }>("/business/intelligence/ask", {
        method: "POST",
        body: JSON.stringify({ question: trimmed, workspaceId: "business" }),
      });
      const assistantMessage: ChatMessage = { id: `m-${Date.now()}-answer`, role: "assistant", text: result.answer, day: "Today", time: "Just now" };
      setThreads((current) => current.map((thread) => thread.id === activeThread.id ? { ...thread, messages: [...thread.messages, assistantMessage] } : thread));
      setNotice(result.unavailable?.length ? `Answer grounded in connected records. Unavailable: ${result.unavailable.join(", ")}.` : "Answer grounded in connected records.");
    } catch {
      setNotice("Janus could not load a verified answer. Check the connected data and try again.");
    }
  }

  return <div className="mx-auto flex max-w-[1240px] flex-col gap-5 px-6 py-7">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-accent"><Sparkles className="size-3" />Janus Intelligence</div><div className="mt-2 flex items-center gap-2"><h1 className="text-2xl font-semibold tracking-tight">Business AI Chat</h1><Badge variant={demoMode ? "neutral" : "success"}>{demoMode ? "Demo data" : "Verified records"}</Badge></div><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Ask Janus about performance, risks, customers, operations, and what the business should do next.</p></div><div className="flex items-center gap-2"><Badge variant="success">Owner scope</Badge><Badge variant="outline">Private to you</Badge></div></div>
    <BusinessIntelligenceNav active="chat" />
    {notice && <DemoNotice>{notice}</DemoNotice>}
    <div className="grid gap-4 lg:grid-cols-[245px_1fr]">
      <aside className="rounded-lg border border-border bg-surface p-3"><div className="mb-3 flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your conversations</p><p className="mt-1 text-[10px] text-muted-foreground">Private to your account</p></div><Button size="sm" variant="secondary" onClick={newChat}><Plus className="size-3.5" />New chat</Button></div><div className="flex flex-col gap-1">{visibleThreads.filter((thread) => thread.messages.length > 0 || thread.id === activeThreadId).map((thread) => <button key={thread.id} type="button" onClick={() => { setActiveThreadId(thread.id); setNotice(null); }} className={`flex items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors ${thread.id === activeThreadId ? "bg-accent-muted text-accent" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"}`}><MessageSquare className="mt-0.5 size-3.5 shrink-0" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{thread.title}</span><span className="mt-0.5 block text-[10px] opacity-70">{thread.date}{thread.stored ? " · Stored privately" : ""}</span></span></button>)}</div></aside>
      <div className="min-w-0"><SectionCard title={activeThread.title} description={`${activeThread.date} · ${activeThread.stored ? "Stored conversation" : "Not stored yet"}`}><div className="flex min-h-[420px] flex-col"><div className="flex-1">{activeThread.messages.length === 0 ? <div className="flex h-full min-h-[300px] flex-col items-center justify-center text-center"><Sparkles className="mb-3 size-6 text-accent" /><p className="text-sm font-medium">What would you like to understand?</p><p className="mt-1 max-w-sm text-xs text-muted-foreground">Ask about your pipeline, revenue, customers, risks or the next best action.</p></div> : <div className="flex flex-col gap-4">{activeThread.messages.map((message, index) => <React.Fragment key={message.id}>{(index === 0 || activeThread.messages[index - 1].day !== message.day) && <div className="flex items-center gap-3 py-1"><Separator className="flex-1" /><span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{message.day}</span><Separator className="flex-1" /></div>}<div className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "bg-accent text-accent-foreground" : "bg-surface-2 text-foreground"}`}><div className="mb-1 flex items-center justify-between gap-4 text-[10px] font-semibold uppercase tracking-wide opacity-70"><span>{message.role === "user" ? "You" : "Janus"}</span><span>{message.time}</span></div>{message.text}</div></div></React.Fragment>)}</div>}</div><form onSubmit={ask} className="mt-5 flex gap-2 border-t border-border pt-4"><Input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about your business..." aria-label="Ask about your business" /><Button type="submit" disabled={!question.trim()}><Send className="size-3.5" />Ask Janus</Button></form></div></SectionCard><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap gap-2">{["What is at risk?", "Which leads need attention?", "Where should we reduce cost?", "What should I approve?"] .map((item) => <button key={item} type="button" onClick={() => setQuestion(item)} className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-muted-foreground hover:border-accent-border hover:text-accent">{item}</button>)}</div><Button variant="secondary" onClick={storeChat}><Bookmark className="size-3.5" />{activeThread.stored ? "Stored" : "Store chat"}</Button></div></div>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">{demoMode ? <><KnowledgeStat label="Records available" value="148" detail="Business sources" tone="success" /><KnowledgeStat label="Insights ready" value="12" detail="Reviewed findings" tone="neutral" /><KnowledgeStat label="Approval needed" value="3" detail="Consequential actions" tone="warning" /></> : <><KnowledgeStat label="Records available" value="—" detail="Connected knowledge sources will appear here." /><KnowledgeStat label="Insights ready" value="—" detail="No verified findings yet." /><KnowledgeStat label="Approval needed" value="—" detail="No verified approvals yet." /></>}</div>
  </div>;
}

function BusinessIntelligenceNav({ active }: { active: string }) {
  return <nav className="janus-tab-strip sticky top-0 z-20 flex gap-1 overflow-x-auto rounded-lg bg-surface-2 p-1" aria-label="Business Intelligence sections">{INTELLIGENCE_VIEWS.map((item) => <Link key={item.value} replace scroll={false} href={`/ai?workspace=business&view=${item.value}`} className={`shrink-0 rounded-sm px-3 py-2 text-xs transition-colors ${item.value === active ? "bg-white font-medium text-foreground shadow-sm" : "text-muted-foreground hover:bg-white/70 hover:text-foreground"}`}>{item.label}</Link>)}</nav>;
}

type KnowledgeSource = { name: string; detail: string; type: string; collection: string; access: string; status: "Ready" | "Processing" | "Needs review" | "Outdated"; updated: string };
type KnowledgeCollection = { name: string; detail: string; access: string };
type BusinessMemory = { id: string; title: string; detail: string; source: string; ownerId: string; updated: string };
type KnowledgeDialog = "menu" | "upload" | "write" | "website" | "app" | "qa" | "collection";
type KnowledgeForm = { title: string; content: string; url: string; app: string; question: string; answer: string; collection: string; description: string };

const initialKnowledgeSources: KnowledgeSource[] = [
  { name: "Price list, October 2026", detail: "price-list-oct-2026.xlsx", type: "Excel", collection: "Products & pricing", access: "Sales, Owner", status: "Ready", updated: "Today" },
  { name: "Refund and returns policy", detail: "Conflicts with the Customer FAQ on bulk orders", type: "Page", collection: "Company & policies", access: "Everyone", status: "Needs review", updated: "3 days ago" },
  { name: `${company.domain}/products`, detail: "Reading 42 pages", type: "Website", collection: "Products & pricing", access: "Everyone", status: "Processing", updated: "10 min ago" },
  { name: "Employee handbook v3", detail: "employee-handbook-v3.pdf", type: "PDF", collection: "HR handbook", access: "HR, Owner", status: "Ready", updated: "2 weeks ago" },
  { name: "GST invoicing rules", detail: "Written by Finance", type: "Page", collection: "Finance & tax rules", access: "Finance, Owner", status: "Ready", updated: "1 month ago" },
  { name: "Distributor onboarding SOP", detail: "Not updated in 9 months", type: "Word", collection: "Processes & SOPs", access: "Everyone", status: "Outdated", updated: "Jan 2026" },
];

const initialKnowledgeCollections: KnowledgeCollection[] = [
  { name: "Company & policies", detail: "18 sources · updated 3 days ago", access: "Everyone" },
  { name: "Products & pricing", detail: "34 sources · updated today", access: "Sales, Owner" },
  { name: "Sales playbook", detail: "12 sources · updated 1 week ago", access: "Sales" },
  { name: "Customer FAQs", detail: "41 sources · updated 2 days ago", access: "Everyone" },
  { name: "HR handbook", detail: "15 sources · updated 2 weeks ago", access: "HR, Owner" },
  { name: "Finance & tax rules", detail: "9 sources · updated 1 month ago", access: "Finance, Owner" },
  { name: "Processes & SOPs", detail: "19 sources · updated 5 days ago", access: "Everyone" },
];

const initialBusinessMemory: BusinessMemory[] = [
  { id: "memory-1", title: "Pankaj prefers concise owner briefs", detail: "Keep daily summaries to the top three risks and next actions.", source: "Saved from Business AI Chat", ownerId: AI_VIEWER_ID, updated: "Today" },
  { id: "memory-2", title: "Review WhatsApp spend before outbound campaigns", detail: "Use email or phone when the expected value does not justify message cost.", source: "Saved from Planning", ownerId: AI_VIEWER_ID, updated: "Yesterday" },
  { id: "memory-3", title: `${topDeal?.company ?? "The largest account"} needs a 48-hour follow-up`, detail: "Owner note linked to the stalled proposal and next best action.", source: "Saved from CRM context", ownerId: AI_VIEWER_ID, updated: "2 days ago" },
];

const emptyKnowledgeForm: KnowledgeForm = { title: "", content: "", url: "", app: "Google Drive", question: "", answer: "", collection: "Company & policies", description: "" };

function BusinessKnowledgeView() {
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState("All");
  const [question, setQuestion] = React.useState("Can we give a distributor a 20% discount?");
  const [asked, setAsked] = React.useState(demoMode);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [facts, setFacts] = React.useState<Record<string, "approved" | "rejected">>({});
  const [sources, setSources] = React.useState<KnowledgeSource[]>(() => demoMode ? initialKnowledgeSources : []);
  const [collections, setCollections] = React.useState<KnowledgeCollection[]>(() => demoMode ? initialKnowledgeCollections : []);
  const [unanswered, setUnanswered] = React.useState(() => demoMode ? [["What is the refund window for bulk orders?", "Asked 7 times · WhatsApp and team chat"], [`Do we deliver to ${company.city.split(",")[0]} on Sundays?`, "Asked 4 times · WhatsApp"], ["What is the minimum order quantity for festive packs?", "Asked 3 times · Sales team"], ["Who approves travel expenses above ₹10,000?", "Asked 2 times · HR"]] : []);
  const [dialog, setDialog] = React.useState<KnowledgeDialog | null>(null);
  const [form, setForm] = React.useState<KnowledgeForm>(emptyKnowledgeForm);
  const [selectedFiles, setSelectedFiles] = React.useState<File[]>([]);
  const [dialogError, setDialogError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [answeringQuestion, setAnsweringQuestion] = React.useState<string | null>(null);
  const initialSuggested = [["Distributor payment terms are 45 days", "Seen in 3 chats by Riya · would go to Finance & tax rules"], ["Free delivery on orders above ₹25,000", "Seen in 5 WhatsApp replies · would go to Customer FAQs"], ["Office is closed on the second Saturday", "Seen in 2 HR messages · would go to HR handbook"]];
  const visibleSources = sources.filter((source) => (filter === "All" || source.status === filter) && `${source.name} ${source.detail} ${source.collection}`.toLowerCase().includes(query.toLowerCase()));
  const addedSources = Math.max(0, sources.length - initialKnowledgeSources.length);
  const readySources = 139 + sources.slice(initialKnowledgeSources.length).filter((source) => source.status === "Ready").length;
  const reviewSources = 6 + sources.slice(initialKnowledgeSources.length).filter((source) => source.status === "Needs review").length;
  function updateForm(field: keyof KnowledgeForm, value: string) { setForm((current) => ({ ...current, [field]: value })); }
  function closeDialog() { setDialog(null); setSaving(false); setDialogError(null); setSelectedFiles([]); setAnsweringQuestion(null); }
  function openDialog(kind: KnowledgeDialog) { setDialog(kind); setForm(emptyKnowledgeForm); setDialogError(null); setSelectedFiles([]); setNotice(null); }
  function openAnswer(title: string) { setDialog("qa"); setAnsweringQuestion(title); setForm({ ...emptyKnowledgeForm, question: title }); setDialogError(null); setNotice(null); }
  function complete(message: string, callback: () => void) {
    if (!demoMode) {
      setNotice("Knowledge storage is not connected yet. Connect a source endpoint before adding content.");
      return;
    }
    setSaving(true); window.setTimeout(() => { callback(); setNotice(`${message} Added to your knowledge base.`); closeDialog(); }, 650);
  }
  function submitDialog(event: React.FormEvent) {
    event.preventDefault();
    if (!dialog || dialog === "menu") return;
    if (dialog === "upload") {
      if (selectedFiles.length === 0) { setDialogError("Choose at least one file to continue."); return; }
      complete(`${selectedFiles.length} file${selectedFiles.length === 1 ? "" : "s"} queued for indexing.`, () => setSources((current) => [...selectedFiles.map((file) => ({ name: file.name.replace(/\.[^.]+$/, ""), detail: `${file.name} · indexing`, type: file.name.split(".").pop()?.toUpperCase() || "File", collection: form.collection, access: "Owner", status: "Processing" as const, updated: "Just now" })), ...current]));
      return;
    }
    if (dialog === "write") {
      if (!form.title.trim() || !form.content.trim()) { setDialogError("Add a page title and some content."); return; }
      const words = form.content.trim().split(/\s+/).length;
      complete("Page saved as a ready knowledge source.", () => setSources((current) => [{ name: form.title.trim(), detail: `${words} words · written just now`, type: "Page", collection: form.collection, access: "Owner", status: "Ready", updated: "Just now" }, ...current]));
      return;
    }
    if (dialog === "website") {
      try { new URL(form.url); } catch { setDialogError("Enter a complete website URL, for example https://example.com."); return; }
      complete("Website added and queued for crawling.", () => setSources((current) => [{ name: form.url.trim(), detail: "Crawling pages · indexing", type: "Website", collection: form.collection, access: "Owner", status: "Processing", updated: "Just now" }, ...current]));
      return;
    }
    if (dialog === "app") {
      complete(`${form.app} connection started.`, () => setSources((current) => [{ name: form.app, detail: "Connection authorised · indexing", type: "App", collection: form.collection, access: "Owner", status: "Processing", updated: "Just now" }, ...current]));
      return;
    }
    if (dialog === "qa") {
      if (!form.question.trim() || !form.answer.trim()) { setDialogError("Add both the question and the approved answer."); return; }
      complete("Q&A added and ready for Janus.", () => { setSources((current) => [{ name: form.question.trim(), detail: "Approved Q&A · written just now", type: "Q&A", collection: form.collection, access: "Owner", status: "Ready", updated: "Just now" }, ...current]); if (answeringQuestion) setUnanswered((current) => current.filter(([title]) => title !== answeringQuestion)); });
      return;
    }
    if (!form.title.trim()) { setDialogError("Give the collection a name."); return; }
    complete("Collection created.", () => setCollections((current) => [{ name: form.title.trim(), detail: `${form.description.trim() || "New business knowledge"} · created just now`, access: "Owner" }, ...current]));
  }
  function askQuestion(event: React.FormEvent) { event.preventDefault(); if (question.trim() && demoMode) setAsked(true); else if (question.trim()) setNotice("Knowledge answers are unavailable until a source index is connected."); }
  function decideFact(title: string, decision: "approved" | "rejected") { setFacts((current) => ({ ...current, [title]: decision })); }

  return <div className="mx-auto flex max-w-[1240px] flex-col gap-5 px-6 py-7">
    <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open) closeDialog(); }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        {dialog === "menu" && <><DialogHeader><DialogTitle>Add knowledge</DialogTitle><DialogDescription>Choose how you want to make business knowledge available to Janus.</DialogDescription></DialogHeader><div className="grid gap-2 sm:grid-cols-2">{[[Upload, "Upload files", "PDF, Word, Excel or images", "upload"], [Pencil, "Write a page", "Create a policy, SOP or note", "write"], [Globe2, "Add a website", "Index a catalogue or help centre", "website"], [Link2, "Connect an app", "Google Drive, Notion or Tally", "app"], [MessageSquarePlus, "Add a Q&A", "Save a precise approved answer", "qa"]].map(([Icon, title, detail, kind]) => <button key={title as string} type="button" onClick={() => openDialog(kind as KnowledgeDialog)} className="flex items-start gap-3 rounded-lg border border-border p-3 text-left hover:border-accent-border hover:bg-accent-muted"><span className="mt-0.5 text-accent">{React.createElement(Icon as React.ElementType, { className: "size-4" })}</span><span><span className="block text-sm font-semibold">{title as string}</span><span className="mt-1 block text-xs text-muted-foreground">{detail as string}</span></span></button>)}</div></>}
        {dialog !== null && dialog !== "menu" && <form onSubmit={submitDialog}><DialogHeader><DialogTitle>{dialog === "upload" ? "Upload files" : dialog === "write" ? "Write a page" : dialog === "website" ? "Add a website" : dialog === "app" ? "Connect an app" : dialog === "qa" ? "Add a Q&A" : "New collection"}</DialogTitle><DialogDescription>{dialog === "upload" ? "Files appear as Processing until Janus has indexed them." : dialog === "write" ? "Write grounded business knowledge that Janus can use in replies." : dialog === "website" ? "Janus will crawl the pages you authorise and show indexing progress." : dialog === "app" ? "Choose a business source to connect to your knowledge base." : dialog === "qa" ? "Add an approved answer for a question your team asks repeatedly." : "Group sources so permissions and ownership are easy to understand."}</DialogDescription></DialogHeader>
          {dialog === "upload" && <div className="flex flex-col gap-3"><Label htmlFor="knowledge-file">Files</Label><input id="knowledge-file" type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg" onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))} className="block w-full rounded-md border border-input bg-surface-2 p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-accent-foreground" />{selectedFiles.length > 0 && <p className="text-xs text-muted-foreground">{selectedFiles.map((file) => file.name).join(", ")}</p>}<Label htmlFor="upload-collection">Collection</Label><select id="upload-collection" value={form.collection} onChange={(event) => updateForm("collection", event.target.value)} className="h-9 rounded-md border border-input bg-surface-2 px-2 text-sm">{collections.map((item) => <option key={item.name}>{item.name}</option>)}</select></div>}
          {dialog === "write" && <div className="flex flex-col gap-3"><div><Label htmlFor="page-title">Page title</Label><Input id="page-title" value={form.title} onChange={(event) => updateForm("title", event.target.value)} placeholder="e.g. Distributor returns policy" className="mt-1" autoFocus /></div><div><Label htmlFor="page-content">Content</Label><Textarea id="page-content" value={form.content} onChange={(event) => updateForm("content", event.target.value)} placeholder="Write the policy, process or answer Janus should know..." className="mt-1 min-h-40" /></div><div><Label htmlFor="page-collection">Collection</Label><select id="page-collection" value={form.collection} onChange={(event) => updateForm("collection", event.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-surface-2 px-2 text-sm">{collections.map((item) => <option key={item.name}>{item.name}</option>)}</select></div></div>}
          {dialog === "website" && <div className="flex flex-col gap-3"><div><Label htmlFor="website-url">Website URL</Label><Input id="website-url" type="url" value={form.url} onChange={(event) => updateForm("url", event.target.value)} placeholder="https://example.com/help" className="mt-1" autoFocus /></div><div><Label htmlFor="website-collection">Collection</Label><select id="website-collection" value={form.collection} onChange={(event) => updateForm("collection", event.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-surface-2 px-2 text-sm">{collections.map((item) => <option key={item.name}>{item.name}</option>)}</select></div><p className="rounded-md bg-surface-2 p-3 text-xs text-muted-foreground">The URL is added to All sources with a Processing badge until it is indexed.</p></div>}
          {dialog === "app" && <div className="flex flex-col gap-3"><div><Label htmlFor="knowledge-app">App</Label><select id="knowledge-app" value={form.app} onChange={(event) => updateForm("app", event.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-surface-2 px-2 text-sm"><option>Google Drive</option><option>Notion</option><option>Tally</option><option>Microsoft SharePoint</option></select></div><div><Label htmlFor="app-collection">Collection</Label><select id="app-collection" value={form.collection} onChange={(event) => updateForm("collection", event.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-surface-2 px-2 text-sm">{collections.map((item) => <option key={item.name}>{item.name}</option>)}</select></div><div className="rounded-md border border-border bg-surface-2 p-3 text-xs text-muted-foreground">Scope: read documents and titles. The connector asks for permission before syncing.</div></div>}
          {dialog === "qa" && <div className="flex flex-col gap-3"><div><Label htmlFor="qa-question">Question</Label><Input id="qa-question" value={form.question} onChange={(event) => updateForm("question", event.target.value)} placeholder="What should Janus answer?" className="mt-1" autoFocus /></div><div><Label htmlFor="qa-answer">Approved answer</Label><Textarea id="qa-answer" value={form.answer} onChange={(event) => updateForm("answer", event.target.value)} placeholder="Write the exact answer your team has approved..." className="mt-1 min-h-28" /></div><div><Label htmlFor="qa-collection">Collection</Label><select id="qa-collection" value={form.collection} onChange={(event) => updateForm("collection", event.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-surface-2 px-2 text-sm">{collections.map((item) => <option key={item.name}>{item.name}</option>)}</select></div></div>}
          {dialog === "collection" && <div className="flex flex-col gap-3"><div><Label htmlFor="collection-name">Collection name</Label><Input id="collection-name" value={form.title} onChange={(event) => updateForm("title", event.target.value)} placeholder="e.g. Delivery policies" className="mt-1" autoFocus /></div><div><Label htmlFor="collection-description">Description</Label><Textarea id="collection-description" value={form.description} onChange={(event) => updateForm("description", event.target.value)} placeholder="What belongs in this collection?" className="mt-1 min-h-20" /></div></div>}
          {dialogError && <p className="mt-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{dialogError}</p>}
          <DialogFooter><Button type="button" variant="secondary" onClick={closeDialog}>Cancel</Button><Button type="submit" disabled={saving}>{saving && <Loader2 className="size-3.5 animate-spin" />}{saving ? "Saving…" : dialog === "upload" ? "Queue files" : dialog === "website" ? "Add website" : dialog === "app" ? "Connect app" : dialog === "qa" ? "Save Q&A" : dialog === "collection" ? "Create collection" : "Save page"}</Button></DialogFooter>
        </form>}
      </DialogContent>
    </Dialog>
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-accent"><Sparkles className="size-3" />Janus Intelligence</div><div className="mt-2 flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold tracking-tight">Knowledge</h1><Badge variant={demoMode ? "neutral" : "success"}>{demoMode ? "Demo data" : "Verified sources"}</Badge></div><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Everything Janus knows about your business. Answers use this knowledge and connected records, with access controlled by permissions.</p></div>
      <div className="flex gap-2"><Button variant="secondary" onClick={() => openDialog("app")}><Link2 className="size-3.5" />Connect an app</Button><Button onClick={() => openDialog("menu")}><Plus className="size-3.5" />Add knowledge</Button></div>
    </div>
    <BusinessIntelligenceNav active="knowledge" />
    {notice && <div role="status" className="rounded-lg border border-accent-border bg-accent-muted px-4 py-3 text-sm text-accent">{notice}</div>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{demoMode ? <><KnowledgeStat label="Sources" value={String(148 + addedSources)} detail="Files, pages, links and Q&As" /><KnowledgeStat label="Ready for Janus" value={String(readySources)} detail="Read and searchable" tone="success" /><KnowledgeStat label="Needs review" value={String(reviewSources)} detail="Conflicting or out of date" tone="warning" /><KnowledgeStat label="Unanswered questions" value={String(11 + unanswered.length - 4)} detail="This month, no source found" tone="danger" /></> : <><KnowledgeStat label="Sources" value="—" detail="No verified sources connected." /><KnowledgeStat label="Ready for Janus" value="—" detail="Indexing is not connected." /><KnowledgeStat label="Needs review" value="—" detail="No source review queue yet." /><KnowledgeStat label="Unanswered questions" value="—" detail="Connect knowledge to measure this." /></>}</div>

    <section><h2 className="mb-3 text-base font-semibold">Add knowledge</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[[Upload, "Upload files", "PDF, Word, Excel, images", "upload"], [Pencil, "Write a page", "Policies, SOPs, notes", "write"], [Globe2, "Add a website", "Your site, catalogue, help pages", "website"], [Link2, "Connect an app", "Google Drive, Notion, Tally", "app"], [MessageSquarePlus, "Add a Q&A", "Exact answers to common questions", "qa"]].map(([Icon, title, detail, kind]) => <button key={title as string} type="button" onClick={() => openDialog(kind as KnowledgeDialog)} className="group flex min-h-24 flex-col items-start gap-2 rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:border-accent-border hover:bg-accent-muted"><span className="text-accent">{React.createElement(Icon as React.ElementType, { className: "size-4" })}</span><span className="text-sm font-semibold">{title as string}</span><span className="text-xs text-muted-foreground">{detail as string}</span></button>)}</div></section>

    <div className="grid gap-4 xl:grid-cols-[1fr_1fr]"><SectionCard title="Collections" description="Organise knowledge by business area."><div className="mb-2 flex justify-end"><button type="button" onClick={() => openDialog("collection")} className="text-xs font-medium text-accent hover:underline">+ New collection</button></div><div className="flex flex-col divide-y divide-border">{collections.map((item) => <div key={item.name} className="flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-1"><div><p className="text-sm font-semibold">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{item.detail}</p></div><Badge variant="neutral">{item.access}</Badge></div>)}</div></SectionCard><SectionCard title="Test what Janus knows" description="Ask a question and see which sources the answer comes from."><form onSubmit={askQuestion} className="flex gap-2"><Input value={question} onChange={(event) => setQuestion(event.target.value)} aria-label="Question for Janus" /><Button type="submit">Ask</Button></form>{asked && <div className="mt-4 rounded-lg bg-surface-2 p-4 text-sm"><p>No, not without approval. Discounts above 15% need the Owner&apos;s approval, and distributors already get a 10% base margin on the list price.</p><p className="mt-3 text-xs font-medium text-muted-foreground">Sources</p><div className="mt-2 flex flex-wrap gap-2"><Badge variant="accent">Discount policy · Company & policies</Badge><Badge variant="accent">Price list, October 2026</Badge></div></div>}</SectionCard></div>

    <SectionCard title="All sources" description="Review what Janus can read and who can use each source."><div className="mb-4 flex flex-col justify-between gap-3 lg:flex-row lg:items-center"><div className="relative max-w-xs"><Search className="pointer-events-none absolute left-3 top-2.5 size-3.5 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sources" className="pl-9" /></div><div className="flex flex-wrap gap-1">{["All", "Ready", "Processing", "Needs review", "Outdated"].map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={`rounded-full border px-3 py-1.5 text-xs ${filter === item ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground"}`}>{item}</button>)}</div></div><div className="overflow-x-auto"><div className="min-w-[760px]"><div className="grid grid-cols-[2fr_0.7fr_1.2fr_1fr_1fr_0.7fr] gap-3 border-b border-border px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"><span>Source</span><span>Type</span><span>Collection</span><span>Who can use it</span><span>Status</span><span>Updated</span></div>{visibleSources.map((source) => <div key={`${source.name}-${source.updated}`} className="grid grid-cols-[2fr_0.7fr_1.2fr_1fr_1fr_0.7fr] items-center gap-3 border-b border-border px-2 py-3 text-xs last:border-0"><div><p className="font-semibold">{source.name}</p><p className={`mt-1 ${source.status === "Outdated" || source.status === "Needs review" ? "text-danger" : "text-muted-foreground"}`}>{source.detail}</p></div><span>{source.type}</span><span>{source.collection}</span><span>{source.access}</span><Badge variant={source.status === "Ready" ? "success" : source.status === "Needs review" ? "warning" : source.status === "Outdated" ? "danger" : "info"}>{source.status}</Badge><span className="text-muted-foreground">{source.updated}</span></div>)}{visibleSources.length === 0 && <div className="px-2 py-8 text-center text-sm text-muted-foreground">No sources match this filter.</div>}</div></div></SectionCard>

    <div className="grid gap-4 xl:grid-cols-2"><SectionCard title="Questions Janus couldn&apos;t answer" description="Asked by your team or customers this month, with no source found."><div className="flex flex-col divide-y divide-border">{unanswered.map(([title, detail]) => <div key={title} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div><Button size="sm" variant="secondary" onClick={() => openAnswer(title)}>Add answer</Button></div>)}</div>{unanswered.length === 0 && <p className="text-sm text-muted-foreground">All current questions have an approved answer.</p>}</SectionCard><SectionCard title="Suggested facts" description="Janus noticed these in chats and records. Nothing is added until you approve it."><div className="flex flex-col divide-y divide-border">{initialSuggested.map(([title, detail]) => <div key={title} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div><p className="text-sm font-semibold">{facts[title] === "approved" ? "Approved · " : facts[title] === "rejected" ? "Rejected · " : ""}{title}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div><div className="flex shrink-0 gap-2"><Button size="sm" variant="secondary" onClick={() => decideFact(title, "rejected")}>Reject</Button><Button size="sm" onClick={() => decideFact(title, "approved")}><Check className="size-3.5" />Approve</Button></div></div>)}</div></SectionCard></div>
  </div>;
}

function BusinessMemoryView() {
  const [memory] = React.useState<BusinessMemory[]>(() => demoMode ? initialBusinessMemory : []);
  const visibleMemory = memory.filter((item) => item.ownerId === AI_VIEWER_ID);

  return <div className="mx-auto flex max-w-[1240px] flex-col gap-5 px-6 py-7">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-accent"><Sparkles className="size-3" />Janus Intelligence</div>
        <div className="mt-2 flex flex-wrap items-center gap-2"><h1 className="sr-only">Memory</h1><Badge variant={demoMode ? "neutral" : "success"}>{demoMode ? "Demo data" : "Your private memory"}</Badge></div>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Preferences and context that Janus remembers for your work. Memory is personal to your account and separate from shared business knowledge.</p>
      </div>
      <div className="flex items-center gap-2"><Badge variant="success">Owner scope</Badge><Badge variant="outline">Private to you</Badge></div>
    </div>
    <BusinessIntelligenceNav active="memory" />
    <div className="rounded-lg border border-accent-border bg-accent-muted px-4 py-3 text-sm text-accent"><span className="font-semibold">Private to Pankaj Neema · Owner</span><span className="ml-2 text-accent/80">Only you can see and use these saved memories.</span></div>
    <SectionCard title="Your AI memory" description="Saved preferences and context used by Business AI Chat. Other members cannot see these items.">
      <div className="flex flex-col divide-y divide-border">
        {visibleMemory.map((item) => <div key={item.id} className="flex flex-wrap items-start gap-3 py-3 first:pt-1 last:pb-1"><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</p><p className="mt-1 text-[10px] text-muted-foreground">{item.source} · {item.updated}</p></div><Badge variant="neutral">Private</Badge></div>)}
      </div>
      {visibleMemory.length === 0 && <p className="text-sm text-muted-foreground">No private memory has been saved yet.</p>}
    </SectionCard>
    <SectionCard title="How memory works" description="Keep personal context useful and permission-safe.">
      <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-md bg-surface-2 p-3"><p className="text-sm font-semibold">Personal by default</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Your saved preferences and chat context stay scoped to your account.</p></div><div className="rounded-md bg-surface-2 p-3"><p className="text-sm font-semibold">Separate from Knowledge</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Shared policies and business sources remain managed in the Knowledge tab.</p></div><div className="rounded-md bg-surface-2 p-3"><p className="text-sm font-semibold">You stay in control</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Review what Janus remembers before a real save or deletion action is connected.</p></div></div>
    </SectionCard>
  </div>;
}

function KnowledgeStat({ label, value, detail, tone = "neutral", demo = demoMode }: { label: string; value: string; detail: string; tone?: "neutral" | "success" | "warning" | "danger"; demo?: boolean }) {
  const badge = tone === "success" ? "Ready" : tone === "warning" ? "Review" : tone === "danger" ? "Action" : "Unavailable";
  return <div className="rounded-lg border border-border bg-surface p-4"><div className="flex items-center justify-between gap-2"><span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span><Badge variant={tone}>{badge}</Badge></div><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;
}

function BusinessIntelligenceView({
  view,
  reportSummary,
}: {
  view: string;
  reportSummary: ReturnType<typeof useApi<{ leads: number; openDeals: number; wonDeals: number; pipelineValue: string; unavailable: string[] }>>;
}) {
  const current = INTELLIGENCE_VIEWS.find((item) => item.value === view) ?? INTELLIGENCE_VIEWS[0];
  const isPerformance = view === "performance";

  if (demoMode) {
    return <div className="mx-auto flex max-w-[1240px] flex-col gap-5 px-6 py-7"><div><div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-accent"><Sparkles className="size-3" />Janus Intelligence</div><div className="mt-2 flex items-center gap-2"><h1 className="text-2xl font-semibold tracking-tight text-foreground">{current.label}</h1></div><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Permission-aware business intelligence preview using connected workspace examples.</p></div><BusinessIntelligenceNav active={view} /><BusinessIntelligenceDemo view={view} /></div>;
  }

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5 px-6 py-8">
      <div>
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-accent">
          <Sparkles className="size-3" /> Janus Intelligence
        </div>
        <h1 className="mt-2 text-[26px] font-semibold tracking-tight text-foreground">{current.label}</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
          Business-wide analysis is permission-aware and only uses verified records from connected workspaces.
        </p>
      </div>

      <BusinessIntelligenceNav active={view} />

      {isPerformance ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <VerifiedMetric label="Leads" value={reportSummary.loading || reportSummary.error ? "—" : String(reportSummary.data?.leads ?? "—")} />
          <VerifiedMetric label="Open deals" value={reportSummary.loading || reportSummary.error ? "—" : String(reportSummary.data?.openDeals ?? "—")} />
          <VerifiedMetric label="Pipeline" value={reportSummary.loading || reportSummary.error ? "—" : reportSummary.data?.pipelineValue ?? "—"} />
        </div>
      ) : (
        <SectionCard
          title={`${current.label} needs connected data`}
          description="Janus will show results here only after the relevant workspace records and permissions are connected."
        >
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="neutral">No verified result</Badge>
            <span>Janus only answers from verified business records.</span>
          </div>
        </SectionCard>
      )}

      {isPerformance && (
        <SectionCard title="Coverage" description="Financial, people, project, support and operations metrics are not connected yet.">
          <div className="flex flex-wrap gap-2">
            {(reportSummary.data?.unavailable ?? ["Finance", "HR", "Projects", "Support", "Operations", "IT"]).map((item) => (
              <Badge key={item} variant="neutral">{item}</Badge>
            ))}
          </div>
          {reportSummary.error && <p className="mt-3 text-xs text-amber-700">CRM report data is unavailable: {reportSummary.error}</p>}
        </SectionCard>
      )}
    </div>
  );
}

function VerifiedMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <Badge variant={value === "—" ? "neutral" : "success"}>{value === "—" ? "Awaiting data" : "Verified"}</Badge>
      </div>
      <p className="mt-3 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function BusinessIntelligenceDemo({ view }: { view: string }) {
  if (view === "insights") return <InsightsDemo />;
  if (view === "performance") return <PerformanceDemo />;
  if (view === "risks") return <RisksDemo />;
  if (view === "planning") return <ForecastsDemo />;
  return <InsightsDemo />;
}

function InsightsDemo() {
  const [notice, setNotice] = React.useState<string | null>(null);
  const insights = [
    ["Sales momentum is healthy", "New leads are up 18% this month, with WhatsApp contributing the most volume.", "Positive", "Growth"],
    ["Proposal stage is slowing conversion", "6 deals worth ₹14.2L have had no logged activity for more than 10 days.", "Attention", "Sales"],
    ["Collections need an owner review", "₹3.1L is overdue by more than 30 days across 4 invoices.", "Risk", "Finance"],
  ];
  return <div className="flex flex-col gap-4">{notice && <DemoNotice>{notice}</DemoNotice>}<div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Business insights</h2><p className="text-sm text-muted-foreground">Findings Janus identified from your business records.</p></div><Button variant="secondary" onClick={() => setNotice("Insights refreshed from your workspace records.")}>Refresh insights</Button></div><div className="grid gap-4 lg:grid-cols-3">{insights.map(([title, detail, tone, area]) => <SectionCard key={title} title={title} description={area + " · " + tone}><p className="text-sm leading-6 text-muted-foreground">{detail}</p><Button variant="secondary" size="sm" className="mt-4" onClick={() => setNotice(`Evidence opened for “${title}”. Demo records are shown in this preview.`)}>View evidence</Button></SectionCard>)}</div><SectionCard title="What changed" description="Comparison with the previous reporting period."><div className="grid gap-3 sm:grid-cols-3"><KnowledgeStat label="Lead volume" value="+18%" detail="Month over month" tone="success" /><KnowledgeStat label="Pipeline at risk" value="₹14.2L" detail="6 stalled proposals" tone="warning" /><KnowledgeStat label="Open approvals" value="3" detail="Owner review" tone="neutral" /></div></SectionCard></div>;
}

function PerformanceDemo() {
  const departments = [["CRM & Sales", "On track", "27 won · 8.7% conversion"], ["Finance & Accounting", "Watch", "₹3.1L overdue · cash down 6%"], ["Projects & Delivery", "Problem", "2 of 9 projects delayed"], ["Customer Support", "Watch", "18 open tickets · 2 SLA breaches"]];
  return <div className="flex flex-col gap-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><KnowledgeStat label="Revenue" value="₹42.8L" detail="86% of ₹50L target" tone="success" /><KnowledgeStat label="Net profit" value="₹6.9L" detail="16% net margin" tone="success" /><KnowledgeStat label="Cash in bank" value="₹18.4L" detail="About 7 months runway" tone="warning" /><KnowledgeStat label="Receivables" value="₹9.6L" detail="₹3.1L overdue" tone="warning" /></div><div className="grid gap-4 lg:grid-cols-2"><SectionCard title="Department performance" description="Comparison across workspaces."><div className="flex flex-col gap-3">{departments.map(([name, status, detail]) => <div key={name} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"><div><p className="text-sm font-medium">{name}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div><Badge variant={status === "On track" ? "success" : status === "Problem" ? "danger" : "warning"}>{status}</Badge></div>)}</div></SectionCard><SectionCard title="Revenue vs target" description="Trend for the current business period."><div className="rounded-lg bg-surface-2 p-3"><div className="flex items-end gap-2" style={{ height: 170 }}>{[42, 49, 45, 58, 64, 78].map((height, index) => <div key={index} className="flex flex-1 flex-col items-center gap-2"><div className="w-full rounded-t-md bg-accent" style={{ height: String(height) + "%" }} /><span className="text-[10px] text-muted-foreground">{["May", "Jun", "Jul", "Aug", "Sep", "Oct"][index]}</span></div>)}</div></div></SectionCard></div></div>;
}

function RisksDemo() {
  const [notice, setNotice] = React.useState<string | null>(null);
  const risks = [["High", "6 deals stuck in Proposal", "₹14.2L pipeline has no activity for 10+ days.", "Review deals"], ["High", "Collections overdue", "4 invoices are more than 30 days overdue.", "Open receivables"], ["Medium", "SLA breaches rising", "2 support tickets have crossed their response target.", "Review support"], ["Low", "Automation failed overnight", "WhatsApp welcome flow was rejected by the provider.", "View execution"]];
  return <div className="flex flex-col gap-4">{notice && <DemoNotice>{notice}</DemoNotice>}<div className="grid gap-3 sm:grid-cols-3"><KnowledgeStat label="High risk" value="2" detail="Needs action today" tone="danger" /><KnowledgeStat label="Medium risk" value="1" detail="Monitor this week" tone="warning" /><KnowledgeStat label="Low risk" value="1" detail="Review when convenient" tone="neutral" /></div><SectionCard title="Risk & alerts" description="Risks identified from connected business activity."><div className="flex flex-col divide-y divide-border">{risks.map(([severity, title, detail, action]) => <div key={title} className="flex flex-wrap items-center gap-3 py-4 first:pt-0 last:pb-0"><Badge variant={severity === "High" ? "danger" : severity === "Medium" ? "warning" : "neutral"}>{severity}</Badge><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div><Button size="sm" variant="secondary" onClick={() => setNotice(`${action} opened for “${title}”. This demo keeps the approval step visible before any action runs.`)}>{action}</Button></div>)}</div></SectionCard></div>;
}

function ForecastsDemo() {
  const [notice, setNotice] = React.useState<string | null>(null);
  const [reviewed, setReviewed] = React.useState<string[]>([]);
  const scenarios = [["Conservative", "₹39.2L", 62, "warning"], ["Base", "₹48.6L", 78, "success"], ["Upside", "₹57.4L", 91, "info"]];
  const recommendations = [["Prioritise stalled proposals", "Assign the 6 inactive proposals to owners and create a 48-hour follow-up task.", "Sales", "High impact"], ["Start a collections sprint", "Send approved reminders for the 4 invoices overdue by more than 30 days.", "Finance", "High impact"], ["Review support routing", "Move the two SLA-risk tickets to the senior support queue.", "Support", "Medium impact"]];
  return <div className="flex flex-col gap-4">{notice && <DemoNotice>{notice}</DemoNotice>}<div className="grid gap-3 sm:grid-cols-3"><KnowledgeStat label="Next-month revenue" value="₹48.6L" detail="Base scenario" tone="success" /><KnowledgeStat label="Expected cash" value="₹21.6L" detail="31 Jan forecast" tone="neutral" /><KnowledgeStat label="Confidence" value="78%" detail="Weighted pipeline + history" tone="success" /></div><div className="grid gap-4 lg:grid-cols-2"><SectionCard title="Revenue scenarios" description="Planning scenarios based on the weighted pipeline."><div className="flex flex-col gap-4">{scenarios.map(([name, value, percent, tone]) => <div key={name}><div className="flex justify-between text-sm"><span className="font-medium">{name}</span><span>{value}</span></div><div className="mt-2 h-2 rounded-full bg-[#efefea]"><div className={tone === "warning" ? "h-2 rounded-full bg-warning" : tone === "info" ? "h-2 rounded-full bg-info" : "h-2 rounded-full bg-success"} style={{ width: String(percent) + "%" }} /></div></div>)}</div></SectionCard><SectionCard title="Planning notes" description="The owner can turn forecasts into approved plans."><div className="flex flex-col gap-3 text-sm text-muted-foreground"><p>• Closing the stalled proposals moves the base scenario closer to the upside case.</p><p>• Collecting the overdue invoices protects the cash forecast.</p><p>• Forecasts improve as Finance and CRM history builds up.</p><Button className="w-fit" variant="secondary" onClick={() => setNotice("Planning action staged for Owner approval. No business record was changed.")}>Create planning action</Button></div></SectionCard></div><SectionCard title="Recommended next actions" description="Forecast signals and practical recommendations in one planning view."><div className="flex flex-col divide-y divide-border">{recommendations.map(([title, detail, area, impact]) => <div key={title} className="flex flex-wrap items-start gap-4 py-4 first:pt-0 last:pb-0"><span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-muted text-accent"><Sparkles className="size-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{title}</p><Badge variant="neutral">{area}</Badge><Badge variant={impact === "High impact" ? "success" : "warning"}>{impact}</Badge></div><p className="mt-1 text-sm leading-6 text-muted-foreground">{detail}</p></div><Button size="sm" onClick={() => setReviewed((current) => current.includes(title) ? current : [...current, title])}>{reviewed.includes(title) ? "Queued for approval" : "Review"}</Button></div>)}</div></SectionCard></div>;
}

function DemoNotice({ children }: { children: React.ReactNode }) {
  return <div role="status" className="rounded-lg border border-accent-border bg-accent-muted px-4 py-3 text-sm text-accent">{children}</div>;
}
