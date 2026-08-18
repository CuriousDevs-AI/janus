import type { VariantProps } from "class-variance-authority";
import { Badge } from "@/components/ui/badge";
import type { badgeVariants } from "@/components/ui/badge";
import type { Agent, AgentType, AgentVersion, EvaluationRun } from "@/lib/types";

type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

export const agentTypeMeta: Record<AgentType, { label: string; tone: BadgeTone }> = {
  sales: { label: "Sales", tone: "accent" },
  support: { label: "Support", tone: "info" },
  qualification: { label: "Qualification", tone: "success" },
  analyst: { label: "Analyst", tone: "outline" },
};

export const agentStatusMeta: Record<Agent["status"], { label: string; tone: BadgeTone }> = {
  active: { label: "Active", tone: "success" },
  paused: { label: "Paused", tone: "neutral" },
  training: { label: "Training", tone: "warning" },
};

export const evaluationVerdictMeta: Record<EvaluationRun["verdict"], { label: string; tone: BadgeTone }> = {
  pass: { label: "Pass", tone: "success" },
  regression: { label: "Regression", tone: "danger" },
  warning: { label: "Warning", tone: "warning" },
};

export const versionStatusMeta: Record<AgentVersion["status"], { label: string; tone: BadgeTone }> = {
  current: { label: "Current", tone: "accent" },
  previous: { label: "Previous", tone: "neutral" },
  archived: { label: "Archived", tone: "outline" },
};

export function AgentTypeBadge({ type, className }: { type: AgentType; className?: string }) {
  const meta = agentTypeMeta[type];
  return (
    <Badge variant={meta.tone} className={className}>
      {meta.label}
    </Badge>
  );
}

export function AgentStatusBadge({ status, className }: { status: Agent["status"]; className?: string }) {
  const meta = agentStatusMeta[status];
  return (
    <Badge variant={meta.tone} className={className}>
      {meta.label}
    </Badge>
  );
}

export function VerdictBadge({ verdict, className }: { verdict: EvaluationRun["verdict"]; className?: string }) {
  const meta = evaluationVerdictMeta[verdict];
  return (
    <Badge variant={meta.tone} className={className}>
      {meta.label}
    </Badge>
  );
}

export function VersionStatusBadge({ status, className }: { status: AgentVersion["status"]; className?: string }) {
  const meta = versionStatusMeta[status];
  return (
    <Badge variant={meta.tone} className={className}>
      {meta.label}
    </Badge>
  );
}
