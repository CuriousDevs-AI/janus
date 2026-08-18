"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Send,
  Paperclip,
  Sparkles,
  CalendarClock,
  MoreHorizontal,
  Bot,
  UserRound,
  RefreshCcw,
  Check,
} from "lucide-react";
import { useAppStore } from "@/lib/stores/app-store";
import { getCompanyById } from "@/lib/mock-data";
import { generateAIReply, generateDraft } from "@/lib/services/ai-responder";
import { CustomerAvatar } from "@/components/shared/customer-avatar";
import { ChannelBadge } from "@/components/shared/channel-badge";
import { AIIndicator, AIConfidence } from "@/components/shared/ai-indicator";
import { LeadStageBadge } from "@/components/shared/status-badge";
import { formatTime, formatDate, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shared/empty-state";
import { MessageSquare } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ConversationPanel({ conversationId }: { conversationId: string | undefined }) {
  const conversation = useAppStore((s) => s.conversations.find((c) => c.id === conversationId));
  const allMessages = useAppStore((s) => s.messages);
  const messages = allMessages.filter((m) => m.conversationId === conversationId);
  const customer = useAppStore((s) => s.customers.find((c) => c.id === conversation?.customerId));
  const allLeads = useAppStore((s) => s.leads);
  const customerLeads = allLeads.filter((l) => l.customerId === conversation?.customerId);
  const lead = customerLeads.find((l) => l.stage !== "won" && l.stage !== "lost") ?? customerLeads[0];
  const sendMessage = useAppStore((s) => s.sendMessage);
  const simulateAIReply = useAppStore((s) => s.simulateAIReply);
  const markConversationRead = useAppStore((s) => s.markConversationRead);

  const [draftText, setDraftText] = React.useState("");
  const [aiDraft, setAiDraft] = React.useState<string | null>(null);
  const [draftIndex, setDraftIndex] = React.useState(0);
  const [sending, setSending] = React.useState(false);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (conversationId) markConversationRead(conversationId);
  }, [conversationId, markConversationRead]);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, conversationId]);

  if (!conversation || !customer) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <EmptyState icon={MessageSquare} title="Select a conversation" description="Choose a conversation from the list to see the full history." className="border-none" />
      </div>
    );
  }

  const company = getCompanyById(customer.companyId);

  function handleSend() {
    if (!draftText.trim() || !conversation) return;
    sendMessage(conversation.id, draftText.trim());
    setDraftText("");
    setAiDraft(null);
    setSending(true);
    window.setTimeout(() => {
      const reply = generateAIReply(conversation);
      simulateAIReply(conversation.id, reply.content, { confidence: reply.confidence, knowledgeUsed: reply.knowledgeUsed });
      setSending(false);
    }, 1400);
  }

  return (
    <div className="flex h-full flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <CustomerAvatar name={customer.name} color={customer.avatarColor} />
          <div>
            <div className="flex items-center gap-2">
              <Link href={`/customers/${customer.id}`} className="text-[13.5px] font-medium text-foreground hover:text-accent">
                {customer.name}
              </Link>
              {lead && <LeadStageBadge stage={lead.stage} />}
            </div>
            <p className="text-[11.5px] text-muted-foreground">{company?.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ChannelBadge channel={conversation.channel} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/customers/${customer.id}`}>View profile</Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => toast.success("Conversation marked resolved")}>Mark resolved</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          {messages.map((m) => (
            <MessageBubble key={m.id} content={m.content} sender={m.sender} createdAt={m.createdAt} aiMeta={m.aiMeta} systemMeta={m.systemMeta} attachments={m.attachments} />
          ))}
          {sending && (
            <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
              <Bot className="size-3.5 text-accent" />
              <span className="flex gap-0.5">
                <span className="size-1 animate-bounce rounded-full bg-accent [animation-delay:-0.2s]" />
                <span className="size-1 animate-bounce rounded-full bg-accent [animation-delay:-0.1s]" />
                <span className="size-1 animate-bounce rounded-full bg-accent" />
              </span>
              AI is drafting a reply…
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-border p-3">
        {aiDraft && (
          <div className="mx-auto mb-2 max-w-2xl rounded-md border border-accent-border bg-accent-muted p-3">
            <div className="mb-1.5 flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-accent" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-accent">Suggested response</span>
            </div>
            <p className="text-[13px] text-foreground">{aiDraft}</p>
            <div className="mt-2 flex items-center gap-1.5">
              <Button size="sm" onClick={() => { setDraftText(aiDraft); setAiDraft(null); }}>
                <Check className="size-3" /> Insert
              </Button>
              <Button size="sm" variant="secondary" onClick={() => { setDraftText(aiDraft); setAiDraft(null); }}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const next = draftIndex + 1;
                  setDraftIndex(next);
                  setAiDraft(generateDraft(next));
                }}
              >
                <RefreshCcw className="size-3" /> Regenerate
              </Button>
            </div>
          </div>
        )}
        <div className="mx-auto flex max-w-2xl flex-col gap-2 rounded-md border border-border bg-surface-2 p-2">
          <Textarea
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Message…"
            className="min-h-16 border-none bg-transparent px-1 focus-visible:ring-0"
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => toast("Attachments aren't wired up in this demo")}>
                <Paperclip className="size-3.5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setDraftIndex(0); setAiDraft(generateDraft(0)); }}>
                <Sparkles className="size-3.5 text-accent" />
                AI Draft
              </Button>
              <Button variant="ghost" size="sm" onClick={() => toast.success("Meeting scheduled", { description: "Technical Demo · Tomorrow 3:00 PM" })}>
                <CalendarClock className="size-3.5" />
                Schedule
              </Button>
            </div>
            <Button size="sm" onClick={handleSend} disabled={!draftText.trim()}>
              <Send className="size-3.5" />
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  content,
  sender,
  createdAt,
  aiMeta,
  systemMeta,
  attachments,
}: {
  content: string;
  sender: { type: "customer" | "ai" | "human"; agentId?: string; userId?: string } | { type: "system" };
  createdAt: string;
  aiMeta?: { confidence?: number; knowledgeUsed?: string[] };
  systemMeta?: { kind: string; label: string };
  attachments?: { name: string; size: string }[];
}) {
  if (sender.type === "system") {
    return (
      <div className="flex items-center justify-center gap-2 py-1">
        <span className="border border-border bg-surface-2 px-3 py-1 text-[11px] text-muted-foreground">{systemMeta?.label ?? content}</span>
      </div>
    );
  }

  const isCustomer = sender.type === "customer";
  const isAI = sender.type === "ai";

  return (
    <div className={cn("flex flex-col gap-1", isCustomer ? "items-start" : "items-end")}>
      <div className="flex items-center gap-1.5">
        {isCustomer ? null : isAI ? <AIIndicator /> : <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-info"><UserRound className="size-3" />Human</span>}
        <span className="text-[10.5px] text-muted-foreground">{formatDate(createdAt)} · {formatTime(createdAt)}</span>
      </div>
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-3 py-2 text-[13px] leading-relaxed",
          isCustomer ? "bg-surface-3 text-foreground" : isAI ? "border border-accent-border bg-accent-muted text-foreground" : "border border-info/30 bg-info-muted text-foreground"
        )}
      >
        {content}
        {attachments?.map((a) => (
          <div key={a.name} className="mt-1.5 flex items-center gap-1.5 rounded border border-border bg-surface px-2 py-1 text-[11px] text-muted-foreground">
            <Paperclip className="size-3" /> {a.name} · {a.size}
          </div>
        ))}
      </div>
      {isAI && aiMeta?.confidence !== undefined && (
        <div className="flex items-center gap-2">
          <AIConfidence value={aiMeta.confidence} />
          {aiMeta.knowledgeUsed && aiMeta.knowledgeUsed.length > 0 && (
            <span className="text-[10.5px] text-muted-foreground">· used {aiMeta.knowledgeUsed.join(", ")}</span>
          )}
        </div>
      )}
    </div>
  );
}
