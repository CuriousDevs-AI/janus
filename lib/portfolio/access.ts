/**
 * Who can see what in the Portfolio. A role decides which sections someone opens and whether they see money;
 * the company list decides which companies' records reach them at all. The Portfolio filters the companies
 * first, so a person outside a company never receives its figures, not even inside a total.
 * Each company's own roles (inside the company) are separate and unchanged.
 */

export type PortfolioSection = "overview" | "analytics" | "finance" | "work" | "activity" | "companies" | "intelligence" | "compliance" | "notifications" | "people";
export type PortfolioRole = "owner" | "portfolio-admin" | "company-admin" | "finance-manager" | "operations-manager" | "read-only";

export interface RoleDefinition {
  label: string;
  summary: string;
  sections: PortfolioSection[];
  /** Sees revenue, costs, cash, receivables and payroll figures. */
  money: boolean;
  /** Edits company profiles, workspaces, targets. Add/remove company is owner and portfolio admin only. */
  manageCompanies: boolean;
  addCompanies: boolean;
  /** Records filings and assigns compliance owners. */
  manageCompliance: boolean;
  manageAccess: boolean;
  /** Must be limited to named companies. */
  companyScoped: boolean;
}

const ALL: PortfolioSection[] = ["overview", "analytics", "finance", "work", "activity", "companies", "intelligence", "compliance", "notifications", "people"];
export const ROLES: Record<PortfolioRole, RoleDefinition> = {
  owner: { label: "Portfolio owner", summary: "Everything, in every company. Cannot be removed.", sections: ALL, money: true, manageCompanies: true, addCompanies: true, manageCompliance: true, manageAccess: true, companyScoped: false },
  "portfolio-admin": { label: "Portfolio administrator", summary: "Runs the Portfolio for the owner: companies, access, compliance and targets.", sections: ALL, money: true, manageCompanies: true, addCompanies: true, manageCompliance: true, manageAccess: true, companyScoped: false },
  "company-admin": { label: "Company administrator", summary: "Full view and management of the companies they are given, nothing else.", sections: ALL.filter((item) => item !== "people"), money: true, manageCompanies: true, addCompanies: false, manageCompliance: true, manageAccess: false, companyScoped: true },
  "finance-manager": { label: "Finance manager", summary: "Finance, analytics, compliance and financial work items. No company setup.", sections: ["overview", "analytics", "finance", "work", "activity", "intelligence", "compliance", "notifications"], money: true, manageCompanies: false, addCompanies: false, manageCompliance: true, manageAccess: false, companyScoped: false },
  "operations-manager": { label: "Operations manager", summary: "Sales, people and operations across companies. No money figures.", sections: ["overview", "analytics", "work", "activity", "companies", "intelligence", "notifications"], money: false, manageCompanies: false, addCompanies: false, manageCompliance: false, manageAccess: false, companyScoped: false },
  "read-only": { label: "Read-only", summary: "Overview, analytics and companies to read. Changes nothing.", sections: ["overview", "analytics", "companies", "activity"], money: true, manageCompanies: false, addCompanies: false, manageCompliance: false, manageAccess: false, companyScoped: false },
};
export const ROLE_ORDER: PortfolioRole[] = ["portfolio-admin", "company-admin", "finance-manager", "operations-manager", "read-only"];

export interface Member { id: string; name: string; email: string; role: PortfolioRole | string; companies: string[]; invitedOn?: string }

/** Roles saved before these six existed. */
const LEGACY: Record<string, PortfolioRole> = { "Co-owner": "portfolio-admin", "Group finance": "finance-manager", "Group analyst": "read-only" };
export const roleOf = (member: Pick<Member, "role">): PortfolioRole => (member.role in ROLES ? member.role as PortfolioRole : LEGACY[member.role] ?? "read-only");

export interface Scope {
  role: PortfolioRole;
  name: string;
  def: RoleDefinition;
  /** Company ids this person may see; null means every company. */
  companies: string[] | null;
  can: (section: PortfolioSection) => boolean;
  sees: (companyId: string) => boolean;
}

export function scopeFor(role: PortfolioRole, name: string, companies: string[] | null): Scope {
  const def = ROLES[role];
  const list = def.companyScoped || (companies && companies.length) ? companies ?? [] : null;
  return { role, name, def, companies: list, can: (section) => def.sections.includes(section), sees: (id) => list === null || list.includes(id) };
}
export const ownerScope = (name = "Pankaj Neema") => scopeFor("owner", name, null);
export const memberScope = (member: Member) => scopeFor(roleOf(member), member.name, member.companies.length ? member.companies : null);
