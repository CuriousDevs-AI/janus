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

const daysSince = (date: string) => Math.max(0, Math.floor((new Date(`${hrToday()}T12:00:00`).getTime() - new Date(`${date}T12:00:00`).getTime()) / 86400000));

function AgeBadge({ days, threshold }: { days: number; threshold: number }) {
  const tone = days > threshold + 2 ? "text-danger" : days > threshold ? "text-warning" : "text-muted-foreground";
  return <span className={`text-[11px] ${tone}`}>{days === 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`}</span>;
}

export function HrApprovalsView({ role, actorId }: { role: HrDemoRole; actorId: string }) {
  const { employees, leaveRequests, expenseClaims } = useHrPeopleStore();
  const { settings, regularisations } = useHrOperationsStore();
  const types = useLeaveTypes();
  const today = hrToday();
  const threshold = settings.escalateAfterDays;
  const managesAny = employees.some((item) => item.managerId === actorId);
  const leaves = leaveRequests.filter((item) => canDecide(item, actorId, role, settings, today).allowed);
  const expenses = expenseClaims.filter((item) => canDecideExpense(item, employees.find((person) => person.id === item.employeeId), actorId, role, managesAny).allowed);
  const fixes = regularisations.filter((item) => item.status === "pending" && item.employeeId !== actorId && (employees.find((person) => person.id === item.employeeId)?.managerId === actorId || role === "owner" || role === "hr_manager"));
  const total = leaves.length + expenses.length + fixes.length;

  const leaveAges = leaves.map((item) => daysSince(item.from));
  const expenseAges = expenses.map((item) => daysSince(item.submittedAt));
  const fixAges = fixes.map((item) => daysSince(item.requestedAt));
  const allAges = [...leaveAges, ...expenseAges, ...fixAges];
  const oldest = allAges.length ? Math.max(...allAges) : 0;
  const overdue = allAges.filter((age) => age > threshold).length;

  return <div className="space-y-5">
    <HrStats items={[
      { label: "Waiting for you", value: total, hint: "Across leave, expenses and corrections" },
      { label: "Leave requests", value: leaves.length, hint: "Approve, clarify or reject" },
      { label: "Expense claims", value: expenses.length, hint: "Approve, reject or mark paid" },
      { label: "Attendance corrections", value: fixes.length, hint: "Approve or reject" },
    ]} />
    <HrStats items={[
      { label: "Oldest pending", value: total ? `${oldest} ${oldest === 1 ? "day" : "days"}` : "—", hint: total ? "Since the earliest request" : "Nothing pending" },
      { label: `Overdue (>${threshold} days)`, value: overdue, hint: overdue ? "Should be acted on soon" : "Everything within SLA" },
      { label: "Average wait", value: allAges.length ? `${Math.round(allAges.reduce((s, v) => s + v, 0) / allAges.length)} days` : "—", hint: "Mean time items have been waiting" },
      { label: "Escalation threshold", value: `${threshold} days`, hint: "Set in HR Settings" },
    ]} />

    {leaves.length > 0 && <HrPanel title={`Leave requests · ${leaves.length}`} description="Approve or reject leave. Decisions happen in the leave management screen.">
      <ul className="divide-y divide-border text-sm">
        {leaves.map((item) => { const age = daysSince(item.from); return <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium">{item.employeeName} · {types.name(item.type)} leave</p>
            <p className="text-xs text-muted-foreground">{hrDate(item.from)}{item.to !== item.from ? ` – ${hrDate(item.to)}` : ""} · {item.days} {item.days === 1 ? "day" : "days"}</p>
          </div>
          <div className="flex items-center gap-2">
            <AgeBadge days={age} threshold={threshold} />
            <HrStatus status="pending" />
            <Button size="sm" asChild><Link href="/workspace/hr-people?view=leave&workspace=hr-people" aria-label={`Review leave request from ${item.employeeName}`}>Review</Link></Button>
          </div>
        </li>; })}
      </ul>
    </HrPanel>}

    {expenses.length > 0 && <HrPanel title={`Expense claims · ${expenses.length}`} description="Approve expenses or mark them paid.">
      <ul className="divide-y divide-border text-sm">
        {expenses.map((item) => { const age = daysSince(item.submittedAt); return <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium">{item.employeeName} · {expenseLabels[item.category]} expense</p>
            <p className="text-xs text-muted-foreground">{hrMoney(item.amount)} · submitted {hrDate(item.submittedAt)}</p>
          </div>
          <div className="flex items-center gap-2">
            <AgeBadge days={age} threshold={threshold} />
            <HrStatus status={item.status === "approved" ? "approved" : "pending"} />
            <Button size="sm" asChild><Link href="/workspace/hr-people?view=expenses&workspace=hr-people" aria-label={`Review expense from ${item.employeeName}`}>Review</Link></Button>
          </div>
        </li>; })}
      </ul>
    </HrPanel>}

    {fixes.length > 0 && <HrPanel title={`Attendance corrections · ${fixes.length}`} description="Review regularisation and permission requests.">
      <ul className="divide-y divide-border text-sm">
        {fixes.map((item) => { const age = daysSince(item.requestedAt); const name = employees.find((e) => e.id === item.employeeId)?.name ?? item.employeeId; return <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium">{name} · {item.kind === "permission" ? "permission" : "attendance correction"}</p>
            <p className="text-xs text-muted-foreground">{hrDate(item.date)} · {item.reason}</p>
          </div>
          <div className="flex items-center gap-2">
            <AgeBadge days={age} threshold={threshold} />
            <HrStatus status="pending" />
            <Button size="sm" asChild><Link href="/workspace/hr-people?view=attendance&workspace=hr-people" aria-label={`Review correction from ${name}`}>Review</Link></Button>
          </div>
        </li>; })}
      </ul>
    </HrPanel>}

    {total === 0 && <HrPanel title="Pending approvals" description="Only items you are allowed to decide appear here.">
      <HrEmpty>Nothing is waiting for you. New requests from your team appear here.</HrEmpty>
    </HrPanel>}
  </div>;
}
