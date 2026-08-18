import { Badge } from "@/components/ui/badge";
import {
  leadStageMeta,
  dealStageMeta,
  ticketStatusMeta,
  ticketPriorityMeta,
  approvalRiskMeta,
  healthCategoryMeta,
} from "@/lib/status-meta";
import type {
  LeadStage,
  DealStage,
  TicketStatus,
  TicketPriority,
  ApprovalRisk,
  HealthCategory,
} from "@/lib/types";
import { cn } from "@/lib/utils";

export function LeadStageBadge({ stage, className }: { stage: LeadStage; className?: string }) {
  const meta = leadStageMeta[stage];
  return (
    <Badge variant={meta.tone} className={className}>
      {meta.label}
    </Badge>
  );
}

export function DealStageBadge({ stage, className }: { stage: DealStage; className?: string }) {
  const meta = dealStageMeta[stage];
  return (
    <Badge variant={meta.tone} className={className}>
      {meta.label}
    </Badge>
  );
}

export function TicketStatusBadge({ status, className }: { status: TicketStatus; className?: string }) {
  const meta = ticketStatusMeta[status];
  return (
    <Badge variant={meta.tone} className={className}>
      {meta.label}
    </Badge>
  );
}

export function TicketPriorityBadge({ priority, className }: { priority: TicketPriority; className?: string }) {
  const meta = ticketPriorityMeta[priority];
  return (
    <Badge variant={meta.tone} className={className}>
      {meta.label}
    </Badge>
  );
}

export function ApprovalRiskBadge({ risk, className }: { risk: ApprovalRisk; className?: string }) {
  const meta = approvalRiskMeta[risk];
  return (
    <Badge variant={meta.tone} className={className}>
      {meta.label}
    </Badge>
  );
}

export function HealthBadge({ category, score, className }: { category: HealthCategory; score?: number; className?: string }) {
  const meta = healthCategoryMeta[category];
  return (
    <Badge variant={meta.tone} className={cn("text-mono", className)}>
      {typeof score === "number" ? `${score} · ` : ""}
      {meta.label}
    </Badge>
  );
}

export function DotStatus({ tone, label }: { tone: "success" | "warning" | "danger" | "accent" | "neutral"; label: string }) {
  const dot =
    tone === "success"
      ? "bg-success"
      : tone === "warning"
        ? "bg-warning"
        : tone === "danger"
          ? "bg-danger"
          : tone === "accent"
            ? "bg-accent"
            : "bg-muted-foreground";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("size-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}
