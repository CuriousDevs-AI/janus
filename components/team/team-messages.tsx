"use client";

import * as React from "react";
import { MessageSquare, MoreHorizontal, Pencil, SmilePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, message as errorText } from "@/lib/api/client";
import { cn, initials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { TEAM_EMOJI, type TeamMessage } from "@/components/team/types";

const COLORS = ["#2563eb", "#059669", "#d97706", "#7c3aed", "#db2777", "#0891b2"];

function colorFor(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
}

/** Messages come newest first from the server; the screen reads them oldest first, with a day line. */
export function MessageList({
  messages,
  emptyText,
  onOpenThread,
  onChanged,
  activeThreadId,
}: {
  messages: TeamMessage[];
  emptyText: string;
  onOpenThread: (id: string) => void;
  onChanged: () => void;
  activeThreadId?: string | null;
}) {
  const ordered = [...messages].reverse();
  if (ordered.length === 0) {
    return <p className="px-6 py-10 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }
  const rows: React.ReactNode[] = [];
  let lastDay = "";
  let previousAuthor = "";
  for (const item of ordered) {
    const day = dayLabel(item.createdAt);
    if (day !== lastDay) {
      rows.push(
        <div key={`day-${item.id}`} className="my-4 flex items-center gap-3 px-6" role="separator">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs font-medium text-muted-foreground">{day}</span>
          <span className="h-px flex-1 bg-border" />
        </div>,
      );
      lastDay = day;
      previousAuthor = "";
    }
    const grouped = previousAuthor === item.author.name;
    previousAuthor = item.author.name;
    rows.push(
      <MessageRow
        key={item.id}
        item={item}
        grouped={grouped}
        active={activeThreadId === item.id}
        onOpenThread={onOpenThread}
        onChanged={onChanged}
      />,
    );
  }
  return <div className="pb-4">{rows}</div>;
}

function MessageRow({
  item,
  grouped,
  active,
  onOpenThread,
  onChanged,
}: {
  item: TeamMessage;
  grouped: boolean;
  active: boolean;
  onOpenThread: (id: string) => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(item.body ?? "");
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function react(emoji: string, mine: boolean) {
    try {
      await api(`/team/messages/${item.id}/reactions${mine ? "/remove" : ""}`, {
        method: "POST",
        body: JSON.stringify({ emoji }),
      });
      onChanged();
    } catch (error) {
      toast.error(errorText(error));
    }
  }

  async function save() {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      await api(`/team/messages/${item.id}`, { method: "PATCH", body: JSON.stringify({ body }) });
      setEditing(false);
      onChanged();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api(`/team/messages/${item.id}`, { method: "DELETE" });
      setConfirming(false);
      onChanged();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn(
        "group relative flex gap-3 px-6 py-1.5 hover:bg-surface-2/60",
        active && "bg-accent-muted/40",
        grouped ? "pt-0.5" : "pt-3",
      )}
    >
      <div className="w-9 shrink-0">
        {grouped ? null : (
          <Avatar className="size-9">
            <AvatarFallback style={{ backgroundColor: colorFor(item.author.name) }} className="text-xs text-white">
              {initials(item.author.name)}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {grouped ? null : (
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-foreground">{item.mine ? "You" : item.author.name}</span>
            <time className="text-xs text-muted-foreground" dateTime={item.createdAt}>
              {timeOf(item.createdAt)}
            </time>
          </div>
        )}
        {item.deleted ? (
          <p className="text-sm italic text-muted-foreground">This message was deleted.</p>
        ) : editing ? (
          <div className="mt-1 space-y-2">
            <Textarea
              aria-label="Edit message"
              value={draft}
              rows={2}
              disabled={busy}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void save();
                }
                if (event.key === "Escape") setEditing(false);
              }}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void save()} disabled={busy || !draft.trim()}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm text-foreground">
            {item.body}
            {item.editedAt ? <span className="ml-1 text-[11px] text-muted-foreground">(edited)</span> : null}
          </p>
        )}

        {!item.deleted && item.reactions.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {item.reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                type="button"
                aria-pressed={reaction.mine}
                aria-label={`${reaction.emoji} ${reaction.count}`}
                onClick={() => void react(reaction.emoji, reaction.mine)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
                  reaction.mine
                    ? "border-accent-border bg-accent-muted text-accent"
                    : "border-border bg-surface hover:bg-surface-2",
                )}
              >
                <span>{reaction.emoji}</span>
                <span className="tabular-nums">{reaction.count}</span>
              </button>
            ))}
          </div>
        ) : null}

        {item.replyCount > 0 ? (
          <button
            type="button"
            onClick={() => onOpenThread(item.id)}
            className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
          >
            <MessageSquare className="size-3.5" />
            {item.replyCount} {item.replyCount === 1 ? "reply" : "replies"}
          </button>
        ) : null}
      </div>

      {!item.deleted && !editing ? (
        <div className="absolute right-4 -top-3 flex items-center gap-0.5 rounded-md border border-border bg-surface p-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {TEAM_EMOJI.slice(0, 3).map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={`React with ${emoji}`}
              onClick={() => void react(emoji, item.reactions.some((r) => r.emoji === emoji && r.mine))}
              className="rounded px-1.5 py-1 text-sm hover:bg-surface-2"
            >
              {emoji}
            </button>
          ))}
          <EmojiPicker onPick={(emoji) => void react(emoji, item.reactions.some((r) => r.emoji === emoji && r.mine))} />
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Reply in thread"
            onClick={() => onOpenThread(item.id)}
          >
            <MessageSquare className="size-3.5" />
          </Button>
          {item.mine ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7" aria-label="More message actions">
                  <MoreHorizontal className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => { setDraft(item.body ?? ""); setEditing(true); }}>
                  <Pencil className="size-3.5" /> Edit message
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onSelect={() => setConfirming(true)}>
                  <Trash2 className="size-3.5" /> Delete message
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      ) : null}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this message?</DialogTitle>
            <DialogDescription>Everyone will see that it was deleted. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={() => void remove()} disabled={busy}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7" aria-label="More reactions">
          <SmilePlus className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="flex gap-1 p-1">
        {TEAM_EMOJI.map((emoji) => (
          <DropdownMenuItem key={emoji} className="px-2 py-1 text-base" onSelect={() => onPick(emoji)} aria-label={`React with ${emoji}`}>
            {emoji}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A message box: Enter sends, Shift+Enter starts a new line. The text stays if sending fails. */
export function Composer({
  placeholder,
  disabled,
  disabledReason,
  onSend,
  autoFocusKey,
}: {
  placeholder: string;
  disabled?: boolean;
  disabledReason?: string;
  onSend: (body: string) => Promise<void>;
  autoFocusKey?: string;
}) {
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const ref = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => {
    if (!disabled) ref.current?.focus();
  }, [autoFocusKey, disabled]);

  async function submit() {
    const body = text.trim();
    if (!body || busy || disabled) return;
    setBusy(true);
    try {
      await onSend(body);
      setText("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-border bg-background p-3">
      {disabled && disabledReason ? (
        <p className="mb-2 text-xs text-muted-foreground">{disabledReason}</p>
      ) : null}
      <div
        className={cn(
          "flex items-end gap-2 rounded-lg border border-border bg-surface px-3 py-2 focus-within:ring-2 focus-within:ring-ring/40",
          disabled && "opacity-60",
        )}
      >
        <Textarea
          ref={ref}
          aria-label={placeholder}
          placeholder={placeholder}
          rows={1}
          value={text}
          disabled={disabled || busy}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          className="max-h-40 min-h-9 resize-none border-0 bg-transparent p-1 shadow-none focus-visible:ring-0"
        />
        <Button size="sm" onClick={() => void submit()} disabled={disabled || busy || !text.trim()}>
          Send
        </Button>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        <kbd className="font-sans">Enter</kbd> to send, <kbd className="font-sans">Shift + Enter</kbd> for a new line
      </p>
    </div>
  );
}
