import type { ComponentType } from "react";
import type { VariantProps } from "class-variance-authority";
import { Globe, Webhook, Fingerprint, Key, PenLine, FileSpreadsheet, CheckCircle2, XCircle, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { badgeVariants } from "@/components/ui/badge";
import type { LeadSourceConnection, IngestionResult } from "@/lib/types";

type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

export const sourceStatusMeta: Record<LeadSourceConnection["status"], { label: string; tone: BadgeTone }> = {
  connected: { label: "Connected", tone: "success" },
  available: { label: "Not connected", tone: "neutral" },
  error: { label: "Needs attention", tone: "danger" },
};

export function SourceStatusBadge({ status, className }: { status: LeadSourceConnection["status"]; className?: string }) {
  const meta = sourceStatusMeta[status];
  return (
    <Badge variant={meta.tone} className={className}>
      {meta.label}
    </Badge>
  );
}

export const connectionKindMeta: Record<LeadSourceConnection["connectionKind"], { label: string; icon: ComponentType<{ className?: string }> }> = {
  embed: { label: "Embed snippet", icon: Globe },
  webhook: { label: "Webhook", icon: Webhook },
  oauth: { label: "Connected account", icon: Fingerprint },
  api_key: { label: "API key", icon: Key },
  manual: { label: "Manual / no connection", icon: PenLine },
  csv: { label: "File import", icon: FileSpreadsheet },
};

export const ingestionResultMeta: Record<IngestionResult, { label: string; tone: BadgeTone; icon: ComponentType<{ className?: string }> }> = {
  new_profile: { label: "New profile", tone: "success", icon: CheckCircle2 },
  merged: { label: "Merged", tone: "accent", icon: Fingerprint },
  duplicate_ignored: { label: "Duplicate ignored", tone: "neutral", icon: Circle },
  failed: { label: "Failed", tone: "danger", icon: XCircle },
};

export function IngestionResultBadge({ result, className }: { result: IngestionResult; className?: string }) {
  const meta = ingestionResultMeta[result];
  return (
    <Badge variant={meta.tone} className={className}>
      {meta.label}
    </Badge>
  );
}
