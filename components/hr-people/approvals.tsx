"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { useHrOperationsStore } from "@/lib/stores/hr-operations-store";
import { canDecide } from "@/lib/hr-leave";
import { useLeaveTypes } from "@/lib/hr-leave-hooks";
import { canDecideExpense, expenseLabels } from "@/components/hr-people/expenses";
import { HrEmpty, HrPanel, HrStats, HrStatus, hrDate, hrMoney, hrToday } from "@/components/hr-people/operations-ui";
import type { HrDemoRole } from "@/lib/types";

/** One queue of everything waiting on this person. Decisions happen in the owning screen so the rules stay in one place. */
export function HrApprovalsView({ role, actorId }: { role: HrDemoRole; actorId: string }) {
  const { employees, leaveRequests, expenseClaims } = useHrPeopleStore();
  const { settings, regularisations } = useHrOperationsStore();
  const types = useLeaveTypes();
  const today = hrToday();
  const managesAny = employees.some((item) => item.managerId === actorId);
  const leaves = leaveRequests.filter((item) => canDecide(item, actorId, role, settings, today).allowed);
  const expenses = expenseClaims.filter((item) => canDecideExpense(item, employees.find((person) => person.id === item.employeeId), actorId, role, managesAny).allowed);
  const fixes = regularisations.filter((item) => item.status === "pending" && item.employeeId !== actorId && employees.find((person) => person.id === item.employeeId)?.managerId === actorId || (item.status === "pending" && item.employeeId !== actorId && (role === "owner" || role === "hr_manager")));
  const total = leaves.length + expenses.length + fixes.length;
  const name = (id: string) => employees.find((item) => item.id === id)?.name ?? id;
  return <div className="space-y-5">
    <HrStats items={[{ label: "Waiting for you", value: total, hint: "Across leave, expenses and corrections" }, { label: "Leave requests", value: leaves.length, hint: "Approve, clarify or reject" }, { label: "Expense claims", value: expenses.length, hint: "Approve, reject or mark paid" }, { label: "Attendance corrections", value: fixes.length, hint: "Approve or reject" }]} />
    <HrPanel title="Pending approvals" description="Only items you are allowed to decide appear here.">
      {total ? <ul className="divide-y divide-border text-sm">
        {leaves.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"><div><p className="font-medium">{item.employeeName} · {types.name(item.type)} leave</p><p className="text-xs text-muted-foreground">{hrDate(item.from)}{item.to !== item.from ? ` – ${hrDate(item.to)}` : ""} · {item.days} {item.days === 1 ? "day" : "days"}</p></div><div className="flex items-center gap-2"><HrStatus status="pending" /><Button size="sm" asChild><Link href="/workspace/hr-people?view=leave&workspace=hr-people" aria-label={`Review leave request from ${item.employeeName}`}>Review</Link></Button></div></li>)}
        {expenses.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"><div><p className="font-medium">{item.employeeName} · {expenseLabels[item.category]} expense</p><p className="text-xs text-muted-foreground">{hrMoney(item.amount)} · submitted {hrDate(item.submittedAt)}</p></div><div className="flex items-center gap-2"><HrStatus status={item.status === "approved" ? "approved" : "pending"} /><Button size="sm" asChild><Link href="/workspace/hr-people?view=expenses&workspace=hr-people" aria-label={`Review expense from ${item.employeeName}`}>Review</Link></Button></div></li>)}
        {fixes.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"><div><p className="font-medium">{name(item.employeeId)} · attendance correction</p><p className="text-xs text-muted-foreground">{hrDate(item.date)} · {item.reason}</p></div><div className="flex items-center gap-2"><HrStatus status="pending" /><Button size="sm" asChild><Link href="/workspace/hr-people?view=attendance&workspace=hr-people" aria-label={`Review attendance correction from ${name(item.employeeId)}`}>Review</Link></Button></div></li>)}
      </ul> : <HrEmpty>Nothing is waiting for you. New requests from your team appear here.</HrEmpty>}
    </HrPanel>
  </div>;
}
