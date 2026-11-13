/**
 * Which workspaces a signed-in person may open, from their role's permissions. The API enforces
 * the same rules; this keeps the menus from offering what would only be refused.
 */

export const WORKSPACE_PERMISSION: Record<string, string> = {
  "crm-sales": "leads:read_own",
  "hr-people": "hr:self",
  "finance-accounting": "billing:manage",
  "projects-delivery": "projects:manage",
  "customer-support": "leads:read_team",
  "operations-inventory": "stock:adjust",
  "it-infrastructure": "settings:manage",
};

function has(permissions: string[], permission: string) {
  return permissions.includes("*") || permissions.includes(permission);
}

/** Business Management (company overview, people, workspaces, settings) is for owners and admins. */
export function managesBusiness(permissions: string[]) {
  return has(permissions, "workspaces:manage") || has(permissions, "settings:manage");
}

export function mayOpenWorkspace(id: string, permissions: string[]) {
  if (id === "team-chat") return true;
  if (id === "business") return managesBusiness(permissions);
  // People managers see HR & People for the company's people, without their own HR record.
  if (id === "hr-people" && has(permissions, "members:manage")) return true;
  const required = WORKSPACE_PERMISSION[id];
  return required ? has(permissions, required) : false;
}

/** Roles that see the Portfolio: the Owner, and the roles it is shared with, company by company. */
export const PORTFOLIO_ROLES = ["owner", "group_admin", "company_admin", "finance_manager", "operations_manager", "group_finance", "group_analyst"];
/** Portfolio roles that include money. */
export const MONEY_ROLES = ["owner", "group_admin", "company_admin", "finance_manager", "group_finance"];
export const roleLabel = (role: string) => ({ owner: "Owner", admin: "Admin", manager: "Manager", agent: "Agent", group_finance: "Group finance", group_analyst: "Read-only", group_admin: "Portfolio administrator", company_admin: "Company administrator", finance_manager: "Finance manager", operations_manager: "Operations manager" } as Record<string, string>)[role] ?? role;

/** Where a person starts after signing in: the first workspace they can work in. */
export function homeForPermissions(permissions: string[]) {
  if (managesBusiness(permissions)) return "/settings?tab=workspace&view=overview&workspace=business";
  // A group role works across companies, so it starts on the Portfolio.
  if (has(permissions, "portfolio:read")) return "/portfolio?view=overview";
  if (has(permissions, "leads:write")) return "/dashboard?workspace=crm-sales";
  if (has(permissions, "leads:read_own")) return "/leads?workspace=crm-sales";
  return "/team?workspace=team-chat";
}

/** Workspaces whose permission can be given to one member on top of their role (the server's GRANTABLE). */
export const GRANTABLE_WORKSPACES = ["finance-accounting", "operations-inventory", "projects-delivery", "it-infrastructure"];
