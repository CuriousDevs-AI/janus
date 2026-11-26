"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Building2,
  ChevronDown,
  ExternalLink,
  Loader2,
  Phone,
  Plus,
  Send,
  StickyNote,
  Tag,
  User2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import type { ConversationNote, ConversationTag, WhatsAppConversation } from "@/lib/api/types";
import { useSession } from "@/components/auth/session-provider";
import { can } from "@/lib/permissions";
import { CustomerAvatar } from "@/components/shared/customer-avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatDateTime } from "@/lib/utils";

const statusOptions = [
  { value: "open", label: "Open", color: "bg-success" },
  { value: "pending", label: "Pending", color: "bg-warning" },
  { value: "resolved", label: "Resolved", color: "bg-muted-foreground" },
  { value: "closed", label: "Closed", color: "bg-muted-foreground/50" },
] as const;

const priorityOptions = [
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
] as const;

export function InfoPanel({
  thread,
  onChanged,
}: {
  thread: WhatsAppConversation;
  onChanged: () => void;
}) {
  const session = useSession();
  const canWrite = can(session, "leads:write");
  const members = useApi<{ user_id: string | number; name: string; status: string }[]>(
    canWrite ? "/members/directory" : null,
  );
  const notes = useApi<ConversationNote[]>(
    `/whatsapp/conversations/${thread.id}/notes`,
  );
  const allTags = useApi<ConversationTag[]>("/whatsapp/tags");
  const [noteBody, setNoteBody] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [tagName, setTagName] = useState("");
  const [showTagInput, setShowTagInput] = useState(false);

  const statusDot = statusOptions.find((s) => s.value === thread.status) ?? statusOptions[0];

  async function updateStatus(status: string) {
    try {
      await api(`/whatsapp/conversations/${thread.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      onChanged();
    } catch (e) {
      toast.error(message(e));
    }
  }

  async function updatePriority(priority: string) {
    try {
      await api(`/whatsapp/conversations/${thread.id}/priority`, {
        method: "PATCH",
        body: JSON.stringify({ priority }),
      });
      onChanged();
    } catch (e) {
      toast.error(message(e));
    }
  }

  async function assign(userId: string | null) {
    try {
      await api(`/whatsapp/conversations/${thread.id}/assign`, {
        method: "PATCH",
        body: JSON.stringify({ userId: userId ? Number(userId) : null }),
      });
      onChanged();
      toast.success(userId ? "Conversation assigned" : "Conversation unassigned");
    } catch (e) {
      toast.error(message(e));
    }
  }

  async function addNote() {
    if (!noteBody.trim()) return;
    setNoteBusy(true);
    try {
      await api(`/whatsapp/conversations/${thread.id}/notes`, {
        method: "POST",
        body: JSON.stringify({ body: noteBody.trim() }),
      });
      setNoteBody("");
      notes.reload();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setNoteBusy(false);
    }
  }

  async function addTag(name: string, color?: string) {
    try {
      await api(`/whatsapp/conversations/${thread.id}/tags`, {
        method: "POST",
        body: JSON.stringify({ name, color: color ?? "#6b7280" }),
      });
      onChanged();
      allTags.reload();
    } catch (e) {
      toast.error(message(e));
    }
  }

  async function removeTag(tagId: string) {
    try {
      await api(`/whatsapp/conversations/${thread.id}/tags/${tagId}`, {
        method: "DELETE",
      });
      onChanged();
    } catch (e) {
      toast.error(message(e));
    }
  }

  const availableTags = (allTags.data ?? []).filter(
    (t) => !thread.tags?.some((ct) => ct.id === t.id),
  );

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Customer card */}
      <div className="border-b border-border p-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <CustomerAvatar
            name={thread.name || thread.phone || "Customer"}
            color="#4169e1"
            size="lg"
          />
          <div>
            <Link
              href={`/customers/${thread.contactId}`}
              className="text-sm font-semibold hover:text-accent"
            >
              {thread.name || thread.phone}
            </Link>
            {thread.company && (
              <p className="mt-0.5 flex items-center justify-center gap-1 text-xs text-muted-foreground">
                <Building2 className="size-3" />
                {thread.company}
              </p>
            )}
            {thread.phone && (
              <p className="mt-0.5 flex items-center justify-center gap-1 text-xs text-muted-foreground">
                <Phone className="size-3" />
                {thread.phone}
              </p>
            )}
          </div>
          <Link
            href={`/customers/${thread.contactId}`}
            className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
          >
            View full profile <ExternalLink className="size-2.5" />
          </Link>
        </div>
      </div>

      {/* Status & Priority */}
      <div className="border-b border-border p-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Status</span>
            {canWrite ? (
              <div className="relative">
                <select
                  value={thread.status ?? "open"}
                  onChange={(e) => updateStatus(e.target.value)}
                  className="appearance-none bg-transparent pr-5 text-xs font-medium focus:outline-none"
                >
                  {statusOptions.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-0 top-0.5 size-3 text-muted-foreground" />
              </div>
            ) : (
              <span className="flex items-center gap-1.5 text-xs font-medium">
                <span className={cn("size-2 rounded-full", statusDot.color)} />
                {statusDot.label}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Priority</span>
            {canWrite ? (
              <div className="relative">
                <select
                  value={thread.priority ?? "normal"}
                  onChange={(e) => updatePriority(e.target.value)}
                  className="appearance-none bg-transparent pr-5 text-xs font-medium focus:outline-none"
                >
                  {priorityOptions.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-0 top-0.5 size-3 text-muted-foreground" />
              </div>
            ) : (
              <span className="text-xs font-medium">{thread.priority ?? "Normal"}</span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Consent</span>
            <span className={cn(
              "px-1.5 py-0.5 text-[10px] font-medium",
              thread.doNotContact
                ? "bg-warning-muted text-warning"
                : thread.whatsappOptIn
                  ? "bg-success-muted text-success"
                  : "bg-surface-2 text-muted-foreground",
            )}>
              {thread.doNotContact ? "DNC" : thread.whatsappOptIn ? "Opted in" : "No opt-in"}
            </span>
          </div>
        </div>
      </div>

      {/* Assignment */}
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Assigned to</span>
          {canWrite && members.data ? (
            <div className="relative">
              <select
                value={thread.assignedUserId ?? ""}
                onChange={(e) => assign(e.target.value || null)}
                className="max-w-[140px] appearance-none truncate bg-transparent pr-5 text-xs font-medium focus:outline-none"
              >
                <option value="">Unassigned</option>
                {members.data.filter((m) => m.status === "active").map((m) => (
                  <option key={String(m.user_id)} value={String(m.user_id)}>
                    {m.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-0 top-0.5 size-3 text-muted-foreground" />
            </div>
          ) : (
            <span className="flex items-center gap-1.5 text-xs">
              <User2 className="size-3 text-muted-foreground" />
              {thread.assignedUserName || thread.ownerName || "Unassigned"}
            </span>
          )}
        </div>
      </div>

      {/* Tags */}
      <div className="border-b border-border p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Tags</span>
          {canWrite && (
            <button type="button" onClick={() => setShowTagInput((v) => !v)} className="text-muted-foreground hover:text-foreground">
              <Plus className="size-3" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {thread.tags?.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 bg-surface-2 px-2 py-0.5 text-[11px] font-medium"
              style={{ borderLeft: `3px solid ${tag.color}` }}
            >
              {tag.name}
              {canWrite && (
                <button type="button" onClick={() => removeTag(tag.id)} className="text-muted-foreground hover:text-foreground">
                  <X className="size-2.5" />
                </button>
              )}
            </span>
          ))}
          {(!thread.tags || thread.tags.length === 0) && !showTagInput && (
            <span className="text-[11px] text-muted-foreground">No tags</span>
          )}
        </div>
        {showTagInput && (
          <div className="mt-2 flex flex-col gap-1.5">
            {availableTags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {availableTags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => addTag(tag.name, tag.color)}
                    className="bg-surface-2 px-2 py-0.5 text-[11px] hover:bg-accent-muted"
                    style={{ borderLeft: `3px solid ${tag.color}` }}
                  >
                    + {tag.name}
                  </button>
                ))}
              </div>
            )}
            <form
              className="flex gap-1"
              onSubmit={(e) => { e.preventDefault(); if (tagName.trim()) { addTag(tagName.trim()); setTagName(""); setShowTagInput(false); } }}
            >
              <input
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
                placeholder="New tag…"
                className="min-w-0 flex-1 bg-surface-2 px-2 py-1 text-xs focus:outline-none"
                maxLength={60}
              />
              <Button type="submit" size="sm" variant="ghost" disabled={!tagName.trim()}>
                <Tag className="size-3" />
              </Button>
            </form>
          </div>
        )}
      </div>

      {/* Internal notes */}
      <div className="flex-1 p-4">
        <div className="mb-2 flex items-center gap-1.5">
          <StickyNote className="size-3 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Internal notes</span>
        </div>
        <div className="flex flex-col gap-2">
          {canWrite && (
            <form
              onSubmit={(e) => { e.preventDefault(); addNote(); }}
              className="flex flex-col gap-1.5"
            >
              <Textarea
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                placeholder="Add a note visible only to your team…"
                className="min-h-16 text-xs"
                maxLength={4000}
                disabled={noteBusy}
              />
              <Button
                type="submit"
                size="sm"
                variant="outline"
                className="self-end"
                disabled={noteBusy || !noteBody.trim()}
              >
                {noteBusy ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
                Add note
              </Button>
            </form>
          )}
          {notes.loading && !notes.data && (
            <p className="text-xs text-muted-foreground">Loading notes…</p>
          )}
          {notes.data?.map((note) => (
            <div key={note.id} className="border-l-2 border-warning/40 bg-warning/5 px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium">{note.userName}</span>
                <time className="text-[10px] text-muted-foreground">
                  {formatDateTime(note.createdAt)}
                </time>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-xs">{note.body}</p>
            </div>
          ))}
          {notes.data?.length === 0 && (
            <p className="text-[11px] text-muted-foreground">
              No notes yet. Add one to share context with your team.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
