"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Check, Hash, Megaphone, Headphones, LogIn, LogOut, MoreVertical, Phone, PhoneOff, Plus, Search, Users, X } from "lucide-react";
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
import { Composer, MessageList } from "@/components/team/team-messages";
import type { TeamMessage, TeamPerson, TeamSearchHit, TeamSpace } from "@/components/team/types";
import { useSession } from "@/components/auth/session-provider";
import { useVoiceCall } from "@/components/team/voice-call";
import { CallBanner, CallPanel } from "@/components/team/voice-stage";
import { ChatAvatar, ChatList, isChannel } from "@/components/team/chat-list";
import { useTeamChatStore } from "@/lib/stores/team-chat-store";
import { PostMenu } from "@/components/team/team-posts";
import { hasPermission } from "@/lib/demo-persona";

const CHANNEL_NAME = /^[a-z0-9][a-z0-9-]{1,39}$/;
const REFRESH_MS = 4000;

function newKey() {
  return crypto.randomUUID();
}

export function TeamChat() {
  const session = useSession();
  const call = useVoiceCall();
  const requested = useSearchParams().get("space");
  const [selected, setSelected] = React.useState<string | null>(requested);
  const [threadId, setThreadId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [picking, setPicking] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [term, setTerm] = React.useState("");
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const channels = useApi<TeamSpace[]>(demoMode ? null : "/team/channels");
  const direct = useApi<TeamSpace[]>(demoMode ? null : "/team/conversations");
  const people = useApi<TeamPerson[]>(demoMode ? null : "/team/people");
  const messages = useApi<TeamMessage[]>(
    demoMode || !selected ? null : `/team/spaces/${selected}/messages?limit=50`,
  );
  const hits = useApi<TeamSearchHit[]>(
    demoMode || !searchOpen || term.length < 2
      ? null
      : `/team/search?q=${encodeURIComponent(term)}&limit=30`,
  );
  const replies = useApi<TeamMessage[]>(
    demoMode || !threadId ? null : `/team/messages/${threadId}/replies`,
  );

  const reloadChannels = channels.reload;
  const reloadDirect = direct.reload;
  const reloadMessages = messages.reload;
  const reloadReplies = replies.reload;
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
  }

  // Escape closes an open thread, as in the desktop apps.
  React.useEffect(() => {
    if (!threadId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setThreadId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [threadId]);

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

  async function createChannel(name: string, topic: string) {
    const created = await api<TeamSpace>("/team/channels", {
      method: "POST",
      body: JSON.stringify({ name, topic }),
    });
    reloadChannels();
    choose(created.id);
    setCreating(false);
    toast.success(`Created #${created.name}`);
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
  const title = space ? (isChannel(space.kind) ? `#${space.name}` : space.title) : "Team chat";

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
            {space?.kind === "dm" ? <p className="truncate text-xs text-muted-foreground">Direct message</p> : null}
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
            onQuery={(value) => { setQuery(value); }}
            onOpen={(hit) => { choose(hit.spaceId); setSearchOpen(false); setQuery(""); setTerm(""); }}
            onClose={() => { setSearchOpen(false); setQuery(""); setTerm(""); }}
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
                    activeThreadId={threadId}
                    showAuthors={space?.kind !== "dm"}
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
                <Composer
                  placeholder={space?.announcements ? "Write an announcement; everyone gets it by email too" : space ? `Message ${isChannel(space.kind) ? `#${space.name}` : space.title}` : "Message"}
                  autoFocusKey={selected}
                  disabled={!space}
                  onSend={(body, file) => send(body, undefined, file)}
                  extra={space ? (
                    <PostMenu
                      spaceId={space.id}
                      people={(people.data ?? []).filter((person) => String(person.id) !== session.user.id)}
                      canAnnounce={isChannel(space.kind) && hasPermission(session.permissions, "announcements:post")}
                      onPosted={() => { reloadMessages(); reloadChannels(); }}
                    />
                  ) : null}
                />
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
                  />
                </div>
                <Composer
                  placeholder="Reply to the thread"
                  autoFocusKey={threadId}
                  disabled={!space || (isChannel(space.kind) && !space.joined)}
                  allowFiles={false}
                  onSend={(body) => send(body, threadId)}
                />
              </aside>
            ) : null}
          </div>
        )}
      </section>

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
  onCreate: (name: string, topic: string) => Promise<void>;
}) {
  const [name, setName] = React.useState("");
  const [topic, setTopic] = React.useState("");
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
      await onCreate(normalized, topic.trim());
      setName("");
      setTopic("");
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
              Everyone in the company can read a channel, chat in it after joining, and start a call with screen sharing. Lowercase letters, numbers and dashes.
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
  const shown = people.filter((person) => person.name.toLowerCase().includes(query.toLowerCase()));
  const chosen = people.filter((person) => picked.includes(person.id));

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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New message or group</DialogTitle>
          <DialogDescription>
            Pick one person for a direct message, or several for a group. Only the people in it can read it.
          </DialogDescription>
        </DialogHeader>
        <Input autoFocus placeholder="Search people" aria-label="Search people" value={query} onChange={(event) => setQuery(event.target.value)} />
        {chosen.length > 0 ? (
          <p className="text-xs text-muted-foreground">With: {chosen.map((person) => person.name).join(", ")}</p>
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
                  <Avatar className="size-7">
                    <AvatarFallback className="text-[10px]">{initials(person.name)}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate">{person.name}</span>
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
  onQuery,
  onOpen,
  onClose,
}: {
  query: string;
  term: string;
  hits: { data?: TeamSearchHit[]; error?: string; loading: boolean };
  onQuery: (value: string) => void;
  onOpen: (hit: TeamSearchHit) => void;
  onClose: () => void;
}) {
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
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {term.length < 2 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">Type at least two characters to search.</p>
        ) : hits.error ? (
          <p className="px-2 py-6 text-center text-sm text-destructive">{hits.error}</p>
        ) : hits.loading && !hits.data ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">Searching…</p>
        ) : !hits.data?.length ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">No messages match &ldquo;{term}&rdquo;.</p>
        ) : (
          <ul className="space-y-1">
            {hits.data.map((hit) => (
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
                  <p className="mt-1 line-clamp-2 text-sm text-foreground">{highlight(hit.message.body ?? "", term)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{hit.message.author.name}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
