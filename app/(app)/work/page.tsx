"use client";

import * as React from "react";
import {
  usePersonalTasksStore,
  NOTE_COLORS,
  type PersonalTask,
  type NoteColor,
} from "@/lib/stores/personal-tasks-store";
import { todayIso } from "@/lib/today";
import {
  Archive,
  Bell,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  Edit3,
  Filter,
  Inbox,
  Lock,
  Palette,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Send,
  StickyNote,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type TabId = "mynotes" | "quick" | "reminders";

export default function WorkInboxPage() {
  const today = todayIso();
  const [tab, setTab] = React.useState<TabId>("quick");
  const tasks = usePersonalTasksStore((s) => s.tasks);

  const myNotesCount = tasks.filter((t) => (t.kind ?? "task") === "task" && !t.completed).length;
  const quickCount = tasks.filter((t) => t.kind === "note").length;
  const remindersCount = tasks.filter((t) => t.kind === "reminder" && !t.completed).length;

  return (
    <div className="mx-auto flex h-full max-w-[780px] flex-col">
      {/* Header */}
      <div className="px-6 pt-6 pb-0">
        <div className="flex items-end justify-between">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Work</h1>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground/40">
            <Lock className="size-3" />
            Private to you
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-4 flex gap-0 border-b border-border">
          {([
            { id: "quick" as TabId, label: "Quick Notes", icon: Pencil, count: quickCount },
            { id: "mynotes" as TabId, label: "My Notes", icon: StickyNote, count: myNotesCount },
            { id: "reminders" as TabId, label: "Reminders", icon: Bell, count: remindersCount },
          ]).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "relative flex items-center gap-1.5 px-3.5 pb-2.5 pt-1 text-[13px] font-medium transition-colors",
                tab === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <t.icon className="size-3.5" />
              {t.label}
              {t.count > 0 && (
                <span className={cn(
                  "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold",
                  tab === t.id ? "bg-accent text-white" : "bg-muted text-muted-foreground",
                )}>
                  {t.count}
                </span>
              )}
              {tab === t.id && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-accent" />}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-6 pb-4">
        {tab === "mynotes" ? <MyNotesTab today={today} /> : tab === "quick" ? <QuickNotesTab /> : <RemindersTab today={today} />}
      </div>
    </div>
  );
}

/* ============================================================
   MY NOTES — rich cards with colors, body, tags, due dates,
   done toggle, pin
   ============================================================ */

function MyNotesTab({ today }: { today: string }) {
  const tasks = usePersonalTasksStore((s) => s.tasks);
  const addTask = usePersonalTasksStore((s) => s.addTask);
  const deleteTask = usePersonalTasksStore((s) => s.deleteTask);
  const updateTask = usePersonalTasksStore((s) => s.updateTask);

  const isTask = (t: PersonalTask) => (t.kind ?? "task") === "task";
  const myNotes = tasks.filter(isTask);

  const [composing, setComposing] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [dueDate, setDueDate] = React.useState(today);
  const [noteColor, setNoteColor] = React.useState<NoteColor>("default");
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [showSearch, setShowSearch] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [filterTag, setFilterTag] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const err = addTask(title, dueDate);
    if (err) { setError(err); return; }
    const added = usePersonalTasksStore.getState().tasks;
    const newest = added[added.length - 1];
    if (newest && (body.trim() || noteColor !== "default")) {
      updateTask(newest.id, { body: body.trim(), color: noteColor });
    }
    setTitle(""); setBody(""); setDueDate(today); setNoteColor("default"); setError(null); setComposing(false);
  }

  const allTags = React.useMemo(() => {
    const s = new Set<string>();
    myNotes.forEach((t) => t.tags?.forEach((tag) => s.add(tag)));
    return [...s].sort();
  }, [myNotes]);

  const q = search.toLowerCase();
  const filtered = myNotes
    .filter((t) => !q || t.title.toLowerCase().includes(q) || t.body?.toLowerCase().includes(q))
    .filter((t) => !filterTag || t.tags?.includes(filterTag));

  const pinned = filtered.filter((t) => t.pinned);
  const active = filtered.filter((t) => !t.pinned).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 py-3">
        <button
          type="button"
          onClick={() => { setShowSearch((v) => !v); if (showSearch) setSearch(""); }}
          className={cn("rounded-lg p-1.5 transition-colors", showSearch ? "bg-surface-2 text-foreground" : "text-muted-foreground/50 hover:text-foreground")}
        >
          <Search className="size-3.5" />
        </button>
        {showSearch && (
          <div className="relative min-w-0 flex-1 basis-40">
            <input
              type="text"
              placeholder="Search notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-full rounded-lg border border-border bg-surface px-3 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
              autoFocus
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground">
                <X className="size-3" />
              </button>
            )}
          </div>
        )}
        {allTags.length > 0 && (
          <div className="flex items-center gap-1">
            <Filter className="size-3 text-muted-foreground/40" />
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors",
                  filterTag === tag ? "bg-accent text-white" : "bg-surface-2 text-muted-foreground hover:text-foreground",
                )}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setComposing(true); setTimeout(() => inputRef.current?.focus(), 50); }}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[11px] font-medium text-white shadow-sm transition-all hover:bg-accent/90 active:scale-[0.98]"
          >
            <Plus className="size-3.5" />
            Note
          </button>
        </div>
      </div>

      {/* Compose */}
      {composing && (
        <form onSubmit={handleAdd} className={cn("mb-4 flex flex-col gap-3 rounded-2xl border-2 p-4 shadow-md", NOTE_COLORS[noteColor].bg, NOTE_COLORS[noteColor].border)}>
          <input
            ref={inputRef}
            type="text"
            placeholder="Note title..."
            value={title}
            onChange={(e) => { setTitle(e.target.value); setError(null); }}
            className="border-none bg-transparent text-sm font-semibold text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
          />
          <textarea
            placeholder="Details..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            className="resize-none border-none bg-transparent text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/30 focus:outline-none"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/50 px-2 py-1">
                <Clock className="size-3 text-muted-foreground" />
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="border-none bg-transparent text-xs text-foreground focus:outline-none" />
              </div>
              <div className="flex items-center gap-0.5">
                <Palette className="mr-0.5 size-3 text-muted-foreground/50" />
                {(Object.keys(NOTE_COLORS) as NoteColor[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNoteColor(c)}
                    title={NOTE_COLORS[c].label}
                    className={cn(
                      "size-5 rounded-full border-2 transition-all",
                      c === "default" ? "bg-surface" : c === "blue" ? "bg-blue-400" : c === "green" ? "bg-emerald-400" : c === "amber" ? "bg-amber-400" : c === "rose" ? "bg-rose-400" : "bg-purple-400",
                      noteColor === c ? "scale-110 border-foreground ring-2 ring-foreground/10" : "border-transparent hover:scale-105",
                    )}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="ghost" className="text-xs" onClick={() => { setComposing(false); setTitle(""); setBody(""); setError(null); setNoteColor("default"); }}>Cancel</Button>
              <Button type="submit" size="sm" className="gap-1.5"><Check className="size-3" />Save</Button>
            </div>
          </div>
          {error && <p className="text-xs font-medium text-danger">{error}</p>}
        </form>
      )}

      {/* Notes list */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-3">
        {pinned.length > 0 && (
          <>
            <div className="flex items-center gap-2 pb-1 pt-0.5">
              <Pin className="size-2.5 text-accent/60" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-accent/60">Pinned</span>
              <div className="flex-1 border-b border-accent/10" />
            </div>
            {pinned.map((n) => (
              <RichNoteCard key={n.id} note={n} today={today} onDelete={deleteTask} onUpdate={updateTask} editing={editingId === n.id} setEditing={(v) => setEditingId(v ? n.id : null)} />
            ))}
            <div className="h-1" />
          </>
        )}

        {active.map((n) => (
          <RichNoteCard key={n.id} note={n} today={today} onDelete={deleteTask} onUpdate={updateTask} editing={editingId === n.id} setEditing={(v) => setEditingId(v ? n.id : null)} />
        ))}

        {filtered.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16">
            <div className="rounded-2xl bg-muted/20 p-4">
              <StickyNote className="size-7 text-muted-foreground/20" />
            </div>
            <p className="text-sm text-muted-foreground/60">{search ? "No notes match" : "No notes yet"}</p>
            <p className="text-xs text-muted-foreground/30">Click + Note to create your first one</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Rich note card (for My Notes tab) ---------- */

function RichNoteCard({
  note, today, onDelete, onUpdate, editing, setEditing,
}: {
  note: PersonalTask; today: string;
  onDelete: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Pick<PersonalTask, "title" | "body" | "dueDate" | "pinned" | "color" | "tags">>) => void;
  editing: boolean; setEditing: (v: boolean) => void;
}) {
  const color = NOTE_COLORS[note.color ?? "default"] ?? NOTE_COLORS.default;
  const overdue = !note.completed && note.dueDate && note.dueDate < today;

  const [editTitle, setEditTitle] = React.useState(note.title);
  const [editBody, setEditBody] = React.useState(note.body ?? "");
  const [editDue, setEditDue] = React.useState(note.dueDate);
  const [editColor, setEditColor] = React.useState<NoteColor>(note.color ?? "default");
  const [tagInput, setTagInput] = React.useState("");
  const [showTags, setShowTags] = React.useState(false);

  function saveEdit() {
    onUpdate(note.id, { title: editTitle.trim() || note.title, body: editBody.trim(), dueDate: editDue, color: editColor });
    setEditing(false);
  }
  function addTag() {
    const tag = tagInput.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (tag && !(note.tags ?? []).includes(tag)) onUpdate(note.id, { tags: [...(note.tags ?? []), tag] });
    setTagInput("");
  }

  if (editing) {
    return (
      <div className={cn("flex flex-col gap-3 rounded-2xl border-2 p-4 shadow-md", NOTE_COLORS[editColor].bg, NOTE_COLORS[editColor].border)}>
        <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="border-none bg-transparent text-sm font-semibold text-foreground focus:outline-none" autoFocus />
        <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={3} placeholder="Details..." className="resize-none border-none bg-transparent text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/30 focus:outline-none" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/50 px-2 py-1">
              <Clock className="size-3 text-muted-foreground" />
              <input type="date" value={editDue} onChange={(e) => setEditDue(e.target.value)} className="border-none bg-transparent text-xs text-foreground focus:outline-none" />
            </div>
            <div className="flex items-center gap-0.5">
              <Palette className="mr-0.5 size-3 text-muted-foreground/50" />
              {(Object.keys(NOTE_COLORS) as NoteColor[]).map((c) => (
                <button key={c} type="button" onClick={() => setEditColor(c)} title={NOTE_COLORS[c].label} className={cn("size-5 rounded-full border-2 transition-all", c === "default" ? "bg-surface" : c === "blue" ? "bg-blue-400" : c === "green" ? "bg-emerald-400" : c === "amber" ? "bg-amber-400" : c === "rose" ? "bg-rose-400" : "bg-purple-400", editColor === c ? "scale-110 border-foreground ring-2 ring-foreground/10" : "border-transparent hover:scale-105")} />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" className="text-xs" onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="sm" className="gap-1.5" onClick={saveEdit}><Check className="size-3" />Save</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("group relative flex flex-col gap-2 rounded-2xl border p-4 transition-all shadow-sm hover:shadow-md", color.bg, color.border)}>
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm font-medium leading-snug text-foreground">{note.title}</span>
          {note.body && <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground/70">{note.body}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <ActionBtn icon={note.pinned ? PinOff : Pin} title={note.pinned ? "Unpin" : "Pin"} onClick={() => onUpdate(note.id, { pinned: !note.pinned })} />
          <ActionBtn icon={Edit3} title="Edit" onClick={() => { setEditTitle(note.title); setEditBody(note.body ?? ""); setEditDue(note.dueDate); setEditColor(note.color ?? "default"); setEditing(true); }} />
          <ActionBtn icon={Tag} title="Tags" onClick={() => setShowTags((v) => !v)} />
          <ActionBtn icon={Trash2} title="Delete" onClick={() => onDelete(note.id)} danger />
        </div>
      </div>

      {((note.tags ?? []).length > 0 || showTags) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {(note.tags ?? []).map((tag) => (
            <span key={tag} className="flex items-center gap-1 rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              #{tag}
              <button type="button" onClick={() => onUpdate(note.id, { tags: (note.tags ?? []).filter((t) => t !== tag) })} className="hover:text-danger"><X className="size-2.5" /></button>
            </span>
          ))}
          {showTags && (
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
              onBlur={() => { if (tagInput.trim()) addTag(); setShowTags(false); }}
              placeholder="add tag..."
              className="h-5 w-20 border-none bg-transparent text-[10px] text-foreground placeholder:text-muted-foreground/30 focus:outline-none"
              autoFocus
            />
          )}
        </div>
      )}

      <div className="flex items-center gap-3 text-[10px] text-muted-foreground/50">
        {note.dueDate && (
          <span className={cn("flex items-center gap-1", overdue && "font-medium text-danger")}>
            <Clock className="size-2.5" />
            {formatDue(note.dueDate, today)}
          </span>
        )}
        <span>{timeAgo(note.updatedAt ?? note.createdAt)}</span>
        {note.pinned && <Pin className="size-2.5 text-accent/60" />}
      </div>
    </div>
  );
}

/* ============================================================
   QUICK NOTES — simple saved messages, chat-style.
   Only: text, pin, edit, delete. "edited" badge.
   ============================================================ */

function QuickNotesTab() {
  const tasks = usePersonalTasksStore((s) => s.tasks);
  const addNote = usePersonalTasksStore((s) => s.addNote);
  const deleteTask = usePersonalTasksStore((s) => s.deleteTask);
  const updateTask = usePersonalTasksStore((s) => s.updateTask);

  const notes = tasks.filter((t) => t.kind === "note");

  const [search, setSearch] = React.useState("");
  const [showSearch, setShowSearch] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editText, setEditText] = React.useState("");
  const [quickText, setQuickText] = React.useState("");
  const streamRef = React.useRef<HTMLDivElement>(null);
  const editRef = React.useRef<HTMLTextAreaElement>(null);

  function handleSend() {
    const trimmed = quickText.trim();
    if (!trimmed) return;
    addNote(trimmed);
    setQuickText("");
    requestAnimationFrame(() => {
      streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: "smooth" });
    });
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  function startEdit(id: string, text: string) {
    setEditingId(id);
    setEditText(text);
    setTimeout(() => editRef.current?.focus(), 30);
  }

  function saveEdit(id: string) {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== notes.find((t) => t.id === id)?.title) {
      updateTask(id, { title: trimmed });
    }
    setEditingId(null);
  }

  const q = search.toLowerCase();
  const filtered = notes.filter((t) => !q || t.title.toLowerCase().includes(q));
  const pinned = filtered.filter((t) => t.pinned);
  const unpinned = filtered.filter((t) => !t.pinned).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Search */}
      <div className="flex items-center gap-2 py-3">
        <button
          type="button"
          onClick={() => { setShowSearch((v) => !v); if (showSearch) setSearch(""); }}
          className={cn("rounded-lg p-1.5 transition-colors", showSearch ? "bg-surface-2 text-foreground" : "text-muted-foreground/50 hover:text-foreground")}
        >
          <Search className="size-3.5" />
        </button>
        {showSearch && (
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search quick notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-full rounded-lg border border-border bg-surface px-3 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
              autoFocus
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground">
                <X className="size-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Stream */}
      <div ref={streamRef} className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {pinned.length > 0 && (
          <>
            <div className="flex items-center gap-2 pb-1 pt-0.5">
              <Pin className="size-2.5 text-accent/60" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-accent/60">Pinned</span>
              <div className="flex-1 border-b border-accent/10" />
            </div>
            {pinned.map((n) => (
              <NoteRow key={n.id} note={n} editing={editingId === n.id} editText={editText} editRef={editRef} onEditTextChange={setEditText} onStartEdit={startEdit} onSaveEdit={saveEdit} onCancelEdit={() => setEditingId(null)} onPin={updateTask} onDelete={deleteTask} />
            ))}
            <div className="h-2" />
          </>
        )}

        {unpinned.map((n, i) => {
          const prev = unpinned[i - 1];
          const lbl = dateLabel(n.createdAt);
          const showDate = !prev || lbl !== dateLabel(prev.createdAt);
          return (
            <React.Fragment key={n.id}>
              {showDate && (
                <div className="flex items-center gap-3 pb-1 pt-3 first:pt-0">
                  <div className="flex-1 border-b border-border/30" />
                  <span className="select-none text-[10px] font-medium text-muted-foreground/40">{lbl}</span>
                  <div className="flex-1 border-b border-border/30" />
                </div>
              )}
              <NoteRow note={n} editing={editingId === n.id} editText={editText} editRef={editRef} onEditTextChange={setEditText} onStartEdit={startEdit} onSaveEdit={saveEdit} onCancelEdit={() => setEditingId(null)} onPin={updateTask} onDelete={deleteTask} />
            </React.Fragment>
          );
        })}

        {filtered.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16">
            <div className="rounded-2xl bg-muted/20 p-4">
              <Inbox className="size-7 text-muted-foreground/20" />
            </div>
            <p className="text-sm text-muted-foreground/60">{search ? "No matches" : "No quick notes yet"}</p>
            <p className="text-xs text-muted-foreground/30">Type below to jot one down</p>
          </div>
        )}
        <div className="h-2" />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-border pt-3 pb-1">
        <div className="relative">
          <textarea
            value={quickText}
            onChange={(e) => setQuickText(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Write a quick note..."
            rows={1}
            className="min-h-[40px] max-h-[120px] w-full resize-none rounded-xl border border-border bg-surface-2 py-2.5 pl-4 pr-11 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-shadow"
            style={{ height: "40px" }}
            onInput={(e) => { const el = e.currentTarget; el.style.height = "40px"; el.style.height = `${Math.min(el.scrollHeight, 120)}px`; }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!quickText.trim()}
            className={cn("absolute bottom-1.5 right-1.5 flex size-7 items-center justify-center rounded-lg transition-all", quickText.trim() ? "bg-accent text-white shadow-sm hover:bg-accent/90 active:scale-95" : "text-muted-foreground/20")}
          >
            <Send className="size-3.5" />
          </button>
        </div>
        <p className="mt-1 flex items-center gap-2 px-1 text-[10px] text-muted-foreground/30">
          <span>Enter to save</span>
          <span className="size-0.5 rounded-full bg-current" />
          <span>Shift+Enter new line</span>
        </p>
      </div>
    </div>
  );
}

/* ---------- Single quick note row ---------- */

interface NoteRowProps {
  note: { id: string; title: string; createdAt: string; updatedAt: string; pinned: boolean };
  editing: boolean; editText: string; editRef: React.RefObject<HTMLTextAreaElement | null>;
  onEditTextChange: (v: string) => void; onStartEdit: (id: string, text: string) => void;
  onSaveEdit: (id: string) => void; onCancelEdit: () => void;
  onPin: (id: string, patch: Record<string, unknown>) => void; onDelete: (id: string) => void;
}

function NoteRow({ note, editing, editText, editRef, onEditTextChange, onStartEdit, onSaveEdit, onCancelEdit, onPin, onDelete }: NoteRowProps) {
  const wasEdited = note.updatedAt !== note.createdAt;

  if (editing) {
    return (
      <div className="rounded-xl border border-accent/30 bg-accent/[0.03] p-3">
        <textarea
          ref={editRef}
          value={editText}
          onChange={(e) => onEditTextChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSaveEdit(note.id); }
            if (e.key === "Escape") onCancelEdit();
          }}
          rows={2}
          className="w-full resize-none border-none bg-transparent text-sm leading-relaxed text-foreground focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          <button type="button" onClick={onCancelEdit} className="rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
          <button type="button" onClick={() => onSaveEdit(note.id)} className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent/90">Save</button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-surface-2/60">
      <div className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/15" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">{note.title}</p>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/40">
          <span>{timeAgo(note.createdAt)}</span>
          {wasEdited && (
            <span className="flex items-center gap-0.5 text-muted-foreground/30">
              <Pencil className="size-2" />
              edited
            </span>
          )}
          {note.pinned && <Pin className="size-2.5 text-accent/50" />}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 pt-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <ActionBtn icon={note.pinned ? PinOff : Pin} title={note.pinned ? "Unpin" : "Pin"} onClick={() => onPin(note.id, { pinned: !note.pinned })} small />
        <ActionBtn icon={Edit3} title="Edit" onClick={() => onStartEdit(note.id, note.title)} small />
        <ActionBtn icon={Trash2} title="Delete" onClick={() => onDelete(note.id)} danger small />
      </div>
    </div>
  );
}

/* ============================================================
   REMINDERS — simple reminder messages the user adds.
   Text + optional date, mark done, edit, delete.
   ============================================================ */

function RemindersTab({ today }: { today: string }) {
  const tasks = usePersonalTasksStore((s) => s.tasks);
  const addReminder = usePersonalTasksStore((s) => s.addReminder);
  const toggleTask = usePersonalTasksStore((s) => s.toggleTask);
  const deleteTask = usePersonalTasksStore((s) => s.deleteTask);
  const updateTask = usePersonalTasksStore((s) => s.updateTask);

  const reminders = tasks.filter((t) => t.kind === "reminder");

  const [text, setText] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [showDone, setShowDone] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editText, setEditText] = React.useState("");

  function handleAdd() {
    const trimmed = text.trim();
    if (!trimmed) return;
    addReminder(trimmed, dueDate || undefined);
    setText("");
    setDueDate("");
  }

  const active = reminders.filter((r) => !r.completed).sort((a, b) => {
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
  const done = reminders.filter((r) => r.completed);
  const doneCount = done.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Add reminder */}
      <div className="flex flex-col gap-2 py-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
              placeholder="Add a reminder..."
              className="h-9 w-full rounded-xl border border-border bg-surface-2 pl-4 pr-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-shadow"
            />
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-surface px-2 py-1">
            <Clock className="size-3 text-muted-foreground/50" />
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="border-none bg-transparent text-xs text-foreground focus:outline-none" />
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!text.trim()}
            className={cn("flex h-9 items-center gap-1.5 rounded-xl px-4 text-xs font-medium transition-all", text.trim() ? "bg-accent text-white shadow-sm hover:bg-accent/90 active:scale-[0.98]" : "bg-muted text-muted-foreground/30")}
          >
            <Plus className="size-3.5" />
            Add
          </button>
        </div>
      </div>

      {/* Toolbar */}
      {doneCount > 0 && (
        <div className="flex items-center gap-2 pb-2">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className={cn("flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] transition-colors", showDone ? "bg-success/10 text-success" : "text-muted-foreground hover:text-foreground")}
          >
            <Archive className="size-3" />
            {showDone ? "Hide done" : `Done (${doneCount})`}
          </button>
        </div>
      )}

      {/* List */}
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pb-3">
        {active.map((r) => {
          const overdue = r.dueDate && r.dueDate < today;
          const isEditing = editingId === r.id;

          if (isEditing) {
            return (
              <div key={r.id} className="rounded-xl border border-accent/30 bg-accent/[0.03] p-3">
                <input
                  type="text"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); updateTask(r.id, { title: editText.trim() || r.title }); setEditingId(null); }
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="w-full border-none bg-transparent text-sm text-foreground focus:outline-none"
                  autoFocus
                />
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button type="button" onClick={() => setEditingId(null)} className="rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                  <button type="button" onClick={() => { updateTask(r.id, { title: editText.trim() || r.title }); setEditingId(null); }} className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent/90">Save</button>
                </div>
              </div>
            );
          }

          return (
            <div key={r.id} className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-2/60">
              <button type="button" onClick={() => toggleTask(r.id)} className="shrink-0 transition-colors">
                <Circle className="size-4.5 text-muted-foreground/25 hover:text-accent" />
              </button>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[13px] leading-snug text-foreground">{r.title}</span>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground/40">
                  {r.dueDate && (
                    <span className={cn("flex items-center gap-1", overdue && "font-medium text-danger")}>
                      <Clock className="size-2.5" />
                      {formatDue(r.dueDate, today)}
                    </span>
                  )}
                  <span>{timeAgo(r.createdAt)}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <ActionBtn icon={Edit3} title="Edit" onClick={() => { setEditingId(r.id); setEditText(r.title); }} small />
                <ActionBtn icon={Trash2} title="Delete" onClick={() => deleteTask(r.id)} danger small />
              </div>
            </div>
          );
        })}

        {showDone && done.length > 0 && (
          <>
            <div className="flex items-center gap-2 pb-1 pt-3">
              <CheckCircle2 className="size-2.5 text-success/60" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-success/60">Done</span>
              <div className="flex-1 border-b border-success/10" />
            </div>
            {done.map((r) => (
              <div key={r.id} className="group flex items-center gap-3 rounded-xl px-3 py-2 opacity-40 transition-colors hover:bg-surface-2/60">
                <button type="button" onClick={() => toggleTask(r.id)} className="shrink-0">
                  <CheckCircle2 className="size-4.5 text-success" />
                </button>
                <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground line-through">{r.title}</span>
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <ActionBtn icon={Trash2} title="Delete" onClick={() => deleteTask(r.id)} danger small />
                </div>
              </div>
            ))}
          </>
        )}

        {reminders.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16">
            <div className="rounded-2xl bg-muted/20 p-4">
              <Bell className="size-7 text-muted-foreground/20" />
            </div>
            <p className="text-sm text-muted-foreground/60">No reminders yet</p>
            <p className="text-xs text-muted-foreground/30">Add one above to get started</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Shared helpers ---------- */

function ActionBtn({ icon: Icon, title, onClick, danger, small }: { icon: React.ElementType; title: string; onClick: () => void; danger?: boolean; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg transition-colors",
        small ? "p-1" : "p-1.5",
        danger ? "text-muted-foreground/50 hover:bg-danger/10 hover:text-danger" : "text-muted-foreground/50 hover:bg-surface-2 hover:text-foreground",
      )}
      title={title}
    >
      <Icon className={small ? "size-3" : "size-3.5"} />
    </button>
  );
}

function dateLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString("en-IN", { weekday: "long" });
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function formatDue(date: string, today: string): string {
  if (!date) return "";
  if (date === today) return "Today";
  const diff = Math.round((Date.parse(date) - Date.parse(today)) / 86400000);
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff <= 7) return `In ${diff}d`;
  return new Date(date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function timeAgo(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
