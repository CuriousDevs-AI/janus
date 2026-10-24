import type { Lead, LeadStage, ScoreReason } from "@/lib/types";
import { leadRows } from "@/lib/demo-universe";

const scoreByStage: Record<string, number> = { new: 52, qualified: 70, proposal: 78, negotiation: 86, won: 92, lost: 30 };
const decisionMakers: Record<string, string> = { "cus-1": "Purchase Head", "cus-2": "Canteen Purchase Manager", "cus-3": "Owner", "cus-4": "Proprietor", "cus-5": "Store Manager", "cus-6": "Purchase Manager", "cus-7": "Category Manager", "cus-8": "Procurement Lead", "cus-9": "Secretary", "cus-10": "Supply Chain Lead", "cus-11": "Administrator", "cus-12": "Proprietor", "cus-13": "Purchase Manager", "cus-14": "Owner" };

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
  id: `lead-${index + 1}`, customerId: `cus-${Number(row.customerId.replace("cus-", ""))}`, source: row.source, campaign: row.campaign ?? undefined, stage: row.stage as LeadStage,
  score: scoreByStage[row.stage] + (index % 5), scoreReasons: reasons(row.stage, row.source, row.campaign), ownerId: (row.ownerId ?? "u-1"),
  createdAt: row.createdAt, lastActivityAt: row.lastActivityAt, intent: ["won", "negotiation", "proposal"].includes(row.stage) ? "high" : row.stage === "lost" ? "low" : "medium",
  budgetSignal: row.stage === "lost" ? "constrained" : row.dealId ? "known" : "unknown", decisionMaker: decisionMakers[row.customerId], requirement: row.requirement, dealId: row.dealId ? row.dealId : undefined,
}));

export function getLeadById(id?: string): Lead | undefined {
  if (!id) return undefined;
  return leads.find((l) => l.id === id);
}

export function getLeadsForCustomer(customerId: string): Lead[] {
  return leads.filter((l) => l.customerId === customerId);
}
