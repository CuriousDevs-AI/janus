"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Check, Hash, LogIn, LogOut, Menu, Plus, Search, Users, Volume2, X } from "lucide-react";
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
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Composer, MessageList } from "@/components/team/team-messages";
import type { TeamMessage, TeamPerson, TeamSearchHit, TeamSpace } from "@/components/team/types";
import { useSession } from "@/components/auth/session-provider";
import { useVoiceCall } from "@/components/team/voice-call";
import { CallBar, VoiceStage } from "@/components/team/voice-stage";

const CHANNEL_NAME = /^[a-z0-9][a-z0-9-]{1,39}$/;
const REFRESH_MS = 4000;

function newKey() {
  return crypto.randomUUID();
}

export function TeamChat() {
  const session = useSession();
  const requested = useSearchParams().get("space");
  const view = useSearchParams().get("view");
  const [selected, setSelected] = React.useState<string | null>(requested);
  const [threadId, setThreadId] = React.useState<string | null>(null);
  const [mobileNav, setMobileNav] = React.useState(false);
  const [creating, setCreating] = React.useState<false | "text" | "voice">(false);
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
    if (space.kind === "channel" && !space.joined) return;
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
      setMobileNav(false);
    } catch (error) {
      toast.error(errorText(error));
    }
  }

  async function createChannel(name: string, topic: string, voice: boolean) {
    const created = await api<TeamSpace>("/team/channels", {
      method: "POST",
      body: JSON.stringify({ name, topic, voice }),
    });
    reloadChannels();
    choose(created.id);
    setCreating(false);
    setMobileNav(false);
    toast.success(voice ? `Created voice channel ${created.name}` : `Created #${created.name}`);
  }

  function pick(item: TeamSpace) {
    choose(item.id);
    setMobileNav(false);
  }

  const sidebar = (
    <Sidebar
      channels={channels.data ?? []}
      direct={direct.data ?? []}
      selected={selected}
      onPick={pick}
      onCreate={() => setCreating("text")}
      onCreateVoice={() => setCreating("voice")}
      onNewMessage={() => setPicking(true)}
      loading={channels.loading && !channels.data}
      meName={session.user.name}
    />
  );

  if (demoMode) {
    return (
      <div className="flex h-[calc(100dvh-3.5rem)] items-center justify-center p-8 text-center text-sm text-muted-foreground">
        Team chat runs on real accounts. The preview has no server to hold the messages.
      </div>
    );
  }

  const threadRoot = threadId ? messages.data?.find((item) => item.id === threadId) ?? null : null;
  const title = space ? (space.kind === "channel" ? `#${space.name}` : space.title) : "Team chat";

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 bg-background">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface md:flex">{sidebar}</aside>
      <Sheet open={mobileNav} onOpenChange={setMobileNav}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Team chat navigation</SheetTitle>
          <div className="flex h-full flex-col">{sidebar}</div>
        </SheetContent>
      </Sheet>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-14 flex-wrap items-center gap-3 border-b border-border px-4 py-2">
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open team chat menu" onClick={() => setMobileNav(true)}>
            <Menu className="size-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-semibold text-foreground">{title}</h2>
            {space?.kind === "voice" ? (
              <p className="truncate text-xs text-muted-foreground">Voice channel · {space.inCall.length} in the call</p>
            ) : null}
            {space?.kind === "channel" ? (
              <p className="truncate text-xs text-muted-foreground">
                {space.topic || "No topic yet"} · <span className="inline-flex items-center gap-1"><Users className="size-3" />{space.memberCount}</span>
              </p>
            ) : null}
          </div>
          <Button variant="ghost" size="icon" aria-label="Search team messages" aria-pressed={searchOpen} onClick={() => setSearchOpen((open) => !open)}>
            <Search className="size-4" />
          </Button>
          {space?.kind === "channel" ? (
            space.joined ? (
              <Button size="sm" variant="secondary" onClick={() => void changeMembership("leave")}>
                <LogOut className="size-3.5" /> Leave
              </Button>
            ) : (
              <Button size="sm" onClick={() => void changeMembership("join")}>
                <LogIn className="size-3.5" /> Join channel
              </Button>
            )
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
            title={view === "voice" ? "Pick a voice channel" : "Pick a channel or start a message"}
            text={view === "voice" ? "Join a voice channel to talk with your team and share your screen. Anyone in the company can join." : "Channels are open to everyone in the company. Direct messages are only seen by the two people in them."}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button size="sm" variant="secondary" className="md:hidden" onClick={() => setMobileNav(true)}>
                  <Hash className="size-3.5" /> Browse channels
                </Button>
                <Button size="sm" onClick={() => setPicking(true)}>
                  <Plus className="size-3.5" /> New message
                </Button>
              </div>
            }
          />
        ) : space?.kind === "voice" ? (
          <VoiceStage space={space} />
        ) : (
          <div className="flex min-h-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col">
              <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
                {messages.loading && !messages.data ? (
                  <p className="px-6 py-10 text-center text-sm text-muted-foreground">Loading messages…</p>
                ) : messages.error ? (
                  <p className="px-6 py-10 text-center text-sm text-destructive">{messages.error}</p>
                ) : (
                  <MessageList
                    messages={messages.data ?? []}
                    emptyText={space?.kind === "channel" ? `No messages in #${space.name} yet. Say hello.` : "No messages yet. Say hello."}
                    onOpenThread={setThreadId}
                    onChanged={() => { reloadMessages(); reloadReplies(); }}
                    activeThreadId={threadId}
                  />
                )}
              </div>
              <Composer
                placeholder={space ? `Message ${space.kind === "channel" ? `#${space.name}` : space.title}` : "Message"}
                autoFocusKey={selected}
                disabled={!space || (space.kind === "channel" && !space.joined)}
                disabledReason={space?.kind === "channel" && !space.joined ? `You are viewing #${space.name}. Join the channel to post.` : undefined}
                onSend={(body, file) => send(body, undefined, file)}
              />
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
                  disabled={!space || (space.kind === "channel" && !space.joined)}
                  allowFiles={false}
                  onSend={(body) => send(body, threadId)}
                />
              </aside>
            ) : null}
          </div>
        )}
      </section>

      <CreateChannelDialog
        open={creating !== false}
        voice={creating === "voice"}
        onOpenChange={(open) => setCreating(open ? creating : false)}
        onCreate={createChannel}
      />
      <PeopleDialog
        open={picking}
        onOpenChange={setPicking}
        people={(people.data ?? []).filter((person) => String(person.id) !== session.user.id)}
        onStart={openConversation}
      />
    </div>
  );
}

function Sidebar({
  channels,
  direct,
  selected,
  onPick,
  onCreate,
  onCreateVoice,
  onNewMessage,
  loading,
  meName,
}: {
  channels: TeamSpace[];
  direct: TeamSpace[];
  selected: string | null;
  onPick: (item: TeamSpace) => void;
  onCreate: () => void;
  onCreateVoice: () => void;
  onNewMessage: () => void;
  loading: boolean;
  meName: string;
}) {
  const textChannels = channels.filter((item) => item.kind === "channel");
  const voiceChannels = channels.filter((item) => item.kind === "voice");
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-semibold text-foreground">Team chat</p>
        <p className="truncate text-xs text-muted-foreground">{meName}</p>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-2 py-3">
        <section aria-label="Channels">
          <div className="flex items-center justify-between px-2 pb-1">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Channels</h3>
            <Button variant="ghost" size="icon" className="size-6" aria-label="Create channel" onClick={onCreate}>
              <Plus className="size-3.5" />
            </Button>
          </div>
          {loading ? <p className="px-2 text-xs text-muted-foreground">Loading…</p> : null}
          {!loading && textChannels.length === 0 ? (
            <p className="px-2 text-xs text-muted-foreground">No channels yet. Create one for your team.</p>
          ) : null}
          <ul className="space-y-0.5">
            {textChannels.map((item) => (
              <SpaceRow key={item.id} item={item} active={selected === item.id} onPick={onPick} />
            ))}
          </ul>
        </section>

        <section aria-label="Voice channels">
          <div className="flex items-center justify-between px-2 pb-1">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Voice channels</h3>
            <Button variant="ghost" size="icon" className="size-6" aria-label="Create voice channel" onClick={onCreateVoice}>
              <Plus className="size-3.5" />
            </Button>
          </div>
          {!loading && voiceChannels.length === 0 ? (
            <p className="px-2 text-xs text-muted-foreground">No voice channels yet. Create one to talk and share screens.</p>
          ) : null}
          <ul className="space-y-0.5">
            {voiceChannels.map((item) => (
              <VoiceRow key={item.id} item={item} active={selected === item.id} onPick={onPick} />
            ))}
          </ul>
        </section>

        <section aria-label="Direct messages">
          <div className="flex items-center justify-between px-2 pb-1">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Direct messages</h3>
            <Button variant="ghost" size="icon" className="size-6" aria-label="New direct message" onClick={onNewMessage}>
              <Plus className="size-3.5" />
            </Button>
          </div>
          {direct.length === 0 ? <p className="px-2 text-xs text-muted-foreground">Message a teammate to start.</p> : null}
          <ul className="space-y-0.5">
            {direct.map((item) => (
              <SpaceRow key={item.id} item={item} active={selected === item.id} onPick={onPick} />
            ))}
          </ul>
        </section>
      </div>
      <CallBar />
    </div>
  );
}

/** A voice channel, with the people in its call listed under it, as in Discord. */
function VoiceRow({ item, active, onPick }: { item: TeamSpace; active: boolean; onPick: (item: TeamSpace) => void }) {
  const call = useVoiceCall();
  const live = call.spaceId === item.id;
  const people = live ? call.participants : item.inCall;
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(item)}
        aria-current={active ? "true" : undefined}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
          active ? "bg-accent-muted text-accent" : "text-foreground hover:bg-surface-2",
          live && !active && "text-success",
        )}
      >
        <Volume2 className={cn("size-3.5 shrink-0", live ? "text-success" : "text-muted-foreground")} />
        <span className="min-w-0 flex-1 truncate">{item.name}</span>
        {people.length > 0 ? <span className="text-[10px] tabular-nums text-muted-foreground">{people.length}</span> : null}
      </button>
      {people.length > 0 ? (
        <ul className="mb-1 ml-6 space-y-0.5" aria-label={`In ${item.name}`}>
          {people.map((person) => (
            <li key={person.id} className="flex items-center gap-2 px-2 py-0.5 text-xs text-muted-foreground">
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full bg-surface-3 text-[9px] font-semibold text-foreground ring-2 ring-transparent",
                  live && call.speaking.has(person.id) && "ring-success",
                )}
              >
                {initials(person.name)}
              </span>
              <span className="min-w-0 flex-1 truncate">{person.name}</span>
              {person.muted ? <span className="sr-only">muted</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function SpaceRow({ item, active, onPick }: { item: TeamSpace; active: boolean; onPick: (item: TeamSpace) => void }) {
  const label = item.kind === "channel" ? item.name ?? "" : item.title;
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(item)}
        aria-current={active ? "true" : undefined}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
          active ? "bg-accent-muted text-accent" : "text-foreground hover:bg-surface-2",
          item.unread > 0 && !active && "font-semibold",
          item.kind === "channel" && !item.joined && !active && "text-muted-foreground",
        )}
      >
        {item.kind === "channel" ? (
          <Hash className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <Avatar className="size-5">
            <AvatarFallback className="text-[9px]">{initials(label)}</AvatarFallback>
          </Avatar>
        )}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {item.unread > 0 ? (
          <span className="rounded-full bg-accent px-1.5 text-[10px] font-semibold tabular-nums text-accent-foreground">
            {item.unread > 99 ? "99+" : item.unread}
          </span>
        ) : null}
      </button>
    </li>
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
  voice,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  voice: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string, topic: string, voice: boolean) => Promise<void>;
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
      await onCreate(normalized, topic.trim(), voice);
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
            <DialogTitle>{voice ? "Create a voice channel" : "Create a channel"}</DialogTitle>
            <DialogDescription>
              {voice
                ? "Anyone in the company can join a voice channel to talk and share their screen. Lowercase letters, numbers and dashes."
                : "Everyone in the company can find and read a channel. Lowercase letters, numbers and dashes."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="channel-name">Name</Label>
            <div className="flex items-center gap-1.5">
              {voice ? <Volume2 className="size-4 text-muted-foreground" /> : <Hash className="size-4 text-muted-foreground" />}
              <Input id="channel-name" autoFocus placeholder={voice ? "e.g. standup" : "e.g. sales-floor"} value={name} onChange={(event) => setName(event.target.value)} aria-invalid={name.length > 0 && !valid} />
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
            <Button type="submit" disabled={!valid || busy}>{voice ? "Create voice channel" : "Create channel"}</Button>
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
