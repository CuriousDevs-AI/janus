import type { badgeVariants } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";
import type { Role } from "@/lib/types";

type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

export interface RoleMeta {
  label: string;
  tone: BadgeTone;
  summary: string;
  bullets: string[];
}

export const roleMeta: Record<Role, RoleMeta> = {
  owner: {
    label: "Owner",
    tone: "accent",
    summary: "Full control over the workspace.",
    bullets: [
      "Full access to every workspace area",
      "Manage billing, security & danger-zone actions",
      "Cannot be removed by other admins",
    ],
  },
  admin: {
    label: "Admin",
    tone: "accent",
    summary: "Manages team and AI configuration.",
    bullets: [
      "Manage team, channels & AI configuration",
      "Approve high-risk AI and automation actions",
      "No billing access",
    ],
  },
  ceo: {
    label: "CEO",
    tone: "accent",
    summary: "Company-level owner of business direction and approvals.",
    bullets: ["Business-wide visibility and decision making", "Manage workspaces, people and sensitive approvals", "Workspace record access is assigned separately"],
  },
  business_manager: {
    label: "Business Manager",
    tone: "info",
    summary: "Runs company operations across Business Management.",
    bullets: ["Manage assigned business settings and workspaces", "Review reports, risks and automation approvals", "No CRM or HR records without explicit workspace access"],
  },
  product_manager: {
    label: "Product Manager",
    tone: "info",
    summary: "Owns product direction, insights and cross-workspace planning.",
    bullets: ["Read business reports and intelligence", "Manage product-related workflows and recommendations", "No department records without explicit workspace access"],
  },
  sales_manager: {
    label: "Sales Manager",
    tone: "info",
    summary: "Owns the sales pipeline.",
    bullets: [
      "View and manage all deals and leads",
      "Approve discount and pricing exceptions",
      "Manage sales team assignments",
    ],
  },
  sales_agent: {
    label: "Sales Agent",
    tone: "info",
    summary: "Works assigned leads and deals.",
    bullets: [
      "Manage own leads and deals",
      "Send messages across connected channels",
      "Cannot approve pricing exceptions",
    ],
  },
  support_agent: {
    label: "Support Agent",
    tone: "warning",
    summary: "Handles tickets and conversations.",
    bullets: [
      "Manage assigned tickets and conversations",
      "Issue refunds within policy limits",
      "Escalate to a manager when blocked",
    ],
  },
  finance: {
    label: "Finance",
    tone: "success",
    summary: "Approves money-related actions.",
    bullets: [
      "Approve refunds and payment term changes",
      "View billing and usage reports",
      "Read-only access to deals",
    ],
  },
  analyst: {
    label: "Analyst",
    tone: "neutral",
    summary: "Reports on business performance.",
    bullets: [
      "Read-only access to analytics & reporting",
      "Run evaluations on AI agents",
      "Cannot modify customer records",
    ],
  },
  read_only: {
    label: "Read Only",
    tone: "neutral",
    summary: "View-only workspace access.",
    bullets: [
      "View records across the workspace",
      "Cannot send messages or edit data",
      "Useful for auditors & external reviewers",
    ],
  },
};

export const roleOrder: Role[] = [
  "owner",
  "admin",
  "ceo",
  "business_manager",
  "product_manager",
  "sales_manager",
  "sales_agent",
  "support_agent",
  "finance",
  "analyst",
  "read_only",
];
