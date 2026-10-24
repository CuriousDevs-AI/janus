"use client";

import * as React from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Building2, ChevronRight, Plus, Shield, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { useHrOperationsStore } from "@/lib/stores/hr-operations-store";
import { useHrOrgStore, type ApprovalStepKind, type HrDepartment, type HrRoleDef, type OrgPermission } from "@/lib/stores/hr-org-store";
import { companySteps, departmentByName, hasPermission, permissionCatalog, permissionLabel, resolveRoute, roleOf, stepLabels, stepsText, wouldLoop } from "@/lib/hr-org";
import { HrEmpty, HrField, HrModal, HrPanel, HrTable, hrCell, hrInputClass, hrToday } from "@/components/hr-people/operations-ui";
import type { HrDemoRole, HrEmployee } from "@/lib/types";

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";
const tabs = [{ id: "departments", label: "Departments" }, { id: "roles", label: "Roles" }, { id: "flow", label: "Approval flow" }] as const;

function useOrg() {
  const { departments, roles, assignments } = useHrOrgStore();
  return { departments, roles, assignments };
}
function record(actorId: string, action: string, reason: string) { useHrOperationsStore.getState().log({ recordId: "organization", actorId, action, reason }); }
/** The org needs at least one person who can still manage it. */
const managers = (org: ReturnType<typeof useOrg>, employees: HrEmployee[]) => employees.filter((item) => item.status !== "archived" && hasPermission(org, item.id, "org.manage"));

export function HrOrganizationView({ role, actorId }: { role: HrDemoRole; actorId: string }) {
  const org = useOrg();
  const employees = useHrPeopleStore((state) => state.employees);
  const [tab, setTab] = React.useState<(typeof tabs)[number]["id"]>("departments");
  const editable = role === "owner" || role === "hr_manager" || hasPermission(org, actorId, "org.manage");
  const active = employees.filter((item) => item.status !== "archived");
  const unlisted = [...new Set(active.map((item) => item.department))].filter((name) => name && !departmentByName(org.departments, name));
  return <div className="space-y-5">
    <p className="text-sm text-muted-foreground">{org.departments.filter((item) => item.active).length} departments · {active.length} people · {org.roles.length} roles{unlisted.length ? ` · ${unlisted.length} not set up` : ""}</p>
    <div role="tablist" aria-label="Organization" className="flex flex-wrap gap-1 border-b border-border">{tabs.map((item) => <button key={item.id} role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === item.id ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{item.label}</button>)}</div>
    {!editable && <p className="border border-border bg-surface-2 px-4 py-3 text-sm text-muted-foreground">You can look, but only HR and the owner can change how the company is organised.</p>}
    {tab === "departments" && <DepartmentsTab actorId={actorId} editable={editable} unlisted={unlisted} />}
    {tab === "roles" && <RolesTab actorId={actorId} editable={editable} />}
    {tab === "flow" && <FlowTab />}
  </div>;
}

function DepartmentsTab({ actorId, editable, unlisted }: { actorId: string; editable: boolean; unlisted: string[] }) {
  const org = useOrg();
  const employees = useHrPeopleStore((state) => state.employees);
  const settings = useHrOperationsStore((state) => state.settings);
  const [editing, setEditing] = React.useState<HrDepartment | "new" | null>(null);
  const [preset, setPreset] = React.useState("");
  const [removing, setRemoving] = React.useState<HrDepartment | null>(null);
  const [open, setOpen] = React.useState<Set<string>>(new Set());
  const rows = React.useMemo(() => {
    const out: { department: HrDepartment; depth: number }[] = [];
    const seen = new Set<string>();
    const walk = (parentId: string | null, depth: number) => org.departments.filter((item) => item.parentId === parentId && !seen.has(item.id)).forEach((department) => { seen.add(department.id); out.push({ department, depth }); walk(department.id, depth + 1); });
    walk(null, 0);
    org.departments.filter((item) => !seen.has(item.id)).forEach((department) => out.push({ department, depth: 0 }));
    return out;
  }, [org.departments]);
  const members = (name: string) => employees.filter((item) => item.status !== "archived" && item.department === name);
  const toggle = (id: string) => setOpen((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return <div className="space-y-4">
    {unlisted.length > 0 && <div className="border border-warning/40 bg-warning/10 px-4 py-3 text-sm"><p className="font-medium">Some employees belong to a department that isn&apos;t set up yet.</p><div className="mt-2 flex flex-wrap gap-2">{unlisted.map((name) => <Button key={name} size="sm" variant="outline" disabled={!editable} onClick={() => { setPreset(name); setEditing("new"); }}>Set up {name}</Button>)}</div></div>}
    <HrPanel title="Departments" description="Your company structure. Open a department to see its people, give them roles and see who they report to." actions={editable ? <Button size="sm" onClick={() => { setPreset(""); setEditing("new"); }}><Plus className="mr-1 size-4" />Add department</Button> : undefined}>
      {rows.length === 0 ? <HrEmpty>No departments yet. Add the first one.</HrEmpty> : <><ul className="divide-y divide-border md:hidden">{rows.map(({ department, depth }) => {
        const head = employees.find((item) => item.id === department.headId);
        const people = members(department.name);
        const expanded = open.has(department.id);
        return <li key={department.id} className={`space-y-2 px-4 py-3 ${department.active ? "" : "opacity-60"}`} style={{ paddingLeft: 16 + depth * 14 }}>
          <button type="button" aria-expanded={expanded} onClick={() => toggle(department.id)} className="flex w-full items-center gap-2 text-left font-medium"><ChevronRight className={`size-4 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden />{department.name}{!department.active && <Badge variant="neutral">Archived</Badge>}<span className="ml-auto text-xs font-normal text-muted-foreground">{people.length} {people.length === 1 ? "person" : "people"}</span></button>
          <p className="text-xs text-muted-foreground">Head: {head?.name ?? "Not set"}</p>
          <p className="text-xs">{stepsText(department.steps ?? companySteps(settings))}{!department.steps && <span className="text-muted-foreground"> (company default)</span>}{department.longLeave && <span className="block text-muted-foreground">{department.longLeave.minDays}+ days: {stepsText(department.longLeave.steps)}</span>}</p>
          {expanded && <MembersTable people={people} actorId={actorId} editable={editable} />}
          {editable && <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setEditing(department)}>Edit</Button><Button size="sm" variant="ghost" aria-label={`Remove ${department.name}`} onClick={() => setRemoving(department)}><Trash2 className="size-4" /></Button></div>}
        </li>;
      })}</ul><div className="hidden md:block"><HrTable headings={["Department", "Head", "People", "Leave approval", "Backup", ""]}>{rows.flatMap(({ department, depth }) => {
        const head = employees.find((item) => item.id === department.headId);
        const backup = employees.find((item) => item.id === department.backupApproverId);
        const people = members(department.name);
        const expanded = open.has(department.id);
        const steps = department.steps ?? companySteps(settings);
        const main = <tr key={department.id} className={department.active ? "" : "opacity-60"}>
          <td className={hrCell}><button type="button" aria-expanded={expanded} aria-label={`${expanded ? "Hide" : "Show"} people in ${department.name}`} onClick={() => toggle(department.id)} className="flex items-center gap-2 text-left font-medium" style={{ paddingLeft: depth * 18 }}><ChevronRight className={`size-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden /><Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />{department.name}{!department.active && <Badge variant="neutral">Archived</Badge>}</button>{department.description && <p className="text-xs text-muted-foreground" style={{ paddingLeft: depth * 18 + 48 }}>{department.description}</p>}</td>
          <td className={hrCell}>{head?.name ?? <span className="text-muted-foreground">Not set</span>}</td>
          <td className={hrCell}>{people.length}</td>
          <td className={hrCell}><p>{stepsText(steps)}{!department.steps && <span className="text-xs text-muted-foreground"> (company default)</span>}</p>{department.longLeave && <p className="text-xs text-muted-foreground">{department.longLeave.minDays}+ days: {stepsText(department.longLeave.steps)}</p>}</td>
          <td className={hrCell}>{backup?.name ?? <span className="text-muted-foreground">None</span>}</td>
          <td className={hrCell}>{editable && <div className="flex gap-1"><Button size="sm" variant="outline" onClick={() => setEditing(department)}>Edit</Button><Button size="sm" variant="ghost" aria-label={`Remove ${department.name}`} onClick={() => setRemoving(department)}><Trash2 className="size-4" /></Button></div>}</td>
        </tr>;
        if (!expanded) return [main];
        return [main, <tr key={`${department.id}-people`}><td colSpan={6} className="bg-surface-2 px-4 py-3"><MembersTable people={people} actorId={actorId} editable={editable} /></td></tr>];
      })}</HrTable></div></>}
    </HrPanel>
    {editing && <DepartmentDialog key={editing === "new" ? `new-${preset}` : editing.id} department={editing === "new" ? undefined : editing} presetName={preset} actorId={actorId} onClose={() => setEditing(null)} />}
    {removing && <RemoveDepartmentDialog department={removing} actorId={actorId} onClose={() => setRemoving(null)} />}
  </div>;
}

/** The people in one department, with the role each holds. A role adds to what the reporting line already allows. */
function MembersTable({ people, actorId, editable }: { people: HrEmployee[]; actorId: string; editable: boolean }) {
  const org = useOrg();
  const employees = useHrPeopleStore((state) => state.employees);
  const assign = useHrOrgStore((state) => state.assignRole);
  if (people.length === 0) return <p className="text-sm text-muted-foreground">No one is in this department yet. Add people from Employees.</p>;
  function change(employee: HrEmployee, roleId: string) {
    if (org.assignments[employee.id] === "role-owner" && roleId !== "role-owner" && Object.values(org.assignments).filter((id) => id === "role-owner").length === 1) { toast.error("The company needs an Owner. Make someone else Owner first."); return; }
    const next = { ...org, assignments: { ...org.assignments } };
    if (roleId === "role-employee") delete next.assignments[employee.id]; else next.assignments[employee.id] = roleId;
    if (managers(next, employees).length === 0) { toast.error("Someone must keep the permission to manage departments and roles."); return; }
    const label = org.roles.find((item) => item.id === roleId)?.name;
    assign(employee.id, roleId === "role-employee" ? null : roleId);
    record(actorId, "role_assigned", `${employee.name} is now ${label}`);
    toast.success(`${employee.name} is now ${label}.`);
  }
  return <HrTable headings={["Person", "Reports to", "Role"]}>{people.map((person) => <tr key={person.id}>
    <td className={hrCell}><p className="font-medium">{person.name}</p><p className="text-xs text-muted-foreground">{person.title}</p></td>
    <td className={hrCell}>{person.managerName ?? "—"}</td>
    <td className={hrCell}><select aria-label={`Role for ${person.name}`} disabled={!editable} className={`${hrInputClass} w-48`} value={roleOf(org, person.id)?.id ?? "role-employee"} onChange={(event) => change(person, event.target.value)}>{org.roles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></td>
  </tr>)}</HrTable>;
}

/** An ordered list of approval levels. Order matters: the request goes to the first, then the next. */
function StepBuilder({ value, onChange, label }: { value: ApprovalStepKind[]; onChange: (steps: ApprovalStepKind[]) => void; label: string }) {
  const move = (index: number, by: number) => { const next = [...value]; const [item] = next.splice(index, 1); next.splice(index + by, 0, item); onChange(next); };
  return <div className="space-y-2" role="group" aria-label={label}>
    {value.map((step, index) => <div key={index} className="flex items-center gap-2"><span className="flex size-6 shrink-0 items-center justify-center bg-accent text-xs font-semibold text-accent-foreground">{index + 1}</span>
      <select aria-label={`${label}, level ${index + 1}`} className={hrInputClass} value={step} onChange={(event) => onChange(value.map((item, at) => at === index ? event.target.value as ApprovalStepKind : item))}>{(Object.keys(stepLabels) as ApprovalStepKind[]).map((kind) => <option key={kind} value={kind}>{stepLabels[kind]}</option>)}</select>
      <Button type="button" size="sm" variant="ghost" aria-label={`Move level ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp className="size-4" /></Button>
      <Button type="button" size="sm" variant="ghost" aria-label={`Move level ${index + 1} down`} disabled={index === value.length - 1} onClick={() => move(index, 1)}><ArrowDown className="size-4" /></Button>
      <Button type="button" size="sm" variant="ghost" aria-label={`Remove level ${index + 1}`} disabled={value.length === 1} onClick={() => onChange(value.filter((_, at) => at !== index))}><X className="size-4" /></Button></div>)}
    {value.length < 4 && <Button type="button" size="sm" variant="outline" onClick={() => onChange([...value, value.includes("hr") ? "head" : "hr"])}><Plus className="mr-1 size-4" />Add a level</Button>}
  </div>;
}

function DepartmentDialog({ department, presetName, actorId, onClose }: { department?: HrDepartment; presetName: string; actorId: string; onClose: () => void }) {
  const org = useOrg();
  const { employees, updateEmployee, reassignManager } = useHrPeopleStore();
  const settings = useHrOperationsStore((state) => state.settings);
  const save = useHrOrgStore((state) => state.saveDepartment);
  const [form, setForm] = React.useState({ name: department?.name ?? presetName, description: department?.description ?? "", parentId: department?.parentId ?? "", headId: department?.headId ?? "", backupApproverId: department?.backupApproverId ?? "", custom: Boolean(department?.steps), steps: department?.steps ?? companySteps(settings), longOn: Boolean(department?.longLeave), longDays: String(department?.longLeave?.minDays ?? 4), longSteps: department?.longLeave?.steps ?? ["manager", "head", "hr"] as ApprovalStepKind[], active: department?.active ?? true, reroute: true });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((state) => ({ ...state, [key]: value }));
  const active = employees.filter((item) => item.status !== "archived");
  const name = form.name.trim();
  const id = department?.id ?? `dept-${slug(name)}`;
  const usedSteps = [...(form.custom ? form.steps : []), ...(form.longOn ? form.longSteps : [])];
  const longDays = Number(form.longDays);
  const error = name.length < 2 ? "Give the department a name (at least 2 characters)." : org.departments.some((item) => item.id !== department?.id && item.name.toLowerCase() === name.toLowerCase()) ? `${name} already exists.` : wouldLoop(org.departments, id, form.parentId || null) ? "A department can't sit under itself or one of its own sub-departments." : form.headId && form.headId === form.backupApproverId ? "The backup approver should be someone other than the head." : usedSteps.includes("head") && !form.headId ? "A level uses the department head. Choose a head first." : usedSteps.includes("upper_head") && !form.parentId ? "A level uses the head of the department above. Choose which department this one reports up to." : form.longOn && (!Number.isInteger(longDays) || longDays < 2 || longDays > 60) ? "Long leave starts from 2 to 60 days." : "";
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (error) return;
    const next: HrDepartment = { id, name, description: form.description.trim(), parentId: form.parentId || null, headId: form.headId || null, steps: form.custom ? form.steps : null, longLeave: form.longOn ? { minDays: longDays, steps: form.longSteps } : null, backupApproverId: form.backupApproverId || null, active: form.active };
    save(next);
    // Renaming must carry the people along, otherwise they'd fall out of the department.
    if (department && department.name !== name) employees.filter((item) => item.department === department.name).forEach((item) => updateEmployee(item.id, { department: name }));
    let moved = 0;
    if (form.reroute && department) {
      const org2 = { ...org, departments: org.departments.map((item) => item.id === id ? next : item) };
      employees.filter((item) => item.department === department.name && item.status !== "archived").forEach((item) => { const first = resolveRoute({ ...item, department: name }, org2, employees, settings)[0]; moved += reassignManager(item.id, first.id ?? null, first.kind === "hr" ? null : first.name); });
    }
    record(actorId, department ? "department_updated" : "department_created", `${name}${department && department.name !== name ? ` (was ${department.name})` : ""}${moved ? ` · ${moved} pending request${moved === 1 ? "" : "s"} re-routed` : ""}`);
    toast.success(department ? `${name} saved.${moved ? ` ${moved} pending request${moved === 1 ? "" : "s"} moved to the new approver.` : ""}` : `${name} added.`);
    onClose();
  }
  return <HrModal open onOpenChange={(open) => !open && onClose()} title={department ? `Edit ${department.name}` : "Add department"} description="Who leads it, where it sits, and the levels a leave request passes.">
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <HrField label="Name"><Input required maxLength={40} value={form.name} onChange={(event) => set("name", event.target.value)} className="rounded-none" /></HrField>
        <HrField label="Reports up to"><select className={hrInputClass} value={form.parentId} onChange={(event) => set("parentId", event.target.value)}><option value="">Top level</option>{org.departments.filter((item) => item.id !== department?.id && item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></HrField>
        <HrField label="Department head"><select className={hrInputClass} value={form.headId} onChange={(event) => set("headId", event.target.value)}><option value="">Not set</option>{active.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.title}</option>)}</select></HrField>
        <HrField label="Backup approver (covers when the approver is on leave)"><select className={hrInputClass} value={form.backupApproverId} onChange={(event) => set("backupApproverId", event.target.value)}><option value="">None</option>{active.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></HrField>
      </div>
      <HrField label="What this team does (optional)"><Input maxLength={80} value={form.description} onChange={(event) => set("description", event.target.value)} className="rounded-none" /></HrField>
      <fieldset className="grid gap-3 border border-border p-3"><legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Leave approval</legend>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.custom} onChange={(event) => set("custom", event.target.checked)} />Use a route of its own (otherwise: {stepsText(companySteps(settings))})</label>
        {form.custom && <StepBuilder label="Approval levels" value={form.steps} onChange={(steps) => set("steps", steps)} />}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.longOn} onChange={(event) => set("longOn", event.target.checked)} />Longer leave needs more levels</label>
        {form.longOn && <div className="grid gap-3"><div className="flex items-center gap-2 text-sm">From<Input aria-label="Long leave starts at (working days)" type="number" min={2} max={60} value={form.longDays} onChange={(event) => set("longDays", event.target.value)} className="h-8 w-20 rounded-none" />working days, use:</div><StepBuilder label="Long leave levels" value={form.longSteps} onChange={(steps) => set("longSteps", steps)} /></div>}
        <p className="text-xs text-muted-foreground">Nobody approves their own leave, and a level with nobody in it is skipped. If no one is left, HR decides.</p>
      </fieldset>
      {department && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.reroute} onChange={(event) => set("reroute", event.target.checked)} />Move requests that are still pending to the new first approver</label>}
      {department && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(event) => set("active", event.target.checked)} />Active</label>}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={Boolean(error)}>{department ? "Save department" : "Add department"}</Button></div>
    </form>
  </HrModal>;
}

function RemoveDepartmentDialog({ department, actorId, onClose }: { department: HrDepartment; actorId: string; onClose: () => void }) {
  const employees = useHrPeopleStore((state) => state.employees);
  const remove = useHrOrgStore((state) => state.removeDepartment);
  const people = employees.filter((item) => item.status !== "archived" && item.department === department.name).length;
  const children = useHrOrgStore((state) => state.departments).filter((item) => item.parentId === department.id).length;
  return <HrModal open onOpenChange={(open) => !open && onClose()} title={`Remove ${department.name}?`} description={people ? "People still belong to this department." : "This can't be undone."}>
    {people > 0 ? <p className="text-sm">{people} {people === 1 ? "person is" : "people are"} still in {department.name}. Move {people === 1 ? "them" : "them"} to another department first (Employees → Edit), then remove it.</p> : <p className="text-sm">{department.name} has no people.{children ? ` Its ${children} sub-department${children === 1 ? "" : "s"} will move up one level.` : ""}</p>}
    <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={onClose}>{people ? "Close" : "Keep"}</Button>{people === 0 && <Button variant="destructive" onClick={() => { remove(department.id); record(actorId, "department_removed", department.name); toast.success(`${department.name} removed.`); onClose(); }}>Remove department</Button>}</div>
  </HrModal>;
}

function RolesTab({ actorId, editable }: { actorId: string; editable: boolean }) {
  const org = useOrg();
  const [editing, setEditing] = React.useState<HrRoleDef | "new" | null>(null);
  const [removing, setRemoving] = React.useState<HrRoleDef | null>(null);
  const holders = (roleId: string) => Object.values(org.assignments).filter((id) => id === roleId).length;
  return <div className="space-y-4">
    <HrPanel title="Roles & permissions" description="A role lets someone approve leave or manage employees beyond their place in the reporting line. Give it to a person by opening their department." actions={editable ? <Button size="sm" onClick={() => setEditing("new")}><Plus className="mr-1 size-4" />Add role</Button> : undefined}>
      <HrTable headings={["Role", "Can do", "People", ""]}>{org.roles.map((item) => <tr key={item.id}>
        <td className={hrCell}><p className="flex items-center gap-2 font-medium"><Shield className="size-4 text-muted-foreground" aria-hidden />{item.name}{item.system && <Badge variant="neutral">Built in</Badge>}</p><p className="text-xs text-muted-foreground">{item.description}</p></td>
        <td className={hrCell}>{item.permissions.length === 0 ? <span className="text-muted-foreground">Own records only</span> : <div className="flex max-w-xl flex-wrap gap-1">{item.permissions.map((permission) => <Badge key={permission} variant="info">{permissionLabel(permission)}</Badge>)}</div>}</td>
        <td className={hrCell}>{item.id === "role-employee" ? "Everyone else" : holders(item.id)}</td>
        <td className={hrCell}>{editable && <div className="flex gap-1"><Button size="sm" variant="outline" disabled={item.id === "role-owner"} title={item.id === "role-owner" ? "The owner role always keeps full control." : undefined} onClick={() => setEditing(item)}>Edit</Button>{!item.system && <Button size="sm" variant="ghost" aria-label={`Delete ${item.name}`} onClick={() => setRemoving(item)}><Trash2 className="size-4" /></Button>}</div>}</td>
      </tr>)}</HrTable>
    </HrPanel>
    {editing && <RoleDialog key={editing === "new" ? "new" : editing.id} role={editing === "new" ? undefined : editing} actorId={actorId} onClose={() => setEditing(null)} />}
    {removing && <HrModal open onOpenChange={(open) => !open && setRemoving(null)} title={`Delete ${removing.name}?`} description="People with this role go back to the plain Employee role."><p className="text-sm">{holders(removing.id)} {holders(removing.id) === 1 ? "person has" : "people have"} this role.</p><div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => setRemoving(null)}>Keep</Button><Button variant="destructive" onClick={() => { useHrOrgStore.getState().removeRole(removing.id); record(actorId, "role_deleted", removing.name); toast.success(`${removing.name} deleted.`); setRemoving(null); }}>Delete role</Button></div></HrModal>}
  </div>;
}

function RoleDialog({ role, actorId, onClose }: { role?: HrRoleDef; actorId: string; onClose: () => void }) {
  const org = useOrg();
  const employees = useHrPeopleStore((state) => state.employees);
  const save = useHrOrgStore((state) => state.saveRole);
  const [name, setName] = React.useState(role?.name ?? "");
  const [description, setDescription] = React.useState(role?.description ?? "");
  const kept = (role?.permissions ?? []).filter((item) => permissionCatalog.find((entry) => entry.id === item)?.admin);
  const [permissions, setPermissions] = React.useState<OrgPermission[]>((role?.permissions ?? []).filter((item) => !kept.includes(item)));
  const toggle = (permission: OrgPermission) => setPermissions((current) => current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission]);
  const clean = name.trim();
  const id = role?.id ?? `role-${slug(clean)}`;
  const all = [...permissions, ...kept];
  const nextOrg = { ...org, roles: org.roles.some((item) => item.id === id) ? org.roles.map((item) => item.id === id ? { ...item, permissions: all } : item) : [...org.roles, { id, name: clean, description, permissions: all, system: false }] };
  const error = clean.length < 2 ? "Give the role a name (at least 2 characters)." : org.roles.some((item) => item.id !== role?.id && item.name.toLowerCase() === clean.toLowerCase()) ? `${clean} already exists.` : managers(nextOrg, employees).length === 0 ? "Someone must keep the permission to manage departments and roles." : "";
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (error) return;
    save({ id, name: role?.system ? role.name : clean, description: description.trim(), permissions: all, system: role?.system ?? false });
    record(actorId, role ? "role_updated" : "role_created", `${clean}: ${permissions.map(permissionLabel).join(", ") || "own records only"}`);
    toast.success(role ? `${clean} saved.` : `${clean} added. Give it to people by opening their department.`);
    onClose();
  }
  const offered = permissionCatalog.filter((item) => !item.admin);
  const groups = [...new Set(offered.map((item) => item.group))];
  return <HrModal open onOpenChange={(open) => !open && onClose()} title={role ? `Edit ${role.name}` : "Add role"} description="Tick what people with this role are allowed to do.">
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2"><HrField label="Role name"><Input required maxLength={40} disabled={role?.system} value={name} onChange={(event) => setName(event.target.value)} className="rounded-none" /></HrField><HrField label="What it is for (optional)"><Input maxLength={80} value={description} onChange={(event) => setDescription(event.target.value)} className="rounded-none" /></HrField></div>
      {groups.map((group) => <fieldset key={group} className="border border-border p-3"><legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</legend><div className="grid gap-2">{offered.filter((item) => item.group === group).map((item) => <label key={item.id} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={permissions.includes(item.id)} onChange={() => toggle(item.id)} /><span>{item.label}<span className="block text-xs text-muted-foreground">{item.hint}</span></span></label>)}</div></fieldset>)}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={Boolean(error)}>{role ? "Save role" : "Add role"}</Button></div>
    </form>
  </HrModal>;
}

function FlowTab() {
  const org = useOrg();
  const employees = useHrPeopleStore((state) => state.employees);
  const leaves = useHrPeopleStore((state) => state.leaveRequests);
  const settings = useHrOperationsStore((state) => state.settings);
  const active = employees.filter((item) => item.status !== "archived");
  const [personId, setPersonId] = React.useState(active.find((item) => item.id === "emp-006")?.id ?? active[0]?.id ?? "");
  const [typeId, setTypeId] = React.useState("default");
  const [days, setDays] = React.useState("1");
  const person = active.find((item) => item.id === personId);
  const count = Math.max(1, Math.min(60, Number(days) || 1));
  const route = person ? resolveRoute(person, org, employees, settings, { typeApproval: typeId, days: count, away: { leaves, from: hrToday() } }) : [];
  const department = person ? departmentByName(org.departments, person.department) : undefined;
  const backup = department?.backupApproverId ? employees.find((item) => item.id === department.backupApproverId) : undefined;
  return <div className="grid gap-4 lg:grid-cols-2">
    <HrPanel title="Who approves this leave?" description="Pick a person, a type and the number of days to see the exact route their request takes right now.">
      <div className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-3"><HrField label="Employee"><select className={hrInputClass} value={personId} onChange={(event) => setPersonId(event.target.value)}>{active.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.department}</option>)}</select></HrField><HrField label="Leave type"><select className={hrInputClass} value={typeId} onChange={(event) => setTypeId(event.target.value)}><option value="default">Usual route</option>{settings.leaveTypes.filter((item) => item.active && item.approval !== "default").map((item) => <option key={item.id} value={item.approval}>{item.name} ({item.approval === "hr" ? "HR only" : item.approval === "manager" ? "manager only" : "manager, then HR"})</option>)}</select></HrField><HrField label="Working days"><Input type="number" min={1} max={60} value={days} onChange={(event) => setDays(event.target.value)} className="h-9 rounded-none" /></HrField></div>
        {person ? <ol className="space-y-2">{route.map((step, index) => <li key={`${step.label}-${index}`} className="flex gap-3 border border-border bg-surface-2 px-3 py-2 text-sm"><span className="flex size-6 shrink-0 items-center justify-center bg-accent text-xs font-semibold text-accent-foreground">{index + 1}</span><span>{step.kind === "hr" ? "HR decides" : `${step.name} approves`}<span className="block text-xs text-muted-foreground">{step.label}{step.viaBackup ? " · covering, the usual approver is away today" : ""}</span></span></li>)}<li className="text-xs text-muted-foreground">{backup ? `Backup when away: ${backup.name}. ` : "No backup approver is set. "}Department: {department?.name ?? person.department}. Nobody approves their own request.</li></ol> : <HrEmpty>No one to show.</HrEmpty>}
      </div>
    </HrPanel>
    <HrPanel title="Route by department" description="Change any of these under Departments.">
      <HrTable headings={["Department", "Usual route", "Long leave"]}>{org.departments.filter((item) => item.active).map((item) => <tr key={item.id}><td className={hrCell}>{item.name}</td><td className={hrCell}>{stepsText(item.steps ?? companySteps(settings))}{!item.steps && <span className="text-xs text-muted-foreground"> (company default)</span>}</td><td className={hrCell}>{item.longLeave ? <>{item.longLeave.minDays}+ days: {stepsText(item.longLeave.steps)}</> : <span className="text-muted-foreground">Same route</span>}</td></tr>)}</HrTable>
    </HrPanel>
  </div>;
}
