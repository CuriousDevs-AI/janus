"use client";

import { ContactConversation } from "@/components/chat/contact-conversation";
import { CustomerCalls } from "@/components/calls/customer-call";
import { use, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ExternalLink,
  FileText,
  IndianRupee,
  Mail,
  MessageCircle,
  MessageSquareText,
  Pencil,
  Phone,
  Send,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import type { Contact, Deal, DealEvent, Lead, LeadEvent } from "@/lib/api/types";
import { FollowUpBox, followUpWords, type LeadNote } from "@/components/crm/follow-up";
import { useSession } from "@/components/auth/session-provider";
import { LeadDeal } from "@/components/deals/deal-form";
import { WhatsAppButton } from "@/components/inbox/whatsapp-button";
import { Badge } from "@/components/ui/badge";
import { lostWords } from "@/lib/lost-reasons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDateTime } from "@/lib/utils";
import { LEAD_STAGES as stages, TERMINAL_LEAD_STAGES, stageLabel as label, stageBadgeVariant as stageVariant } from "@/lib/lead-stages";
import { SourceBadge } from "@/components/shared/source-badge";

function initials(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "L";
}

function TimelineItem({
  icon,
  title,
  detail,
  time,
  tone = "accent",
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  time: string;
  tone?: "accent" | "success" | "info" | "warning";
}) {
  const barColor = {
    accent: "bg-accent",
    success: "bg-success",
    info: "bg-info",
    warning: "bg-warning",
  };
  const iconColor = {
    accent: "text-accent",
    success: "text-success",
    info: "text-info",
    warning: "text-warning",
  };
  const borderColor = {
    accent: "border-l-accent",
    success: "border-l-success",
    info: "border-l-info",
    warning: "border-l-warning",
  };
  return (
    <div className={`border border-border border-l-[3px] ${borderColor[tone]} bg-surface px-3.5 py-2.5 shadow-sm`}>
      <div className="flex items-start gap-2.5">
        <div className={`mt-0.5 shrink-0 ${iconColor[tone]}`}>{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[13px] font-medium text-foreground">{title}</p>
            <time className="text-[11px] text-muted-foreground">{time}</time>
          </div>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function FollowUpActions({ contact }: { contact: Contact }) {
  const phone = contact.phone?.replace(/[^\d+]/g, "") || "";
  const email = contact.email?.trim() || "";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm">
          <Send className="size-3.5" />
          Follow up
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 bg-surface p-0 shadow-2xl">
        <div className="border-b border-border px-3 py-3">
          <p className="text-sm font-semibold">Choose a channel</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Start the next conversation from this lead.
          </p>
        </div>
        <div className="space-y-1.5 p-3">
          {contact.doNotContact && (
            <p className="rounded-md border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-800">
              Outbound communication is suppressed for this customer.
            </p>
          )}
          {phone && !contact.doNotContact && (
            <WhatsAppButton
              contactId={contact.id}
              label="Open WhatsApp conversation"
              className="w-full justify-start bg-[#128C7E] text-white hover:bg-[#0f7b6f]"
            />
          )}
          {phone && !contact.doNotContact && !contact.whatsappOptIn && (
            <p className="px-1 text-[11px] text-muted-foreground">
              WhatsApp templates stay blocked until opt-in is recorded on the customer record.
            </p>
          )}
          {email && !contact.doNotContact && (
            <Button asChild size="sm" variant="secondary" className="w-full justify-start">
              <a href={`mailto:${encodeURIComponent(email)}`}>
                <Mail className="size-3.5" />
                Email externally · {email}
              </a>
            </Button>
          )}
          {phone && !contact.doNotContact && (
            <Button asChild size="sm" variant="secondary" className="w-full justify-start">
              <a href={`tel:${phone}`}>
                <Phone className="size-3.5" />
                Call externally · {contact.phone}
              </a>
            </Button>
          )}
          {phone && !contact.doNotContact && (
            <Button asChild size="sm" variant="secondary" className="w-full justify-start">
              <a href={`sms:${phone}`}>
                <MessageSquareText className="size-3.5" />
                SMS externally · {contact.phone}
              </a>
            </Button>
          )}
          {!phone && !email && (
            <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
              Add a phone number or email to this contact before starting a follow-up.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 border-t border-border px-3 py-2.5 text-[11px] text-muted-foreground">
          <MessageCircle className="size-3.5" />
          WhatsApp opens the connected inbox. Email, call and SMS open your device apps and are not tracked by Janus yet.
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface TeamMember { id: string; user_id: string; name: string; role: string; status: string }

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const session = useSession();
  const lead = useApi<Lead>(`/leads/${encodeURIComponent(id)}`);
  const deal = useApi<Deal>(lead.data?.dealId ? `/deals/${encodeURIComponent(lead.data.dealId)}` : null);
  const dealEvents = useApi<DealEvent[]>(deal.data ? `/deals/${encodeURIComponent(deal.data.id)}/events?limit=50` : null);
  const notes = useApi<LeadNote[]>(`/leads/${encodeURIComponent(id)}/notes`);
  const leadEvents = useApi<LeadEvent[]>(`/leads/${encodeURIComponent(id)}/events?limit=50`);
  const team = useApi<TeamMember[]>("/members?limit=100");
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function patchLead(body: Record<string, unknown>) {
    setBusy(true);
    try {
      await api(`/leads/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
      toast.success("Lead updated");
      lead.reload();
      leadEvents.reload();
      return true;
    } catch (e) { toast.error(message(e)); return false; } finally { setBusy(false); }
  }

  async function assignOwner(ownerId: string | null) {
    setBusy(true);
    try {
      await api("/leads/assign", { method: "POST", body: JSON.stringify({ leadIds: [id], ownerId }) });
      toast.success("Owner updated");
      lead.reload();
      return true;
    } catch (e) { toast.error(message(e)); return false; } finally { setBusy(false); }
  }

  if (!lead.data) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <Link href="/leads" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" />
          Leads
        </Link>
        <p role="status" className="mt-8 text-sm">
          {lead.error || "Loading lead…"}
        </p>
      </div>
    );
  }

  const leadData = lead.data;
  const contactData: Contact = {
    id: leadData.customerId,
    name: leadData.contactName,
    phone: leadData.phone,
    email: leadData.email,
    company: leadData.company,
    whatsappOptIn: leadData.whatsappOptIn,
    doNotContact: leadData.doNotContact,
    consentSource: leadData.consentSource,
    consentUpdatedAt: leadData.consentUpdatedAt,
  };
  const displayName = contactData.name || contactData.phone || contactData.email || `Lead #${leadData.id}`;
  const owner = leadData.ownerId === session.user.id
    ? session.user.name
    : leadData.ownerId
      ? leadData.ownerName || `Member #${leadData.ownerId}`
      : "Unassigned";
  const currentStage = stages.indexOf(leadData.stage as (typeof stages)[number]);
  const isTerminal = TERMINAL_LEAD_STAGES.includes(leadData.stage);
  const sourceLabel = label(leadData.source);
  // A follow-up note already explains its own activity; the generic line is for anything else.
  const explained = (notes.data ?? []).some((note) => Math.abs(Date.parse(note.createdAt) - Date.parse(leadData.lastActivityAt)) < 5000);
  const hasRecentActivity = leadData.lastActivityAt !== leadData.createdAt && !explained;
  // One list, newest first, as the timeline's label says.
  const timeline = [
    ...(notes.data ?? []).map((note) => ({
      key: `note-${note.id}`,
      at: note.createdAt,
      node: (
        <TimelineItem
          key={`note-${note.id}`}
          icon={<MessageSquareText className="size-4" />}
          title={`Follow-up${note.author ? ` · ${note.author}` : ""}`}
          detail={`${note.body}${note.nextFollowUpOn ? ` Next follow-up ${followUpWords(note.nextFollowUpOn)}.` : ""}`}
          time={formatDateTime(note.createdAt)}
          tone="info"
        />
      ),
    })),
    {
      key: "captured",
      at: leadData.createdAt,
      node: (
        <TimelineItem
          key="captured"
          icon={<CheckCircle2 className="size-4" />}
          title="Lead captured"
          detail={`Captured from ${sourceLabel}${leadData.campaign ? ` · Campaign ${leadData.campaign}` : ""}.`}
          time={formatDateTime(leadData.createdAt)}
          tone="success"
        />
      ),
    },
    ...(hasRecentActivity
      ? [
          {
            key: "activity",
            at: leadData.lastActivityAt,
            node: (
              <TimelineItem
                key="activity"
                icon={<MessageCircle className="size-4" />}
                title="Last activity recorded"
                detail="Open the unified inbox to continue the conversation."
                time={formatDateTime(leadData.lastActivityAt)}
                tone="accent"
              />
            ),
          },
        ]
      : []),
    ...(dealEvents.data ?? []).map((event) => ({
      key: `deal-${event.id}`,
      at: event.createdAt,
      node: (
        <TimelineItem
          key={`deal-${event.id}`}
          icon={<CalendarClock className="size-4" />}
          title={event.action === "deal.created" ? "Deal created" : "Deal updated"}
          detail={
            event.details.to_stage
              ? `Deal moved to ${label(String(event.details.to_stage))}.`
              : "Deal details changed."
          }
          time={formatDateTime(event.createdAt)}
          tone="accent"
        />
      ),
    })),
    ...(leadEvents.data ?? [])
      .filter((e) => e.action === "lead.updated" && e.details.from_stage !== e.details.to_stage)
      .map((event) => ({
        key: `lead-event-${event.id}`,
        at: event.createdAt,
        node: (
          <TimelineItem
            key={`lead-event-${event.id}`}
            icon={<ChevronRight className="size-4" />}
            title="Stage changed"
            detail={`${label(String(event.details.from_stage))} → ${label(String(event.details.to_stage))}${event.userName ? ` · by ${event.userName}` : ""}`}
            time={formatDateTime(event.createdAt)}
            tone="info"
          />
        ),
      })),
    ...(leadData.recordingUrl && /^https?:\/\//.test(leadData.recordingUrl)
      ? [
          {
            key: "recording",
            at: leadData.lastActivityAt || leadData.createdAt,
            node: (
              <TimelineItem
                key="recording"
                icon={<Phone className="size-4" />}
                title="Call recording available"
                detail="The recording was attached to this lead by the call provider."
                time={formatDateTime(leadData.lastActivityAt || leadData.createdAt)}
                tone="warning"
              />
            ),
          },
        ]
      : []),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <Link href="/leads" className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Back to leads
      </Link>

      <header className="rounded-xl border border-border bg-surface p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-accent-border bg-accent-muted text-sm font-semibold text-accent">
              {initials(displayName)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lead #{leadData.id}</p>
                <Badge variant={stageVariant(leadData.stage)} className="text-[10px]">{label(leadData.stage)}</Badge>
              </div>
              <h1 className="mt-1 break-words text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{displayName}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {contactData.company && (
                  <span className="inline-flex items-center gap-1"><Building2 className="size-3" />{contactData.company}</span>
                )}
                {contactData.phone && (
                  <span className="inline-flex items-center gap-1"><Phone className="size-3" />{contactData.phone}</span>
                )}
                {contactData.email && (
                  <span className="inline-flex items-center gap-1"><Mail className="size-3" />{contactData.email}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {!isTerminal && (
              <>
                <Button size="sm" variant="secondary" onClick={() => setEditOpen(true)}>
                  <Pencil className="size-3.5" /> Edit
                </Button>
                <FollowUpActions contact={contactData} />
                <LeadDeal lead={leadData} customerName={displayName} />
              </>
            )}
            {leadData.dealId && (
              <Button size="sm" asChild>
                <Link href={`/deals/${leadData.dealId}`}>
                  <ExternalLink className="size-3.5" /> Open deal
                </Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="text-sm font-semibold">Pipeline</h2>
              {!isTerminal ? (
                <Select value={leadData.stage} onValueChange={(v) => patchLead({ stage: v })} disabled={busy}>
                  <SelectTrigger className="h-7 w-auto min-w-[120px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.filter((s) => s !== "converted").map((s) => (
                      <SelectItem key={s} value={s}>
                        <Badge variant={stageVariant(s)} className="pointer-events-none">{label(s)}</Badge>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant={stageVariant(leadData.stage)}>{label(leadData.stage)}</Badge>
              )}
            </div>
            {leadData.stage === "converted" && (
              <div className="mt-3 flex items-center gap-3 rounded-lg border border-success/20 bg-success/5 px-4 py-3">
                <CheckCircle2 className="size-5 text-success" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Converted to deal</p>
                  <p className="text-xs text-muted-foreground">This lead is now tracked as a deal. All follow-ups and pipeline stages are on the deal.</p>
                </div>
                {leadData.dealId && (
                  <Button size="sm" variant="secondary" asChild>
                    <Link href={`/deals/${leadData.dealId}`}>
                      <ExternalLink className="size-3.5" /> Open deal
                    </Link>
                  </Button>
                )}
              </div>
            )}
            {leadData.stage === "lost" && (
              <div className="mt-3 rounded-md border border-danger/20 bg-danger/5 px-4 py-3">
                <p className="text-sm"><span className="font-medium">Lost</span>{(leadData.lostCategory || leadData.lostReason) ? `: ${lostWords(leadData.lostCategory, leadData.lostReason)}` : ""}</p>
              </div>
            )}
            <div className="mt-4 flex gap-1">
              {stages.map((stage, index) => {
                const complete = leadData.stage !== "lost" && currentStage >= index;
                const active = leadData.stage === stage;
                return (
                  <div key={stage} className="min-w-0 flex-1">
                    <div className={`h-1.5 rounded-full transition-colors ${complete ? "bg-accent" : leadData.stage === "lost" && stage === "lost" ? "bg-danger" : "bg-surface-3"}`} />
                    <p className={`mt-1.5 hidden truncate text-[10px] sm:block ${active ? (stage === "lost" ? "font-semibold text-danger" : "font-semibold text-accent") : "text-muted-foreground"}`} title={label(stage)}>
                      {label(stage)}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          {!isTerminal && <FollowUpBox leadId={leadData.id} onSaved={() => { notes.reload(); lead.reload(); }} />}

          <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Timeline</h2>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"><Clock3 className="size-3" />Newest first</span>
            </div>
            {timeline.length === 0 && !dealEvents.loading ? (
              <p className="mt-4 text-xs text-muted-foreground">No activity recorded yet.</p>
            ) : (
              <div className="mt-4 flex flex-col gap-2">
                {timeline.map((item) => item.node)}
                {dealEvents.loading && <p className="pl-11 text-xs text-muted-foreground">Loading deal history…</p>}
                {dealEvents.error && <p role="alert" className="pl-11 text-xs text-danger">Unable to load deal history: {dealEvents.error}</p>}
              </div>
            )}
          </section>

          <ContactConversation contactId={leadData.customerId} />
          <CustomerCalls contactId={leadData.customerId} />
          <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <h2 className="text-sm font-semibold">Requirement</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {leadData.requirement || "No requirement recorded yet."}
            </p>
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-5">
          <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <h2 className="text-sm font-semibold">Contact</h2>
            <div className="mt-3 space-y-2.5 text-sm">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs text-muted-foreground">Name</span>
                <span className="text-right text-xs font-medium">{displayName}</span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs text-muted-foreground">Mobile</span>
                {contactData.phone ? <a href={`tel:${contactData.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">{contactData.phone}</a> : <span className="text-xs text-muted-foreground">—</span>}
              </div>
              <div className="flex items-start justify-between gap-2">
                <span className="shrink-0 text-xs text-muted-foreground">Email</span>
                {contactData.email ? <a href={`mailto:${encodeURIComponent(contactData.email)}`} className="break-all text-right text-xs font-medium text-accent hover:underline">{contactData.email}</a> : <span className="text-xs text-muted-foreground">—</span>}
              </div>
              {contactData.company && (
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Company</span>
                  <span className="text-right text-xs font-medium">{contactData.company}</span>
                </div>
              )}
            </div>
            <Button size="sm" variant="secondary" asChild className="mt-4 w-full">
              <Link href={`/customers/${contactData.id}`}>
                Open customer record
                <ChevronRight className="ml-auto size-3.5" />
              </Link>
            </Button>
          </section>

          <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <h2 className="text-sm font-semibold">Lead details</h2>
            <dl className="mt-3 space-y-2.5 text-xs">
              <div className="flex items-start justify-between gap-3"><dt className="text-muted-foreground">Source</dt><dd><SourceBadge source={leadData.source} /></dd></div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Owner</dt>
                <dd>
                  <Select value={leadData.ownerId ?? "unassigned"} onValueChange={(v) => assignOwner(v === "unassigned" ? null : v)} disabled={busy}>
                    <SelectTrigger className="h-6 w-auto min-w-[100px] text-xs font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {(team.data ?? []).filter((t) => t.status === "active").map((t) => (
                        <SelectItem key={t.user_id} value={t.user_id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3"><dt className="text-muted-foreground">Created</dt><dd className="text-right font-medium">{formatDateTime(leadData.createdAt)}</dd></div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Lead age</dt>
                <dd className="text-right font-medium">{(() => {
                  const days = Math.floor((Date.now() - Date.parse(leadData.createdAt)) / 86400000);
                  if (days === 0) return "Today";
                  if (days === 1) return "1 day";
                  if (days < 30) return `${days} days`;
                  const months = Math.floor(days / 30);
                  return months === 1 ? "1 month" : `${months} months`;
                })()}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Next follow-up</dt>
                <dd className={`text-right font-medium ${leadData.nextFollowUpOn && followUpWords(leadData.nextFollowUpOn).includes("overdue") ? "text-warning" : ""}`}>
                  {leadData.nextFollowUpOn ? followUpWords(leadData.nextFollowUpOn) : <span className="text-muted-foreground">Not set</span>}
                </dd>
              </div>
              {leadData.lastActivityAt && leadData.lastActivityAt !== leadData.createdAt && (
                <div className="flex items-start justify-between gap-3"><dt className="text-muted-foreground">Last activity</dt><dd className="text-right font-medium">{formatDateTime(leadData.lastActivityAt)}</dd></div>
              )}
              {leadData.campaign && <div className="flex items-start justify-between gap-3"><dt className="text-muted-foreground">Campaign</dt><dd className="text-right font-medium">{leadData.campaign}</dd></div>}
            </dl>
            {leadData.recordingUrl && /^https?:\/\//.test(leadData.recordingUrl) && (
              <Button size="sm" variant="secondary" asChild className="mt-4 w-full">
                <a href={leadData.recordingUrl} target="_blank" rel="noreferrer">
                  Open call recording
                  <ExternalLink className="ml-auto size-3.5" />
                </a>
              </Button>
            )}
            {leadData.recordingReference && <p className="mt-3 break-all text-[11px] text-muted-foreground">Recording reference: {leadData.recordingReference}</p>}
          </section>

          {deal.data && (
            <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
              <h2 className="text-sm font-semibold">Deal</h2>
              <dl className="mt-3 space-y-2.5 text-xs">
                <div className="flex items-start justify-between gap-3"><dt className="text-muted-foreground">Name</dt><dd className="text-right font-medium">{deal.data.name}</dd></div>
                {deal.data.amount != null && (
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-muted-foreground">Value</dt>
                    <dd className="inline-flex items-center gap-0.5 text-right font-semibold text-accent"><IndianRupee className="size-3" />{Number(deal.data.amount).toLocaleString("en-IN")}</dd>
                  </div>
                )}
                <div className="flex items-start justify-between gap-3"><dt className="text-muted-foreground">Stage</dt><dd><Badge variant={stageVariant(deal.data.stage)} className="text-[10px]">{label(deal.data.stage)}</Badge></dd></div>
                {deal.data.expectedCloseAt && (
                  <div className="flex items-start justify-between gap-3"><dt className="text-muted-foreground">Expected close</dt><dd className="text-right font-medium">{formatDateTime(deal.data.expectedCloseAt)}</dd></div>
                )}
              </dl>
              <Button size="sm" variant="secondary" asChild className="mt-4 w-full">
                <Link href={`/deals/${deal.data.id}`}>
                  Open deal
                  <ChevronRight className="ml-auto size-3.5" />
                </Link>
              </Button>
            </section>
          )}
        </aside>
      </div>

      {editOpen && (
        <LeadEditDialog
          open
          onOpenChange={setEditOpen}
          lead={leadData}
          busy={busy}
          onSave={async (body) => {
            const ownerChanged = body._ownerId !== undefined;
            const ownerId = body._ownerId as string | null | undefined;
            const patchBody = { ...body };
            delete patchBody._ownerId;
            const ok = await patchLead(patchBody);
            if (ok && ownerChanged) await assignOwner(ownerId ?? null);
            if (ok) setEditOpen(false);
          }}
          team={(team.data ?? []).filter((t) => t.status === "active")}
        />
      )}
    </div>
  );
}

function LeadEditDialog({ open, onOpenChange, lead, busy, onSave, team }: {
  open: boolean; onOpenChange: (v: boolean) => void; lead: Lead; busy: boolean;
  onSave: (body: Record<string, unknown>) => void; team: TeamMember[];
}) {
  const [name, setName] = useState(lead.contactName);
  const [phone, setPhone] = useState(lead.phone || "");
  const [email, setEmail] = useState(lead.email || "");
  const [company, setCompany] = useState(lead.company);
  const [requirement, setRequirement] = useState(lead.requirement);
  const [ownerId, setOwnerId] = useState(lead.ownerId ?? "unassigned");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit lead</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-3" onSubmit={(e) => {
          e.preventDefault();
          onSave({
            name: name.trim(),
            phone: phone.trim() || null,
            email: email.trim() || null,
            company: company.trim(),
            requirement: requirement.trim(),
            _ownerId: ownerId === "unassigned" ? null : ownerId,
          });
        }}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="le-name">Name</Label>
            <Input id="le-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="le-phone">Phone</Label>
              <Input id="le-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="le-email">Email</Label>
              <Input id="le-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="le-company">Company</Label>
            <Input id="le-company" value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="le-owner">Owner</Label>
            <Select value={ownerId} onValueChange={setOwnerId}>
              <SelectTrigger id="le-owner"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {team.map((t) => <SelectItem key={t.user_id} value={t.user_id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="le-req">Requirement</Label>
            <Textarea id="le-req" value={requirement} onChange={(e) => setRequirement(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy || !name.trim()}>{busy ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
