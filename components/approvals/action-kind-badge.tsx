import { Badge } from "@/components/ui/badge";
import type { Approval } from "@/lib/types";

export const actionKindLabels: Record<Approval["actionKind"], string> = {
  discount: "Discount",
  refund: "Refund",
  contract_action: "Contract Action",
  sensitive_message: "Sensitive Message",
  deal_stage: "Deal Stage",
  deletion: "Deletion",
};

export function ActionKindBadge({ kind, className }: { kind: Approval["actionKind"]; className?: string }) {
  return (
    <Badge variant="outline" className={className}>
      {actionKindLabels[kind]}
    </Badge>
  );
}
