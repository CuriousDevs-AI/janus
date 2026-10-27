"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { workspaceStorage } from "@/lib/stores/workspace-storage";
import { scoped } from "@/lib/company";

/**
 * Operations workflow rules (research: cycle-count approval thresholds, three-way match tolerance). The owner sets
 * the values; the stock adjustment and bill matching rules read them. Each company keeps its own rules.
 */

export interface WorkflowRules {
  /** A stock adjustment worth more than this needs approval by someone other than the requester. */
  adjustmentApprovalValue: number;
  /** A bill may differ from the goods received by this share and still match. */
  matchTolerancePercent: number;
}

export const DEFAULT_WORKFLOW_RULES: WorkflowRules = { adjustmentApprovalValue: 10000, matchTolerancePercent: 2 };

interface WorkflowRulesState extends WorkflowRules {
  setRule: (key: keyof WorkflowRules, value: number, isOwner: boolean) => string | null;
}

export const useWorkflowRulesStore = create<WorkflowRulesState>()(
  persist(
    (set) => ({
      ...DEFAULT_WORKFLOW_RULES,
      setRule: (key, value, isOwner) => {
        if (!isOwner) return "Only the owner can change workflow rules.";
        if (key === "adjustmentApprovalValue" && !(value >= 0 && value <= 10000000)) return "Enter a value between 0 and 1,00,00,000.";
        if (key === "matchTolerancePercent" && !(value >= 0 && value <= 10)) return "The tolerance must be between 0% and 10%.";
        set({ [key]: value } as Partial<WorkflowRulesState>);
        return null;
      },
    }),
    { name: scoped("janus.workflow-rules.v1"), storage: createJSONStorage(() => workspaceStorage) },
  ),
);

/** The rules as they stand, read outside React (in the stores). */
export const workflowRules = (): WorkflowRules => {
  const { adjustmentApprovalValue, matchTolerancePercent } = useWorkflowRulesStore.getState();
  return { adjustmentApprovalValue, matchTolerancePercent };
};
