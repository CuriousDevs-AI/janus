"use client";

import * as React from "react";
import { use } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, ScrollText, TrendingUp, Sparkles, ExternalLink, CheckCircle2, XCircle } from "lucide-react";
import { useAppStore } from "@/lib/stores/app-store";
import { getCustomerById, getCompanyById, getUserById, currentUser } from "@/lib/mock-data";
import { CustomerAvatar } from "@/components/shared/customer-avatar";
import { ApprovalRiskBadge } from "@/components/shared/status-badge";
import { ActionKindBadge } from "@/components/approvals/action-kind-badge";
import { RequestedBy } from "@/components/approvals/requested-by";
import { formatCurrencyINR, formatRelativeTime, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function ApprovalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const approval = useAppStore((s) => s.approvals.find((a) => a.id === id));
  const decideApproval = useAppStore((s) => s.decideApproval);

  if (!approval) {
    return (
      <div className="mx-auto flex max-w-[1100px] flex-col items-center gap-2 px-6 py-16 text-center">
        <p className="text-[14px] font-medium text-foreground">Approval not found</p>
        <Button size="sm" variant="secondary" asChild>
          <Link href="/approvals">Back to approvals</Link>
        </Button>
      </div>
    );
  }

  const customer = getCustomerById(approval.customerId);
  const company = customer ? getCompanyById(customer.companyId) : undefined;
  const decider = approval.decidedById ? (getUserById(approval.decidedById) ?? currentUser) : undefined;
  const isPending = approval.status === "pending";

  function handleDecision(decision: "approved" | "rejected") {
    decideApproval(approval!.id, decision);
    toast.success(decision === "approved" ? "Approval granted" : "Approval rejected", {
      description: approval!.actionLabel,
    });
  }

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5 px-6 py-6">
      <Link
        href="/approvals"
        className="inline-flex w-fit items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        All approvals
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-border bg-surface p-5">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <ActionKindBadge kind={approval.actionKind} />
            <ApprovalRiskBadge risk={approval.risk} />
          </div>
          <h1 className="text-[20px] font-semibold leading-snug text-foreground">{approval.actionLabel}</h1>
          {typeof approval.amount === "number" && (
            <span className="text-mono text-[18px] font-semibold text-foreground">
              {formatCurrencyINR(approval.amount)}
            </span>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          {isPending ? (
            <div className="flex items-center gap-2">
              <Button variant="destructive" onClick={() => handleDecision("rejected")}>
                <XCircle className="size-3.5" />
                Reject
              </Button>
              <Button onClick={() => handleDecision("approved")}>
                <CheckCircle2 className="size-3.5" />
                Approve
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-end gap-1">
              <Badge variant={approval.status === "approved" ? "success" : "danger"} className="capitalize">
                {approval.status}
              </Badge>
              {approval.decidedAt && (
                <span className="text-[11px] text-muted-foreground">
                  Decided by {decider?.name ?? currentUser.name} · {formatRelativeTime(approval.decidedAt)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px]">
        {/* LEFT */}
        <div className="flex flex-col gap-4">
          <InfoBlock title="Policy">
            <p className="flex items-start gap-2 text-[13px] leading-relaxed text-foreground">
              <ScrollText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              {approval.policy}
            </p>
          </InfoBlock>

          <div className="rounded-lg border border-accent-border bg-accent-muted p-4">
            <div className="mb-2 flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-accent" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-accent">
                {approval.requestedByType === "ai" ? "AI reasoning" : "Requester's reasoning"}
              </span>
            </div>
            <p className="text-[13px] leading-relaxed text-foreground">{approval.reasoning}</p>
          </div>

          <InfoBlock title="Expected impact">
            <p className="flex items-start gap-2 text-[13px] leading-relaxed text-foreground">
              <TrendingUp className="mt-0.5 size-3.5 shrink-0 text-success" />
              {approval.expectedImpact}
            </p>
          </InfoBlock>

          {(approval.relatedDealId || approval.relatedConversationId) && (
            <InfoBlock title="Related">
              <div className="flex flex-col gap-2">
                {approval.relatedDealId && (
                  <Link
                    href={`/deals/${approval.relatedDealId}`}
                    className="flex items-center justify-between rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-foreground hover:border-border-strong hover:text-accent"
                  >
                    View the related deal
                    <ExternalLink className="size-3.5 text-muted-foreground" />
                  </Link>
                )}
                {approval.relatedConversationId && (
                  <Link
                    href="/inbox"
                    className="flex items-center justify-between rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-foreground hover:border-border-strong hover:text-accent"
                  >
                    Referenced in a conversation — open Inbox
                    <ExternalLink className="size-3.5 text-muted-foreground" />
                  </Link>
                )}
              </div>
            </InfoBlock>
          )}

          {!isPending && (
            <Link
              href="/audit"
              className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 text-[12px] text-muted-foreground hover:border-border-strong hover:text-foreground"
            >
              This became part of the audit trail
              <ExternalLink className="size-3.5" />
            </Link>
          )}
        </div>

        {/* RIGHT */}
        <div className="flex flex-col gap-4">
          {customer && (
            <InfoBlock title="Customer">
              <div className="flex items-center gap-2">
                <CustomerAvatar name={customer.name} color={customer.avatarColor} />
                <div>
                  <Link
                    href={`/customers/${customer.id}`}
                    className="text-[13px] font-medium text-foreground hover:text-accent"
                  >
                    {customer.name}
                  </Link>
                  <p className="text-[11px] text-muted-foreground">{company?.name}</p>
                </div>
              </div>
            </InfoBlock>
          )}

          <InfoBlock title="Request details">
            <Row label="Requested by">
              <RequestedBy approval={approval} />
            </Row>
            <Row label="Requested">{formatDateTime(approval.requestedAt)}</Row>
            <Row label="Risk">
              <ApprovalRiskBadge risk={approval.risk} />
            </Row>
            {typeof approval.amount === "number" && <Row label="Amount">{formatCurrencyINR(approval.amount)}</Row>}
          </InfoBlock>
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
