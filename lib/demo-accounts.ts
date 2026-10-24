import type { HrDemoRole } from "@/lib/types";

/**
 * How much of the CRM a person may see.
 * all = every record, team = their own and their team's, own = only records they own,
 * support = tickets and chats assigned to them or still unassigned, none = no CRM at all.
 */
export type CrmScope = "all" | "team" | "own" | "support" | "none";

export interface DemoAccount {
  id: string;
  email: string;
  /** Test password for the preview. Real accounts use the backend. */
  password: string;
  name: string;
  title: string;
  /** The HR employee this person is. */
  employeeId: string;
  /** The user id the CRM records use for this person. */
  crmUserId: string;
  hrRole: HrDemoRole;
  crm: CrmScope;
  /** What they can try, in a line. */
  blurb: string;
}

export const demoAccounts: DemoAccount[] = [
  { id: "owner", email: "pankaj@acmetraders.in", password: "Owner@123", name: "Pankaj Neema", title: "Owner", employeeId: "emp-001", crmUserId: "u-1", hrRole: "owner", crm: "all", blurb: "Everything: Business Management, CRM, HR, every company." },
  { id: "sales-manager", email: "arjun@acmetraders.in", password: "Manager@123", name: "Arjun Mehta", title: "Sales Manager", employeeId: "emp-003", crmUserId: "u-4", hrRole: "reporting_manager", crm: "team", blurb: "CRM for the whole sales team, approvals, and his own team's leave." },
  { id: "sales-rep-1", email: "meera@acmetraders.in", password: "Sales@123", name: "Meera Singh", title: "Sales Executive", employeeId: "emp-009", crmUserId: "u-2", hrRole: "employee", crm: "own", blurb: "Only her own leads, deals and customers." },
  { id: "sales-rep-2", email: "riya@acmetraders.in", password: "Sales@123", name: "Riya Kapoor", title: "Account Executive", employeeId: "emp-004", crmUserId: "u-3", hrRole: "employee", crm: "own", blurb: "Only her own leads, deals and customers." },
  { id: "support", email: "karan@acmetraders.in", password: "Support@123", name: "Karan Bhatt", title: "Customer Support Lead", employeeId: "emp-008", crmUserId: "u-5", hrRole: "employee", crm: "support", blurb: "Tickets and chats assigned to him, no deals or pipeline." },
  { id: "hr", email: "shaista@acmetraders.in", password: "HR@12345", name: "Shaista Khan", title: "HR Manager", employeeId: "emp-002", crmUserId: "u-6", hrRole: "hr_manager", crm: "none", blurb: "All of HR & People. No CRM and no business finance." },
  { id: "finance", email: "aman@acmetraders.in", password: "Finance@123", name: "Aman Verma", title: "Finance Executive", employeeId: "emp-007", crmUserId: "u-7", hrRole: "payroll_admin", crm: "none", blurb: "Payroll, reimbursements and compliance. No leave or employee records." },
  { id: "team-lead", email: "neha@acmetraders.in", password: "Lead@12345", name: "Neha Verma", title: "Operations Executive", employeeId: "emp-005", crmUserId: "u-8", hrRole: "reporting_manager", crm: "none", blurb: "An employee with a team: approves leave and expenses for Vikas." },
  { id: "employee", email: "vikas@acmetraders.in", password: "Employee@123", name: "Vikas Jain", title: "Warehouse Associate", employeeId: "emp-006", crmUserId: "u-9", hrRole: "employee", crm: "none", blurb: "Own leave, pay, documents and requests only." },
];

export const accountById = (id: string | null | undefined) => demoAccounts.find((item) => item.id === id);
export const accountByEmployee = (employeeId: string) => demoAccounts.find((item) => item.employeeId === employeeId);
export function checkLogin(email: string, password: string) {
  return demoAccounts.find((item) => item.email.toLowerCase() === email.trim().toLowerCase() && item.password === password);
}
