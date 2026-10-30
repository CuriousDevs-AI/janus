"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Hash, Headphones, Megaphone, MessageSquarePlus, MoreVertical, Plus, Search, Users } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TeamSpace } from "@/components/team/types";
import { useVoiceCall } from "@/components/team/voice-call";
import { CallBar } from "@/components/team/voice-stage";
import { useTeamChatStore } from "@/lib/stores/team-chat-store";
import { NotificationsToggle } from "@/components/team/team-posts";

/** A voice channel is a channel: every conversation holds both chat and a call. */
export function isChannel(kind?: TeamSpace["kind"]) {
  return kind === "channel" || kind === "voice";
}

/**
 * The chat list in the app's left sidebar, where the Team Chat menu would be.
 * The open Team Chat page owns the data and the dialogs; this only shows and picks.
 */
export function TeamChatSidebarList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const state = useTeamChatStore();
  if (pathname !== "/team" || !state.actions) return null;
  const { actions } = state;
  const then = (run: () => void) => () => { run(); onNavigate?.(); };
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-label="Chat list" role="region">
      <ChatList
        channels={state.channels}
        direct={state.direct}
        selected={state.selected}
        onPick={(item) => { actions.pick(item); onNavigate?.(); }}
        onCreate={then(actions.create)}
        onNewMessage={then(actions.newMessage)}
        onSearchMessages={then(actions.searchMessages)}
        loading={state.loading}
      />
    </div>
  );
}

type ChatFilter = "all" | "unread" | "official" | "channels" | "groups" | "direct";

const FILTERS: Array<{ id: ChatFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "official", label: "Official" },
  { id: "channels", label: "Channels" },
  { id: "groups", label: "Groups" },
  { id: "direct", label: "Direct" },
];

function shortTime(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  }
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/** One list of every conversation, newest first, as in WhatsApp: search and filters at the top. */
export function ChatList({
  channels,
  direct,
  selected,
  onPick,
  onCreate,
  onNewMessage,
  onSearchMessages,
  loading,
}: {
  channels: TeamSpace[];
  direct: TeamSpace[];
  selected: string | null;
  onPick: (item: TeamSpace) => void;
  onCreate: () => void;
  onNewMessage: () => void;
  onSearchMessages: () => void;
  loading: boolean;
}) {
  const [filter, setFilter] = React.useState<ChatFilter>("all");
  const [query, setQuery] = React.useState("");
  const all = [...channels, ...direct].sort((left, right) => {
    const a = left.lastMessageAt ? Date.parse(left.lastMessageAt) : 0;
    const b = right.lastMessageAt ? Date.parse(right.lastMessageAt) : 0;
    return b - a || left.title.localeCompare(right.title);
  });
  const term = query.trim().toLowerCase();
  const shown = all.filter((item) => {
    if (term && !`${item.title} ${item.name ?? ""}`.toLowerCase().includes(term)) return false;
    if (filter === "unread") return item.unread > 0;
    if (filter === "official") return item.announcements;
    if (filter === "channels") return isChannel(item.kind);
    if (filter === "groups") return item.kind === "group";
    if (filter === "direct") return item.kind === "dm";
    return true;
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3">
        <h2 className="text-lg font-semibold">Chats</h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="New direct message" title="New message or group" onClick={onNewMessage}>
            <MessageSquarePlus className="size-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Chat menu">
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onCreate}>
                <Hash className="size-3.5" /> New channel
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onNewMessage}>
                <Users className="size-3.5" /> New message or group
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onSearchMessages}>
                <Search className="size-3.5" /> Search messages
              </DropdownMenuItem>
              <NotificationsToggle />
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon" aria-label="Create channel" title="New channel" onClick={onCreate} className="sr-only focus:not-sr-only">
            <Plus className="size-4" />
          </Button>
        </div>
      </div>
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            aria-label="Search chats"
            placeholder="Search or start a new chat"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 px-3 pb-2" role="tablist" aria-label="Filter chats">
        {FILTERS.map((item) => {
          // Unread counts on the chips, so new official news stands out without opening the list.
          const count =
            item.id === "unread" ? all.filter((space) => space.unread > 0).length
            : item.id === "official" ? all.filter((space) => space.announcements).reduce((sum, space) => sum + space.unread, 0)
            : 0;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={filter === item.id}
              onClick={() => setFilter(item.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                filter === item.id
                  ? item.id === "official" ? "bg-warning-muted text-warning" : "bg-accent-muted text-accent"
                  : "bg-surface-2 text-muted-foreground hover:text-foreground",
              )}
            >
              {item.id === "official" ? <Megaphone className="size-3" /> : null}
              {item.label}
              {count > 0 ? (
                <span className={cn("min-w-4 rounded-full px-1 text-center text-[10px] font-semibold tabular-nums text-white", item.id === "official" ? "bg-warning" : "bg-success")}>
                  {count > 99 ? "99+" : count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto" aria-label="Chats">
        {loading ? <li className="px-4 py-3 text-sm text-muted-foreground">Loading chats…</li> : null}
        {!loading && shown.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-muted-foreground">
            {all.length === 0 ? "No chats yet. Start a message or create a channel." : filter === "official" ? "No official announcements yet." : "No chats match."}
          </li>
        ) : null}
        {shown.map((item) => (
          <ChatRow key={item.id} item={item} active={selected === item.id} onPick={onPick} />
        ))}
      </ul>
      <CallBar />
    </div>
  );
}

export function ChatAvatar({ item, label }: { item: TeamSpace; label: string }) {
  if (item.announcements) {
    return (
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-warning-muted text-warning">
        <Megaphone className="size-5" />
      </span>
    );
  }
  if (isChannel(item.kind)) {
    return (
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-muted text-accent">
        <Hash className="size-5" />
      </span>
    );
  }
  if (item.kind === "group") {
    return (
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-3 text-muted-foreground">
        <Users className="size-5" />
      </span>
    );
  }
  return (
    <span
      className="flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
      style={{ backgroundColor: avatarColor(label) }}
    >
      {initials(label)}
    </span>
  );
}

function ChatRow({ item, active, onPick }: { item: TeamSpace; active: boolean; onPick: (item: TeamSpace) => void }) {
  const call = useVoiceCall();
  const live = call.spaceId === item.id;
  const people = live ? call.participants : item.inCall;
  const label = isChannel(item.kind) ? item.name ?? "" : item.title;
  const preview =
    people.length > 0
      ? null
      : item.lastMessagePreview ?? (isChannel(item.kind) && !item.joined ? "Not joined yet" : "No messages yet");
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(item)}
        aria-current={active ? "true" : undefined}
        aria-label={label}
        className={cn(
          "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
          active ? "bg-accent-muted/60" : "hover:bg-surface-2",
        )}
      >
        <ChatAvatar item={item} label={label} />
        <span className="min-w-0 flex-1 border-b border-border/60 py-1.5">
          <span className="flex items-baseline justify-between gap-2">
            <span className={cn("truncate text-[15px] text-foreground", item.unread > 0 && "font-semibold")}>
              {isChannel(item.kind) ? `# ${label}` : label}
            </span>
            <span className={cn("shrink-0 text-[11px]", item.unread > 0 ? "font-medium text-success" : "text-muted-foreground")}>
              {shortTime(item.lastMessageAt)}
            </span>
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
              {people.length > 0 ? (
                <span className="inline-flex items-center gap-1 font-medium text-success">
                  <Headphones className="size-3.5" /> In a call · {people.length}
                </span>
              ) : (
                preview
              )}
            </span>
            {item.unread > 0 ? (
              <span className="min-w-5 rounded-full bg-success px-1.5 text-center text-[11px] font-semibold tabular-nums text-white">
                {item.unread > 99 ? "99+" : item.unread}
              </span>
            ) : null}
          </span>
        </span>
      </button>
    </li>
  );
}

const AVATAR_COLORS = ["#2563eb", "#059669", "#d97706", "#7c3aed", "#db2777", "#0891b2"];

function avatarColor(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
