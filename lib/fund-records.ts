"use client";

import { api, message } from "@/lib/api/client";
import { demoMode } from "@/lib/demo-mode";
import { syncBudgetLines, toPaise } from "@/lib/finance-records";
import { trailEntry, withTrail } from "@/lib/stores/audit-trail";
import { type FundRequest, useFinanceStore } from "@/lib/stores/finance-store";

/**
 * Fund requests are approved on the server. An approval that puts money on a budget line allocates it in
 * the same step, so the balances the screen shows are the server's. Demo mode keeps the local path.
 */

interface ServerFundRequest {
  id: string;
  number: string;
  purpose: string;
  amount_paise: number;
  budget_line_key: string;
  status: FundRequest["status"];
  requested_by: string;
  owner_approved_by: string | null;
  finance_approved_by: string | null;
  rejected_by: string | null;
  rejected_reason: string | null;
  raised_on: string;
}

const toFundRequest = (row: ServerFundRequest): FundRequest => ({
  id: row.id,
  number: row.number,
  purpose: row.purpose,
  amount: row.amount_paise / 100,
  lineId: row.budget_line_key,
  requestedBy: row.requested_by,
  date: row.raised_on,
  status: row.status,
  ownerApprovedBy: row.owner_approved_by ?? undefined,
  financeApprovedBy: row.finance_approved_by ?? undefined,
  rejectedBy: row.rejected_by ?? undefined,
  rejectedReason: row.rejected_reason ?? undefined,
});

function keep(row: ServerFundRequest) {
  const request = toFundRequest(row);
  useFinanceStore.setState((state) => ({
    fundRequests: state.fundRequests.some((item) => item.id === request.id)
      ? state.fundRequests.map((item) => (item.id === request.id ? request : item))
      : [request, ...state.fundRequests],
  }));
}

/** Loads the company's fund requests from the server. */
export async function syncFundRequests(): Promise<void> {
  if (demoMode) return;
  const rows = await api<ServerFundRequest[]>("/finance/fund-requests");
  useFinanceStore.setState({ fundRequests: rows.map(toFundRequest) });
}

export async function addFundRequest(
  input: { purpose: string; amount: number; lineId: string; date: string },
  by: string,
): Promise<string | null> {
  if (demoMode) return useFinanceStore.getState().addFundRequest(input, by) ?? null;
  try {
    const row = await api<ServerFundRequest>("/finance/fund-requests", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({
        key: `fund-${crypto.randomUUID()}`,
        purpose: input.purpose,
        amount_paise: toPaise(input.amount),
        budget_line_key: input.lineId,
      }),
    });
    keep(row);
    useFinanceStore.setState((state) => ({
      trail: withTrail(state.trail, trailEntry("finance", input.date, by, `Requested funds ${row.number} of ₹${input.amount.toLocaleString("en-IN")}: ${input.purpose}`)),
    }));
    return null;
  } catch (error: unknown) {
    return message(error);
  }
}

/** Approves as the owner (step "owner") or as finance (step "finance"). Money is allocated on the server. */
export async function approveFundRequest(id: string, step: "owner" | "finance", by: string): Promise<string | null> {
  if (demoMode) return useFinanceStore.getState().approveFundRequest(id, step, by);
  try {
    const row = await api<ServerFundRequest>(`/finance/fund-requests/${encodeURIComponent(id)}/${step === "owner" ? "owner-approve" : "finance-approve"}`, {
      method: "POST",
    });
    keep(row);
    await syncBudgetLines();
    useFinanceStore.setState((state) => ({
      trail: withTrail(state.trail, trailEntry("finance", row.raised_on, by, `${step === "owner" ? "Owner" : "Finance"} approved ${row.number}`)),
    }));
    return null;
  } catch (error: unknown) {
    return message(error);
  }
}

export async function rejectFundRequest(id: string, reason: string, by: string): Promise<string | null> {
  if (demoMode) {
    useFinanceStore.getState().rejectFundRequest(id, reason, by);
    return null;
  }
  try {
    const row = await api<ServerFundRequest>(`/finance/fund-requests/${encodeURIComponent(id)}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason: reason.trim() }),
    });
    keep(row);
    useFinanceStore.setState((state) => ({
      trail: withTrail(state.trail, trailEntry("finance", row.raised_on, by, `Rejected ${row.number}: ${reason.trim()}`)),
    }));
    return null;
  } catch (error: unknown) {
    return message(error);
  }
}
