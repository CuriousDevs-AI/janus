"use client";

import * as React from "react";
import { toast } from "sonner";
import { Building2, Plus, Shield, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { useHrOperationsStore } from "@/lib/stores/hr-operations-store";
import { useHrOrgStore, type HrDepartment, type HrRoleDef, type OrgPermission } from "@/lib/stores/hr-org-store";
import { approvalPath, approverFor, chainLabels, departmentByName, hasPermission, permissionCatalog, permissionLabel, roleOf, routeLabels, wouldLoop } from "@/lib/hr-org";
import { HrEmpty, HrField, HrModal, HrPanel, HrStats, HrTable, hrCell, hrInputClass } from "@/components/hr-people/operations-ui";
import type { HrDemoRole, HrEmployee } from "@/lib/types";

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";
const tabs = [{ id: "departments", label: "Departments" }, { id: "roles", label: "Roles & permissions" }, { id: "people", label: "People & access" }, { id: "flow", label: "Approval flow" }] as const;

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
    <HrStats items={[{ label: "Departments", value: org.departments.filter((item) => item.active).length }, { label: "People", value: active.length }, { label: "Roles", value: org.roles.length }, { label: "Not set up", value: unlisted.length, hint: unlisted.length ? unlisted.join(", ") : "Every department is set up" }]} />
    <div role="tablist" aria-label="Organization" className="flex flex-wrap gap-1 border-b border-border">{tabs.map((item) => <button key={item.id} role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === item.id ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{item.label}</button>)}</div>
    {!editable && <p className="border border-border bg-surface-2 px-4 py-3 text-sm text-muted-foreground">You can look, but only HR and the owner can change how the company is organised.</p>}
    {tab === "departments" && <DepartmentsTab actorId={actorId} editable={editable} unlisted={unlisted} />}
    {tab === "roles" && <RolesTab actorId={actorId} editable={editable} />}
    {tab === "people" && <PeopleTab actorId={actorId} editable={editable} />}
    {tab === "flow" && <FlowTab />}
  </div>;
}

function DepartmentsTab({ actorId, editable, unlisted }: { actorId: string; editable: boolean; unlisted: string[] }) {
  const org = useOrg();
  const employees = useHrPeopleStore((state) => state.employees);
  const [editing, setEditing] = React.useState<HrDepartment | "new" | null>(null);
  const [preset, setPreset] = React.useState("");
  const [removing, setRemoving] = React.useState<HrDepartment | null>(null);
  const rows = React.useMemo(() => {
    const out: { department: HrDepartment; depth: number }[] = [];
    const seen = new Set<string>();
    const walk = (parentId: string | null, depth: number) => org.departments.filter((item) => item.parentId === parentId && !seen.has(item.id)).forEach((department) => { seen.add(department.id); out.push({ department, depth }); walk(department.id, depth + 1); });
    walk(null, 0);
    org.departments.filter((item) => !seen.has(item.id)).forEach((department) => out.push({ department, depth: 0 }));
    return out;
  }, [org.departments]);
  const headcount = (name: string) => employees.filter((item) => item.status !== "archived" && item.department === name).length;
  return <div className="space-y-4">
    {unlisted.length > 0 && <div className="border border-warning/40 bg-warning/10 px-4 py-3 text-sm"><p className="font-medium">Some employees belong to a department that isn&apos;t set up yet.</p><div className="mt-2 flex flex-wrap gap-2">{unlisted.map((name) => <Button key={name} size="sm" variant="outline" disabled={!editable} onClick={() => { setPreset(name); setEditing("new"); }}>Set up {name}</Button>)}</div></div>}
    <HrPanel title="Departments" description="Set who heads each department, how it reports up, and who approves its leave." actions={editable ? <Button size="sm" onClick={() => { setPreset(""); setEditing("new"); }}><Plus className="mr-1 size-4" />Add department</Button> : undefined}>
      {rows.length === 0 ? <HrEmpty>No departments yet. Add the first one.</HrEmpty> : <HrTable headings={["Department", "Head", "People", "Leave goes to", "Steps", "Backup approver", ""]}>{rows.map(({ department, depth }) => {
        const head = employees.find((item) => item.id === department.headId);
        const backup = employees.find((item) => item.id === department.backupApproverId);
        return <tr key={department.id} className={department.active ? "" : "opacity-60"}>
          <td className={hrCell}><p className="flex items-center gap-2 font-medium" style={{ paddingLeft: depth * 18 }}><Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />{department.name}{!department.active && <Badge variant="neutral">Archived</Badge>}</p>{department.description && <p className="text-xs text-muted-foreground" style={{ paddingLeft: depth * 18 + 24 }}>{department.description}</p>}</td>
          <td className={hrCell}>{head?.name ?? <span className="text-muted-foreground">Not set</span>}</td>
          <td className={hrCell}>{headcount(department.name)}</td>
          <td className={hrCell}>{routeLabels[department.leaveRoute]}</td>
          <td className={hrCell}>{chainLabels[department.chain]}</td>
          <td className={hrCell}>{backup?.name ?? <span className="text-muted-foreground">None</span>}</td>
          <td className={hrCell}>{editable && <div className="flex gap-1"><Button size="sm" variant="outline" onClick={() => setEditing(department)}>Edit</Button><Button size="sm" variant="ghost" aria-label={`Remove ${department.name}`} onClick={() => setRemoving(department)}><Trash2 className="size-4" /></Button></div>}</td>
        </tr>;
      })}</HrTable>}
    </HrPanel>
    {editing && <DepartmentDialog key={editing === "new" ? `new-${preset}` : editing.id} department={editing === "new" ? undefined : editing} presetName={preset} actorId={actorId} onClose={() => setEditing(null)} />}
    {removing && <RemoveDepartmentDialog department={removing} actorId={actorId} onClose={() => setRemoving(null)} />}
  </div>;
}

function DepartmentDialog({ department, presetName, actorId, onClose }: { department?: HrDepartment; presetName: string; actorId: string; onClose: () => void }) {
  const org = useOrg();
  const { employees, updateEmployee, reassignManager } = useHrPeopleStore();
  const save = useHrOrgStore((state) => state.saveDepartment);
  const [form, setForm] = React.useState({ name: department?.name ?? presetName, description: department?.description ?? "", parentId: department?.parentId ?? "", headId: department?.headId ?? "", leaveRoute: department?.leaveRoute ?? "reporting_manager" as HrDepartment["leaveRoute"], chain: department?.chain ?? "default" as HrDepartment["chain"], backupApproverId: department?.backupApproverId ?? "", active: department?.active ?? true, reroute: true });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((state) => ({ ...state, [key]: value }));
  const active = employees.filter((item) => item.status !== "archived");
  const name = form.name.trim();
  const id = department?.id ?? `dept-${slug(name)}`;
  const error = name.length < 2 ? "Give the department a name (at least 2 characters)." : org.departments.some((item) => item.id !== department?.id && item.name.toLowerCase() === name.toLowerCase()) ? `${name} already exists.` : wouldLoop(org.departments, id, form.parentId || null) ? "A department can't sit under itself or one of its own sub-departments." : form.headId && form.headId === form.backupApproverId ? "The backup approver should be someone other than the head." : form.leaveRoute === "department_head" && !form.headId ? "Choose a head, or send leave to the reporting manager." : "";
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (error) return;
    const next: HrDepartment = { id, name, description: form.description.trim(), parentId: form.parentId || null, headId: form.headId || null, leaveRoute: form.leaveRoute, chain: form.chain, backupApproverId: form.backupApproverId || null, active: form.active };
    save(next);
    // Renaming must carry the people along, otherwise they'd fall out of the department.
    if (department && department.name !== name) employees.filter((item) => item.department === department.name).forEach((item) => updateEmployee(item.id, { department: name }));
    let moved = 0;
    if (form.reroute && department) {
      const org2 = { ...org, departments: org.departments.map((item) => item.id === id ? next : item) };
      employees.filter((item) => item.department === (department.name === name ? name : department.name) && item.status !== "archived").forEach((item) => { const route = approverFor({ ...item, department: name }, org2, employees); moved += reassignManager(item.id, route.id, route.name); });
    }
    record(actorId, department ? "department_updated" : "department_created", `${name}${department && department.name !== name ? ` (was ${department.name})` : ""}${moved ? ` · ${moved} pending request${moved === 1 ? "" : "s"} re-routed` : ""}`);
    toast.success(department ? `${name} saved.${moved ? ` ${moved} pending request${moved === 1 ? "" : "s"} moved to the new approver.` : ""}` : `${name} added.`);
    onClose();
  }
  return <HrModal open onOpenChange={(open) => !open && onClose()} title={department ? `Edit ${department.name}` : "Add department"} description="The head, the route and the steps decide who sees an employee's leave request.">
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <HrField label="Name"><Input required maxLength={40} value={form.name} onChange={(event) => set("name", event.target.value)} className="rounded-none" /></HrField>
        <HrField label="Reports up to"><select className={hrInputClass} value={form.parentId} onChange={(event) => set("parentId", event.target.value)}><option value="">Top level</option>{org.departments.filter((item) => item.id !== department?.id && item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></HrField>
      </div>
      <HrField label="What this team does (optional)"><Input maxLength={80} value={form.description} onChange={(event) => set("description", event.target.value)} className="rounded-none" /></HrField>
      <div className="grid gap-4 sm:grid-cols-2">
        <HrField label="Department head"><select className={hrInputClass} value={form.headId} onChange={(event) => set("headId", event.target.value)}><option value="">Not set</option>{active.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.title}</option>)}</select></HrField>
        <HrField label="Backup approver (optional)"><select className={hrInputClass} value={form.backupApproverId} onChange={(event) => set("backupApproverId", event.target.value)}><option value="">None</option>{active.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></HrField>
        <HrField label="Leave requests go to"><select className={hrInputClass} value={form.leaveRoute} onChange={(event) => set("leaveRoute", event.target.value as HrDepartment["leaveRoute"])}>{Object.entries(routeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></HrField>
        <HrField label="Steps to approve"><select className={hrInputClass} value={form.chain} onChange={(event) => set("chain", event.target.value as HrDepartment["chain"])}>{Object.entries(chainLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></HrField>
      </div>
      {department && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.reroute} onChange={(event) => set("reroute", event.target.checked)} />Move requests that are still pending to the new approver</label>}
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
    <HrPanel title="Roles & permissions" description="A role is a set of things someone is allowed to do. Give a role to a person under People & access." actions={editable ? <Button size="sm" onClick={() => setEditing("new")}><Plus className="mr-1 size-4" />Add role</Button> : undefined}>
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
  const [permissions, setPermissions] = React.useState<OrgPermission[]>(role?.permissions ?? []);
  const toggle = (permission: OrgPermission) => setPermissions((current) => current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission]);
  const clean = name.trim();
  const id = role?.id ?? `role-${slug(clean)}`;
  const nextOrg = { ...org, roles: org.roles.some((item) => item.id === id) ? org.roles.map((item) => item.id === id ? { ...item, permissions } : item) : [...org.roles, { id, name: clean, description, permissions, system: false }] };
  const error = clean.length < 2 ? "Give the role a name (at least 2 characters)." : org.roles.some((item) => item.id !== role?.id && item.name.toLowerCase() === clean.toLowerCase()) ? `${clean} already exists.` : managers(nextOrg, employees).length === 0 ? "Someone must keep the permission to manage departments and roles." : "";
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (error) return;
    save({ id, name: role?.system ? role.name : clean, description: description.trim(), permissions, system: role?.system ?? false });
    record(actorId, role ? "role_updated" : "role_created", `${clean}: ${permissions.map(permissionLabel).join(", ") || "own records only"}`);
    toast.success(role ? `${clean} saved.` : `${clean} added. Give it to people under People & access.`);
    onClose();
  }
  const groups = [...new Set(permissionCatalog.map((item) => item.group))];
  return <HrModal open onOpenChange={(open) => !open && onClose()} title={role ? `Edit ${role.name}` : "Add role"} description="Tick what people with this role are allowed to do.">
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2"><HrField label="Role name"><Input required maxLength={40} disabled={role?.system} value={name} onChange={(event) => setName(event.target.value)} className="rounded-none" /></HrField><HrField label="What it is for (optional)"><Input maxLength={80} value={description} onChange={(event) => setDescription(event.target.value)} className="rounded-none" /></HrField></div>
      {groups.map((group) => <fieldset key={group} className="border border-border p-3"><legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</legend><div className="grid gap-2">{permissionCatalog.filter((item) => item.group === group).map((item) => <label key={item.id} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={permissions.includes(item.id)} onChange={() => toggle(item.id)} /><span>{item.label}<span className="block text-xs text-muted-foreground">{item.hint}</span></span></label>)}</div></fieldset>)}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={Boolean(error)}>{role ? "Save role" : "Add role"}</Button></div>
    </form>
  </HrModal>;
}

function PeopleTab({ actorId, editable }: { actorId: string; editable: boolean }) {
  const org = useOrg();
  const employees = useHrPeopleStore((state) => state.employees);
  const assign = useHrOrgStore((state) => state.assignRole);
  const [query, setQuery] = React.useState("");
  const people = employees.filter((item) => item.status !== "archived" && `${item.name} ${item.department} ${item.title}`.toLowerCase().includes(query.trim().toLowerCase()));
  function change(employee: HrEmployee, roleId: string) {
    if (org.assignments[employee.id] === "role-owner" && roleId !== "role-owner" && Object.values(org.assignments).filter((id) => id === "role-owner").length === 1) { toast.error("The company needs an Owner. Make someone else Owner first."); return; }
    const next = { ...org, assignments: { ...org.assignments } };
    if (roleId === "role-employee") delete next.assignments[employee.id]; else next.assignments[employee.id] = roleId;
    if (managers(next, employees).length === 0) { toast.error("Someone must keep the permission to manage departments and roles."); return; }
    assign(employee.id, roleId === "role-employee" ? null : roleId);
    record(actorId, "role_assigned", `${employee.name} is now ${org.roles.find((item) => item.id === roleId)?.name}`);
    toast.success(`${employee.name} is now ${org.roles.find((item) => item.id === roleId)?.name}.`);
  }
  return <HrPanel title="People & access" description="Give each person a role. A role adds to what their place in the reporting line already allows." actions={<Input aria-label="Search people" placeholder="Search people" value={query} onChange={(event) => setQuery(event.target.value)} className="h-8 w-48 rounded-none" />}>
    {people.length === 0 ? <HrEmpty>No one matches that search.</HrEmpty> : <HrTable headings={["Person", "Department", "Reports to", "Role"]}>{people.map((person) => <tr key={person.id}>
      <td className={hrCell}><p className="font-medium">{person.name}</p><p className="text-xs text-muted-foreground">{person.title}</p></td>
      <td className={hrCell}>{person.department}</td>
      <td className={hrCell}>{person.managerName ?? "—"}</td>
      <td className={hrCell}><select aria-label={`Role for ${person.name}`} disabled={!editable} className={`${hrInputClass} w-48`} value={roleOf(org, person.id)?.id ?? "role-employee"} onChange={(event) => change(person, event.target.value)}>{org.roles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></td>
    </tr>)}</HrTable>}
  </HrPanel>;
}

function FlowTab() {
  const org = useOrg();
  const employees = useHrPeopleStore((state) => state.employees);
  const settings = useHrOperationsStore((state) => state.settings);
  const active = employees.filter((item) => item.status !== "archived");
  const [personId, setPersonId] = React.useState(active.find((item) => item.id === "emp-006")?.id ?? active[0]?.id ?? "");
  const [typeId, setTypeId] = React.useState("default");
  const person = active.find((item) => item.id === personId);
  const path = person ? approvalPath(person, org, employees, settings, typeId) : null;
  return <div className="grid gap-4 lg:grid-cols-2">
    <HrPanel title="Who approves this person's leave?" description="Pick someone to see the exact route their request takes right now.">
      <div className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2"><HrField label="Employee"><select className={hrInputClass} value={personId} onChange={(event) => setPersonId(event.target.value)}>{active.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.department}</option>)}</select></HrField><HrField label="Leave type"><select className={hrInputClass} value={typeId} onChange={(event) => setTypeId(event.target.value)}><option value="default">Follow the usual route</option>{settings.leaveTypes.filter((item) => item.active && item.approval !== "default").map((item) => <option key={item.id} value={item.approval}>{item.name} ({item.approval === "hr" ? "HR only" : item.approval === "manager" ? "approver only" : "approver, then HR"})</option>)}</select></HrField></div>
        {path ? <ol className="space-y-2">{path.steps.map((step, index) => <li key={step} className="flex gap-3 border border-border bg-surface-2 px-3 py-2 text-sm"><span className="flex size-6 shrink-0 items-center justify-center bg-accent text-xs font-semibold text-accent-foreground">{index + 1}</span>{step}</li>)}{path.backup && <li className="text-xs text-muted-foreground">If they are away, {path.backup} can approve instead.</li>}<li className="text-xs text-muted-foreground">Department: {path.department}. Nobody approves their own request.</li></ol> : <HrEmpty>No one to show.</HrEmpty>}
      </div>
    </HrPanel>
    <HrPanel title="Route by department" description="Change any of these under Departments.">
      <HrTable headings={["Department", "First approver", "Steps"]}>{org.departments.filter((item) => item.active).map((department) => { const head = employees.find((item) => item.id === department.headId); return <tr key={department.id}><td className={hrCell}>{department.name}</td><td className={hrCell}>{department.leaveRoute === "department_head" ? `${head?.name ?? "Head not set"} (head)` : "Reporting manager"}</td><td className={hrCell}>{department.chain === "default" ? `Company default: ${chainLabels[settings.approvalChain]}` : chainLabels[department.chain]}</td></tr>; })}</HrTable>
    </HrPanel>
  </div>;
}
