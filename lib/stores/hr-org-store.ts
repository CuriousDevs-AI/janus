"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type OrgPermission =
  | "leave.approve_team" | "leave.approve_department" | "leave.approve_all"
  | "employees.manage" | "policies.manage" | "settings.manage" | "org.manage"
  | "career.propose" | "career.approve" | "payroll.view" | "attendance.edit";

/** A team in the company. `leaveRoute` decides whose desk a leave request lands on first. */
export interface HrDepartment {
  id: string; name: string; description: string; headId: string | null; parentId: string | null;
  leaveRoute: "reporting_manager" | "department_head";
  /** How many steps a leave request takes. "default" follows the company setting. */
  chain: "default" | "manager" | "manager_hr" | "hr";
  backupApproverId: string | null; active: boolean;
}
export interface HrRoleDef { id: string; name: string; description: string; permissions: OrgPermission[]; system: boolean }

interface HrOrgState {
  departments: HrDepartment[]; roles: HrRoleDef[]; assignments: Record<string, string>;
  saveDepartment: (department: HrDepartment) => void;
  removeDepartment: (id: string) => void;
  saveRole: (role: HrRoleDef) => void;
  removeRole: (id: string) => void;
  assignRole: (employeeId: string, roleId: string | null) => void;
}

export const defaultDepartments = (): HrDepartment[] => {
  const base = { description: "", leaveRoute: "reporting_manager" as const, chain: "default" as const, backupApproverId: null, active: true };
  return [
    { ...base, id: "dept-management", name: "Management", headId: "emp-001", parentId: null, description: "Owner and leadership" },
    { ...base, id: "dept-people", name: "People", headId: "emp-002", parentId: "dept-management", description: "HR and people operations" },
    { ...base, id: "dept-sales", name: "Sales", headId: "emp-003", parentId: "dept-management", description: "Sales and customer accounts" },
    { ...base, id: "dept-operations", name: "Operations", headId: "emp-005", parentId: "dept-management", description: "Warehouse and dispatch" },
    { ...base, id: "dept-finance", name: "Finance", headId: "emp-007", parentId: "dept-management", description: "Accounts and payroll" },
    { ...base, id: "dept-support", name: "Support", headId: "emp-008", parentId: "dept-management", description: "Customer support" },
  ];
};

export const defaultRoles = (): HrRoleDef[] => [
  { id: "role-owner", name: "Owner", description: "Full control of the company.", system: true, permissions: ["leave.approve_team", "leave.approve_department", "leave.approve_all", "employees.manage", "policies.manage", "settings.manage", "org.manage", "career.propose", "career.approve", "payroll.view", "attendance.edit"] },
  { id: "role-hr", name: "HR Manager", description: "Runs people operations day to day.", system: true, permissions: ["leave.approve_team", "leave.approve_department", "leave.approve_all", "employees.manage", "policies.manage", "settings.manage", "org.manage", "career.propose", "career.approve", "payroll.view", "attendance.edit"] },
  { id: "role-department-head", name: "Department head", description: "Approves leave for everyone in their department.", system: false, permissions: ["leave.approve_team", "leave.approve_department", "career.propose"] },
  { id: "role-manager", name: "Reporting manager", description: "Approves leave for direct reports.", system: true, permissions: ["leave.approve_team", "career.propose"] },
  { id: "role-payroll", name: "Payroll admin", description: "Sees pay and runs payroll.", system: true, permissions: ["payroll.view"] },
  { id: "role-employee", name: "Employee", description: "Own records only.", system: true, permissions: [] },
];

/** Who holds which role today. Anyone not listed here gets the plain Employee role. */
export const defaultAssignments = (): Record<string, string> => ({ "emp-001": "role-owner", "emp-002": "role-hr", "emp-003": "role-department-head", "emp-005": "role-manager", "emp-007": "role-payroll" });

export const useHrOrgStore = create<HrOrgState>()(persist((set) => ({
  departments: defaultDepartments(), roles: defaultRoles(), assignments: defaultAssignments(),
  saveDepartment: (department) => set((state) => ({ departments: state.departments.some((item) => item.id === department.id) ? state.departments.map((item) => item.id === department.id ? department : item) : [...state.departments, department] })),
  // Children of a removed department move up one level so nothing is orphaned.
  removeDepartment: (id) => set((state) => { const gone = state.departments.find((item) => item.id === id); return { departments: state.departments.filter((item) => item.id !== id).map((item) => item.parentId === id ? { ...item, parentId: gone?.parentId ?? null } : item) }; }),
  saveRole: (role) => set((state) => ({ roles: state.roles.some((item) => item.id === role.id) ? state.roles.map((item) => item.id === role.id ? role : item) : [...state.roles, role] })),
  removeRole: (id) => set((state) => ({ roles: state.roles.filter((item) => item.id !== id), assignments: Object.fromEntries(Object.entries(state.assignments).filter(([, roleId]) => roleId !== id)) })),
  assignRole: (employeeId, roleId) => set((state) => { const next = { ...state.assignments }; if (roleId) next[employeeId] = roleId; else delete next[employeeId]; return { assignments: next }; }),
}), { name: "janus.hr-org-demo.v1", version: 1, storage: createJSONStorage(() => localStorage) }));
