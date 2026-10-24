"use client";

import * as React from "react";
import { toast } from "sonner";
import { Award, BarChart3, CalendarDays, Megaphone, MessageSquare, Pin, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { useHrEngageStore, type EngageItem, type EngageMeta } from "@/lib/stores/hr-engage-store";
import { derivedCelebrations, itemGroups, kudosValues, reactionEmojis, timeAgo, type DerivedItem } from "@/lib/hr-engage";
import { canManageHr } from "@/lib/hr-people-access";
import { HrEmpty, HrField, HrModal, hrInputClass, hrToday } from "@/components/hr-people/operations-ui";
import type { HrDemoRole, HrEmployee } from "@/lib/types";

type Filter = "all" | "kudos" | "polls" | "posts" | "events";
const filters: [Filter, string][] = [["all", "All activities"], ["kudos", "Kudos"], ["polls", "Polls"], ["posts", "Posts"], ["events", "Events"]];
const initials = (name: string) => name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
const noMeta: EngageMeta = { reactions: {}, comments: [] };
const celebrationEmoji = { birthday: "🎂", anniversary: "🏅", newcomer: "👋" } as const;
const eventTime = (value: string) => new Date(value).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function Avatar({ name }: { name: string }) { return <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-muted text-xs font-semibold text-accent">{initials(name)}</span>; }

export function HrEngageView({ role, actorId }: { role: HrDemoRole; actorId: string }) {
  const { employees } = useHrPeopleStore();
  const { items, addItem } = useHrEngageStore();
  const [filter, setFilter] = React.useState<Filter>("all");
  const [query, setQuery] = React.useState("");
  const [group, setGroup] = React.useState("all");
  const [compose, setCompose] = React.useState<null | "kudos" | "poll" | "post" | "event" | "announcement">(null);
  const today = hrToday();
  const actor = employees.find((item) => item.id === actorId);
  const hr = canManageHr(role);
  const canEvent = hr || role === "reporting_manager";
  const nameOf = (id: string) => employees.find((item) => item.id === id)?.name ?? "Someone";
  const celebrations = React.useMemo(() => derivedCelebrations(employees, today), [employees, today]);
  const groups = itemGroups(items, employees);
  const q = query.trim().toLowerCase();

  const kindMatches = (item: EngageItem) => filter === "all" || (filter === "kudos" && item.kind === "kudos") || (filter === "polls" && item.kind === "poll") || (filter === "posts" && (item.kind === "post" || item.kind === "announcement")) || (filter === "events" && item.kind === "event");
  const stored = items.filter((item) => (group === "all" || item.group === "all" || item.group === group) && kindMatches(item) && (!q || `${item.title ?? ""} ${item.text} ${nameOf(item.authorId)} ${item.kudos ? nameOf(item.kudos.toId) : ""}`.toLowerCase().includes(q)));
  const derived = celebrations.filter((item) => (filter === "all" || filter === "events") && (!q || `${item.text} ${item.employee.name}`.toLowerCase().includes(q)) && (group === "all" || item.employee.department === group));
  const feed: ({ type: "stored"; item: EngageItem; at: string } | { type: "derived"; item: DerivedItem; at: string })[] = [
    ...stored.map((item) => ({ type: "stored" as const, item, at: item.createdAt })),
    // Upcoming celebrations sit at today's position in the feed, so they never outrank newer posts.
    ...derived.map((item) => ({ type: "derived" as const, item, at: `${item.date <= today ? item.date : today}T08:00:00+05:30` })),
  ].sort((a, b) => Number(b.type === "stored" && b.item.pinned) - Number(a.type === "stored" && a.item.pinned) || b.at.localeCompare(a.at));

  return <div className="space-y-5">
    <section aria-label="Start something" className="flex flex-wrap items-center justify-between gap-4 border border-border bg-surface p-4">
      <div className="flex items-center gap-3"><Avatar name={actor?.name ?? "HR"} /><div><p className="text-sm font-semibold">Hey {actor?.name.split(" ")[0] ?? "there"},</p><p className="text-xs text-muted-foreground">Ready to dive in?</p></div></div>
      <div className="flex flex-wrap gap-2">
        {actor && <><Button size="sm" variant="outline" onClick={() => setCompose("kudos")}><Award className="mr-1 size-3.5" />Give kudos</Button><Button size="sm" variant="outline" onClick={() => setCompose("poll")}><BarChart3 className="mr-1 size-3.5" />Create poll</Button><Button size="sm" variant="outline" onClick={() => setCompose("post")}><MessageSquare className="mr-1 size-3.5" />Start a discussion</Button></>}
        {canEvent && <Button size="sm" variant="outline" onClick={() => setCompose("event")}><CalendarDays className="mr-1 size-3.5" />Create event</Button>}
        {hr && <Button size="sm" onClick={() => setCompose("announcement")}><Megaphone className="mr-1 size-3.5" />Announce</Button>}
      </div>
    </section>
    <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
      <aside aria-label="Filters" className="space-y-4 border border-border bg-surface p-4 lg:self-start">
        <fieldset><legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Activities</legend><div className="space-y-1">{filters.map(([value, label]) => <label key={value} className={`flex cursor-pointer items-center gap-2 border px-3 py-2 text-sm ${filter === value ? "border-accent bg-accent-muted" : "border-transparent hover:bg-surface-2"}`}><input type="radio" name="activity" className="accent-[var(--accent)]" checked={filter === value} onChange={() => setFilter(value)} />{label}</label>)}</div></fieldset>
        <div className="relative"><Search aria-hidden className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input aria-label="Search the feed" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" className="rounded-none pl-9" /></div>
        <HrField label="Group"><select className={hrInputClass} value={group} onChange={(event) => setGroup(event.target.value)}>{groups.map((item) => <option key={item} value={item}>{item === "all" ? "All groups" : item}</option>)}</select></HrField>
      </aside>
      <div className="space-y-4" aria-live="polite">
        {feed.length ? feed.map((entry) => entry.type === "stored" ? <FeedCard key={entry.item.id} item={entry.item} actorId={actorId} canModerate={hr} nameOf={nameOf} /> : <CelebrationCard key={entry.item.id} item={entry.item} actorId={actorId} />) : <HrEmpty>{q ? "Nothing matches your search." : "Nothing here yet. Be the first to post, or give someone kudos."}</HrEmpty>}
      </div>
    </div>
    {compose === "kudos" && actor && <KudosDialog actor={actor} employees={employees} onClose={() => setCompose(null)} onSend={(item) => { addItem(item); setCompose(null); toast.success("Kudos sent"); }} />}
    {compose === "poll" && actor && <PollDialog actor={actor} employees={employees} items={items} onClose={() => setCompose(null)} onSend={(item) => { addItem(item); setCompose(null); toast.success("Poll created"); }} />}
    {compose === "post" && actor && <PostDialog kind="post" actor={actor} employees={employees} items={items} onClose={() => setCompose(null)} onSend={(item) => { addItem(item); setCompose(null); toast.success("Posted"); }} />}
    {compose === "announcement" && actor && <PostDialog kind="announcement" actor={actor} employees={employees} items={items} onClose={() => setCompose(null)} onSend={(item) => { addItem(item); setCompose(null); toast.success("Announcement published"); }} />}
    {compose === "event" && actor && <EventDialog actor={actor} employees={employees} items={items} onClose={() => setCompose(null)} onSend={(item) => { addItem(item); setCompose(null); toast.success("Event created"); }} />}
  </div>;
}

function Reactions({ keyId, actorId }: { keyId: string; actorId: string }) {
  const meta = useHrEngageStore((state) => state.meta[keyId]) ?? noMeta;
  const react = useHrEngageStore((state) => state.react);
  const comment = useHrEngageStore((state) => state.comment);
  const employees = useHrPeopleStore((state) => state.employees);
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  return <div className="space-y-3 border-t border-border pt-3">
    <div className="flex flex-wrap items-center gap-2">
      {reactionEmojis.map((emoji) => { const who = meta.reactions[emoji] ?? []; const mine = who.includes(actorId); return <button key={emoji} type="button" aria-pressed={mine} aria-label={`${emoji} reaction, ${who.length}`} onClick={() => react(keyId, emoji, actorId)} className={`flex items-center gap-1 border px-2 py-1 text-xs ${mine ? "border-accent bg-accent-muted" : "border-border hover:border-accent"}`}><span aria-hidden>{emoji}</span>{who.length > 0 && <span>{who.length}</span>}</button>; })}
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="ml-auto text-xs text-muted-foreground hover:text-accent">{meta.comments.length ? `${meta.comments.length} ${meta.comments.length === 1 ? "comment" : "comments"}` : "Comment"}</button>
    </div>
    {open && <div className="space-y-2">
      {meta.comments.map((item) => <p key={item.id} className="text-sm"><span className="font-medium">{employees.find((person) => person.id === item.authorId)?.name ?? "Someone"}</span> <span className="text-muted-foreground">{timeAgo(item.at)}</span><br />{item.text}</p>)}
      <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); const value = text.trim(); if (!value) return; comment(keyId, { id: crypto.randomUUID(), authorId: actorId, text: value, at: new Date().toISOString() }); setText(""); }}><Input aria-label="Write a comment" maxLength={300} value={text} onChange={(event) => setText(event.target.value)} placeholder="Write a comment" className="rounded-none" /><Button size="sm" disabled={!text.trim()}>Post</Button></form>
    </div>}
  </div>;
}

function CelebrationCard({ item, actorId }: { item: DerivedItem; actorId: string }) {
  return <article aria-label={item.text} className="border border-border bg-surface p-4">
    <div className="mb-3 flex items-center gap-3"><span aria-hidden className="flex size-10 items-center justify-center bg-accent-muted text-xl">{celebrationEmoji[item.kind]}</span><div><p className="text-sm font-semibold">{item.text}</p><p className="text-xs text-muted-foreground">{item.employee.title} · {item.employee.department}</p></div></div>
    <Reactions keyId={item.id} actorId={actorId} />
  </article>;
}

function FeedCard({ item, actorId, canModerate, nameOf }: { item: EngageItem; actorId: string; canModerate: boolean; nameOf: (id: string) => string }) {
  const { vote, rsvp, removeItem } = useHrEngageStore();
  const [confirming, setConfirming] = React.useState(false);
  const author = nameOf(item.authorId);
  const today = hrToday();
  const poll = item.poll;
  const pollClosed = poll ? poll.closesAt < today : false;
  const myVote = poll?.votes[actorId];
  const total = poll ? Object.keys(poll.votes).length : 0;
  const showResults = Boolean(poll && (myVote || pollClosed));
  const event = item.event;
  const mine = event?.rsvp[actorId];
  const going = event ? Object.values(event.rsvp).filter((value) => value === "going").length : 0;
  const label = item.kind === "kudos" ? "Kudos" : item.kind === "poll" ? "Poll" : item.kind === "event" ? "Event" : item.kind === "announcement" ? "Announcement" : "Discussion";
  return <article aria-label={`${label} by ${author}`} className="border border-border bg-surface p-4">
    <header className="mb-3 flex items-start justify-between gap-3"><div className="flex items-center gap-3"><Avatar name={author} /><div><p className="text-sm font-semibold">{author}</p><p className="text-xs text-muted-foreground">{label} · {timeAgo(item.createdAt)}{item.group !== "all" ? ` · ${item.group}` : ""}</p></div></div>
      <div className="flex items-center gap-2">{item.pinned && <span className="flex items-center gap-1 border border-warning/40 bg-warning-muted px-1.5 py-0.5 text-[10px] text-warning"><Pin className="size-3" />Pinned</span>}{(item.authorId === actorId || canModerate) && (confirming ? <span className="flex items-center gap-1 text-xs"><button type="button" className="text-danger underline" onClick={() => { removeItem(item.id); toast.success("Removed"); }}>Remove</button><button type="button" className="text-muted-foreground underline" onClick={() => setConfirming(false)}>Keep</button></span> : <button type="button" aria-label={`Delete ${label.toLowerCase()} by ${author}`} onClick={() => setConfirming(true)} className="text-muted-foreground hover:text-danger"><Trash2 className="size-4" /></button>)}</div></header>
    {item.title && <h2 className="mb-1 text-base font-semibold">{item.title}</h2>}
    {item.kind === "kudos" && item.kudos && <p className="mb-2 flex flex-wrap items-center gap-2 text-sm"><Award aria-hidden className="size-4 text-accent" />Kudos to <strong>{nameOf(item.kudos.toId)}</strong><span className="border border-accent/40 bg-accent-muted px-2 py-0.5 text-xs text-accent">{item.kudos.value}</span></p>}
    <p className="whitespace-pre-line text-sm leading-6">{item.text}</p>
    {poll && <div className="mt-3 space-y-2" role="group" aria-label="Poll options">{poll.options.map((option) => { const votes = Object.values(poll.votes).filter((value) => value === option.id).length; const percent = total ? Math.round((votes / total) * 100) : 0; return <button key={option.id} type="button" disabled={pollClosed} aria-pressed={myVote === option.id} onClick={() => { vote(item.id, actorId, option.id); toast.success(myVote ? "Vote changed" : "Vote recorded"); }} className={`relative block w-full overflow-hidden border px-3 py-2 text-left text-sm ${myVote === option.id ? "border-accent" : "border-border hover:border-accent"} disabled:cursor-default`}>{showResults && <span aria-hidden className="absolute inset-y-0 left-0 bg-accent-muted" style={{ width: `${percent}%` }} />}<span className="relative flex justify-between gap-3"><span>{option.text}{myVote === option.id ? " ✓" : ""}</span>{showResults && <span className="text-xs text-muted-foreground">{votes} · {percent}%</span>}</span></button>; })}<p className="text-xs text-muted-foreground">{total} {total === 1 ? "vote" : "votes"} · {pollClosed ? "Closed" : `Closes ${new Date(`${poll.closesAt}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}{!myVote && !pollClosed ? " · Vote to see results" : ""}</p></div>}
    {event && <div className="mt-3 space-y-3 border border-border bg-surface-2 p-3 text-sm"><p className="flex items-center gap-2"><CalendarDays aria-hidden className="size-4 text-accent" /><span><strong>{eventTime(event.startsAt)}</strong> · {event.place}</span></p><div className="flex flex-wrap items-center gap-2" role="group" aria-label="RSVP">{(["going", "maybe", "no"] as const).map((status) => <Button key={status} size="sm" variant={mine === status ? "default" : "outline"} aria-pressed={mine === status} onClick={() => { rsvp(item.id, actorId, status); toast.success(`Marked as ${status === "no" ? "not going" : status}`); }}>{status === "going" ? "I'm going" : status === "maybe" ? "Maybe" : "Can't make it"}</Button>)}<span className="text-xs text-muted-foreground">{going} going{going > 0 ? `: ${Object.entries(event.rsvp).filter(([, value]) => value === "going").slice(0, 3).map(([id]) => nameOf(id).split(" ")[0]).join(", ")}${going > 3 ? ` +${going - 3}` : ""}` : ""}</span></div></div>}
    <div className="mt-3"><Reactions keyId={item.id} actorId={actorId} /></div>
  </article>;
}

function GroupField({ groups, value, onChange }: { groups: string[]; value: string; onChange: (value: string) => void }) {
  return <HrField label="Share with"><select className={hrInputClass} value={value} onChange={(event) => onChange(event.target.value)}>{groups.map((item) => <option key={item} value={item}>{item === "all" ? "Everyone" : `${item} team`}</option>)}</select></HrField>;
}
const newItem = (kind: EngageItem["kind"], authorId: string, group: string, text: string, extra: Partial<EngageItem> = {}): EngageItem => ({ id: `eng-${crypto.randomUUID()}`, kind, authorId, group, text, createdAt: new Date().toISOString(), ...extra });

function KudosDialog({ actor, employees, onSend, onClose }: { actor: HrEmployee; employees: HrEmployee[]; onSend: (item: EngageItem) => void; onClose: () => void }) {
  const people = employees.filter((item) => item.id !== actor.id && item.status !== "archived");
  const [to, setTo] = React.useState(people[0]?.id ?? "");
  const [value, setValue] = React.useState<string>(kudosValues[0]);
  const [text, setText] = React.useState("");
  const error = !to ? "Choose who to thank." : text.trim().length < 10 ? "Say what they did, in at least 10 characters." : "";
  return <HrModal open onOpenChange={(open) => !open && onClose()} title="Give kudos" description="Recognise a colleague. Everyone can see it.">
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (!error) onSend(newItem("kudos", actor.id, "all", text.trim(), { kudos: { toId: to, value } })); }}>
      <div className="grid gap-4 sm:grid-cols-2"><HrField label="Who?"><select className={hrInputClass} value={to} onChange={(event) => setTo(event.target.value)}>{people.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.title}</option>)}</select></HrField><HrField label="Company value"><select className={hrInputClass} value={value} onChange={(event) => setValue(event.target.value)}>{kudosValues.map((item) => <option key={item}>{item}</option>)}</select></HrField></div>
      <HrField label="What did they do?"><Textarea required maxLength={400} value={text} onChange={(event) => setText(event.target.value)} className="rounded-none" /></HrField>
      {error && text !== "" && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={Boolean(error)}>Send kudos</Button></div>
    </form>
  </HrModal>;
}

function PollDialog({ actor, employees, items, onSend, onClose }: { actor: HrEmployee; employees: HrEmployee[]; items: EngageItem[]; onSend: (item: EngageItem) => void; onClose: () => void }) {
  const [question, setQuestion] = React.useState("");
  const [options, setOptions] = React.useState(["", ""]);
  const [days, setDays] = React.useState(7);
  const [group, setGroup] = React.useState("all");
  const filled = options.map((item) => item.trim()).filter(Boolean);
  const error = question.trim().length < 5 ? "Ask a question (at least 5 characters)." : filled.length < 2 ? "Add at least two options." : new Set(filled.map((item) => item.toLowerCase())).size !== filled.length ? "Options must be different." : "";
  return <HrModal open onOpenChange={(open) => !open && onClose()} title="Create a poll" description="Colleagues vote once and can change their vote until it closes.">
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (error) return; const closes = new Date(`${hrToday()}T12:00:00`); closes.setDate(closes.getDate() + days); onSend(newItem("poll", actor.id, group, question.trim(), { poll: { options: filled.map((text, index) => ({ id: String(index), text })), votes: {}, closesAt: closes.toLocaleDateString("en-CA") } })); }}>
      <HrField label="Question"><Input required maxLength={160} value={question} onChange={(event) => setQuestion(event.target.value)} className="rounded-none" /></HrField>
      <fieldset className="space-y-2"><legend className="text-xs font-medium text-muted-foreground">Options</legend>{options.map((option, index) => <Input key={index} aria-label={`Option ${index + 1}`} maxLength={80} value={option} onChange={(event) => setOptions(options.map((item, position) => position === index ? event.target.value : item))} placeholder={`Option ${index + 1}`} className="rounded-none" />)}{options.length < 5 && <Button type="button" size="sm" variant="outline" onClick={() => setOptions([...options, ""])}>Add option</Button>}</fieldset>
      <div className="grid gap-4 sm:grid-cols-2"><HrField label="Closes in"><select className={hrInputClass} value={days} onChange={(event) => setDays(Number(event.target.value))}>{[3, 7, 14].map((item) => <option key={item} value={item}>{item} days</option>)}</select></HrField><GroupField groups={itemGroups(items, employees)} value={group} onChange={setGroup} /></div>
      {error && question !== "" && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={Boolean(error)}>Create poll</Button></div>
    </form>
  </HrModal>;
}

function PostDialog({ kind, actor, employees, items, onSend, onClose }: { kind: "post" | "announcement"; actor: HrEmployee; employees: HrEmployee[]; items: EngageItem[]; onSend: (item: EngageItem) => void; onClose: () => void }) {
  const [title, setTitle] = React.useState("");
  const [text, setText] = React.useState("");
  const [group, setGroup] = React.useState("all");
  const [pinned, setPinned] = React.useState(false);
  const announcement = kind === "announcement";
  const error = announcement && title.trim().length < 3 ? "Add a short headline." : text.trim().length < 5 ? "Write at least 5 characters." : "";
  return <HrModal open onOpenChange={(open) => !open && onClose()} title={announcement ? "Publish an announcement" : "Start a discussion"} description={announcement ? "Shown at the top of the feed and on everyone's Home page." : "Share a question or an idea with the team."}>
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (!error) onSend(newItem(kind, actor.id, group, text.trim(), { title: announcement ? title.trim() : undefined, pinned: announcement && pinned })); }}>
      {announcement && <HrField label="Headline"><Input required maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} className="rounded-none" /></HrField>}
      <HrField label={announcement ? "Details" : "What's on your mind?"}><Textarea required maxLength={600} value={text} onChange={(event) => setText(event.target.value)} className="rounded-none" /></HrField>
      <GroupField groups={itemGroups(items, employees)} value={group} onChange={setGroup} />
      {announcement && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} />Pin to the top</label>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={Boolean(error)}>{announcement ? "Publish" : "Post"}</Button></div>
    </form>
  </HrModal>;
}

function EventDialog({ actor, employees, items, onSend, onClose }: { actor: HrEmployee; employees: HrEmployee[]; items: EngageItem[]; onSend: (item: EngageItem) => void; onClose: () => void }) {
  const [title, setTitle] = React.useState("");
  const [startsAt, setStartsAt] = React.useState("");
  const [place, setPlace] = React.useState("");
  const [text, setText] = React.useState("");
  const [group, setGroup] = React.useState("all");
  const error = title.trim().length < 3 ? "Give the event a name." : !startsAt || startsAt < `${hrToday()}T00:00` ? "Choose a date and time that isn't in the past." : place.trim().length < 2 ? "Where is it happening?" : "";
  return <HrModal open onOpenChange={(open) => !open && onClose()} title="Create an event" description="Party, town hall or team lunch. People can reply going, maybe or can't make it.">
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (!error) onSend(newItem("event", actor.id, group, text.trim() || "Join us.", { title: title.trim(), event: { startsAt, place: place.trim(), rsvp: {} } })); }}>
      <HrField label="Event name"><Input required maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} className="rounded-none" /></HrField>
      <div className="grid gap-4 sm:grid-cols-2"><HrField label="When"><Input type="datetime-local" min={`${hrToday()}T00:00`} value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="rounded-none" /></HrField><HrField label="Where"><Input maxLength={100} value={place} onChange={(event) => setPlace(event.target.value)} className="rounded-none" /></HrField></div>
      <HrField label="Details · optional"><Textarea maxLength={400} value={text} onChange={(event) => setText(event.target.value)} className="rounded-none" /></HrField>
      <GroupField groups={itemGroups(items, employees)} value={group} onChange={setGroup} />
      {error && title !== "" && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={Boolean(error)}>Create event</Button></div>
    </form>
  </HrModal>;
}
