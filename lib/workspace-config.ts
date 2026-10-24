export type WorkspaceId =
  | "business"
  | "crm-sales"
  | "hr-people"
  | "finance-accounting"
  | "projects-delivery"
  | "customer-support"
  | "operations-inventory"
  | "it-infrastructure";

export type WorkspaceStatus = "active" | "planned";

export interface WorkspaceDefinition {
  id: WorkspaceId;
  name: string;
  description: string;
  status: WorkspaceStatus;
}

/**
 * UI-only workspace catalogue. CRM & Sales is the only active workspace in
 * this phase; the other entries make the future platform shape visible
 * without pretending those modules are implemented.
 */
export const workspaceDefinitions: WorkspaceDefinition[] = [
  {
    id: "business",
    name: "Business Management",
    description: "Business overview, people, finance and operating controls.",
    status: "active",
  },
  {
    id: "crm-sales",
    name: "CRM & Sales",
    description: "Leads, conversations, deals and customer follow-up.",
    status: "active",
  },
  {
    id: "hr-people",
    name: "HR & People",
    description: "People, teams and employee operations.",
    status: "planned",
  },
  {
    id: "finance-accounting",
    name: "Finance & Accounting",
    description: "Invoices, expenses, payments and reporting.",
    status: "planned",
  },
  {
    id: "projects-delivery",
    name: "Projects & Delivery",
    description: "Projects, tasks, milestones and delivery health.",
    status: "planned",
  },
  {
    id: "customer-support",
    name: "Customer Support & Success",
    description: "Tickets, service conversations and customer success.",
    status: "planned",
  },
  {
    id: "operations-inventory",
    name: "Operations & Inventory",
    description: "Stock, vendors, purchases and operations.",
    status: "planned",
  },
  {
    id: "it-infrastructure",
    name: "IT & Infrastructure",
    description: "Assets, incidents and infrastructure work.",
    status: "planned",
  },
];

export const activeWorkspace = workspaceDefinitions.find((workspace) => workspace.id === "crm-sales")!;

export function getWorkspaceDefinition(id: WorkspaceId) {
  return workspaceDefinitions.find((workspace) => workspace.id === id) ?? workspaceDefinitions[0];
}

export function isWorkspaceId(value: string | null): value is WorkspaceId {
  return !!value && workspaceDefinitions.some((workspace) => workspace.id === value);
}
