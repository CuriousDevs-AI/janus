"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { can } from "@/lib/permissions";
import { buyers } from "@/lib/demo-universe";
import { useCrmAccess } from "@/lib/use-crm-access";
import { demoMode } from "@/lib/demo-mode";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  CalendarClock,
  ChevronLeft,
  List,
  Maximize2,
  Minimize2,
  Mail,
  MessageCircle,
  Paperclip,
  Phone,
  RefreshCw,
  Smile,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import type {
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
import {
  demoConversations,
  demoConversationTimeline,
  demoDealRows,
  demoLeadRows,
  demoMessagesByConversation,
  demoWhatsAppTemplates,
} from "@/lib/api/demo-data";
import type { DemoTimelineItem } from "@/lib/api/demo-data";
import { CustomerCallButton, callSummary, type CustomerCall } from "@/components/calls/customer-call";

export default function InboxPage() {
  return (
      <Suspense fallback={<p className="p-6">Opening chats…</p>}>
      <Inbox />
    </Suspense>
  );
}
function Inbox() {
  const router = useRouter();
  const selected = useSearchParams().get("c");
  const [before, setBefore] = useState("0");
  const [query, setQuery] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [listView, setListView] = useState<"mine" | "unassigned" | "all">("mine");
  const [channelFilter, setChannelFilter] = useState<"all" | "whatsapp" | "email" | "call">("all");
  // The preview keeps its chats in the browser, so it never asks a server for them.
  const list = useApi<WhatsAppConversation[]>(
    demoMode ? null : `/whatsapp/conversations?limit=50&before_id=${before}`,
  );
  const usingDemo = demoMode || Boolean(list.error);
  const access = useCrmAccess();
  const reload = list.reload;
  useEffect(() => {
    const timer = setInterval(reload, 5000);
    return () => clearInterval(timer);
  }, [reload]);
  const allRows =
    (list.data ?? (usingDemo ? access.conversations(demoConversations) : [])).filter((c) =>
      [c.name, c.phone, c.company].some((v) =>
        v?.toLowerCase().includes(query.toLowerCase()),
      ),
    ) || [];
  const rows = allRows.filter(() => {
    const matchesOwner = listView !== "unassigned";
    const matchesChannel = channelFilter === "all" || usingDemo;
    return matchesOwner && matchesChannel;
  });
  return (
    <div className={cn("flex h-full min-h-0", fullscreen && "fixed inset-0 z-50 bg-surface")}>
      <aside
        className={cn(
          "h-full w-full flex-col border-r border-border bg-surface md:flex md:w-[300px] md:shrink-0 lg:w-[280px]",
          selected ? "hidden" : "flex",
        )}
      >
        <div className="flex flex-col gap-3 border-b border-border p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><h1 className="sr-only">Chats</h1></div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" aria-label="Refresh inbox" onClick={reload}>
                <RefreshCw className="size-3.5" />
              </Button>
              <Button variant="ghost" size="icon" aria-label={fullscreen ? "Exit full screen" : "Open chats full screen"} title={fullscreen ? "Exit full screen" : "Open chats full screen"} onClick={() => setFullscreen((value) => !value)}>
                {fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
              </Button>
            </div>
          </div>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search chats…"
          />
          <p className="text-xs text-muted-foreground">
            Messages from connected channels · refreshes every 5 seconds
          </p>
          <div className="flex items-center gap-1 rounded-none bg-surface-2 p-1">
            {([['mine', `Mine ${allRows.length}`], ['unassigned', 'Unassigned 0'], ['all', `All ${allRows.length}`]] as const).map(([value, label]) => (
              <button key={value} type="button" className={cn("flex-1 px-2 py-1.5 text-[11px] font-medium", listView === value ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")} onClick={() => setListView(value)}>{label}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {([['all', 'All channels'], ['whatsapp', 'WhatsApp'], ['email', 'Email'], ['call', 'Calls']] as const).map(([value, label]) => (
              <button key={value} type="button" className={cn("border border-border px-2 py-1 text-[10px]", channelFilter === value ? "border-accent bg-accent-muted text-foreground" : "text-muted-foreground hover:bg-surface-2")} onClick={() => setChannelFilter(value)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {list.loading && (
            <p role="status" className="p-3 text-sm">
              Loading conversations…
            </p>
          )}
          {!list.loading && !list.error && rows.length === 0 && (
            <div className="flex flex-col gap-2 p-4 text-sm">
              <p>No chats on this page.</p>
              <p className="text-xs text-muted-foreground">
                Open a lead and choose a channel follow-up, or receive a message
                from a connected source.
              </p>
              <Link className="text-accent" href="/leads">
                Open leads →
              </Link>
              <Link className="text-accent" href="/lead-sources">
                Manage connected channels →
              </Link>
            </div>
          )}
          {rows.map((c) => (
            <button
              key={c.id}
              onClick={() =>
                router.replace(`/inbox?c=${c.id}`, { scroll: false })
              }
              className={cn(
                "flex w-full items-start gap-2.5 border-b border-border/60 px-3 py-3 text-left",
                selected === c.id ? "bg-accent-muted" : "hover:bg-surface-2",
              )}
            >
              <CustomerAvatar
                name={c.name || c.phone || "Customer"}
                color="#4169e1"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">
                  {c.name || c.phone}
                </span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  {c.phone}
                </span>
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  {formatDateTime(c.lastMessageAt)}
                </span>
              </span>
            </button>
          ))}
        </div>
        <div className="flex gap-2 border-t border-border p-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setBefore("0");
              reload();
            }}
          >
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
      <div
        className={cn(
          "min-w-0 flex-1 flex-col",
          selected ? "flex" : "hidden md:flex",
        )}
      >
        {selected ? (
          <div className="flex min-h-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col">
              <Conversation key={selected} id={selected} onChanged={reload} />
            </div>
            {isPreviewChat(selected) && <DemoContextPanel conversationId={selected} />}
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <MessageCircle className="size-8 text-muted-foreground" />
            <h2 className="text-sm font-medium">Select a chat</h2>
            <p className="text-xs text-muted-foreground">
              Real customer messages and delivery status appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** The preview keeps its chats in the browser. Their ids come from the shared demo company, not from a prefix. */
const isPreviewChat = (id: string) => demoConversations.some((item) => item.id === id);

function DemoContextPanel({ conversationId }: { conversationId: string }) {
  const conversation = demoConversations.find((item) => item.id === conversationId);
  if (!conversation) return null;
  const lead = demoLeadRows.find((item) => item.customerId === conversation.contactId);
  const deal = demoDealRows.find((item) => item.customerId === conversation.contactId);
  return (
    <aside className="hidden w-[240px] shrink-0 overflow-y-auto border-l border-border bg-surface lg:flex lg:flex-col">
      <div className="border-b border-border p-4">
        <div className="flex items-start justify-between gap-2"><div><h2 className="text-sm font-semibold">{conversation.name || conversation.phone}</h2><p className="text-xs text-muted-foreground">{conversation.company || "Customer"}</p></div></div>
        <dl className="mt-4 grid gap-2 text-xs"><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Phone</dt><dd>{conversation.phone}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Email</dt><dd>{buyers.find((item) => item.id === conversation.contactId)?.email ?? ""}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Source</dt><dd>WhatsApp</dd></div></dl>
      </div>
      <div className="flex flex-col gap-4 p-4">
        <section><p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-accent">Janus summary</p><p className="text-xs leading-relaxed">{lead?.requirement || "Customer conversation is ready for qualification."}</p><p className="mt-2 text-xs"><span className="font-medium">Next step:</span> confirm requirements and schedule the review.</p></section>
        {deal && <section className="border-t border-border pt-4"><div className="flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Deal</p><span className="text-[10px] text-accent">Open</span></div><p className="mt-2 text-sm font-semibold">{deal.name}</p><p className="mt-1 text-sm font-medium">₹{Number(deal.amount).toLocaleString("en-IN")}</p><div className="mt-2 h-1 bg-surface-2"><div className="h-1 w-2/3 bg-accent" /></div><p className="mt-1 text-[10px] text-muted-foreground">{deal.stage} · closes {deal.expectedCloseAt ? new Date(deal.expectedCloseAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "TBD"}</p></section>}
        <section className="border-t border-border pt-4"><div className="flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Tasks</p><button type="button" className="text-[11px] font-medium text-accent" onClick={() => toast.success("Task created")}>+ Add</button></div><label className="mt-3 flex items-start gap-2 text-xs"><input type="checkbox" /> <span>Send updated proposal<span className="block text-[10px] text-danger">Due today</span></span></label><label className="mt-2 flex items-start gap-2 text-xs"><input type="checkbox" /> <span>Schedule review call<span className="block text-[10px] text-muted-foreground">Tomorrow, 11:00 am</span></span></label><button type="button" className="mt-3 w-full border border-accent-border bg-accent-muted px-2.5 py-2 text-left text-[11px] font-medium text-accent" onClick={() => toast.success("Automated follow-up scheduled", { description: "Janus will create a task after the next customer reply." })}>Schedule automated task<span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">Create a follow-up rule for this conversation</span></button></section>
        <Button size="sm" variant="secondary" asChild><Link href={`/customers/${conversation.contactId}`}>Open customer record</Link></Button>
      </div>
    </aside>
  );
}

function Conversation({
  id,
  onChanged,
}: {
  id: string;
  onChanged: () => void;
}) {
  const previewChat = isPreviewChat(id);
  const liveThread = useApi<WhatsAppConversation>(
    previewChat ? null : `/whatsapp/conversations/${encodeURIComponent(id)}`,
  );
  const [before, setBefore] = useState("0");
  const liveMessages = useApi<WhatsAppMessage[]>(
    previewChat
      ? null
      : `/whatsapp/conversations/${encodeURIComponent(id)}/messages?limit=50&before_id=${before}`,
  );
  const [channel, setChannel] = useState<"all" | "whatsapp" | "email" | "call">("all");
  const [timelineOverride, setTimelineOverride] = useState<DemoTimelineItem[] | undefined>();
  const demoThread = demoConversations.find((conversation) => conversation.id === id);
  const thread = liveThread.data ?? (previewChat ? demoThread : undefined);
  const messageRows =
    liveMessages.data ?? (previewChat ? demoMessagesByConversation[id] ?? [] : undefined);
  const calls = useApi<CustomerCall[]>(
    previewChat || !thread?.contactId ? null : `/contacts/${encodeURIComponent(thread.contactId)}/calls`,
  );
  // Calls with the customer sit in the same timeline as their messages, by time.
  const callRows: DemoTimelineItem[] = (calls.data ?? []).map((call) => ({
    id: `call-${call.id}`,
    channel: "call" as const,
    direction: call.direction === "inbound" ? "inbound" as const : "outbound" as const,
    title: `${callSummary(call)} · ${call.agentName}`,
    body: call.notes || "No notes.",
    createdAt: call.createdAt,
  }));
  const timeline = previewChat
    ? timelineOverride ?? demoConversationTimeline[id] ?? []
    : [...(messageRows?.map((message) => ({
        id: message.id,
        channel: "whatsapp" as const,
        direction: message.direction === "inbound" ? "inbound" as const : "outbound" as const,
        title: message.kind === "template" ? "WhatsApp template" : "WhatsApp message",
        body: message.body,
        status: message.status === "accepted" ? "Accepted by Meta · Template" : sentenceCase(message.status),
        createdAt: message.createdAt,
      })) ?? []), ...callRows].sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
  const reloadThread = liveThread.reload;
  const reloadMessages = liveMessages.reload;
  useEffect(() => {
    if (previewChat) return;
    const timer = setInterval(() => {
      reloadThread();
      if (before === "0") reloadMessages();
    }, 5000);
    return () => clearInterval(timer);
  }, [previewChat, reloadThread, reloadMessages, before]);
  const bottom = useRef<HTMLDivElement>(null);
  const lastId = messageRows?.at(-1)?.id;
  useEffect(() => {
    if (before === "0") bottom.current?.scrollIntoView({ block: "end" });
  }, [lastId, before]);
  return (
    <>
      <div className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3">
        <Button size="icon" variant="ghost" asChild className="md:hidden">
          <Link href="/inbox" aria-label="Back to conversations">
            <ChevronLeft className="size-4" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          {thread ? (
            <div className="flex min-w-0 items-center gap-2.5">
              <CustomerAvatar name={thread.name || thread.phone || "Customer"} color="#4169e1" />
              <div className="min-w-0">
                <Link
                  href={`/customers/${thread.contactId}`}
                  className="block truncate text-sm font-semibold hover:text-accent"
                >
                  {thread.name || thread.phone}
                </Link>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span>{thread.phone}</span>
                  <span aria-hidden="true" className="hidden sm:inline">·</span>
                  <span>{previewChat ? "Conversation" : "Connected channel"}</span>
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[10px]", thread.doNotContact ? "bg-warning-muted text-warning" : thread.whatsappOptIn ? "bg-success-muted text-success" : "bg-surface-2 text-muted-foreground")}>
                    {thread.doNotContact ? "Outbound suppressed" : thread.whatsappOptIn ? "WhatsApp opt-in" : "Opt-in not recorded"}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <p role="status" className="text-sm">
              {liveThread.error || "Loading customer…"}
            </p>
          )}
        </div>
        {thread && !previewChat && liveThread.data ? (
          <CustomerCallButton
            contactId={liveThread.data.contactId}
            name={liveThread.data.name || liveThread.data.phone || "this customer"}
            phone={liveThread.data.phone}
            doNotContact={liveThread.data.doNotContact}
            conversation={liveThread.data}
            onChanged={calls.reload}
          />
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setBefore("0");
            reloadMessages();
            reloadThread();
          }}
        >
          Latest / refresh
        </Button>
      </div>
      <div className="border-b border-border bg-surface px-4 pt-2">
        <div className="mx-auto flex max-w-2xl items-center gap-1" role="tablist" aria-label="Conversation channels">
          {([
            ["all", List, "All activity"],
            ["whatsapp", MessageCircle, "WhatsApp"],
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
      {channel === "all" ? (
        <UnifiedTimeline timeline={timeline} loading={liveMessages.loading} />
      ) : channel === "whatsapp" ? (
        <div className="flex-1 overflow-y-auto bg-surface-2/30 p-4">
          {liveMessages.error && (
            <p role="alert" className="text-sm text-danger">
              {liveMessages.error}
            </p>
          )}
          {liveMessages.loading && (
            <p role="status" className="text-sm">
              Loading messages…
            </p>
          )}
          <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {messageRows?.length === 50 && (
            <Button
              size="sm"
              variant="ghost"
              className="self-center"
              onClick={() => setBefore(messageRows[0].id)}
            >
              Older messages
            </Button>
          )}
          {before !== "0" && (
            <p className="text-center text-xs text-muted-foreground">
              Viewing older messages. Choose Latest to resume live updates.
            </p>
          )}
          {messageRows?.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No messages yet. Send an approved template to follow up on this
              lead.
            </p>
          )}
          {messageRows?.map((m) => (
            <div
              key={m.id}
              className={cn(
                "flex max-w-[90%] flex-col gap-1.5",
                m.direction === "outbound" ? "self-end" : "self-start",
              )}
            >
              <div
                className={cn(
                  "whitespace-pre-wrap break-words rounded-2xl border p-3 text-[13px] leading-relaxed shadow-sm",
                  m.direction === "outbound"
                    ? "self-end border-accent-border bg-accent-muted"
                    : "border-border bg-surface",
                )}
              >
                {m.body}
              </div>
              <p className={cn("text-[10.5px] text-muted-foreground", m.direction === "outbound" ? "self-end" : "self-start")}>
                {formatDateTime(m.createdAt)} ·{" "}
                {m.direction === "inbound"
                  ? "Received"
                  : m.status === "accepted"
                    ? "Accepted by Meta"
                    : m.status.replaceAll("_", " ")}
                {m.kind === "template" ? " · Template" : ""}
              </p>
              {m.errorCode && (
                <p className="max-w-lg text-xs text-danger">
                  {m.status === "unknown"
                    ? "Send result uncertain. It may have reached the customer. Janus will not resend automatically; check delivery before sending again."
                    : `Message failed: ${m.errorCode.replaceAll("_", " ")}. Review before sending a new message.`}
                </p>
              )}
            </div>
          ))}
          <div ref={bottom} />
          </div>
        </div>
      ) : channel === "call" && !previewChat ? (
        // On a real account the Calls tab is the call log; the Call button above makes and logs calls.
        <UnifiedTimeline timeline={callRows} loading={calls.loading && !calls.data} />
      ) : thread ? (
        <ChannelPanel channel={channel} thread={thread} previewChat={previewChat} />
      ) : null}
      {thread && (channel === "all" || channel === "whatsapp") &&
        (previewChat ? (
          <DemoUnifiedComposer
            thread={thread}
            onAdded={(item) =>
              setTimelineOverride((items) => [
                ...(items ?? demoConversationTimeline[id] ?? []),
                item,
              ])
            }
          />
        ) : (
          <Composer
            thread={thread}
            onSent={() => {
              setBefore("0");
              reloadMessages();
              reloadThread();
              onChanged();
            }}
          />
        ))}
    </>
  );
}

function UnifiedTimeline({
  timeline,
  loading,
}: {
  timeline: DemoTimelineItem[];
  loading: boolean;
}) {
  return (
    <div className="flex-1 overflow-y-auto bg-surface-2/30 p-4">
      {loading && <p role="status" className="mx-auto max-w-2xl text-sm">Loading activity…</p>}
      {!loading && timeline.length === 0 && (
        <p className="mx-auto max-w-2xl rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
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
              <div className={cn("min-w-0 rounded-2xl border p-3 shadow-sm", outgoing ? "border-accent-border bg-accent-muted" : internal ? "border-border bg-surface-2" : "border-border bg-surface")}>
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
  previewChat,
}: {
  channel: "email" | "call";
  thread: WhatsAppConversation;
  previewChat: boolean;
}) {
  const [subject, setSubject] = useState("Following up on your Janus enquiry");
  const [body, setBody] = useState(
    "Hi,\n\nThanks for reaching out. I have a few options that should fit your requirement. Would you like to review them together?\n\nRegards,\nJanus team",
  );
  const [outcome, setOutcome] = useState("Connected");
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);
  const email = buyers.find((item) => item.id === thread.contactId)?.email ?? "";
  if (channel === "email") {
    return (
      <form
        className="flex-1 overflow-y-auto p-4"
        onSubmit={(event) => {
          event.preventDefault();
          setSaved(true);
          toast.success(previewChat ? "Email draft saved." : "Email draft prepared. Connect an email provider to send it.");
        }}
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-3 rounded-md border border-border bg-surface p-4">
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
      <div className="mx-auto flex max-w-2xl flex-col gap-4 rounded-md border border-border bg-surface p-4">
        <div className="flex items-center justify-between"><div><h3 className="text-sm font-semibold">Call workspace</h3><p className="text-xs text-muted-foreground">Start a call, capture the outcome and keep the next step on the timeline.</p></div><Phone className="size-4 text-accent" /></div>
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-surface-2 p-3"><span className="text-sm font-medium">{thread.phone}</span><span className="text-xs text-muted-foreground">{previewChat ? "Call handoff" : "Connected phone provider"}</span><Button type="button" size="sm" onClick={() => toast.success(previewChat ? "Demo call started." : "Call handoff opened.")}><Phone className="size-3.5" /> Start call</Button></div>
        <div className="grid gap-1"><Label htmlFor="call-outcome">Call outcome</Label><select id="call-outcome" className={selectClass} value={outcome} onChange={(event) => setOutcome(event.target.value)}><option>Connected</option><option>No answer</option><option>Callback requested</option><option>Qualified</option></select></div>
        <div className="grid gap-1"><Label htmlFor="call-notes">Call notes</Label><Textarea id="call-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Capture the requirement, objections and next step…" className="min-h-24" /></div>
        <Button type="button" className="self-end" onClick={() => toast.success(`${outcome} call note saved${previewChat ? "" : ""}.`)}><CalendarClock className="size-3.5" /> Save call note</Button>
      </div>
    </div>
  );
}

function DemoUnifiedComposer({
  thread,
  onAdded,
}: {
  thread: WhatsAppConversation;
  onAdded: (item: DemoTimelineItem) => void;
}) {
  type WhatsAppMode = "text" | "template";
  type AttachmentType = "image" | "video" | "document" | "audio" | "location" | "contact";
  const [sendChannel, setSendChannel] = useState<"whatsapp" | "email" | "call">("whatsapp");
  const [mode, setMode] = useState<WhatsAppMode>("text");
  const [body, setBody] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [attachmentType, setAttachmentType] = useState<AttachmentType | null>(null);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [selected, setSelected] = useState(demoWhatsAppTemplates[0].name);
  const [parameters, setParameters] = useState([thread.name || "there", thread.company || "your requirement"]);
  const [subject, setSubject] = useState("Following up on your Janus enquiry");
  const [emailBody, setEmailBody] = useState("Hi,\n\nThanks for reaching out. I have a few options that should fit your requirement. Would you like to review them together?\n\nRegards,\nJanus team");
  const [outcome, setOutcome] = useState("Connected");
  const [notes, setNotes] = useState("");
  const template = demoWhatsAppTemplates.find((item) => item.name === selected) ?? demoWhatsAppTemplates[0];
  const preview = template.body.replace(/\{\{(\d+)\}\}/g, (match, number) => parameters[Number(number) - 1] || match);
  const email = buyers.find((item) => item.id === thread.contactId)?.email ?? "";
  const addTimelineItem = (item: Omit<DemoTimelineItem, "id" | "createdAt">) => onAdded({ ...item, id: `demo-timeline-${Date.now()}`, createdAt: new Date().toISOString() });
  if (sendChannel === "whatsapp" && thread.doNotContact) return <p className="border-t border-border bg-amber-50 p-4 text-sm text-amber-800">Outbound communication is suppressed for this customer.</p>;
  return (
    <form className="max-h-[40%] shrink-0 overflow-y-auto border-t border-border bg-surface p-3" onSubmit={(event) => {
      event.preventDefault();
      if (sendChannel === "whatsapp") {
        const messageBody = `${mode === "text" ? body : preview}${attachmentType ? `\n\n${attachmentType} attachment: ${mediaUrl || "attachment"}` : ""}`;
        addTimelineItem({ channel: "whatsapp", direction: "outbound", title: attachmentType ? `WhatsApp ${attachmentType}` : mode === "text" ? "WhatsApp message" : "WhatsApp template sent", body: messageBody, status: "Preview · not sent" });
        toast.success("WhatsApp message added to the conversation preview.");
        setBody("");
        setMediaUrl("");
        setAttachmentType(null);
      } else if (sendChannel === "email") {
        addTimelineItem({ channel: "email", direction: "outbound", title: "Email sent", body: `${subject}\n\n${emailBody}`, status: `To ${email} · Preview · not delivered` });
        toast.success("Email added to the conversation preview.");
      } else {
        addTimelineItem({ channel: "call", direction: "outbound", title: "Call note logged", body: notes || "Call completed with no additional notes.", status: `${outcome} · Demo preview` });
        toast.success("Call note added to the conversation preview.");
        setNotes("");
      }
    }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-xs font-semibold">WhatsApp reply</h3><p className="text-[11px] text-muted-foreground">Send from this chat. WhatsApp is selected by default.</p></div><span className="text-[10px] text-warning">Preview · nothing is sent outside Janus</span></div>
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Label htmlFor="demo-send-channel" className="text-[11px]">Send via</Label><select id="demo-send-channel" className={cn(selectClass, "h-8 w-auto rounded-none text-xs")} value={sendChannel} onChange={(event) => setSendChannel(event.target.value as "whatsapp" | "email" | "call")}><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="call">Call note</option></select></div>{sendChannel === "whatsapp" && <div className="flex items-center gap-2"><Label htmlFor="demo-message-mode" className="text-[11px]">Message type</Label><select id="demo-message-mode" className={cn(selectClass, "h-8 w-auto rounded-none text-xs")} value={mode} onChange={(event) => setMode(event.target.value as WhatsAppMode)}><option value="text">Text reply</option><option value="template">Approved template</option></select></div>}</div>
        {sendChannel === "whatsapp" && <>
          {mode === "text" && <div className="relative flex items-end gap-1.5 rounded-none border border-border bg-surface-2 px-2 py-1.5 shadow-sm"><div className="relative"><Button type="button" size="icon" variant="ghost" className="size-8 shrink-0 rounded-none" aria-label="Add WhatsApp attachment" onClick={() => setAttachmentOpen((open) => !open)}><Paperclip className="size-4" /></Button>{attachmentOpen && <div className="absolute bottom-10 left-0 z-20 grid w-40 gap-1 border border-border bg-surface p-1 shadow-lg">{(["image", "video", "document", "audio", "location", "contact"] as AttachmentType[]).map((type) => <button key={type} type="button" className="px-2 py-1.5 text-left text-xs hover:bg-surface-2" onClick={() => { setAttachmentType(type); setAttachmentOpen(false); }}>{type[0].toUpperCase() + type.slice(1)}</button>)}</div>}</div><Textarea aria-label="WhatsApp reply" placeholder="Write a WhatsApp reply…" value={body} onChange={(event) => setBody(event.target.value)} className="min-h-9 resize-none border-0 bg-transparent px-1 py-2 shadow-none focus-visible:ring-0" required /><Button type="button" size="icon" variant="ghost" className="size-8 shrink-0 rounded-none" aria-label="Add emoji" onClick={() => setBody((value) => `${value}${value ? " " : ""}🙂`)}><Smile className="size-4" /></Button><Button type="submit" size="icon" className="size-8 shrink-0 rounded-none" aria-label="Send WhatsApp message"><Send className="size-3.5" /></Button></div>}
          {mode === "template" && <><select aria-label="Approved template" className={selectClass} value={selected} onChange={(event) => setSelected(event.target.value)}>{demoWhatsAppTemplates.map((item) => <option key={item.name} value={item.name}>{item.name} · {item.language}</option>)}</select>{parameters.map((value, index) => <Input key={index} aria-label={`Template parameter ${index + 1}`} placeholder={`Parameter ${index + 1}`} value={value} onChange={(event) => setParameters((items) => items.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} required />)}<p className="whitespace-pre-wrap rounded-md border border-border bg-surface-2 p-2 text-xs">{preview}</p></>}
          {attachmentType && <div className="flex items-center gap-2 border border-border bg-surface-2 p-2"><span className="text-xs font-medium">{attachmentType[0].toUpperCase() + attachmentType.slice(1)} attachment</span><Input aria-label={`${attachmentType} attachment`} className="h-8 text-xs" placeholder={attachmentType === "location" ? "Paste a map link or location" : attachmentType === "contact" ? "Enter a contact name or phone" : `Paste ${attachmentType} URL`} value={mediaUrl} onChange={(event) => setMediaUrl(event.target.value)} required /></div>}
        </>}
        {sendChannel === "email" && <><div className="grid gap-1"><Label htmlFor="demo-email-to" className="text-[11px]">To</Label><Input id="demo-email-to" className="h-8 text-xs" value={email} readOnly /></div><div className="grid gap-1"><Label htmlFor="demo-email-subject" className="text-[11px]">Subject</Label><Input id="demo-email-subject" className="h-8 text-xs" value={subject} onChange={(event) => setSubject(event.target.value)} /></div><Textarea aria-label="Email message" value={emailBody} onChange={(event) => setEmailBody(event.target.value)} className="min-h-20" /></>}
        {sendChannel === "call" && <><div className="flex flex-wrap items-center gap-2 rounded-md bg-surface-2 p-2"><span className="text-xs font-medium">{thread.phone}</span><span className="text-[11px] text-muted-foreground">Log a call without leaving the chat</span></div><select aria-label="Call outcome" className={selectClass} value={outcome} onChange={(event) => setOutcome(event.target.value)}><option>Connected</option><option>No answer</option><option>Callback requested</option><option>Qualified</option></select><Textarea aria-label="Call notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Capture the requirement and next step…" className="min-h-14" /></>}
        {!(sendChannel === "whatsapp" && mode === "text") && <Button type="submit" size="sm" className="self-end">{sendChannel === "whatsapp" ? <Send className="size-3.5" /> : sendChannel === "email" ? <Mail className="size-3.5" /> : <CalendarClock className="size-3.5" />} {sendChannel === "whatsapp" ? "Add WhatsApp message" : sendChannel === "email" ? "Add email" : "Save call note"}</Button>}
      </div>
    </form>
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
  const allowed =
    can(session, "leads:write") &&
    !!session.user.email_verified_at;
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  const canReply =
    !!thread.replyWindowEndsAt &&
    new Date(thread.replyWindowEndsAt).getTime() > clock;
  const [mode, setMode] = useState<"text" | "template">(
    canReply ? "text" : "template",
  );
  const [body, setBody] = useState("");
  const [selected, setSelected] = useState("");
  const [parameters, setParameters] = useState<string[]>([]);
  const [optIn, setOptIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  const templates = useApi<WhatsAppTemplate[]>(
    allowed && mode === "template" ? "/whatsapp/templates" : null,
  );
  const template = templates.data?.find(
    (t) => `${t.name}:${t.language}` === selected,
  );
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
      <p className="border-t border-border bg-amber-50 p-4 text-sm text-amber-800">
        Outbound communication is suppressed for this customer. Remove the suppression from the customer record before sending.
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
          setParameters(
            template ? Array(template.parameterCount).fill("") : [],
          );
          setOptIn(false);
          attempt.current = null;
          onSent();
          toast.success("Message queued. Delivery status will update here.");
        } catch (e) {
          setError(message(e));
          onSent();
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Label htmlFor="message-mode">Message type</Label>
          <select
            id="message-mode"
            className={cn(selectClass, "w-auto")}
            value={mode}
            disabled={busy}
            onChange={(e) => setMode(e.target.value as "text" | "template")}
          >
            <option value="text" disabled={!canReply}>
              Text reply
            </option>
            <option value="template">Approved template</option>
          </select>
          <span className="text-xs text-muted-foreground">
            {canReply
              ? `Reply window until ${formatDateTime(thread.replyWindowEndsAt!)}`
              : "A template is required until the customer replies."}
          </span>
        </div>
        {mode === "text" ? (
          <Textarea
            aria-label="Reply to customer"
            placeholder="Write your reply…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={4096}
            required
            disabled={busy || !canReply}
            className="min-h-20"
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
                  const t = templates.data?.find(
                    (t) => `${t.name}:${t.language}` === e.target.value,
                  );
                  setParameters(Array(t?.parameterCount || 0).fill(""));
                }}
              >
                <option value="">Choose an approved template</option>
                {templates.data?.map((t) => (
                  <option
                    key={`${t.name}:${t.language}`}
                    value={`${t.name}:${t.language}`}
                  >
                    {t.name} · {t.language}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={templates.reload}
              >
                Refresh
              </Button>
            </div>
            {templates.error && (
              <p role="alert" className="text-xs text-danger">
                {templates.error}
              </p>
            )}
            {templates.loading && (
              <p role="status" className="text-xs">
                Loading approved templates…
              </p>
            )}
            {templates.data?.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No supported approved text templates found. Create a text-only
                template with positional body parameters in WhatsApp Manager,
                then refresh. Media, named parameters and buttons are not
                supported yet.
              </p>
            )}
            {parameters.map((value, index) => (
              <div key={index} className="flex flex-col gap-1">
                <Label htmlFor={`parameter-${index}`}>
                  Parameter {index + 1}
                </Label>
                <Input
                  id={`parameter-${index}`}
                  value={value}
                  required
                  maxLength={1024}
                  disabled={busy}
                  onChange={(e) =>
                    setParameters((v) =>
                      v.map((p, i) => (i === index ? e.target.value : p)),
                    )
                  }
                />
              </div>
            ))}
            {preview && (
              <p className="whitespace-pre-wrap break-words rounded-md border border-border bg-surface-2 p-3 text-sm">
                {preview}
              </p>
            )}
            {!thread.whatsappOptIn && <p className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800">A stored WhatsApp opt-in is required before sending a template. <Link href={`/customers/${thread.contactId}`} className="font-medium underline">Open customer record</Link> to record it.</p>}
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={optIn}
                onChange={(e) => setOptIn(e.target.checked)}
                required
                disabled={busy || !thread.whatsappOptIn}
              />
              This customer agreed to receive WhatsApp messages from our
              business.
            </label>
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error} Refresh the conversation before retrying; retrying the same
            draft uses the same request key.
          </p>
        )}
        <Button
          className="self-end"
          disabled={
            busy ||
            (mode === "text"
              ? !canReply || !body.trim()
              : !thread.whatsappOptIn || !template || !optIn || parameters.some((p) => !p.trim()))
          }
        >
          <Send className="size-3.5" />
          {busy
            ? "Queueing…"
            : mode === "template"
              ? "Send template"
              : "Send reply"}
        </Button>
      </div>
    </form>
  );
}

/** "delivered" or "not_sent" as "Delivered" or "Not sent". */
function sentenceCase(status: string) {
  const words = status.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
