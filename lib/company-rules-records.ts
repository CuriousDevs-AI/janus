"use client";

import { api, message } from "@/lib/api/client";
import { demoMode } from "@/lib/demo-mode";
import { usePeriodLockStore } from "@/lib/stores/period-lock-store";
import { type WorkflowRules, useWorkflowRulesStore } from "@/lib/stores/workflow-rules-store";

/**
 * The period lock and the approval and matching rules are kept on the server, per company. The owner
 * sets them there; the screens read them so the same checks run on screen and on the server.
 * Demo mode keeps the local settings.
 */

interface ServerRules {
  locked_through: string | null;
  adjustment_approval_value_paise: number;
  match_tolerance_percent: number;
}

function apply(rules: ServerRules) {
  usePeriodLockStore.setState({ lockedThrough: rules.locked_through });
  useWorkflowRulesStore.setState({
    adjustmentApprovalValue: rules.adjustment_approval_value_paise / 100,
    matchTolerancePercent: rules.match_tolerance_percent,
  });
}

/** Loads the company's period lock and rules from the server. */
export async function syncCompanyRules(): Promise<void> {
  if (demoMode) return;
  apply(await api<ServerRules>("/company-rules"));
}

async function save(patch: Partial<{ lockedThrough: string | null; adjustmentApprovalValue: number; matchTolerancePercent: number }>): Promise<string | null> {
  const current = {
    lockedThrough: usePeriodLockStore.getState().lockedThrough,
    ...useWorkflowRulesStore.getState(),
  };
  const next = { ...current, ...patch };
  try {
    const saved = await api<ServerRules>("/company-rules", {
      method: "PUT",
      body: JSON.stringify({
        locked_through: next.lockedThrough,
        adjustment_approval_value_paise: Math.round(next.adjustmentApprovalValue * 100),
        match_tolerance_percent: next.matchTolerancePercent,
      }),
    });
    apply(saved);
    // Read the rules back, so the screen shows what the server now holds.
    await syncCompanyRules();
    return null;
  } catch (error: unknown) {
    return message(error);
  }
}

/** Sets the period lock. The server allows only the owner; null reopens the books. */
export async function setPeriodLock(date: string | null, isOwner: boolean): Promise<string | null> {
  if (demoMode) return usePeriodLockStore.getState().setLockedThrough(date, isOwner);
  if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "Enter a valid date.";
  return save({ lockedThrough: date });
}

/** Sets one of the workflow rules. The server allows only the owner. */
export async function setWorkflowRule(key: keyof WorkflowRules, value: number, isOwner: boolean): Promise<string | null> {
  if (demoMode) return useWorkflowRulesStore.getState().setRule(key, value, isOwner);
  if (key === "adjustmentApprovalValue" && !(value >= 0 && value <= 10000000)) return "Enter a value between 0 and 1,00,00,000.";
  if (key === "matchTolerancePercent" && !(value >= 0 && value <= 10)) return "The tolerance must be between 0% and 10%.";
  return save({ [key]: value });
}
