import type { MemoryItem } from "@/lib/types";

export const memoryItems: MemoryItem[] = [
  { id: "mem-1", customerId: "cus-1", kind: "stable_fact", label: "Preferred channel", value: "WhatsApp", source: "Consent settings", createdAt: "2026-08-09T10:32:00+05:30", status: "approved" },
  { id: "mem-2", customerId: "cus-1", kind: "stable_fact", label: "Industry", value: "SaaS", source: "Company profile", createdAt: "2025-11-02T09:12:00+05:30", status: "approved" },
  { id: "mem-3", customerId: "cus-1", kind: "stable_fact", label: "Company size", value: "200-500", source: "Company profile", createdAt: "2025-11-02T09:12:00+05:30", status: "approved" },
  { id: "mem-4", customerId: "cus-1", kind: "stable_fact", label: "Current plan", value: "Growth (evaluating Enterprise)", source: "Billing system", createdAt: "2026-08-01T09:00:00+05:30", status: "approved" },
  { id: "mem-5", customerId: "cus-1", kind: "derived_insight", label: "Communication style", value: "Customer prefers technical explanations over marketing language.", confidence: 0.88, source: "Conversation #283 (website chat)", createdAt: "2026-08-09T10:40:00+05:30", status: "approved" },
  { id: "mem-6", customerId: "cus-1", kind: "derived_insight", label: "Purchase criteria", value: "Security and compliance is a major purchase criterion.", confidence: 0.93, source: "Conversation #291 (email)", createdAt: "2026-08-13T12:50:00+05:30", status: "approved" },
  { id: "mem-7", customerId: "cus-1", kind: "derived_insight", label: "Decision maker", value: "CTO is likely the final decision maker on security sign-off.", confidence: 0.76, source: "Conversation #291 (email)", createdAt: "2026-08-15T12:41:00+05:30", status: "pending" },
  { id: "mem-8", customerId: "cus-1", kind: "support", label: "Prior issue", value: "API authentication failure — resolved by token reset (Aug 2026).", source: "Ticket #1023", createdAt: "2026-08-17T09:35:00+05:30", status: "approved" },
  { id: "mem-9", customerId: "cus-3", kind: "stable_fact", label: "Preferred channel", value: "WhatsApp", source: "Consent settings", createdAt: "2025-05-19T14:20:00+02:00", status: "approved" },
  { id: "mem-10", customerId: "cus-3", kind: "derived_insight", label: "Technical maturity", value: "Engineering team is technically strong — prefers direct API-level answers.", confidence: 0.81, source: "Conversation #301 (WhatsApp)", createdAt: "2026-08-16T18:06:00+02:00", status: "approved" },
  { id: "mem-11", customerId: "cus-8", kind: "derived_insight", label: "Churn signal", value: "Repeated sync failures are eroding trust ahead of a critical sale weekend.", confidence: 0.9, source: "Ticket #1018", createdAt: "2026-08-17T08:56:00+05:30", status: "approved" },
  { id: "mem-12", customerId: "cus-8", kind: "stable_fact", label: "Peak season", value: "Festive sale weekend — high sensitivity to downtime.", source: "Support history", createdAt: "2025-01-08T09:00:00+05:30", status: "approved" },
  { id: "mem-13", customerId: "cus-24", kind: "derived_insight", label: "Expansion signal", value: "Team is actively evaluating a second workspace for a new business unit.", confidence: 0.85, source: "Conversation #340 (email)", createdAt: "2026-08-05T09:10:00-04:00", status: "approved" },
  { id: "mem-14", customerId: "cus-24", kind: "stable_fact", label: "Preferred channel", value: "Email", source: "Consent settings", createdAt: "2025-04-17T09:00:00-04:00", status: "approved" },
  { id: "mem-15", customerId: "cus-16", kind: "derived_insight", label: "Buying process", value: "Security review must complete before procurement engages — CISO is the gatekeeper.", confidence: 0.79, source: "Conversation #355 (email)", createdAt: "2026-08-16T10:21:00+03:00", status: "pending" },
  { id: "mem-16", customerId: "cus-19", kind: "derived_insight", label: "Risk driver", value: "Billing accuracy complaints are the primary driver of dissatisfaction.", confidence: 0.87, source: "Ticket #1009", createdAt: "2026-08-16T14:31:00+05:30", status: "approved" },
  { id: "mem-17", customerId: "cus-1", kind: "conversation", label: "Current requirement", value: "Evaluating a multi-store support rollout and wants a clear implementation timeline.", source: "WhatsApp conversation", createdAt: "2026-10-22T15:38:00+05:30", status: "approved" },
  { id: "mem-18", customerId: "cus-8", kind: "conversation", label: "Follow-up preference", value: "Prefers a concise WhatsApp update before a phone call is scheduled.", source: "WhatsApp conversation", createdAt: "2026-10-21T11:10:00+05:30", confidence: 0.84, status: "pending" },
];

export function getMemoryForCustomer(customerId: string): MemoryItem[] {
  return memoryItems.filter((m) => m.customerId === customerId);
}
