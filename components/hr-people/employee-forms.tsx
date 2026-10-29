"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { useHrOrgStore } from "@/lib/stores/hr-org-store";
import { useHrOperationsStore } from "@/lib/stores/hr-operations-store";
import { useHrCareerStore } from "@/lib/stores/hr-career-store";
import { changeLines, kindLabels, subordinatesOf } from "@/lib/hr-career";
import { nextEmployeeIds, normalisePhone, parseDate, todayIst } from "@/lib/hr-import";
import { standardTasks } from "@/components/hr-people/onboarding";
import { HrField, HrModal, hrDate, hrInputClass } from "@/components/hr-people/operations-ui";
import type { HrEmployee, HrOnboardingTask } from "@/lib/types";

const palette = ["#2563eb", "#7c3aed", "#0891b2", "#059669", "#d97706", "#dc2626", "#db2777", "#4f46e5"];
const typeOptions: [HrEmployee["employmentType"], string][] = [["full_time", "Full time"], ["part_time", "Part time"], ["contract", "Contract"]];

/** Add a new person, or correct an existing record. Pay, role and manager changes that need approval go through Promotions & changes. */
export function EmployeeFormDialog({ employee, actorId, onClose }: { employee?: HrEmployee; actorId: string; onClose: () => void }) {
  const { employees, addEmployee, updateEmployee, reassignManager, addOnboardingTask } = useHrPeopleStore();
  const log = useHrOperationsStore((state) => state.log);
  const editing = Boolean(employee);
  const [form, setForm] = React.useState({ name: employee?.name ?? "", email: employee?.email ?? "", phone: employee?.phone ?? "", title: employee?.title ?? "", department: employee?.department ?? "", branch: employee?.branch ?? "", type: employee?.employmentType ?? "full_time" as HrEmployee["employmentType"], joiningDate: employee?.joiningDate ?? todayIst(), birthDate: employee?.birthDate ?? "", managerId: employee?.managerId ?? "", salary: "", checklist: true });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((state) => ({ ...state, [key]: value }));
  const actor = employees.find((item) => item.id === actorId)?.name ?? "HR";
  const blocked = employee ? subordinatesOf(employees, employee.id) : new Set<string>();
  const managers = employees.filter((item) => item.status !== "archived" && item.id !== employee?.id && !blocked.has(item.id));
  const orgDepartments = useHrOrgStore((state) => state.departments);
  const departments = [...new Set([...orgDepartments.filter((item) => item.active).map((item) => item.name), ...(employee?.department ? [employee.department] : [])])];
  const pickDepartment = (name: string) => setForm((state) => { const head = orgDepartments.find((item) => item.name === name)?.headId; const suggest = !employee && !state.managerId && head && managers.some((item) => item.id === head); return { ...state, department: name, managerId: suggest ? head! : state.managerId }; });
  const branches = [...new Set(employees.map((item) => item.branch))];
  const email = form.email.trim().toLowerCase();
  const phone = form.phone.trim() ? normalisePhone(form.phone) : "";
  const joining = parseDate(form.joiningDate);
  const today = todayIst();
  const salary = form.salary.trim() === "" ? 0 : Number(form.salary);
  const error = form.name.trim().length < 2 ? "Enter the full name." : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? "Enter a valid work email." : employees.some((item) => item.id !== employee?.id && item.email.toLowerCase() === email) ? "Someone already has this email." : form.phone.trim() && !phone ? "Enter a 10-digit Indian mobile number, or leave it blank." : form.title.trim().length < 2 ? "Enter the role." : form.department.trim().length < 2 ? "Enter the department." : form.branch.trim().length < 2 ? "Enter the branch." : !joining ? "Enter a valid joining date." : joining > `${Number(today.slice(0, 4)) + 1}${today.slice(4)}` ? "The joining date is more than a year away." : form.birthDate && (!parseDate(form.birthDate) || form.birthDate > `${Number(today.slice(0, 4)) - 16}${today.slice(4)}` || form.birthDate < "1940-01-01") ? "Check the date of birth. People must be at least 16." : !editing && !form.managerId && managers.length > 0 ? "Choose who they report to." : !editing && (!Number.isFinite(salary) || salary < 0 || salary > 10_000_000) ? "Monthly pay must be between ₹0 and ₹1 crore." : "";
  const showError = Boolean(error) && (form.name !== "" || form.email !== "");
  const manager = managers.find((item) => item.id === form.managerId);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (error || !joining) return;
    if (employee) {
      const patch: Partial<HrEmployee> = { name: form.name.trim(), email, phone: phone || form.phone.trim(), title: form.title.trim(), department: form.department.trim(), branch: form.branch.trim(), location: form.branch.trim(), employmentType: form.type, joiningDate: joining, birthDate: form.birthDate || undefined };
      const changed = (Object.keys(patch) as (keyof HrEmployee)[]).filter((key) => patch[key] !== employee[key] && !(key === "location" && patch.branch === employee.branch));
      const managerChanged = (form.managerId || null) !== employee.managerId;
      if (changed.length) updateEmployee(employee.id, patch);
      const moved = managerChanged ? reassignManager(employee.id, form.managerId || null, manager?.name ?? null) : 0;
      if (!changed.length && !managerChanged) { toast.success("Nothing changed."); onClose(); return; }
      log({ recordId: employee.id, actorId, action: "employee_edited", reason: `${actor} changed ${[...changed.filter((key) => key !== "location"), ...(managerChanged ? ["reporting manager"] : [])].join(", ")}` });
      toast.success(`Saved.${moved ? ` ${moved} pending ${moved === 1 ? "request" : "requests"} moved to ${manager?.name ?? "HR"}.` : ""}`);
    } else {
      const id = nextEmployeeIds(employees, 1)[0];
      const onboarding = form.checklist || joining > today;
      const created: HrEmployee = { id, name: form.name.trim(), email, phone: phone || "", title: form.title.trim(), department: form.department.trim(), branch: form.branch.trim(), managerId: form.managerId || null, managerName: manager?.name ?? null, status: onboarding ? "onboarding" : "active", employmentType: form.type, joiningDate: joining, location: form.branch.trim(), avatarColor: palette[employees.length % palette.length], birthDate: form.birthDate || undefined, salaryMonthly: salary, onboardingPercent: onboarding ? 0 : 100, documentsDue: onboarding ? 3 : 0 };
      addEmployee(created);
      if (form.checklist) {
        const start = new Date(`${joining > today ? joining : today}T12:00:00`);
        standardTasks.forEach((item) => { const due = new Date(start); due.setDate(due.getDate() + item.days); const task: HrOnboardingTask = { id: `onb-${crypto.randomUUID()}`, employeeId: id, employeeName: created.name, title: item.title, ownerRole: item.ownerRole, status: "todo", dueAt: due.toLocaleDateString("en-CA") }; addOnboardingTask(task); });
      }
      log({ recordId: id, actorId, action: "employee_added", reason: `${actor} added ${created.name}${form.checklist ? " with an onboarding checklist" : ""}` });
      toast.success(`${created.name} added as ${id.toUpperCase()}.${form.checklist ? " Their onboarding checklist is ready." : ""}`);
    }
    onClose();
  }

  return <HrModal open onOpenChange={(value) => !value && onClose()} title={editing ? `Edit ${employee!.name}` : "Add an employee"} description={editing ? "Corrects the record. For promotions, transfers and pay, use Promotions & changes so the right people approve." : "Creates the record. You can set up onboarding and documents next."}>
    <form className="space-y-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <HrField label="Full name"><Input required maxLength={80} value={form.name} onChange={(event) => set("name", event.target.value)} className="rounded-none" /></HrField>
        <HrField label="Work email"><Input required type="email" value={form.email} onChange={(event) => set("email", event.target.value)} className="rounded-none" /></HrField>
        <HrField label="Mobile · optional"><Input type="tel" value={form.phone} onChange={(event) => set("phone", event.target.value)} placeholder="98765 43210" className="rounded-none" /></HrField>
        <HrField label="Role"><Input required maxLength={60} value={form.title} onChange={(event) => set("title", event.target.value)} className="rounded-none" /></HrField>
        <HrField label="Department"><select required className={hrInputClass} value={form.department} onChange={(event) => pickDepartment(event.target.value)}><option value="">Choose a department</option>{departments.map((item) => <option key={item} value={item}>{item}</option>)}</select></HrField>
        <HrField label="Branch"><Input required list="emp-branches" maxLength={40} value={form.branch} onChange={(event) => set("branch", event.target.value)} className="rounded-none" /></HrField>
        <HrField label="Reports to"><select className={hrInputClass} value={form.managerId} onChange={(event) => set("managerId", event.target.value)}><option value="">{editing ? "No one" : managers.length > 0 ? "Choose…" : "No manager yet (reports to HR)"}</option>{managers.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.title}</option>)}</select></HrField>
        <HrField label="Employment type"><select className={hrInputClass} value={form.type} onChange={(event) => set("type", event.target.value as HrEmployee["employmentType"])}>{typeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></HrField>
        <HrField label="Joining date"><Input type="date" value={form.joiningDate} onChange={(event) => set("joiningDate", event.target.value)} className="rounded-none" /></HrField>
        <HrField label="Date of birth · optional"><Input type="date" value={form.birthDate} onChange={(event) => set("birthDate", event.target.value)} className="rounded-none" /></HrField>
        {!editing && <HrField label="Monthly pay (₹) · optional"><Input type="number" min={0} inputMode="numeric" value={form.salary} onChange={(event) => set("salary", event.target.value)} className="rounded-none" /></HrField>}
      </div>
      <datalist id="emp-branches">{branches.map((item) => <option key={item} value={item} />)}</datalist>
      {editing && employee && (form.managerId || null) !== employee.managerId && <p className="border border-info/30 bg-info-muted px-3 py-2 text-xs text-info">Leave and expense requests still waiting on {employee.managerName ?? "the old manager"} move to {manager?.name ?? "HR"}.</p>}
      {!editing && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.checklist} onChange={(event) => set("checklist", event.target.checked)} />Create the standard onboarding checklist</label>}
      {showError && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={Boolean(error)}>{editing ? "Save changes" : "Add employee"}</Button></div>
    </form>
  </HrModal>;
}

/** Archive keeps the record and history, hides the person from the active list and can be undone. */
export function ArchiveEmployeeDialog({ employee, actorId, onClose }: { employee: HrEmployee; actorId: string; onClose: () => void }) {
  const { employees, archiveEmployee } = useHrPeopleStore();
  const log = useHrOperationsStore((state) => state.log);
  const [reason, setReason] = React.useState("");
  const reports = employees.filter((item) => item.managerId === employee.id && item.status !== "archived");
  const blocker = employee.id === actorId ? "You can't archive your own record." : employee.managerId === null ? "The owner's record can't be archived." : reports.length ? `${employee.name} manages ${reports.map((item) => item.name).join(", ")}. Give them a new reporting manager first.` : "";
  return <HrModal open onOpenChange={(value) => !value && onClose()} title={`Archive ${employee.name}?`} description="Their record, documents and history are kept. You can restore them later.">
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (blocker || reason.trim().length < 5) return; archiveEmployee(employee.id); log({ recordId: employee.id, actorId, action: "employee_archived", reason: reason.trim() }); toast.success(`${employee.name} archived`); onClose(); }}>
      {blocker && <p role="alert" className="text-sm text-danger">{blocker}</p>}
      <HrField label="Reason"><Textarea required maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} className="rounded-none" placeholder="e.g. Left the company on 31 October" /></HrField>
      <p className="text-xs text-muted-foreground">To record a resignation with clearance steps, use Offboarding instead.</p>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={Boolean(blocker) || reason.trim().length < 5}>Archive</Button></div>
    </form>
  </HrModal>;
}

/** Joining date plus every promotion, transfer or pay change that has taken effect. */
export function CareerHistory({ employee, showPay }: { employee: HrEmployee; showPay: boolean }) {
  const changes = useHrCareerStore((state) => state.changes).filter((item) => item.employeeId === employee.id && item.status === "applied");
  return <ol className="divide-y divide-border border border-border text-sm">
    {[...changes].reverse().map((change) => <li key={change.id} className="px-3 py-2"><p className="font-medium">{kindLabels[change.kind]} · {hrDate(change.effectiveDate)}</p><ul className="text-xs text-muted-foreground">{changeLines(change, showPay).map((line) => <li key={line}>{line}</li>)}</ul></li>)}
    <li className="px-3 py-2"><p className="font-medium">Joined · {hrDate(employee.joiningDate)}</p><p className="text-xs text-muted-foreground">{employee.department}</p></li>
  </ol>;
}
