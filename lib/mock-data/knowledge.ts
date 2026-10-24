import type { KnowledgeDocument, KnowledgeSourceType } from "@/lib/types";
import { at } from "@/lib/demo-universe";

type Doc = { id: string; title: string; type: KnowledgeSourceType; category: KnowledgeDocument["category"]; status: KnowledgeDocument["status"]; chunks: number; agents: string[]; size: string; retrievals: number; updatedDaysAgo: number; createdDaysAgo: number; excerpt: string; history: [number, string, string][] };
const docs: Doc[] = [
  { id: "kb-1", title: "Price list, October 2026", type: "pdf", category: "pricing", status: "published", chunks: 64, agents: ["agent-sales", "agent-support"], size: "1.4 MB", retrievals: 288, updatedDaysAgo: 9, createdDaysAgo: 120, excerpt: "Festive range: staples, snacks, beverages and gift packs. Minimum order 40 cartons per drop. Prices are ex-GST and valid until 15 November. Volume slabs apply from 100 cartons...", history: [[3, "Meera Singh", "Added the festive gift packs"], [2, "Arjun Mehta", "Updated edible oil and pulses rates"], [1, "Pankaj Neema", "Initial publish"]] },
  { id: "kb-2", title: "Credit and payment terms", type: "policy", category: "policy", status: "published", chunks: 22, agents: ["agent-sales", "agent-support"], size: "96 KB", retrievals: 171, updatedDaysAgo: 30, createdDaysAgo: 200, excerpt: "Standard credit is 30 days from invoice. New accounts start at 15 days with a credit limit set by the owner. Extensions beyond 30 days need owner approval and a signed order...", history: [[2, "Aman Verma", "Added the credit limit review step"], [1, "Pankaj Neema", "Initial publish"]] },
  { id: "kb-3", title: "Delivery and short-supply policy", type: "policy", category: "support", status: "published", chunks: 31, agents: ["agent-support"], size: "120 KB", retrievals: 134, updatedDaysAgo: 14, createdDaysAgo: 160, excerpt: "Report short or damaged delivery within 48 hours with a photo of the challan. We either send the missing cartons on the next truck or issue a credit note, at the customer's choice...", history: [[2, "Karan Bhatt", "Clarified the 48-hour window"], [1, "Karan Bhatt", "Initial publish"]] },
  { id: "kb-4", title: "Returns and replacements", type: "faq", category: "faq", status: "published", chunks: 27, agents: ["agent-support", "agent-sales"], size: "78 KB", retrievals: 109, updatedDaysAgo: 21, createdDaysAgo: 150, excerpt: "Q: What if cartons arrive crushed? A: Send photos within 48 hours and we credit or replace. Q: Can short-dated stock be replaced? A: Yes, if under four weeks to expiry on delivery...", history: [[2, "Karan Bhatt", "Added the short-expiry rule"], [1, "Karan Bhatt", "Initial publish"]] },
  { id: "kb-5", title: "GST invoicing and credit notes", type: "docx", category: "policy", status: "published", chunks: 18, agents: ["agent-support"], size: "152 KB", retrievals: 86, updatedDaysAgo: 40, createdDaysAgo: 220, excerpt: "Every dispatch carries a GST invoice and delivery challan. A quantity or rate error is corrected by a credit note against the original invoice within the same GST period...", history: [[2, "Aman Verma", "Added the credit-note timeline"], [1, "Aman Verma", "Initial publish"]] },
  { id: "kb-6", title: "Delivery slots and cut-off times", type: "faq", category: "support", status: "draft", chunks: 12, agents: ["agent-sales", "agent-support"], size: "44 KB", retrievals: 41, updatedDaysAgo: 3, createdDaysAgo: 5, excerpt: "Orders placed before 6pm are dispatched next day from Gurugram. Rajasthan routes run Monday, Wednesday and Friday. Dark-store slots start at 5:30am and need a day's notice...", history: [[1, "Neha Verma", "First draft from the warehouse schedule"]] },
];

export const knowledgeDocuments: KnowledgeDocument[] = docs.map((doc) => ({
  id: doc.id, title: doc.title, type: doc.type, category: doc.category, status: doc.status, version: doc.history.length, chunkCount: doc.chunks, usedByAgentIds: doc.agents,
  updatedAt: at(doc.updatedDaysAgo, "10:00"), createdAt: at(doc.createdDaysAgo, "10:00"), sizeLabel: doc.size, retrievalCount30d: doc.retrievals, excerpt: doc.excerpt,
  versions: doc.history.map(([version, updatedBy, changeSummary], index) => ({ version, updatedAt: at(doc.updatedDaysAgo + index * 45, "10:00"), updatedBy, changeSummary })).sort((a, b) => b.version - a.version),
}));

export function getKnowledgeDocById(id?: string): KnowledgeDocument | undefined {
  if (!id) return undefined;
  return knowledgeDocuments.find((d) => d.id === id);
}
