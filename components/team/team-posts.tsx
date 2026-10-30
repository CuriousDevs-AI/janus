"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Bell, CalendarDays, MapPin, Megaphone, PartyPopper, Plus } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/components/auth/session-provider";
import { api, message as errorText } from "@/lib/api/client";
import { demoMode } from "@/lib/demo-mode";
import { cn } from "@/lib/utils";
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

/** An announcement, kudos, poll or event, shown in the conversation in place of a plain bubble. */
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
      <article aria-label="Announcement" className="w-full max-w-xl overflow-hidden rounded-xl border border-accent/30 bg-surface shadow-sm">
        <div className="flex items-center gap-2 bg-accent-muted px-4 py-2 text-xs font-semibold uppercase tracking-wide text-accent">
          <Megaphone className="size-3.5" /> Announcement
        </div>
        <div className="space-y-1.5 px-4 py-3">
          {item.title ? <h3 className="text-base font-semibold text-foreground">{item.title}</h3> : null}
          <p className="whitespace-pre-wrap break-words text-sm text-foreground">{item.body}</p>
          <p className="text-[11px] text-muted-foreground">{item.author.name} · {when(item.createdAt)}</p>
        </div>
      </article>
    );
  }

  if (item.kind === "kudos" && item.kudos) {
    return (
      <article aria-label="Kudos" className="w-full max-w-md rounded-xl border border-warning/30 bg-gradient-to-br from-warning-muted to-surface p-4 shadow-sm">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <PartyPopper className="size-4 text-warning" /> Kudos to {item.kudos.to.name}
        </p>
        {item.kudos.value ? (
          <span className="mt-2 inline-block rounded-full bg-surface px-2.5 py-0.5 text-[11px] font-medium text-warning ring-1 ring-warning/30">{item.kudos.value}</span>
        ) : null}
        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground">{item.body}</p>
        <p className="mt-2 text-[11px] text-muted-foreground">from {item.mine ? "you" : item.author.name} · {when(item.createdAt)}</p>
      </article>
    );
  }

  if (item.kind === "poll" && item.poll) {
    const poll = item.poll;
    return (
      <article aria-label="Poll" className="w-full max-w-md rounded-xl border border-border bg-surface p-4 shadow-sm">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <BarChart3 className="size-3.5" /> Poll
        </p>
        <h3 className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold">{item.body}</h3>
        <ul className="mt-3 space-y-2" role="radiogroup" aria-label={item.body ?? "Poll"}>
          {poll.options.map((option) => {
            const share = poll.total ? Math.round((option.votes / poll.total) * 100) : 0;
            const chosen = poll.myVote === option.id;
            return (
              <li key={option.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={chosen}
                  disabled={poll.closed || busy}
                  onClick={() => void answer(option.id)}
                  className={cn(
                    "relative w-full overflow-hidden rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:cursor-default",
                    chosen ? "border-accent" : "border-border hover:border-accent/60",
                  )}
                >
                  <span className="absolute inset-y-0 left-0 bg-accent-muted transition-all" style={{ width: `${share}%` }} aria-hidden />
                  <span className="relative flex items-center justify-between gap-2">
                    <span className={cn(chosen && "font-semibold")}>{option.text}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{option.votes} · {share}%</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {poll.total} {poll.total === 1 ? "vote" : "votes"}
          {poll.closesAt ? ` · ${poll.closed ? "closed" : "closes"} ${when(poll.closesAt)}` : ""} · {item.author.name}
        </p>
      </article>
    );
  }

  if (item.kind === "event" && item.event) {
    const event = item.event;
    const answers: Array<[string, string, number]> = [["going", "Going", event.going], ["maybe", "Maybe", event.maybe], ["no", "Can't go", event.declined]];
    return (
      <article aria-label="Event" className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        <div className="flex gap-3 p-4">
          <div className="flex w-14 shrink-0 flex-col items-center rounded-lg bg-accent-muted py-1.5 text-accent">
            <span className="text-[10px] font-semibold uppercase">{new Intl.DateTimeFormat("en-IN", { month: "short" }).format(new Date(event.startsAt))}</span>
            <span className="text-xl font-bold leading-none">{new Date(event.startsAt).getDate()}</span>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold">{item.title || "Event"}</h3>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="size-3" /> {when(event.startsAt)}</p>
            {event.place ? <p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3" /> {event.place}</p> : null}
            <p className="mt-2 whitespace-pre-wrap break-words text-sm">{item.body}</p>
          </div>
        </div>
        <div className="flex border-t border-border" role="radiogroup" aria-label="Are you going">
          {answers.map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={event.mine === value}
              disabled={busy}
              onClick={() => void answer(value)}
              className={cn(
                "flex-1 border-r border-border px-2 py-2 text-xs font-medium last:border-r-0 transition-colors",
                event.mine === value ? "bg-accent-muted text-accent" : "text-muted-foreground hover:bg-surface-2",
              )}
            >
              {label} · {count}
            </button>
          ))}
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
      onSelect={() => void Notification.requestPermission().then(setState)}
    >
      <Bell className="size-3.5" /> {state === "denied" ? "Notifications blocked in the browser" : "Turn on desktop notifications"}
    </DropdownMenuItem>
  );
}
