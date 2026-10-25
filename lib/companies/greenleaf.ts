import type { DemoAccount } from "@/lib/demo-accounts";
import type { HrEmployee } from "@/lib/types";
import type { CompanySpec } from "@/lib/companies/spec";

const person = (id: string, name: string, email: string, title: string, department: string, managerId: string | null, managerName: string | null, salaryMonthly: number, joiningDate: string, color: string, birthDate: string): HrEmployee => ({ id, name, email, phone: `+91 97${id.slice(-1)}3${id.slice(-1)} 4${id.slice(-1)}1${id.slice(-1)}2`, title, department, branch: "Pune", managerId, managerName, status: "active", employmentType: "full_time", joiningDate, location: "Pune", avatarColor: color, salaryMonthly, onboardingPercent: 100, documentsDue: 0, birthDate });
const employees: HrEmployee[] = [
  person("emp-001", "Pankaj Neema", "pankaj@greenleaforganics.in", "Founder", "Management", null, null, 120000, "2024-11-01", "#0284c7", "1985-12-02"),
  person("emp-002", "Pooja Shinde", "pooja@greenleaforganics.in", "HR and Accounts Manager", "People", "emp-001", "Pankaj Neema", 58000, "2024-12-02", "#0891b2", "1992-05-17"),
  person("emp-003", "Mihir Kulkarni", "mihir@greenleaforganics.in", "Head of Store Operations", "Stores", "emp-001", "Pankaj Neema", 85000, "2024-11-18", "#7c3aed", "1988-09-04"),
  person("emp-004", "Anita Joshi", "anita@greenleaforganics.in", "Store Manager, Koregaon Park", "Stores", "emp-003", "Mihir Kulkarni", 46000, "2025-01-06", "#d97706", "1994-01-26"),
  person("emp-005", "Sameer Patil", "sameer@greenleaforganics.in", "Purchase Executive", "Purchase", "emp-003", "Mihir Kulkarni", 38000, "2025-02-10", "#16a34a", "1996-07-14"),
  person("emp-006", "Rohan Gaikwad", "rohan@greenleaforganics.in", "Delivery Lead", "Logistics", "emp-003", "Mihir Kulkarni", 34000, "2025-03-03", "#db2777", "1995-12-09"),
];
const account = (id: string, email: string, password: string, name: string, title: string, employeeId: string, crmUserId: string, hrRole: DemoAccount["hrRole"], blurb: string): DemoAccount => ({ id, email, password, name, title, employeeId, crmUserId, hrRole, crm: id === "owner" ? "all" : "none", blurb });
const accounts: DemoAccount[] = [
  account("owner", "pankaj@acmetraders.in", "Owner@123", "Pankaj Neema", "Founder", "emp-001", "u-1", "owner", "Everything in this company."),
  account("hr", "pooja@greenleaforganics.in", "HR@12345", "Pooja Shinde", "HR and Accounts Manager", "emp-002", "u-2", "hr_manager", "All of HR & People."),
  account("team-lead", "mihir@greenleaforganics.in", "Lead@12345", "Mihir Kulkarni", "Head of Store Operations", "emp-003", "u-3", "reporting_manager", "Approves leave for the store, purchase and delivery team."),
  account("employee", "anita@greenleaforganics.in", "Employee@123", "Anita Joshi", "Store Manager", "emp-004", "u-4", "employee", "Own leave, pay and documents only."),
];

/** GreenLeaf starts with HR only. CRM is switched on when the Owner finishes setting the company up. */
export const greenleafSpec: CompanySpec = {
  id: "greenleaf",
  company: { name: "GreenLeaf Organics", short: "GreenLeaf", domain: "greenleaforganics.in", industry: "Organic grocery retail", city: "Pune, Maharashtra", gstin: "27AAFCG7716M1Z2" },
  owners: { owner: { id: "u-1", name: "Pankaj Neema" } },
  buyers: [],
  rows: [],
  employees,
  accounts,
};
