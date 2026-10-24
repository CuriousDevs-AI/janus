import type { HrEmployee } from "@/lib/types";
import type { HrDepartment, HrRoleDef, OrgPermission } from "@/lib/stores/hr-org-store";
import type { HrPolicySettings } from "@/lib/stores/hr-operations-store";

export const permissionCatalog: { id: OrgPermission; label: string; hint: string; group: string }[] = [
  { id: "leave.approve_team", label: "Approve leave of direct reports", hint: "People who report to them.", group: "Leave" },
  { id: "leave.approve_department", label: "Approve leave of their department", hint: "Everyone in the department they head, and the departments under it.", group: "Leave" },
  { id: "leave.approve_all", label: "Approve any leave, including the HR step", hint: "Works like HR for leave.", group: "Leave" },
  { id: "employees.manage", label: "Add and edit employees", hint: "Records, managers and archiving.", group: "People" },
  { id: "career.propose", label: "Propose promotions and transfers", hint: "Goes to HR (and the owner for pay) to approve.", group: "People" },
  { id: "career.approve", label: "Approve promotions and pay changes", hint: "Still never their own.", group: "People" },
  { id: "attendance.edit", label: "Correct attendance", hint: "Edit or add entries with a reason.", group: "People" },
  { id: "policies.manage", label: "Write and publish policies", hint: "Versions, archive and delete.", group: "Company" },
  { id: "settings.manage", label: "Change leave types and HR settings", hint: "Leave types, work week, approval defaults.", group: "Company" },
  { id: "org.manage", label: "Manage departments, roles and approval flow", hint: "This page.", group: "Company" },
  { id: "payroll.view", label: "See pay and payroll", hint: "Salaries, payslips and payroll runs.", group: "Money" },
];
export const permissionLabel = (id: OrgPermission) => permissionCatalog.find((item) => item.id === id)?.label ?? id;

export const chainLabels: Record<HrDepartment["chain"], string> = { default: "Company default", manager: "Approver only", manager_hr: "Approver, then HR", hr: "HR only" };
export const routeLabels: Record<HrDepartment["leaveRoute"], string> = { reporting_manager: "Employee's reporting manager", department_head: "Department head" };

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

/** Who a new leave request goes to first, following the employee's department route. */
export function approverFor(employee: HrEmployee, org: Org, employees: HrEmployee[]): { id: string | null; name: string | null } {
  const manager = employees.find((item) => item.id === employee.managerId && item.status !== "archived");
  const own = departmentByName(org.departments, employee.department);
  const fallback = { id: manager?.id ?? null, name: manager?.name ?? null };
  if (!own || own.leaveRoute !== "department_head") return fallback;
  // Nearest head above (or at) the department who is not the requester and still works here.
  for (const department of ancestry(org.departments, own.id)) {
    const head = employees.find((item) => item.id === department.headId && item.status !== "archived" && item.id !== employee.id);
    if (head) return { id: head.id, name: head.name };
  }
  return fallback;
}

/** The chain for a request: leave type override first, then the department, then the company default. */
export function chainForDepartment(settings: HrPolicySettings, typeApproval: string, department?: HrDepartment): HrPolicySettings["approvalChain"] | "hr" | "manager" {
  if (typeApproval !== "default") return typeApproval as "hr" | "manager" | "manager_hr";
  if (department && department.chain !== "default") return department.chain;
  return settings.approvalChain;
}

/** True when the actor may approve at the manager step because of a department role, not a direct report line. */
export function approvesForDepartment(org: Org, actorId: string, employee: HrEmployee) {
  if (!hasPermission(org, actorId, "leave.approve_department")) return false;
  const own = departmentByName(org.departments, employee.department);
  return ancestry(org.departments, own?.id ?? null).some((department) => department.headId === actorId);
}
export const isBackupFor = (org: Org, actorId: string, employee: HrEmployee) => {
  const own = departmentByName(org.departments, employee.department);
  return Boolean(own && own.backupApproverId === actorId);
};

/** A plain-language route for one person, used for the "who approves?" preview. */
export function approvalPath(employee: HrEmployee, org: Org, employees: HrEmployee[], settings: HrPolicySettings, typeApproval = "default") {
  const own = departmentByName(org.departments, employee.department);
  const first = approverFor(employee, org, employees);
  const chain = chainForDepartment(settings, typeApproval, own);
  const steps: string[] = [];
  if (chain === "hr") steps.push("HR decides");
  else {
    steps.push(first.name ? `${first.name} (${own?.leaveRoute === "department_head" ? "department head" : "reporting manager"}) approves` : "No manager on record, so HR decides");
    if (first.name && chain === "manager_hr") steps.push("HR gives final approval");
  }
  const backup = own?.backupApproverId ? employees.find((item) => item.id === own.backupApproverId) : undefined;
  return { steps, backup: backup?.name ?? null, chain, department: own?.name ?? employee.department };
}
