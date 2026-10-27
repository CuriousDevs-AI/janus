"use client";

import * as React from "react";
import { toast } from "sonner";
import { useSession } from "@/components/auth/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFinanceStore } from "@/lib/stores/finance-store";
import { useOperationsStore } from "@/lib/stores/operations-store";
import { useProjectsStore } from "@/lib/stores/projects-store";

/**
 * One queue for every money, stock and project approval waiting for a decision (plan §8.6).
 * Each decision goes through the same store action as its own page, so the rules (no approving your
 * own request, a different approver for the second step) are enforced in one place.
 */

interface QueueItem {
  key: string;
  module: "Finance" | "Operations" | "Projects";
  title: string;
  amount: number | null;
  requester: string;
  reason: string;
  date: string;
  waitingFor: string;
  approve: (by: string) => string | null;
  reject?: (by: string) => string | null;
}

const inr = (value: number) => `₹${value.toLocaleString("en-IN")}`;

export function MoneyApprovalsQueue() {
  const session = useSession();
  const me = session.user.name ?? session.user.email ?? "You";
  const creditNotes = useFinanceStore((state) => state.creditNotes);
  const fundRequests = useFinanceStore((state) => state.fundRequests);
  const approveCreditNote = useFinanceStore((state) => state.decideCreditNote);
  const rejectCreditNote = useFinanceStore((state) => state.rejectCreditNote);
  const approveFund = useFinanceStore((state) => state.approveFundRequest);
  const rejectFund = useFinanceStore((state) => state.rejectFundRequest);
  const adjustments = useOperationsStore((state) => state.adjustments);
  const items = useOperationsStore((state) => state.items);
  const approveAdjustment = useOperationsStore((state) => state.approveAdjustment);
  const rejectAdjustment = useOperationsStore((state) => state.rejectAdjustment);
  const changes = useProjectsStore((state) => state.changes);
  const projects = useProjectsStore((state) => state.projects);
  const decideChange = useProjectsStore((state) => state.decideChange);

  const queue: QueueItem[] = [
    ...fundRequests
      .filter((f) => f.status === "pending" || f.status === "awaiting_finance")
      .map((f) => ({
        key: `fund-${f.id}`,
        module: "Finance" as const,
        title: `Fund request ${f.number}`,
        amount: f.amount,
        requester: f.requestedBy,
        reason: f.purpose,
        date: f.date,
        waitingFor: f.status === "pending" ? "Owner" : "Finance",
        approve: (by: string) => approveFund(f.id, f.status === "pending" ? "owner" : "finance", by),
        reject: (by: string) => { rejectFund(f.id, "Rejected from the approvals queue", by); return null; },
      })),
    ...creditNotes
      .filter((c) => c.status === "pending")
      .map((c) => ({
        key: `cn-${c.id}`,
        module: "Finance" as const,
        title: `Credit note ${c.number}`,
        amount: c.amount,
        requester: c.createdBy,
        reason: c.reason,
        date: c.date,
        waitingFor: "Approver",
        approve: (by: string) => approveCreditNote(c.id, by),
        reject: (by: string) => rejectCreditNote(c.id, "Rejected from the approvals queue", by),
      })),
    ...adjustments
      .filter((a) => a.status === "pending")
      .map((a) => ({
        key: `adj-${a.id}`,
        module: "Operations" as const,
        title: `Stock adjustment: ${a.qty > 0 ? "+" : ""}${a.qty} ${items.find((i) => i.id === a.itemId)?.name ?? "item"}`,
        amount: a.value,
        requester: a.by,
        reason: a.reason,
        date: a.date,
        waitingFor: "Approver",
        approve: (by: string) => approveAdjustment(a.id, by),
        reject: (by: string) => rejectAdjustment(a.id, "Rejected from the approvals queue", by),
      })),
    ...changes
      .filter((c) => c.status === "pending")
      .map((c) => ({
        key: `chg-${c.id}`,
        module: "Projects" as const,
        title: `Change: ${projects.find((p) => p.id === c.projectId)?.name ?? "project"}`,
        amount: c.budgetChange,
        requester: c.requestedBy,
        reason: `${c.description} · ${c.dayChange >= 0 ? "+" : ""}${c.dayChange} days`,
        date: "",
        waitingFor: "Approver",
        approve: (by: string) => decideChange(c.id, true, by),
        reject: (by: string) => decideChange(c.id, false, by),
      })),
  ];

  function decide(problem: string | null, success: string) {
    if (problem) toast.error(problem);
    else toast.success(success);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Waiting for a decision <span className="text-sm font-normal text-muted-foreground">· {queue.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <p className="text-xs text-muted-foreground">
          Finance, stock and project approvals in one place. You cannot approve something you requested.
        </p>
        {queue.length === 0 ? <p className="text-muted-foreground">Nothing is waiting for a decision.</p> : null}
        {queue.map((item) => (
          <div key={item.key} className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3 last:border-0">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {item.title}
                <Badge variant="neutral" className="ml-2">{item.module}</Badge>
              </p>
              <p className="text-xs text-muted-foreground">
                {item.amount !== null ? `${inr(Math.abs(item.amount))} · ` : ""}requested by {item.requester}{item.date ? ` · ${item.date}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">{item.reason}</p>
              <p className="text-xs text-muted-foreground">Waiting for: {item.waitingFor}</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => decide(item.approve(me), `${item.title} approved`)}>Approve</Button>
              {item.reject ? <Button size="sm" variant="outline" onClick={() => decide(item.reject?.(me) ?? null, `${item.title} rejected`)}>Reject</Button> : null}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
