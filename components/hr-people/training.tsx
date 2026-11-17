"use client";

import * as React from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { canManageHr } from "@/lib/hr-people-access";
import { HrEmpty, HrField, HrModal, HrPanel, HrStats, HrStatus, HrTable, hrCell, hrDate, hrInputClass, hrToday } from "@/components/hr-people/operations-ui";
import type { HrDemoRole } from "@/lib/types";

interface TrainingProgram { id: string; title: string; description: string; type: "mandatory" | "optional"; mode: "online" | "classroom"; durationHours: number; createdAt: string; dueAt: string | null }
interface TrainingAssignment { id: string; programId: string; employeeId: string; status: "assigned" | "in_progress" | "completed" | "overdue"; assignedAt: string; completedAt: string | null }

const defaultPrograms: TrainingProgram[] = [
  { id: "trn-001", title: "Workplace Safety & Compliance", description: "Annual workplace safety training covering fire safety, ergonomics and emergency procedures", type: "mandatory", mode: "online", durationHours: 2, createdAt: "2026-04-01", dueAt: "2027-03-31" },
  { id: "trn-002", title: "POSH Awareness Training", description: "Prevention of Sexual Harassment at Workplace — mandatory under the POSH Act, 2013", type: "mandatory", mode: "online", durationHours: 1.5, createdAt: "2026-04-01", dueAt: "2027-03-31" },
  { id: "trn-003", title: "Data Privacy & Information Security", description: "Handling sensitive data, password hygiene, phishing awareness and IT security policy", type: "mandatory", mode: "online", durationHours: 1, createdAt: "2026-07-01", dueAt: "2026-12-31" },
  { id: "trn-004", title: "Leadership Development Program", description: "For reporting managers — communication, delegation, feedback and team building", type: "optional", mode: "classroom", durationHours: 8, createdAt: "2026-10-01", dueAt: null },
  { id: "trn-005", title: "Sales Methodology — SPIN Selling", description: "Situation, Problem, Implication, Need-payoff framework for the sales team", type: "optional", mode: "online", durationHours: 4, createdAt: "2026-09-01", dueAt: null },
  { id: "trn-006", title: "First Aid & Emergency Response", description: "Basic first aid, CPR awareness and emergency evacuation procedures", type: "optional", mode: "classroom", durationHours: 3, createdAt: "2026-06-01", dueAt: null },
];

function seedAssignments(active: { id: string }[], today: string): TrainingAssignment[] {
  const seed: TrainingAssignment[] = [];
  for (const p of defaultPrograms.filter((item) => item.type === "mandatory")) {
    for (let i = 0; i < active.length; i++) {
      const e = active[i];
      const done = (p.id.charCodeAt(4) + i) % 3 !== 0;
      seed.push({ id: `ta-${p.id}-${e.id}`, programId: p.id, employeeId: e.id, status: done ? "completed" : p.dueAt && p.dueAt < today ? "overdue" : "assigned", assignedAt: p.createdAt, completedAt: done ? `2026-${String(((p.id.charCodeAt(4) + i) % 6) + 5).padStart(2, "0")}-${String(((p.id.charCodeAt(4) + i) % 20) + 1).padStart(2, "0")}` : null });
    }
  }
  return seed;
}

export function HrTrainingView({ role, actorId }: { role: HrDemoRole; actorId: string }) {
  const { employees } = useHrPeopleStore();
  const hr = canManageHr(role);
  const today = hrToday();
  const active = React.useMemo(() => employees.filter((e) => e.status !== "archived"), [employees]);
  const [programs, setPrograms] = React.useState(defaultPrograms);
  const [assignments, setAssignments] = React.useState<TrainingAssignment[]>(() => seedAssignments(active, today));
  const [adding, setAdding] = React.useState(false);

  const totalAssigned = assignments.length;
  const totalCompleted = assignments.filter((a) => a.status === "completed").length;
  const completionRate = totalAssigned ? Math.round((totalCompleted / totalAssigned) * 100) : 0;
  const overdue = assignments.filter((a) => a.status === "overdue").length;
  const myAssignments = assignments.filter((a) => a.employeeId === actorId);

  function updateStatus(assignmentId: string, status: TrainingAssignment["status"]) {
    setAssignments((prev) => prev.map((a) => a.id === assignmentId ? { ...a, status, completedAt: status === "completed" ? today : a.completedAt } : a));
    toast.success(status === "completed" ? "Training marked as complete" : "Training started");
  }

  function addProgram(program: TrainingProgram, assignTo: "all" | string) {
    setPrograms((prev) => [...prev, program]);
    const targets = assignTo === "all" ? active : active.filter((e) => e.department === assignTo);
    const created: TrainingAssignment[] = targets.map((e) => ({ id: `ta-${program.id}-${e.id}`, programId: program.id, employeeId: e.id, status: "assigned" as const, assignedAt: today, completedAt: null }));
    setAssignments((prev) => [...prev, ...created]);
    toast.success(`${program.title} assigned to ${created.length} people`);
    setAdding(false);
  }

  return <div className="space-y-5">
    <HrStats items={[
      { label: "Programs", value: programs.length, hint: `${programs.filter((p) => p.type === "mandatory").length} mandatory` },
      { label: "Total assignments", value: totalAssigned, hint: `Across ${active.length} employees` },
      { label: "Completed", value: totalCompleted, hint: `${completionRate}% completion rate` },
      { label: "Overdue", value: overdue, hint: overdue ? "Past due date and not completed" : "Everything on track" },
    ]} />

    <HrPanel title="My training" description="Programs assigned to you. Complete mandatory training before the due date.">
      {myAssignments.length ? <ul className="divide-y divide-border">{myAssignments.map((a) => {
        const p = programs.find((pr) => pr.id === a.programId);
        if (!p) return null;
        return <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{p.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{p.type === "mandatory" ? "Mandatory" : "Optional"} · {p.mode} · {p.durationHours}h{p.dueAt ? ` · due ${hrDate(p.dueAt)}` : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            <HrStatus status={a.status} />
            {a.status === "assigned" && <Button size="sm" variant="outline" onClick={() => updateStatus(a.id, "in_progress")}>Start</Button>}
            {a.status !== "completed" && <Button size="sm" onClick={() => updateStatus(a.id, "completed")}>Mark complete</Button>}
          </div>
        </li>;
      })}</ul> : <HrEmpty>No training programs assigned to you yet.</HrEmpty>}
    </HrPanel>

    {hr && <HrPanel title="Training programs" description="Manage training programs and track completion across the organization." actions={<Button size="sm" onClick={() => setAdding(true)}><Plus className="mr-1 size-3.5" />Add program</Button>}>
      <HrTable headings={["Program", "Type", "Mode", "Duration", "Assigned", "Completed", "Rate", "Status"]}>{programs.map((p) => {
        const pa = assignments.filter((a) => a.programId === p.id);
        const pc = pa.filter((a) => a.status === "completed").length;
        const rate = pa.length ? Math.round((pc / pa.length) * 100) : 0;
        const status = p.dueAt && p.dueAt < today && rate < 100 ? "attention" : rate === 100 ? "completed" : "in_progress";
        return <tr key={p.id}>
          <td className={`${hrCell} font-medium`}><p>{p.title}</p><p className="mt-0.5 text-xs text-muted-foreground">{p.description}</p></td>
          <td className={hrCell}><HrStatus status={p.type} /></td>
          <td className={hrCell}>{p.mode}</td>
          <td className={hrCell}>{p.durationHours}h</td>
          <td className={hrCell}>{pa.length}</td>
          <td className={hrCell}>{pc}</td>
          <td className={hrCell}>{rate}%</td>
          <td className={hrCell}><HrStatus status={status} /></td>
        </tr>;
      })}</HrTable>
    </HrPanel>}

    {hr && (() => {
      const departments = [...new Set(active.map((e) => e.department))].sort();
      const mandatoryIds = new Set(programs.filter((p) => p.type === "mandatory").map((p) => p.id));
      return <HrPanel title="Completion by department" description="Mandatory training completion rates by department">
        <HrTable headings={["Department", "People", "Assigned", "Completed", "Rate"]}>{departments.map((dept) => {
          const deptIds = new Set(active.filter((e) => e.department === dept).map((e) => e.id));
          const da = assignments.filter((a) => deptIds.has(a.employeeId) && mandatoryIds.has(a.programId));
          const dc = da.filter((a) => a.status === "completed").length;
          const rate = da.length ? Math.round((dc / da.length) * 100) : 0;
          return <tr key={dept}>
            <td className={`${hrCell} font-medium`}>{dept}</td>
            <td className={hrCell}>{deptIds.size}</td>
            <td className={hrCell}>{da.length}</td>
            <td className={hrCell}>{dc}</td>
            <td className={hrCell}><div className="flex items-center gap-2"><div className="h-1.5 w-20 bg-surface-2"><div className="h-1.5 bg-accent" style={{ width: `${rate}%` }} /></div><span className="text-xs">{rate}%</span></div></td>
          </tr>;
        })}</HrTable>
      </HrPanel>;
    })()}

    {hr && (() => {
      type SkillLevel = "beginner" | "intermediate" | "advanced" | "expert";
      const skillMap: Record<string, { skill: string; level: SkillLevel }[]> = {};
      active.forEach((e) => {
        const done = assignments.filter((a) => a.employeeId === e.id && a.status === "completed");
        const skills = done.map((a) => {
          const p = programs.find((pr) => pr.id === a.programId);
          if (!p) return null;
          const level: SkillLevel = p.durationHours >= 8 ? "advanced" : p.durationHours >= 4 ? "intermediate" : "beginner";
          return { skill: p.title, level };
        }).filter(Boolean) as { skill: string; level: SkillLevel }[];
        if (skills.length) skillMap[e.id] = skills;
      });
      const levelColor: Record<SkillLevel, string> = { beginner: "bg-surface-3", intermediate: "bg-accent-muted", advanced: "bg-accent", expert: "bg-success" };
      const topEmployees = Object.entries(skillMap).sort((a, b) => b[1].length - a[1].length).slice(0, 10);
      return topEmployees.length > 0 && <HrPanel title="Skill matrix" description="Skills acquired through completed training. Level based on program duration.">
        <HrTable headings={["Employee", "Skills acquired", "Top level", "Details"]}>{topEmployees.map(([eid, skills]) => {
          const emp = active.find((e) => e.id === eid);
          const best: SkillLevel = skills.some((s) => s.level === "expert") ? "expert" : skills.some((s) => s.level === "advanced") ? "advanced" : skills.some((s) => s.level === "intermediate") ? "intermediate" : "beginner";
          return <tr key={eid}>
            <td className={`${hrCell} font-medium`}>{emp?.name ?? eid}<p className="text-xs text-muted-foreground">{emp?.department}</p></td>
            <td className={hrCell}>{skills.length}</td>
            <td className={hrCell}><span className={`inline-block px-2 py-0.5 text-xs capitalize ${levelColor[best]}`}>{best}</span></td>
            <td className={`${hrCell} max-w-60`}><div className="flex flex-wrap gap-1">{skills.map((s) => <span key={s.skill} className={`inline-block px-1.5 py-0.5 text-[10px] ${levelColor[s.level]}`} title={s.level}>{s.skill.slice(0, 25)}{s.skill.length > 25 ? "…" : ""}</span>)}</div></td>
          </tr>;
        })}</HrTable>
      </HrPanel>;
    })()}

    {!hr && myAssignments.length > 0 && (() => {
      const done = myAssignments.filter((a) => a.status === "completed").length;
      const totalHours = myAssignments.reduce((s, a) => { const p = programs.find((pr) => pr.id === a.programId); return s + (p?.durationHours ?? 0); }, 0);
      const doneHours = myAssignments.filter((a) => a.status === "completed").reduce((s, a) => { const p = programs.find((pr) => pr.id === a.programId); return s + (p?.durationHours ?? 0); }, 0);
      return <HrPanel title="My learning progress" description={`${done} of ${myAssignments.length} programs completed · ${doneHours}h of ${totalHours}h`}>
        <div className="p-5">
          <div className="mb-3 h-2 w-full bg-surface-2"><div className="h-2 bg-accent transition-all" style={{ width: `${myAssignments.length ? (done / myAssignments.length) * 100 : 0}%` }} /></div>
          <div className="grid gap-2 sm:grid-cols-2">{myAssignments.map((a) => {
            const p = programs.find((pr) => pr.id === a.programId);
            if (!p) return null;
            return <div key={a.id} className="flex items-center gap-2 border border-border p-2">
              <div className={`size-2 shrink-0 ${a.status === "completed" ? "bg-success" : a.status === "in_progress" ? "bg-accent" : a.status === "overdue" ? "bg-danger" : "bg-surface-3"}`} />
              <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{p.title}</p><p className="text-[10px] text-muted-foreground">{p.durationHours}h · {a.status.replace("_", " ")}</p></div>
            </div>;
          })}</div>
        </div>
      </HrPanel>;
    })()}

    {adding && <AddProgramDialog departments={[...new Set(active.map((e) => e.department))].sort()} onClose={() => setAdding(false)} onAdd={addProgram} />}
  </div>;
}

function AddProgramDialog({ departments, onClose, onAdd }: { departments: string[]; onClose: () => void; onAdd: (program: TrainingProgram, assignTo: "all" | string) => void }) {
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<"mandatory" | "optional">("mandatory");
  const [mode, setMode] = React.useState<"online" | "classroom">("online");
  const [hours, setHours] = React.useState("2");
  const [dueAt, setDueAt] = React.useState("");
  const [assignTo, setAssignTo] = React.useState<"all" | string>("all");
  const error = !title.trim() ? "Enter a program title." : !description.trim() ? "Describe the training." : Number(hours) <= 0 ? "Enter the duration." : "";
  return <HrModal open onOpenChange={(v) => !v && onClose()} title="Add training program" description="Create a new training program and assign it to employees.">
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!error) onAdd({ id: `trn-${crypto.randomUUID()}`, title: title.trim(), description: description.trim(), type, mode, durationHours: Number(hours), createdAt: hrToday(), dueAt: dueAt || null }, assignTo); }}>
      <HrField label="Program title"><Input required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-none" placeholder="e.g. Fire Safety Training" /></HrField>
      <HrField label="Description"><Textarea maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} className="rounded-none" /></HrField>
      <div className="grid gap-4 sm:grid-cols-2">
        <HrField label="Type"><select className={hrInputClass} value={type} onChange={(e) => setType(e.target.value as "mandatory" | "optional")}><option value="mandatory">Mandatory</option><option value="optional">Optional</option></select></HrField>
        <HrField label="Mode"><select className={hrInputClass} value={mode} onChange={(e) => setMode(e.target.value as "online" | "classroom")}><option value="online">Online</option><option value="classroom">Classroom</option></select></HrField>
        <HrField label="Duration (hours)"><Input type="number" min={0.5} step={0.5} value={hours} onChange={(e) => setHours(e.target.value)} className="rounded-none" /></HrField>
        <HrField label="Due date (optional)"><Input type="date" min={hrToday()} value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="rounded-none" /></HrField>
      </div>
      <HrField label="Assign to"><select className={hrInputClass} value={assignTo} onChange={(e) => setAssignTo(e.target.value)}><option value="all">All active employees</option>{departments.map((d) => <option key={d} value={d}>{d} department</option>)}</select></HrField>
      {error && title && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={Boolean(error)}>Create program</Button></div>
    </form>
  </HrModal>;
}
