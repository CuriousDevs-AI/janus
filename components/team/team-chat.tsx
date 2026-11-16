"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, BellOff, Bookmark, Check, Circle, Clock, Download, FileText, Forward, Hash, Image as ImageIcon, Info, Lock, Megaphone, MessageSquare as ThreadIcon, Headphones, LogIn, LogOut, MoreVertical, Phone, PhoneOff, Pin, Plus, Search, Smile, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { api, message as errorText } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { demoMode } from "@/lib/demo-mode";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Composer, MessageList, fileSize } from "@/components/team/team-messages";
import type { SpaceDetail, TeamAttachment, TeamMessage, TeamPerson, TeamPresence, TeamScheduledMessage, TeamSearchHit, TeamSpace, TypingUser } from "@/components/team/types";
import { useSession } from "@/components/auth/session-provider";
import { useVoiceCall } from "@/components/team/voice-call";
import { CallBanner, CallPanel } from "@/components/team/voice-stage";
import { ChatAvatar, ChatList, isChannel } from "@/components/team/chat-list";
import { useTeamChatStore } from "@/lib/stores/team-chat-store";
import { PostMenu } from "@/components/team/team-posts";
import { hasPermission } from "@/lib/demo-persona";

const CHANNEL_NAME = /^[a-z0-9][a-z0-9-]{1,39}$/;
const REFRESH_MS = 4000;
const HEARTBEAT_MS = 60_000;
const TYPING_POLL_MS = 2000;

function newKey() {
  return crypto.randomUUID();
}

function typingLabel(users: TypingUser[]): string {
  if (users.length === 1) return `${users[0].name} is typing…`;
  if (users.length === 2) return `${users[0].name} and ${users[1].name} are typing…`;
  return `${users[0].name}, ${users[1].name} and ${users.length - 2} other${users.length > 3 ? "s" : ""} are typing…`;
}

export function TeamChat() {
  const session = useSession();
  const call = useVoiceCall();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requested = searchParams.get("space");
  const [selected, setSelected] = React.useState<string | null>(requested);
  const [threadId, setThreadId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [picking, setPicking] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [pinnedOpen, setPinnedOpen] = React.useState(false);
  const [addingMember, setAddingMember] = React.useState(false);
  const [callHistoryOpen, setCallHistoryOpen] = React.useState(false);
  const [savedOpen, setSavedOpen] = React.useState(false);
  const [forwardingId, setForwardingId] = React.useState<string | null>(null);
  const [threadsOpen, setThreadsOpen] = React.useState(false);
  const [statusOpen, setStatusOpen] = React.useState(false);
  const [schedulingBody, setSchedulingBody] = React.useState<string | null>(null);
  const [scheduledOpen, setScheduledOpen] = React.useState(false);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [term, setTerm] = React.useState("");
  const [filterUser, setFilterUser] = React.useState<number | null>(null);
  const [filterDateFrom, setFilterDateFrom] = React.useState("");
  const [filterDateTo, setFilterDateTo] = React.useState("");
  const [inThisChat, setInThisChat] = React.useState(false);
  const [typing, setTyping] = React.useState<TypingUser[]>([]);
  const [mediaOpen, setMediaOpen] = React.useState(false);
  const [profileUser, setProfileUser] = React.useState<number | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const channels = useApi<TeamSpace[]>(demoMode ? null : "/team/channels");
  const direct = useApi<TeamSpace[]>(demoMode ? null : "/team/conversations");
  const people = useApi<TeamPerson[]>(demoMode ? null : "/team/people");
  const messages = useApi<TeamMessage[]>(
    demoMode || !selected ? null : `/team/spaces/${selected}/messages?limit=50`,
  );
  const searchUrl = React.useMemo(() => {
    if (demoMode || !searchOpen || term.length < 2) return null;
    let url = `/team/search?q=${encodeURIComponent(term)}&limit=30`;
    if (filterUser) url += `&from_user=${filterUser}`;
    if (filterDateFrom) url += `&date_from=${filterDateFrom}T00:00:00`;
    if (filterDateTo) url += `&date_to=${filterDateTo}T23:59:59`;
    if (inThisChat && selected) url += `&space_id=${selected}`;
    return url;
  }, [searchOpen, term, filterUser, filterDateFrom, filterDateTo, inThisChat, selected]);
  const hits = useApi<TeamSearchHit[]>(searchUrl);
  const replies = useApi<TeamMessage[]>(
    demoMode || !threadId ? null : `/team/messages/${threadId}/replies`,
  );
  const pinned = useApi<TeamMessage[]>(
    demoMode || !pinnedOpen || !selected ? null : `/team/spaces/${selected}/pinned`,
  );
  const callHistory = useApi<Array<{ id: string; userId: number; userName: string; action: string; createdAt: string }>>(
    demoMode || !callHistoryOpen || !selected ? null : `/team/voice/${selected}/history?limit=50`,
  );
  const saved = useApi<TeamMessage[]>(
    demoMode || !savedOpen ? null : "/team/saved?limit=50",
  );
  const presence = useApi<TeamPresence[]>(demoMode ? null : "/team/presence");
  const scheduled = useApi<TeamScheduledMessage[]>(
    demoMode || !scheduledOpen ? null : "/team/scheduled",
  );
  const detail = useApi<SpaceDetail>(
    demoMode || !detailOpen || !selected ? null : `/team/spaces/${selected}/detail`,
  );
  const threads = useApi<TeamMessage[]>(
    demoMode || !threadsOpen ? null : "/team/threads?limit=30",
  );
  const media = useApi<TeamAttachment[]>(
    demoMode || !mediaOpen || !selected ? null : `/team/spaces/${selected}/media`,
  );

  const reloadChannels = channels.reload;
  const reloadDirect = direct.reload;
  const reloadMessages = messages.reload;
  const reloadReplies = replies.reload;
  const reloadPresence = presence.reload;
  React.useEffect(() => {
    if (demoMode) return;
    const timer = setInterval(() => {
      reloadChannels();
      reloadDirect();
      reloadMessages();
      reloadReplies();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [reloadChannels, reloadDirect, reloadMessages, reloadReplies]);

  // Ensure "Your Notes" self-chat exists (auto-created, appears in conversations list).
  const notesCreated = React.useRef(false);
  React.useEffect(() => {
    if (demoMode || notesCreated.current) return;
    notesCreated.current = true;
    void api("/team/notes", { method: "POST" }).then(() => reloadDirect()).catch(() => undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Heartbeat: keeps the user online in the presence system.
  React.useEffect(() => {
    if (demoMode) return;
    void api("/team/heartbeat", { method: "POST" }).catch(() => undefined);
    const timer = setInterval(() => {
      void api("/team/heartbeat", { method: "POST" }).catch(() => undefined);
    }, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, []);

  // Presence: poll less frequently.
  React.useEffect(() => {
    if (demoMode) return;
    const timer = setInterval(reloadPresence, 30_000);
    return () => clearInterval(timer);
  }, [reloadPresence]);

  // Typing indicator: poll who is typing in the current space.
  React.useEffect(() => {
    setTyping([]); // eslint-disable-line react-hooks/set-state-in-effect -- reset on space change
    if (demoMode || !selected) return;
    let alive = true;
    const poll = () => {
      void api<{ typing: TypingUser | TypingUser[] | null }>(`/team/typing/${selected}`)
        .then((res) => {
          if (!alive) return;
          if (!res.typing) setTyping([]);
          else if (Array.isArray(res.typing)) setTyping(res.typing);
          else setTyping([res.typing]);
        })
        .catch(() => { if (alive) setTyping([]); });
    };
    poll();
    const timer = setInterval(poll, TYPING_POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [selected]);

  // Search waits for a short pause in typing, so each keystroke does not ask the server.
  React.useEffect(() => {
    const timer = setTimeout(() => setTerm(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const all = [...(channels.data ?? []), ...(direct.data ?? [])];
  const space = all.find((item) => item.id === selected) ?? null;
  const newestId = messages.data?.[0]?.id ?? null;

  // Opening a space, or getting a new message in it, marks it read.
  React.useEffect(() => {
    if (demoMode || !space || !newestId) return;
    if (isChannel(space.kind) && !space.joined) return;
    void api(`/team/spaces/${space.id}/read`, {
      method: "POST",
      body: JSON.stringify({ last_message_id: Number(newestId) }),
    })
      .then(() => {
        reloadChannels();
        reloadDirect();
      })
      .catch(() => undefined);
    // Only the space and its newest message decide when to mark it read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, newestId, space?.joined]);

  // Keep the newest message in view, as a chat does.
  React.useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [selected, newestId]);

  function choose(id: string) {
    setSelected(id);
    setThreadId(null);
    setPinnedOpen(false);
    setCallHistoryOpen(false);
  }

  // Keep the URL in sync with the selected space so reload and deep links work.
  React.useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const current = params.get("space");
    if (selected && current !== selected) {
      params.set("space", selected);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    } else if (!selected && current) {
      params.delete("space");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }, [selected, searchParams, router, pathname]);

  // Escape closes an open thread, as in the desktop apps.
  React.useEffect(() => {
    if (!threadId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setThreadId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [threadId]);

  async function scheduleSend(body: string, sendAt: string) {
    if (!selected) return;
    try {
      await api("/team/spaces/" + selected + "/schedule", {
        method: "POST",
        body: JSON.stringify({ body, send_at: sendAt }),
      });
      toast.success("Message scheduled");
      setSchedulingBody(null);
    } catch (error) {
      toast.error(errorText(error));
    }
  }

  function sendTyping() {
    if (!selected || demoMode) return;
    void api("/team/typing", {
      method: "POST",
      body: JSON.stringify({ space_id: Number(selected) }),
    }).catch(() => undefined);
  }

  async function send(body: string, parentId?: string, file?: File | null) {
    if (!selected) return;
    try {
      if (file) {
        // A file goes up as a form; the caption is the text, or the file name when there is none.
        const form = new FormData();
        form.append("file", file, file.name);
        form.append("body", body);
        await api(`/team/spaces/${selected}/files`, {
          method: "POST",
          body: form,
          headers: { "Idempotency-Key": newKey() },
        });
      } else {
        await api(`/team/spaces/${selected}/messages`, {
          method: "POST",
          body: JSON.stringify(parentId ? { body, parent_id: Number(parentId) } : { body }),
          headers: { "Idempotency-Key": newKey() },
        });
      }
      reloadMessages();
      reloadReplies();
      reloadChannels();
      reloadDirect();
    } catch (error) {
      toast.error(errorText(error));
      throw error;
    }
  }

  async function changeMembership(action: "join" | "leave") {
    if (!space) return;
    try {
      await api(`/team/channels/${space.id}/${action}`, { method: "POST" });
      reloadChannels();
      toast.success(action === "join" ? `Joined #${space.name}` : `Left #${space.name}`);
    } catch (error) {
      toast.error(errorText(error));
    }
  }

  async function openConversation(ids: number[]) {
    try {
      const opened = await api<TeamSpace>("/team/conversations", {
        method: "POST",
        body: JSON.stringify({ user_ids: ids }),
      });
      reloadDirect();
      choose(opened.id);
      setPicking(false);
    } catch (error) {
      toast.error(errorText(error));
    }
  }

  async function createChannel(name: string, topic: string, isPrivate: boolean) {
    const created = await api<TeamSpace>("/team/channels", {
      method: "POST",
      body: JSON.stringify({ name, topic, private: isPrivate }),
    });
    reloadChannels();
    choose(created.id);
    setCreating(false);
    toast.success(`Created ${isPrivate ? "🔒" : "#"}${created.name}`);
  }

  function pick(item: TeamSpace) {
    choose(item.id);
  }

  // The app sidebar shows the chat list on wider screens; give it what it needs.
  const publish = useTeamChatStore((state) => state.publish);
  const clear = useTeamChatStore((state) => state.clear);
  React.useEffect(() => {
    publish({
      channels: channels.data ?? [],
      direct: direct.data ?? [],
      selected,
      loading: channels.loading && !channels.data,
      // Only state setters here, so these never go stale.
      actions: {
        pick: (item) => { setSelected(item.id); setThreadId(null); },
        create: () => setCreating(true),
        newMessage: () => setPicking(true),
        searchMessages: () => setSearchOpen(true),
        refresh: () => { reloadChannels(); reloadDirect(); },
      },
    });
  }, [publish, channels.data, direct.data, selected, channels.loading]);
  React.useEffect(() => clear, [clear]);

  const chatList = (
    <ChatList
      channels={channels.data ?? []}
      direct={direct.data ?? []}
      selected={selected}
      onPick={pick}
      onCreate={() => setCreating(true)}
      onNewMessage={() => setPicking(true)}
      onSearchMessages={() => setSearchOpen(true)}
      onRefresh={() => { reloadChannels(); reloadDirect(); }}
      loading={channels.loading && !channels.data}
    />
  );
  // On a phone, as in WhatsApp, the list and the open chat take turns filling the screen.
  const showConversation = Boolean(selected) || searchOpen;

  if (demoMode) {
    return (
      <div className="flex h-[calc(100dvh-3.5rem)] items-center justify-center p-8 text-center text-sm text-muted-foreground">
        Team chat runs on real accounts. The preview has no server to hold the messages.
      </div>
    );
  }

  const threadRoot = threadId ? messages.data?.find((item) => item.id === threadId) ?? null : null;
  const title = space ? (isChannel(space.kind) ? `${space.private ? "🔒" : "#"}${space.name}` : space.title) : "Team chat";

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 bg-background">
      <aside
        aria-label="Chat list"
        className={cn(
          "w-full shrink-0 flex-col bg-surface md:hidden",
          showConversation ? "hidden" : "flex",
        )}
      >
        {chatList}
      </aside>

      <section className={cn("min-w-0 flex-1 flex-col", showConversation ? "flex" : "hidden md:flex")}>
        <header className="flex min-h-14 items-center gap-3 border-b border-border bg-surface px-3 py-2">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Back to chats"
            onClick={() => {
              setSelected(null);
              setThreadId(null);
              setSearchOpen(false);
            }}
          >
            <ArrowLeft className="size-4" />
          </Button>
          {space ? <ConversationAvatar space={space} /> : null}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-semibold text-foreground">{title}</h2>
            {space?.kind === "dm" ? (
              <p className="truncate text-xs text-muted-foreground">
                {(() => {
                  const peerId = space.peer?.id;
                  const p = peerId ? presence.data?.find((item) => item.userId === peerId) : null;
                  if (p?.status === "online") return <span className="inline-flex items-center gap-1"><Circle className="size-2 fill-success text-success" />Online</span>;
                  if (p?.status === "away") return <span className="inline-flex items-center gap-1"><Circle className="size-2 fill-warning text-warning" />Away</span>;
                  return "Direct message";
                })()}
              </p>
            ) : null}
            {space?.kind === "group" ? (
              <p className="truncate text-xs text-muted-foreground">Group · {space.memberCount} people</p>
            ) : null}
            {isChannel(space?.kind) ? (
              <p className="truncate text-xs text-muted-foreground">
                {space.topic || "No topic yet"} · <span className="inline-flex items-center gap-1"><Users className="size-3" />{space.memberCount}</span>
              </p>
            ) : null}
          </div>
          {space ? (
            call.spaceId === space.id ? (
              <Button size="sm" variant="destructive" aria-label="Leave call" onClick={() => void call.leave()}>
                <PhoneOff className="size-3.5" /> <span className="hidden sm:inline">Leave call</span>
              </Button>
            ) : (
              <Button
                size="sm"
                variant={space.inCall.length > 0 ? "default" : "secondary"}
                onClick={() => void call.join(space.id, space.title)}
                disabled={call.joining}
                aria-label={space.inCall.length > 0 ? `Join call, ${space.inCall.length} in it` : "Start a call"}
              >
                {space.inCall.length > 0 ? <Headphones className="size-3.5" /> : <Phone className="size-3.5" />}
                <span className="hidden sm:inline">{space.inCall.length > 0 ? `Join call · ${space.inCall.length}` : "Call"}</span>
              </Button>
            )
          ) : null}
          {space && (isChannel(space.kind) || space.kind === "group") && space.joined ? (
            <Button variant="ghost" size="icon" aria-label="Pinned messages" aria-pressed={pinnedOpen} onClick={() => setPinnedOpen((open) => !open)}>
              <Pin className="size-4" />
            </Button>
          ) : null}
          {space && (isChannel(space.kind) || space.kind === "group") && space.joined ? (
            <Button variant="ghost" size="icon" aria-label="Add people" onClick={() => setAddingMember(true)}>
              <UserPlus className="size-4" />
            </Button>
          ) : null}
          <Button variant="ghost" size="icon" aria-label="Your threads" aria-pressed={threadsOpen} onClick={() => setThreadsOpen((open) => !open)}>
            <ThreadIcon className="size-4" />
          </Button>
          {space && (isChannel(space.kind) || space.kind === "group") ? (
            <Button variant="ghost" size="icon" aria-label="Channel details" onClick={() => setDetailOpen(true)}>
              <Info className="size-4" />
            </Button>
          ) : null}
          <Button variant="ghost" size="icon" aria-label="Scheduled messages" onClick={() => setScheduledOpen(true)}>
            <Clock className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Saved messages" aria-pressed={savedOpen} onClick={() => setSavedOpen((open) => !open)}>
            <Bookmark className="size-4" />
          </Button>
          {selected ? (
            <Button variant="ghost" size="icon" aria-label="Media gallery" aria-pressed={mediaOpen} onClick={() => setMediaOpen((open) => !open)}>
              <ImageIcon className="size-4" />
            </Button>
          ) : null}
          <Button variant="ghost" size="icon" aria-label="Search team messages" aria-pressed={searchOpen} onClick={() => setSearchOpen((open) => !open)}>
            <Search className="size-4" />
          </Button>
          {isChannel(space?.kind) && space.joined ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Conversation menu">
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {space?.kind === "voice" || space?.inCall?.length ? (
                  <DropdownMenuItem onSelect={() => setCallHistoryOpen(true)}>
                    <Clock className="size-3.5" /> Call history
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onSelect={() => setStatusOpen(true)}>
                  <Smile className="size-3.5" /> Set your status
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void changeMembership("leave")}>
                  <LogOut className="size-3.5" /> Leave channel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </header>

        {searchOpen ? (
          <SearchPanel
            query={query}
            term={term}
            hits={hits}
            people={people.data ?? []}
            filterUser={filterUser}
            filterDateFrom={filterDateFrom}
            filterDateTo={filterDateTo}
            inThisChat={inThisChat}
            hasSelected={Boolean(selected)}
            onFilterUser={setFilterUser}
            onFilterDateFrom={setFilterDateFrom}
            onFilterDateTo={setFilterDateTo}
            onInThisChat={setInThisChat}
            onQuery={(value) => { setQuery(value); }}
            onOpen={(hit) => { choose(hit.spaceId); setSearchOpen(false); setQuery(""); setTerm(""); setFilterUser(null); setFilterDateFrom(""); setFilterDateTo(""); setInThisChat(false); }}
            onClose={() => { setSearchOpen(false); setQuery(""); setTerm(""); setFilterUser(null); setFilterDateFrom(""); setFilterDateTo(""); setInThisChat(false); }}
          />
        ) : !selected ? (
          <EmptyPanel
            title="Pick a channel or start a message"
            text="Channels are open to everyone in the company. Direct messages are only seen by the two people in them."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button size="sm" onClick={() => setPicking(true)}>
                  <Plus className="size-3.5" /> New message
                </Button>
              </div>
            }
          />
        ) : (
          <div className="flex min-h-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col">
              {space ? (call.spaceId === space.id ? <CallPanel /> : <CallBanner space={space} />) : null}
              <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-surface-2/60">
                {messages.loading && !messages.data ? (
                  <p className="px-6 py-10 text-center text-sm text-muted-foreground">Loading messages…</p>
                ) : messages.error ? (
                  <p className="px-6 py-10 text-center text-sm text-destructive">{messages.error}</p>
                ) : (
                  <MessageList
                    messages={messages.data ?? []}
                    emptyText={isChannel(space?.kind) ? `No messages in #${space.name} yet. Say hello.` : "No messages yet. Say hello."}
                    onOpenThread={setThreadId}
                    onChanged={() => { reloadMessages(); reloadReplies(); }}
                    onForward={(id) => setForwardingId(id)}
                    onShowProfile={setProfileUser}
                    activeThreadId={threadId}
                    showAuthors={space?.kind !== "dm"}
                    canInteract={Boolean(space?.canPost && (space.joined || !isChannel(space.kind)))}
                  />
                )}
              </div>
              {space && !space.canPost ? (
                <div className="flex items-center justify-center gap-2 border-t border-border bg-surface px-4 py-3 text-sm text-muted-foreground" role="note">
                  <Megaphone className="size-4" /> Only admins post announcements here. You get an alert and an email for each one.
                </div>
              ) : space && isChannel(space.kind) && !space.joined ? (
                <div className="flex flex-wrap items-center justify-center gap-3 border-t border-border bg-surface px-4 py-3 text-sm">
                  <span className="text-muted-foreground">You are viewing #{space.name}. Join to chat here.</span>
                  <Button size="sm" onClick={() => void changeMembership("join")}>
                    <LogIn className="size-3.5" /> Join channel
                  </Button>
                </div>
              ) : (
                <>
                  {typing.length > 0 ? (
                    <div className="flex items-center gap-2 border-t border-border bg-surface px-4 py-1 text-xs text-muted-foreground">
                      <span className="inline-flex gap-0.5">
                        <span className="animate-bounce text-accent" style={{ animationDelay: "0ms" }}>.</span>
                        <span className="animate-bounce text-accent" style={{ animationDelay: "150ms" }}>.</span>
                        <span className="animate-bounce text-accent" style={{ animationDelay: "300ms" }}>.</span>
                      </span>
                      {typingLabel(typing)}
                    </div>
                  ) : null}
                  <Composer
                    placeholder={space?.announcements ? "Write an announcement; everyone gets it by email too" : space ? `Message ${isChannel(space.kind) ? `#${space.name}` : space.title}` : "Message"}
                    autoFocusKey={selected}
                    disabled={!space}
                    onSend={(body, file) => send(body, undefined, file)}
                    onTyping={sendTyping}
                    onSchedule={(body) => setSchedulingBody(body)}
                    extra={space ? (
                      <PostMenu
                        spaceId={space.id}
                        people={(people.data ?? []).filter((person) => String(person.id) !== session.user.id)}
                        canAnnounce={isChannel(space.kind) && hasPermission(session.permissions, "announcements:post")}
                        onPosted={() => { reloadMessages(); reloadChannels(); }}
                      />
                    ) : null}
                  />
                </>
              )}
            </div>

            {threadId ? (
              <aside className="fixed inset-0 z-40 flex flex-col bg-background md:static md:z-auto md:w-96 md:shrink-0 md:border-l md:border-border">
                <div className="flex h-14 items-center justify-between border-b border-border px-4">
                  <div>
                    <p className="text-sm font-semibold">Thread</p>
                    {threadRoot ? <p className="max-w-[280px] truncate text-xs text-muted-foreground">{threadRoot.body}</p> : null}
                  </div>
                  <Button variant="ghost" size="icon" aria-label="Close thread" onClick={() => setThreadId(null)}>
                    <X className="size-4" />
                  </Button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <MessageList
                    messages={replies.data ?? []}
                    emptyText="No replies yet. Start the thread."
                    onOpenThread={setThreadId}
                    onChanged={() => { reloadReplies(); reloadMessages(); }}
                    canInteract={Boolean(space?.canPost && (space.joined || !isChannel(space.kind)))}
                  />
                </div>
                {space?.canPost && (space.joined || !isChannel(space.kind)) ? (
                  <Composer
                    placeholder="Reply to the thread"
                    autoFocusKey={threadId}
                    disabled={!space}
                    allowFiles={false}
                    onSend={(body) => send(body, threadId)}
                  />
                ) : (
                  <div className="flex items-center justify-center gap-2 border-t border-border bg-surface px-4 py-3 text-sm text-muted-foreground" role="note">
                    Only admins can reply to announcements here.
                  </div>
                )}
              </aside>
            ) : null}
          </div>
        )}
      </section>

      {pinnedOpen && selected ? (
        <PinnedPanel
          messages={pinned.data ?? []}
          loading={pinned.loading && !pinned.data}
          onClose={() => setPinnedOpen(false)}
          onChanged={() => { pinned.reload(); reloadMessages(); }}
        />
      ) : null}

      {addingMember && space && (isChannel(space.kind) || space.kind === "group") ? (
        <AddMemberDialog
          open={addingMember}
          onOpenChange={setAddingMember}
          spaceId={space.id}
          people={(people.data ?? []).filter((person) => String(person.id) !== session.user.id)}
          onAdded={() => { reloadChannels(); reloadDirect(); setAddingMember(false); }}
          kind={space.kind as "channel" | "group" | "voice"}
        />
      ) : null}

      {callHistoryOpen && selected ? (
        <CallHistoryDialog
          events={callHistory.data ?? []}
          loading={callHistory.loading && !callHistory.data}
          onClose={() => setCallHistoryOpen(false)}
        />
      ) : null}

      {savedOpen ? (
        <SavedPanel
          messages={saved.data ?? []}
          loading={saved.loading && !saved.data}
          onClose={() => setSavedOpen(false)}
          onChanged={() => { saved.reload(); reloadMessages(); }}
          onOpen={(spaceId) => { choose(spaceId); setSavedOpen(false); }}
        />
      ) : null}

      {forwardingId ? (
        <ForwardDialog
          messageId={forwardingId}
          spaces={all}
          onClose={() => setForwardingId(null)}
          onForwarded={() => { setForwardingId(null); reloadMessages(); }}
        />
      ) : null}

      {threadsOpen ? (
        <ThreadsPanel
          messages={threads.data ?? []}
          loading={threads.loading && !threads.data}
          onClose={() => setThreadsOpen(false)}
          onOpen={(spaceId, msgId) => { choose(spaceId); setThreadId(msgId); setThreadsOpen(false); }}
        />
      ) : null}

      {statusOpen ? (
        <StatusDialog
          onClose={() => setStatusOpen(false)}
          currentPresence={presence.data?.find((p) => String(p.userId) === session.user.id)}
          onSaved={() => { setStatusOpen(false); reloadPresence(); }}
        />
      ) : null}

      {detailOpen ? (
        <ChannelDetailPanel
          detail={detail.data}
          loading={detail.loading && !detail.data}
          onClose={() => setDetailOpen(false)}
          onTopicSaved={() => { detail.reload(); reloadChannels(); }}
        />
      ) : null}

      {schedulingBody !== null ? (
        <ScheduleDialog
          body={schedulingBody}
          onClose={() => setSchedulingBody(null)}
          onSchedule={scheduleSend}
        />
      ) : null}

      {scheduledOpen ? (
        <ScheduledPanel
          messages={scheduled.data ?? []}
          loading={scheduled.loading && !scheduled.data}
          onClose={() => setScheduledOpen(false)}
          onChanged={() => scheduled.reload()}
        />
      ) : null}

      {mediaOpen && selected ? (
        <MediaGalleryPanel
          items={media.data ?? []}
          loading={media.loading && !media.data}
          onClose={() => setMediaOpen(false)}
        />
      ) : null}

      {profileUser !== null ? (
        <ProfileCard
          userId={profileUser}
          people={people.data ?? []}
          presence={presence.data ?? []}
          onClose={() => setProfileUser(null)}
          onStartDm={async (uid) => {
            setProfileUser(null);
            await openConversation([uid]);
          }}
        />
      ) : null}

      <CreateChannelDialog open={creating} onOpenChange={setCreating} onCreate={createChannel} />
      <PeopleDialog
        open={picking}
        onOpenChange={setPicking}
        people={(people.data ?? []).filter((person) => String(person.id) !== session.user.id)}
        onStart={openConversation}
      />
    </div>
  );
}

function ConversationAvatar({ space }: { space: TeamSpace }) {
  const label = isChannel(space.kind) ? space.name ?? "" : space.title;
  return (
    <span className="hidden sm:inline-flex">
      <ChatAvatar item={space} label={label} />
    </span>
  );
}

function EmptyPanel({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-base font-semibold">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{text}</p>
      {action}
    </div>
  );
}

function CreateChannelDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string, topic: string, isPrivate: boolean) => Promise<void>;
}) {
  const [name, setName] = React.useState("");
  const [topic, setTopic] = React.useState("");
  const [isPrivate, setIsPrivate] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const normalized = name.trim().toLowerCase().replace(/\s+/g, "-");
  const valid = CHANNEL_NAME.test(normalized);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    try {
      await onCreate(normalized, topic.trim(), isPrivate);
      setName("");
      setTopic("");
      setIsPrivate(false);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Create a channel</DialogTitle>
            <DialogDescription>
              A public channel is visible to everyone. A private channel is only visible to its members. Lowercase letters, numbers and dashes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="channel-name">Name</Label>
            <div className="flex items-center gap-1.5">
              <Hash className="size-4 text-muted-foreground" />
              <Input id="channel-name" autoFocus placeholder="e.g. sales-floor" value={name} onChange={(event) => setName(event.target.value)} aria-invalid={name.length > 0 && !valid} />
            </div>
            {name.length > 0 && !valid ? <p className="text-xs text-destructive">Use 2 to 40 letters, numbers or dashes, starting with a letter or number.</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="channel-topic">Topic (optional)</Label>
            <Textarea id="channel-topic" rows={2} maxLength={200} placeholder="What is this channel for?" value={topic} onChange={(event) => setTopic(event.target.value)} />
          </div>
          <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2.5">
            <input type="checkbox" checked={isPrivate} onChange={(event) => setIsPrivate(event.target.checked)} className="size-4 accent-accent" />
            <div className="flex-1">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Lock className="size-3.5" /> Private channel
              </span>
              <span className="text-xs text-muted-foreground">Only invited members can see and find it</span>
            </div>
          </label>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!valid || busy}>Create channel</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PeopleDialog({
  open,
  onOpenChange,
  people,
  onStart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  people: TeamPerson[];
  onStart: (ids: number[]) => Promise<void>;
}) {
  const [query, setQuery] = React.useState("");
  const [picked, setPicked] = React.useState<number[]>([]);
  const [busy, setBusy] = React.useState(false);

  const statusOrder = { online: 0, away: 1, offline: 2, "": 3 } as const;
  const sorted = [...people].sort((a, b) => {
    const sa = statusOrder[(a.status ?? "") as keyof typeof statusOrder] ?? 3;
    const sb = statusOrder[(b.status ?? "") as keyof typeof statusOrder] ?? 3;
    return sa - sb || a.name.localeCompare(b.name);
  });
  const shown = sorted.filter((person) => person.name.toLowerCase().includes(query.toLowerCase()));
  const chosen = people.filter((person) => picked.includes(person.id));
  const onlineCount = people.filter((p) => p.status === "online").length;

  function toggle(id: number) {
    setPicked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function start() {
    if (!picked.length || busy) return;
    setBusy(true);
    try {
      await onStart(picked);
      setPicked([]);
      setQuery("");
    } finally {
      setBusy(false);
    }
  }

  const action =
    picked.length === 0
      ? "Choose people"
      : picked.length === 1
        ? "Start direct message"
        : `Start group with ${picked.length} people`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New message or group</DialogTitle>
          <DialogDescription>
            Pick one person for a DM, or several for a group.
            {onlineCount > 0 ? <span className="ml-1 text-success">{onlineCount} online</span> : null}
          </DialogDescription>
        </DialogHeader>
        <Input autoFocus placeholder="Search people" aria-label="Search people" value={query} onChange={(event) => setQuery(event.target.value)} />

        {chosen.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {chosen.map((person) => (
              <button
                key={person.id}
                type="button"
                onClick={() => toggle(person.id)}
                className="inline-flex items-center gap-1 rounded-full bg-accent-muted px-2.5 py-0.5 text-xs font-medium text-accent"
              >
                {person.name}
                <X className="size-3" />
              </button>
            ))}
          </div>
        ) : null}

        <ul className="max-h-72 space-y-0.5 overflow-y-auto">
          {shown.length === 0 ? <li className="px-2 py-3 text-sm text-muted-foreground">No one matches. Invite teammates from People &amp; Access.</li> : null}
          {shown.map((person) => {
            const on = picked.includes(person.id);
            return (
              <li key={person.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(person.id)}
                  className={cn("flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-surface-2", on && "bg-accent-muted")}
                >
                  <span className="relative">
                    <Avatar className="size-8">
                      <AvatarFallback className="text-[10px]">{initials(person.name)}</AvatarFallback>
                    </Avatar>
                    {person.status === "online" ? (
                      <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background bg-green-500" />
                    ) : person.status === "away" ? (
                      <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background bg-yellow-500" />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{person.name}</span>
                    {person.statusText ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {person.statusEmoji ? `${person.statusEmoji} ` : ""}{person.statusText}
                      </span>
                    ) : person.status === "offline" || !person.status ? (
                      <span className="block text-xs text-muted-foreground">Offline</span>
                    ) : null}
                  </span>
                  {person.dnd ? <BellOff className="size-3.5 shrink-0 text-muted-foreground" /> : null}
                  {on ? <Check className="size-4 text-accent" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void start()} disabled={!picked.length || busy}>{action}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function highlight(text: string, term: string) {
  if (!term) return text;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return parts.map((part, index) =>
    part.toLowerCase() === term.toLowerCase() ? (
      <mark key={index} className="rounded bg-warning-muted px-0.5 text-foreground">{part}</mark>
    ) : (
      <React.Fragment key={index}>{part}</React.Fragment>
    ),
  );
}

function SearchPanel({
  query,
  term,
  hits,
  people,
  filterUser,
  filterDateFrom,
  filterDateTo,
  inThisChat,
  hasSelected,
  onFilterUser,
  onFilterDateFrom,
  onFilterDateTo,
  onInThisChat,
  onQuery,
  onOpen,
  onClose,
}: {
  query: string;
  term: string;
  hits: { data?: TeamSearchHit[]; error?: string; loading: boolean };
  people: TeamPerson[];
  filterUser: number | null;
  filterDateFrom: string;
  filterDateTo: string;
  inThisChat: boolean;
  hasSelected: boolean;
  onFilterUser: (v: number | null) => void;
  onFilterDateFrom: (v: string) => void;
  onFilterDateTo: (v: string) => void;
  onInThisChat: (v: boolean) => void;
  onQuery: (value: string) => void;
  onOpen: (hit: TeamSearchHit) => void;
  onClose: () => void;
}) {
  const hasFilters = filterUser !== null || filterDateFrom || filterDateTo;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border p-3">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <Input
          autoFocus
          aria-label="Search team messages"
          placeholder="Search channels and your conversations"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
          }}
        />
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <select
          aria-label="Filter by person"
          value={filterUser ?? ""}
          onChange={(e) => onFilterUser(e.target.value ? Number(e.target.value) : null)}
          className="h-7 rounded-md border border-border bg-transparent px-2 text-xs text-foreground"
        >
          <option value="">Anyone</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <Input
          type="date"
          aria-label="From date"
          value={filterDateFrom}
          onChange={(e) => onFilterDateFrom(e.target.value)}
          className="h-7 w-32 text-xs"
          placeholder="From"
        />
        <Input
          type="date"
          aria-label="To date"
          value={filterDateTo}
          onChange={(e) => onFilterDateTo(e.target.value)}
          className="h-7 w-32 text-xs"
          placeholder="To"
        />
        {hasSelected ? (
          <label className="flex cursor-pointer items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={inThisChat}
              onChange={(e) => onInThisChat(e.target.checked)}
              className="size-3.5 accent-accent"
            />
            In this chat
          </label>
        ) : null}
        {hasFilters ? (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { onFilterUser(null); onFilterDateFrom(""); onFilterDateTo(""); }}>
            <X className="mr-1 size-3" /> Clear
          </Button>
        ) : null}
      </div>

      <SearchResults term={term} hits={hits} onOpen={onOpen} />
    </div>
  );
}

type SearchTab = "all" | "messages" | "images" | "docs" | "links";
const SEARCH_TABS: Array<{ key: SearchTab; label: string }> = [
  { key: "all", label: "All" },
  { key: "messages", label: "Messages" },
  { key: "images", label: "Images" },
  { key: "docs", label: "Docs" },
  { key: "links", label: "Links" },
];

const IMAGE_EXTS = /\.(png|jpg|jpeg|gif|webp)$/i;
const DOC_EXTS = /\.(pdf|docx?|xlsx?|csv|txt|pptx?)$/i;
const URL_RE = /https?:\/\/\S+/;

function classifyHit(hit: TeamSearchHit): Set<SearchTab> {
  const tags = new Set<SearchTab>(["all", "messages"]);
  const hasImage = hit.message.attachments.some((a) => a.isImage || IMAGE_EXTS.test(a.filename));
  const hasDoc = hit.message.attachments.some((a) => !a.isImage && DOC_EXTS.test(a.filename));
  const hasLink = URL_RE.test(hit.message.body ?? "");
  if (hasImage) tags.add("images");
  if (hasDoc) tags.add("docs");
  if (hasLink) tags.add("links");
  return tags;
}

function SearchResults({ term, hits, onOpen }: {
  term: string;
  hits: { data?: TeamSearchHit[]; error?: string; loading: boolean };
  onOpen: (hit: TeamSearchHit) => void;
}) {
  const [tab, setTab] = React.useState<SearchTab>("all");

  const filtered = React.useMemo(() => {
    if (!hits.data) return [];
    if (tab === "all") return hits.data;
    return hits.data.filter((h) => classifyHit(h).has(tab));
  }, [hits.data, tab]);

  const counts = React.useMemo(() => {
    const c: Record<SearchTab, number> = { all: 0, messages: 0, images: 0, docs: 0, links: 0 };
    for (const h of hits.data ?? []) {
      const tags = classifyHit(h);
      for (const t of tags) c[t]++;
    }
    return c;
  }, [hits.data]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {term.length < 2 ? (
        <p className="px-2 py-6 text-center text-sm text-muted-foreground">Type at least two characters to search.</p>
      ) : hits.error ? (
        <p className="px-2 py-6 text-center text-sm text-destructive">{hits.error}</p>
      ) : hits.loading && !hits.data ? (
        <p className="px-2 py-6 text-center text-sm text-muted-foreground">Searching…</p>
      ) : !hits.data?.length ? (
        <p className="px-2 py-6 text-center text-sm text-muted-foreground">No messages match &ldquo;{term}&rdquo;.</p>
      ) : (
        <>
          <div className="flex gap-1 border-b border-border px-3 py-1.5">
            {SEARCH_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                  tab === t.key ? "bg-accent text-white" : "text-muted-foreground hover:bg-surface-2",
                  counts[t.key] === 0 && t.key !== "all" && "hidden",
                )}
              >
                {t.label}{counts[t.key] > 0 ? ` · ${counts[t.key]}` : ""}
              </button>
            ))}
          </div>
          <ul className="space-y-1 p-3">
            {filtered.map((hit) => (
              <li key={hit.message.id}>
                <button
                  type="button"
                  onClick={() => onOpen(hit)}
                  className="w-full rounded-md px-3 py-2.5 text-left hover:bg-surface-2"
                >
                  <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
                    <span className="truncate font-medium text-foreground">{hit.spaceLabel}</span>
                    <time dateTime={hit.message.createdAt} className="shrink-0">
                      {new Date(hit.message.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </time>
                  </div>
                  {hit.message.attachments.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {hit.message.attachments.map((a) => (
                        <span key={a.id} className={cn(
                          "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                          a.isImage ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-accent/10 text-accent",
                        )}>
                          {a.isImage ? "📷" : "📄"} {a.filename.length > 20 ? `${a.filename.slice(0, 17)}…` : a.filename}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <p className="mt-1 line-clamp-2 text-sm text-foreground">{highlight(hit.message.body ?? "", term)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{hit.message.author.name}</p>
                </button>
              </li>
            ))}
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No {tab} match &ldquo;{term}&rdquo;.</p>
            ) : null}
          </ul>
        </>
      )}
    </div>
  );
}

function PinnedPanel({
  messages,
  loading,
  onClose,
  onChanged,
}: {
  messages: TeamMessage[];
  loading: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  async function unpinMessage(id: string) {
    try {
      await api(`/team/messages/${id}/unpin`, { method: "POST" });
      onChanged();
      toast.success("Message unpinned");
    } catch (error) {
      toast.error(errorText(error));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[80dvh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Pin className="size-4" /> Pinned messages</DialogTitle>
          <DialogDescription>Messages pinned to this channel.</DialogDescription>
        </DialogHeader>
        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No pinned messages yet. Pin important messages from the message menu.</p>
          ) : (
            <ul className="space-y-2">
              {messages.map((msg) => (
                <li key={msg.id} className="rounded-md border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground">{msg.author.name}</p>
                      <p className="mt-0.5 text-sm text-foreground">{msg.body}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(msg.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        {msg.pinnedBy ? ` · Pinned by ${msg.pinnedBy.name}` : null}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" className="shrink-0 text-xs" onClick={() => void unpinMessage(msg.id)}>
                      Unpin
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddMemberDialog({
  open,
  onOpenChange,
  spaceId,
  people,
  onAdded,
  kind = "channel",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  people: TeamPerson[];
  onAdded: () => void;
  kind?: "channel" | "group" | "voice";
}) {
  const [query, setQuery] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const shown = people.filter((person) => person.name.toLowerCase().includes(query.toLowerCase()));
  const label = kind === "group" ? "group" : "channel";

  async function addPerson(userId: number) {
    if (busy) return;
    setBusy(true);
    try {
      await api(`/team/spaces/${spaceId}/members`, {
        method: "POST",
        body: JSON.stringify({ user_id: userId }),
      });
      toast.success(`Person added to ${label}`);
      onAdded();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserPlus className="size-4" /> Add people</DialogTitle>
          <DialogDescription>Add a teammate to this {label}.</DialogDescription>
        </DialogHeader>
        <Input autoFocus placeholder="Search people" aria-label="Search people" value={query} onChange={(event) => setQuery(event.target.value)} />
        <ul className="max-h-72 space-y-0.5 overflow-y-auto">
          {shown.length === 0 ? <li className="px-2 py-3 text-sm text-muted-foreground">No one matches.</li> : null}
          {shown.map((person) => (
            <li key={person.id}>
              <button
                type="button"
                onClick={() => void addPerson(person.id)}
                disabled={busy}
                className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-surface-2"
              >
                <Avatar className="size-7">
                  <AvatarFallback className="text-[10px]">{initials(person.name)}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate">{person.name}</span>
                <UserPlus className="size-3.5 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SavedPanel({
  messages,
  loading,
  onClose,
  onChanged,
  onOpen,
}: {
  messages: TeamMessage[];
  loading: boolean;
  onClose: () => void;
  onChanged: () => void;
  onOpen: (spaceId: string) => void;
}) {
  async function unsaveMessage(id: string) {
    try {
      await api(`/team/messages/${id}/unsave`, { method: "POST" });
      onChanged();
      toast.success("Removed from saved");
    } catch (error) {
      toast.error(errorText(error));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[80dvh] overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Bookmark className="size-4" /> Saved messages</DialogTitle>
          <DialogDescription>Messages you bookmarked for later.</DialogDescription>
        </DialogHeader>
        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No saved messages yet. Bookmark messages from the message menu.</p>
          ) : (
            <ul className="space-y-2">
              {messages.map((msg) => (
                <li key={msg.id} className="rounded-md border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(msg.spaceId)}>
                      <p className="text-xs font-medium text-foreground">{msg.author.name}</p>
                      <p className="mt-0.5 line-clamp-3 text-sm text-foreground">{msg.body}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(msg.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </button>
                    <Button variant="ghost" size="sm" className="shrink-0 text-xs" onClick={() => void unsaveMessage(msg.id)}>
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ForwardDialog({
  messageId,
  spaces,
  onClose,
  onForwarded,
}: {
  messageId: string;
  spaces: TeamSpace[];
  onClose: () => void;
  onForwarded: () => void;
}) {
  const [query, setQuery] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const term = query.trim().toLowerCase();
  const filtered = spaces.filter((s) =>
    `${s.title} ${s.name ?? ""}`.toLowerCase().includes(term),
  );

  async function forward(toSpaceId: string) {
    if (busy) return;
    setBusy(true);
    try {
      await api(`/team/messages/${messageId}/forward`, {
        method: "POST",
        body: JSON.stringify({ to_space_id: Number(toSpaceId) }),
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      toast.success("Message forwarded");
      onForwarded();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Forward className="size-4" /> Forward message</DialogTitle>
          <DialogDescription>Choose where to forward this message.</DialogDescription>
        </DialogHeader>
        <Input autoFocus placeholder="Search channels and conversations" value={query} onChange={(e) => setQuery(e.target.value)} />
        <ul className="max-h-72 overflow-y-auto">
          {filtered.length === 0 ? (
            <li className="py-4 text-center text-sm text-muted-foreground">No matches</li>
          ) : filtered.slice(0, 20).map((s) => (
            <li key={s.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => void forward(s.id)}
                className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-surface-2"
              >
                <ChatAvatar item={s} label={isChannel(s.kind) ? s.name ?? "" : s.title} />
                <span className="min-w-0 flex-1 truncate">
                  {isChannel(s.kind) ? `${s.private ? "🔒" : "#"}${s.name}` : s.title}
                </span>
                <Forward className="size-3.5 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ThreadsPanel({
  messages,
  loading,
  onClose,
  onOpen,
}: {
  messages: TeamMessage[];
  loading: boolean;
  onClose: () => void;
  onOpen: (spaceId: string, msgId: string) => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[80dvh] overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ThreadIcon className="size-4" /> Your threads</DialogTitle>
          <DialogDescription>Conversations you have replied in.</DialogDescription>
        </DialogHeader>
        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No threads yet. Reply to a message to start a thread.</p>
          ) : (
            <ul className="space-y-2">
              {messages.map((msg) => (
                <li key={msg.id} className="rounded-md border border-border p-3">
                  <button type="button" className="w-full text-left" onClick={() => onOpen(msg.spaceId, msg.id)}>
                    <p className="text-xs font-medium text-foreground">{msg.author.name}</p>
                    <p className="mt-0.5 line-clamp-2 text-sm text-foreground">{msg.body}</p>
                    <p className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{new Date(msg.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                      {msg.replyCount > 0 ? <span className="inline-flex items-center gap-1"><ThreadIcon className="size-3" />{msg.replyCount} {msg.replyCount === 1 ? "reply" : "replies"}</span> : null}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatusDialog({
  onClose,
  currentPresence,
  onSaved,
}: {
  onClose: () => void;
  currentPresence?: TeamPresence;
  onSaved: () => void;
}) {
  const [text, setText] = React.useState(currentPresence?.statusText ?? "");
  const [emoji, setEmoji] = React.useState(currentPresence?.statusEmoji ?? "");
  const [dnd, setDnd] = React.useState(currentPresence?.dnd ?? false);
  const [busy, setBusy] = React.useState(false);

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      await api("/team/status", {
        method: "POST",
        body: JSON.stringify({ status_text: text.trim(), status_emoji: emoji.trim(), dnd }),
      });
      toast.success("Status updated");
      onSaved();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Smile className="size-4" /> Set your status</DialogTitle>
          <DialogDescription>Let your team know what you are up to.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Emoji"
              aria-label="Status emoji"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              className="w-16 text-center text-lg"
              maxLength={4}
            />
            <Input
              autoFocus
              placeholder="What's your status?"
              aria-label="Status text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={100}
            />
          </div>
          <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2.5">
            <input type="checkbox" checked={dnd} onChange={(e) => setDnd(e.target.checked)} className="size-4 accent-accent" />
            <div className="flex-1">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <BellOff className="size-3.5" /> Do Not Disturb
              </span>
              <span className="text-xs text-muted-foreground">Pause notifications</span>
            </div>
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} disabled={busy}>Save status</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChannelDetailPanel({
  detail,
  loading,
  onClose,
  onTopicSaved,
}: {
  detail: SpaceDetail | undefined;
  loading: boolean;
  onClose: () => void;
  onTopicSaved: () => void;
}) {
  const session = useSession();
  const [editingTopic, setEditingTopic] = React.useState(false);
  const [topic, setTopic] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [removing, setRemoving] = React.useState<number | null>(null);
  const isCreator = detail ? String(detail.createdBy.id) === session.user.id : false;

  async function saveTopic() {
    if (!detail || saving) return;
    setSaving(true);
    try {
      await api(`/team/spaces/${detail.id}/topic`, {
        method: "PATCH",
        body: JSON.stringify({ topic }),
      });
      toast.success("Topic updated");
      setEditingTopic(false);
      onTopicSaved();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setSaving(false);
    }
  }

  async function leaveSpace() {
    if (!detail || saving) return;
    setSaving(true);
    try {
      await api(`/team/channels/${detail.id}/leave`, { method: "POST" });
      toast.success(`Left ${detail.kind === "group" ? "group" : `#${detail.name}`}`);
      onTopicSaved();
      onClose();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setSaving(false);
    }
  }

  async function removeMember(userId: number) {
    if (!detail) return;
    setRemoving(userId);
    try {
      await api(`/team/spaces/${detail.id}/members/${userId}`, { method: "DELETE" });
      toast.success("Member removed");
      onTopicSaved();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setRemoving(null);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[85dvh] overflow-hidden sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {detail?.kind === "group" ? <Users className="size-4" /> : detail?.private ? <Lock className="size-4" /> : <Hash className="size-4" />}
            {detail?.kind === "group" ? "Group details" : detail?.name ?? "Channel details"}
          </DialogTitle>
          <DialogDescription>
            {detail ? `${detail.memberCount} member${detail.memberCount === 1 ? "" : "s"} · Created ${new Date(detail.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : "Loading…"}
          </DialogDescription>
        </DialogHeader>

        {loading && !detail ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : detail ? (
          <div className="max-h-[60dvh] space-y-4 overflow-y-auto">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase text-muted-foreground">Topic</p>
                {!editingTopic ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => { setTopic(detail.topic); setEditingTopic(true); }}
                  >
                    Edit
                  </Button>
                ) : null}
              </div>
              {editingTopic ? (
                <div className="space-y-2">
                  <Input
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="Add a topic"
                    maxLength={200}
                  />
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => void saveTopic()} disabled={saving}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingTopic(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-foreground">{detail.topic || "No topic set"}</p>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium uppercase text-muted-foreground">Created by</p>
              <p className="text-sm text-foreground">{detail.createdBy.name}</p>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Members ({detail.memberCount})
              </p>
              <ul className="space-y-1">
                {detail.members.map((m) => (
                  <li key={m.userId} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2">
                    <span className="relative">
                      <Avatar className="size-7">
                        <AvatarFallback className="text-[10px]">{initials(m.name)}</AvatarFallback>
                      </Avatar>
                      {m.status === "online" ? (
                        <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background bg-green-500" />
                      ) : m.status === "away" ? (
                        <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background bg-yellow-500" />
                      ) : null}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">
                        {m.name}
                        {m.role === "creator" ? <span className="ml-1 text-[10px] text-muted-foreground">(creator)</span> : null}
                      </p>
                      {m.statusText ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {m.statusEmoji ? `${m.statusEmoji} ` : ""}{m.statusText}
                        </p>
                      ) : null}
                    </div>
                    {m.dnd ? <BellOff className="size-3 shrink-0 text-muted-foreground" /> : null}
                    {isCreator && String(m.userId) !== session.user.id ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                        aria-label={`Remove ${m.name}`}
                        disabled={removing === m.userId}
                        onClick={() => void removeMember(m.userId)}
                      >
                        <X className="size-3" />
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>

            {!detail.announcements ? (
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 text-destructive hover:text-destructive"
                onClick={() => void leaveSpace()}
                disabled={saving}
              >
                <LogOut className="size-4" /> Leave {detail.kind === "group" ? "group" : "channel"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ScheduleDialog({
  body,
  onClose,
  onSchedule,
}: {
  body: string;
  onClose: () => void;
  onSchedule: (body: string, sendAt: string) => Promise<void>;
}) {
  const [date, setDate] = React.useState("");
  const [time, setTime] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!date || !time || busy) return;
    setBusy(true);
    try {
      const sendAt = new Date(`${date}T${time}`).toISOString();
      await onSchedule(body, sendAt);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Clock className="size-4" /> Schedule message</DialogTitle>
            <DialogDescription>Choose when to send this message.</DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-border bg-surface-2 p-2 text-sm">{body.length > 100 ? `${body.slice(0, 97)}…` : body}</div>
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="sched-date">Date</Label>
              <Input id="sched-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="flex-1 space-y-1">
              <Label htmlFor="sched-time">Time</Label>
              <Input id="sched-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!date || !time || busy}>Schedule</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ScheduledPanel({
  messages,
  loading,
  onClose,
  onChanged,
}: {
  messages: TeamScheduledMessage[];
  loading: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  async function cancel(id: string) {
    try {
      await api(`/team/scheduled/${id}`, { method: "DELETE" });
      onChanged();
      toast.success("Scheduled message cancelled");
    } catch (error) {
      toast.error(errorText(error));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[80dvh] overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Clock className="size-4" /> Scheduled messages</DialogTitle>
          <DialogDescription>Messages waiting to be sent.</DialogDescription>
        </DialogHeader>
        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No scheduled messages.</p>
          ) : (
            <ul className="space-y-2">
              {messages.map((msg) => (
                <li key={msg.id} className="rounded-md border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm text-foreground">{msg.body}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Sends {new Date(msg.sendAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" className="shrink-0 text-xs text-destructive" onClick={() => void cancel(msg.id)}>
                      Cancel
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MediaGalleryPanel({
  items,
  loading,
  onClose,
}: {
  items: TeamAttachment[];
  loading: boolean;
  onClose: () => void;
}) {
  const images = React.useMemo(() => items.filter((a) => a.contentType.startsWith("image/")), [items]);
  const docs = React.useMemo(() => items.filter((a) => !a.contentType.startsWith("image/")), [items]);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[85dvh] overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ImageIcon className="size-4" /> Media &amp; files</DialogTitle>
          <DialogDescription>All shared media in this conversation.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60dvh] space-y-4 overflow-y-auto">
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No media shared yet.</p>
          ) : (
            <>
              {images.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Images ({images.length})</p>
                  <div className="grid grid-cols-3 gap-2">
                    {images.map((img) => (
                      <a
                        key={img.id}
                        href={`/api/team/attachments/${img.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group/img relative aspect-square overflow-hidden rounded-md border border-border bg-surface-2"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/team/attachments/${img.id}`} alt={img.filename} className="size-full object-cover" loading="lazy" />
                        <span className="absolute inset-x-0 bottom-0 bg-black/50 px-1 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover/img:opacity-100">
                          {img.filename}
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
              {docs.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Documents ({docs.length})</p>
                  <ul className="space-y-1">
                    {docs.map((doc) => (
                      <li key={doc.id}>
                        <a
                          href={`/api/team/attachments/${doc.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2"
                        >
                          <FileText className="size-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate text-sm">{doc.filename}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{fileSize(doc.sizeBytes)}</span>
                          <Download className="size-3.5 shrink-0 text-muted-foreground" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProfileCard({
  userId,
  people,
  presence,
  onClose,
  onStartDm,
}: {
  userId: number;
  people: TeamPerson[];
  presence: TeamPresence[];
  onClose: () => void;
  onStartDm: (userId: number) => void;
}) {
  const person = React.useMemo(() => people.find((x) => x.id === userId), [people, userId]);
  const p = React.useMemo(() => presence.find((x) => x.userId === userId), [presence, userId]);
  const statusDot = p?.status === "online" ? "bg-green-500" : p?.status === "away" ? "bg-yellow-500" : "bg-zinc-400";

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>Profile</DialogTitle>
          <DialogDescription className="sr-only">User profile card</DialogDescription>
        </DialogHeader>
        {person ? (
          <div className="flex flex-col items-center gap-3 py-2">
            <Avatar className="size-16">
              <AvatarFallback className="text-xl">{initials(person.name)}</AvatarFallback>
            </Avatar>
            <div className="text-center">
              <p className="text-lg font-semibold">{person.name}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn("size-2.5 rounded-full", statusDot)} />
              <span className="text-sm text-muted-foreground capitalize">{p?.status ?? "offline"}</span>
            </div>
            {p?.statusText ? (
              <p className="text-sm text-muted-foreground">
                {p.statusEmoji ? `${p.statusEmoji} ` : ""}{p.statusText}
              </p>
            ) : null}
            <Button className="mt-2 w-full" onClick={() => onStartDm(userId)}>
              <ThreadIcon className="mr-2 size-4" /> Message
            </Button>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">Could not load profile.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

const CALL_ACTIONS: Record<string, string> = { join: "Joined", leave: "Left", share_on: "Started sharing", share_off: "Stopped sharing" };

function CallHistoryDialog({
  events,
  loading,
  onClose,
}: {
  events: Array<{ id: string; userId: number; userName: string; action: string; createdAt: string }>;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[80dvh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Clock className="size-4" /> Call history</DialogTitle>
          <DialogDescription>Who joined, left and shared in this channel.</DialogDescription>
        </DialogHeader>
        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : events.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No call activity yet.</p>
          ) : (
            <ul className="space-y-1">
              {events.map((evt) => (
                <li key={evt.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{evt.userName}</span>{" "}
                    <span className="text-muted-foreground">{CALL_ACTIONS[evt.action] ?? evt.action}</span>
                  </span>
                  <time className="shrink-0 text-xs text-muted-foreground" dateTime={evt.createdAt}>
                    {new Date(evt.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
