import { activeCompany } from "@/lib/company";
import type { CompanyRecord } from "@/lib/company";
import type { CompanySpec } from "@/lib/companies/spec";
import type { AccountSeed } from "@/lib/companies/spec";
import type { HrEmployee } from "@/lib/types";

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
const domainOf = (name: string) => `${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}.in`;

function blankSpec(record: CompanyRecord): CompanySpec {
  const domain = domainOf(record.name);
  const owner: HrEmployee = { id: "emp-001", name: "Pankaj Neema", email: `pankaj@${domain}`, phone: "+91 98765 43210", title: "Owner", department: "Management", branch: record.city, managerId: null, managerName: null, status: "active", employmentType: "full_time", joiningDate: record.createdAt, location: record.city, avatarColor: "#0284c7", salaryMonthly: 0, onboardingPercent: 100, documentsDue: 0, birthDate: "1985-12-02" };
  const team: HrEmployee[] = (record.team ?? []).map((person, index) => ({ ...owner, id: `emp-${String(index + 2).padStart(3, "0")}`, name: person.name, email: person.email, title: person.title, department: person.department || "Operations", managerId: "emp-001", managerName: owner.name, salaryMonthly: 0, avatarColor: ["#7c3aed", "#d97706", "#16a34a", "#db2777", "#0891b2"][index % 5], birthDate: undefined }));
  const account: AccountSeed = { id: "owner", email: `pankaj@${domain}`, password: "", name: "Pankaj Neema", title: "Owner", employeeId: "emp-001", crmUserId: "u-1", hrRole: "owner", crm: "all", blurb: "Everything in this company." };
  return { id: record.id, company: { name: record.name, short: record.name.split(/\s+/)[0], domain, industry: record.industry, city: record.city, gstin: "" }, owners: { owner: { id: "u-1", name: "Pankaj Neema" } }, buyers: [], rows: [], employees: [owner, ...team], accounts: [account] };
}

export function specForRecord(record: CompanyRecord): CompanySpec {
  return blankSpec(record);
}

export const activeSpec: CompanySpec = specForRecord(activeCompany());
export const isFirstCompany = false;
export { initials };
