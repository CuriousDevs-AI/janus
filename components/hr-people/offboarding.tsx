"use client";

import * as React from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { exitChecklist, lifecycleEvent, lifecycleId, useHrLifecycleStore, type HrClearanceOwner, type HrExitRecord } from "@/lib/stores/hr-lifecycle-store";
import { actorDisplayName, canManageHr } from "@/lib/hr-people-access";
import { downloadHrCsv, HrEmpty, HrField, HrModal, HrPanel, HrStats, HrStatus, hrDate, hrInputClass, hrMoney, hrToday } from "@/components/hr-people/operations-ui";
import type { HrDemoRole } from "@/lib/types";

const ownerLabels: Record<HrClearanceOwner, string> = { manager: "Manager", hr: "HR", finance: "Finance", it: "IT", operations: "Operations", employee: "Employee" };
const dateTime = (value: string) => new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** Which exit tasks a preview role may tick off. HR and the owner can close any task. */
function canActOnTask(role: HrDemoRole, owner: HrClearanceOwner) {
  if (canManageHr(role)) return true;
  if (role === "reporting_manager") return owner === "manager" || owner === "operations";
  if (role === "payroll_admin") return owner === "finance";
  return false;
}

export function HrOffboardingView({ role, actorId }: { role: HrDemoRole; actorId: string }) {
  const { employees, updateEmployee } = useHrPeopleStore();
  const { exits, addExit, updateExit, updateExitTask } = useHrLifecycleStore();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [starting, setStarting] = React.useState(false);
  const manager = canManageHr(role);
  const actorName = actorDisplayName(employees.find((item) => item.id === actorId)?.name);
  const visible = exits.filter((exit) => manager || role === "payroll_admin" || employees.find((item) => item.id === exit.employeeId)?.managerId === actorId);
  const selected = visible.find((exit) => exit.id === selectedId) ?? visible.find((exit) => !["completed", "cancelled"].includes(exit.status)) ?? visible[0];
  const open = visible.filter((exit) => !["completed", "cancelled"].includes(exit.status));
  const tasks = open.flatMap((exit) => exit.tasks);
  const nextDay = open.map((exit) => exit.lastWorkingDay).sort()[0];

  function finish(exit: HrExitRecord) {
    updateExit(exit.id, { status: "completed", events: [lifecycleEvent(actorName, "Exit completed. Employee record archived."), ...exit.events] });
    updateEmployee(exit.employeeId, { status: "archived" });
    toast.success("Exit completed and employee archived");
  }
  function cancel(exit: HrExitRecord) {
    updateExit(exit.id, { status: "cancelled", events: [lifecycleEvent(actorName, "Exit cancelled. Employee returned to active."), ...exit.events] });
    updateEmployee(exit.employeeId, { status: "active" });
    toast.success("Exit cancelled");
  }

  return <div className="space-y-5">
    <HrStats items={[{ label: "Open exits", value: open.length, hint: "Employees serving notice" }, { label: "Clearance tasks done", value: tasks.length ? `${Math.round((tasks.filter((task) => task.done).length / tasks.length) * 100)}%` : "—", hint: `${tasks.filter((task) => !task.done).length} still open` }, { label: "Next last working day", value: nextDay ? hrDate(nextDay) : "—", hint: nextDay ? "Earliest among open exits" : "No open exits" }, { label: "Completed", value: visible.filter((exit) => exit.status === "completed").length, hint: "Archived after exit" }]} />
    <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
      <HrPanel title="Exit cases" actions={manager ? <Button size="sm" onClick={() => setStarting(true)}>Start exit</Button> : undefined}>
        {visible.length ? <ul className="divide-y divide-border">{visible.map((exit) => { const person = employees.find((item) => item.id === exit.employeeId); const done = exit.tasks.filter((task) => task.done).length; return <li key={exit.id}><button type="button" onClick={() => setSelectedId(exit.id)} aria-current={selected?.id === exit.id} className={`w-full px-5 py-3 text-left hover:bg-surface-2 ${selected?.id === exit.id ? "bg-surface-2" : ""}`}><div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{person?.name ?? exit.employeeId}</span><HrStatus status={exit.status} /></div><p className="mt-1 text-xs text-muted-foreground">Last day {hrDate(exit.lastWorkingDay)} · {done}/{exit.tasks.length} tasks</p></button></li>; })}</ul> : <HrEmpty>No exit cases{manager ? ". Use Start exit when someone resigns." : " are assigned to your role."}</HrEmpty>}
      </HrPanel>
      {selected ? <ExitDetail key={selected.id} exit={selected} role={role} actorName={actorName} manager={manager} onTask={(taskId, done, note) => updateExitTask(selected.id, taskId, done, note, actorName)} onFinish={() => finish(selected)} onCancel={() => cancel(selected)} onLastDay={(day) => updateExit(selected.id, { lastWorkingDay: day, events: [lifecycleEvent(actorName, `Last working day changed to ${hrDate(day)}.`), ...selected.events] })} /> : <HrPanel title="Exit case"><HrEmpty>Select an exit case to see its clearance checklist.</HrEmpty></HrPanel>}
    </div>
    {starting && <StartExitDialog onClose={() => setStarting(false)} onStart={(record) => { addExit(record); updateEmployee(record.employeeId, { status: "notice" }); setSelectedId(record.id); setStarting(false); toast.success("Exit started with the standard clearance checklist"); }} actorName={actorName} />}
  </div>;
}

function ExitDetail({ exit, role, actorName, manager, onTask, onFinish, onCancel, onLastDay }: { exit: HrExitRecord; role: HrDemoRole; actorName: string; manager: boolean; onTask: (taskId: string, done: boolean, note: string) => void; onFinish: () => void; onCancel: () => void; onLastDay: (day: string) => void }) {
  const employee = useHrPeopleStore((state) => state.employees.find((item) => item.id === exit.employeeId));
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const closed = ["completed", "cancelled"].includes(exit.status);
  const done = exit.tasks.filter((task) => task.done).length;
  const allDone = done === exit.tasks.length;
  return <HrPanel title={employee?.name ?? exit.employeeId} description={`${employee?.title ?? ""} · ${employee?.department ?? ""} · Requested ${hrDate(exit.requestedAt)}`} actions={<HrStatus status={exit.status} />}>
    <div className="space-y-5 p-5">
      <div className="grid gap-3 sm:grid-cols-2"><div className="border border-border p-3"><p className="text-[11px] text-muted-foreground">Reason</p><p className="mt-1 text-sm">{exit.reason || "Not recorded"}</p></div><div className="border border-border p-3"><p className="text-[11px] text-muted-foreground">Last working day</p>{manager && !closed ? <Input aria-label="Last working day" type="date" className="mt-1 h-8 rounded-none" min={exit.requestedAt} value={exit.lastWorkingDay} onChange={(event) => event.target.value && onLastDay(event.target.value)} /> : <p className="mt-1 text-sm">{hrDate(exit.lastWorkingDay)}</p>}</div></div>
      <div><div className="mb-2 flex items-center justify-between text-xs text-muted-foreground"><span>Clearance progress</span><span>{done} of {exit.tasks.length}</span></div><div className="h-2 bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={exit.tasks.length} aria-valuenow={done} aria-label="Clearance progress"><div className="h-2 bg-accent" style={{ width: `${(done / exit.tasks.length) * 100}%` }} /></div></div>
      <ul className="divide-y divide-border border border-border">{exit.tasks.map((task) => { const allowed = !closed && canActOnTask(role, task.owner); const note = notes[task.id] ?? task.note; return <li key={task.id} className="space-y-2 px-4 py-3">
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={task.done} disabled={!allowed} onChange={(event) => onTask(task.id, event.target.checked, note)} /><span className="flex-1"><span className={task.done ? "text-muted-foreground line-through" : ""}>{task.title}</span><span className="ml-2 border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{ownerLabels[task.owner]}</span>{task.completedAt && <span className="mt-0.5 block text-xs text-muted-foreground">Done {dateTime(task.completedAt)}</span>}</span></label>
        {(allowed || task.note) && <Textarea aria-label={`Note for ${task.title}`} rows={1} disabled={!allowed} placeholder="Add a note for the record" value={note} onChange={(event) => setNotes({ ...notes, [task.id]: event.target.value })} onBlur={() => notes[task.id] !== undefined && notes[task.id] !== task.note && onTask(task.id, task.done, notes[task.id])} className="ml-7 min-h-9 w-[calc(100%-1.75rem)] rounded-none text-xs" />}
        {!allowed && !closed && <p className="ml-7 text-[11px] text-muted-foreground">Only {ownerLabels[task.owner]} or HR can update this task.</p>}
      </li>; })}</ul>
      {manager && !closed && <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={onCancel}>Cancel exit</Button><Button onClick={onFinish} disabled={!allDone}>{allDone ? "Complete exit and archive" : "Finish all tasks to complete"}</Button></div>}
      {manager && !closed && employee && <FnfSettlement employee={employee} exit={exit} />}
      {manager && !closed && <ExitInterviewPanel exitId={exit.id} onSave={() => toast.success("Exit interview saved")} />}
      <div><h3 className="mb-2 text-sm font-semibold">Activity</h3><ol className="divide-y divide-border border border-border text-sm">{exit.events.map((event) => <li key={event.id} className="px-4 py-2"><p>{event.text}</p><p className="text-xs text-muted-foreground">{event.actor} · {dateTime(event.at)}</p></li>)}{!exit.events.length && <li className="px-4 py-3 text-xs text-muted-foreground">No activity yet.</li>}</ol><p className="mt-2 text-[11px] text-muted-foreground">Acting as {actorName}.</p></div>
    </div>
  </HrPanel>;
}

function StartExitDialog({ onClose, onStart, actorName }: { onClose: () => void; onStart: (record: HrExitRecord) => void; actorName: string }) {
  const { employees } = useHrPeopleStore();
  const exits = useHrLifecycleStore((state) => state.exits);
  const eligible = employees.filter((item) => item.status !== "archived" && item.status !== "notice" && !exits.some((exit) => exit.employeeId === item.id && !["completed", "cancelled"].includes(exit.status)));
  const [employeeId, setEmployeeId] = React.useState(eligible[0]?.id ?? "");
  const [lastDay, setLastDay] = React.useState("");
  const [reason, setReason] = React.useState("");
  const error = !employeeId ? "Choose an employee." : !lastDay ? "Choose the last working day." : lastDay < hrToday() ? "The last working day cannot be in the past." : "";
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (error) return;
    onStart({ id: `exit-${lifecycleId()}`, employeeId, requestedAt: hrToday(), lastWorkingDay: lastDay, reason: reason.trim(), status: "requested", tasks: exitChecklist(), events: [lifecycleEvent(actorName, "Exit started with the standard clearance checklist.")] });
  }
  return <HrModal open onOpenChange={(value) => !value && onClose()} title="Start an exit" description="Creates the clearance checklist and moves the employee to notice period.">
    {eligible.length ? <form onSubmit={submit} className="space-y-4">
      <HrField label="Employee"><select className={hrInputClass} value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>{eligible.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.title}</option>)}</select></HrField>
      <HrField label="Last working day"><Input type="date" min={hrToday()} value={lastDay} onChange={(event) => setLastDay(event.target.value)} className="rounded-none" /></HrField>
      <HrField label="Reason · optional"><Textarea value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} className="rounded-none" /></HrField>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={Boolean(error)} title={error || undefined}>Start exit</Button></div>
    </form> : <HrEmpty>Every active employee already has an exit in progress.</HrEmpty>}
  </HrModal>;
}

function FnfSettlement({ employee, exit }: { employee: { id: string; name: string; salaryMonthly: number; joiningDate: string; title: string; department: string }; exit: HrExitRecord }) {
  const today = hrToday();
  const daily = Math.round(employee.salaryMonthly / 30);
  const lwd = exit.lastWorkingDay;
  const lwdDate = new Date(`${lwd}T12:00:00`);
  const daysWorked = lwdDate.getDate();
  const pendingSalary = daily * daysWorked;

  const leaveBalance = 12;
  const leaveEncashment = leaveBalance * daily;

  const joiningDate = new Date(`${employee.joiningDate}T12:00:00`);
  const tenureMs = lwdDate.getTime() - joiningDate.getTime();
  const tenureYears = tenureMs / (365.25 * 86400000);
  const gratuity = tenureYears >= 5 ? Math.round((15 / 26) * employee.salaryMonthly * Math.floor(tenureYears)) : 0;

  const noticeDays = 30;
  const daysUntilLwd = Math.ceil((lwdDate.getTime() - new Date(`${today}T12:00:00`).getTime()) / 86400000);
  const noticeShortfall = Math.max(0, noticeDays - Math.max(0, daysUntilLwd));
  const noticeRecovery = noticeShortfall * daily;

  const bonusProration = Math.round((employee.salaryMonthly * (lwdDate.getMonth() >= 3 ? lwdDate.getMonth() - 3 : lwdDate.getMonth() + 9)) / 12);
  const loanOutstanding = 0;

  const payable = pendingSalary + leaveEncashment + gratuity + bonusProration;
  const deductions = noticeRecovery + loanOutstanding;
  const netFnf = payable - deductions;

  function downloadFnf() {
    const lines = [
      `FULL & FINAL SETTLEMENT STATEMENT`,
      `${"=".repeat(50)}`,
      `Employee: ${employee.name} (${employee.id.toUpperCase()})`,
      `Designation: ${employee.title} · ${employee.department}`,
      `Date of joining: ${hrDate(employee.joiningDate)}`,
      `Last working day: ${hrDate(lwd)}`,
      `Tenure: ${tenureYears.toFixed(1)} years`,
      ``,
      `PAYABLE`,
      `  Pending salary (${daysWorked} days)      ${hrMoney(pendingSalary)}`,
      `  Leave encashment (${leaveBalance} days)   ${hrMoney(leaveEncashment)}`,
      `  Bonus proration                       ${hrMoney(bonusProration)}`,
      gratuity > 0 ? `  Gratuity (${Math.floor(tenureYears)} years)             ${hrMoney(gratuity)}` : null,
      `  ────────────────────────────`,
      `  Total payable                         ${hrMoney(payable)}`,
      ``,
      `DEDUCTIONS`,
      noticeRecovery > 0 ? `  Notice period recovery (${noticeShortfall} days)  ${hrMoney(noticeRecovery)}` : `  Notice period recovery                ₹0`,
      loanOutstanding > 0 ? `  Loan outstanding                      ${hrMoney(loanOutstanding)}` : null,
      `  ────────────────────────────`,
      `  Total deductions                      ${hrMoney(deductions)}`,
      ``,
      `${"=".repeat(50)}`,
      `  NET F&F AMOUNT                        ${hrMoney(netFnf)}`,
      `${"=".repeat(50)}`,
      ``,
      `Generated on ${hrDate(today)} · This is a provisional computation.`,
    ].filter(Boolean).join("\n");
    const blob = new Blob([lines], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fnf-${employee.id}-${lwd}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("F&F statement downloaded");
  }

  return <div className="space-y-3">
    <h3 className="text-sm font-semibold">Full & Final Settlement</h3>
    <p className="text-xs text-muted-foreground">Provisional computation based on current salary and standard assumptions. Actual amounts may vary after payroll reconciliation.</p>
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="border border-border">
        <div className="bg-surface-2 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payable</div>
        <div className="divide-y divide-border">
          <FnfRow label={`Pending salary (${daysWorked} days in month)`} amount={pendingSalary} />
          <FnfRow label={`Leave encashment (${leaveBalance} days unused)`} amount={leaveEncashment} />
          <FnfRow label="Bonus proration" amount={bonusProration} />
          {gratuity > 0 && <FnfRow label={`Gratuity (${Math.floor(tenureYears)} years, ≥5yr eligible)`} amount={gratuity} />}
          <div className="flex items-center justify-between bg-surface-2 px-4 py-2 text-sm font-semibold"><span>Total payable</span><span>{hrMoney(payable)}</span></div>
        </div>
      </div>
      <div className="border border-border">
        <div className="bg-surface-2 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deductions</div>
        <div className="divide-y divide-border">
          <FnfRow label={noticeShortfall > 0 ? `Notice period recovery (${noticeShortfall} days short)` : "Notice period recovery"} amount={noticeRecovery} />
          {loanOutstanding > 0 && <FnfRow label="Loan outstanding" amount={loanOutstanding} />}
          <div className="flex items-center justify-between bg-surface-2 px-4 py-2 text-sm font-semibold"><span>Total deductions</span><span>{hrMoney(deductions)}</span></div>
        </div>
      </div>
    </div>
    <div className="flex items-center justify-between border-2 border-accent bg-accent-muted px-4 py-3">
      <span className="text-sm font-semibold">Net F&F Amount</span>
      <span className="text-lg font-bold">{hrMoney(netFnf)}</span>
    </div>
    <div className="flex items-center justify-between">
      <p className="text-[11px] text-muted-foreground">Tenure: {tenureYears.toFixed(1)} years · Daily rate: {hrMoney(daily)}{gratuity === 0 && tenureYears < 5 ? " · Gratuity not applicable (< 5 years)" : ""}</p>
      <Button size="sm" variant="outline" onClick={downloadFnf}><Download className="mr-1 size-3.5" />Download F&F statement</Button>
    </div>
  </div>;
}

function FnfRow({ label, amount }: { label: string; amount: number }) {
  return <div className="flex items-center justify-between px-4 py-2 text-sm"><span className="text-muted-foreground">{label}</span><span className="font-medium">{amount > 0 ? hrMoney(amount) : "₹0"}</span></div>;
}

const exitReasons = ["Better opportunity", "Compensation", "Work-life balance", "Management", "Relocation", "Personal reasons", "Career growth", "Higher education", "Health", "Other"] as const;

const exitInterviewStore = new Map<string, ExitInterviewData>();

function ExitInterviewPanel({ exitId, onSave }: { exitId: string; onSave: () => void }) {
  const existing = exitInterviewStore.get(exitId);
  const [reason, setReason] = React.useState(existing?.reason ?? "");
  const [enjoyed, setEnjoyed] = React.useState(existing?.enjoyed ?? "");
  const [improve, setImprove] = React.useState(existing?.improve ?? "");
  const [wouldReturn, setWouldReturn] = React.useState<"yes" | "no" | "maybe">(existing?.wouldReturn ?? "maybe");
  const [rating, setRating] = React.useState(existing?.rating ?? 3);
  const [feedback, setFeedback] = React.useState(existing?.feedback ?? "");
  const [saved, setSaved] = React.useState(Boolean(existing));

  function save() {
    const data: ExitInterviewData = { reason, enjoyed: enjoyed.trim(), improve: improve.trim(), wouldReturn, rating, feedback: feedback.trim(), savedAt: new Date().toISOString() };
    exitInterviewStore.set(exitId, data);
    onSave();
    setSaved(true);
  }

  return <div className="space-y-3">
    <h3 className="text-sm font-semibold">Exit Interview</h3>
    <p className="text-xs text-muted-foreground">{saved ? "Responses saved. These help retention analytics." : "Capture feedback before the employee leaves."}</p>
    <div className="grid gap-4 border border-border p-4">
      <HrField label="Primary reason for leaving">
        <select className={hrInputClass} value={reason} disabled={saved} onChange={(e) => setReason(e.target.value)}>
          <option value="">Choose…</option>
          {exitReasons.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </HrField>
      <HrField label="What did you enjoy most about working here?">
        <Textarea maxLength={500} disabled={saved} value={enjoyed} onChange={(e) => setEnjoyed(e.target.value)} className="rounded-none" placeholder="Team, culture, projects, learning…" />
      </HrField>
      <HrField label="What could we improve?">
        <Textarea maxLength={500} disabled={saved} value={improve} onChange={(e) => setImprove(e.target.value)} className="rounded-none" placeholder="Processes, communication, benefits…" />
      </HrField>
      <div className="grid gap-4 sm:grid-cols-2">
        <HrField label="Would you consider returning?">
          <select className={hrInputClass} value={wouldReturn} disabled={saved} onChange={(e) => setWouldReturn(e.target.value as "yes" | "no" | "maybe")}>
            <option value="yes">Yes</option><option value="maybe">Maybe</option><option value="no">No</option>
          </select>
        </HrField>
        <HrField label={`Overall experience: ${rating}/5`}>
          <div className="flex gap-1 py-1">{[1, 2, 3, 4, 5].map((star) => <button key={star} type="button" disabled={saved} onClick={() => setRating(star)} className={`size-8 border text-sm font-semibold ${star <= rating ? "border-accent bg-accent text-white" : "border-border text-muted-foreground"}`}>{star}</button>)}</div>
        </HrField>
      </div>
      <HrField label="Additional feedback (optional)">
        <Textarea maxLength={500} disabled={saved} value={feedback} onChange={(e) => setFeedback(e.target.value)} className="rounded-none" />
      </HrField>
      {!saved && <div className="flex justify-end"><Button size="sm" onClick={save} disabled={!reason}>Save interview</Button></div>}
    </div>
  </div>;
}

interface ExitInterviewData { reason: string; enjoyed: string; improve: string; wouldReturn: "yes" | "no" | "maybe"; rating: number; feedback: string; savedAt: string }
