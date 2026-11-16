"use client";

import * as React from "react";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, message } from "@/lib/api/client";

export type LeadNote = { id: string; body: string; author: string | null; nextFollowUpOn: string | null; createdAt: string };

const todayIst = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const inDays = (days: number) => { const date = new Date(`${todayIst()}T12:00:00+05:30`); date.setDate(date.getDate() + days); return date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); };
const choices: [string, () => string | null][] = [["Tomorrow", () => inDays(1)], ["In 3 days", () => inDays(3)], ["Next week", () => inDays(7)], ["No date", () => null]];

/** A follow-up date that is tomorrow, today, or has passed. */
export const isDue = (day: string | null | undefined) => Boolean(day && day <= inDays(1));

/** "26 Nov" for a follow-up date, with how far it is from today. */
export function followUpWords(day: string) {
  const days = Math.round((new Date(`${day}T12:00:00+05:30`).getTime() - new Date(`${todayIst()}T12:00:00+05:30`).getTime()) / 86_400_000);
  const date = new Date(`${day}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return days < 0 ? `${date} · ${-days} day${days === -1 ? "" : "s"} overdue` : days === 0 ? `${date} · today` : days === 1 ? `${date} · tomorrow` : `${date} · in ${days} days`;
}

/**
 * Writing down a call or meeting: what happened, and when to follow up next. It counts as activity on
 * the lead, so a lead someone has agreed to call next week is not flagged as gone quiet.
 */
export function FollowUpBox({ leadId, onSaved }: { leadId: string; onSaved: () => void }) {
  const [body, setBody] = React.useState("");
  const [next, setNext] = React.useState<string | null>(() => inDays(3));
  const [saving, setSaving] = React.useState(false);
  async function save() {
    setSaving(true);
    try {
      await api(`/leads/${encodeURIComponent(leadId)}/notes`, { method: "POST", body: JSON.stringify({ body: body.trim(), nextFollowUpOn: next }) });
      setBody("");
      toast.success(next ? `Follow-up saved. Next: ${followUpWords(next)}.` : "Follow-up saved.");
      onSaved();
    } catch (error) { toast.error(message(error)); } finally { setSaving(false); }
  }
  return <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
    <div className="flex items-center gap-2"><CalendarClock className="size-4 text-accent" /><h2 className="text-base font-semibold">Log a follow-up</h2></div>
    <p className="mt-1 text-xs text-muted-foreground">What was said on the call or meeting, and when to follow up next.</p>
    <Textarea aria-label="What happened" value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} className="mt-3 min-h-20 text-sm" placeholder="Spoke to the buyer. They want a quote for 500 cartons by Friday." />
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Next follow-up</span>
      {choices.map(([label, pick]) => { const value = pick(); return <button key={label} type="button" onClick={() => setNext(value)} className={`rounded-full border px-2.5 py-1 text-xs ${next === value ? "border-accent bg-accent-muted text-accent" : "border-border text-muted-foreground hover:text-foreground"}`}>{label}</button>; })}
      <Input type="date" aria-label="Next follow-up date" value={next ?? ""} min={todayIst()} onChange={(event) => setNext(event.target.value || null)} className="h-8 w-[150px] text-xs" />
    </div>
    <div className="mt-3 flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{next ? `Next: ${followUpWords(next)}` : "No follow-up date"}</span>
      <Button size="sm" disabled={saving || body.trim().length < 2} onClick={() => void save()}>{saving ? "Saving…" : "Save follow-up"}</Button>
    </div>
  </section>;
}
