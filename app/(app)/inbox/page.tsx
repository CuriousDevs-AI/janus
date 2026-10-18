"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { MessageCircle, RefreshCw, Send, ChevronLeft } from "lucide-react";
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
  const list = useApi<WhatsAppConversation[]>(
    `/whatsapp/conversations?limit=50&before_id=${before}`,
  );
  const reload = list.reload;
  useEffect(() => {
    const timer = setInterval(reload, 5000);
    return () => clearInterval(timer);
  }, [reload]);
  const rows =
    list.data?.filter((c) =>
      [c.name, c.phone, c.company].some((v) =>
        v?.toLowerCase().includes(query.toLowerCase()),
      ),
    ) || [];
  return (
    <div className="flex h-full min-h-0">
      <aside
        className={cn(
          "h-full w-full flex-col border-r border-border bg-surface md:flex md:w-[320px] md:shrink-0",
          selected ? "hidden" : "flex",
        )}
      >
        <div className="flex flex-col gap-3 border-b border-border p-3">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-semibold">Chats</h1>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Refresh inbox"
              onClick={reload}
            >
              <RefreshCw className="size-3.5" />
            </Button>
          </div>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search chats…"
          />
          <p className="text-xs text-muted-foreground">
            Messages from connected channels · refreshes every 5 seconds
          </p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {list.error && (
            <p role="alert" className="p-3 text-sm text-danger">
              {list.error}
            </p>
          )}
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
          <Conversation key={selected} id={selected} onChanged={reload} />
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
function Conversation({
  id,
  onChanged,
}: {
  id: string;
  onChanged: () => void;
}) {
  const thread = useApi<WhatsAppConversation>(
    `/whatsapp/conversations/${encodeURIComponent(id)}`,
  );
  const [before, setBefore] = useState("0");
  const messages = useApi<WhatsAppMessage[]>(
    `/whatsapp/conversations/${encodeURIComponent(id)}/messages?limit=50&before_id=${before}`,
  );
  const reloadThread = thread.reload;
  const reloadMessages = messages.reload;
  useEffect(() => {
    const timer = setInterval(() => {
      reloadThread();
      if (before === "0") reloadMessages();
    }, 5000);
    return () => clearInterval(timer);
  }, [reloadThread, reloadMessages, before]);
  const bottom = useRef<HTMLDivElement>(null);
  const lastId = messages.data?.at(-1)?.id;
  useEffect(() => {
    if (before === "0") bottom.current?.scrollIntoView({ block: "end" });
  }, [lastId, before]);
  return (
    <>
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Button size="icon" variant="ghost" asChild className="md:hidden">
          <Link href="/inbox" aria-label="Back to conversations">
            <ChevronLeft className="size-4" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          {thread.data ? (
            <>
              <Link
                href={`/customers/${thread.data.contactId}`}
                className="text-sm font-semibold hover:text-accent"
              >
                {thread.data.name || thread.data.phone}
              </Link>
              <p className="text-xs text-muted-foreground">
                {thread.data.phone} · Connected channel
              </p>
            </>
          ) : (
            <p role="status" className="text-sm">
              {thread.error || "Loading customer…"}
            </p>
          )}
        </div>
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
      <div className="flex-1 overflow-y-auto p-4">
        {messages.error && (
          <p role="alert" className="text-sm text-danger">
            {messages.error}
          </p>
        )}
        {messages.loading && (
          <p role="status" className="text-sm">
            Loading messages…
          </p>
        )}
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {messages.data?.length === 50 && (
            <Button
              size="sm"
              variant="ghost"
              className="self-center"
              onClick={() => setBefore(messages.data![0].id)}
            >
              Older messages
            </Button>
          )}
          {before !== "0" && (
            <p className="text-center text-xs text-muted-foreground">
              Viewing older messages. Choose Latest to resume live updates.
            </p>
          )}
          {messages.data?.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No messages yet. Send an approved template to follow up on this
              lead.
            </p>
          )}
          {messages.data?.map((m) => (
            <div
              key={m.id}
              className={cn(
                "flex max-w-[90%] flex-col gap-1.5",
                m.direction === "outbound" ? "self-end" : "self-start",
              )}
            >
              <div
                className={cn(
                  "whitespace-pre-wrap break-words rounded-md border p-3 text-[13px] leading-relaxed",
                  m.direction === "outbound"
                    ? "border-accent-border bg-accent-muted"
                    : "border-border bg-surface-2",
                )}
              >
                {m.body}
              </div>
              <p className="text-[10.5px] text-muted-foreground">
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
      {thread.data && (
        <Composer
          thread={thread.data}
          onSent={() => {
            setBefore("0");
            reloadMessages();
            reloadThread();
            onChanged();
          }}
        />
      )}
    </>
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
    session.permissions.includes("leads:write") &&
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
  return (
    <form
      className="max-h-[60%] shrink-0 overflow-y-auto border-t border-border p-3"
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
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={optIn}
                onChange={(e) => setOptIn(e.target.checked)}
                required
                disabled={busy}
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
              : !template || !optIn || parameters.some((p) => !p.trim()))
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
