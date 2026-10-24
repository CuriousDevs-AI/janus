import type { Lead, LeadStage, ScoreReason } from "@/lib/types";
import { leadRows } from "@/lib/demo-universe";

const ownerMap: Record<string, string> = { "demo-owner": "u-1", "emp-003": "u-4", "emp-004": "u-3", "emp-009": "u-2" };
const scoreByStage: Record<string, number> = { new: 52, qualified: 70, proposal: 78, negotiation: 86, won: 92, lost: 30 };
const decisionMakers: Record<string, string> = { "demo-customer-1": "Purchase Head", "demo-customer-2": "Canteen Purchase Manager", "demo-customer-3": "Owner", "demo-customer-4": "Proprietor", "demo-customer-5": "Store Manager", "demo-customer-6": "Purchase Manager", "demo-customer-7": "Category Manager", "demo-customer-8": "Procurement Lead", "demo-customer-9": "Secretary", "demo-customer-10": "Supply Chain Lead", "demo-customer-11": "Administrator", "demo-customer-12": "Proprietor", "demo-customer-13": "Purchase Manager", "demo-customer-14": "Owner" };

function reasons(stage: string, source: string, campaign: string | null): ScoreReason[] {
  const out: ScoreReason[] = [];
  if (stage === "won") out.push({ label: "Order delivered and paid", signal: "positive" });
  if (stage === "lost") out.push({ label: "Chose another supplier", signal: "negative" });
  if (campaign) out.push({ label: `Came in through ${campaign}`, signal: "positive" });
  out.push({ label: source === "whatsapp" ? "Replied on WhatsApp within the hour" : source === "phone_call" ? "Called the sales desk" : "Filled the website form", signal: source === "phone_call" && stage === "new" ? "neutral" : "positive" });
  return out;
}

/** Leads for Acme Traders, from the shared demo company. */
export const leads: Lead[] = leadRows.map((row, index) => ({
  id: `lead-${index + 1}`, customerId: `cus-${Number(row.customerId.replace("demo-customer-", ""))}`, source: row.source, campaign: row.campaign ?? undefined, stage: row.stage as LeadStage,
  score: scoreByStage[row.stage] + (index % 5), scoreReasons: reasons(row.stage, row.source, row.campaign), ownerId: ownerMap[row.ownerId ?? "demo-owner"] ?? "u-1",
  createdAt: row.createdAt, lastActivityAt: row.lastActivityAt, intent: ["won", "negotiation", "proposal"].includes(row.stage) ? "high" : row.stage === "lost" ? "low" : "medium",
  budgetSignal: row.stage === "lost" ? "constrained" : row.dealId ? "known" : "unknown", decisionMaker: decisionMakers[row.customerId], requirement: row.requirement, dealId: row.dealId ? row.dealId.replace("demo-deal-", "deal-") : undefined,
}));

export function getLeadById(id?: string): Lead | undefined {
  if (!id) return undefined;
  return leads.find((l) => l.id === id);
}

export function getLeadsForCustomer(customerId: string): Lead[] {
  return leads.filter((l) => l.customerId === customerId);
}
