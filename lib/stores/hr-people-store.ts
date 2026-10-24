"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  hrAttendance,
  hrAttendanceTrend,
  hrCandidates,
  hrDepartmentCounts,
  hrDocuments,
  hrComplianceItems,
  hrExpenseClaims,
  hrSignatureAudits,
  hrEmployees,
  hrLeaveRequests,
  hrOnboardingTasks,
  hrPayrollIssues,
  hrPayrollRuns,
  hrWhatsAppActions,
} from "@/lib/mock-data/hr-people";
import type {
  ApprovalStatus,
  HrAttendanceRecord,
  HrCandidate,
  HrDemoRole,
  HrDocument,
  HrComplianceItem,
  HrExpenseClaim,
  HrExpenseStatus,
  HrSignatureAudit,
  HrEmployee,
  HrLeaveRequest,
  HrOnboardingTask,
  HrPayrollIssue,
  HrPayrollRun,
  HrWhatsAppAction,
} from "@/lib/types";

interface HrPeopleState {
  demoRole: HrDemoRole;
  employees: HrEmployee[];
  candidates: HrCandidate[];
  attendance: HrAttendanceRecord[];
  leaveRequests: HrLeaveRequest[];
  documents: HrDocument[];
  onboardingTasks: HrOnboardingTask[];
  payrollIssues: HrPayrollIssue[];
  payrollRuns: HrPayrollRun[];
  whatsAppActions: HrWhatsAppAction[];
  expenseClaims: HrExpenseClaim[];
  signatureAudits: HrSignatureAudit[];
  complianceItems: HrComplianceItem[];
  setDemoRole: (role: HrDemoRole) => void;
  addEmployee: (employee: HrEmployee) => void;
  importEmployees: (created: HrEmployee[], updates: { id: string; patch: Partial<HrEmployee> }[]) => void;
  removeEmployees: (ids: string[]) => void;
  addCandidate: (candidate: HrCandidate) => void;
  updateCandidate: (id: string, patch: Partial<HrCandidate>) => void;
  updateEmployee: (id: string, patch: Partial<HrEmployee>) => void;
  archiveEmployee: (id: string) => void;
  updateLeave: (id: string, status: ApprovalStatus, step?: HrLeaveRequest["step"]) => void;
  updateAttendance: (id: string, patch: Partial<HrAttendanceRecord>) => void;
  addAttendance: (record: HrAttendanceRecord) => void;
  addLeave: (request: HrLeaveRequest) => void;
  updateDocument: (id: string, patch: Partial<HrDocument>) => void;
  addDocument: (document: HrDocument) => void;
  addExpense: (expense: HrExpenseClaim) => void;
  updateExpense: (id: string, status: HrExpenseStatus) => void;
  addSignatureAudit: (audit: HrSignatureAudit) => void;
  updateCompliance: (id: string, status: HrComplianceItem["status"]) => void;
  convertCandidate: (id: string) => string | null;
  updateOnboardingTask: (id: string, status: HrOnboardingTask["status"]) => void;
  addOnboardingTask: (task: HrOnboardingTask) => void;
  updatePayrollIssue: (id: string, status: HrPayrollIssue["status"]) => void;
  approvePayroll: (id: string) => void;
  updatePayrollRun: (id: string, patch: Partial<HrPayrollRun>) => void;
  sendWhatsAppAction: (action: Omit<HrWhatsAppAction, "id" | "createdAt" | "status">) => void;
  reset: () => void;
}

const seed = () => ({
  employees: hrEmployees,
  candidates: hrCandidates,
  attendance: hrAttendance,
  leaveRequests: hrLeaveRequests,
  documents: hrDocuments,
  onboardingTasks: hrOnboardingTasks,
  payrollIssues: hrPayrollIssues,
  payrollRuns: hrPayrollRuns,
  whatsAppActions: hrWhatsAppActions,
  expenseClaims: hrExpenseClaims,
  signatureAudits: hrSignatureAudits,
  complianceItems: hrComplianceItems,
});

let counter = 100;
const nextId = (prefix: string) => `${prefix}-${counter++}`;

export const useHrPeopleStore = create<HrPeopleState>()(
  persist(
    (set) => ({
      demoRole: "owner",
      ...seed(),
      setDemoRole: (demoRole) => set({ demoRole }),
      importEmployees: (created, updates) => set((state) => ({ employees: [...created, ...state.employees.map((employee) => { const update = updates.find((item) => item.id === employee.id); return update ? { ...employee, ...update.patch } : employee; })] })),
      removeEmployees: (ids) => set((state) => ({ employees: state.employees.filter((employee) => !ids.includes(employee.id)) })),
      addEmployee: (employee) => set((state) => ({ employees: [employee, ...state.employees] })),
      addCandidate: (candidate) => set((state) => ({ candidates: [candidate, ...state.candidates] })),
      updateCandidate: (id, patch) => set((state) => ({ candidates: state.candidates.map((item) => item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString().slice(0, 10) } : item) })),
      updateEmployee: (id, patch) => set((state) => ({ employees: state.employees.map((employee) => employee.id === id ? { ...employee, ...patch } : employee) })),
      archiveEmployee: (id) => set((state) => ({ employees: state.employees.map((employee) => employee.id === id ? { ...employee, status: "archived" } : employee) })),
      updateLeave: (id, status, step) => set((state) => ({ leaveRequests: state.leaveRequests.map((request) => request.id === id ? { ...request, status, step: step ?? (status === "approved" ? "complete" : request.step) } : request) })),
      addAttendance: (record) => set((state) => ({ attendance: [record, ...state.attendance] })),
      addLeave: (request) => set((state) => ({ leaveRequests: [request, ...state.leaveRequests] })),
      updateAttendance: (id, patch) => set((state) => ({ attendance: state.attendance.map((record) => record.id === id ? { ...record, ...patch } : record) })),
      updateDocument: (id, patch) => set((state) => ({ documents: state.documents.map((document) => document.id === id ? { ...document, ...patch } : document) })),
      addDocument: (document) => set((state) => ({ documents: [document, ...state.documents] })),
      addExpense: (expense) => set((state) => ({ expenseClaims: [expense, ...state.expenseClaims] })),
      updateExpense: (id, status) => set((state) => ({ expenseClaims: state.expenseClaims.map((expense) => expense.id === id ? { ...expense, status } : expense) })),
      addSignatureAudit: (audit) => set((state) => ({ signatureAudits: [audit, ...state.signatureAudits] })),
      updateCompliance: (id, status) => set((state) => ({ complianceItems: state.complianceItems.map((item) => item.id === id ? { ...item, status } : item) })),
      convertCandidate: (id) => {
        let employeeId: string | null = null;
        set((state) => {
          const candidate = state.candidates.find((item) => item.id === id);
          if (!candidate || candidate.convertedEmployeeId || state.employees.some((employee) => employee.email === candidate.email)) return state;
          employeeId = nextId("emp");
          const employee: HrEmployee = { id: employeeId, name: candidate.name, email: candidate.email, phone: candidate.phone, title: candidate.role, department: candidate.department, branch: "Gurugram", managerId: "emp-002", managerName: "Shaista Khan", status: "onboarding", employmentType: "full_time", joiningDate: new Date().toISOString().slice(0, 10), location: "Gurugram", avatarColor: "#2563eb", salaryMonthly: 0, onboardingPercent: 12, documentsDue: 3 };
          const tasks: HrOnboardingTask[] = [
            { id: nextId("onb"), employeeId: employeeId!, employeeName: candidate.name, title: "Send offer and employment agreement", ownerRole: "hr", status: "todo", dueAt: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10) },
            { id: nextId("onb"), employeeId: employeeId!, employeeName: candidate.name, title: "Assign workspace access and manager", ownerRole: "manager", status: "todo", dueAt: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10) },
            { id: nextId("onb"), employeeId: employeeId!, employeeName: candidate.name, title: "Collect identity and bank documents", ownerRole: "employee", status: "todo", dueAt: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) },
          ];
          return { employees: [employee, ...state.employees], onboardingTasks: [...tasks, ...state.onboardingTasks], candidates: state.candidates.map((item) => item.id === id ? { ...item, stage: "accepted", convertedEmployeeId: employeeId! } : item) };
        });
        return employeeId;
      },
      addOnboardingTask: (task) => set((state) => ({ onboardingTasks: [...state.onboardingTasks, task] })),
      updateOnboardingTask: (id, status) => set((state) => ({ onboardingTasks: state.onboardingTasks.map((task) => task.id === id ? { ...task, status } : task) })),
      updatePayrollIssue: (id, status) => set((state) => ({ payrollIssues: state.payrollIssues.map((issue) => issue.id === id ? { ...issue, status } : issue) })),
      updatePayrollRun: (id, patch) => set((state) => ({ payrollRuns: state.payrollRuns.map((run) => run.id === id ? { ...run, ...patch, updatedAt: new Date().toISOString() } : run) })),
      approvePayroll: (id) => set((state) => ({ payrollRuns: state.payrollRuns.map((run) => run.id === id ? { ...run, status: "approved", updatedAt: new Date().toISOString() } : run) })),
      sendWhatsAppAction: (action) => set((state) => ({ whatsAppActions: [{ ...action, id: nextId("wa"), status: "queued", createdAt: new Date().toISOString() }, ...state.whatsAppActions] })),
      reset: () => set({ demoRole: "owner", ...seed() }),
    }),
    {
      name: "janus.hr-people-demo",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        demoRole: state.demoRole,
        employees: state.employees,
        candidates: state.candidates,
        attendance: state.attendance,
        leaveRequests: state.leaveRequests,
        documents: state.documents,
        onboardingTasks: state.onboardingTasks,
        payrollIssues: state.payrollIssues,
        payrollRuns: state.payrollRuns,
        whatsAppActions: state.whatsAppActions,
        expenseClaims: state.expenseClaims,
        signatureAudits: state.signatureAudits,
        complianceItems: state.complianceItems,
      }),
    },
  ),
);

export const hrCharts = { attendanceTrend: hrAttendanceTrend, departmentCounts: hrDepartmentCounts };
