import type {
  HrAttendanceRecord,
  HrCandidate,
  HrDocument,
  HrExpenseClaim,
  HrComplianceItem,
  HrSignatureAudit,
  HrEmployee,
  HrLeaveRequest,
  HrOnboardingTask,
  HrPayrollIssue,
  HrPayrollRun,
  HrWhatsAppAction,
} from "@/lib/types";

import { activeSpec, isFirstCompany } from "@/lib/companies";

const baseEmployees: HrEmployee[] = [
  { id: "emp-001", name: "Pankaj Neema", email: "pankaj@acmetraders.in", phone: "+91 98765 43210", title: "Owner", department: "Management", branch: "Gurugram", managerId: null, managerName: null, status: "active", employmentType: "full_time", joiningDate: "2023-04-01", location: "Gurugram", avatarColor: "#2563eb", salaryMonthly: 220000, onboardingPercent: 100, documentsDue: 0 },
  { id: "emp-002", name: "Shaista Khan", email: "shaista@acmetraders.in", phone: "+91 98765 11223", title: "HR Manager", department: "People", branch: "Gurugram", managerId: "emp-001", managerName: "Pankaj Neema", status: "active", employmentType: "full_time", joiningDate: "2024-01-08", location: "Gurugram", avatarColor: "#7c3aed", salaryMonthly: 98000, onboardingPercent: 100, documentsDue: 1 },
  { id: "emp-003", name: "Arjun Mehta", email: "arjun@acmetraders.in", phone: "+91 98111 22334", title: "Sales Manager", department: "Sales", branch: "Gurugram", managerId: "emp-001", managerName: "Pankaj Neema", status: "active", employmentType: "full_time", joiningDate: "2023-09-12", location: "Gurugram", avatarColor: "#059669", salaryMonthly: 72000, onboardingPercent: 100, documentsDue: 0 },
  { id: "emp-004", name: "Riya Kapoor", email: "riya@acmetraders.in", phone: "+91 98765 43210", title: "Account Executive", department: "Sales", branch: "Delhi", managerId: "emp-003", managerName: "Arjun Mehta", status: "active", employmentType: "full_time", joiningDate: "2025-02-03", location: "New Delhi", avatarColor: "#d97706", salaryMonthly: 52000, onboardingPercent: 100, documentsDue: 0 },
  { id: "emp-005", name: "Neha Verma", email: "neha@acmetraders.in", phone: "+91 98220 55667", title: "Operations Executive", department: "Operations", branch: "Jaipur", managerId: "emp-001", managerName: "Pankaj Neema", status: "active", employmentType: "full_time", joiningDate: "2024-08-19", location: "Jaipur", avatarColor: "#db2777", salaryMonthly: 46000, onboardingPercent: 100, documentsDue: 0 },
  { id: "emp-006", name: "Vikas Jain", email: "vikas@acmetraders.in", phone: "+91 97970 88776", title: "Warehouse Associate", department: "Operations", branch: "Jaipur", managerId: "emp-005", managerName: "Neha Verma", status: "onboarding", employmentType: "full_time", joiningDate: "2026-10-14", location: "Jaipur", avatarColor: "#0f766e", salaryMonthly: 28000, onboardingPercent: 68, documentsDue: 2 },
  { id: "emp-007", name: "Aman Verma", email: "aman@acmetraders.in", phone: "+91 99100 44556", title: "Finance Executive", department: "Finance", branch: "Gurugram", managerId: "emp-001", managerName: "Pankaj Neema", status: "active", employmentType: "full_time", joiningDate: "2024-05-06", location: "Gurugram", avatarColor: "#475569", salaryMonthly: 61000, onboardingPercent: 100, documentsDue: 0 },
  { id: "emp-008", name: "Karan Bhatt", email: "karan@acmetraders.in", phone: "+91 98880 99887", title: "Customer Support Lead", department: "Support", branch: "Gurugram", managerId: "emp-001", managerName: "Pankaj Neema", status: "notice", employmentType: "full_time", joiningDate: "2023-07-17", location: "Gurugram", avatarColor: "#dc2626", salaryMonthly: 68000, onboardingPercent: 100, documentsDue: 1 },
  { id: "emp-009", name: "Meera Singh", email: "meera@acmetraders.in", phone: "+91 98720 33415", title: "Sales Executive", department: "Sales", branch: "Gurugram", managerId: "emp-003", managerName: "Arjun Mehta", status: "active", employmentType: "full_time", joiningDate: "2026-09-01", location: "Gurugram", avatarColor: "#7c3aed", salaryMonthly: 42000, onboardingPercent: 100, documentsDue: 0 },
];

const birthDates: Record<string, string> = { "emp-001": "1985-12-02", "emp-002": "1990-11-14", "emp-003": "1988-11-03", "emp-004": "1996-10-26", "emp-005": "1993-10-24", "emp-006": "1998-12-19", "emp-007": "1994-11-29", "emp-008": "1991-10-31", "emp-009": "1997-03-18" };
export const acmeEmployees: HrEmployee[] = baseEmployees.map((employee) => ({ ...employee, birthDate: birthDates[employee.id] }));
export const hrEmployees: HrEmployee[] = isFirstCompany ? acmeEmployees : activeSpec.employees ?? [];

const acme_hrCandidates: HrCandidate[] = [
  { id: "cand-001", name: "Meera Iyer", email: "meera@example.com", phone: "+91 99001 22110", role: "People Operations Executive", department: "People", stage: "interview", ownerName: "Shaista Khan", score: 88, updatedAt: "2026-10-21" },
  { id: "cand-002", name: "Rohit Malhotra", email: "rohit@example.com", phone: "+91 98100 33221", role: "Warehouse Associate", department: "Operations", stage: "offer", ownerName: "Neha Verma", score: 81, updatedAt: "2026-10-20" },
  { id: "cand-003", name: "Divya Nair", email: "divya@example.com", phone: "+91 98990 22331", role: "Account Executive", department: "Sales", stage: "screening", ownerName: "Arjun Mehta", score: 76, updatedAt: "2026-10-18" },
  { id: "cand-004", name: "Kabir Singh", email: "kabir@example.com", phone: "+91 98700 11552", role: "Finance Analyst", department: "Finance", stage: "accepted", ownerName: "Aman Verma", score: 92, updatedAt: "2026-10-16" },
];
export const demoHrCandidates: HrCandidate[] = acme_hrCandidates;

export const hrCandidates: HrCandidate[] = isFirstCompany ? demoHrCandidates : [];

const acmeTodayAttendance: HrAttendanceRecord[] = [
  { id: "att-001", employeeId: "emp-003", employeeName: "Arjun Mehta", date: "2026-10-23", status: "present", checkIn: "09:08", checkOut: null, shift: "09:00–18:00", overtimeHours: 0, anomaly: null },
  { id: "att-002", employeeId: "emp-004", employeeName: "Riya Kapoor", date: "2026-10-23", status: "late", checkIn: "09:42", checkOut: null, shift: "09:00–18:00", overtimeHours: 0, anomaly: "Late by 42 minutes" },
  { id: "att-003", employeeId: "emp-005", employeeName: "Neha Verma", date: "2026-10-23", status: "present", checkIn: "08:57", checkOut: null, shift: "09:00–18:00", overtimeHours: 0, anomaly: null },
  { id: "att-004", employeeId: "emp-006", employeeName: "Vikas Jain", date: "2026-10-23", status: "absent", checkIn: null, checkOut: null, shift: "09:00–18:00", overtimeHours: 0, anomaly: "No punch received" },
  { id: "att-005", employeeId: "emp-007", employeeName: "Aman Verma", date: "2026-10-23", status: "present", checkIn: "09:01", checkOut: null, shift: "09:00–18:00", overtimeHours: 0, anomaly: null },
  { id: "att-006", employeeId: "emp-008", employeeName: "Karan Bhatt", date: "2026-10-23", status: "on_leave", checkIn: null, checkOut: null, shift: "09:00–18:00", overtimeHours: 0, anomaly: null },
];

const todayAttendance: HrAttendanceRecord[] = isFirstCompany ? acmeTodayAttendance : [];

/** Oct 1 to 22 for each person, so calendars and reports have real-looking history. Deterministic, so reloads match. */
function attendanceHistory(): HrAttendanceRecord[] {
  const closed = new Set(["2026-10-02", "2026-10-20"]);
  const rows: HrAttendanceRecord[] = [];
  hrEmployees.forEach((employee, index) => {
    for (let day = 1; day <= 22; day += 1) {
      const date = `2026-10-${String(day).padStart(2, "0")}`;
      const weekday = new Date(`${date}T12:00:00`).getDay();
      if (weekday === 0 || weekday === 6 || closed.has(date) || date < employee.joiningDate) continue;
      const k = (index * 7 + day * 3) % 13;
      const base = { id: `att-h-${employee.id}-${day}`, employeeId: employee.id, employeeName: employee.name, date, shift: "09:00–18:00", overtimeHours: 0 };
      if (k === 4 && day % 2 === 0) rows.push({ ...base, status: "absent", checkIn: null, checkOut: null, anomaly: "No punch received" });
      else if (k === 0) rows.push({ ...base, status: "late", checkIn: `09:${20 + (day % 4) * 7}`, checkOut: "18:10", anomaly: `Late by ${20 + (day % 4) * 7} minutes` });
      else if (k === 7) rows.push({ ...base, status: "present", checkIn: "08:58", checkOut: null, anomaly: "Missing check-out" });
      else rows.push({ ...base, status: "present", checkIn: `08:${50 + (day % 9)}`, checkOut: `18:${String(day % 3 * 5).padStart(2, "0")}`, anomaly: null });
    }
  });
  return rows;
}
export const hrAttendance: HrAttendanceRecord[] = [...todayAttendance, ...attendanceHistory()];

export const acme_hrLeaveRequests: HrLeaveRequest[] = [
  { id: "leave-001", employeeId: "emp-004", employeeName: "Riya Kapoor", managerId: "emp-003", managerName: "Arjun Mehta", type: "earned", from: "2026-10-28", to: "2026-10-29", days: 2, reason: "Family function in Jaipur", status: "pending", step: "manager", createdAt: "2026-10-22" },
  { id: "leave-002", employeeId: "emp-006", employeeName: "Vikas Jain", managerId: "emp-005", managerName: "Neha Verma", type: "sick", from: "2026-10-23", to: "2026-10-23", days: 1, reason: "Not feeling well", status: "needs_clarification", step: "manager", createdAt: "2026-10-23" },
  { id: "leave-003", employeeId: "emp-005", employeeName: "Neha Verma", managerId: "emp-001", managerName: "Pankaj Neema", type: "casual", from: "2026-11-04", to: "2026-11-05", days: 2, reason: "Personal work", status: "approved", step: "complete", createdAt: "2026-10-18" },
];
export const demoHrLeaveRequests: HrLeaveRequest[] = acme_hrLeaveRequests;

export const hrLeaveRequests: HrLeaveRequest[] = isFirstCompany ? demoHrLeaveRequests : [];

const acme_hrDocuments: HrDocument[] = [
  { id: "doc-001", employeeId: "emp-004", employeeName: "Riya Kapoor", name: "Employment agreement", category: "Employment", visibility: "employee_manager", version: 2, status: "current", signatureStatus: "signed", issuedAt: "2025-02-03", expiresAt: null, ownerName: "Shaista Khan", acknowledgedAt: "2025-02-03" },
  { id: "doc-002", employeeId: "emp-004", employeeName: "Riya Kapoor", name: "NDA and confidentiality", category: "NDA", visibility: "employee", version: 1, status: "current", signatureStatus: "signed", issuedAt: "2025-02-03", expiresAt: null, ownerName: "Shaista Khan", acknowledgedAt: "2025-02-03" },
  { id: "doc-003", employeeId: "emp-006", employeeName: "Vikas Jain", name: "Bank account proof", category: "Statutory", visibility: "payroll", version: 1, status: "missing", signatureStatus: "draft", issuedAt: null, expiresAt: null, ownerName: "Aman Verma", acknowledgedAt: null },
  { id: "doc-004", employeeId: "emp-006", employeeName: "Vikas Jain", name: "Offer letter", category: "Employment", visibility: "employee", version: 1, status: "current", signatureStatus: "partially_signed", issuedAt: "2026-10-14", expiresAt: null, ownerName: "Shaista Khan", acknowledgedAt: null },
  { id: "doc-005", employeeId: "emp-008", employeeName: "Karan Bhatt", name: "Experience letter", category: "Exit", visibility: "employee", version: 1, status: "expiring", signatureStatus: "sent", issuedAt: "2023-07-17", expiresAt: "2026-11-01", ownerName: "Shaista Khan", acknowledgedAt: null },
  { id: "doc-006", employeeId: "emp-008", employeeName: "Karan Bhatt", name: "Full-and-final settlement", category: "Exit", visibility: "payroll", version: 1, status: "current", signatureStatus: "draft", issuedAt: null, expiresAt: null, ownerName: "Aman Verma", acknowledgedAt: null },
  { id: "doc-007", employeeId: "emp-008", employeeName: "Karan Bhatt", name: "Exit clearance checklist", category: "Exit", visibility: "hr", version: 1, status: "current", signatureStatus: "signed", issuedAt: "2026-10-18", expiresAt: null, ownerName: "Shaista Khan", acknowledgedAt: "2026-10-22" },
  { id: "doc-008", employeeId: "emp-006", employeeName: "Vikas Jain", name: "Handbook acknowledgement", category: "Policy", visibility: "employee", version: 1, status: "current", signatureStatus: "sent", issuedAt: "2026-10-14", expiresAt: null, ownerName: "Shaista Khan", acknowledgedAt: null },
];
export const demoHrDocuments: HrDocument[] = acme_hrDocuments;

export const hrDocuments: HrDocument[] = isFirstCompany ? demoHrDocuments : [];

const acme_hrOnboardingTasks: HrOnboardingTask[] = [
  { id: "onb-001", employeeId: "emp-006", employeeName: "Vikas Jain", title: "Upload bank account proof", ownerRole: "employee", status: "todo", dueAt: "2026-10-25" },
  { id: "onb-002", employeeId: "emp-006", employeeName: "Vikas Jain", title: "Sign NDA and offer letter", ownerRole: "employee", status: "in_progress", dueAt: "2026-10-24" },
  { id: "onb-003", employeeId: "emp-006", employeeName: "Vikas Jain", title: "Confirm first-day shift", ownerRole: "manager", status: "done", dueAt: "2026-10-20" },
  { id: "onb-004", employeeId: "emp-006", employeeName: "Vikas Jain", title: "Create payroll profile", ownerRole: "finance", status: "todo", dueAt: "2026-10-27" },
];
export const demoHrOnboardingTasks: HrOnboardingTask[] = acme_hrOnboardingTasks;

export const hrOnboardingTasks: HrOnboardingTask[] = isFirstCompany ? demoHrOnboardingTasks : [];

const acmePayrollRuns: HrPayrollRun[] = [
  { id: "pay-2026-10", month: "October 2026", status: "review", employeeCount: 8, gross: 615000, deductions: 68500, net: 546500, deltaPercent: 4.8, issueCount: 2, updatedAt: "2026-10-23T09:10:00+05:30" },
  { id: "pay-2026-09", month: "September 2026", status: "locked", employeeCount: 7, gross: 587000, deductions: 64500, net: 522500, deltaPercent: 2.1, issueCount: 0, updatedAt: "2026-09-30T18:20:00+05:30" },
];
const grossPay = hrEmployees.reduce((sum, item) => sum + item.salaryMonthly, 0);
const otherPayrollRuns: HrPayrollRun[] = [
  { id: "pay-2026-10", month: "October 2026", status: "review", employeeCount: hrEmployees.length, gross: grossPay, deductions: Math.round(grossPay * 0.11), net: grossPay - Math.round(grossPay * 0.11), deltaPercent: 0, issueCount: 0, updatedAt: "2026-10-23T10:00:00+05:30" },
  { id: "pay-2026-09", month: "September 2026", status: "locked", employeeCount: hrEmployees.length, gross: grossPay, deductions: Math.round(grossPay * 0.11), net: grossPay - Math.round(grossPay * 0.11), deltaPercent: 0, issueCount: 0, updatedAt: "2026-09-28T10:00:00+05:30" },
];
export const demoPayrollRuns: HrPayrollRun[] = isFirstCompany ? acmePayrollRuns : otherPayrollRuns;
export const hrPayrollRuns: HrPayrollRun[] = isFirstCompany ? demoPayrollRuns : [];

const acme_hrPayrollIssues: HrPayrollIssue[] = [
  { id: "issue-001", employeeId: "emp-006", employeeName: "Vikas Jain", severity: "high", title: "Bank account proof missing", detail: "Payroll profile cannot be released until the employee uploads a verified account proof.", status: "open", amountDelta: 0 },
  { id: "issue-002", employeeId: "emp-008", employeeName: "Karan Bhatt", severity: "medium", title: "Notice-period leave adjustment", detail: "Two leave days overlap with the recorded notice period and need HR review.", status: "open", amountDelta: -5200 },
  { id: "issue-003", employeeId: "emp-004", employeeName: "Riya Kapoor", severity: "low", title: "Variable commission changed", detail: "Commission is ₹3,500 higher than September based on approved CRM deals.", status: "resolved", amountDelta: 3500 },
];
export const demoHrPayrollIssues: HrPayrollIssue[] = acme_hrPayrollIssues;

export const hrPayrollIssues: HrPayrollIssue[] = isFirstCompany ? demoHrPayrollIssues : [];

const acme_hrWhatsAppActions: HrWhatsAppAction[] = [
  { id: "wa-001", employeeId: "emp-004", employeeName: "Riya Kapoor", action: "leave", status: "delivered", createdAt: "2026-10-22T16:30:00+05:30" },
  { id: "wa-002", employeeId: "emp-006", employeeName: "Vikas Jain", action: "onboarding", status: "sent", createdAt: "2026-10-22T10:10:00+05:30" },
  { id: "wa-003", employeeId: "emp-005", employeeName: "Neha Verma", action: "payslip", status: "approved", createdAt: "2026-10-01T11:20:00+05:30" },
];
export const demoHrWhatsAppActions: HrWhatsAppAction[] = acme_hrWhatsAppActions;

export const hrWhatsAppActions: HrWhatsAppAction[] = isFirstCompany ? demoHrWhatsAppActions : [];

export const acme_hrExpenseClaims: HrExpenseClaim[] = [
  { id: "expense-001", employeeId: "emp-006", employeeName: "Vikas Jain", category: "travel", amount: 1840, submittedAt: "2026-10-22", status: "manager_review", approverName: "Neha Verma", receiptAttached: true },
  { id: "expense-002", employeeId: "emp-004", employeeName: "Riya Kapoor", category: "meals", amount: 1260, submittedAt: "2026-10-21", status: "hr_review", approverName: "Shaista Khan", receiptAttached: true },
  { id: "expense-003", employeeId: "emp-005", employeeName: "Neha Verma", category: "phone", amount: 899, submittedAt: "2026-10-18", status: "paid", approverName: "Pankaj Neema", receiptAttached: true },
];
export const demoHrExpenseClaims: HrExpenseClaim[] = acme_hrExpenseClaims;

export const hrExpenseClaims: HrExpenseClaim[] = isFirstCompany ? demoHrExpenseClaims : [];

const acme_hrSignatureAudits: HrSignatureAudit[] = [
  { id: "sig-001", documentId: "doc-001", documentName: "Employment agreement", employeeName: "Riya Kapoor", event: "signed", actorName: "Riya Kapoor", occurredAt: "2026-10-21T16:20:00+05:30", device: "Chrome · Delhi" },
  { id: "sig-002", documentId: "doc-004", documentName: "Offer letter", employeeName: "Vikas Jain", event: "viewed", actorName: "Vikas Jain", occurredAt: "2026-10-22T11:05:00+05:30", device: "Android · Jaipur" },
  { id: "sig-003", documentId: "doc-005", documentName: "Experience letter", employeeName: "Karan Bhatt", event: "sent", actorName: "Shaista Khan", occurredAt: "2026-10-20T09:15:00+05:30", device: "Janus · Gurugram" },
];
export const demoHrSignatureAudits: HrSignatureAudit[] = acme_hrSignatureAudits;

export const hrSignatureAudits: HrSignatureAudit[] = isFirstCompany ? demoHrSignatureAudits : [];

const acmeComplianceItems: HrComplianceItem[] = [
  { id: "compliance-001", title: "PF / ECR filing", jurisdiction: "EPFO · All states", dueAt: "2026-11-15", ownerName: "Aman Verma", status: "upcoming", detail: "October contribution file is ready for review." },
  { id: "compliance-002", title: "ESI contribution", jurisdiction: "ESIC · Haryana / Rajasthan", dueAt: "2026-11-15", ownerName: "Aman Verma", status: "attention", detail: "One employee bank/ESI detail needs verification." },
  { id: "compliance-003", title: "Professional Tax return", jurisdiction: "Haryana", dueAt: "2026-11-10", ownerName: "Shaista Khan", status: "due", detail: "Review the state return before submission." },
  { id: "compliance-004", title: "TDS Form 24Q preparation", jurisdiction: "Income Tax · Q2", dueAt: "2026-10-31", ownerName: "Aman Verma", status: "filed", detail: "Draft prepared from the approved payroll run." },
];
const hrOwner = hrEmployees.find((item) => item.department === "People")?.name ?? hrEmployees[0]?.name ?? "HR";
const otherComplianceItems: HrComplianceItem[] = [
  { id: "compliance-001", title: "PF / ECR filing", jurisdiction: "EPFO", dueAt: "2026-11-15", ownerName: hrOwner, status: "upcoming", detail: "Monthly provident fund return for October." },
  { id: "compliance-002", title: "Professional Tax return", jurisdiction: "State PT office", dueAt: "2026-11-10", ownerName: hrOwner, status: "upcoming", detail: "Monthly professional tax payment." },
  { id: "compliance-003", title: "TDS Form 24Q preparation", jurisdiction: "Income Tax · Q2", dueAt: "2026-10-31", ownerName: hrOwner, status: "due", detail: "Quarterly TDS return on salaries." },
];
export const hrComplianceItems: HrComplianceItem[] = isFirstCompany ? acmeComplianceItems : otherComplianceItems;

const acmeAttendanceTrend = [
  { label: "Mon", present: 7, absent: 1 },
  { label: "Tue", present: 8, absent: 0 },
  { label: "Wed", present: 7, absent: 1 },
  { label: "Thu", present: 6, absent: 2 },
  { label: "Fri", present: 7, absent: 1 },
  { label: "Sat", present: 5, absent: 3 },
];
export const hrAttendanceTrend = isFirstCompany ? acmeAttendanceTrend : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label, index) => ({ label, present: Math.max(1, hrEmployees.length - (index % 3 === 0 ? 1 : 0) - (label === "Sat" ? 2 : 0)), absent: (index % 3 === 0 ? 1 : 0) + (label === "Sat" ? 2 : 0) }));

const acmeDepartmentCounts = [
  { label: "Sales", value: 2 },
  { label: "Operations", value: 2 },
  { label: "People", value: 1 },
  { label: "Finance", value: 1 },
  { label: "Support", value: 1 },
  { label: "Management", value: 1 },
];
export const hrDepartmentCounts = isFirstCompany ? acmeDepartmentCounts : [...new Set(hrEmployees.map((item) => item.department))].map((label) => ({ label, value: hrEmployees.filter((item) => item.department === label).length }));
