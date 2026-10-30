"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Bell, CalendarDays, Check, MapPin, Megaphone, PartyPopper, Plus } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/components/auth/session-provider";
import { api, message as errorText } from "@/lib/api/client";
import { demoMode } from "@/lib/demo-mode";
import { cn, initials } from "@/lib/utils";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { TeamAnnouncement, TeamMessage, TeamPerson, TeamPostKind } from "@/components/team/types";

export const KUDOS_VALUES = ["Customer first", "Ownership", "Teamwork", "Going the extra mile", "Quality", "Learning"];

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

const COLORS = ["#2563eb", "#059669", "#d97706", "#7c3aed", "#db2777", "#0891b2"];

function colorOf(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}

function Face({ name, size = "sm" }: { name: string; size?: "sm" | "lg" }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        size === "lg" ? "size-14 text-lg ring-4 ring-surface shadow-md" : "size-6 text-[10px]",
      )}
      style={{ backgroundColor: colorOf(name) }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

/** An announcement, kudos, poll or event: a card of its own, centred in the conversation. */
export function PostCard({ item, onChanged }: { item: TeamMessage; onChanged: () => void }) {
  const [busy, setBusy] = React.useState(false);

  async function answer(value: string) {
    if (busy) return;
    setBusy(true);
    try {
      await api(`/team/messages/${item.id}/respond`, { method: "POST", body: JSON.stringify({ value }) });
      onChanged();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (item.kind === "announcement") {
    return (
      <article aria-label="Announcement" className="w-full overflow-hidden rounded-2xl border border-accent/25 bg-surface shadow-md">
        <header className="flex items-center gap-3 bg-gradient-to-r from-accent to-[#7c3aed] px-5 py-3 text-white">
          <span className="flex size-9 items-center justify-center rounded-full bg-white/20">
            <Megaphone className="size-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/80">Announcement</p>
            <p className="text-xs text-white/90">{when(item.createdAt)}</p>
          </div>
          <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-semibold">Official</span>
        </header>
        <div className="space-y-2 px-5 py-4">
          {item.title ? <h3 className="text-lg font-semibold leading-snug text-foreground">{item.title}</h3> : null}
          <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground/90">{item.body}</p>
        </div>
        <footer className="flex items-center gap-2 border-t border-border bg-surface-2/60 px-5 py-2.5 text-xs text-muted-foreground">
          <Face name={item.author.name} />
          <span className="font-medium text-foreground">{item.mine ? "You" : item.author.name}</span>
          <span aria-hidden>·</span>
          <span>Sent to everyone, also by email</span>
        </footer>
      </article>
    );
  }

  if (item.kind === "kudos" && item.kudos) {
    const sparks = [
      ["left-[8%] top-[18%]", "#f59e0b"], ["left-[18%] top-[70%]", "#ec4899"], ["right-[10%] top-[22%]", "#8b5cf6"],
      ["right-[20%] top-[75%]", "#10b981"], ["left-[45%] top-[8%]", "#3b82f6"], ["right-[40%] bottom-[6%]", "#f97316"],
    ];
    return (
      <article aria-label="Kudos" className="relative w-full max-w-md overflow-hidden rounded-2xl border border-warning/30 bg-gradient-to-br from-warning-muted via-surface to-accent-muted px-6 pb-5 pt-6 text-center shadow-md">
        {sparks.map(([place, color]) => (
          <span key={place} aria-hidden className={cn("absolute size-1.5 rotate-45 rounded-[2px]", place)} style={{ backgroundColor: color }} />
        ))}
        <p className="relative inline-flex items-center gap-1.5 rounded-full bg-surface/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-warning ring-1 ring-warning/30">
          <PartyPopper className="size-3.5" /> Kudos
        </p>
        <div className="relative mt-4 flex justify-center">
          <Face name={item.kudos.to.name} size="lg" />
          <span aria-hidden className="absolute -right-1 top-8 text-2xl sm:right-[calc(50%-48px)]">🎉</span>
        </div>
        <h3 className="relative mt-3 text-lg font-semibold text-foreground">{item.kudos.to.name}</h3>
        {item.kudos.value ? (
          <span className="relative mt-1.5 inline-block rounded-full bg-warning px-3 py-0.5 text-[11px] font-semibold text-white shadow-sm">{item.kudos.value}</span>
        ) : null}
        <blockquote className="relative mx-auto mt-3 max-w-sm whitespace-pre-wrap break-words text-[15px] italic leading-relaxed text-foreground/90">
          “{item.body}”
        </blockquote>
        <p className="relative mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Face name={item.author.name} /> from <span className="font-medium text-foreground">{item.mine ? "you" : item.author.name}</span> · {when(item.createdAt)}
        </p>
      </article>
    );
  }

  if (item.kind === "poll" && item.poll) {
    const poll = item.poll;
    const leading = Math.max(...poll.options.map((option) => option.votes));
    return (
      <article aria-label="Poll" className="w-full max-w-lg overflow-hidden rounded-2xl border border-info/25 bg-surface shadow-md">
        <header className="flex items-center gap-2 border-b border-border bg-info-muted px-5 py-2.5">
          <BarChart3 className="size-4 text-info" />
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-info">Poll</span>
          <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold", poll.closed ? "bg-surface-2 text-muted-foreground" : "bg-success-muted text-success")}>
            {poll.closed ? "Closed" : "Open"}
          </span>
        </header>
        <div className="px-5 py-4">
          <h3 className="whitespace-pre-wrap break-words text-base font-semibold">{item.body}</h3>
          <ul className="mt-3 space-y-2" role="radiogroup" aria-label={item.body ?? "Poll"}>
            {poll.options.map((option) => {
              const share = poll.total ? Math.round((option.votes / poll.total) * 100) : 0;
              const chosen = poll.myVote === option.id;
              const top = poll.total > 0 && option.votes === leading;
              return (
                <li key={option.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={chosen}
                    disabled={poll.closed || busy}
                    onClick={() => void answer(option.id)}
                    className={cn(
                      "relative w-full overflow-hidden rounded-xl border px-3.5 py-2.5 text-left text-sm transition-all disabled:cursor-default",
                      chosen ? "border-info ring-2 ring-info/20" : "border-border hover:border-info/50 hover:bg-surface-2/50",
                    )}
                  >
                    <span className={cn("absolute inset-y-0 left-0 transition-all duration-500", top ? "bg-info/15" : "bg-surface-2")} style={{ width: `${share}%` }} aria-hidden />
                    <span className="relative flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <span className={cn("flex size-4 items-center justify-center rounded-full border", chosen ? "border-info bg-info text-white" : "border-muted-foreground/40")}>
                          {chosen ? <Check className="size-3" /> : null}
                        </span>
                        <span className={cn(chosen && "font-semibold")}>{option.text}</span>
                      </span>
                      <span className="text-xs font-medium tabular-nums text-muted-foreground">{option.votes} · {share}%</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Face name={item.author.name} />
            {item.mine ? "You" : item.author.name} · {poll.total} {poll.total === 1 ? "vote" : "votes"}
            {poll.closesAt ? ` · ${poll.closed ? "closed" : "closes"} ${when(poll.closesAt)}` : ""}
          </p>
        </div>
      </article>
    );
  }

  if (item.kind === "event" && item.event) {
    const event = item.event;
    const start = new Date(event.startsAt);
    const answers: Array<[string, string, number, string]> = [
      ["going", "Going", event.going, "bg-success text-white border-success"],
      ["maybe", "Maybe", event.maybe, "bg-warning text-white border-warning"],
      ["no", "Can't go", event.declined, "bg-surface-3 text-foreground border-border"],
    ];
    return (
      <article aria-label="Event" className="flex w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface shadow-md">
        <div className="flex w-20 shrink-0 flex-col items-center justify-center bg-gradient-to-b from-accent to-[#7c3aed] py-4 text-white">
          <span className="text-[11px] font-bold uppercase tracking-wider text-white/85">{new Intl.DateTimeFormat("en-IN", { month: "short" }).format(start)}</span>
          <span className="text-3xl font-bold leading-none">{start.getDate()}</span>
          <span className="mt-1 text-[10px] text-white/80">{new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(start)}</span>
        </div>
        <div className="min-w-0 flex-1 p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-accent">Event</p>
          <h3 className="mt-0.5 text-base font-semibold">{item.title || "Event"}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays className="size-3.5" /> {when(event.startsAt)}</p>
          {event.place ? <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="size-3.5" /> {event.place}</p> : null}
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground/90">{item.body}</p>
          <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Are you going">
            {answers.map(([value, label, count, picked]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={event.mine === value}
                disabled={busy}
                onClick={() => void answer(value)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                  event.mine === value ? picked : "border-border text-muted-foreground hover:bg-surface-2",
                )}
              >
                {label} · {count}
              </button>
            ))}
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground"><Face name={item.author.name} /> Planned by {item.mine ? "you" : item.author.name}</p>
        </div>
      </article>
    );
  }

  return null;
}

const POST_LABELS: Record<TeamPostKind, string> = {
  announcement: "Announcement",
  kudos: "Kudos",
  poll: "Poll",
  event: "Event",
};

/** The "+" beside the message box: give kudos, start a poll, plan an event, or announce. */
export function PostMenu({
  spaceId,
  people,
  canAnnounce,
  onPosted,
}: {
  spaceId: string;
  people: TeamPerson[];
  canAnnounce: boolean;
  onPosted: () => void;
}) {
  const [kind, setKind] = React.useState<TeamPostKind | null>(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" aria-label="New post" title="Kudos, poll, event or announcement">
            <Plus className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top">
          <DropdownMenuItem onSelect={() => setKind("kudos")}><PartyPopper className="size-3.5" /> Give kudos</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setKind("poll")}><BarChart3 className="size-3.5" /> Start a poll</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setKind("event")}><CalendarDays className="size-3.5" /> Plan an event</DropdownMenuItem>
          {canAnnounce ? (
            <DropdownMenuItem onSelect={() => setKind("announcement")}><Megaphone className="size-3.5" /> Make an announcement</DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {kind ? (
        <PostDialog
          kind={kind}
          spaceId={spaceId}
          people={people}
          onClose={() => setKind(null)}
          onPosted={() => {
            setKind(null);
            onPosted();
          }}
        />
      ) : null}
    </>
  );
}

export function PostDialog({
  kind,
  spaceId,
  people,
  onClose,
  onPosted,
}: {
  kind: TeamPostKind;
  spaceId: string;
  people: TeamPerson[];
  onClose: () => void;
  onPosted: () => void;
}) {
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [to, setTo] = React.useState("");
  const [value, setValue] = React.useState(KUDOS_VALUES[0]);
  const [options, setOptions] = React.useState(["", ""]);
  const [closesAt, setClosesAt] = React.useState("");
  const [startsAt, setStartsAt] = React.useState("");
  const [place, setPlace] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const key = React.useMemo(() => crypto.randomUUID(), []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const payload: Record<string, unknown> = { kind, body: body.trim(), title: title.trim() };
    if (kind === "kudos") {
      if (!to) return setError("Choose who the kudos are for.");
      Object.assign(payload, { kudos_to: Number(to), kudos_value: value });
    }
    if (kind === "poll") {
      const filled = options.map((option) => option.trim()).filter(Boolean);
      if (filled.length < 2) return setError("Add at least two options.");
      Object.assign(payload, { options: filled, closes_at: closesAt ? new Date(closesAt).toISOString() : null });
    }
    if (kind === "event") {
      if (!startsAt) return setError("Pick when it starts.");
      Object.assign(payload, { starts_at: new Date(startsAt).toISOString(), place: place.trim() });
    }
    if (!payload.body) return setError(kind === "poll" ? "Write the question." : "Write a message.");
    setBusy(true);
    setError("");
    try {
      await api(`/team/spaces/${spaceId}/posts`, { method: "POST", body: JSON.stringify(payload), headers: { "Idempotency-Key": key } });
      toast.success(kind === "announcement" ? "Announced. Everyone gets an email." : `${POST_LABELS[kind]} posted`);
      onPosted();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>
              {kind === "kudos" ? "Give kudos" : kind === "poll" ? "Start a poll" : kind === "event" ? "Plan an event" : "Make an announcement"}
            </DialogTitle>
            <DialogDescription>
              {kind === "announcement"
                ? "Everyone in the company sees it in Team Chat, gets an alert, and gets it by email."
                : kind === "kudos"
                  ? "Thank a teammate in front of everyone here. They also get an email."
                  : kind === "poll"
                    ? "One vote each; people can change their vote until it closes."
                    : "People here can answer going, maybe or can't go."}
            </DialogDescription>
          </DialogHeader>
          {kind === "kudos" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="kudos-to">For</Label>
                <select id="kudos-to" value={to} onChange={(event) => setTo(event.target.value)} className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm">
                  <option value="">Choose a teammate</option>
                  {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="kudos-value">Value</Label>
                <select id="kudos-value" value={value} onChange={(event) => setValue(event.target.value)} className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm">
                  {KUDOS_VALUES.map((item) => <option key={item}>{item}</option>)}
                </select>
              </div>
            </div>
          ) : null}
          {kind === "announcement" || kind === "event" ? (
            <div className="space-y-1.5">
              <Label htmlFor="post-title">{kind === "event" ? "Event name" : "Headline"}</Label>
              <Input id="post-title" maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={kind === "event" ? "Diwali celebration" : "Office closed on Friday"} />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="post-body">{kind === "poll" ? "Question" : kind === "kudos" ? "What did they do?" : "Details"}</Label>
            <Textarea id="post-body" rows={kind === "poll" ? 2 : 4} maxLength={4000} value={body} onChange={(event) => setBody(event.target.value)} />
          </div>
          {kind === "poll" ? (
            <div className="space-y-2">
              <Label>Options</Label>
              {options.map((option, index) => (
                <Input
                  key={index}
                  aria-label={`Option ${index + 1}`}
                  maxLength={80}
                  value={option}
                  placeholder={`Option ${index + 1}`}
                  onChange={(event) => setOptions((list) => list.map((item, at) => (at === index ? event.target.value : item)))}
                />
              ))}
              {options.length < 6 ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setOptions((list) => [...list, ""])}>
                  <Plus className="size-3.5" /> Add option
                </Button>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="poll-closes">Closes (optional)</Label>
                <Input id="poll-closes" type="datetime-local" value={closesAt} onChange={(event) => setClosesAt(event.target.value)} className="max-w-60" />
              </div>
            </div>
          ) : null}
          {kind === "event" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="event-starts">Starts</Label>
                <Input id="event-starts" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="event-place">Place</Label>
                <Input id="event-place" maxLength={120} value={place} onChange={(event) => setPlace(event.target.value)} placeholder="Head office terrace" />
              </div>
            </div>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Posting…" : kind === "announcement" ? "Announce" : "Post"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Push for this browser: the service worker, subscribed with the server's key and saved, so
 * announcements and kudos arrive even with Janus closed. Quietly does nothing where the browser
 * or the server has no push. Returns whether this browser is now subscribed.
 */
export async function enablePush(): Promise<boolean> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  if (Notification.permission !== "granted") return false;
  const { publicKey } = await api<{ publicKey: string | null }>("/push/key");
  if (!publicKey) return false;
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  await navigator.serviceWorker.ready;
  const key = Uint8Array.from(atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0));
  let subscription = await registration.pushManager.getSubscription();
  // A subscription made with an older server key cannot be used; start again with the current one.
  const current = subscription?.options.applicationServerKey;
  if (subscription && current && new Uint8Array(current).toString() !== key.toString()) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await api("/push/subscriptions", { method: "POST", body: JSON.stringify(subscription.toJSON()) });
  return true;
}

const SEEN_KEY = "janus.team.announcement-seen";
const WATCH_MS = 30_000;

/**
 * New announcements reach every page: a toast with a link, and a desktop notification when the
 * person allowed them. The first check only notes where things stand, so old news is not replayed.
 */
export function AnnouncementWatcher() {
  const session = useSession();
  const router = useRouter();
  React.useEffect(() => {
    if (demoMode) return;
    const key = `${SEEN_KEY}.${session.tenant.id}.${session.user.id}`;
    let stopped = false;
    async function check() {
      try {
        // null means this browser has never checked: note where things stand and alert from then on.
        const stored = window.localStorage.getItem(key);
        const seen = stored === null ? null : Number(stored) || 0;
        const rows = await api<TeamAnnouncement[]>(`/team/announcements?after=${seen ?? 0}`);
        if (stopped) return;
        if (seen === null || rows.length) window.localStorage.setItem(key, rows[0]?.id ?? String(seen ?? 0));
        if (seen === null || !rows.length) return;
        for (const row of rows.filter((item) => item.author.id !== Number(session.user.id)).slice(0, 3).reverse()) {
          const open = () => router.push(`/team?space=${row.spaceId}&workspace=team-chat`);
          const heading = row.title || "New announcement";
          toast(heading, { description: `${row.author.name}: ${row.body.slice(0, 120)}`, icon: <Megaphone className="size-4" />, duration: 12_000, action: { label: "Open", onClick: open } });
          if ("Notification" in window && Notification.permission === "granted") {
            const note = new Notification(heading, { body: `${row.author.name}: ${row.body.slice(0, 160)}`, tag: `announcement-${row.id}` });
            note.onclick = () => { window.focus(); open(); };
          }
        }
      } catch {
        // Team Chat may be unavailable for a moment; the next check catches up.
      }
    }
    void check();
    // Someone who already allowed notifications keeps this browser's push up to date.
    if ("Notification" in window && Notification.permission === "granted") void enablePush().catch(() => undefined);
    const timer = setInterval(() => void check(), WATCH_MS);
    return () => { stopped = true; clearInterval(timer); };
  }, [session.tenant.id, session.user.id, router]);
  return null;
}

/** Ask the browser for desktop notifications, from a click as browsers require. */
export function NotificationsToggle() {
  const [state, setState] = React.useState<NotificationPermission | "unsupported">(() =>
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported",
  );
  if (state === "unsupported" || state === "granted") return null;
  return (
    <DropdownMenuItem
      disabled={state === "denied"}
      onSelect={() =>
        void Notification.requestPermission().then(async (answer) => {
          setState(answer);
          if (answer !== "granted") return;
          const pushed = await enablePush().catch(() => false);
          toast.success(pushed ? "Notifications on. They arrive even when Janus is closed." : "Notifications on while Janus is open.");
        })
      }
    >
      <Bell className="size-3.5" /> {state === "denied" ? "Notifications blocked in the browser" : "Turn on desktop notifications"}
    </DropdownMenuItem>
  );
}
