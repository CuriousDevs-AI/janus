"use client";

import * as React from "react";
import { Download, FileText, MessageSquare, MoreHorizontal, Paperclip, Pencil, SmilePlus, Trash2, X } from "lucide-react";
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
import {
  TEAM_EMOJI,
  TEAM_FILE_ACCEPT,
  TEAM_MAX_FILE_BYTES,
  type TeamAttachment,
  type TeamMessage,
} from "@/components/team/types";

const GROUP_WINDOW_MS = 5 * 60 * 1000;
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
  showAuthors = true,
}: {
  messages: TeamMessage[];
  emptyText: string;
  onOpenThread: (id: string) => void;
  onChanged: () => void;
  activeThreadId?: string | null;
  /** Names and avatars beside other people's messages; a DM has only one other person, so no. */
  showAuthors?: boolean;
}) {
  const ordered = [...messages].reverse();
  if (ordered.length === 0) {
    return <p className="px-6 py-10 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }
  const rows: React.ReactNode[] = [];
  let lastDay = "";
  let previousAuthor = "";
  let previousAt = 0;
  for (const item of ordered) {
    const day = dayLabel(item.createdAt);
    if (day !== lastDay) {
      rows.push(
        <div key={`day-${item.id}`} className="my-3 flex justify-center px-6" role="separator" aria-label={day}>
          <span className="rounded-md bg-surface px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">{day}</span>
        </div>,
      );
      lastDay = day;
      previousAuthor = "";
    }
    // A run from one person groups only within a few minutes, so a later reply shows who and when.
    const at = new Date(item.createdAt).getTime();
    const grouped = previousAuthor === item.author.name && at - previousAt < GROUP_WINDOW_MS;
    previousAuthor = item.author.name;
    previousAt = at;
    rows.push(
      <MessageRow
        key={item.id}
        item={item}
        grouped={grouped}
        showAuthors={showAuthors}
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
  showAuthors,
  active,
  onOpenThread,
  onChanged,
}: {
  item: TeamMessage;
  grouped: boolean;
  showAuthors: boolean;
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
        "group relative flex gap-2 px-4 sm:px-6",
        item.mine ? "justify-end" : "justify-start",
        active && "bg-accent-muted/30",
        grouped ? "pt-0.5" : "pt-2",
      )}
    >
      {item.mine || !showAuthors ? null : (
      <div className="w-8 shrink-0">
        {grouped ? (
          <time
            dateTime={item.createdAt}
            className="invisible block pt-2 text-right text-[10px] leading-none text-muted-foreground group-hover:visible"
          >
            {timeOf(item.createdAt)}
          </time>
        ) : (
          <Avatar className="size-8">
            <AvatarFallback style={{ backgroundColor: colorFor(item.author.name) }} className="text-xs text-white">
              {initials(item.author.name)}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
      )}
      <div className={cn("flex min-w-0 max-w-[80%] flex-col", item.mine ? "items-end" : "items-start")}>
        {item.deleted ? (
          <p className="rounded-lg bg-surface px-3 py-1.5 text-sm italic text-muted-foreground shadow-sm">
            This message was deleted.
            <span className="ml-3 text-[10px] not-italic">{timeOf(item.createdAt)}</span>
          </p>
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
          <div
            className={cn(
              "rounded-lg px-2.5 py-1.5 text-sm text-foreground shadow-sm",
              item.mine ? "bg-accent-muted" : "bg-surface",
              grouped ? "" : item.mine ? "rounded-tr-none" : "rounded-tl-none",
            )}
          >
            {!item.mine && showAuthors && !grouped ? (
              <p className="mb-0.5 text-xs font-semibold" style={{ color: colorFor(item.author.name) }}>
                {item.author.name}
              </p>
            ) : null}
            <p className="whitespace-pre-wrap break-words">
              {item.body}
              <span className="float-right ml-3 mt-1.5 select-none text-[10px] leading-none text-muted-foreground">
                {item.editedAt ? "edited · " : ""}
                <time dateTime={item.createdAt}>{timeOf(item.createdAt)}</time>
              </span>
            </p>
          </div>
        )}

        {!item.deleted && item.attachments.length > 0 ? <AttachmentList items={item.attachments} /> : null}

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

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Images show as a preview; other files show as a row you can download. */
function AttachmentList({ items }: { items: TeamAttachment[] }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-2">
      {items.map((file) =>
        file.isImage ? (
          <a
            key={file.id}
            href={`/api/backend/team/attachments/${file.id}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open image ${file.filename}`}
            className="block overflow-hidden rounded-lg border border-border bg-surface-2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/backend/team/attachments/${file.id}`} alt={file.filename} loading="lazy" className="max-h-64 max-w-full object-contain" />
          </a>
        ) : (
          <a
            key={file.id}
            href={`/api/backend/team/attachments/${file.id}`}
            download={file.filename}
            className="inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-2"
          >
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate font-medium">{file.filename}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{fileSize(file.sizeBytes)}</span>
            <Download className="size-3.5 shrink-0 text-muted-foreground" />
          </a>
        ),
      )}
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
  allowFiles = true,
  autoFocusKey,
}: {
  placeholder: string;
  disabled?: boolean;
  disabledReason?: string;
  onSend: (body: string, file: File | null) => Promise<void>;
  allowFiles?: boolean;
  autoFocusKey?: string;
}) {
  const [text, setText] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const picker = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (!disabled) ref.current?.focus();
  }, [autoFocusKey, disabled]);

  async function submit() {
    const body = text.trim();
    if ((!body && !file) || busy || disabled) return;
    setBusy(true);
    try {
      await onSend(body, file);
      setText("");
      setFile(null);
    } finally {
      setBusy(false);
    }
  }

  function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!picked) return;
    if (picked.size > TEAM_MAX_FILE_BYTES) {
      toast.error("Choose a file no larger than 5 MB.");
      return;
    }
    setFile(picked);
    ref.current?.focus();
  }

  return (
    <div className="border-t border-border bg-background p-3">
      {disabled && disabledReason ? (
        <p className="mb-2 text-xs text-muted-foreground">{disabledReason}</p>
      ) : null}
      {file ? (
        <div className="mb-2 flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm">
          <FileText className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{file.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{fileSize(file.size)}</span>
          <Button variant="ghost" size="icon" className="size-6" aria-label="Remove file" onClick={() => setFile(null)}>
            <X className="size-3.5" />
          </Button>
        </div>
      ) : null}
      <div
        className={cn(
          "flex items-end gap-2 rounded-lg border border-border bg-surface px-3 py-2 focus-within:ring-2 focus-within:ring-ring/40",
          disabled && "opacity-60",
        )}
      >
        {allowFiles ? (
          <>
            <input ref={picker} type="file" accept={TEAM_FILE_ACCEPT} className="hidden" aria-label="Choose a file to send" onChange={choose} />
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-label="Attach a file"
              disabled={disabled || busy}
              onClick={() => picker.current?.click()}
            >
              <Paperclip className="size-4" />
            </Button>
          </>
        ) : null}
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
        <Button size="sm" onClick={() => void submit()} disabled={disabled || busy || (!text.trim() && !file)}>
          Send
        </Button>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        <kbd className="font-sans">Enter</kbd> to send, <kbd className="font-sans">Shift + Enter</kbd> for a new line
      </p>
    </div>
  );
}
