import type { DemoAccount } from "@/lib/demo-accounts";
import type { HrEmployee } from "@/lib/types";

export type LeadSourceKey = "website" | "whatsapp" | "phone_call";
export interface Buyer { id: string; company: string; contact: string; phone: string; email: string; city: string; kind: string }
/** buyer number, source, stage, days since captured, days since last activity, owner key, campaign, requirement, deal (name, amount, close in days) */
export type Row = [number, LeadSourceKey, string, number, number, string, string | null, string, [string, number, number]?];

/** Everything one demo company is made of. The rest of the app builds its screens from this. */
export interface CompanySpec {
  id: string;
  company: { name: string; short: string; domain: string; industry: string; city: string; gstin: string };
  /** CRM user ids and names, keyed by a short label the rows refer to. */
  owners: Record<string, { id: string; name: string }>;
  buyers: Buyer[];
  rows: Row[];
  /** People, for companies other than the first (the first keeps its detailed HR seed). */
  employees?: HrEmployee[];
  accounts?: DemoAccount[];
}
