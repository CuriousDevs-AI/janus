"use client";

import { demoMode } from "@/lib/demo-mode";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { useHrLifecycleStore } from "@/lib/stores/hr-lifecycle-store";
import { buildPayslip } from "@/lib/hr-payroll";
import { HrEmpty, HrPanel, HrStats, HrTable, downloadHrCsv, hrCell, hrMoney, hrToday } from "@/components/hr-people/operations-ui";
import type { HrDemoRole } from "@/lib/types";

const pct = (part: number, whole: number) => whole ? `${Math.round((part / whole) * 100)}%` : "—";

/** Every figure here is computed from the current records. Individual pay is only shown to HR, payroll and the owner. */
export function HrReportsView({ role }: { role: HrDemoRole }) {
  const { employees, attendance, candidates, leaveRequests, payrollIssues, onboardingTasks, payrollRuns } = useHrPeopleStore();
  const exits = useHrLifecycleStore((state) => state.exits);
  const today = hrToday();
  const showPay = role === "owner" || role === "hr_manager" || role === "payroll_admin";
  const people = employees.filter((item) => item.status !== "archived");
  const since = new Date(`${today}T12:00:00`); since.setDate(since.getDate() - 30);
  const from = since.toLocaleDateString("en-CA");
  const recent = attendance.filter((item) => item.date >= from && item.date <= today && (item.status === "present" || item.status === "late" || item.status === "absent"));
  const quarterStart = `${today.slice(0, 4)}-${String(Math.floor((Number(today.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
  const joined = people.filter((item) => item.joiningDate >= quarterStart && item.joiningDate <= today).length;
  const month = payrollRuns[0] ? payrollRuns[0].id.replace(/^pay-/, "") : today.slice(0, 7);
  const monthLabel = new Date(`${month}-01T12:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const gross = people.reduce((sum, item) => sum + (buildPayslip(item, month)?.gross ?? 0), 0);
  const onboarding = people.filter((item) => item.status === "onboarding");
  const openExits = exits.filter((item) => !["completed", "cancelled"].includes(item.status)).length;
  const doneExits = exits.filter((item) => item.status === "completed").length;
  const rows = [...new Set(people.map((item) => item.department))].sort().map((department) => {
    const team = people.filter((item) => item.department === department);
    const ids = new Set(team.map((item) => item.id));
    const att = recent.filter((item) => ids.has(item.employeeId));
    const actions = leaveRequests.filter((item) => ids.has(item.employeeId) && (item.status === "pending" || item.status === "needs_clarification")).length + payrollIssues.filter((item) => ids.has(item.employeeId) && item.status === "open").length + onboardingTasks.filter((item) => ids.has(item.employeeId) && item.status !== "done").length;
    const pay = team.reduce((sum, item) => sum + (buildPayslip(item, month)?.gross ?? 0), 0);
    return { department, people: team.length, attendance: pct(att.filter((item) => item.status !== "absent").length, att.length), actions, share: pct(pay, gross) };
  });
  const headings = ["Department", "People", "Attendance (30 days)", "Open actions", ...(showPay ? ["Payroll share"] : [])];

  function exportCsv() {
    downloadHrCsv(`hr-report-${today}.csv`, [headings, ...rows.map((row) => [row.department, row.people, row.attendance, row.actions, ...(showPay ? [row.share] : [])])]);
  }

  return <div className="space-y-5">
    <HrStats items={[{ label: "Headcount", value: people.length, hint: `${joined} joined this quarter` }, { label: "Attendance, last 30 days", value: pct(recent.filter((item) => item.status !== "absent").length, recent.length), hint: recent.length ? `${recent.length} records` : "No attendance records yet" }, ...(showPay ? [{ label: `Gross payroll, ${monthLabel}`, value: hrMoney(gross), hint: demoMode ? "Before approval. Illustrative figures" : "Before approval" }] : []), { label: "Open candidates", value: candidates.filter((item) => !["accepted", "rejected"].includes(item.stage)).length, hint: "Screening to offer" }, { label: "Onboarding now", value: onboarding.length, hint: onboarding.length ? `${Math.round(onboarding.reduce((sum, item) => sum + item.onboardingPercent, 0) / onboarding.length)}% average progress` : "Nobody onboarding" }, { label: "Exits", value: `${openExits} open`, hint: `${doneExits} completed` }]} />
    <HrPanel title="Department comparison" description="Computed from current records. Departments with one person are shown as they are." actions={<Button size="sm" variant="outline" onClick={exportCsv}><Download className="mr-1 size-3.5" />Export CSV</Button>}>
      {rows.length ? <HrTable headings={headings}>{rows.map((row) => <tr key={row.department}><td className={`${hrCell} font-medium`}>{row.department}</td><td className={hrCell}>{row.people}</td><td className={hrCell}>{row.attendance}</td><td className={hrCell}>{row.actions}</td>{showPay && <td className={hrCell}>{row.share}</td>}</tr>)}</HrTable> : <HrEmpty>No employees yet, so there is nothing to compare.</HrEmpty>}
    </HrPanel>
  </div>;
}
