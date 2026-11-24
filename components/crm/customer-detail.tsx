"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Building2, Calendar, CalendarClock, ChevronRight,
  Clock, Mail, MessageCircle,
  Phone, Plus, ShieldOff, StickyNote,
  TrendingUp, Video, ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import type { Activity, ContactDetail, CustomerAccount } from "@/lib/api/types";
import { leadStageMeta } from "@/lib/status-meta";
import type { LeadStage } from "@/lib/types";
import { formatCurrencyINR, formatRelativeTime, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ActivityForm } from "./activity-form";
import { TagsManager } from "./tags-manager";
import { RecordDocuments } from "@/components/shared/record-documents";
import { todayIso } from "@/lib/today";

const ACTIVITY_ICON: Record<string, typeof Phone> = {
  call: Phone, meeting: Video, email: Mail, task: ClipboardList, note: StickyNote,
};

const STAGE_COLORS: Record<string, string> = {
  new: "bg-slate-400", contacted: "bg-blue-400", qualified: "bg-cyan-400",
  converted: "bg-violet-400", won: "bg-emerald-500", lost: "bg-red-400",
};

function computeHealth(stage: string, lastActivityAt: string | null, now: number) {
  const days = lastActivityAt ? Math.floor((now - new Date(lastActivityAt).getTime()) / 86400000) : 999;
  return stage === "won" ? "good" : stage === "lost" ? "cold" : days > 7 ? "cold" : days > 3 ? "warm" : "good";
}

function HealthDot({ health }: { health: string }) {
  const color = health === "good" ? "bg-emerald-500" : health === "warm" ? "bg-amber-400" : "bg-red-400";
  const label = health === "good" ? "Healthy" : health === "warm" ? "Needs attention" : "At risk";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("size-2 rounded-full", color)} />
      {label}
    </span>
  );
}

function TimeAgo({ at }: { at: string | null }) {
  if (!at) return <span className="text-xs text-muted-foreground">Never</span>;
  return <span className="text-xs text-muted-foreground">{formatRelativeTime(at)}</span>;
}

export function CustomerDetailPanel({
  contactId,
  onBack,
}: {
  contactId: string;
  onBack: () => void;
}) {
  const detail = useApi<ContactDetail>(`/contacts/${contactId}/detail`);
  const account = useApi<CustomerAccount>(`/contacts/${contactId}/account`);
  const [activityOpen, setActivityOpen] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [tab, setTab] = useState("overview");
  const [renderNow] = useState(Date.now);

  const c = detail.data?.contact;
  if (!c) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <span className="text-sm text-muted-foreground">Loading contact...</span>
        </div>
      </div>
    );
  }

  const leads = detail.data?.leads ?? [];
  const activeLeads = leads.filter((l) => !["converted", "lost"].includes(l.stage));
  const totalDealValue = Number(detail.data?.totalDealValue ?? 0);
  const openDealValue = Number(detail.data?.openDealValue ?? 0);
  const activities = detail.data?.activities ?? [];
  const leadNotes = detail.data?.leadNotes ?? [];
  const notes = detail.data?.notes ?? [];
  const name = c.name || c.phone || c.email || "Contact";
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const latestLead = leads[0];
  const lastActivityAt = latestLead?.createdAt ?? null;
  const health = latestLead ? computeHealth(latestLead.stage, lastActivityAt, renderNow) : null;

  async function addNote() {
    if (!noteBody.trim()) return;
    setSavingNote(true);
    try {
      await api(`/contacts/${contactId}/notes`, {
        method: "POST",
        body: JSON.stringify({ body: noteBody.trim() }),
      });
      setNoteBody("");
      detail.reload();
      toast.success("Note added");
    } catch (e) {
      toast.error(message(e));
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ── */}
      <div className="border-b border-border bg-surface">
        <div className="px-6 pt-4 pb-5">
          <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 mb-3 gap-1 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" /> All contacts
          </Button>
          <div className="flex items-start gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent/80 to-accent text-lg font-bold text-white shadow-sm">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-xl font-bold tracking-tight">{name}</h2>
                {health && <HealthDot health={health} />}
              </div>
              {c.company && (
                <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                  <Building2 className="size-3.5" /> {c.company}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                {c.phone && (
                  <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground">
                    <Phone className="size-3.5" /> {c.phone}
                  </a>
                )}
                {c.email && (
                  <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground">
                    <Mail className="size-3.5" /> {c.email}
                  </a>
                )}
                {c.doNotContact && <Badge variant="danger" className="text-[10px]"><ShieldOff className="size-3" /> DNC</Badge>}
                {c.whatsappOptIn && <Badge variant="success" className="text-[10px]"><MessageCircle className="size-3" /> WhatsApp</Badge>}
              </div>
              <div className="mt-2.5">
                <TagsManager entityType="contacts" entityId={contactId} tags={detail.data?.tags ?? []} onChanged={() => detail.reload()} />
              </div>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => setActivityOpen(true)}>
                <Plus className="size-3.5" /> Log activity
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-border bg-surface px-6">
          <TabsList className="h-auto gap-0 rounded-none border-0 bg-transparent p-0">
            {[
              { value: "overview", label: "Overview" },
              { value: "leads", label: `Leads (${leads.length})` },
              { value: "activities", label: `Activities (${activities.length + leadNotes.length})` },
              { value: "notes", label: `Notes (${notes.length})` },
              { value: "docs", label: "Documents" },
              { value: "account", label: "Account" },
            ].map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="relative rounded-none border-b-2 border-transparent px-4 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="flex-1 overflow-auto bg-surface-2/30">
          {/* ── Overview ── */}
          <TabsContent value="overview" className="mt-0 p-6">
            <div className="grid gap-4 lg:grid-cols-3">
              {/* Left: Stats + Pipeline */}
              <div className="space-y-4 lg:col-span-2">
                {/* KPI strip */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {([
                    ["Total leads", String(leads.length), null, "text-foreground"],
                    ["Active", String(activeLeads.length), null, "text-accent"],
                    ["Deal value", formatCurrencyINR(totalDealValue), null, "text-foreground"],
                    ["Open pipeline", formatCurrencyINR(openDealValue), null, "text-emerald-600 dark:text-emerald-400"],
                  ] as const).map(([label, value, , color]) => (
                    <div key={label} className="rounded-xl border border-border bg-surface px-4 py-3">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
                      <div className={cn("mt-1 text-xl font-bold tabular-nums", color)}>{value}</div>
                    </div>
                  ))}
                </div>

                {/* Lead pipeline cards */}
                <div>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Lead pipeline</h3>
                  {leads.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                      No leads yet — capture one from a lead source or add manually.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {leads.map((lead) => {
                        const sm = leadStageMeta[lead.stage as LeadStage];
                        return (
                          <Link
                            key={lead.id}
                            href={`/leads/${lead.id}`}
                            className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5 transition-all hover:border-accent/40 hover:shadow-sm"
                          >
                            <span className={cn("size-2.5 shrink-0 rounded-full", STAGE_COLORS[lead.stage] ?? "bg-muted-foreground")} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <Badge variant={sm?.tone ?? "neutral"} className="text-[10px]">{sm?.label ?? lead.stage}</Badge>
                                <span className="text-xs text-muted-foreground capitalize">{lead.source.replace("_", " ")}</span>
                                <span className="ml-auto text-xs text-muted-foreground">{formatRelativeTime(lead.createdAt)}</span>
                              </div>
                              {lead.requirement && <p className="mt-1 truncate text-xs text-muted-foreground">{lead.requirement}</p>}
                              {lead.dealName && (
                                <div className="mt-1.5 flex items-center gap-2">
                                  <TrendingUp className="size-3 text-accent" />
                                  <span className="text-xs font-medium">{lead.dealName}</span>
                                  {lead.dealAmount && <span className="text-xs font-semibold tabular-nums text-foreground">{formatCurrencyINR(Number(lead.dealAmount))}</span>}
                                </div>
                              )}
                            </div>
                            <ChevronRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Recent activity + Account */}
              <div className="space-y-4">
                {/* Recent activity */}
                <div className="rounded-xl border border-border bg-surface">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Recent activity</h3>
                    <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[10px]" onClick={() => setTab("activities")}>
                      View all
                    </Button>
                  </div>
                  <div className="px-4 py-2">
                    {activities.length === 0 && leadNotes.length === 0 && notes.length === 0 ? (
                      <div className="py-6 text-center">
                        <p className="text-xs text-muted-foreground">No activity yet</p>
                        <Button variant="outline" size="sm" className="mt-2 gap-1 text-xs" onClick={() => setActivityOpen(true)}>
                          <Plus className="size-3" /> Log first activity
                        </Button>
                      </div>
                    ) : (
                      <div className="divide-y divide-border">
                        {[
                          ...activities.slice(0, 3).map((a) => ({ type: "activity" as const, item: a, at: a.createdAt })),
                          ...leadNotes.slice(0, 3).map((ln) => ({ type: "lead_note" as const, item: ln, at: ln.createdAt })),
                          ...notes.slice(0, 2).map((n) => ({ type: "note" as const, item: n, at: n.createdAt })),
                        ]
                          .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
                          .slice(0, 4)
                          .map((entry) => {
                            if (entry.type === "activity") {
                              const a = entry.item as Activity;
                              const Icon = ACTIVITY_ICON[a.kind] ?? ClipboardList;
                              return (
                                <div key={`a-${a.id}`} className="flex items-start gap-3 py-3">
                                  <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                                    <Icon className="size-3.5 text-accent" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-medium">{a.subject}</p>
                                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                                      <span className="capitalize">{a.kind}</span>
                                      <span>·</span>
                                      <TimeAgo at={a.createdAt} />
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                            if (entry.type === "lead_note") {
                              const ln = entry.item as { id: string; leadId: string; body: string; author: string | null; nextFollowUpOn: string | null; createdAt: string };
                              return (
                                <div key={`ln-${ln.id}`} className="flex items-start gap-3 py-3">
                                  <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
                                    <CalendarClock className="size-3.5 text-violet-500" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="line-clamp-2 text-xs">{ln.body}</p>
                                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                                      <span>Follow-up</span>
                                      {ln.author && <><span>·</span><span>{ln.author}</span></>}
                                      <span>·</span>
                                      <TimeAgo at={ln.createdAt} />
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                            const n = entry.item as { id: string; body: string; author: string | null; createdAt: string };
                            return (
                              <div key={`n-${n.id}`} className="flex items-start gap-3 py-3">
                                <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
                                  <StickyNote className="size-3.5 text-blue-500" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="line-clamp-2 text-xs">{n.body}</p>
                                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                                    {n.author && <span>{n.author}</span>}
                                    <span>·</span>
                                    <TimeAgo at={n.createdAt} />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Account snapshot */}
                {account.data && account.data.full && (
                  <div className="rounded-xl border border-border bg-surface">
                    <div className="flex items-center justify-between border-b border-border px-4 py-3">
                      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Account</h3>
                      <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[10px]" onClick={() => setTab("account")}>
                        Details
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-px bg-border">
                      {([
                        ["Invoiced", account.data.invoiced, "text-foreground"],
                        ["Paid", account.data.paid, "text-emerald-600 dark:text-emerald-400"],
                        ["Due", account.data.due, "text-foreground"],
                        ["Overdue", account.data.overdue, "text-danger"],
                      ] as const).map(([label, value, color]) => (
                        <div key={label} className="bg-surface px-4 py-3">
                          <span className="text-[10px] text-muted-foreground">{label}</span>
                          <div className={cn("text-sm font-semibold tabular-nums", value && Number(value) > 0 ? color : "text-muted-foreground")}>
                            {value && Number(value) > 0 ? formatCurrencyINR(Number(value)) : "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                    {account.data.overdueInvoices > 0 && (
                      <div className="border-t border-border px-4 py-2">
                        <span className="text-[10px] text-danger">{account.data.overdueInvoices} overdue invoice{account.data.overdueInvoices > 1 ? "s" : ""} · oldest {account.data.oldestOverdueDays}d ago</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Quick add note */}
                <div className="rounded-xl border border-border bg-surface p-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Quick note</h3>
                  <Textarea
                    value={noteBody}
                    onChange={(e) => setNoteBody(e.target.value)}
                    placeholder="Type a note..."
                    rows={2}
                    className="mb-2 text-sm"
                  />
                  <Button size="sm" onClick={addNote} disabled={savingNote || !noteBody.trim()} className="w-full">
                    {savingNote ? "Saving..." : "Add note"}
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── Leads ── */}
          <TabsContent value="leads" className="mt-0 p-6">
            {leads.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border py-12 text-center">
                <TrendingUp className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">No leads for this contact</p>
              </div>
            ) : (
              <div className="space-y-2">
                {leads.map((lead) => {
                  const sm = leadStageMeta[lead.stage as LeadStage];
                  return (
                    <Link
                      key={lead.id}
                      href={`/leads/${lead.id}`}
                      className="group flex items-center gap-4 rounded-xl border border-border bg-surface p-4 transition-all hover:border-accent/40 hover:shadow-sm"
                    >
                      <span className={cn("size-3 shrink-0 rounded-full", STAGE_COLORS[lead.stage] ?? "bg-muted-foreground")} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={sm?.tone ?? "neutral"} className="text-[10px]">{sm?.label ?? lead.stage}</Badge>
                          <span className="text-xs text-muted-foreground capitalize">{lead.source.replace("_", " ")}</span>
                        </div>
                        {lead.requirement && <p className="mt-1 text-sm text-muted-foreground">{lead.requirement}</p>}
                      </div>
                      <div className="shrink-0 text-right">
                        {lead.dealName ? (
                          <div>
                            <span className="text-xs font-medium">{lead.dealName}</span>
                            {lead.dealAmount && <div className="text-sm font-bold tabular-nums">{formatCurrencyINR(Number(lead.dealAmount))}</div>}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">No deal</span>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <TimeAgo at={lead.createdAt} />
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── Activities ── */}
          <TabsContent value="activities" className="mt-0 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Activity timeline</h3>
              <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => setActivityOpen(true)}>
                <Plus className="size-3.5" /> Log activity
              </Button>
            </div>
            {(() => {
              const timeline = [
                ...activities.map((a) => ({ type: "activity" as const, item: a, at: a.createdAt })),
                ...leadNotes.map((ln) => ({ type: "lead_note" as const, item: ln, at: ln.createdAt })),
              ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

              if (timeline.length === 0) {
                return (
                  <div className="rounded-xl border border-dashed border-border py-12 text-center">
                    <Calendar className="mx-auto size-8 text-muted-foreground" />
                    <p className="mt-2 text-sm text-muted-foreground">No activities logged</p>
                    <p className="mt-1 text-xs text-muted-foreground">Log a call, meeting, email or task to keep track.</p>
                    <Button variant="outline" size="sm" className="mt-3 gap-1" onClick={() => setActivityOpen(true)}>
                      <Plus className="size-3.5" /> Log activity
                    </Button>
                  </div>
                );
              }

              return (
                <div className="relative ml-3 border-l-2 border-border pl-6">
                  {timeline.map((entry, i) => {
                    if (entry.type === "activity") {
                      const a = entry.item as Activity;
                      const Icon = ACTIVITY_ICON[a.kind] ?? ClipboardList;
                      return (
                        <div key={`a-${a.id}`} className={cn("relative pb-6", i === timeline.length - 1 && "pb-0")}>
                          <div className="absolute -left-[31px] top-0 flex size-7 items-center justify-center rounded-full border-2 border-border bg-surface">
                            <Icon className="size-3.5 text-accent" />
                          </div>
                          <div className="rounded-xl border border-border bg-surface p-3.5 transition-colors hover:bg-surface-2/50">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="text-sm font-medium">{a.subject}</span>
                                <span className="ml-2 text-xs text-muted-foreground capitalize">{a.kind}</span>
                              </div>
                              <TimeAgo at={a.createdAt} />
                            </div>
                            {a.description && <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{a.description}</p>}
                            <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
                              {a.ownerName && <span>{a.ownerName}</span>}
                              {a.outcome && <Badge variant="outline" className="text-[10px]">{a.outcome.replace("_", " ")}</Badge>}
                              {a.dueAt && <span className="inline-flex items-center gap-1"><Clock className="size-2.5" /> Due {formatRelativeTime(a.dueAt)}</span>}
                            </div>
                          </div>
                        </div>
                      );
                    }
                    const ln = entry.item as { id: string; leadId: string; body: string; author: string | null; nextFollowUpOn: string | null; createdAt: string };
                    return (
                      <div key={`ln-${ln.id}`} className={cn("relative pb-6", i === timeline.length - 1 && "pb-0")}>
                        <div className="absolute -left-[31px] top-0 flex size-7 items-center justify-center rounded-full border-2 border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-950">
                          <CalendarClock className="size-3.5 text-violet-500" />
                        </div>
                        <div className="rounded-xl border border-border bg-surface p-3.5 transition-colors hover:bg-surface-2/50">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="text-sm font-medium">Follow-up note</span>
                              <span className="ml-2 text-xs text-muted-foreground">Lead #{ln.leadId}</span>
                            </div>
                            <TimeAgo at={ln.createdAt} />
                          </div>
                          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{ln.body}</p>
                          <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
                            {ln.author && <span>{ln.author}</span>}
                            {ln.nextFollowUpOn && (
                              <span className="inline-flex items-center gap-1">
                                <CalendarClock className="size-2.5" /> Next: {new Date(`${ln.nextFollowUpOn}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </TabsContent>

          {/* ── Notes ── */}
          <TabsContent value="notes" className="mt-0 p-6">
            <div className="mb-4 flex gap-2">
              <Textarea
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                placeholder="Write a note about this contact..."
                rows={2}
                className="flex-1 text-sm"
              />
              <Button size="sm" onClick={addNote} disabled={savingNote || !noteBody.trim()} className="self-end">
                {savingNote ? "Saving..." : "Add note"}
              </Button>
            </div>
            {notes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border py-12 text-center">
                <StickyNote className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">No notes yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {notes.map((note) => (
                  <div key={note.id} className="rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-2/50">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{note.body}</p>
                    <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                      {note.author && <span className="font-medium text-foreground">{note.author}</span>}
                      <span>·</span>
                      <TimeAgo at={note.createdAt} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Documents ── */}
          <TabsContent value="docs" className="mt-0 p-6">
            <RecordDocuments recordKind="customer" recordId={contactId} addedBy={c.name || "CRM"} today={todayIso()} />
          </TabsContent>

          {/* ── Account ── */}
          <TabsContent value="account" className="mt-0 p-6">
            {account.data ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {([
                    ["Invoices", String(account.data.invoices), "Total sent", "bg-accent"],
                    ["Invoiced", account.data.invoiced ? formatCurrencyINR(Number(account.data.invoiced)) : "—", "Total billed", "bg-blue-500"],
                    ["Paid", account.data.paid ? formatCurrencyINR(Number(account.data.paid)) : "—", "Received", "bg-emerald-500"],
                    ["Due", account.data.due ? formatCurrencyINR(Number(account.data.due)) : "—", "Outstanding", "bg-amber-500"],
                  ] as const).map(([label, value, desc, dot]) => (
                    <div key={label} className="rounded-xl border border-border bg-surface px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <span className={cn("size-1.5 rounded-full", dot)} />
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
                      </div>
                      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
                      <span className="text-[10px] text-muted-foreground">{desc}</span>
                    </div>
                  ))}
                </div>
                {account.data.overdueInvoices > 0 && (
                  <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-danger" />
                      <span className="text-sm font-medium text-danger">
                        {account.data.overdueInvoices} overdue invoice{account.data.overdueInvoices > 1 ? "s" : ""}
                      </span>
                      <span className="text-xs text-muted-foreground">· oldest {account.data.oldestOverdueDays} days ago</span>
                    </div>
                    {account.data.overdue && Number(account.data.overdue) > 0 && (
                      <div className="mt-1 text-lg font-bold tabular-nums text-danger">{formatCurrencyINR(Number(account.data.overdue))} overdue</div>
                    )}
                  </div>
                )}
                {account.data.lastInvoiceOn && (
                  <p className="text-xs text-muted-foreground">Last invoice: {formatRelativeTime(account.data.lastInvoiceOn)}</p>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-2">
                  <div className="size-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                  <span className="text-xs text-muted-foreground">Loading account data...</span>
                </div>
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>

      <ActivityForm
        open={activityOpen}
        onOpenChange={setActivityOpen}
        contactId={contactId}
        onSaved={() => detail.reload()}
      />
    </div>
  );
}
