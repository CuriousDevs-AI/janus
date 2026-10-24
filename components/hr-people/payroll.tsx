"use client";

import * as React from "react";
import { toast } from "sonner";
import { Download, FileText, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { useHrOperationsStore } from "@/lib/stores/hr-operations-store";
import { buildPayslip, downloadHrFile, payslipText, type HrPayslip } from "@/lib/hr-payroll";
import { canManageHr } from "@/lib/hr-people-access";
import { HrEmpty, HrModal, HrPanel, HrStats, HrStatus, HrTable, downloadHrCsv, hrCell, hrMoney } from "@/components/hr-people/operations-ui";
import type { HrDemoRole, HrEmployee, HrPayrollIssue, HrPayrollRun } from "@/lib/types";

const runKey = (run: HrPayrollRun) => run.id.replace(/^pay-/, "");
const previousKey = (key: string) => { const date = new Date(`${key}-01T12:00:00`); date.setMonth(date.getMonth() - 1); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; };
const monthLabel = (key: string) => new Date(`${key}-01T12:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
const signed = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${hrMoney(Math.abs(value))}`;
const when = (value: string) => new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

interface Exception { id: string; title: string; detail: string; severity: HrPayrollIssue["severity"]; status: HrPayrollIssue["status"]; source: "record" | "derived"; blocking: boolean; employeeName: string; amountDelta: number }
export interface Line { employee: HrEmployee; slip: HrPayslip; previous: HrPayslip | null; delta: number; pct: number | null; flags: string[] }

function register(employees: HrEmployee[], key: string): Line[] {
  const prev = previousKey(key);
  return employees.filter((item) => item.status !== "archived").flatMap((employee) => {
    const slip = buildPayslip(employee, key);
    if (!slip) return [];
    const previous = buildPayslip(employee, prev);
    const delta = slip.net - (previous?.net ?? 0);
    const pct = previous && previous.net > 0 ? (delta / previous.net) * 100 : null;
    const flags = [!previous && "New this month", slip.paidDays < slip.totalDays && `Pro-rata ${slip.paidDays}/${slip.totalDays} days`, pct !== null && Math.abs(pct) >= 10 && "Net changed 10%+", employee.status === "notice" && "Notice period"].filter(Boolean) as string[];
    return [{ employee, slip, previous, delta, pct, flags }];
  });
}

export function HrPayrollView({ role, actorId, personal = false }: { role: HrDemoRole; actorId: string; personal?: boolean }) {
  return personal ? <MyPayslips actorId={actorId} /> : <PayrollRuns role={role} actorId={actorId} />;
}

function PayrollRuns({ role, actorId }: { role: HrDemoRole; actorId: string }) {
  const { employees, payrollRuns, payrollIssues, updatePayrollIssue, updatePayrollRun } = useHrPeopleStore();
  const { audit, log } = useHrOperationsStore();
  const [runId, setRunId] = React.useState(payrollRuns[0]?.id ?? "");
  const [slip, setSlip] = React.useState<Line | null>(null);
  const [reason, setReason] = React.useState<{ title: string; confirm: string; onSubmit: (reason: string) => void } | null>(null);
  const run = payrollRuns.find((item) => item.id === runId) ?? payrollRuns[0];
  const manager = canManageHr(role);
  const actor = employees.find((item) => item.id === actorId)?.name ?? "HR";
  const key = run ? runKey(run) : "";
  const lines = React.useMemo(() => run ? register(employees, key) : [], [employees, key, run]);
  const latest = run?.id === payrollRuns[0]?.id;
  const locked = run?.status === "locked";
  if (!run) return <HrPanel title="Payroll"><HrEmpty>No payroll runs yet.</HrEmpty></HrPanel>;

  const gross = lines.reduce((sum, line) => sum + line.slip.gross, 0);
  const deductions = lines.reduce((sum, line) => sum + line.slip.totalDeductions, 0);
  const net = gross - deductions;
  const previousNet = lines.reduce((sum, line) => sum + (line.previous?.net ?? 0), 0);
  const change = previousNet ? ((net - previousNet) / previousNet) * 100 : null;
  const exceptions: Exception[] = [
    ...(latest ? payrollIssues.map((issue): Exception => ({ id: issue.id, title: issue.title, detail: issue.detail, severity: issue.severity, status: issue.status, source: "record", blocking: true, employeeName: issue.employeeName, amountDelta: issue.amountDelta })) : []),
    ...employees.filter((item) => item.status !== "archived" && item.status !== "onboarding" && item.salaryMonthly <= 0).map((item): Exception => ({ id: `derived-salary-${item.id}`, title: "No salary on record", detail: "This active employee has no monthly salary, so no payslip can be produced. Update the employee record.", severity: "high", status: "open", source: "derived", blocking: true, employeeName: item.name, amountDelta: 0 })),
    ...lines.filter((line) => line.pct !== null && Math.abs(line.pct) >= 10).map((line): Exception => ({ id: `derived-swing-${line.employee.id}`, title: `Net pay ${line.pct! > 0 ? "up" : "down"} ${Math.abs(line.pct!).toFixed(0)}% vs last month`, detail: line.flags.join(" · "), severity: "low", status: "open", source: "derived", blocking: false, employeeName: line.employee.name, amountDelta: line.delta })),
  ];
  const blockers = exceptions.filter((item) => item.blocking && item.status === "open");
  const submitter = audit.find((item) => item.recordId === run.id && item.action === "submitted_for_review");
  const sameActor = submitter?.actorId === actorId;
  const history = audit.filter((item) => item.recordId === run.id);

  function move(status: HrPayrollRun["status"], action: string, reasonText = "") {
    updatePayrollRun(run.id, { status, gross, deductions, net, employeeCount: lines.length, issueCount: blockers.length, deltaPercent: change === null ? 0 : Number(change.toFixed(1)) });
    log({ recordId: run.id, actorId, action, reason: reasonText });
    toast.success(action === "approved" ? "Payroll approved" : action === "locked" ? "Payroll locked. Payslips are published." : action === "reopened" ? "Payroll reopened for review" : "Submitted for review");
  }
  function ask(title: string, confirm: string, onSubmit: (value: string) => void) { setReason({ title, confirm, onSubmit }); }

  function exportCsv() {
    downloadHrCsv(`payroll-register-${key}.csv`, [["Employee ID", "Employee", "Paid days", "Gross", "Deductions", "Net", "Change vs previous month", "Notes"], ...lines.map((line) => [line.employee.id.toUpperCase(), line.employee.name, `${line.slip.paidDays}/${line.slip.totalDays}`, line.slip.gross, line.slip.totalDeductions, line.slip.net, line.delta, line.flags.join("; ")]), ["", "Total", "", gross, deductions, net, net - previousNet, ""]]);
    log({ recordId: run.id, actorId, action: "exported_register", reason: "" });
  }

  return <div className="space-y-5">
    <HrStats items={[{ label: "Gross pay", value: hrMoney(gross), hint: `${lines.length} employees · ${monthLabel(key)}` }, { label: "Net pay", value: hrMoney(net), hint: `Deductions ${hrMoney(deductions)}` }, { label: "Vs previous month", value: change === null ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(1)}%`, hint: previousNet ? `${signed(net - previousNet)} net` : "No previous month" }, { label: "Open exceptions", value: blockers.length, hint: blockers.length ? "Resolve or defer before approval" : "Nothing blocking approval" }]} />
    <HrPanel title="Payroll run" description="Illustrative figures from salary records. Statutory PF, ESI, PT and TDS rules are not calculated here, so verify before paying." actions={<div className="flex flex-wrap items-center gap-2"><select aria-label="Payroll month" className="h-9 border border-border bg-surface px-2 text-sm rounded-none" value={run.id} onChange={(event) => setRunId(event.target.value)}>{payrollRuns.map((item) => <option key={item.id} value={item.id}>{monthLabel(runKey(item))}</option>)}</select><HrStatus status={run.status} /><Button size="sm" variant="outline" onClick={exportCsv}><Download className="mr-1 size-3.5" />Export register</Button></div>}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3 text-sm">
        {locked ? <p className="flex items-center gap-2 text-muted-foreground"><LockKeyhole className="size-4" />Locked. Figures are final and payslips are published.</p> : run.status === "approved" ? <p className="text-muted-foreground">Approved{submitter ? ` · prepared by ${employees.find((item) => item.id === submitter.actorId)?.name ?? "HR"}` : ""}. Lock the run to publish payslips.</p> : <p className="text-muted-foreground">{run.status === "draft" ? "Draft. Check the register, then submit for review." : "In review. A different person approves what you submit (dual approval)."}</p>}
        {manager || role === "payroll_admin" ? <div className="flex flex-wrap gap-2">
          {run.status === "draft" && <Button onClick={() => move("review", "submitted_for_review")}>Submit for review</Button>}
          {run.status === "review" && manager && <Button disabled={blockers.length > 0 || sameActor} title={blockers.length ? "Resolve or defer open exceptions first" : sameActor ? "Someone other than the preparer must approve" : undefined} onClick={() => move("approved", "approved")}>Approve payroll</Button>}
          {run.status === "review" && role === "payroll_admin" && !submitter && <Button variant="outline" onClick={() => log({ recordId: run.id, actorId, action: "submitted_for_review", reason: "" })}>Mark as prepared by me</Button>}
          {run.status === "approved" && <Button onClick={() => move("locked", "locked")}><LockKeyhole className="mr-1 size-3.5" />Lock payroll</Button>}
          {locked && manager && role === "owner" && <Button variant="outline" onClick={() => ask("Reopen locked payroll", "Reopen", (text) => move("review", "reopened", text))}>Reopen</Button>}
        </div> : null}
      </div>
      <HrTable headings={["Employee", "Paid days", "Gross", "Deductions", "Net", "Vs last month", "Notes", ""]}>
        {lines.map((line) => <tr key={line.employee.id}><td className={hrCell}><p className="font-medium">{line.employee.name}</p><p className="text-xs text-muted-foreground">{line.employee.id.toUpperCase()} · {line.employee.department}</p></td><td className={hrCell}>{line.slip.paidDays}/{line.slip.totalDays}</td><td className={hrCell}>{hrMoney(line.slip.gross)}</td><td className={hrCell}>{hrMoney(line.slip.totalDeductions)}</td><td className={`${hrCell} font-medium`}>{hrMoney(line.slip.net)}</td><td className={hrCell}>{line.previous ? <><span className={line.delta === 0 ? "text-muted-foreground" : line.delta > 0 ? "text-success" : "text-danger"}>{line.delta === 0 ? "No change" : signed(line.delta)}</span>{line.pct !== null && line.delta !== 0 && <span className="block text-xs text-muted-foreground">{line.pct > 0 ? "+" : ""}{line.pct.toFixed(1)}%</span>}</> : <span className="text-muted-foreground">New</span>}</td><td className={`${hrCell} text-xs text-muted-foreground`}>{line.flags.length ? line.flags.join(" · ") : "—"}</td><td className={hrCell}><Button size="sm" variant="outline" onClick={() => setSlip(line)}>Payslip</Button></td></tr>)}
        {!lines.length && <tr><td colSpan={8}><HrEmpty>No employees have salary records for this month.</HrEmpty></td></tr>}
      </HrTable>
    </HrPanel>
    <HrPanel title="Exceptions" description="Blocking items must be resolved or deferred with a reason before approval.">
      {exceptions.length ? <ul className="divide-y divide-border">{exceptions.map((item) => <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm"><div className="min-w-0 flex-1"><p className="font-medium">{item.title} <span className="font-normal text-muted-foreground">· {item.employeeName}</span></p><p className="mt-1 text-xs text-muted-foreground">{item.detail}{item.amountDelta ? ` · ${signed(item.amountDelta)}` : ""}</p></div><div className="flex items-center gap-2"><HrStatus status={item.severity === "high" ? "attention" : item.severity === "medium" ? "review" : "info"} /><HrStatus status={item.source === "derived" && !item.blocking ? "info" : item.status} />
        {item.source === "record" && !locked && (manager || role === "payroll_admin") && (item.status === "open" ? <><Button size="sm" variant="outline" onClick={() => ask(`Defer: ${item.title}`, "Defer", (text) => { updatePayrollIssue(item.id, "deferred"); log({ recordId: run.id, actorId, action: "deferred_exception", reason: `${item.title} (${item.employeeName}): ${text}` }); })}>Defer</Button><Button size="sm" onClick={() => { updatePayrollIssue(item.id, "resolved"); log({ recordId: run.id, actorId, action: "resolved_exception", reason: `${item.title} (${item.employeeName})` }); }}>Resolve</Button></> : <Button size="sm" variant="outline" onClick={() => { updatePayrollIssue(item.id, "open"); log({ recordId: run.id, actorId, action: "reopened_exception", reason: `${item.title} (${item.employeeName})` }); }}>Reopen</Button>)}
      </div></li>)}</ul> : <HrEmpty>No exceptions for this run.</HrEmpty>}
    </HrPanel>
    <HrPanel title="Run history" description="Who prepared, approved and locked this run.">{history.length ? <ol className="divide-y divide-border text-sm">{history.map((item) => <li key={item.id} className="px-5 py-2"><p className="capitalize">{item.action.replaceAll("_", " ")}{item.reason ? ` — ${item.reason}` : ""}</p><p className="text-xs text-muted-foreground">{employees.find((person) => person.id === item.actorId)?.name ?? item.actorId} · {when(item.at)}</p></li>)}</ol> : <HrEmpty>No actions recorded yet.</HrEmpty>}</HrPanel>
    {slip && <PayslipDialog line={slip} published={locked || key < "2026-10"} onClose={() => setSlip(null)} />}
    {reason && <ReasonDialog title={reason.title} confirm={reason.confirm} onClose={() => setReason(null)} onSubmit={(text) => { reason.onSubmit(text); setReason(null); }} />}
    <p className="text-[11px] text-muted-foreground">Acting as {actor}.</p>
  </div>;
}

function ReasonDialog({ title, confirm, onSubmit, onClose }: { title: string; confirm: string; onSubmit: (reason: string) => void; onClose: () => void }) {
  const [text, setText] = React.useState("");
  return <HrModal open onOpenChange={(value) => !value && onClose()} title={title} description="A reason is required and is kept in the run history.">
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (text.trim().length >= 5) onSubmit(text.trim()); }}>
      <Textarea aria-label="Reason" required minLength={5} maxLength={300} value={text} onChange={(event) => setText(event.target.value)} className="rounded-none" placeholder="e.g. Awaiting bank proof, will pay in the next cycle" />
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={text.trim().length < 5}>{confirm}</Button></div>
    </form>
  </HrModal>;
}

export function PayslipDialog({ line, published, onClose }: { line: Line; published: boolean; onClose: () => void }) {
  const { slip, employee } = line;
  const shown: HrPayslip = { ...slip, status: published ? "published" : "review" };
  return <HrModal open onOpenChange={(value) => !value && onClose()} title={`${slip.label} payslip`} description={`${employee.name} · ${employee.id.toUpperCase()} · ${employee.title}`}>
    <div className="space-y-4 text-sm">
      <div className="flex items-center justify-between"><span className="text-muted-foreground">Paid days {slip.paidDays}/{slip.totalDays} · Bank ···{slip.bankLast4}</span><HrStatus status={published ? "published" : "review"} /></div>
      <div className="grid gap-4 sm:grid-cols-2">{[["Earnings", shown.earnings, shown.gross, "Gross"], ["Deductions", shown.deductions, shown.totalDeductions, "Total deductions"]].map(([title, items, total, totalLabel]) => <div key={String(title)} className="border border-border"><p className="border-b border-border bg-surface-2 px-3 py-2 text-xs font-semibold">{String(title)}</p><ul className="divide-y divide-border">{(items as { label: string; amount: number }[]).map((item) => <li key={item.label} className="flex justify-between px-3 py-2"><span>{item.label}</span><span>{hrMoney(item.amount)}</span></li>)}</ul><p className="flex justify-between border-t border-border px-3 py-2 font-medium"><span>{String(totalLabel)}</span><span>{hrMoney(Number(total))}</span></p></div>)}</div>
      <p className="flex items-center justify-between border border-border bg-surface-2 px-3 py-3 text-base font-semibold"><span>Net pay</span><span>{hrMoney(slip.net)}</span></p>
      {!published && <p className="text-xs text-muted-foreground">Draft figures. The payslip is published to the employee when payroll is locked.</p>}
      <div className="flex justify-end"><Button variant="outline" onClick={() => downloadHrFile(`payslip-${employee.id}-${slip.month}.txt`, payslipText(shown, employee))}><FileText className="mr-1 size-3.5" />Download</Button></div>
    </div>
  </HrModal>;
}

function MyPayslips({ actorId }: { actorId: string }) {
  const { employees, payrollRuns } = useHrPeopleStore();
  const employee = employees.find((item) => item.id === actorId);
  const [open, setOpen] = React.useState<Line | null>(null);
  if (!employee) return <HrPanel title="My payslips"><HrEmpty>This account is not linked to an employee record.</HrEmpty></HrPanel>;
  const rows = payrollRuns.flatMap((run) => { const key = runKey(run); const slip = buildPayslip(employee, key); return slip ? [{ run, key, slip, published: run.status === "locked" || key < "2026-10" }] : []; });
  return <div className="space-y-5">
    <HrPanel title="My payslips" description="A payslip appears here after payroll for that month is locked.">
      {rows.length ? <ul className="divide-y divide-border">{rows.map(({ key, slip, published }) => <li key={key} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm"><div><p className="font-medium">{slip.label}</p><p className="text-xs text-muted-foreground">{published ? `Net pay ${hrMoney(slip.net)}` : "Payroll is under review. Your payslip is not ready yet."}</p></div>{published ? <Button size="sm" variant="outline" onClick={() => setOpen({ employee, slip, previous: null, delta: 0, pct: null, flags: [] })}>View payslip</Button> : <HrStatus status="review" />}</li>)}</ul> : <HrEmpty>No payslips yet. They start from your joining month.</HrEmpty>}
    </HrPanel>
    {open && <PayslipDialog line={open} published onClose={() => setOpen(null)} />}
  </div>;
}
