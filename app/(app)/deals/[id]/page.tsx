"use client";

import * as React from "react";
import { use } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { MessageSquare, MoreHorizontal, Sparkles, FileText, Send, CheckCircle2, Circle } from "lucide-react";
import { useAppStore, useCompany } from "@/lib/stores/app-store";
import { users, getMemoryForCustomer } from "@/lib/mock-data";
import { CustomerAvatar } from "@/components/shared/customer-avatar";
import { DealStageBadge, ApprovalRiskBadge } from "@/components/shared/status-badge";
import { ChannelBadge } from "@/components/shared/channel-badge";
import { ActivityTimeline } from "@/components/shared/activity-timeline";
import { dealStageOrder, dealStageMeta } from "@/lib/status-meta";
import { formatCurrencyINR, formatDate, formatRelativeTime, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const deal = useAppStore((s) => s.deals.find((d) => d.id === id));
  const customer = useAppStore((s) => s.customers.find((c) => c.id === deal?.customerId));
  const allActivities = useAppStore((s) => s.activities);
  const allConversations = useAppStore((s) => s.conversations);
  const allApprovals = useAppStore((s) => s.approvals);
  const activities = allActivities.filter((a) => a.customerId === deal?.customerId);
  const conversations = allConversations.filter((c) => c.customerId === deal?.customerId);
  const approvals = allApprovals.filter((a) => a.relatedDealId === deal?.id);
  const moveDealStage = useAppStore((s) => s.moveDealStage);
  const addActivity = useAppStore((s) => s.addActivity);
  const company = useCompany(customer?.companyId);
  const [proposalSent, setProposalSent] = React.useState(false);

  if (!deal || !customer) {
    return (
      <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-2 px-6 py-16 text-center">
        <p className="text-[14px] font-medium text-foreground">Deal not found</p>
        <Button size="sm" variant="secondary" asChild>
          <Link href="/deals">Back to deals</Link>
        </Button>
      </div>
    );
  }

  const owner = users.find((u) => u.id === deal.ownerId);
  const sortedActivities = [...activities].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const doneTasks = deal.tasks.filter((t) => t.done).length;

  return (
    <div className="mx-auto flex max-w-[1300px] flex-col gap-5 px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[22px] font-semibold tracking-tight text-foreground">{deal.name}</h1>
            <DealStageBadge stage={deal.stage} />
          </div>
          <Link href={`/customers/${customer.id}`} className="text-[13px] text-muted-foreground hover:text-accent">
            {customer.name} · {company?.name}
          </Link>
          <div className="mt-2 flex items-center gap-4">
            <span className="text-mono text-[20px] font-semibold text-foreground">{formatCurrencyINR(deal.amount)}</span>
            <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              Probability
              <Progress value={deal.probability} className="w-24" />
              {deal.probability}%
            </span>
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
              <Button size="sm">Move stage</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {dealStageOrder.map((s) => (
                <DropdownMenuItem key={s} disabled={s === deal.stage} onSelect={() => moveDealStage(deal.id, s)}>
                  {dealStageMeta[s].label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => moveDealStage(deal.id, "lost")} variant="destructive">
                Mark as Lost
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="communication">Communication</TabsTrigger>
          <TabsTrigger value="activities">Activities</TabsTrigger>
          <TabsTrigger value="proposal">Proposal</TabsTrigger>
          <TabsTrigger value="approvals">Approvals {approvals.length > 0 && <Badge variant="warning" className="ml-1">{approvals.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="ai">AI Context</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid grid-cols-1 gap-4 pt-4 lg:grid-cols-3">
          <div className="rounded-lg border border-border bg-surface p-4 lg:col-span-2">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Deal information</p>
            <div className="grid grid-cols-2 gap-y-2 text-[12.5px]">
              <span className="text-muted-foreground">Pipeline</span><span className="text-foreground">Sales</span>
              <span className="text-muted-foreground">Stage</span><span className="text-foreground">{dealStageMeta[deal.stage].label}</span>
              <span className="text-muted-foreground">Amount</span><span className="text-foreground">{formatCurrencyINR(deal.amount)}</span>
              <span className="text-muted-foreground">Probability</span><span className="text-foreground">{deal.probability}%</span>
              <span className="text-muted-foreground">Expected close</span><span className="text-foreground">{formatDate(deal.expectedCloseAt)}</span>
              <span className="text-muted-foreground">Owner</span><span className="text-foreground">{owner?.name}</span>
              <span className="text-muted-foreground">Created</span><span className="text-foreground">{formatDate(deal.createdAt)}</span>
              {deal.lostReason && (<><span className="text-muted-foreground">Lost reason</span><span className="text-danger">{deal.lostReason}</span></>)}
            </div>

            <p className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tasks ({doneTasks}/{deal.tasks.length})</p>
            <div className="flex flex-col gap-1.5">
              {deal.tasks.map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-[12.5px]">
                  {t.done ? <CheckCircle2 className="size-3.5 text-success" /> : <Circle className="size-3.5 text-muted-foreground" />}
                  <span className={t.done ? "text-muted-foreground line-through" : "text-foreground"}>{t.title}</span>
                </div>
              ))}
              {deal.tasks.length === 0 && <p className="text-[12px] text-muted-foreground">No tasks yet.</p>}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Customer</p>
              <div className="flex items-center gap-2">
                <CustomerAvatar name={customer.name} color={customer.avatarColor} />
                <div>
                  <Link href={`/customers/${customer.id}`} className="text-[13px] font-medium text-foreground hover:text-accent">
                    {customer.name}
                  </Link>
                  <p className="text-[11px] text-muted-foreground">{company?.name}</p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-accent-border bg-accent-muted p-4">
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
                <Sparkles className="size-3.5" /> Next action
              </p>
              <p className="text-[13px] text-foreground">{deal.nextAction ?? "No recommended action."}</p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="communication" className="flex flex-col gap-2 pt-4">
          {conversations.length === 0 && <p className="text-[12px] text-muted-foreground">No conversations yet for this customer.</p>}
          {conversations.map((c) => (
            <Link key={c.id} href="/inbox" className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 hover:border-border-strong">
              <ChannelBadge channel={c.channel} iconOnly className="text-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-foreground">{c.subject}</p>
                <p className="truncate text-[12px] text-muted-foreground">{c.lastMessagePreview}</p>
              </div>
              <span className="shrink-0 text-[11px] text-muted-foreground">{formatRelativeTime(c.lastMessageAt)}</span>
            </Link>
          ))}
        </TabsContent>

        <TabsContent value="activities" className="pt-4">
          <div className="rounded-lg border border-border bg-surface px-4 py-3">
            <ActivityTimeline activities={sortedActivities} groupByDay />
          </div>
        </TabsContent>

        <TabsContent value="proposal" className="pt-4">
          <div className="mx-auto max-w-xl rounded-lg border border-border bg-surface p-6">
            <div className="mb-4 flex items-center gap-2">
              <FileText className="size-4 text-accent" />
              <span className="text-[14px] font-semibold text-foreground">{deal.name} — Proposal</span>
            </div>
            <div className="flex flex-col gap-2 text-[13px]">
              <div className="flex justify-between border-b border-border py-2">
                <span className="text-muted-foreground">Customer</span>
                <span className="text-foreground">{company?.name}</span>
              </div>
              <div className="flex justify-between border-b border-border py-2">
                <span className="text-muted-foreground">Plan</span>
                <span className="text-foreground">Enterprise</span>
              </div>
              <div className="flex justify-between border-b border-border py-2">
                <span className="text-muted-foreground">Annual value</span>
                <span className="text-mono text-foreground">{formatCurrencyINR(deal.amount)}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground">Term</span>
                <span className="text-foreground">12 months, annual billing</span>
              </div>
            </div>
            <Button
              className="mt-5 w-full"
              disabled={proposalSent}
              onClick={() => {
                setProposalSent(true);
                addActivity(customer.id, "proposal_sent", { type: "human", userId: "u-1", userName: "Pankaj" }, `Proposal sent — ${deal.name}`, {
                  relatedId: deal.id,
                  relatedKind: "deal",
                });
                toast.success("Proposal sent", { description: `${company?.name} will receive it by email.` });
              }}
            >
              <Send className="size-3.5" />
              {proposalSent ? "Proposal sent" : "Send Proposal"}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="approvals" className="flex flex-col gap-2 pt-4">
          {approvals.length === 0 && <p className="text-[12px] text-muted-foreground">No approval requests linked to this deal.</p>}
          {approvals.map((a) => (
            <Link key={a.id} href={`/approvals/${a.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3 hover:border-border-strong">
              <div>
                <p className="text-[13px] text-foreground">{a.actionLabel}</p>
                <p className="text-[11px] text-muted-foreground">Requested {formatRelativeTime(a.requestedAt)}</p>
              </div>
              <div className="flex items-center gap-2">
                <ApprovalRiskBadge risk={a.risk} />
                <Badge variant={a.status === "approved" ? "success" : a.status === "rejected" ? "danger" : "warning"}>{a.status}</Badge>
              </div>
            </Link>
          ))}
        </TabsContent>

        <TabsContent value="ai" className="pt-4">
          <div className="rounded-lg border border-accent-border bg-accent-muted p-4">
            <div className="mb-2 flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-accent" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-accent">AI reasoning</span>
            </div>
            <p className="text-[13px] leading-relaxed text-foreground">
              This deal is at <strong>{dealStageMeta[deal.stage].label}</strong> with {deal.probability}% probability. Based on{" "}
              {sortedActivities.length} recorded interactions, AI recommends: {deal.nextAction ?? "continue standard follow-up cadence."}
            </p>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            {getMemoryForCustomer(customer.id)
              .filter((m) => m.kind === "derived_insight")
              .map((m) => (
                <div key={m.id} className="flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2.5">
                  <Badge variant="accent">{m.confidence ? `${Math.round(m.confidence * 100)}%` : "AI"}</Badge>
                  <p className="text-[12.5px] text-muted-foreground">{m.value}</p>
                </div>
              ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
