"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { exitChecklist, lifecycleEvent, lifecycleId, useHrLifecycleStore, type HrClearanceOwner, type HrExitRecord } from "@/lib/stores/hr-lifecycle-store";
import { canManageHr } from "@/lib/hr-people-access";
import { HrEmpty, HrField, HrModal, HrPanel, HrStats, HrStatus, hrDate, hrInputClass, hrToday } from "@/components/hr-people/operations-ui";
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
  const actorName = employees.find((item) => item.id === actorId)?.name ?? "HR";
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
      <div><h3 className="mb-2 text-sm font-semibold">Activity</h3><ol className="divide-y divide-border border border-border text-sm">{exit.events.map((event) => <li key={event.id} className="px-4 py-2"><p>{event.text}</p><p className="text-xs text-muted-foreground">{event.actor} · {dateTime(event.at)}</p></li>)}{!exit.events.length && <li className="px-4 py-3 text-xs text-muted-foreground">No activity yet.</li>}</ol><p className="mt-2 text-[11px] text-muted-foreground">Acting as {actorName}. Demo records stay in this browser.</p></div>
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
