"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { can } from "@/lib/permissions";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  CalendarClock,
  ChevronLeft,
  Info,
  List,
  Loader2,
  Mail,
  Maximize2,
  MessageCircle,
  Minimize2,
  Phone,
  RefreshCw,
  Send,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import type {
  QuickReply,
  WhatsAppConversation,
  WhatsAppMessage,
  WhatsAppTemplate,
} from "@/lib/api/types";
import { useSession } from "@/components/auth/session-provider";
import { CustomerAvatar } from "@/components/shared/customer-avatar";
import { SearchInput } from "@/components/shared/search-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { selectClass } from "@/components/lead-sources/connection-form";
import { cn, formatDateTime } from "@/lib/utils";
import { CustomerCallButton, callSummary, type CustomerCall } from "@/components/calls/customer-call";
import { MessageStatus } from "@/components/chat/message-status";
import { InfoPanel } from "@/components/chat/info-panel";

type TimelineItem = {
  id: string;
  channel: "whatsapp" | "email" | "call";
  direction: "inbound" | "outbound" | "internal";
  title: string;
  body: string;
  status?: string;
  createdAt: string;
};

const statusColors: Record<string, string> = {
  open: "bg-success",
  pending: "bg-warning",
  resolved: "bg-muted-foreground",
  closed: "bg-muted-foreground/50",
};

export default function InboxPage() {
  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>}>
      <Inbox />
    </Suspense>
  );
}

function Inbox() {
  const session = useSession();
  const userId = String(session.user.id);
  const router = useRouter();
  const selected = useSearchParams().get("c");
  const [before, setBefore] = useState("0");
  const [query, setQuery] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [listView, setListView] = useState<"mine" | "unassigned" | "all">("mine");
  const [statusFilter, setStatusFilter] = useState<"open" | "all">("open");
  const [showInfo, setShowInfo] = useState(true);
  const list = useApi<WhatsAppConversation[]>(
    `/whatsapp/conversations?limit=50&before_id=${before}`,
  );
  const reload = list.reload;
  useEffect(() => {
    const timer = setInterval(reload, 5000);
    return () => clearInterval(timer);
  }, [reload]);

  const allRows = useMemo(
    () =>
      (list.data ?? []).filter((c) => {
        if (query) {
          const q = query.toLowerCase();
          if (![c.name, c.phone, c.company].some((v) => v?.toLowerCase().includes(q))) return false;
        }
        if (statusFilter === "open") {
          const s = c.status ?? "open";
          if (s !== "open" && s !== "pending") return false;
        }
        return true;
      }),
    [list.data, query, statusFilter],
  );

  const rows = useMemo(
    () =>
      allRows.filter((c) => {
        const owner = c.assignedUserId ?? c.ownerId;
        if (listView === "mine") return owner === userId;
        if (listView === "unassigned") return !owner;
        return true;
      }),
    [allRows, listView, userId],
  );

  const mineCount = useMemo(() => allRows.filter((c) => (c.assignedUserId ?? c.ownerId) === userId).length, [allRows, userId]);
  const unassignedCount = useMemo(() => allRows.filter((c) => !(c.assignedUserId ?? c.ownerId)).length, [allRows]);

  const markRead = useCallback(async (id: string) => {
    try {
      await api(`/whatsapp/conversations/${id}/read`, { method: "POST" });
    } catch {
      // silent — not critical
    }
  }, []);

  return (
    <div className={cn("inbox-shell flex h-full min-h-0", fullscreen && "fixed inset-0 z-50 bg-surface")}>
      {/* ── Panel A: Conversation sidebar ── */}
      <aside
        className={cn(
          "h-full w-full flex-col border-r border-border bg-surface md:flex md:w-[300px] md:shrink-0 lg:w-[320px]",
          selected ? "hidden" : "flex",
        )}
      >
        <div className="flex flex-col gap-2 border-b border-border p-3">
          <div className="flex items-center justify-between">
            <h1 className="text-sm font-semibold">Chats</h1>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" aria-label="Refresh inbox" onClick={reload}>
                <RefreshCw className="size-3.5" />
              </Button>
              <Button variant="ghost" size="icon" aria-label={fullscreen ? "Exit full screen" : "Full screen"} onClick={() => setFullscreen((v) => !v)}>
                {fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
              </Button>
            </div>
          </div>
          <SearchInput value={query} onChange={setQuery} placeholder="Search chats…" />
          <div className="flex items-center gap-1 bg-surface-2 p-1">
            {([
              ["mine", `Mine ${mineCount}`],
              ["unassigned", `Open ${unassignedCount}`],
              ["all", `All ${allRows.length}`],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={cn(
                  "flex-1 px-2 py-1.5 text-[11px] font-medium",
                  listView === value
                    ? "bg-surface text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setListView(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStatusFilter("open")}
              className={cn("text-[11px] font-medium", statusFilter === "open" ? "text-accent" : "text-muted-foreground")}
            >
              Active
            </button>
            <span className="text-[10px] text-muted-foreground">·</span>
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={cn("text-[11px] font-medium", statusFilter === "all" ? "text-accent" : "text-muted-foreground")}
            >
              All statuses
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {list.loading && !list.data && (
            <p role="status" className="p-3 text-sm">Loading conversations…</p>
          )}
          {list.error && (
            <p role="alert" className="p-3 text-sm text-danger">{list.error}</p>
          )}
          {!list.loading && !list.error && rows.length === 0 && (
            <div className="flex flex-col gap-2 p-4 text-sm">
              {allRows.length > 0 ? (
                <>
                  <p className="text-muted-foreground">
                    {listView === "mine"
                      ? "No conversations assigned to you."
                      : "No unassigned conversations."}
                  </p>
                  <button type="button" onClick={() => setListView("all")} className="text-xs text-accent">
                    View all conversations →
                  </button>
                </>
              ) : (
                <>
                  <p>No conversations yet</p>
                  <p className="text-xs text-muted-foreground">
                    When a customer messages on WhatsApp or you open a chat from a lead, conversations appear here.
                  </p>
                  <Link className="text-xs text-accent" href="/leads">Open leads →</Link>
                  <Link className="text-xs text-accent" href="/lead-sources">Connect a source →</Link>
                </>
              )}
            </div>
          )}
          {rows.map((c) => {
            const unread = c.unreadCount ?? 0;
            const statusDot = statusColors[c.status ?? "open"] ?? "bg-muted-foreground";
            return (
              <button
                key={c.id}
                onClick={() => {
                  router.replace(`/inbox?c=${c.id}`, { scroll: false });
                  if (unread > 0) markRead(c.id);
                }}
                className={cn(
                  "flex w-full items-start gap-2.5 border-b border-border/60 px-3 py-2.5 text-left",
                  selected === c.id ? "bg-accent-muted" : "hover:bg-surface-2",
                )}
              >
                <div className="relative">
                  <CustomerAvatar name={c.name || c.phone || "Customer"} color="#4169e1" />
                  <span className={cn("absolute -bottom-0.5 -right-0.5 size-2.5 border-2 border-surface", statusDot)} title={c.status ?? "open"} />
                </div>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className={cn("block truncate text-[13px]", unread > 0 ? "font-semibold" : "font-medium")}>
                      {c.name || c.phone}
                    </span>
                    {c.priority === "urgent" && (
                      <span className="shrink-0 bg-danger/10 px-1 py-0.5 text-[9px] font-medium text-danger">URGENT</span>
                    )}
                    {c.priority === "high" && (
                      <span className="shrink-0 bg-warning/10 px-1 py-0.5 text-[9px] font-medium text-warning">HIGH</span>
                    )}
                    {c.doNotContact && (
                      <span className="shrink-0 bg-warning-muted px-1 py-0.5 text-[9px] text-warning">DNC</span>
                    )}
                  </span>
                  {c.lastMessageBody && (
                    <span className={cn(
                      "mt-0.5 block truncate text-[11px]",
                      unread > 0 ? "font-medium text-foreground" : "text-muted-foreground",
                    )}>
                      {c.lastMessageBody}
                    </span>
                  )}
                  {!c.lastMessageBody && c.company && (
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{c.company}</span>
                  )}
                  <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span>{formatDateTime(c.lastMessageAt)}</span>
                    {(c.assignedUserName || c.ownerName) && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{c.assignedUserName || c.ownerName}</span>
                      </>
                    )}
                  </span>
                </span>
                {unread > 0 && (
                  <span className="mt-1 flex size-5 shrink-0 items-center justify-center bg-accent text-[10px] font-bold text-white">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2 border-t border-border p-2">
          <Button size="sm" variant="ghost" onClick={() => { setBefore("0"); reload(); }}>
            Newest
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={list.data?.length !== 50}
            onClick={() => setBefore(list.data!.at(-1)!.id)}
          >
            Older
          </Button>
        </div>
      </aside>

      {/* ── Panel B + C ── */}
      <div className={cn("min-w-0 flex-1 flex-col", selected ? "flex" : "hidden md:flex")}>
        {selected ? (
          <div className="flex min-h-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col">
              <ConversationView
                key={selected}
                id={selected}
                onChanged={reload}
                showInfo={showInfo}
                onToggleInfo={() => setShowInfo((v) => !v)}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <MessageCircle className="size-8 text-muted-foreground/40" />
            <h2 className="text-sm font-medium">Select a conversation</h2>
            <p className="max-w-xs text-xs text-muted-foreground">
              Customer messages and delivery status appear here in real time.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ConversationView({
  id,
  onChanged,
  showInfo,
  onToggleInfo,
}: {
  id: string;
  onChanged: () => void;
  showInfo: boolean;
  onToggleInfo: () => void;
}) {
  const liveThread = useApi<WhatsAppConversation>(
    `/whatsapp/conversations/${encodeURIComponent(id)}`,
  );
  const [before, setBefore] = useState("0");
  const liveMessages = useApi<WhatsAppMessage[]>(
    `/whatsapp/conversations/${encodeURIComponent(id)}/messages?limit=50&before_id=${before}`,
  );
  const [channel, setChannel] = useState<"all" | "whatsapp" | "email" | "call">("whatsapp");
  const thread = liveThread.data;
  const messageRows = liveMessages.data;
  const calls = useApi<CustomerCall[]>(
    !thread?.contactId ? null : `/contacts/${encodeURIComponent(thread.contactId)}/calls`,
  );
  const callRows: TimelineItem[] = (calls.data ?? []).map((call) => ({
    id: `call-${call.id}`,
    channel: "call" as const,
    direction: call.direction === "inbound" ? "inbound" as const : "outbound" as const,
    title: `${callSummary(call)} · ${call.agentName}`,
    body: call.notes || "No notes.",
    createdAt: call.createdAt,
  }));
  const timeline = [...(messageRows?.map((m) => ({
    id: m.id,
    channel: "whatsapp" as const,
    direction: m.direction === "inbound" ? "inbound" as const : "outbound" as const,
    title: m.kind === "template" ? "WhatsApp template" : "WhatsApp message",
    body: m.body,
    status: m.status === "accepted" ? "Accepted by Meta · Template" : sentenceCase(m.status),
    createdAt: m.createdAt,
  })) ?? []), ...callRows].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

  const reloadThread = liveThread.reload;
  const reloadMessages = liveMessages.reload;
  useEffect(() => {
    const timer = setInterval(() => {
      reloadThread();
      if (before === "0") reloadMessages();
    }, 5000);
    return () => clearInterval(timer);
  }, [reloadThread, reloadMessages, before]);

  const bottom = useRef<HTMLDivElement>(null);
  const lastId = messageRows?.at(-1)?.id;
  useEffect(() => {
    if (before === "0") bottom.current?.scrollIntoView({ block: "end" });
  }, [lastId, before]);

  const handleChanged = useCallback(() => {
    reloadThread();
    onChanged();
  }, [reloadThread, onChanged]);

  return (
    <div className="flex min-h-0 flex-1">
      {/* ── Message area ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border bg-surface px-4 py-2.5">
          <Button size="icon" variant="ghost" asChild className="md:hidden">
            <Link href="/inbox" aria-label="Back to conversations">
              <ChevronLeft className="size-4" />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            {thread ? (
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="relative">
                  <CustomerAvatar name={thread.name || thread.phone || "Customer"} color="#4169e1" />
                  <span className={cn(
                    "absolute -bottom-0.5 -right-0.5 size-2.5 border-2 border-surface",
                    statusColors[thread.status ?? "open"] ?? "bg-muted-foreground",
                  )} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/customers/${thread.contactId}`}
                      className="truncate text-sm font-semibold hover:text-accent"
                    >
                      {thread.name || thread.phone}
                    </Link>
                    <span className={cn(
                      "shrink-0 px-1.5 py-0.5 text-[10px] font-medium capitalize",
                      thread.status === "open" ? "bg-success-muted text-success"
                        : thread.status === "pending" ? "bg-warning-muted text-warning"
                          : "bg-surface-2 text-muted-foreground",
                    )}>
                      {thread.status ?? "open"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {thread.phone}
                    {thread.company && <> · {thread.company}</>}
                  </p>
                </div>
              </div>
            ) : (
              <p role="status" className="text-sm">
                {liveThread.error || <span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Loading…</span>}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            {thread && liveThread.data ? (
              <CustomerCallButton
                contactId={liveThread.data.contactId}
                name={liveThread.data.name || liveThread.data.phone || "this customer"}
                phone={liveThread.data.phone}
                doNotContact={liveThread.data.doNotContact}
                conversation={liveThread.data}
                onChanged={calls.reload}
              />
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => { setBefore("0"); reloadMessages(); reloadThread(); }}>
              <RefreshCw className="size-3" />
            </Button>
            <Button
              size="icon"
              variant={showInfo ? "secondary" : "ghost"}
              onClick={onToggleInfo}
              className="hidden lg:flex"
              aria-label="Toggle customer info"
            >
              <Info className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* Channel tabs */}
        <div className="border-b border-border bg-surface px-4 pt-1">
          <div className="flex items-center gap-1" role="tablist" aria-label="Conversation channels">
            {([
              ["whatsapp", MessageCircle, "WhatsApp"],
              ["all", List, "All activity"],
              ["email", Mail, "Email"],
              ["call", Phone, "Calls"],
            ] as const).map(([key, Icon, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={channel === key}
                onClick={() => setChannel(key)}
                className={cn(
                  "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors",
                  channel === key
                    ? "border-accent text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Messages */}
        {channel === "whatsapp" ? (
          <WhatsAppMessages
            messages={messageRows}
            loading={liveMessages.loading}
            error={liveMessages.error}
            before={before}
            onLoadOlder={() => messageRows && messageRows.length === 50 && setBefore(messageRows[0].id)}
            hasOlder={messageRows?.length === 50}
            bottomRef={bottom}
          />
        ) : channel === "all" ? (
          <UnifiedTimeline timeline={timeline} loading={liveMessages.loading} />
        ) : channel === "call" ? (
          <UnifiedTimeline timeline={callRows} loading={calls.loading && !calls.data} />
        ) : thread ? (
          <ChannelPanel channel={channel} thread={thread} />
        ) : null}

        {/* Composer */}
        {thread && (channel === "all" || channel === "whatsapp") && (
          <Composer
            thread={thread}
            onSent={() => {
              setBefore("0");
              reloadMessages();
              reloadThread();
              onChanged();
            }}
          />
        )}
      </div>

      {/* ── Panel C: Customer info ── */}
      {showInfo && thread && (
        <aside className="hidden h-full w-[280px] shrink-0 border-l border-border bg-surface lg:block">
          <InfoPanel thread={thread} onChanged={handleChanged} />
        </aside>
      )}
    </div>
  );
}

function WhatsAppMessages({
  messages,
  loading,
  error,
  before,
  onLoadOlder,
  hasOlder,
  bottomRef,
}: {
  messages: WhatsAppMessage[] | undefined;
  loading: boolean;
  error: string | null | undefined;
  before: string;
  onLoadOlder: () => void;
  hasOlder: boolean;
  bottomRef: React.RefObject<HTMLDivElement | null>;
}) {
  let lastDate = "";
  return (
    <div className="flex-1 overflow-y-auto bg-surface-2/30 px-4 py-3">
      {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
      {loading && !messages && <p role="status" className="text-sm">Loading messages…</p>}
      <div className="mx-auto flex max-w-2xl flex-col gap-1">
        {hasOlder && (
          <Button size="sm" variant="ghost" className="mb-2 self-center" onClick={onLoadOlder}>
            Load older messages
          </Button>
        )}
        {before !== "0" && (
          <p className="mb-2 text-center text-xs text-muted-foreground">
            Viewing older messages.
          </p>
        )}
        {messages?.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No messages yet. Send an approved template to start the conversation.
          </p>
        )}
        {messages?.map((m) => {
          const msgDate = new Date(m.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
          const showDate = msgDate !== lastDate;
          lastDate = msgDate;
          return (
            <div key={m.id}>
              {showDate && (
                <div className="my-3 flex items-center justify-center">
                  <span className="bg-surface-2 px-3 py-1 text-[10px] font-medium text-muted-foreground shadow-sm">
                    {msgDate}
                  </span>
                </div>
              )}
              <div className={cn(
                "flex max-w-[80%] flex-col gap-0.5 py-0.5",
                m.direction === "outbound" ? "ml-auto items-end" : "items-start",
              )}>
                <div className={cn(
                  "relative whitespace-pre-wrap break-words px-3 py-2 text-[13px] leading-relaxed shadow-sm",
                  m.direction === "outbound"
                    ? "bg-accent-muted"
                    : "bg-surface",
                )}>
                  {m.body}
                  <span className="ml-3 inline-flex items-center gap-1 align-bottom text-[10px] text-muted-foreground">
                    {new Date(m.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    {m.direction === "outbound" && <MessageStatus status={m.status} />}
                  </span>
                </div>
                {m.kind === "template" && (
                  <span className="text-[10px] text-muted-foreground">Template</span>
                )}
                {m.errorCode && (
                  <p className="max-w-lg text-xs text-danger">
                    {m.status === "unknown"
                      ? "Send result uncertain. It may have reached the customer."
                      : `Failed: ${m.errorCode.replaceAll("_", " ")}`}
                  </p>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function UnifiedTimeline({
  timeline,
  loading,
}: {
  timeline: TimelineItem[];
  loading: boolean;
}) {
  return (
    <div className="flex-1 overflow-y-auto bg-surface-2/30 p-4">
      {loading && <p role="status" className="mx-auto max-w-2xl text-sm">Loading activity…</p>}
      {!loading && timeline.length === 0 && (
        <p className="mx-auto max-w-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No activity yet. Messages, email updates, and call notes will appear here as one timeline.
        </p>
      )}
      <div className="mx-auto flex max-w-2xl flex-col gap-3">
        {timeline.map((item) => {
          const Icon = item.channel === "whatsapp" ? MessageCircle : item.channel === "email" ? Mail : Phone;
          const channelLabel = item.channel === "whatsapp" ? "WhatsApp" : item.channel === "email" ? "Email" : "Call";
          const outgoing = item.direction === "outbound";
          const internal = item.direction === "internal";
          return (
            <article key={item.id} className={cn("flex max-w-[88%]", outgoing ? "self-end" : internal ? "self-center" : "self-start")}>
              <div className={cn("min-w-0 border p-3 shadow-sm", outgoing ? "border-accent-border bg-accent-muted" : internal ? "border-border bg-surface-2" : "border-border bg-surface")}>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium"><Icon className="size-3.5 text-muted-foreground" />{channelLabel}</div>
                  <span className="text-[10.5px] text-muted-foreground">{item.title}</span>
                  <time className="text-[10.5px] text-muted-foreground">{formatDateTime(item.createdAt)}</time>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/90">{item.body}</p>
                {item.status && <p className="mt-2 text-[10.5px] text-muted-foreground">{item.status}</p>}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function ChannelPanel({
  channel,
  thread,
}: {
  channel: "email" | "call";
  thread: WhatsAppConversation;
}) {
  const [subject, setSubject] = useState("Following up on your Janus enquiry");
  const [body, setBody] = useState(
    "Hi,\n\nThanks for reaching out. I have a few options that should fit your requirement. Would you like to review them together?\n\nRegards,\nJanus team",
  );
  const [outcome, setOutcome] = useState("Connected");
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);
  const email = "";
  if (channel === "email") {
    return (
      <form
        className="flex-1 overflow-y-auto p-4"
        onSubmit={(event) => {
          event.preventDefault();
          setSaved(true);
          toast.success("Email draft prepared. Connect an email provider to send it.");
        }}
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-3 border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <div><h3 className="text-sm font-semibold">Email follow-up</h3><p className="text-xs text-muted-foreground">Draft a context-aware email without leaving the customer timeline.</p></div>
            <Mail className="size-4 text-accent" />
          </div>
          <div className="grid gap-1"><Label htmlFor="email-to">To</Label><Input id="email-to" value={email} readOnly /></div>
          <div className="grid gap-1"><Label htmlFor="email-subject">Subject</Label><Input id="email-subject" value={subject} onChange={(event) => setSubject(event.target.value)} /></div>
          <div className="grid gap-1"><Label htmlFor="email-body">Message</Label><Textarea id="email-body" value={body} onChange={(event) => setBody(event.target.value)} className="min-h-36" /></div>
          {saved && <p role="status" className="text-xs text-success">Draft saved to this conversation.</p>}
          <Button type="submit" className="self-end"><Send className="size-3.5" /> Save email draft</Button>
        </div>
      </form>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto flex max-w-2xl flex-col gap-4 border border-border bg-surface p-4">
        <div className="flex items-center justify-between"><div><h3 className="text-sm font-semibold">Call workspace</h3><p className="text-xs text-muted-foreground">Start a call, capture the outcome and keep the next step on the timeline.</p></div><Phone className="size-4 text-accent" /></div>
        <div className="flex flex-wrap items-center gap-2 bg-surface-2 p-3"><span className="text-sm font-medium">{thread.phone}</span><span className="text-xs text-muted-foreground">Connected phone provider</span><Button type="button" size="sm" onClick={() => toast.success("Call handoff opened.")}><Phone className="size-3.5" /> Start call</Button></div>
        <div className="grid gap-1"><Label htmlFor="call-outcome">Call outcome</Label><select id="call-outcome" className={selectClass} value={outcome} onChange={(event) => setOutcome(event.target.value)}><option>Connected</option><option>No answer</option><option>Callback requested</option><option>Qualified</option></select></div>
        <div className="grid gap-1"><Label htmlFor="call-notes">Call notes</Label><Textarea id="call-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Capture the requirement, objections and next step…" className="min-h-24" /></div>
        <Button type="button" className="self-end" onClick={() => toast.success(`${outcome} call note saved.`)}><CalendarClock className="size-3.5" /> Save call note</Button>
      </div>
    </div>
  );
}

function Composer({
  thread,
  onSent,
}: {
  thread: WhatsAppConversation;
  onSent: () => void;
}) {
  const session = useSession();
  const allowed = can(session, "leads:write") && !!session.user.email_verified_at;
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  const canReply = !!thread.replyWindowEndsAt && new Date(thread.replyWindowEndsAt).getTime() > clock;
  const [mode, setMode] = useState<"text" | "template">(canReply ? "text" : "template");
  const [body, setBody] = useState("");
  const [selected, setSelected] = useState("");
  const [parameters, setParameters] = useState<string[]>([]);
  const [optIn, setOptIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  const templates = useApi<WhatsAppTemplate[]>(
    allowed && mode === "template" ? "/whatsapp/templates" : null,
  );
  const quickReplies = useApi<QuickReply[]>(
    allowed && showQuickReplies ? "/whatsapp/quick-replies" : null,
  );
  const template = templates.data?.find((t) => `${t.name}:${t.language}` === selected);
  const preview = template
    ? [
        template.header,
        template.body.replace(
          /\{\{(\d+)\}\}/g,
          (match, n) => parameters[Number(n) - 1] || match,
        ),
        template.footer,
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  if (!allowed)
    return (
      <p className="border-t border-border p-4 text-sm text-muted-foreground">
        Verify your email and ask for lead write access to send messages.
      </p>
    );
  if (thread.doNotContact)
    return (
      <p className="border-t border-border bg-warning/5 p-4 text-sm text-warning">
        Outbound communication is suppressed for this customer.
      </p>
    );

  return (
    <form
      className="max-h-[44%] shrink-0 overflow-y-auto border-t border-border bg-surface p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const payload =
          mode === "text"
            ? { kind: mode, body }
            : {
                kind: mode,
                templateName: template?.name,
                language: template?.language,
                parameters,
                optInConfirmed: optIn,
              };
        const signature = JSON.stringify(payload);
        if (attempt.current?.signature !== signature)
          attempt.current = { signature, key: crypto.randomUUID() };
        setBusy(true);
        setError("");
        try {
          await api(`/whatsapp/conversations/${thread.id}/messages`, {
            method: "POST",
            body: signature,
            headers: { "Idempotency-Key": attempt.current!.key },
          });
          setBody("");
          setParameters(template ? Array(template.parameterCount).fill("") : []);
          setOptIn(false);
          attempt.current = null;
          onSent();
          toast.success("Message queued.");
        } catch (e) {
          setError(message(e));
          onSent();
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <select
            id="message-mode"
            className={cn(selectClass, "w-auto text-xs")}
            value={mode}
            disabled={busy}
            onChange={(e) => setMode(e.target.value as "text" | "template")}
          >
            <option value="text" disabled={!canReply}>Text reply</option>
            <option value="template">Template</option>
          </select>
          <span className="text-[11px] text-muted-foreground">
            {canReply
              ? `Window until ${formatDateTime(thread.replyWindowEndsAt!)}`
              : "Template required (no reply window)"}
          </span>
          {mode === "text" && (
            <button
              type="button"
              onClick={() => setShowQuickReplies((v) => !v)}
              className={cn("ml-auto flex items-center gap-1 text-[11px] font-medium", showQuickReplies ? "text-accent" : "text-muted-foreground hover:text-foreground")}
            >
              <Zap className="size-3" /> Quick replies
            </button>
          )}
        </div>
        {showQuickReplies && mode === "text" && (
          <div className="flex flex-wrap gap-1.5 border border-border bg-surface-2 p-2">
            {quickReplies.loading && <span className="text-xs text-muted-foreground">Loading…</span>}
            {quickReplies.data?.length === 0 && <span className="text-xs text-muted-foreground">No quick replies saved yet.</span>}
            {quickReplies.data?.map((qr) => (
              <button
                key={qr.id}
                type="button"
                onClick={() => { setBody(qr.body); setShowQuickReplies(false); }}
                className="bg-surface px-2 py-1 text-xs hover:bg-accent-muted"
                title={qr.body}
              >
                {qr.title}
              </button>
            ))}
          </div>
        )}
        {mode === "text" ? (
          <Textarea
            aria-label="Reply to customer"
            placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={4096}
            required
            disabled={busy || !canReply}
            className="min-h-16 text-[13px]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (body.trim() && canReply && !busy) {
                  (e.target as HTMLElement).closest("form")?.requestSubmit();
                }
              }
            }}
          />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <select
                aria-label="Approved template"
                required
                value={selected}
                disabled={busy || !templates.data}
                className={selectClass}
                onChange={(e) => {
                  setSelected(e.target.value);
                  const t = templates.data?.find((t) => `${t.name}:${t.language}` === e.target.value);
                  setParameters(Array(t?.parameterCount || 0).fill(""));
                }}
              >
                <option value="">Choose an approved template</option>
                {templates.data?.map((t) => (
                  <option key={`${t.name}:${t.language}`} value={`${t.name}:${t.language}`}>
                    {t.name} · {t.language}
                  </option>
                ))}
              </select>
              <Button type="button" size="sm" variant="ghost" onClick={templates.reload}>Refresh</Button>
            </div>
            {templates.error && <p role="alert" className="text-xs text-danger">{templates.error}</p>}
            {templates.loading && <p role="status" className="text-xs">Loading templates…</p>}
            {templates.data?.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No approved text templates found. Create one in WhatsApp Manager, then refresh.
              </p>
            )}
            {parameters.map((value, index) => (
              <div key={index} className="flex flex-col gap-1">
                <Label htmlFor={`parameter-${index}`}>Parameter {index + 1}</Label>
                <Input
                  id={`parameter-${index}`}
                  value={value}
                  required
                  maxLength={1024}
                  disabled={busy}
                  onChange={(e) => setParameters((v) => v.map((p, i) => (i === index ? e.target.value : p)))}
                />
              </div>
            ))}
            {preview && (
              <p className="whitespace-pre-wrap break-words border border-border bg-surface-2 p-3 text-sm">{preview}</p>
            )}
            {!thread.whatsappOptIn && (
              <p className="border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-warning">
                WhatsApp opt-in required. <Link href={`/customers/${thread.contactId}`} className="font-medium underline">Record it here</Link>.
              </p>
            )}
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={optIn}
                onChange={(e) => setOptIn(e.target.checked)}
                required
                disabled={busy || !thread.whatsappOptIn}
              />
              This customer agreed to receive WhatsApp messages from our business.
            </label>
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex items-center justify-end gap-2">
          <Button
            disabled={
              busy ||
              (mode === "text"
                ? !canReply || !body.trim()
                : !thread.whatsappOptIn || !template || !optIn || parameters.some((p) => !p.trim()))
            }
          >
            <Send className="size-3.5" />
            {busy ? "Sending…" : mode === "template" ? "Send template" : "Send"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function sentenceCase(status: string) {
  const words = status.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
