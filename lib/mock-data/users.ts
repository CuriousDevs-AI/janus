import { activeSpec, isFirstCompany } from "@/lib/companies";
import type { Tenant, User } from "@/lib/types";

export const tenant: Tenant = {
  id: "tenant-1",
  name: activeSpec.company.name,
  industry: activeSpec.company.industry,
  companySize: "11-50",
  timezone: "Asia/Kolkata",
  businessHours: { start: "09:00", end: "18:00" },
  defaultChannel: "whatsapp",
  plan: "growth",
  environment: "demo",
};

/** The same people as the HR demo employees. */
const acmeOwner: User = {
  id: "u-1",
  name: "Pankaj Neema",
  email: "pankaj@acmetraders.in",
  role: "owner",
  title: "Owner",
  avatarColor: "#0284C7",
  online: true,
};

const acmeUsers: User[] = [
  acmeOwner,
  { id: "u-2", name: "Meera Singh", email: "meera@acmetraders.in", role: "sales_agent", title: "Sales Executive", avatarColor: "#7C3AED", online: true },
  { id: "u-3", name: "Riya Kapoor", email: "riya@acmetraders.in", role: "sales_agent", title: "Account Executive", avatarColor: "#D97706", online: true },
  { id: "u-4", name: "Arjun Mehta", email: "arjun@acmetraders.in", role: "sales_manager", title: "Sales Manager", avatarColor: "#16A34A", online: false },
  { id: "u-5", name: "Karan Bhatt", email: "karan@acmetraders.in", role: "support_agent", title: "Customer Support Lead", avatarColor: "#DC2626", online: true },
  { id: "u-6", name: "Shaista Khan", email: "shaista@acmetraders.in", role: "admin", title: "HR Manager", avatarColor: "#0891B2", online: true },
  { id: "u-7", name: "Aman Verma", email: "aman@acmetraders.in", role: "finance", title: "Finance Executive", avatarColor: "#4F46E5", online: false },
];
const palette = ["#0284C7", "#7C3AED", "#D97706", "#16A34A", "#DC2626", "#0891B2", "#4F46E5"];
const roleOf = (account: { hrRole: string; crm: string }): User["role"] => account.hrRole === "owner" ? "owner" : account.crm === "team" ? "sales_manager" : account.crm === "own" ? "sales_agent" : account.crm === "support" ? "support_agent" : account.hrRole === "payroll_admin" ? "finance" : "admin";
/** Everyone who can sign in to the company on show, as CRM users. */
export const users: User[] = isFirstCompany ? acmeUsers : (activeSpec.accounts ?? []).map((account, index) => ({ id: account.crmUserId, name: account.name, email: account.email, role: roleOf(account), title: account.title, avatarColor: palette[index % palette.length], online: index % 2 === 0 }));
export const currentUser: User = isFirstCompany ? acmeOwner : users[0] ?? acmeOwner;

export function getUserById(id?: string): User | undefined {
  if (!id) return undefined;
  return users.find((u) => u.id === id);
}
