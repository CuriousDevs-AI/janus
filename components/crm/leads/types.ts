import type { Lead } from "@/lib/api/types";
import type { LostCategory } from "@/lib/lost-reasons";

export type Row = { lead: Lead };

export type EditForm = {
  name: string;
  phone: string;
  email: string;
  company: string;
  requirement: string;
  stage: string;
  ownerId: string;
  lostCategory: LostCategory | "";
  lostReason: string;
};

export type OptionalColumn = "followUp" | "email" | "company" | "source" | "owner" | "created" | "score" | "crm";

export type SortKey = "newest" | "oldest" | "follow_up" | "last_activity" | "name_asc" | "name_desc" | "stage_asc" | "stage_desc" | "owner_asc" | "owner_desc" | "email_asc" | "email_desc" | "company_asc" | "company_desc";

export const optionalColumns: { key: OptionalColumn; label: string }[] = [
  { key: "crm", label: "CRM" },
  { key: "followUp", label: "Next follow-up" },
  { key: "email", label: "Email" },
  { key: "company", label: "Company" },
  { key: "source", label: "Source" },
  { key: "owner", label: "Assigned to" },
  { key: "score", label: "Score" },
  { key: "created", label: "Created" },
];
