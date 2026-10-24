import type { Customer, CustomerHealth, Consent, LeadStage } from "@/lib/types";
import { buyers, leadRows } from "@/lib/demo-universe";

const ownerMap: Record<string, string> = { "demo-owner": "u-1", "emp-003": "u-4", "emp-004": "u-3", "emp-009": "u-2" };
const roles = ["Purchase Head", "Canteen Purchase Manager", "Proprietor", "Owner", "Store Manager", "Purchase Manager", "Category Manager", "Procurement Lead", "Secretary", "Supply Chain Lead", "Administrator", "Proprietor", "Purchase Manager", "Owner"];
const colours = ["#0284C7", "#7C3AED", "#D97706", "#16A34A", "#DC2626", "#0891B2", "#4F46E5", "#DB2777", "#65A30D", "#EA580C", "#0D9488", "#9333EA", "#CA8A04", "#2563EB"];
const rank: LeadStage[] = ["lost", "new", "contacted", "qualified", "demo", "proposal", "negotiation", "approval", "won"];

function consent(preferredChannel: Consent["preferredChannel"]): Consent {
  return { preferredChannel, marketing: true, transactional: true, optedOut: [] };
}
/** Healthier when an order has been delivered, shakier when the last enquiry was lost. */
function health(stage: string, quiet: number): CustomerHealth {
  const base = stage === "won" ? 82 : stage === "lost" ? 38 : stage === "new" ? 60 : 68;
  const score = Math.max(20, Math.min(95, base - Math.min(quiet, 20)));
  const category: CustomerHealth["category"] = stage === "won" && score >= 78 ? "expansion" : score >= 60 ? "healthy" : score >= 45 ? "at_risk" : "high_risk";
  return { score, category, engagement: score, supportLoad: stage === "won" ? 25 : 10, usage: score, paymentHealth: stage === "lost" ? 70 : 92, sentiment: score >= 70 ? "positive" : score >= 50 ? "stable" : "negative", trend: stage === "won" ? "up" : stage === "lost" ? "down" : "flat", churnRisk: 100 - score, upsellSignal: stage === "won" };
}

/** Acme Traders' trade customers, built from the shared demo company. */
export const customers: Customer[] = buyers.map((buyer, index) => {
  const mine = leadRows.filter((item) => item.customerId === buyer.id);
  const best = mine.map((item) => item.stage as LeadStage).sort((a, b) => rank.indexOf(b) - rank.indexOf(a))[0] ?? "new";
  const first = [...mine].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  const last = [...mine].sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))[0];
  const quiet = Math.round((Date.parse("2026-10-24T12:00:00+05:30") - Date.parse(last.lastActivityAt)) / 86400000);
  const stage: Customer["stage"] = best === "won" ? "customer" : best === "lost" ? "lost" : best === "new" ? "lead" : best === "qualified" ? "qualified" : "opportunity";
  return {
    id: `cus-${index + 1}`, name: buyer.contact, email: buyer.email, phone: buyer.phone, title: roles[index], companyId: `co-${index + 1}`, avatarColor: colours[index],
    ownerId: ownerMap[first.ownerId ?? "demo-owner"] ?? "u-1", stage, source: first.source as Customer["source"], campaign: first.campaign ?? undefined, firstTouchAt: first.createdAt,
    consent: consent(first.source === "phone_call" ? "call" : first.source === "website" ? "email" : "whatsapp"), health: health(best, quiet),
    tags: [buyer.city, buyer.kind.split(",")[0], ...(stage === "customer" ? ["repeat buyer"] : [])],
  };
});

export function getCustomerById(id?: string): Customer | undefined {
  if (!id) return undefined;
  return customers.find((c) => c.id === id);
}
