import type { HrDemoRole, HrEmployee } from "@/lib/types";
import { useHrOrgStore } from "@/lib/stores/hr-org-store";
import { hasPermission } from "@/lib/hr-org";
import { actorEmployeeId } from "@/lib/demo-persona";

export const hrRoleLabels: Record<HrDemoRole, string> = {
  owner: "Owner",
  business_manager: "Business Manager",
  hr_manager: "HR Manager",
  reporting_manager: "Reporting Manager",
  payroll_admin: "Finance",
  employee: "Employee",
};

export function canManageHr(role: HrDemoRole) {
  return role === "owner" || role === "hr_manager";
}

export function canSeeBusinessSummary(role: HrDemoRole) {
  return role === "owner" || role === "business_manager";
}

/** The preview role must allow it, and the role HR gave this person must include "see pay". */
export function canSeePayroll(role: HrDemoRole) {
  const { departments, roles, assignments } = useHrOrgStore.getState();
  return (role === "owner" || role === "hr_manager" || role === "payroll_admin") && hasPermission({ departments, roles, assignments }, demoActorId(role), "payroll.view");
}

export function canApproveTeam(role: HrDemoRole) {
  return role === "owner" || role === "hr_manager" || role === "reporting_manager";
}

export function visibleEmployees(role: HrDemoRole, employees: HrEmployee[]) {
  if (role === "employee") return employees.filter((employee) => employee.id === demoActorId(role));
  if (role === "reporting_manager") return employees.filter((employee) => employee.managerId === demoActorId(role));
  if (role === "payroll_admin") return employees;
  return employees.filter((employee) => employee.status !== "archived");
}

export function canSeeEmployee(role: HrDemoRole, employee: HrEmployee) {
  if (role === "employee") return employee.id === demoActorId(role);
  if (role === "reporting_manager") return employee.managerId === demoActorId(role);
  return true;
}

export function salaryVisible(role: HrDemoRole) {
  return canSeePayroll(role);
}

/** Demo identity each preview role acts as, so documents and signatures resolve to one employee record. */
export function demoActorId(role: HrDemoRole) {
  const signedIn = actorEmployeeId(role);
  if (signedIn) return signedIn;
  const actors: Record<HrDemoRole, string> = {
    owner: "emp-001",
    hr_manager: "emp-002",
    business_manager: "emp-003",
    reporting_manager: "emp-005",
    payroll_admin: "emp-007",
    employee: "emp-006",
  };
  return actors[role];
}

const everyone: HrDemoRole[] = ["owner", "business_manager", "hr_manager", "reporting_manager", "payroll_admin", "employee"];
const hrOnly: HrDemoRole[] = ["owner", "hr_manager"];

/** Which preview roles may open each HR view. Anything not listed is open only to HR and the owner. */
const viewAccess: Record<string, HrDemoRole[]> = {
  overview: ["owner", "hr_manager", "reporting_manager", "payroll_admin", "employee"], "my-home": everyone, engage: everyone, "leave-apply": everyone, "leave-balances": everyone, "holiday-calendar": everyone, "attendance-info": everyone, "my-regularization": everyone, "document-center": everyone, "my-profile": everyone, "my-requests": everyone, "my-documents": everyone, "my-onboarding": everyone, "my-payslips": everyone, "policy-qa": everyone,
  // Finance sees money, not people: no leave, attendance, employee records or documents.
  attendance: ["owner", "hr_manager", "reporting_manager"], leave: ["owner", "hr_manager", "reporting_manager"], "leave-calendar": ["owner", "hr_manager", "reporting_manager", "employee"], expenses: ["owner", "hr_manager", "reporting_manager", "payroll_admin", "employee"],
  employees: hrOnly, documents: hrOnly, payroll: ["owner", "hr_manager", "payroll_admin"],
  compliance: ["owner", "hr_manager", "payroll_admin"],
  team: ["owner", "hr_manager", "reporting_manager"], approvals: ["owner", "hr_manager", "reporting_manager"],
  promotions: ["owner", "hr_manager", "reporting_manager"],
  performance: ["owner", "hr_manager", "reporting_manager", "employee"],
  reports: ["owner", "hr_manager"],
  organization: hrOnly, onboarding: hrOnly, offboarding: hrOnly, recruitment: hrOnly, signatures: hrOnly, settings: hrOnly,
};

export function canOpenHrView(role: HrDemoRole, view: string) {
  return (viewAccess[view] ?? hrOnly).includes(role);
}
