"use client";

import * as React from "react";
import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageSquare, UserRoundCog, Handshake, MoreHorizontal, Sparkles, ArrowRight } from "lucide-react";
import { useAppStore, useCompany } from "@/lib/stores/app-store";
import { users, getMemoryForCustomer } from "@/lib/mock-data";
import { CustomerAvatar } from "@/components/shared/customer-avatar";
import { LeadStageBadge } from "@/components/shared/status-badge";
import { ChannelBadge } from "@/components/shared/channel-badge";
import { AIIndicator } from "@/components/shared/ai-indicator";
import { ActivityTimeline } from "@/components/shared/activity-timeline";
import { leadSourceMeta } from "@/lib/status-meta";
import { formatCurrencyINR, formatRelativeTime, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const lead = useAppStore((s) => s.leads.find((l) => l.id === id));
  const customer = useAppStore((s) => s.customers.find((c) => c.id === lead?.customerId));
  const allActivities = useAppStore((s) => s.activities);
  const allConversations = useAppStore((s) => s.conversations);
  const activities = allActivities.filter((a) => a.customerId === lead?.customerId);
  const conversations = allConversations.filter((c) => c.customerId === lead?.customerId);
  const createDeal = useAppStore((s) => s.createDeal);
  const moveLeadStage = useAppStore((s) => s.moveLeadStage);
  const company = useCompany(customer?.companyId);
  const [askOpen, setAskOpen] = React.useState(false);

  if (!lead || !customer) {
    return (
      <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-2 px-6 py-16 text-center">
        <p className="text-[14px] font-medium text-foreground">Lead not found</p>
        <Button size="sm" variant="secondary" asChild>
          <Link href="/leads">Back to leads</Link>
        </Button>
      </div>
    );
  }

  const owner = users.find((u) => u.id === lead.ownerId);
  const memory = getMemoryForCustomer(customer.id).filter((m) => m.kind === "derived_insight");
  const sortedActivities = [...activities].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  function handleConvert() {
    const id = createDeal({
      name: `${company?.name ?? customer!.name} — ${lead!.requirement.split(" ").slice(0, 4).join(" ")}`,
      customerId: customer!.id,
      amount: lead!.score >= 80 ? 800000 : lead!.score >= 60 ? 400000 : 150000,
      stage: "qualified",
      expectedCloseAt: new Date(Date.now() + 45 * 86400000).toISOString(),
    });
    moveLeadStage(lead!.id, "qualified");
    toast.success("Converted to deal", { description: "A new deal was created from this lead." });
    router.push(`/deals/${id}`);
  }

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 px-6 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <CustomerAvatar name={customer.name} color={customer.avatarColor} size="lg" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[22px] font-semibold tracking-tight text-foreground">{customer.name}</h1>
              <LeadStageBadge stage={lead.stage} />
            </div>
            <Link href={`/customers/${customer.id}`} className="text-[13px] text-muted-foreground hover:text-accent">
              {company?.name}
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" asChild>
            <Link href="/inbox">
              <MessageSquare className="size-3.5" />
              Message
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm">
                <UserRoundCog className="size-3.5" />
                Assign
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {users.filter((u) => u.role.includes("sales")).map((u) => (
                <DropdownMenuItem key={u.id} onSelect={() => toast.success(`Assigned to ${u.name}`)}>
                  {u.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {lead.stage !== "won" && lead.stage !== "lost" && (
            <Button size="sm" onClick={handleConvert}>
              <Handshake className="size-3.5" />
              Convert to Deal
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => moveLeadStage(lead.id, "lost")} variant="destructive">
                Mark as Lost
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_1fr_300px]">
        {/* LEFT — customer info */}
        <div className="flex flex-col gap-4">
          <InfoBlock title="Lead score">
            <div className="flex items-baseline gap-2">
              <span className="text-mono text-[28px] font-semibold text-foreground">{lead.score}</span>
              <span className="text-[12px] text-muted-foreground">/ 100</span>
            </div>
            <div className="mt-2 flex flex-col gap-1">
              {lead.scoreReasons.map((r, i) => (
                <span key={i} className={"text-[12px] " + (r.signal === "positive" ? "text-success" : r.signal === "negative" ? "text-danger" : "text-muted-foreground")}>
                  {r.signal === "positive" ? "✓" : r.signal === "negative" ? "✕" : "?"} {r.label}
                </span>
              ))}
            </div>
          </InfoBlock>

          <InfoBlock title="Details">
            <Row label="Status"><LeadStageBadge stage={lead.stage} /></Row>
            <Row label="Owner">{owner?.name}</Row>
            <Row label="Source">
              <span className="inline-flex items-center gap-1.5">
                {React.createElement(leadSourceMeta[lead.source].icon, { className: "size-3.5" })}
                {leadSourceMeta[lead.source].label}
              </span>
            </Row>
            <Row label="Intent">{lead.intent}</Row>
            <Row label="Budget">{lead.budgetSignal}</Row>
            <Row label="Decision maker">{lead.decisionMaker ?? "Unknown"}</Row>
            <Row label="Created">{formatDate(lead.createdAt)}</Row>
          </InfoBlock>

          <InfoBlock title="Contact">
            <Row label="Email">{customer.email}</Row>
            <Row label="Phone">{customer.phone}</Row>
            <Row label="Company">{company?.name}</Row>
            <Row label="Industry">{company?.industry}</Row>
          </InfoBlock>
        </div>

        {/* CENTER — communication timeline */}
        <div className="rounded-lg border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-[13px] font-semibold text-foreground">Communication timeline</h2>
            <div className="flex items-center gap-1.5">
              {conversations.map((c) => (
                <span key={c.id} title={c.channel}>
                  <ChannelBadge channel={c.channel} iconOnly />
                </span>
              ))}
            </div>
          </div>
          <div className="max-h-[600px] overflow-y-auto px-4 py-3">
            <ActivityTimeline activities={sortedActivities} groupByDay />
          </div>
        </div>

        {/* RIGHT — AI context */}
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-accent-border bg-accent-muted p-4">
            <div className="mb-2 flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-accent" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-accent">AI Summary</span>
            </div>
            <p className="text-[13px] leading-relaxed text-foreground">
              {customer.name.split(" ")[0]} is evaluating {company?.name ? `an offering for ${company.name}` : "our product"}.
            </p>
            <dl className="mt-3 flex flex-col gap-1.5 text-[12px]">
              <div className="flex justify-between"><dt className="text-muted-foreground">Primary concern</dt><dd className="text-foreground">{memory[0]?.value.split(".")[0] ?? "Not yet identified"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Intent</dt><dd className="capitalize text-foreground">{lead.intent}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Budget</dt><dd className="capitalize text-foreground">{lead.budgetSignal}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Decision maker</dt><dd className="text-foreground">{lead.decisionMaker ?? "Unknown"}</dd></div>
            </dl>
            <Separator className="my-3 bg-accent-border" />
            <p className="text-[12px] font-medium text-foreground">Recommended next step</p>
            <p className="text-[12px] text-muted-foreground">
              {lead.stage === "new" || lead.stage === "contacted" ? "Schedule a qualification call." : lead.stage === "qualified" ? "Schedule technical demo." : "Follow up on the last outreach."}
            </p>
            <Button size="sm" variant="secondary" className="mt-3 w-full" onClick={() => setAskOpen((v) => !v)}>
              <Sparkles className="size-3.5 text-accent" />
              Ask AI
            </Button>
            {askOpen && (
              <div className="mt-2 rounded-md border border-border bg-surface p-2.5 text-[12px] text-muted-foreground">
                &ldquo;Based on {sortedActivities.length} timeline events, {customer.name.split(" ")[0]} shows {lead.intent} intent with{" "}
                {lead.budgetSignal === "known" ? "a confirmed budget" : "budget still unconfirmed"}. Recommend involving {lead.decisionMaker ?? "the economic buyer"} directly.&rdquo;
              </div>
            )}
          </div>

          {memory.length > 0 && (
            <InfoBlock title="AI-derived insights">
              <div className="flex flex-col gap-2">
                {memory.map((m) => (
                  <div key={m.id} className="flex items-start gap-1.5">
                    <AIIndicator label={m.confidence ? `${Math.round(m.confidence * 100)}%` : "AI"} />
                    <p className="text-[12px] text-muted-foreground">{m.value}</p>
                  </div>
                ))}
              </div>
            </InfoBlock>
          )}

          <Link href={`/customers/${customer.id}`} className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 text-[12px] text-muted-foreground hover:border-border-strong hover:text-foreground">
            View full customer profile
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function InfoBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 py-1.5 text-[12px] last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{children}</span>
    </div>
  );
}
