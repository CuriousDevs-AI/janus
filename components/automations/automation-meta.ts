import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";
import type { Automation, AutomationRun } from "@/lib/types";

type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

export const automationStatusMeta: Record<Automation["status"], { label: string; tone: BadgeTone }> = {
  active: { label: "Active", tone: "success" },
  disabled: { label: "Disabled", tone: "neutral" },
  draft: { label: "Draft", tone: "warning" },
};

export const automationRunStatusMeta: Record<AutomationRun["status"], { label: string; tone: BadgeTone }> = {
  success: { label: "Success", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  running: { label: "Running", tone: "accent" },
  waiting: { label: "Waiting", tone: "warning" },
};
