/**
 * Which workspaces a signed-in person may open, from their role's permissions. The API enforces
 * the same rules; this keeps the menus from offering what would only be refused.
 */

const WORKSPACE_PERMISSION: Record<string, string> = {
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

/** Where a person starts after signing in: the first workspace they can work in. */
export function homeForPermissions(permissions: string[]) {
  if (managesBusiness(permissions)) return "/settings?tab=workspace&view=overview&workspace=business";
  if (has(permissions, "leads:write")) return "/dashboard?workspace=crm-sales";
  if (has(permissions, "leads:read_own")) return "/leads?workspace=crm-sales";
  return "/team?workspace=team-chat";
}
