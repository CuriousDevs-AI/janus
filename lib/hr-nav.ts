import type { HrDemoRole } from "@/lib/types";

/** Which HR menu entries a role sees. The menu and the command palette both use this, so they never disagree. */
export function hrNavVisible(label: string, role: HrDemoRole) {
  if (role === "owner" || role === "hr_manager") return true;
  // Everyone is also an employee, so every preview gets the personal pages.
  const mySelfService = ["Home", "Engage", "My profile", "My onboarding", "Document Center", "My documents", "Ask about policy", "Payslips", "Reimbursements", "Leave Apply", "Leave Balances", "Leave Calendar", "Holiday Calendar", "My requests", "Attendance Info", "Regularization & Permission"];
  // A manager works with their own team: leave, attendance, approvals, promotions and reviews.
  if (role === "reporting_manager") return mySelfService.includes(label) || ["My Team", "Pending Approvals", "Leave Management", "Attendance", "Promotions & changes", "Performance & Reviews", "Expenses & Reimbursements"].includes(label);
  // Finance handles money only: no leave, attendance or employee records.
  if (role === "payroll_admin") return (mySelfService.includes(label) && label !== "Leave Calendar") || ["Payroll", "Expenses & Reimbursements", "HR Compliance"].includes(label);
  return mySelfService.includes(label);
}
