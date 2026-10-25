import type { HrEmployee, HrLeaveRequest } from "@/lib/types";
import type { ApprovalStepKind, HrDepartment, HrRoleDef, OrgPermission } from "@/lib/stores/hr-org-store";
import type { HrPolicySettings } from "@/lib/stores/hr-operations-store";

/** `admin` permissions belong to the built-in Owner and HR Manager roles and are not offered on custom roles. */
export const permissionCatalog: { id: OrgPermission; label: string; hint: string; group: string; admin?: boolean }[] = [
  { id: "leave.approve_team", label: "Approve leave of direct reports", hint: "People who report to them.", group: "Leave" },
  { id: "leave.approve_department", label: "Approve leave of their department", hint: "Everyone in the department they head, and the departments under it.", group: "Leave" },
  { id: "leave.approve_all", label: "Approve any leave, including the HR step", hint: "Works like HR for leave.", group: "Leave" },
  { id: "employees.manage", label: "Add and edit employees", hint: "Records, managers and archiving.", group: "People" },
  { id: "career.propose", label: "Propose promotions and transfers", hint: "Goes to HR (and the owner for pay) to approve.", group: "People" },
  { id: "career.approve", label: "Approve promotions and pay changes", hint: "Still never their own.", group: "People" },
  { id: "attendance.edit", label: "Correct attendance", hint: "Edit or add entries with a reason.", group: "People" },
  { id: "policies.manage", label: "Write and publish policies", hint: "Versions, archive and delete.", group: "Company", admin: true },
  { id: "settings.manage", label: "Change leave types and HR settings", hint: "Leave types, work week, approval defaults.", group: "Company", admin: true },
  { id: "org.manage", label: "Manage departments, roles and approval flow", hint: "This page.", group: "Company", admin: true },
  { id: "payroll.view", label: "See pay and payroll", hint: "Salaries, payslips and payroll runs.", group: "Money", admin: true },
];
export const permissionLabel = (id: OrgPermission) => permissionCatalog.find((item) => item.id === id)?.label ?? id;

export const stepLabels: Record<ApprovalStepKind, string> = { manager: "Reporting manager", head: "Department head", upper_head: "Head of the department above", hr: "HR" };
/** What a leave type's own approver setting means as levels. */
export const typeSteps = (approval: string): ApprovalStepKind[] | null => approval === "manager" ? ["manager"] : approval === "manager_hr" ? ["manager", "hr"] : approval === "hr" ? ["hr"] : null;
export const companySteps = (settings: HrPolicySettings): ApprovalStepKind[] => settings.approvalChain === "manager" ? ["manager"] : ["manager", "hr"];
export const stepsText = (steps: ApprovalStepKind[]) => steps.map((step) => stepLabels[step]).join(" → ");

type Org = { departments: HrDepartment[]; roles: HrRoleDef[]; assignments: Record<string, string> };

export const departmentByName = (departments: HrDepartment[], name: string) => departments.find((item) => item.name.toLowerCase() === name.trim().toLowerCase());
export const roleOf = (org: Org, employeeId: string) => org.roles.find((item) => item.id === (org.assignments[employeeId] ?? "role-employee"));
export const permissionsOf = (org: Org, employeeId: string): OrgPermission[] => roleOf(org, employeeId)?.permissions ?? [];
export const hasPermission = (org: Org, employeeId: string, permission: OrgPermission) => permissionsOf(org, employeeId).includes(permission);

/** The department plus every department above it, nearest first. Stops on a loop. */
export function ancestry(departments: HrDepartment[], departmentId: string | null) {
  const out: HrDepartment[] = [];
  let current = departments.find((item) => item.id === departmentId);
  while (current && !out.includes(current)) { out.push(current); current = departments.find((item) => item.id === current!.parentId); }
  return out;
}
/** Every department under this one. */
export function descendants(departments: HrDepartment[], departmentId: string) {
  const found = new Set<string>();
  const walk = (id: string) => departments.filter((item) => item.parentId === id).forEach((item) => { if (!found.has(item.id)) { found.add(item.id); walk(item.id); } });
  walk(departmentId);
  return found;
}
export const wouldLoop = (departments: HrDepartment[], departmentId: string, parentId: string | null) => parentId !== null && (parentId === departmentId || descendants(departments, departmentId).has(parentId));

export interface RouteStep { kind: "person" | "hr"; id?: string; name: string; label: string; viaBackup?: boolean }

/** The department's own route for this many days, or the leave type's, or the company default. */
export function stepsFor(settings: HrPolicySettings, department: HrDepartment | undefined, typeApproval: string, days: number): ApprovalStepKind[] {
  const forType = typeSteps(typeApproval);
  if (forType) return forType;
  if (department?.longLeave && days >= department.longLeave.minDays) return department.longLeave.steps;
  return department?.steps ?? companySteps(settings);
}

/**
 * The people a leave request must pass, in order. Skips the requester and anyone already on the route,
 * swaps in the department's backup when the approver is away on the start date, and falls back to HR
 * if nobody can be found, so a request never has nowhere to go.
 */
export function resolveRoute(employee: HrEmployee, org: Org, employees: HrEmployee[], settings: HrPolicySettings, options: { typeApproval?: string; days?: number; away?: { leaves: HrLeaveRequest[]; from: string } } = {}): RouteStep[] {
  const own = departmentByName(org.departments, employee.department);
  const steps = stepsFor(settings, own, options.typeApproval ?? "default", options.days ?? 1);
  const works = (id: string | null | undefined) => employees.find((item) => item.id === id && item.status !== "archived" && item.id !== employee.id);
  const out: RouteStep[] = [];
  const used = new Set<string>();
  const chain = ancestry(org.departments, own?.id ?? null);
  const backup = works(own?.backupApproverId);
  const isAway = (id: string) => Boolean(options.away && options.away.leaves.some((item) => item.employeeId === id && item.status === "approved" && item.from <= options.away!.from && item.to >= options.away!.from));
  for (const step of steps) {
    if (step === "hr") { if (!out.some((item) => item.kind === "hr")) out.push({ kind: "hr", name: "HR", label: stepLabels.hr }); continue; }
    let person = step === "manager" ? works(employee.managerId)
      : step === "head" ? chain.map((department) => works(department.headId)).find(Boolean)
      : chain.slice(1).map((department) => works(department.headId)).find((head) => head && !used.has(head.id));
    if (!person || used.has(person.id)) continue;
    let viaBackup = false;
    if (backup && isAway(person.id) && backup.id !== person.id && !used.has(backup.id)) { person = backup; viaBackup = true; }
    used.add(person.id);
    out.push({ kind: "person", id: person.id, name: person.name, label: stepLabels[step], viaBackup });
  }
  return out.length ? out : [{ kind: "hr", name: "HR", label: stepLabels.hr }];
}

/** The chain as the older single-step model understood it. Only used for requests made before routes existed. */
export function chainForDepartment(settings: HrPolicySettings, typeApproval: string, department?: HrDepartment): "manager_hr" | "manager" | "hr" {
  const steps = typeSteps(typeApproval) ?? department?.steps ?? companySteps(settings);
  return steps.length === 1 && steps[0] === "hr" ? "hr" : steps.includes("hr") ? "manager_hr" : "manager";
}

/** True when the actor may approve at a manager step because of a department role, not a direct report line. */
export function approvesForDepartment(org: Org, actorId: string, employee: HrEmployee) {
  if (!hasPermission(org, actorId, "leave.approve_department")) return false;
  const own = departmentByName(org.departments, employee.department);
  return ancestry(org.departments, own?.id ?? null).some((department) => department.headId === actorId);
}
export const isBackupFor = (org: Org, actorId: string, employee: HrEmployee) => {
  const own = departmentByName(org.departments, employee.department);
  return Boolean(own && own.backupApproverId === actorId);
};
