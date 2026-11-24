import { titleCase } from "@/lib/utils";

export const LEAD_STAGES = [
  "new",
  "contacted",
  "qualified",
  "converted",
  "lost",
] as const;

export type LeadStage = (typeof LEAD_STAGES)[number];

export const TERMINAL_LEAD_STAGES: readonly string[] = ["converted", "lost"];

export const stageLabel = titleCase;

export function stageBadgeVariant(stage: string): "neutral" | "accent" | "success" | "danger" {
  if (stage === "converted") return "success";
  if (stage === "lost") return "danger";
  if (stage === "new" || stage === "contacted") return "accent";
  return "neutral";
}
