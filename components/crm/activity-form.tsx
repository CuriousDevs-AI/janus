"use client";

import { useMemo, useState } from "react";
import {
  Phone, Video, Mail, ClipboardList, StickyNote, Search,
  Clock, CalendarClock, MessageCircle, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import type { Activity, ActivityKind } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface KindConfig {
  key: ActivityKind;
  label: string;
  icon: typeof Phone;
  color: string;
  activeBg: string;
  activeBorder: string;
  placeholder: string;
  descPlaceholder: string;
  hasOutcome: boolean;
  hasDuration: boolean;
  hasDueDate: boolean;
  outcomes?: { value: string; label: string; icon: typeof Phone }[];
}

const KINDS: KindConfig[] = [
  {
    key: "call",
    label: "Call",
    icon: Phone,
    color: "text-emerald-600 dark:text-emerald-400",
    activeBg: "bg-emerald-50 dark:bg-emerald-950",
    activeBorder: "border-emerald-300 dark:border-emerald-700",
    placeholder: "Call with…",
    descPlaceholder: "What was discussed…",
    hasOutcome: true,
    hasDuration: true,
    hasDueDate: false,
    outcomes: [
      { value: "connected", label: "Connected", icon: CheckCircle2 },
      { value: "no_answer", label: "No Answer", icon: Phone },
      { value: "left_voicemail", label: "Voicemail", icon: MessageCircle },
      { value: "interested", label: "Interested", icon: CheckCircle2 },
      { value: "not_interested", label: "Not Interested", icon: Phone },
      { value: "follow_up", label: "Follow-up", icon: CalendarClock },
    ],
  },
  {
    key: "meeting",
    label: "Meeting",
    icon: Video,
    color: "text-blue-600 dark:text-blue-400",
    activeBg: "bg-blue-50 dark:bg-blue-950",
    activeBorder: "border-blue-300 dark:border-blue-700",
    placeholder: "Meeting about…",
    descPlaceholder: "Agenda / notes from the meeting…",
    hasOutcome: true,
    hasDuration: true,
    hasDueDate: false,
    outcomes: [
      { value: "connected", label: "Completed", icon: CheckCircle2 },
      { value: "interested", label: "Interested", icon: CheckCircle2 },
      { value: "not_interested", label: "Not Interested", icon: Phone },
      { value: "follow_up", label: "Follow-up Needed", icon: CalendarClock },
    ],
  },
  {
    key: "email",
    label: "Email",
    icon: Mail,
    color: "text-amber-600 dark:text-amber-400",
    activeBg: "bg-amber-50 dark:bg-amber-950",
    activeBorder: "border-amber-300 dark:border-amber-700",
    placeholder: "Email subject…",
    descPlaceholder: "Key points from the email…",
    hasOutcome: false,
    hasDuration: false,
    hasDueDate: false,
  },
  {
    key: "task",
    label: "Task",
    icon: ClipboardList,
    color: "text-rose-600 dark:text-rose-400",
    activeBg: "bg-rose-50 dark:bg-rose-950",
    activeBorder: "border-rose-300 dark:border-rose-700",
    placeholder: "What needs to be done…",
    descPlaceholder: "Details or steps…",
    hasOutcome: false,
    hasDuration: false,
    hasDueDate: true,
  },
  {
    key: "note",
    label: "Note",
    icon: StickyNote,
    color: "text-purple-600 dark:text-purple-400",
    activeBg: "bg-purple-50 dark:bg-purple-950",
    activeBorder: "border-purple-300 dark:border-purple-700",
    placeholder: "Quick note title…",
    descPlaceholder: "Write your note…",
    hasOutcome: false,
    hasDuration: false,
    hasDueDate: false,
  },
];

interface ContactOption {
  contactId: string;
  name: string;
  phone: string | null;
  email: string | null;
}

const DURATION_PRESETS = [5, 10, 15, 30, 45, 60, 90];

export function ActivityForm({
  open,
  onOpenChange,
  leadId,
  dealId,
  contactId: fixedContactId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId?: string | null;
  dealId?: string | null;
  contactId: string;
  onSaved?: () => void;
}) {
  const needsContactPicker = !fixedContactId;

  const [kind, setKind] = useState<ActivityKind>("call");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [outcome, setOutcome] = useState("");
  const [duration, setDuration] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [pickedContactId, setPickedContactId] = useState("");

  const contacts = useApi<ContactOption[]>(
    needsContactPicker && open ? `/customers?limit=20${contactSearch ? `&q=${encodeURIComponent(contactSearch)}` : ""}` : null,
  );
  const contactOptions = useMemo(() => contacts.data ?? [], [contacts.data]);

  const resolvedContactId = fixedContactId || pickedContactId;

  const cfg = KINDS.find((k) => k.key === kind)!;

  function switchKind(k: ActivityKind) {
    setKind(k);
    setOutcome("");
    setDuration("");
    setDueAt("");
  }

  async function save() {
    if (!subject.trim() && kind !== "note") {
      toast.error("Enter a subject");
      return;
    }
    if (kind === "note" && !description.trim() && !subject.trim()) {
      toast.error("Write something");
      return;
    }
    if (!resolvedContactId) {
      toast.error("Select a customer");
      return;
    }
    setBusy(true);
    try {
      await api<Activity>("/activities", {
        method: "POST",
        body: JSON.stringify({
          kind,
          subject: subject.trim() || (kind === "note" ? "Note" : ""),
          description: description.trim(),
          leadId: leadId || null,
          dealId: dealId || null,
          contactId: resolvedContactId,
          outcome: (cfg.hasOutcome && outcome) ? outcome : null,
          durationSeconds: (cfg.hasDuration && duration) ? parseInt(duration, 10) * 60 : null,
          dueAt: (cfg.hasDueDate && dueAt) ? dueAt : null,
        }),
      });
      toast.success("Activity logged");
      setSubject("");
      setDescription("");
      setOutcome("");
      setDuration("");
      setDueAt("");
      setPickedContactId("");
      setContactSearch("");
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <cfg.icon className={cn("size-5", cfg.color)} />
            Log {cfg.label}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Kind selector — colored pills */}
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => (
              <button
                key={k.key}
                onClick={() => switchKind(k.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                  kind === k.key
                    ? cn(k.activeBg, k.activeBorder, k.color, "shadow-sm")
                    : "border-border bg-surface text-muted-foreground hover:bg-surface-2",
                )}
              >
                <k.icon className="size-3" />
                {k.label}
              </button>
            ))}
          </div>

          {/* Customer picker */}
          {needsContactPicker && (
            <div>
              <Label className="text-xs">Customer</Label>
              {pickedContactId ? (
                <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
                  <span className="flex-1">
                    {contactOptions.find((c) => c.contactId === pickedContactId)?.name || `Customer #${pickedContactId}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPickedContactId("")}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={contactSearch}
                      onChange={(e) => setContactSearch(e.target.value)}
                      placeholder="Search customers…"
                      className="pl-8"
                    />
                  </div>
                  {contactOptions.length > 0 && (
                    <div className="max-h-36 overflow-auto rounded-lg border border-border bg-surface">
                      {contactOptions.map((c) => (
                        <button
                          key={c.contactId}
                          type="button"
                          onClick={() => setPickedContactId(c.contactId)}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-surface-2"
                        >
                          <span className="font-medium">{c.name || c.phone || c.email || `#${c.contactId}`}</span>
                          {c.phone && <span className="text-muted-foreground">{c.phone}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {contacts.loading && (
                    <p className="px-1 text-xs text-muted-foreground">Loading…</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Subject — optional label for notes */}
          <div>
            <Label className="text-xs">
              {kind === "note" ? "Title (optional)" : "Subject"}
            </Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={cfg.placeholder}
            />
          </div>

          {/* Description */}
          <div>
            <Label className="text-xs">
              {kind === "note" ? "Note" : "Description"}
            </Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={kind === "note" ? 4 : 2}
              placeholder={cfg.descPlaceholder}
            />
          </div>

          {/* Outcome — only for call & meeting — tap to select chips */}
          {cfg.hasOutcome && cfg.outcomes && (
            <div>
              <Label className="text-xs">Outcome</Label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {cfg.outcomes.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setOutcome(outcome === o.value ? "" : o.value)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-all",
                      outcome === o.value
                        ? cn(cfg.activeBg, cfg.activeBorder, cfg.color)
                        : "border-border bg-surface text-muted-foreground hover:bg-surface-2",
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Duration — only for call & meeting — quick-pick pills */}
          {cfg.hasDuration && (
            <div>
              <Label className="text-xs inline-flex items-center gap-1">
                <Clock className="size-3" /> Duration (min)
              </Label>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {DURATION_PRESETS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setDuration(duration === String(m) ? "" : String(m))}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-medium transition-all",
                      duration === String(m)
                        ? cn(cfg.activeBg, cfg.activeBorder, cfg.color)
                        : "border-border bg-surface text-muted-foreground hover:bg-surface-2",
                    )}
                  >
                    {m}m
                  </button>
                ))}
                <Input
                  type="number"
                  value={DURATION_PRESETS.includes(Number(duration)) ? "" : duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="Custom"
                  className="h-7 w-20 text-xs"
                />
              </div>
            </div>
          )}

          {/* Due date — only for tasks */}
          {cfg.hasDueDate && (
            <div>
              <Label className="text-xs inline-flex items-center gap-1">
                <CalendarClock className="size-3" /> Due date
              </Label>
              <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="mt-1" />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy} className="gap-1.5">
            <cfg.icon className="size-3.5" />
            {busy ? "Saving…" : `Log ${cfg.label}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
