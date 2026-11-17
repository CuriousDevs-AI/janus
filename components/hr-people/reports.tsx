"use client";

import * as React from "react";
import { demoMode } from "@/lib/demo-mode";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { useHrLifecycleStore } from "@/lib/stores/hr-lifecycle-store";
import { useHrOperationsStore } from "@/lib/stores/hr-operations-store";
import { buildPayslip } from "@/lib/hr-payroll";
import { HrEmpty, HrPanel, HrStats, HrTable, downloadHrCsv, hrCell, hrMoney, hrToday } from "@/components/hr-people/operations-ui";
import type { HrDemoRole } from "@/lib/types";

const pct = (part: number, whole: number) => whole ? `${Math.round((part / whole) * 100)}%` : "—";
const pctN = (part: number, whole: number) => whole ? Math.round((part / whole) * 100) : 0;
const fyOf = (date: string) => { const year = Number(date.slice(0, 4)); return Number(date.slice(5, 7)) >= 4 ? year : year - 1; };
const tenureBand = (joiningDate: string, today: string) => {
  const years = (new Date(`${today}T12:00:00`).getTime() - new Date(`${joiningDate}T12:00:00`).getTime()) / (365.25 * 86400000);
  return years < 1 ? "<1 year" : years < 3 ? "1–3 years" : years < 5 ? "3–5 years" : "5+ years";
};
const TENURE_BANDS = ["<1 year", "1–3 years", "3–5 years", "5+ years"];

export function HrReportsView({ role }: { role: HrDemoRole }) {
  const { employees, attendance, candidates, leaveRequests, payrollIssues, onboardingTasks, payrollRuns, expenseClaims } = useHrPeopleStore();
  const exits = useHrLifecycleStore((state) => state.exits);
  const { reviews } = useHrOperationsStore();
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
  const [tab, setTab] = React.useState<"overview" | "attendance" | "leave" | "recruitment" | "payroll">("overview");

  // --- Attrition analytics ---
  const yearAgo = new Date(`${today}T12:00:00`); yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const yearAgoStr = yearAgo.toLocaleDateString("en-CA");
  const exitsLast12 = exits.filter((item) => item.status === "completed" && item.lastWorkingDay >= yearAgoStr && item.lastWorkingDay <= today);
  const annualAttrition = people.length ? `${Math.round((exitsLast12.length / people.length) * 100)}%` : "—";
  const exitsThisQ = exits.filter((item) => item.status === "completed" && item.lastWorkingDay >= quarterStart && item.lastWorkingDay <= today).length;
  const exitReasons = exitsLast12.reduce((map, item) => { const r = item.reason?.trim() || "Not recorded"; map.set(r, (map.get(r) ?? 0) + 1); return map; }, new Map<string, number>());
  const topReason = [...exitReasons].sort((a, b) => b[1] - a[1])[0];

  // --- Tenure distribution ---
  const tenureCounts = TENURE_BANDS.map((band) => ({ band, count: people.filter((item) => tenureBand(item.joiningDate, today) === band).length }));
  const tenureMax = Math.max(1, ...tenureCounts.map((item) => item.count));

  // --- Department rows ---
  const deptRows = [...new Set(people.map((item) => item.department))].sort().map((department) => {
    const team = people.filter((item) => item.department === department);
    const ids = new Set(team.map((item) => item.id));
    const att = recent.filter((item) => ids.has(item.employeeId));
    const actions = leaveRequests.filter((item) => ids.has(item.employeeId) && (item.status === "pending" || item.status === "needs_clarification")).length + payrollIssues.filter((item) => ids.has(item.employeeId) && item.status === "open").length + onboardingTasks.filter((item) => ids.has(item.employeeId) && item.status !== "done").length;
    const pay = team.reduce((sum, item) => sum + (buildPayslip(item, month)?.gross ?? 0), 0);
    return { department, people: team.length, attendance: pct(att.filter((item) => item.status !== "absent").length, att.length), attPresent: att.filter((a) => a.status === "present").length, attLate: att.filter((a) => a.status === "late").length, attAbsent: att.filter((a) => a.status === "absent").length, attTotal: att.length, actions, share: pct(pay, gross), pay };
  });
  const headings = ["Department", "People", "Attendance (30 days)", "Open actions", ...(showPay ? ["Payroll share"] : [])];

  // --- Leave analytics (FY) ---
  const fy = fyOf(today);
  const fyStart = `${fy}-04-01`;
  const fyEnd = `${fy + 1}-03-31`;
  const approvedLeaves = leaveRequests.filter((item) => item.status === "approved" && item.from >= fyStart && item.from <= fyEnd);
  const totalLeaveDays = approvedLeaves.reduce((sum, item) => sum + item.days, 0);
  const avgLeavePerPerson = people.length ? (totalLeaveDays / people.length).toFixed(1) : "—";
  const leaveByType = [...approvedLeaves.reduce((m, r) => m.set(r.type, (m.get(r.type) ?? 0) + r.days), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const leaveTypeMax = Math.max(1, ...leaveByType.map((l) => l[1]));
  const pendingLeave = leaveRequests.filter((r) => r.status === "pending" || r.status === "needs_clarification").length;
  const deptLeave = [...new Set(people.map((item) => item.department))].sort().map((dept) => {
    const ids = new Set(people.filter((item) => item.department === dept).map((item) => item.id));
    const days = approvedLeaves.filter((item) => ids.has(item.employeeId)).reduce((s, item) => s + item.days, 0);
    return { dept, people: ids.size, days, avg: ids.size ? (days / ids.size).toFixed(1) : "0" };
  });

  // --- Attendance totals ---
  const presentCount = recent.filter((r) => r.status === "present").length;
  const lateCount = recent.filter((r) => r.status === "late").length;
  const absentCount = recent.filter((r) => r.status === "absent").length;
  const anomalyCount = recent.filter((r) => r.anomaly).length;

  // --- Recruitment pipeline ---
  const screening = candidates.filter((c) => c.stage === "screening").length;
  const interview = candidates.filter((c) => c.stage === "interview").length;
  const offer = candidates.filter((c) => c.stage === "offer").length;
  const accepted = candidates.filter((c) => c.stage === "accepted").length;
  const rejected = candidates.filter((c) => c.stage === "rejected").length;
  const pipelineActive = screening + interview + offer;

  // --- Location & type breakdown ---
  const locations = [...people.reduce((m, e) => m.set(e.location || e.branch, (m.get(e.location || e.branch) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const locMax = Math.max(1, ...locations.map((l) => l[1]));
  const empTypes = { full_time: 0, part_time: 0, contract: 0 };
  people.forEach((e) => { empTypes[e.employmentType] = (empTypes[e.employmentType] ?? 0) + 1; });

  // --- Joining trend (6 months) ---
  const joiningTrend: { key: string; label: string; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(`${today}T12:00:00`);
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    joiningTrend.push({ key, label: d.toLocaleDateString("en-IN", { month: "short" }), count: people.filter((e) => e.joiningDate.startsWith(key)).length });
  }
  const joinMax = Math.max(1, ...joiningTrend.map((j) => j.count));

  // --- Performance ---
  const reviewsDone = reviews.filter((r) => r.status === "completed");
  const avgRating = reviewsDone.length ? (reviewsDone.reduce((s, r) => s + (r.rating ?? 0), 0) / reviewsDone.length).toFixed(1) : "—";
  const ratingLabels = ["Needs improvement", "Below expectations", "Meets expectations", "Exceeds expectations", "Outstanding"];
  const ratingDist = [0, 0, 0, 0, 0];
  reviewsDone.forEach((r) => { if (r.rating && r.rating >= 1 && r.rating <= 5) ratingDist[r.rating - 1]++; });
  const ratingMax = Math.max(1, ...ratingDist);

  // --- Expense totals ---
  const totalExpenses = expenseClaims.reduce((s, c) => s + c.amount, 0);
  const paidExpenses = expenseClaims.filter((c) => c.status === "paid").reduce((s, c) => s + c.amount, 0);
  const pendingExpenses = expenseClaims.filter((c) => !["paid", "rejected"].includes(c.status)).reduce((s, c) => s + c.amount, 0);

  function exportCsv() {
    downloadHrCsv(`hr-report-${today}.csv`, [headings, ...deptRows.map((row) => [row.department, row.people, row.attendance, row.actions, ...(showPay ? [row.share] : [])])]);
  }

  const tabs = [["overview", "Overview"], ["attendance", "Attendance"], ["leave", "Leave"], ["recruitment", "Recruitment"], ...(showPay ? [["payroll", "Payroll & Cost"]] : [])] as const;

  return <div className="space-y-5">
    <HrStats items={[{ label: "Headcount", value: people.length, hint: `${joined} joined this quarter` }, { label: "Attendance, last 30 days", value: pct(recent.filter((item) => item.status !== "absent").length, recent.length), hint: recent.length ? `${recent.length} records` : "No attendance records yet" }, ...(showPay ? [{ label: `Gross payroll, ${monthLabel}`, value: hrMoney(gross), hint: demoMode ? "Before approval. Illustrative figures" : "Before approval" }] : []), { label: "Open candidates", value: candidates.filter((item) => !["accepted", "rejected"].includes(item.stage)).length, hint: "Screening to offer" }, { label: "Onboarding now", value: onboarding.length, hint: onboarding.length ? `${Math.round(onboarding.reduce((sum, item) => sum + item.onboardingPercent, 0) / onboarding.length)}% average progress` : "Nobody onboarding" }, { label: "Exits", value: `${openExits} open`, hint: `${doneExits} completed` }]} />

    <div role="tablist" aria-label="Reports" className="flex w-fit gap-1 border border-border bg-surface-2 p-1">
      {tabs.map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key as typeof tab)} className={`px-5 py-2 text-sm ${tab === key ? "bg-accent text-white" : "text-muted-foreground"}`}>{label}</button>)}
    </div>

    {tab === "overview" && <>
      <div className="grid gap-5 xl:grid-cols-2">
        <HrPanel title="Department comparison" description="Computed from current records." actions={<Button size="sm" variant="outline" onClick={exportCsv}><Download className="mr-1 size-3.5" />Export CSV</Button>}>
          {deptRows.length ? <HrTable headings={headings}>{deptRows.map((row) => <tr key={row.department}><td className={`${hrCell} font-medium`}>{row.department}</td><td className={hrCell}>{row.people}</td><td className={hrCell}>{row.attendance}</td><td className={hrCell}>{row.actions}</td>{showPay && <td className={hrCell}>{row.share}</td>}</tr>)}</HrTable> : <HrEmpty>No employees yet.</HrEmpty>}
        </HrPanel>

        <HrPanel title="People by location" description="Headcount across offices">
          {locations.length ? <div className="space-y-3 px-5 py-4">{locations.map(([loc, n]) => <div key={loc} className="flex items-center gap-3"><span className="w-28 truncate text-xs text-muted-foreground">{loc}</span><div className="h-5 flex-1 bg-surface-2"><div className="h-5 bg-accent/80" style={{ width: `${(n / locMax) * 100}%` }} /></div><span className="w-8 text-right text-xs font-medium">{n}</span></div>)}</div> : <HrEmpty>No location data.</HrEmpty>}
        </HrPanel>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <HrPanel title="Employment type" description="Full-time, part-time and contract">
          <div className="space-y-3 px-5 py-4">{([["Full-time", empTypes.full_time, "bg-accent"], ["Part-time", empTypes.part_time, "bg-info"], ["Contract", empTypes.contract, "bg-warning"]] as const).map(([label, n, color]) => <div key={label} className="flex items-center gap-3"><span className="w-20 text-xs text-muted-foreground">{label}</span><div className="h-5 flex-1 bg-surface-2"><div className={`h-5 ${color}`} style={{ width: `${pctN(n, people.length)}%` }} /></div><span className="w-12 text-right text-xs font-medium">{n} <span className="text-muted-foreground">({pct(n, people.length)})</span></span></div>)}</div>
        </HrPanel>

        <HrPanel title="Tenure distribution" description="Time since joining">
          <div className="space-y-3 px-5 py-4">{tenureCounts.map((item) => <div key={item.band} className="flex items-center gap-3"><span className="w-24 text-xs text-muted-foreground">{item.band}</span><div className="h-5 flex-1 bg-surface-2"><div className="h-5 bg-accent/70" style={{ width: `${(item.count / tenureMax) * 100}%` }} /></div><span className="w-10 text-right text-xs font-medium">{item.count} <span className="text-muted-foreground">({pct(item.count, people.length)})</span></span></div>)}</div>
        </HrPanel>

        <HrPanel title="Joining trend" description="New hires in the last 6 months">
          <div className="flex h-36 items-end gap-2 px-5 pt-4">{joiningTrend.map((j) => <div key={j.key} className="flex min-w-0 flex-1 flex-col items-center gap-1"><div className="flex h-24 w-full max-w-8 items-end justify-center"><div className="w-full rounded-t bg-accent" style={{ height: `${Math.max(j.count > 0 ? 12 : 0, (j.count / joinMax) * 100)}%` }} /></div><span className="text-[10px] text-muted-foreground">{j.label}</span><span className="text-xs font-medium">{j.count}</span></div>)}</div>
          <p className="border-t border-border px-5 py-2 text-[11px] text-muted-foreground">People whose joining date falls in each month</p>
        </HrPanel>
      </div>

      <HrPanel title="Attrition analytics" description="Employee exits and turnover over the last 12 months">
        <div className="grid grid-cols-2 gap-3 p-5 xl:grid-cols-4">
          <MiniStat label="Annual attrition rate" value={annualAttrition} hint="Last 12 months" />
          <MiniStat label="Exits last 12 months" value={exitsLast12.length} hint="Completed separations" />
          <MiniStat label="Exits this quarter" value={exitsThisQ} hint={`Since ${quarterStart.slice(0, 7)}`} />
          <MiniStat label="Top exit reason" value={topReason ? topReason[0] : "—"} hint={topReason ? `${topReason[1]} ${topReason[1] === 1 ? "case" : "cases"}` : "No completed exits"} small />
        </div>
      </HrPanel>

      {reviewsDone.length > 0 && <HrPanel title="Performance snapshot" description="Completed reviews this cycle">
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <div><p className="text-xs text-muted-foreground">Average rating</p><p className="mt-1 text-3xl font-semibold">{avgRating}<span className="text-base text-muted-foreground"> / 5</span></p><p className="mt-2 text-xs text-muted-foreground">{reviewsDone.length} review{reviewsDone.length !== 1 ? "s" : ""} completed · {reviews.filter((r) => r.status !== "completed").length} still open</p></div>
          <div><p className="mb-3 text-xs text-muted-foreground">Rating distribution</p><div className="space-y-2">{ratingLabels.map((label, i) => <div key={label} className="flex items-center gap-2"><span className="w-32 truncate text-[11px] text-muted-foreground">{label}</span><div className="h-4 flex-1 bg-surface-2"><div className={`h-4 ${i < 2 ? "bg-warning" : i === 2 ? "bg-accent" : "bg-success"}`} style={{ width: `${(ratingDist[i] / ratingMax) * 100}%` }} /></div><span className="w-4 text-right text-xs font-medium">{ratingDist[i]}</span></div>)}</div>
          </div>
        </div>
      </HrPanel>}
    </>}

    {tab === "attendance" && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Present" value={presentCount} total={recent.length} color="bg-success" />
        <StatTile label="Late arrivals" value={lateCount} total={recent.length} color="bg-warning" />
        <StatTile label="Absent" value={absentCount} total={recent.length} color="bg-danger" />
        <StatTile label="Anomalies flagged" value={anomalyCount} total={recent.length} color="bg-info" />
      </div>

      <HrPanel title="Attendance by department" description="Last 30 days breakdown">
        {deptRows.length ? <HrTable headings={["Department", "People", "On-time rate", "Late %", "Absent %"]}>{deptRows.map((r) => <tr key={r.department}><td className={`${hrCell} font-medium`}>{r.department}</td><td className={hrCell}>{r.people}</td><td className={hrCell}><div className="flex items-center gap-2"><BarInline pct={pctN(r.attPresent, r.attTotal)} color="bg-success" />{pct(r.attPresent, r.attTotal)}</div></td><td className={hrCell}><div className="flex items-center gap-2"><BarInline pct={pctN(r.attLate, r.attTotal)} color="bg-warning" />{pct(r.attLate, r.attTotal)}</div></td><td className={hrCell}><div className="flex items-center gap-2"><BarInline pct={pctN(r.attAbsent, r.attTotal)} color="bg-danger" />{pct(r.attAbsent, r.attTotal)}</div></td></tr>)}</HrTable> : <HrEmpty>No attendance data to analyse.</HrEmpty>}
      </HrPanel>

      <HrPanel title="Overtime hours" description="Employees with recorded overtime in the last 30 days">
        {(() => {
          const ot = [...recent.filter((r) => r.overtimeHours > 0).reduce((m, r) => m.set(r.employeeName, (m.get(r.employeeName) ?? 0) + r.overtimeHours), new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, 10);
          const otMax = Math.max(1, ...ot.map((o) => o[1]));
          return ot.length ? <div className="space-y-3 px-5 py-4">{ot.map(([name, hrs]) => <div key={name} className="flex items-center gap-3"><span className="w-32 truncate text-xs text-muted-foreground">{name}</span><div className="h-5 flex-1 bg-surface-2"><div className="h-5 bg-info/70" style={{ width: `${(hrs / otMax) * 100}%` }} /></div><span className="w-10 text-right text-xs font-medium">{hrs}h</span></div>)}</div> : <HrEmpty>No overtime recorded in this period.</HrEmpty>;
        })()}
      </HrPanel>
    </>}

    {tab === "leave" && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat label="Total leave days taken" value={totalLeaveDays} hint={`FY ${fy}–${String(fy + 1).slice(2)}`} />
        <MiniStat label="Avg per employee" value={avgLeavePerPerson} hint="days this FY" />
        <MiniStat label="Pending requests" value={pendingLeave} hint="Awaiting approval" />
        <MiniStat label="Requests approved" value={approvedLeaves.length} hint="This financial year" />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <HrPanel title="Leave by type" description={`Approved days · FY ${fy}–${String(fy + 1).slice(2)}`}>
          {leaveByType.length ? <div className="space-y-3 px-5 py-4">{leaveByType.map(([type, days]) => <div key={type} className="flex items-center gap-3"><span className="w-28 truncate text-xs capitalize text-muted-foreground">{type}</span><div className="h-5 flex-1 bg-surface-2"><div className="h-5 bg-accent" style={{ width: `${(days / leaveTypeMax) * 100}%` }} /></div><span className="w-10 text-right text-xs font-medium">{days} d</span></div>)}</div> : <HrEmpty>No approved leave this FY.</HrEmpty>}
        </HrPanel>

        <HrPanel title="Leave by department" description="Approved leave days per team">
          {deptLeave.filter((d) => d.days > 0).length > 0 ? <HrTable headings={["Department", "People", "Days taken", "Avg per person"]}>{deptLeave.map((item) => <tr key={item.dept}><td className={`${hrCell} font-medium`}>{item.dept}</td><td className={hrCell}>{item.people}</td><td className={hrCell}>{item.days}</td><td className={hrCell}>{item.avg}</td></tr>)}</HrTable> : <HrEmpty>No leave data this FY.</HrEmpty>}
        </HrPanel>
      </div>
    </>}

    {tab === "recruitment" && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat label="Total candidates" value={candidates.length} hint={`${pipelineActive} active`} />
        <MiniStat label="In screening" value={screening} hint="Initial review" />
        <MiniStat label="Interviewing" value={interview} hint="In process" />
        <MiniStat label="Offers extended" value={offer} hint={`${accepted} accepted · ${rejected} rejected`} />
      </div>

      <HrPanel title="Recruitment funnel" description="Candidate conversion through pipeline stages">
        <div className="px-5 py-6">
          {candidates.length > 0 ? <div className="flex flex-col gap-3">{([["Screening", screening, "bg-info/80"], ["Interview", interview, "bg-accent"], ["Offer", offer, "bg-warning"], ["Accepted", accepted, "bg-success"]] as const).map(([label, n, color]) => <div key={label} className="flex items-center gap-3"><span className="w-24 text-xs text-muted-foreground">{label}</span><div className="h-7 flex-1 bg-surface-2"><div className={`flex h-7 items-center px-2 text-xs font-medium text-white ${color}`} style={{ width: `${Math.max(pctN(n, candidates.length), n > 0 ? 8 : 0)}%` }}>{n}</div></div><span className="w-10 text-right text-xs text-muted-foreground">{pct(n, candidates.length)}</span></div>)}</div> : <HrEmpty>No candidates in the pipeline.</HrEmpty>}
          {accepted > 0 && <p className="mt-4 text-xs text-muted-foreground">Offer-to-accept rate: <span className="font-medium text-foreground">{pct(accepted, accepted + rejected + offer)}</span></p>}
        </div>
      </HrPanel>

      <HrPanel title="Candidates by department" description="Open positions across teams">
        {(() => {
          const byDept = [...candidates.filter((c) => !["accepted", "rejected"].includes(c.stage)).reduce((m, c) => m.set(c.department, (m.get(c.department) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
          const dMax = Math.max(1, ...byDept.map((d) => d[1]));
          return byDept.length ? <div className="space-y-3 px-5 py-4">{byDept.map(([dept, n]) => <div key={dept} className="flex items-center gap-3"><span className="w-28 truncate text-xs text-muted-foreground">{dept}</span><div className="h-5 flex-1 bg-surface-2"><div className="h-5 bg-accent" style={{ width: `${(n / dMax) * 100}%` }} /></div><span className="w-6 text-right text-xs font-medium">{n}</span></div>)}</div> : <HrEmpty>No active candidates.</HrEmpty>;
        })()}
      </HrPanel>
    </>}

    {tab === "payroll" && showPay && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat label={`Gross payroll`} value={hrMoney(gross)} hint={monthLabel} />
        <MiniStat label="Expenses claimed" value={hrMoney(totalExpenses)} hint={`${expenseClaims.length} claims`} />
        <MiniStat label="Expenses paid" value={hrMoney(paidExpenses)} hint={totalExpenses ? `${pct(paidExpenses, totalExpenses)} of total` : "No claims"} />
        <MiniStat label="Pending settlement" value={hrMoney(pendingExpenses)} hint="Awaiting approval or payment" />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <HrPanel title="Payroll cost by department" description={monthLabel}>
          {deptRows.filter((r) => r.pay > 0).length ? <div className="space-y-3 px-5 py-4">{deptRows.filter((r) => r.pay > 0).sort((a, b) => b.pay - a.pay).map((r) => <div key={r.department} className="flex items-center gap-3"><span className="w-28 truncate text-xs text-muted-foreground">{r.department}</span><div className="h-5 flex-1 bg-surface-2"><div className="h-5 bg-accent" style={{ width: `${pctN(r.pay, gross)}%` }} /></div><span className="w-20 text-right text-xs font-medium">{hrMoney(r.pay)}</span></div>)}</div> : <HrEmpty>No payroll data.</HrEmpty>}
        </HrPanel>

        <HrPanel title="Payroll run history" description="Recent months">
          {payrollRuns.length ? <HrTable headings={["Month", "Status", "Payslips"]}>{payrollRuns.slice(0, 6).map((run) => { const key = run.id.replace(/^pay-/, ""); return <tr key={run.id}><td className={`${hrCell} font-medium`}>{new Date(`${key}-01T12:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</td><td className={hrCell}><Badge variant={run.status === "locked" ? "success" : run.status === "approved" ? "accent" : "warning"} className="rounded-none capitalize">{run.status}</Badge></td><td className={hrCell}>{people.filter((e) => buildPayslip(e, key)).length}</td></tr>; })}</HrTable> : <HrEmpty>No payroll runs yet.</HrEmpty>}
        </HrPanel>
      </div>
    </>}
  </div>;
}

function MiniStat({ label, value, hint, small }: { label: string; value: string | number; hint: string; small?: boolean }) {
  return <div className="border border-border bg-surface p-4"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 ${small ? "text-sm font-medium" : "text-2xl font-semibold tracking-tight"}`}>{value}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p></div>;
}

function StatTile({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  return <div className="border border-border bg-surface p-4">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
    <div className="mt-2 flex items-center gap-2"><div className="h-1.5 flex-1 bg-surface-3"><div className={`h-1.5 ${color}`} style={{ width: `${pctN(value, total)}%` }} /></div><span className="text-[11px] text-muted-foreground">{pct(value, total)}</span></div>
  </div>;
}

function BarInline({ pct: p, color }: { pct: number; color: string }) {
  return <div className="h-3 w-16 bg-surface-3"><div className={`h-3 ${color}`} style={{ width: `${p}%` }} /></div>;
}
