"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Clock3, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { lifecycleEvent, useHrLifecycleStore } from "@/lib/stores/hr-lifecycle-store";
import { canManageHr } from "@/lib/hr-people-access";
import { HrEmpty, HrField, HrModal, HrPanel, HrStats, HrStatus, hrDate, hrInputClass, hrToday } from "@/components/hr-people/operations-ui";
import type { HrDemoRole, HrEmployee, HrOnboardingTask } from "@/lib/types";

type Owner = HrOnboardingTask["ownerRole"];
const ownerLabels: Record<Owner, string> = { employee: "Employee", manager: "Manager", hr: "HR", finance: "Finance", it: "IT" };
export const standardTasks: { title: string; ownerRole: Owner; days: number }[] = [
  { title: "Send offer and employment agreement", ownerRole: "hr", days: 2 },
  { title: "Upload identity and bank account proof", ownerRole: "employee", days: 5 },
  { title: "Sign NDA and policy acknowledgements", ownerRole: "employee", days: 5 },
  { title: "Assign reporting manager and first-week plan", ownerRole: "manager", days: 3 },
  { title: "Set up laptop, email and workspace access", ownerRole: "it", days: 3 },
  { title: "Create payroll profile", ownerRole: "finance", days: 7 },
];
const when = (value: string) => new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const addDays = (days: number) => { const date = new Date(`${hrToday()}T12:00:00`); date.setDate(date.getDate() + days); return date.toLocaleDateString("en-CA"); };
const documentTask = /document|proof|sign|nda|offer|acknowledg/i;

function canActOn(task: HrOnboardingTask, role: HrDemoRole, actorId: string, employee?: HrEmployee) {
  if (canManageHr(role)) return true;
  if (task.ownerRole === "employee") return task.employeeId === actorId;
  if (task.ownerRole === "manager") return employee?.managerId === actorId;
  if (task.ownerRole === "finance") return role === "payroll_admin";
  return false;
}

export function HrOnboardingView({ role, actorId, personal = false }: { role: HrDemoRole; actorId: string; personal?: boolean }) {
  const { employees, onboardingTasks, updateOnboardingTask, addOnboardingTask, updateEmployee } = useHrPeopleStore();
  const notesByEmployee = useHrLifecycleStore((state) => state.onboardingNotes);
  const addNote = useHrLifecycleStore((state) => state.addOnboardingNote);
  const manager = canManageHr(role);
  const actorName = employees.find((item) => item.id === actorId)?.name ?? "HR";
  const caseIds = [...new Set([...onboardingTasks.map((task) => task.employeeId), ...employees.filter((item) => item.status === "onboarding").map((item) => item.id)])];
  const cases = employees.filter((item) => caseIds.includes(item.id) && (personal ? item.id === actorId : manager || role === "payroll_admin" || item.managerId === actorId));
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [note, setNote] = React.useState("");
  const selected = cases.find((item) => item.id === selectedId) ?? cases[0];
  const progress = (id: string) => { const tasks = onboardingTasks.filter((task) => task.employeeId === id); return tasks.length ? Math.round((tasks.filter((task) => task.status === "done").length / tasks.length) * 100) : 0; };
  const all = onboardingTasks.filter((task) => cases.some((item) => item.id === task.employeeId));
  const overdue = all.filter((task) => task.status !== "done" && task.dueAt < hrToday());

  function setStatus(task: HrOnboardingTask, status: HrOnboardingTask["status"]) {
    updateOnboardingTask(task.id, status);
    const tasks = onboardingTasks.map((item) => item.id === task.id ? { ...item, status } : item).filter((item) => item.employeeId === task.employeeId);
    updateEmployee(task.employeeId, { onboardingPercent: Math.round((tasks.filter((item) => item.status === "done").length / tasks.length) * 100) });
    addNote(task.employeeId, lifecycleEvent(actorName, `${status === "done" ? "Completed" : status === "in_progress" ? "Started" : "Reopened"}: ${task.title}.`));
    if (status === "done") toast.success("Task completed");
  }
  function createStandard(employee: HrEmployee) {
    standardTasks.forEach((item, index) => addOnboardingTask({ id: `onb-${crypto.randomUUID()}`, employeeId: employee.id, employeeName: employee.name, title: item.title, ownerRole: item.ownerRole, status: "todo", dueAt: addDays(item.days + index * 0) }));
    addNote(employee.id, lifecycleEvent(actorName, "Standard onboarding checklist created."));
    toast.success("Standard checklist created");
  }
  function complete(employee: HrEmployee) {
    updateEmployee(employee.id, { status: "active", onboardingPercent: 100, documentsDue: 0 });
    addNote(employee.id, lifecycleEvent(actorName, "Onboarding completed. Employee is now active."));
    toast.success(`${employee.name} is now an active employee`);
  }

  if (!cases.length) return <HrPanel title={personal ? "My onboarding" : "Onboarding"}><HrEmpty>{personal ? "You have no onboarding checklist. It appears here when you join." : "Nobody is onboarding right now. Accepted candidates appear here after you start onboarding from Recruitment."}</HrEmpty></HrPanel>;
  const tasks = selected ? onboardingTasks.filter((task) => task.employeeId === selected.id).sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || a.dueAt.localeCompare(b.dueAt)) : [];
  const done = tasks.filter((task) => task.status === "done").length;
  const notes = selected ? notesByEmployee[selected.id] ?? [] : [];

  return <div className="space-y-5">
    {!personal && <HrStats items={[{ label: "People onboarding", value: cases.filter((item) => item.status === "onboarding").length, hint: "Not yet active" }, { label: "Open tasks", value: all.filter((task) => task.status !== "done").length, hint: `${all.length} in total` }, { label: "Overdue", value: overdue.length, hint: overdue.length ? "Past their due date" : "Everything on time" }, { label: "Ready to complete", value: cases.filter((item) => item.status === "onboarding" && progress(item.id) === 100).length, hint: "All tasks done" }]} />}
    <div className={personal ? "" : "grid gap-4 xl:grid-cols-[300px_1fr]"}>
      {!personal && <HrPanel title="New joiners"><ul className="divide-y divide-border">{cases.map((item) => <li key={item.id}><button type="button" aria-current={selected?.id === item.id} onClick={() => setSelectedId(item.id)} className={`w-full px-5 py-3 text-left hover:bg-surface-2 ${selected?.id === item.id ? "bg-surface-2" : ""}`}><div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{item.name}</span><HrStatus status={item.status} /></div><p className="mt-1 text-xs text-muted-foreground">{item.title} · joins {hrDate(item.joiningDate)}</p><div className="mt-2 h-1.5 bg-surface-2" aria-hidden><div className="h-1.5 bg-accent" style={{ width: `${progress(item.id)}%` }} /></div></button></li>)}</ul></HrPanel>}
      {selected && <div className="space-y-5">
        <HrPanel title={personal ? "My onboarding checklist" : `${selected.name} · checklist`} description={`${selected.title} · ${selected.department} · reports to ${selected.managerName ?? "—"} · joining ${hrDate(selected.joiningDate)}`} actions={<div className="flex items-center gap-2">{manager && <Button size="sm" variant="outline" onClick={() => setAdding(true)}><Plus className="mr-1 size-3.5" />Add task</Button>}{manager && selected.status === "onboarding" && <Button size="sm" disabled={!tasks.length || done < tasks.length} title={done < tasks.length ? "Finish every task first" : undefined} onClick={() => complete(selected)}>Complete onboarding</Button>}</div>}>
          <div className="border-b border-border px-5 py-3"><div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>Progress</span><span>{done} of {tasks.length} done</span></div><div className="h-2 bg-surface-2" role="progressbar" aria-label="Onboarding progress" aria-valuemin={0} aria-valuemax={tasks.length} aria-valuenow={done}><div className="h-2 bg-accent" style={{ width: `${tasks.length ? (done / tasks.length) * 100 : 0}%` }} /></div></div>
          {tasks.length ? <ul className="divide-y divide-border">{tasks.map((task) => { const allowed = canActOn(task, role, actorId, selected); const late = task.status !== "done" && task.dueAt < hrToday(); return <li key={task.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <span className={`flex size-8 shrink-0 items-center justify-center ${task.status === "done" ? "bg-success-muted text-success" : "bg-accent-muted text-accent"}`}>{task.status === "done" ? <Check className="size-4" /> : <Clock3 className="size-4" />}</span>
            <div className="min-w-0 flex-1"><p className={`text-sm font-medium ${task.status === "done" ? "text-muted-foreground line-through" : ""}`}>{task.title}</p><p className="text-xs text-muted-foreground"><span className="mr-2 border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide">{ownerLabels[task.ownerRole]}</span><span className={late ? "text-danger" : ""}>{late ? "Overdue · " : "Due "}{hrDate(task.dueAt)}</span>{!allowed && task.status !== "done" && ` · waiting on ${ownerLabels[task.ownerRole]}`}</p></div>
            <HrStatus status={task.status} />
            {personal && task.status !== "done" && allowed && documentTask.test(task.title) && <Button size="sm" variant="outline" asChild><Link href="/workspace/hr-people?view=my-documents&workspace=hr-people">Open documents</Link></Button>}
            {allowed && (task.status === "todo" ? <Button size="sm" variant="outline" onClick={() => setStatus(task, "in_progress")}>Start</Button> : null)}
            {allowed && (task.status === "done" ? (manager && <Button size="sm" variant="ghost" onClick={() => setStatus(task, "todo")}>Reopen</Button>) : <Button size="sm" onClick={() => setStatus(task, "done")}>Mark done</Button>)}
          </li>; })}</ul> : <div className="space-y-3 p-6 text-center"><HrEmpty>No checklist yet.</HrEmpty>{manager && <Button onClick={() => createStandard(selected)}>Create standard checklist</Button>}</div>}
        </HrPanel>
        <HrPanel title="Notes & activity" description={personal ? "Ask HR a question or leave an update. Task changes appear here too." : "Visible to HR and the people involved in this onboarding."}>
          <form className="flex gap-2 border-b border-border p-4" onSubmit={(event) => { event.preventDefault(); if (!note.trim()) return; addNote(selected.id, lifecycleEvent(actorName, note.trim())); setNote(""); }}><Textarea aria-label="Onboarding note" rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder={personal ? "Write a note for HR" : "Add a note"} className="rounded-none text-sm" /><Button disabled={!note.trim()}>Add note</Button></form>
          {notes.length ? <ol className="divide-y divide-border text-sm">{notes.map((item) => <li key={item.id} className="px-5 py-2"><p>{item.text}</p><p className="text-xs text-muted-foreground">{item.actor} · {when(item.at)}</p></li>)}</ol> : <HrEmpty>No notes yet.</HrEmpty>}
        </HrPanel>
      </div>}
    </div>
    {adding && selected && <AddTaskDialog employee={selected} onClose={() => setAdding(false)} onAdd={(task) => { addOnboardingTask(task); addNote(selected.id, lifecycleEvent(actorName, `Task added: ${task.title} (${ownerLabels[task.ownerRole]}, due ${hrDate(task.dueAt)}).`)); setAdding(false); }} />}
  </div>;
}

function AddTaskDialog({ employee, onClose, onAdd }: { employee: HrEmployee; onClose: () => void; onAdd: (task: HrOnboardingTask) => void }) {
  const [title, setTitle] = React.useState("");
  const [ownerRole, setOwnerRole] = React.useState<Owner>("hr");
  const [dueAt, setDueAt] = React.useState(addDays(3));
  const error = !title.trim() ? "Describe the task." : dueAt < hrToday() ? "The due date cannot be in the past." : "";
  return <HrModal open onOpenChange={(value) => !value && onClose()} title={`Add task for ${employee.name}`} description="Every task needs an owner and a due date.">
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (!error) onAdd({ id: `onb-${crypto.randomUUID()}`, employeeId: employee.id, employeeName: employee.name, title: title.trim(), ownerRole, status: "todo", dueAt }); }}>
      <HrField label="Task"><Input required maxLength={140} value={title} onChange={(event) => setTitle(event.target.value)} className="rounded-none" placeholder="e.g. Issue safety kit" /></HrField>
      <div className="grid gap-4 sm:grid-cols-2"><HrField label="Owner"><select className={hrInputClass} value={ownerRole} onChange={(event) => setOwnerRole(event.target.value as Owner)}>{(Object.keys(ownerLabels) as Owner[]).map((item) => <option key={item} value={item}>{ownerLabels[item]}</option>)}</select></HrField><HrField label="Due date"><Input type="date" min={hrToday()} value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="rounded-none" /></HrField></div>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={Boolean(error)} title={error || undefined}>Add task</Button></div>
    </form>
  </HrModal>;
}
