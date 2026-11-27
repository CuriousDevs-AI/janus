import { useState } from "react";
import Link from "next/link";
import {
  Phone, Video, Mail, ClipboardList, StickyNote, Clock, ExternalLink, Send,
  Inbox, Package, Settings, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import type { Deal, DealEvent, Activity, RequirementStatus } from "@/lib/api/types";
import type { PipelineStage } from "@/lib/hooks/use-pipeline-config";
import { dealStageMeta } from "@/lib/status-meta";
import { cn, formatCurrencyINR, formatRelativeTime, formatDateTime } from "@/lib/utils";
import { DealForm } from "@/components/deals/deal-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetBody } from "@/components/ui/sheet";

const ACTIVITY_ICONS: Record<string, typeof Phone> = {
  call: Phone, meeting: Video, email: Mail, task: ClipboardList, note: StickyNote,
};
const ACTIVITY_COLORS: Record<string, string> = {
  call: "text-blue-500", meeting: "text-violet-500", email: "text-amber-500", task: "text-cyan-500", note: "text-muted-foreground",
};

const REQ_STATUS: Record<string, { label: string; icon: typeof Phone; bg: string; border: string; text: string }> = {
  received: { label: "Received", icon: Inbox, bg: "bg-slate-50 dark:bg-slate-950", border: "border-slate-200 dark:border-slate-700", text: "text-slate-600 dark:text-slate-400" },
  evaluating: { label: "Evaluating", icon: Clock, bg: "bg-amber-50 dark:bg-amber-950", border: "border-amber-200 dark:border-amber-700", text: "text-amber-600 dark:text-amber-400" },
  available: { label: "Available", icon: Package, bg: "bg-blue-50 dark:bg-blue-950", border: "border-blue-200 dark:border-blue-700", text: "text-blue-600 dark:text-blue-400" },
  customizing: { label: "Customizing", icon: Settings, bg: "bg-violet-50 dark:bg-violet-950", border: "border-violet-200 dark:border-violet-700", text: "text-violet-600 dark:text-violet-400" },
  fulfilled: { label: "Fulfilled", icon: CheckCircle2, bg: "bg-emerald-50 dark:bg-emerald-950", border: "border-emerald-200 dark:border-emerald-700", text: "text-emerald-600 dark:text-emerald-400" },
};

const todayIst = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const inDays = (days: number) => {
  const d = new Date(`${todayIst()}T12:00:00+05:30`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
};

function followUpLabel(day: string) {
  const days = Math.round((new Date(`${day}T12:00:00+05:30`).getTime() - new Date(`${todayIst()}T12:00:00+05:30`).getTime()) / 86_400_000);
  const date = new Date(`${day}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return days < 0 ? `${date} · ${-days}d overdue` : days === 0 ? `${date} · today` : days === 1 ? `${date} · tomorrow` : `${date} · in ${days}d`;
}

export function DealDetailSheet({ deal, open, onOpenChange, stages, writable, sessionUserId, sessionUserName, onMove, onSaved }: {
  deal: Deal; open: boolean; onOpenChange: (o: boolean) => void;
  stages: PipelineStage[]; writable: boolean;
  sessionUserId: string; sessionUserName: string;
  onMove: (stage: string) => void; onSaved: () => void;
}) {
  const [tab, setTab] = useState<"details" | "edit">("details");
  const [noteBody, setNoteBody] = useState("");
  const [noteDate, setNoteDate] = useState<string | null>(() => inDays(3));
  const [noteSaving, setNoteSaving] = useState(false);
  const activities = useApi<Activity[]>(open ? `/activities?deal_id=${deal.id}&limit=20` : null);
  const events = useApi<DealEvent[]>(open ? `/deals/${deal.id}/events?limit=20` : null);
  const ownerDisplay = deal.ownerId === sessionUserId ? sessionUserName : deal.ownerName || "Unassigned";
  const customerDisplay = deal.company || deal.customerName || "";
  const sm = dealStageMeta[deal.stage];
  const today = todayIst();
  const overdue = deal.expectedCloseAt && deal.expectedCloseAt < today && !["won", "lost"].includes(deal.stage);

  async function saveNote() {
    if (noteBody.trim().length < 2) return;
    setNoteSaving(true);
    try {
      await api<Activity>("/activities", {
        method: "POST",
        body: JSON.stringify({
          kind: "note",
          subject: "Follow-up note",
          description: noteBody.trim(),
          dealId: deal.id,
          contactId: deal.customerId,
          dueAt: noteDate ? `${noteDate}T09:00:00+05:30` : null,
          outcome: noteDate ? "follow_up" : null,
        }),
      });
      setNoteBody("");
      toast.success(noteDate ? `Follow-up saved — ${followUpLabel(noteDate)}` : "Note saved");
      activities.reload();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setNoteSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col w-full max-w-lg">
        <SheetHeader className="border-b border-border px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-base font-bold">{deal.name}</SheetTitle>
              <SheetDescription className="mt-0.5 text-xs">{customerDisplay || "No company"}</SheetDescription>
            </div>
            <Link href={`/deals/${deal.id}`} className="shrink-0 text-xs font-medium text-accent hover:underline flex items-center gap-1">
              <ExternalLink className="size-3" /> Full page
            </Link>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={sm?.tone ?? "neutral"}>{sm?.label ?? deal.stage}</Badge>
            <span className="text-sm font-bold tabular-nums">{formatCurrencyINR(Number(deal.amount))}</span>
            {deal.expectedCloseAt && (
              <span className={cn("text-xs", overdue ? "font-semibold text-warning" : "text-muted-foreground")}>
                Close: {deal.expectedCloseAt.slice(5)}{overdue ? " (overdue)" : ""}
              </span>
            )}
          </div>
          {/* Tab toggle */}
          <div className="mt-3 flex gap-1 border-b border-border">
            <button type="button" onClick={() => setTab("details")} className={cn("px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors", tab === "details" ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-foreground")}>Details</button>
            {writable && <button type="button" onClick={() => setTab("edit")} className={cn("px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors", tab === "edit" ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-foreground")}>Edit</button>}
          </div>
        </SheetHeader>

        <SheetBody className="flex-1 overflow-y-auto px-5 py-4">
          {tab === "details" && (
            <div className="flex flex-col gap-5">
              {/* Key details */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Owner</p>
                  <p className="mt-0.5 font-medium">{ownerDisplay}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Customer</p>
                  <p className="mt-0.5 font-medium">{deal.customerName || "—"}</p>
                </div>
                {deal.phone && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Phone</p>
                    <p className="mt-0.5 font-medium tabular-nums">{deal.phone}</p>
                  </div>
                )}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Created</p>
                  <p className="mt-0.5 font-medium">{formatDateTime(deal.createdAt)}</p>
                </div>
              </div>

              {/* Requirement */}
              {deal.requirement && (() => {
                const rs = REQ_STATUS[deal.requirementStatus] ?? REQ_STATUS.received;
                const StatusIcon = rs.icon;
                return (
                  <div className="rounded-lg border border-border bg-surface-2/30 px-3.5 py-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Requirement</p>
                      <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", rs.bg, rs.border, rs.text)}>
                        <StatusIcon className="size-2.5" />
                        {rs.label}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">{deal.requirement}</p>
                  </div>
                );
              })()}

              {/* Stage move */}
              {writable && !["won", "lost"].includes(deal.stage) && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Move stage</p>
                  <div className="flex flex-wrap gap-1.5">
                    {stages.filter((s) => s.key !== deal.stage).map((s) => (
                      <button key={s.key} type="button" onClick={() => onMove(s.key)} className="inline-flex items-center gap-1.5 border border-border px-2 py-1 text-[11px] font-medium transition-colors hover:bg-surface-2">
                        <span className={cn("size-2 rounded-full", s.color)} /> {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick follow-up note */}
              <div className="border border-border p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Quick follow-up</p>
                <Textarea
                  placeholder="Add a note or follow-up..."
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  className="min-h-[60px] text-xs"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex gap-1">
                    {([["Tomorrow", () => inDays(1)], ["3 days", () => inDays(3)], ["1 week", () => inDays(7)], ["No date", () => null]] as const).map(([label, fn]) => (
                      <button key={label} type="button" onClick={() => setNoteDate(fn())} className={cn("px-2 py-0.5 text-[10px] border transition-colors", noteDate === fn() ? "border-accent bg-accent/10 text-accent" : "border-border text-muted-foreground hover:text-foreground")}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <Button size="sm" onClick={saveNote} disabled={noteSaving || noteBody.trim().length < 2} className="h-7 text-xs gap-1">
                    <Send className="size-3" /> Save
                  </Button>
                </div>
              </div>

              {/* Recent activity */}
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Recent activity</p>
                <div className="flex flex-col gap-1.5">
                  {(activities.data ?? []).length === 0 && (events.data ?? []).length === 0 && (
                    <p className="text-xs text-muted-foreground py-4 text-center">No activity yet. Add a note above to get started.</p>
                  )}
                  {(activities.data ?? []).slice(0, 10).map((act) => {
                    const Icon = ACTIVITY_ICONS[act.kind] ?? ClipboardList;
                    const color = ACTIVITY_COLORS[act.kind] ?? "text-muted-foreground";
                    return (
                      <div key={act.id} className="flex items-start gap-2.5 border border-border border-l-[3px] border-l-accent bg-surface px-3 py-2">
                        <Icon className={cn("mt-0.5 size-3.5 shrink-0", color)} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="text-xs font-medium">{act.subject}</p>
                            <time className="shrink-0 text-[10px] text-muted-foreground">{formatRelativeTime(act.createdAt)}</time>
                          </div>
                          {act.description && <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground line-clamp-2">{act.description}</p>}
                        </div>
                      </div>
                    );
                  })}
                  {(events.data ?? []).slice(0, 5).map((ev) => (
                    <div key={ev.id} className="flex items-start gap-2.5 border border-border border-l-[3px] border-l-info bg-surface px-3 py-2">
                      <Clock className="mt-0.5 size-3.5 shrink-0 text-info" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-xs font-medium">{ev.action.replace(/_/g, " ")}</p>
                          <time className="shrink-0 text-[10px] text-muted-foreground">{formatRelativeTime(ev.createdAt)}</time>
                        </div>
                        {ev.userName && <p className="text-[10px] text-muted-foreground">by {ev.userName}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "edit" && (
            <DealForm key={`${deal.id}-${deal.version}-${deal.stage}`} deal={deal} onSaved={onSaved} />
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
