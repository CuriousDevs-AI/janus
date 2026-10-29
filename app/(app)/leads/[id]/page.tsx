"use client";

import { use, type ReactNode } from "react";
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
  Mail,
  MessageCircle,
  MessageSquareText,
  Phone,
  Send,
  UserRound,
} from "lucide-react";
import { useApi } from "@/lib/api/use-api";
import type { Contact, Deal, DealEvent, Lead } from "@/lib/api/types";
import { useSession } from "@/components/auth/session-provider";
import { LeadDeal } from "@/components/deals/deal-form";
import { WhatsAppButton } from "@/components/inbox/whatsapp-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDateTime } from "@/lib/utils";

const stages = [
  "new",
  "contacted",
  "qualified",
  "demo",
  "proposal",
  "negotiation",
  "approval",
  "won",
  "lost",
] as const;

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function initials(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "L";
}

function stageVariant(stage: string): "neutral" | "accent" | "success" | "danger" {
  if (stage === "won") return "success";
  if (stage === "lost") return "danger";
  if (stage === "new" || stage === "contacted") return "accent";
  return "neutral";
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
  const toneClasses = {
    accent: "border-accent-border bg-accent-muted text-accent",
    success: "border-success/30 bg-success-muted text-success",
    info: "border-info/30 bg-info-muted text-info",
    warning: "border-warning/30 bg-warning-muted text-warning",
  };

  return (
    <div className="relative flex gap-3 pb-5 last:pb-0">
      <div className={`relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border ${toneClasses[tone]}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <time className="text-[11px] text-muted-foreground">{time}</time>
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
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

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const session = useSession();
  const lead = useApi<Lead>(`/leads/${encodeURIComponent(id)}`);
  const deal = useApi<Deal>(lead.data?.dealId ? `/deals/${encodeURIComponent(lead.data.dealId)}` : null);
  const dealEvents = useApi<DealEvent[]>(deal.data ? `/deals/${encodeURIComponent(deal.data.id)}/events?limit=50` : null);

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
  const sourceLabel = label(leadData.source);
  const hasRecentActivity = leadData.lastActivityAt !== leadData.createdAt;
  // One list, newest first, as the timeline's label says.
  const timeline = [
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
                detail="This lead has a newer activity timestamp. Open the unified inbox to continue the conversation."
                time={formatDateTime(leadData.lastActivityAt)}
                tone="info"
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

      <header className="relative overflow-hidden rounded-xl border border-border bg-surface p-5 shadow-sm">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-accent via-info to-success" />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-accent-border bg-accent-muted text-sm font-semibold text-accent">
              {initials(displayName)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lead #{leadData.id}</p>
                <Badge variant={stageVariant(leadData.stage)}>{label(leadData.stage)}</Badge>
              </div>
              <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-foreground">{displayName}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {contactData.company && <span className="inline-flex items-center gap-1.5"><Building2 className="size-3.5 text-accent" />{contactData.company}</span>}
                <span className="inline-flex items-center gap-1.5"><FileText className="size-3.5 text-info" />{sourceLabel}</span>
                <span className="inline-flex items-center gap-1.5"><CalendarClock className="size-3.5 text-success" />Captured {formatDateTime(leadData.createdAt)}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <FollowUpActions contact={contactData} />
            <LeadDeal lead={leadData} customerName={displayName} />
          </div>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="flex min-w-0 flex-col gap-5">
          <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-accent">Pipeline</p>
                <h2 className="mt-1 text-base font-semibold">Where this lead is now</h2>
              </div>
              <Badge variant={stageVariant(leadData.stage)}>{label(leadData.stage)}</Badge>
            </div>
            <div className="mt-5 grid grid-cols-5 gap-1 sm:grid-cols-9">
              {stages.map((stage, index) => {
                const complete = leadData.stage !== "lost" && currentStage >= index;
                const active = leadData.stage === stage;
                return (
                  <div key={stage} className="min-w-0">
                    <div className={`h-1.5 rounded-full ${complete ? "bg-gradient-to-r from-accent to-info" : "bg-surface-3"}`} />
                    <p className={`mt-2 truncate text-[10px] ${active ? "font-semibold text-accent" : "text-muted-foreground"}`} title={label(stage)}>
                      {label(stage)}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-info">Activity</p>
                <h2 className="mt-1 text-base font-semibold">Lead timeline</h2>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 className="size-3.5 text-info" />Newest first</span>
            </div>
            <div className="relative mt-5 pl-0">
              <div className="absolute bottom-2 left-4 top-2 w-px bg-border" />
              {timeline.map((item) => item.node)}
              {dealEvents.loading && <p className="pl-11 text-xs text-muted-foreground">Loading deal history…</p>}
              {dealEvents.error && <p role="alert" className="pl-11 text-xs text-danger">Unable to load deal history: {dealEvents.error}</p>}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-warning" />
              <h2 className="text-base font-semibold">Requirement</h2>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {leadData.requirement || "No requirement recorded yet."}
            </p>
          </section>
        </main>

        <aside className="flex min-w-0 flex-col gap-5">
          <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <UserRound className="size-4 text-success" />
              <h2 className="text-base font-semibold">Contact</h2>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Name</p>
                <p className="mt-1 font-medium">{displayName}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Mobile</p>
                {contactData.phone ? <a href={`tel:${contactData.phone.replace(/[^\d+]/g, "")}`} className="mt-1 inline-flex items-center gap-1.5 font-medium text-accent hover:underline"><Phone className="size-3.5" />{contactData.phone}</a> : <p className="mt-1 text-muted-foreground">Not available</p>}
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Email</p>
                {contactData.email ? <a href={`mailto:${encodeURIComponent(contactData.email)}`} className="mt-1 inline-flex max-w-full items-center gap-1.5 break-all text-accent hover:underline"><Mail className="size-3.5 shrink-0" />{contactData.email}</a> : <p className="mt-1 text-muted-foreground">Not available</p>}
              </div>
            </div>
            <Button size="sm" variant="secondary" asChild className="mt-4 w-full">
              <Link href={`/customers/${contactData.id}`}>
                Open customer record
                <ChevronRight className="ml-auto size-3.5" />
              </Link>
            </Button>
          </section>

          <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <CalendarClock className="size-4 text-accent" />
              <h2 className="text-base font-semibold">Lead details</h2>
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-start justify-between gap-3"><dt className="text-muted-foreground">Source</dt><dd className="text-right font-medium">{sourceLabel}</dd></div>
              <div className="flex items-start justify-between gap-3"><dt className="text-muted-foreground">Owner</dt><dd className="text-right font-medium">{owner}</dd></div>
              <div className="flex items-start justify-between gap-3"><dt className="text-muted-foreground">Created</dt><dd className="text-right font-medium">{formatDateTime(leadData.createdAt)}</dd></div>
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
        </aside>
      </div>
    </div>
  );
}
