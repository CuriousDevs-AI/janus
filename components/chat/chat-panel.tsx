"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/components/auth/session-provider";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import type { WhatsAppConversation, WhatsAppMessage } from "@/lib/api/types";
import { demoMode } from "@/lib/demo-mode";
import { hasPermission } from "@/lib/demo-persona";
import { useUIStore } from "@/lib/stores/ui-store";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatDateTime } from "@/lib/utils";

/**
 * Chat from any page: a side panel with the company's WhatsApp conversations, so an agent can
 * reply without leaving the workspace they are in. The full inbox (templates, email and calls)
 * stays on Chats.
 */
export function ChatPanel() {
  const session = useSession();
  const open = useUIStore((s) => s.chatOpen);
  const setOpen = useUIStore((s) => s.setChatOpen);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const chatTarget = useUIStore((state) => state.chatTarget);
  const setChatTarget = useUIStore((state) => state.setChatTarget);
  // A conversation opened from a lead or deal wins over the list choice.
  const activeId = chatTarget ?? selectedId;
  const canChat = hasPermission(session.permissions, "leads:read_own");
  const live = open && canChat && !demoMode;

  const list = useApi<WhatsAppConversation[]>(
    live ? "/whatsapp/conversations?limit=50&before_id=0" : null,
  );
  const thread = useApi<WhatsAppMessage[]>(
    live && activeId
      ? `/whatsapp/conversations/${encodeURIComponent(activeId)}/messages?limit=50&before_id=0`
      : null,
  );
  const { reload: reloadList } = list;
  const { reload: reloadThread } = thread;
  React.useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => {
      reloadList();
      reloadThread();
    }, 5000);
    return () => clearInterval(timer);
  }, [live, reloadList, reloadThread]);

  if (!canChat) return null;

  const conversation = list.data?.find((c) => c.id === activeId);

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        aria-label="Open chat"
        onClick={() => setOpen(true)}
      >
        <MessageCircle className="size-3.5" />
        <span className="hidden sm:inline">Chat</span>
      </Button>
      <Sheet
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (!value) {
            setSelectedId(null);
            setChatTarget(null);
          }
        }}
      >
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border p-4 pr-12">
            <div className="flex items-center gap-2">
              {activeId ? (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Back to conversations"
                  onClick={() => {
                    setSelectedId(null);
                    setChatTarget(null);
                  }}
                >
                  <ArrowLeft className="size-4" />
                </Button>
              ) : null}
              <SheetTitle>{conversation?.name ?? "Chat"}</SheetTitle>
            </div>
            <SheetDescription>
              {conversation
                ? conversation.phone ?? "No phone number"
                : "WhatsApp conversations for your company"}
            </SheetDescription>
          </SheetHeader>

          {demoMode ? (
            <p className="p-4 text-sm text-muted-foreground">
              Chat sends on real accounts. In demo mode, open Chats to see the sample conversations.
            </p>
          ) : activeId ? (
            <ThreadView
              conversation={conversation}
              messages={thread.data}
              error={thread.error}
              onSent={() => {
                thread.reload();
                list.reload();
              }}
              id={activeId}
            />
          ) : (
            <ConversationList
              rows={list.data}
              error={list.error}
              loading={list.loading}
              onOpen={(id) => {
                setSelectedId(id);
                setChatTarget(null);
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function ConversationList({
  rows,
  error,
  loading,
  onOpen,
}: {
  rows: WhatsAppConversation[] | undefined;
  error: string | undefined;
  loading: boolean;
  onOpen: (id: string) => void;
}) {
  if (error) return <p className="p-4 text-sm text-destructive">{error}</p>;
  if (loading && !rows) return <p className="p-4 text-sm text-muted-foreground">Loading chats…</p>;
  if (!rows?.length)
    return (
      <p className="p-4 text-sm text-muted-foreground">
        No conversations yet. They appear here when a lead messages on WhatsApp.
      </p>
    );
  return (
    <ul className="flex-1 overflow-y-auto">
      {rows.map((row) => (
        <li key={row.id}>
          <button
            type="button"
            onClick={() => onOpen(row.id)}
            className="flex w-full flex-col gap-0.5 border-b border-border px-4 py-3 text-left hover:bg-surface-2"
          >
            <span className="text-sm font-medium">{row.name}</span>
            <span className="text-xs text-muted-foreground">
              {[row.company, formatDateTime(row.lastMessageAt)].filter(Boolean).join(" · ")}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ThreadView({
  id,
  conversation,
  messages,
  error,
  onSent,
}: {
  id: string;
  conversation: WhatsAppConversation | undefined;
  messages: WhatsAppMessage[] | undefined;
  error: string | undefined;
  onSent: () => void;
}) {
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [sendError, setSendError] = React.useState("");
  const windowOpen =
    Boolean(conversation?.replyWindowEndsAt) &&
    new Date(conversation!.replyWindowEndsAt as string) > new Date();
  // The server returns this thread oldest first, which is how a chat reads.
  const ordered = messages ?? [];

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    setSendError("");
    try {
      await api(`/whatsapp/conversations/${encodeURIComponent(id)}/messages`, {
        method: "POST",
        body: JSON.stringify({ kind: "text", body: text }),
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      setBody("");
      toast.success("Message queued. Delivery status will update here.");
      onSent();
    } catch (e) {
      setSendError(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {ordered.map((item) => (
          <div
            key={item.id}
            className={cn(
              "max-w-[85%] rounded-md px-3 py-2 text-sm",
              item.direction === "outbound"
                ? "ml-auto bg-accent-muted text-foreground"
                : "bg-surface-2 text-foreground",
            )}
          >
            <p className="whitespace-pre-wrap break-words">{item.body}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {formatDateTime(item.createdAt)} · {deliveryLabel(item.status)}
            </p>
          </div>
        ))}
      </div>
      <form onSubmit={send} className="space-y-2 border-t border-border p-3">
        {!windowOpen ? (
          <p className="text-xs text-muted-foreground">
            WhatsApp only allows free text within 24 hours of the customer&apos;s last message. To
            reach them after that, send a template from{" "}
            <Link href={`/inbox?c=${encodeURIComponent(id)}`} className="underline">
              Chats
            </Link>
            .
          </p>
        ) : null}
        {sendError ? <p className="text-xs text-destructive">{sendError}</p> : null}
        <div className="flex items-end gap-2">
          <Textarea
            aria-label="Type a reply"
            placeholder="Type a reply"
            rows={2}
            value={body}
            disabled={busy}
            onChange={(e) => setBody(e.target.value)}
          />
          <Button type="submit" size="icon" disabled={busy || !body.trim()} aria-label="Send">
            <Send className="size-4" />
          </Button>
        </div>
        <Link
          href={`/inbox?c=${encodeURIComponent(id)}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="size-3" /> Open in Chats
        </Link>
      </form>
    </>
  );
}

/** Plain words for a message's delivery status. */
function deliveryLabel(status: string) {
  const labels: Record<string, string> = {
    queued: "Sending",
    sent: "Sent",
    delivered: "Delivered",
    read: "Read",
    received: "Received",
    failed: "Not delivered",
  };
  return labels[status] ?? status;
}
