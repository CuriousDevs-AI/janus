"use client";

import * as React from "react";
import { Bookmark, BookmarkCheck, Check, CheckCheck, Clock, Download, EyeOff, FileText, Forward, Info, MessageSquare, Mic, MoreHorizontal, Paperclip, Pencil, Pin, PinOff, SmilePlus, Square, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api, message as errorText } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { cn } from "@/lib/utils";
import { TeamAvatar } from "@/components/team/team-avatar";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { PostCard } from "@/components/team/team-posts";
import {
  TEAM_EMOJI,
  TEAM_FILE_ACCEPT,
  TEAM_MAX_FILE_BYTES,
  type MessageInfo,
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
  onForward,
  onShowProfile,
  activeThreadId,
  showAuthors = true,
  canInteract = true,
}: {
  messages: TeamMessage[];
  emptyText: string;
  onOpenThread: (id: string) => void;
  onChanged: () => void;
  onForward?: (id: string) => void;
  onShowProfile?: (userId: number) => void;
  activeThreadId?: string | null;
  showAuthors?: boolean;
  canInteract?: boolean;
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
        onForward={onForward}
        onShowProfile={onShowProfile}
        canInteract={canInteract}
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
  onForward,
  onShowProfile,
  canInteract,
}: {
  item: TeamMessage;
  grouped: boolean;
  showAuthors: boolean;
  active: boolean;
  onOpenThread: (id: string) => void;
  onChanged: () => void;
  onForward?: (id: string) => void;
  onShowProfile?: (userId: number) => void;
  canInteract: boolean;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(item.body ?? "");
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [infoOpen, setInfoOpen] = React.useState(false);

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

  async function togglePin() {
    try {
      await api(`/team/messages/${item.id}/${item.pinned ? "unpin" : "pin"}`, { method: "POST" });
      onChanged();
    } catch (error) {
      toast.error(errorText(error));
    }
  }

  async function toggleSave() {
    try {
      await api(`/team/messages/${item.id}/${item.saved ? "unsave" : "save"}`, { method: "POST" });
      onChanged();
      toast.success(item.saved ? "Removed from saved" : "Saved");
    } catch (error) {
      toast.error(errorText(error));
    }
  }

  // Announcements, kudos, polls and events stand apart from the chat: centred, full cards.
  const post = item.kind !== "text" && !item.deleted && !editing;
  return (
    <div
      className={cn(
        "group relative flex gap-2 px-4 sm:px-6",
        post ? "justify-center py-3" : item.mine ? "justify-end" : "justify-start",
        active && "bg-accent-muted/30",
        post ? "" : grouped ? "pt-0.5" : "pt-2",
      )}
    >
      {item.mine || !showAuthors || post ? null : (
      <div className="w-8 shrink-0">
        {grouped ? (
          <time
            dateTime={item.createdAt}
            className="invisible block pt-2 text-right text-[10px] leading-none text-muted-foreground group-hover:visible"
          >
            {timeOf(item.createdAt)}
          </time>
        ) : (
          <TeamAvatar
            person={item.author}
            size="md"
            showStatus
            onClick={onShowProfile ? () => onShowProfile(item.author.id) : undefined}
          />
        )}
      </div>
      )}
      <div className={cn("flex min-w-0 flex-col", post ? "w-full max-w-2xl items-center" : cn("max-w-[80%]", item.mine ? "items-end" : "items-start"))}>
        {item.pinned && !item.deleted ? (
          <span className="mb-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <Pin className="size-3" /> Pinned{item.pinnedBy ? ` by ${item.pinnedBy.name}` : ""}
          </span>
        ) : null}
        {item.deleted ? (
          <p className="rounded-lg bg-surface px-3 py-1.5 text-sm italic text-muted-foreground shadow-sm">
            This message was deleted.
            <span className="ml-3 text-[10px] not-italic">{timeOf(item.createdAt)}</span>
          </p>
        ) : post ? (
          <PostCard item={item} onChanged={onChanged} />
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
              <RichText text={item.body ?? ""} hasMentions={item.mentions?.length > 0} />
              <span className="float-right ml-3 mt-1.5 inline-flex select-none items-center gap-0.5 text-[10px] leading-none text-muted-foreground">
                {item.editedAt ? "edited · " : ""}
                <time dateTime={item.createdAt}>{timeOf(item.createdAt)}</time>
                {item.delivery === "seen" ? (
                  <span className="ml-0.5 text-accent" title="Seen">✓✓</span>
                ) : item.delivery === "sent" ? (
                  <span className="ml-0.5" title="Sent">✓</span>
                ) : null}
              </span>
            </p>
          </div>
        )}

        {!item.deleted && item.body ? <LinkPreview text={item.body} /> : null}
        {!item.deleted && item.attachments.length > 0 ? <AttachmentList items={item.attachments} /> : null}

        {!item.deleted && item.reactions.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {item.reactions.map((reaction) => (
              <ReactionPill
                key={reaction.emoji}
                messageId={item.id}
                emoji={reaction.emoji}
                count={reaction.count}
                mine={reaction.mine}
                onToggle={() => void react(reaction.emoji, reaction.mine)}
              />
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
        {item.kind !== "text" && !item.deleted ? <SeenBadge messageId={item.id} /> : null}
      </div>

      {!item.deleted && !editing && (canInteract || item.mine) ? (
        <div className="absolute right-4 -top-3 flex items-center gap-0.5 rounded-md border border-border bg-surface p-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {canInteract ? (
            <>
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
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={item.pinned ? "Unpin message" : "Pin message"}
                onClick={() => void togglePin()}
              >
                {item.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={item.saved ? "Remove from saved" : "Save message"}
                onClick={() => void toggleSave()}
              >
                {item.saved ? <BookmarkCheck className="size-3.5 text-accent" /> : <Bookmark className="size-3.5" />}
              </Button>
              {onForward ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label="Forward message"
                  onClick={() => onForward(item.id)}
                >
                  <Forward className="size-3.5" />
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Message info"
                onClick={() => setInfoOpen(true)}
              >
                <Info className="size-3.5" />
              </Button>
            </>
          ) : null}
          {item.mine ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7" aria-label="More message actions">
                  <MoreHorizontal className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => {
                  if (Date.now() - new Date(item.createdAt).getTime() >= 5 * 60_000) return;
                  setDraft(item.body ?? ""); setEditing(true);
                }}>
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

      <MessageInfoDialog messageId={item.id} open={infoOpen} onOpenChange={setInfoOpen} />
    </div>
  );
}

function MessageInfoDialog({ messageId, open, onOpenChange }: { messageId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: info, loading } = useApi<MessageInfo>(open ? `/team/messages/${messageId}/info` : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Message Info</DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : info ? (
          <div className="space-y-5">
            {/* Read by */}
            <section>
              <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <CheckCheck className="size-3.5 text-accent" /> Read by · {info.seenBy.length}
              </h4>
              {info.seenBy.length > 0 ? (
                <ul className="mt-2 space-y-1.5">
                  {info.seenBy.map((s) => (
                    <li key={s.userId} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <TeamAvatar person={{ id: s.userId, name: s.name }} size="sm" />
                        {s.name}
                      </span>
                      <span className="text-xs text-muted-foreground">{timeOf(s.seenAt)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">No one yet</p>
              )}
            </section>

            {/* Not read by */}
            {info.notSeenBy.length > 0 ? (
              <section>
                <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <EyeOff className="size-3.5" /> Not read by · {info.notSeenBy.length}
                </h4>
                <ul className="mt-2 space-y-1.5">
                  {info.notSeenBy.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 text-sm">
                      <TeamAvatar person={{ id: p.id, name: p.name }} size="sm" />
                      {p.name}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {/* Reactions detail */}
            {info.reactions.length > 0 ? (
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reactions</h4>
                <div className="mt-2 space-y-2">
                  {info.reactions.map((r) => (
                    <div key={r.emoji} className="flex items-start gap-2">
                      <span className="text-lg">{r.emoji}</span>
                      <span className="text-sm text-muted-foreground">{r.users.map((u) => u.name).join(", ")}</span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {/* Poll voters */}
            {info.poll ? (
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {info.poll.anonymous ? "Anonymous Poll" : "Poll"} · {info.poll.total} vote{info.poll.total !== 1 ? "s" : ""}
                </h4>
                <ul className="mt-2 space-y-2">
                  {info.poll.options.map((opt) => {
                    const pct = info.poll!.total ? Math.round((opt.votes / info.poll!.total) * 100) : 0;
                    return (
                      <li key={opt.id}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{opt.text}</span>
                          <span className="text-xs text-muted-foreground">{opt.votes} · {pct}%</span>
                        </div>
                        <div className="mt-0.5 h-1.5 rounded-full bg-surface-2">
                          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        {!info.poll!.anonymous && opt.voters.length > 0 ? (
                          <p className="mt-0.5 text-[10px] text-muted-foreground">{opt.voters.map((v) => v.name).join(", ")}</p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {/* Event RSVP */}
            {info.event ? (
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Event RSVP</h4>
                {info.event.goingNames.length > 0 ? (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-success">Going · {info.event.going}</p>
                    <ul className="mt-1 space-y-1">
                      {info.event.goingNames.map((p) => (
                        <li key={p.id} className="flex items-center gap-2 text-sm">
                          <TeamAvatar person={{ id: p.id, name: p.name }} size="xs" />
                          {p.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {info.event.maybeNames.length > 0 ? (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-warning">Maybe · {info.event.maybe}</p>
                    <ul className="mt-1 space-y-1">
                      {info.event.maybeNames.map((p) => (
                        <li key={p.id} className="flex items-center gap-2 text-sm">
                          <TeamAvatar person={{ id: p.id, name: p.name }} size="xs" />
                          {p.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {info.event.declinedNames.length > 0 ? (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-muted-foreground">Declined · {info.event.declined}</p>
                    <ul className="mt-1 space-y-1">
                      {info.event.declinedNames.map((p) => (
                        <li key={p.id} className="flex items-center gap-2 text-sm">
                          <TeamAvatar person={{ id: p.id, name: p.name }} size="xs" />
                          {p.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            ) : null}

            <p className="text-[10px] text-muted-foreground">Sent {new Date(info.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function docIcon(filename: string): { label: string; bg: string; fg: string } {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return { label: "PDF", bg: "bg-red-100 dark:bg-red-900/30", fg: "text-red-600 dark:text-red-400" };
  if (["doc", "docx"].includes(ext)) return { label: "DOC", bg: "bg-blue-100 dark:bg-blue-900/30", fg: "text-blue-600 dark:text-blue-400" };
  if (["xls", "xlsx", "csv"].includes(ext)) return { label: "XLS", bg: "bg-green-100 dark:bg-green-900/30", fg: "text-green-600 dark:text-green-400" };
  if (["ppt", "pptx"].includes(ext)) return { label: "PPT", bg: "bg-orange-100 dark:bg-orange-900/30", fg: "text-orange-600 dark:text-orange-400" };
  if (ext === "txt") return { label: "TXT", bg: "bg-gray-100 dark:bg-gray-800/40", fg: "text-gray-600 dark:text-gray-400" };
  return { label: ext.toUpperCase().slice(0, 3) || "FILE", bg: "bg-surface-2", fg: "text-muted-foreground" };
}

/** Images show as inline WhatsApp-style thumbnails; docs show as typed cards with download. */
function AttachmentList({ items }: { items: TeamAttachment[] }) {
  const images = items.filter((f) => f.isImage);
  const docs = items.filter((f) => !f.isImage);
  return (
    <div className="mt-1.5 space-y-2">
      {images.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {images.map((file) => (
            <a
              key={file.id}
              href={`/api/backend/team/attachments/${file.id}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open image ${file.filename}`}
              className="group/img relative block overflow-hidden rounded-xl border border-border bg-surface-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/backend/team/attachments/${file.id}`} alt={file.filename} loading="lazy" className="max-h-72 max-w-[280px] object-cover" />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent px-2 pb-1.5 pt-5 opacity-0 transition-opacity group-hover/img:opacity-100">
                <span className="text-[10px] text-white">{file.filename}</span>
              </span>
            </a>
          ))}
        </div>
      ) : null}
      {docs.map((file) => {
        const icon = docIcon(file.filename);
        return (
          <a
            key={file.id}
            href={`/api/backend/team/attachments/${file.id}`}
            download={file.filename}
            className="flex max-w-xs items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 shadow-sm transition-colors hover:bg-surface-2"
          >
            <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold", icon.bg, icon.fg)}>
              {icon.label}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{file.filename}</span>
              <span className="text-[11px] text-muted-foreground">{fileSize(file.sizeBytes)} · {icon.label}</span>
            </span>
            <Download className="size-4 shrink-0 text-muted-foreground" />
          </a>
        );
      })}
    </div>
  );
}

function ReactionPill({
  messageId,
  emoji,
  count,
  mine,
  onToggle,
}: {
  messageId: string;
  emoji: string;
  count: number;
  mine: boolean;
  onToggle: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const info = useApi<MessageInfo>(open ? `/team/messages/${messageId}/info` : null);
  const reactors = React.useMemo(() => {
    if (!info.data) return null;
    const detail = info.data.reactions.find((r) => r.emoji === emoji);
    return detail?.users ?? [];
  }, [info.data, emoji]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-pressed={mine}
          aria-label={`${emoji} ${count}`}
          onClick={onToggle}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
            mine
              ? "border-accent-border bg-accent-muted text-accent"
              : "border-border bg-surface hover:bg-surface-2",
          )}
        >
          <span>{emoji}</span>
          <span className="tabular-nums">{count}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto max-w-48 p-2"
        side="top"
        align="center"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onPointerDownOutside={() => setOpen(false)}
      >
        <p className="mb-1 text-center text-lg">{emoji}</p>
        {reactors ? (
          <ul className="space-y-0.5 text-xs text-foreground">
            {reactors.map((u) => (
              <li key={u.id} className="truncate">{u.name}</li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">Loading…</p>
        )}
      </PopoverContent>
    </Popover>
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

function SeenBadge({ messageId }: { messageId: string }) {
  const [seen, setSeen] = React.useState<{ seen: number; total: number } | null>(null);
  const [names, setNames] = React.useState<string[] | null>(null);
  const marked = React.useRef(false);

  React.useEffect(() => {
    if (marked.current) return;
    marked.current = true;
    void api<{ seen: number; total: number }>(`/team/messages/${messageId}/seen`, { method: "POST" })
      .then(setSeen)
      .catch(() => undefined);
  }, [messageId]);

  async function showNames() {
    if (names) { setNames(null); return; }
    try {
      const list = await api<Array<{ user_name: string; seen_at: string }>>(`/team/messages/${messageId}/seen`);
      setNames(list.map((item) => item.user_name));
    } catch {
      setNames([]);
    }
  }

  if (!seen || seen.seen === 0) return null;
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => void showNames()}
        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
      >
        <Check className="size-3" />
        Seen by {seen.seen}{seen.total > 0 ? ` of ${seen.total}` : ""}
      </button>
      {names && names.length > 0 ? (
        <p className="ml-4 text-[11px] text-muted-foreground">{names.join(", ")}</p>
      ) : null}
    </div>
  );
}

interface LinkMeta { url: string; title?: string; description?: string; image?: string; siteName?: string }

function LinkPreview({ text }: { text: string }) {
  const url = text.match(/https?:\/\/[^\s<>)"']+/)?.[0];
  const [meta, setMeta] = React.useState<LinkMeta | null>(null);
  React.useEffect(() => {
    if (!url) return;
    let alive = true;
    void api<LinkMeta>(`/team/link-preview?url=${encodeURIComponent(url)}`)
      .then((data) => { if (alive && data.title) setMeta(data); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [url]);
  if (!meta) return null;
  return (
    <a
      href={meta.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1.5 flex max-w-sm gap-3 rounded-lg border border-border bg-surface p-2.5 hover:bg-surface-2"
    >
      {meta.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={meta.image} alt="" className="size-14 shrink-0 rounded object-cover" loading="lazy" />
      ) : null}
      <div className="min-w-0 flex-1">
        {meta.siteName ? <p className="text-[10px] uppercase text-muted-foreground">{meta.siteName}</p> : null}
        <p className="line-clamp-1 text-sm font-medium text-foreground">{meta.title}</p>
        {meta.description ? <p className="line-clamp-2 text-xs text-muted-foreground">{meta.description}</p> : null}
      </div>
    </a>
  );
}

const URL_RE = /https?:\/\/[^\s<>)"']+/g;
const INLINE_RE = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~|@\w+(?:\s\w+)?)/g;

function RichText({ text, hasMentions }: { text: string; hasMentions: boolean }) {
  const lines = text.split("\n");
  let inCode = false;
  const blocks: React.ReactNode[] = [];
  let codeLines: string[] = [];

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (line.startsWith("```")) {
      if (inCode) {
        blocks.push(
          <pre key={`code-${li}`} className="my-1 overflow-x-auto rounded bg-surface-3 px-3 py-2 text-xs">
            <code>{codeLines.join("\n")}</code>
          </pre>,
        );
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      const items: string[] = [line.slice(2)];
      while (li + 1 < lines.length && (lines[li + 1].startsWith("- ") || lines[li + 1].startsWith("* "))) {
        li++;
        items.push(lines[li].slice(2));
      }
      blocks.push(
        <ul key={`ul-${li}`} className="my-0.5 ml-4 list-disc text-sm">
          {items.map((item, j) => <li key={j}>{inlineFormat(item, hasMentions)}</li>)}
        </ul>,
      );
      continue;
    }
    if (li > 0) blocks.push(<br key={`br-${li}`} />);
    blocks.push(<React.Fragment key={`l-${li}`}>{inlineFormat(line, hasMentions)}</React.Fragment>);
  }
  if (inCode && codeLines.length > 0) {
    blocks.push(
      <pre key="code-end" className="my-1 overflow-x-auto rounded bg-surface-3 px-3 py-2 text-xs">
        <code>{codeLines.join("\n")}</code>
      </pre>,
    );
  }
  return <>{blocks}</>;
}

function inlineFormat(text: string, hasMentions: boolean): React.ReactNode {
  const parts = text.split(INLINE_RE);
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return <code key={i} className="rounded bg-surface-3 px-1 py-0.5 text-xs font-mono">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2 && !part.startsWith("**")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith("~~") && part.endsWith("~~") && part.length > 4) {
      return <s key={i} className="text-muted-foreground">{part.slice(2, -2)}</s>;
    }
    if (hasMentions && part.startsWith("@")) {
      return <span key={i} className="rounded bg-accent-muted px-0.5 font-medium text-accent">{part}</span>;
    }
    return <React.Fragment key={i}>{linkify(part)}</React.Fragment>;
  });
}

function linkify(text: string): React.ReactNode {
  const parts = text.split(URL_RE);
  const urls = text.match(URL_RE) ?? [];
  if (urls.length === 0) return text;
  const out: React.ReactNode[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i]) out.push(<React.Fragment key={`t${i}`}>{parts[i]}</React.Fragment>);
    if (i < urls.length) {
      out.push(
        <a key={`u${i}`} href={urls[i]} target="_blank" rel="noopener noreferrer" className="text-accent underline hover:text-accent/80">
          {urls[i].length > 60 ? `${urls[i].slice(0, 57)}…` : urls[i]}
        </a>,
      );
    }
  }
  return <>{out}</>;
}

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"]);
const PDF_TYPE = "application/pdf";

function FilePreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const isImage = IMAGE_TYPES.has(file.type);
  const isPdf = file.type === PDF_TYPE;

  const preview = React.useMemo(() => {
    if (!isImage) return null;
    return URL.createObjectURL(file);
  }, [file, isImage]);

  React.useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview); };
  }, [preview]);

  if (isImage && preview) {
    return (
      <div className="relative mb-2 inline-block max-w-[200px] overflow-hidden rounded-lg border border-border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={preview} alt={file.name} className="max-h-48 w-full object-cover" />
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/60 px-2 py-1">
          <span className="truncate text-[10px] text-white">{file.name}</span>
          <button type="button" aria-label="Remove" onClick={onRemove} className="ml-1 rounded-full p-0.5 hover:bg-white/20">
            <X className="size-3 text-white" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
      <div className={cn("flex size-10 items-center justify-center rounded-lg", isPdf ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" : "bg-accent/10 text-accent")}>
        {isPdf ? (
          <span className="text-[10px] font-bold">PDF</span>
        ) : (
          <FileText className="size-5" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{file.name}</p>
        <p className="text-[10px] text-muted-foreground">{fileSize(file.size)}</p>
      </div>
      <Button variant="ghost" size="icon" className="size-7" aria-label="Remove file" onClick={onRemove}>
        <X className="size-3.5" />
      </Button>
    </div>
  );
}

/** A message box: Enter sends, Shift+Enter starts a new line. The text stays if sending fails. */
export function Composer({
  placeholder,
  disabled,
  disabledReason,
  onSend,
  onTyping,
  onSchedule,
  allowFiles = true,
  autoFocusKey,
  extra,
}: {
  /** More buttons beside the attach button, such as the post menu. */
  extra?: React.ReactNode;
  placeholder: string;
  disabled?: boolean;
  disabledReason?: string;
  onSend: (body: string, file: File | null) => Promise<void>;
  onTyping?: () => void;
  onSchedule?: (body: string) => void;
  allowFiles?: boolean;
  autoFocusKey?: string;
}) {
  const [text, setText] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const [recSeconds, setRecSeconds] = React.useState(0);
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const picker = React.useRef<HTMLInputElement>(null);
  const lastTyping = React.useRef(0);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const recTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  React.useEffect(() => {
    if (!disabled) ref.current?.focus();
  }, [autoFocusKey, disabled]);

  function handleChange(value: string) {
    setText(value);
    if (onTyping && value.length > 0) {
      const now = Date.now();
      if (now - lastTyping.current > 2000) {
        lastTyping.current = now;
        onTyping();
      }
    }
  }

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

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4" });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const ext = recorder.mimeType.includes("webm") ? "webm" : "m4a";
        const blob = new Blob(chunks, { type: recorder.mimeType });
        const voiceFile = new File([blob], `voice-${Date.now()}.${ext}`, { type: recorder.mimeType });
        setFile(voiceFile);
        setRecording(false);
        setRecSeconds(0);
        if (recTimerRef.current) clearInterval(recTimerRef.current);
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setRecSeconds(0);
      recTimerRef.current = setInterval(() => setRecSeconds((s) => s + 1), 1000);
    } catch {
      toast.error("Could not access microphone.");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
  }

  function cancelRecording() {
    if (recorderRef.current) {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
      recorderRef.current.stream.getTracks().forEach((t) => t.stop());
      recorderRef.current = null;
    }
    setRecording(false);
    setRecSeconds(0);
    if (recTimerRef.current) clearInterval(recTimerRef.current);
  }

  return (
    <div className="border-t border-border bg-background p-3">
      {disabled && disabledReason ? (
        <p className="mb-2 text-xs text-muted-foreground">{disabledReason}</p>
      ) : null}
      {file ? (
        <FilePreview file={file} onRemove={() => setFile(null)} />
      ) : null}
      <div
        className={cn(
          "flex items-end gap-2 rounded-lg border border-border bg-surface px-3 py-2 focus-within:ring-2 focus-within:ring-ring/40",
          disabled && "opacity-60",
        )}
      >
        {extra}
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
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          className="max-h-40 min-h-9 resize-none border-0 bg-transparent p-1 shadow-none focus-visible:ring-0"
        />
        {recording ? (
          <div className="flex items-center gap-2">
            <span className="size-2 animate-pulse rounded-full bg-red-500" />
            <span className="text-xs tabular-nums text-muted-foreground">
              {Math.floor(recSeconds / 60)}:{String(recSeconds % 60).padStart(2, "0")}
            </span>
            <Button size="sm" variant="ghost" onClick={cancelRecording} aria-label="Cancel recording">
              <X className="size-3.5" />
            </Button>
            <Button size="sm" onClick={stopRecording} aria-label="Stop and send">
              <Square className="size-3.5" />
            </Button>
          </div>
        ) : (
          <>
            {allowFiles && !text.trim() && !file ? (
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                aria-label="Record voice message"
                disabled={disabled || busy}
                onClick={() => void startRecording()}
              >
                <Mic className="size-4" />
              </Button>
            ) : null}
            {onSchedule && text.trim() && !file ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onSchedule(text.trim())}
                disabled={disabled || busy}
                aria-label="Send later"
                title="Schedule message"
              >
                <Clock className="size-3.5" />
              </Button>
            ) : null}
            <Button size="sm" onClick={() => void submit()} disabled={disabled || busy || (!text.trim() && !file)}>
              Send
            </Button>
          </>
        )}
      </div>
      <p className="mt-1.5 hidden text-[11px] text-muted-foreground sm:block">
        <kbd className="font-sans">Enter</kbd> to send, <kbd className="font-sans">Shift + Enter</kbd> for a new line
      </p>
    </div>
  );
}
