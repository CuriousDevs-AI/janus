import type { KnowledgeDocument } from "@/lib/types";

export const knowledgeDocuments: KnowledgeDocument[] = [
  {
    id: "kb-1",
    title: "Authentication Guide",
    type: "docx",
    category: "support",
    status: "published",
    version: 4,
    chunkCount: 38,
    usedByAgentIds: ["agent-support", "agent-sales"],
    updatedAt: "2026-08-01T10:00:00+05:30",
    createdAt: "2025-09-12T10:00:00+05:30",
    sizeLabel: "212 KB",
    retrievalCount30d: 341,
    excerpt:
      "API tokens are scoped per workspace and expire after 12 months of inactivity. To rotate a token, use Settings → API Keys → Rotate. Requests with an expired or revoked token return HTTP 401 with error code auth.token_invalid...",
    versions: [
      { version: 4, updatedAt: "2026-08-01T10:00:00+05:30", updatedBy: "Sana Iyer", changeSummary: "Added IP allowlist troubleshooting section" },
      { version: 3, updatedAt: "2026-05-14T10:00:00+05:30", updatedBy: "Sana Iyer", changeSummary: "Clarified token scope rules" },
      { version: 2, updatedAt: "2026-01-20T10:00:00+05:30", updatedBy: "Pankaj", changeSummary: "Added SSO section" },
      { version: 1, updatedAt: "2025-09-12T10:00:00+05:30", updatedBy: "Pankaj", changeSummary: "Initial publish" },
    ],
  },
  {
    id: "kb-2",
    title: "API Documentation",
    type: "url",
    category: "product",
    status: "published",
    version: 9,
    chunkCount: 214,
    usedByAgentIds: ["agent-support", "agent-sales"],
    updatedAt: "2026-08-10T10:00:00+05:30",
    createdAt: "2025-06-01T10:00:00+05:30",
    sizeLabel: "docs.curiousdevs.ai/api",
    retrievalCount30d: 512,
    excerpt:
      "The Janus API is organized around REST. All requests must include a Bearer token. Webhooks retry with exponential backoff up to 6 times over 24 hours before being marked failed...",
    versions: [
      { version: 9, updatedAt: "2026-08-10T10:00:00+05:30", updatedBy: "Pankaj", changeSummary: "Documented webhook retry backoff behavior" },
      { version: 8, updatedAt: "2026-06-22T10:00:00+05:30", updatedBy: "Pankaj", changeSummary: "Added bulk endpoints" },
    ],
  },
  {
    id: "kb-3",
    title: "Pricing 2026",
    type: "pdf",
    category: "pricing",
    status: "published",
    version: 3,
    chunkCount: 22,
    usedByAgentIds: ["agent-sales", "agent-qualification"],
    updatedAt: "2026-07-15T10:00:00+05:30",
    createdAt: "2026-01-05T10:00:00+05:30",
    sizeLabel: "180 KB",
    retrievalCount30d: 698,
    excerpt:
      "Starter — ₹0–2L/yr, up to 3 seats. Growth — ₹2–5L/yr, unlimited seats, WhatsApp + email. Enterprise — from ₹8L/yr, SSO, audit logs, dedicated CSM, custom SLA. Annual commitment unlocks up to 15% discount...",
    versions: [
      { version: 3, updatedAt: "2026-07-15T10:00:00+05:30", updatedBy: "Vikram Rao", changeSummary: "Updated Enterprise floor price" },
      { version: 2, updatedAt: "2026-04-02T10:00:00+05:30", updatedBy: "Vikram Rao", changeSummary: "Added annual discount tiers" },
      { version: 1, updatedAt: "2026-01-05T10:00:00+05:30", updatedBy: "Vikram Rao", changeSummary: "Initial publish" },
    ],
  },
  {
    id: "kb-4",
    title: "Enterprise FAQ",
    type: "faq",
    category: "faq",
    status: "published",
    version: 6,
    chunkCount: 41,
    usedByAgentIds: ["agent-sales"],
    updatedAt: "2026-08-05T10:00:00+05:30",
    createdAt: "2025-10-18T10:00:00+05:30",
    sizeLabel: "56 entries",
    retrievalCount30d: 289,
    excerpt:
      "Q: Do you support multi-region data residency? A: Yes — US, EU and IN regions are available on Enterprise. Q: What's included in the dedicated SLA? A: 1-hour first response, 99.9% uptime guarantee...",
    versions: [
      { version: 6, updatedAt: "2026-08-05T10:00:00+05:30", updatedBy: "Aman Verma", changeSummary: "Added data residency FAQ" },
      { version: 5, updatedAt: "2026-06-01T10:00:00+05:30", updatedBy: "Aman Verma", changeSummary: "Updated SLA terms" },
    ],
  },
  {
    id: "kb-5",
    title: "Refund Policy",
    type: "policy",
    category: "policy",
    status: "published",
    version: 2,
    chunkCount: 9,
    usedByAgentIds: ["agent-support"],
    updatedAt: "2026-03-10T10:00:00+05:30",
    createdAt: "2025-08-01T10:00:00+05:30",
    sizeLabel: "18 KB",
    retrievalCount30d: 64,
    excerpt:
      "Refunds above ₹25,000 require finance approval. Pro-rated refunds are issued for annual plans cancelled within 30 days. Seat-count billing corrections are credited on the next invoice...",
    versions: [
      { version: 2, updatedAt: "2026-03-10T10:00:00+05:30", updatedBy: "Vikram Rao", changeSummary: "Lowered approval threshold to ₹25,000" },
      { version: 1, updatedAt: "2025-08-01T10:00:00+05:30", updatedBy: "Vikram Rao", changeSummary: "Initial publish" },
    ],
  },
  {
    id: "kb-6",
    title: "Product Documentation",
    type: "docx",
    category: "product",
    status: "draft",
    version: 1,
    chunkCount: 76,
    usedByAgentIds: ["agent-sales", "agent-support"],
    updatedAt: "2026-08-16T10:00:00+05:30",
    createdAt: "2026-08-16T10:00:00+05:30",
    sizeLabel: "890 KB",
    retrievalCount30d: 173,
    excerpt:
      "Janus deploys across US, EU and IN regions with per-tenant data residency controls. Multi-region failover is available on Enterprise. Processing is still finishing on 3 sections...",
    versions: [{ version: 1, updatedAt: "2026-08-16T10:00:00+05:30", updatedBy: "Pankaj", changeSummary: "Initial upload — processing" }],
  },
];

export function getKnowledgeDocById(id?: string): KnowledgeDocument | undefined {
  if (!id) return undefined;
  return knowledgeDocuments.find((k) => k.id === id);
}
