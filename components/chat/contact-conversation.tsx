"use client";

import { MessageCircle } from "lucide-react";
import { useSession } from "@/components/auth/session-provider";
import { useApi } from "@/lib/api/use-api";
import type { WhatsAppConversation } from "@/lib/api/types";
import { demoMode } from "@/lib/demo-mode";
import { hasPermission } from "@/lib/demo-persona";
import { useUIStore } from "@/lib/stores/ui-store";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";

/**
 * The WhatsApp conversation with this lead's or deal's contact, shown on the page itself.
 * "Open in chat" opens it in the Chat panel, so the agent does not leave the record.
 */
export function ContactConversation({ contactId }: { contactId: string }) {
  const session = useSession();
  const openChat = useUIStore((state) => state.openChat);
  const conversation = useApi<WhatsAppConversation | null>(
    demoMode || !hasPermission(session.permissions, "leads:read_own")
      ? null
      : `/whatsapp/contacts/${encodeURIComponent(contactId)}/conversation`,
  );
  if (demoMode || !hasPermission(session.permissions, "leads:read_own")) return null;

  const row = conversation.data;
  const windowOpen = Boolean(row?.replyWindowEndsAt) && new Date(row!.replyWindowEndsAt as string) > new Date();

  return (
    <section aria-label="WhatsApp conversation" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex min-w-0 items-start gap-3">
        <MessageCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">WhatsApp conversation</h2>
          {conversation.loading && !row ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : conversation.error ? (
            <p className="text-xs text-destructive">{conversation.error}</p>
          ) : !row ? (
            <p className="text-xs text-muted-foreground">No WhatsApp conversation with this contact yet.</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Last message {formatDateTime(row.lastMessageAt)} ·{" "}
              {windowOpen ? "free-text replies open" : "replies need a template"}
            </p>
          )}
        </div>
      </div>
      {row ? (
        <Button size="sm" variant="secondary" onClick={() => openChat(row.id)}>
          Open in chat
        </Button>
      ) : null}
    </section>
  );
}
