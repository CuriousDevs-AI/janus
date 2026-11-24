"use client";

import { lostWords } from "@/lib/lost-reasons";
import { ContactConversation } from "@/components/chat/contact-conversation";
import { CustomerCalls } from "@/components/calls/customer-call";
import { use, useState } from "react";
import { can } from "@/lib/permissions";
import Link from "next/link";
import { toast } from "sonner";
import { useApi } from "@/lib/api/use-api";
import { api, message } from "@/lib/api/client";
import type { Deal, DealEvent, Activity } from "@/lib/api/types";
import { RecordDocuments } from "@/components/shared/record-documents";
import { todayIso } from "@/lib/today";
import { useSession } from "@/components/auth/session-provider";
import { WhatsAppButton } from "@/components/inbox/whatsapp-button";
import { DealForm } from "@/components/deals/deal-form";
import { ActivityForm } from "@/components/crm/activity-form";
import { dealStageMeta } from "@/lib/status-meta";
import { formatCurrencyINR, formatDateTime, formatRelativeTime, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { usePipelineConfig, barColor } from "@/lib/hooks/use-pipeline-config";
import {
  ArrowLeft, RefreshCw, Phone, Video, Mail, ClipboardList, StickyNote,
  CalendarClock, CheckCircle2, Clock, Plus, ExternalLink, Building2,
  User, IndianRupee,
} from "lucide-react";

const todayIst = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const inDays = (days: number) => {
  const d = new Date(`${todayIst()}T12:00:00+05:30`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
};

const FOLLOW_UP_CHOICES: [string, () => string | null][] = [
  ["Tomorrow", () => inDays(1)],
  ["In 3 days", () => inDays(3)],
  ["Next week", () => inDays(7)],
  ["No date", () => null],
];

const ACTIVITY_ICONS: Record<string, typeof Phone> = {
  call: Phone,
  meeting: Video,
  email: Mail,
  task: ClipboardList,
  note: StickyNote,
};

const ACTIVITY_COLORS: Record<string, string> = {
  call: "bg-blue-500",
  meeting: "bg-violet-500",
  email: "bg-amber-500",
  task: "bg-cyan-500",
  note: "bg-slate-400",
};

function followUpWords(day: string) {
  const days = Math.round(
    (new Date(`${day}T12:00:00+05:30`).getTime() - new Date(`${todayIst()}T12:00:00+05:30`).getTime()) / 86_400_000,
  );
  const date = new Date(`${day}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return days < 0
    ? `${date} · ${-days}d overdue`
    : days === 0
      ? `${date} · today`
      : days === 1
        ? `${date} · tomorrow`
        : `${date} · in ${days}d`;
}

export default function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const session = useSession();
  const canWrite = can(session, "leads:write");

  const result = useApi<Deal>(`/deals/${encodeURIComponent(id)}`);
  const spaces = useApi<Array<{ type: string; status: string }>>("/workspaces");
  const financeOn = Boolean(spaces.data?.some((w) => w.type === "finance_accounting" && w.status === "active"));

  const pipeline = usePipelineConfig(true);
  const { stages } = pipeline;

  const [eventCursors, setEventCursors] = useState<string[]>([]);
  const history = useApi<DealEvent[]>(
    result.data ? `/deals/${id}/events?limit=50${eventCursors.length ? `&before_id=${eventCursors.at(-1)}` : ""}` : null,
  );

  const activities = useApi<Activity[]>(result.data ? `/activities?deal_id=${id}&limit=50` : null);

  const deal = result.data;
  const [refreshing, setRefreshing] = useState(false);
  const [actOpen, setActOpen] = useState(false);
  const [tab, setTab] = useState<"overview" | "history" | "documents">("overview");

  // Follow-up state
  const [followBody, setFollowBody] = useState("");
  const [followDate, setFollowDate] = useState<string | null>(() => inDays(3));
  const [followSaving, setFollowSaving] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      await Promise.all([result.reload(), history.reload(), activities.reload()]);
    } finally {
      setTimeout(() => setRefreshing(false), 400);
    }
  }

  async function saveFollowUp() {
    if (followBody.trim().length < 2) return;
    setFollowSaving(true);
    try {
      await api<Activity>("/activities", {
        method: "POST",
        body: JSON.stringify({
          kind: "note",
          subject: "Follow-up note",
          description: followBody.trim(),
          dealId: id,
          contactId: deal!.customerId,
          dueAt: followDate ? `${followDate}T09:00:00+05:30` : null,
          outcome: followDate ? "follow_up" : null,
        }),
      });
      setFollowBody("");
      toast.success(followDate ? `Follow-up saved — next: ${followUpWords(followDate)}` : "Note saved");
      activities.reload();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setFollowSaving(false);
    }
  }

  const pipelineStages = stages.filter((s) => s.key !== "lost");
  const currentIdx = pipelineStages.findIndex((s) => s.key === deal?.stage);
  const isLost = deal?.stage === "lost";
  const isWon = deal?.stage === "won";

  const nextActivity = activities.data?.find((a) => a.dueAt && !a.completedAt);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <Link
          href="/deals"
          className="group flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
          Deals
        </Link>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void refresh()}
          disabled={refreshing}
          className="gap-1.5"
        >
          <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {result.error && <p role="alert" className="text-sm text-danger">{result.error}</p>}
      {!deal && !result.error && <p role="status">Loading deal…</p>}

      {deal && (
        <>
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold">{deal.name}</h1>
                <Badge variant={dealStageMeta[deal.stage].tone}>
                  {dealStageMeta[deal.stage].label}
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <Link href={`/customers/${deal.customerId}`} className="flex items-center gap-1 hover:text-accent">
                  <Building2 className="size-3.5" />
                  {deal.customerName}
                  {deal.company && ` · ${deal.company}`}
                </Link>
                {deal.ownerName && (
                  <span className="flex items-center gap-1">
                    <User className="size-3.5" />
                    {deal.ownerName}
                  </span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-6">
                <div>
                  <span className="text-xs text-muted-foreground">Value</span>
                  <p className="flex items-center gap-1 text-xl font-semibold">
                    <IndianRupee className="size-4" />
                    {formatCurrencyINR(Number(deal.amount), false).replace("₹", "").trim()}
                  </p>
                </div>
                {deal.expectedCloseAt && (
                  <div>
                    <span className="text-xs text-muted-foreground">Expected close</span>
                    <p className="text-sm font-medium">
                      {new Date(`${deal.expectedCloseAt}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                )}
                {nextActivity && (
                  <div>
                    <span className="text-xs text-muted-foreground">Next step</span>
                    <p className="flex items-center gap-1 text-sm font-medium text-accent">
                      <CalendarClock className="size-3.5" />
                      {nextActivity.subject}
                      {nextActivity.dueAt && ` · ${new Date(nextActivity.dueAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}
                    </p>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {canWrite && (
                <Button size="sm" variant="secondary" onClick={() => setActOpen(true)} className="gap-1.5">
                  <Plus className="size-3.5" /> Log activity
                </Button>
              )}
              <Button size="sm" variant="secondary" asChild>
                <Link href={`/leads/${deal.leadId}`} className="gap-1.5">
                  <ExternalLink className="size-3.5" /> Open lead
                </Link>
              </Button>
              {deal.phone && <WhatsAppButton contactId={deal.customerId} />}
              {isWon && financeOn && can(session, "billing:manage") && (
                <Button size="sm" asChild>
                  <Link href={`/workspace/finance-accounting?view=invoices&workspace=finance-accounting&deal=${deal.id}`}>
                    Raise invoice
                  </Link>
                </Button>
              )}
            </div>
          </div>

          {/* Pipeline stage bar */}
          {!isLost && (
            <div className="flex gap-1">
              {pipelineStages.map((s, i) => {
                const reached = i <= currentIdx;
                const isCurrent = i === currentIdx;
                return (
                  <div key={s.key} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className={cn(
                        "h-2 w-full rounded-full transition-all",
                        reached ? barColor(s.color) : "bg-surface-3",
                        isCurrent && "ring-2 ring-accent/30",
                      )}
                    />
                    <span className={cn("text-[10px]", isCurrent ? "font-semibold text-foreground" : "text-muted-foreground")}>
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {isLost && deal.lostCategory && (
            <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3">
              <p className="text-sm font-medium text-danger">Deal lost</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {lostWords(deal.lostCategory, deal.lostReason)}
              </p>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 border-b border-border">
            {(["overview", "history", "documents"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "border-b-2 px-4 py-2 text-sm font-medium transition-colors",
                  tab === t
                    ? "border-accent text-accent"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t === "overview" ? "Overview" : t === "history" ? "History" : "Documents"}
              </button>
            ))}
          </div>

          {/* Overview tab */}
          {tab === "overview" && (
            <div className="grid gap-5 md:grid-cols-2">
              {/* Left: Deal form + Follow-up */}
              <div className="flex flex-col gap-5">
                <section className="rounded-lg border border-border bg-surface p-4">
                  <h2 className="mb-4 text-sm font-semibold">Deal details</h2>
                  {canWrite ? (
                    <DealForm
                      key={`${deal.id}-${deal.version}`}
                      deal={deal}
                      onSaved={() => {
                        refresh();
                        setEventCursors([]);
                        toast.success("Deal saved");
                      }}
                    />
                  ) : (
                    <dl className="space-y-3 text-sm">
                      <div>
                        <dt className="text-muted-foreground">Expected close</dt>
                        <dd>{deal.expectedCloseAt || "Not set"}</dd>
                      </div>
                      {deal.stage === "lost" && (deal.lostCategory || deal.lostReason) && (
                        <div>
                          <dt className="text-muted-foreground">Why it was lost</dt>
                          <dd>{lostWords(deal.lostCategory, deal.lostReason)}</dd>
                        </div>
                      )}
                    </dl>
                  )}
                  <p className="mt-4 text-xs text-muted-foreground">
                    Updated {formatDateTime(deal.updatedAt)}
                  </p>
                </section>

                {/* Follow-up box */}
                {canWrite && deal.stage !== "won" && deal.stage !== "lost" && (
                  <section className="rounded-lg border border-border bg-surface p-4">
                    <div className="flex items-center gap-2">
                      <CalendarClock className="size-4 text-accent" />
                      <h2 className="text-sm font-semibold">Log a follow-up</h2>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      What happened on the call or meeting, and when to follow up next.
                    </p>
                    <Textarea
                      value={followBody}
                      onChange={(e) => setFollowBody(e.target.value)}
                      maxLength={2000}
                      className="mt-3 min-h-20 text-sm"
                      placeholder="Spoke to the buyer. They want a quote for 500 cartons by Friday."
                    />
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">Next follow-up</span>
                      {FOLLOW_UP_CHOICES.map(([label, pick]) => {
                        const val = pick();
                        return (
                          <button
                            key={label}
                            type="button"
                            onClick={() => setFollowDate(val)}
                            className={cn(
                              "rounded-full border px-2.5 py-1 text-xs",
                              followDate === val
                                ? "border-accent bg-accent-muted text-accent"
                                : "border-border text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {label}
                          </button>
                        );
                      })}
                      <Input
                        type="date"
                        value={followDate ?? ""}
                        min={todayIst()}
                        onChange={(e) => setFollowDate(e.target.value || null)}
                        className="h-8 w-[150px] text-xs"
                      />
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        {followDate ? `Next: ${followUpWords(followDate)}` : "No follow-up date"}
                      </span>
                      <Button
                        size="sm"
                        disabled={followSaving || followBody.trim().length < 2}
                        onClick={() => void saveFollowUp()}
                      >
                        {followSaving ? "Saving…" : "Save follow-up"}
                      </Button>
                    </div>
                  </section>
                )}
              </div>

              {/* Right: Activities + Recent history */}
              <div className="flex flex-col gap-5">
                {/* Activities */}
                <section className="rounded-lg border border-border bg-surface p-4">
                  <div className="mb-4">
                    <h2 className="text-sm font-semibold">Activities</h2>
                  </div>
                  {activities.error && <p className="text-sm text-danger">{activities.error}</p>}
                  {!activities.data && !activities.error && <p className="text-sm text-muted-foreground">Loading…</p>}
                  {activities.data?.length === 0 && (
                    <div className="py-6 text-center">
                      <ClipboardList className="mx-auto size-8 text-muted-foreground/40" />
                      <p className="mt-2 text-sm text-muted-foreground">No activities yet</p>
                      {canWrite && (
                        <Button size="sm" variant="secondary" onClick={() => setActOpen(true)} className="mt-3 gap-1.5">
                          <Plus className="size-3.5" /> Log first activity
                        </Button>
                      )}
                    </div>
                  )}
                  {activities.data && activities.data.length > 0 && (
                    <ol className="space-y-3">
                      {activities.data.slice(0, 10).map((act) => {
                        const Icon = ACTIVITY_ICONS[act.kind] ?? ClipboardList;
                        const color = ACTIVITY_COLORS[act.kind] ?? "bg-slate-400";
                        return (
                          <li key={act.id} className="flex gap-3">
                            <div className="flex flex-col items-center">
                              <div className={cn("flex size-7 items-center justify-center rounded-full text-white", color)}>
                                <Icon className="size-3.5" />
                              </div>
                              <div className="mt-1 flex-1 border-l border-border" />
                            </div>
                            <div className="min-w-0 flex-1 pb-3">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{act.subject}</span>
                                {act.completedAt && <CheckCircle2 className="size-3.5 text-emerald-500" />}
                                {act.dueAt && !act.completedAt && (
                                  <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                                    <Clock className="size-3" />
                                    {new Date(act.dueAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                                  </span>
                                )}
                              </div>
                              {act.description && (
                                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{act.description}</p>
                              )}
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                {formatRelativeTime(act.createdAt)}
                                {act.ownerName && ` · ${act.ownerName}`}
                                {act.outcome && ` · ${act.outcome.replace(/_/g, " ")}`}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </section>

                {/* Recent deal history */}
                <section className="rounded-lg border border-border bg-surface p-4">
                  <h2 className="mb-4 text-sm font-semibold">Recent changes</h2>
                  {history.error && <p className="text-sm text-danger">{history.error}</p>}
                  {!history.data && !history.error && <p className="text-sm text-muted-foreground">Loading…</p>}
                  <ol className="space-y-3">
                    {history.data?.slice(0, 5).map((event) => (
                      <li key={event.id} className="border-l-2 border-border pl-3">
                        <p className="text-sm font-medium">
                          {event.action === "deal.created"
                            ? "Deal created"
                            : event.details.from_stage !== event.details.to_stage
                              ? `${stageWord(event.details.from_stage)} → ${stageWord(event.details.to_stage)}`
                              : "Details updated"}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatRelativeTime(event.createdAt)}
                          {event.userName && ` · ${event.userName}`}
                        </p>
                        {event.details.amount !== undefined && (
                          <p className="mt-0.5 text-xs">
                            Value: {formatCurrencyINR(Number(event.details.amount), false)}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                  {history.data?.length === 0 && (
                    <p className="text-sm text-muted-foreground">No events yet.</p>
                  )}
                  {(history.data?.length ?? 0) > 5 && (
                    <button
                      onClick={() => setTab("history")}
                      className="mt-3 text-xs text-accent hover:underline"
                    >
                      View all history →
                    </button>
                  )}
                </section>
              </div>
            </div>
          )}

          {/* History tab */}
          {tab === "history" && (
            <section className="rounded-lg border border-border bg-surface p-4">
              <h2 className="mb-4 text-sm font-semibold">Deal history</h2>
              {history.error && <p className="text-sm text-danger">{history.error}</p>}
              {!history.data && !history.error && <p className="text-sm text-muted-foreground">Loading…</p>}
              <ol className="space-y-4">
                {history.data?.map((event) => (
                  <li key={event.id} className="border-l-2 border-border pl-3">
                    <p className="text-sm font-medium">
                      {event.action === "deal.created"
                        ? "Deal created"
                        : event.details.from_stage !== event.details.to_stage
                          ? `Moved from ${stageWord(event.details.from_stage)} to ${stageWord(event.details.to_stage)}`
                          : "Deal details updated"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDateTime(event.createdAt)} ·{" "}
                      {event.userName || (event.userId ? `Member #${event.userId}` : "System")}
                    </p>
                    {event.details.amount !== undefined && (
                      <p className="mt-1 text-xs">
                        Value: {formatCurrencyINR(Number(event.details.amount), false)}
                      </p>
                    )}
                    {(event.details.lost_category || event.details.lost_reason) && (
                      <p className="mt-1 whitespace-pre-wrap text-xs">
                        Reason: {lostWords(String(event.details.lost_category || ""), String(event.details.lost_reason || ""))}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
              {history.data?.length === 0 && <p className="text-sm text-muted-foreground">No events.</p>}
              <div className="mt-4 flex justify-between">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!eventCursors.length}
                  onClick={() => setEventCursors(eventCursors.slice(0, -1))}
                >
                  Newer
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={history.data?.length !== 50}
                  onClick={() => setEventCursors([...eventCursors, history.data!.at(-1)!.id])}
                >
                  Older
                </Button>
              </div>
            </section>
          )}

          {/* Documents tab */}
          {tab === "documents" && (
            <section className="rounded-lg border border-border bg-surface p-4">
              <h2 className="mb-4 text-sm font-semibold">Documents</h2>
              <RecordDocuments recordKind="deal" recordId={deal.id} addedBy={deal.ownerName || "CRM"} today={todayIso()} />
            </section>
          )}

          {/* Contact conversation & calls */}
          <ContactConversation contactId={deal.customerId} />
          <CustomerCalls contactId={deal.customerId} />

          {/* Activity form dialog */}
          <ActivityForm
            open={actOpen}
            onOpenChange={setActOpen}
            dealId={id}
            contactId={deal.customerId}
            onSaved={() => activities.reload()}
          />
        </>
      )}
    </div>
  );
}

function stageWord(stage: unknown) {
  const key = String(stage) as keyof typeof dealStageMeta;
  return dealStageMeta[key]?.label ?? String(stage);
}
