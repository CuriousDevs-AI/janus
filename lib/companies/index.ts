import { activeCompany } from "@/lib/company";
import type { CompanyRecord } from "@/lib/company";
import type { CompanySpec } from "@/lib/companies/spec";
import type { DemoAccount } from "@/lib/demo-accounts";
import type { HrEmployee } from "@/lib/types";
import { acmeSpec } from "@/lib/companies/acme";
import { nimbusSpec } from "@/lib/companies/nimbus";
import { greenleafSpec } from "@/lib/companies/greenleaf";

export const specs: Record<string, CompanySpec> = { acme: acmeSpec, nimbus: nimbusSpec, greenleaf: greenleafSpec };
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
const domainOf = (name: string) => `${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}.in`;

/** A company with the owner and nothing else. New companies start here and grow as the owner adds people and records. */
function blankSpec(record: CompanyRecord): CompanySpec {
  const domain = domainOf(record.name);
  const owner: HrEmployee = { id: "emp-001", name: "Pankaj Neema", email: `pankaj@${domain}`, phone: "+91 98765 43210", title: "Owner", department: "Management", branch: record.city, managerId: null, managerName: null, status: "active", employmentType: "full_time", joiningDate: record.createdAt, location: record.city, avatarColor: "#0284c7", salaryMonthly: 0, onboardingPercent: 100, documentsDue: 0, birthDate: "1985-12-02" };
  const team: HrEmployee[] = (record.team ?? []).map((person, index) => ({ ...owner, id: `emp-${String(index + 2).padStart(3, "0")}`, name: person.name, email: person.email, title: person.title, department: person.department || "Operations", managerId: "emp-001", managerName: owner.name, salaryMonthly: 0, avatarColor: ["#7c3aed", "#d97706", "#16a34a", "#db2777", "#0891b2"][index % 5], birthDate: undefined }));
  const account: DemoAccount = { id: "owner", email: "pankaj@acmetraders.in", password: "Owner@123", name: "Pankaj Neema", title: "Owner", employeeId: "emp-001", crmUserId: "u-1", hrRole: "owner", crm: "all", blurb: "Everything in this company." };
  return { id: record.id, company: { name: record.name, short: record.name.split(/\s+/)[0], domain, industry: record.industry, city: record.city, gstin: "" }, owners: { owner: { id: "u-1", name: "Pankaj Neema" } }, buyers: [], rows: [], employees: [owner, ...team], accounts: [account] };
}

/** The spec for the company on show: a built-in one, or a sample/blank one carrying the owner's own name and city. */
export function specForRecord(record: CompanyRecord): CompanySpec {
  const base = specs[record.id];
  if (base) {
    // People added during setup join the built-in ones.
    const added = blankSpec(record).employees?.slice(1) ?? [];
    const known = new Set((base.employees ?? []).map((item) => item.email));
    return added.length && base.employees ? { ...base, employees: [...base.employees, ...added.filter((item) => !known.has(item.email)).map((item, index) => ({ ...item, id: `emp-${String((base.employees?.length ?? 0) + index + 1).padStart(3, "0")}` }))] } : base;
  }
  const template = specs[record.template];
  if (!template) return blankSpec(record);
  const blank = blankSpec(record);
  return { ...template, id: record.id, company: { ...template.company, name: record.name, short: record.name.split(/\s+/)[0], industry: record.industry, city: record.city, domain: blank.company.domain }, employees: [...(template.employees ?? []), ...(blank.employees ?? []).slice(1)] };
}
/** The company on show, read once when the page loads. Switching company reloads the page. */
export const activeSpec: CompanySpec = specForRecord(activeCompany());
export const isFirstCompany = activeSpec.id === "acme";
export { initials };
