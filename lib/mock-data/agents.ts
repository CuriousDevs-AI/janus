import type { Agent } from "@/lib/types";

export const agents: Agent[] = [
  {
    id: "agent-sales",
    name: "Sales Agent",
    type: "sales",
    status: "active",
    model: "Claude Sonnet 5",
    version: "v3",
    purpose: "Qualify leads and assist sales communication across website, email and WhatsApp.",
    instructions:
      "You represent CuriousDevs in sales conversations. Answer product and pricing questions using the connected knowledge base only — never invent pricing or policy. Qualify leads by asking about requirement, urgency, budget and decision-maker. Schedule demos when interest is confirmed. Escalate to a human for security-sensitive, legal or high-value (>₹5L) conversations.",
    knowledgeDocIds: ["kb-3", "kb-4", "kb-6"],
    tools: [
      { name: "get_customer()", allowed: true, requiresApproval: false },
      { name: "update_lead()", allowed: true, requiresApproval: false },
      { name: "create_deal()", allowed: true, requiresApproval: false },
      { name: "send_email()", allowed: true, requiresApproval: false },
      { name: "send_whatsapp()", allowed: true, requiresApproval: false },
      { name: "schedule_meeting()", allowed: true, requiresApproval: false },
      { name: "apply_discount()", allowed: true, requiresApproval: true },
      { name: "update_deal()", allowed: true, requiresApproval: false },
    ],
    channels: ["website_chat", "email", "whatsapp"],
    successRate: 89,
    conversationsHandled: 842,
    escalationRate: 11,
    temperature: 0.4,
    versions: [
      { version: "v3", deployedAt: "2026-08-01T10:00:00+05:30", changeSummary: "Tightened discount approval threshold to ₹5L", status: "current" },
      { version: "v2", deployedAt: "2026-06-10T10:00:00+05:30", changeSummary: "Added WhatsApp channel support", status: "previous" },
      { version: "v1", deployedAt: "2026-03-01T10:00:00+05:30", changeSummary: "Initial deployment", status: "archived" },
    ],
  },
  {
    id: "agent-support",
    name: "Support Agent",
    type: "support",
    status: "active",
    model: "Claude Sonnet 5",
    version: "v5",
    purpose: "Resolve customer support tickets using knowledge, customer history and connected tools.",
    instructions:
      "Diagnose and resolve support tickets using the knowledge base, prior tickets and the customer's plan. Always confirm before taking an irreversible action. Hand off to a human immediately if the customer explicitly asks for one, if confidence drops below 60%, or after two unsuccessful resolution attempts.",
    knowledgeDocIds: ["kb-1", "kb-2", "kb-5", "kb-6"],
    tools: [
      { name: "get_customer()", allowed: true, requiresApproval: false },
      { name: "create_ticket()", allowed: true, requiresApproval: false },
      { name: "update_ticket()", allowed: true, requiresApproval: false },
      { name: "reset_api_token()", allowed: true, requiresApproval: false },
      { name: "issue_refund()", allowed: true, requiresApproval: true },
      { name: "notify_human()", allowed: true, requiresApproval: false },
    ],
    channels: ["email", "whatsapp", "website_chat"],
    successRate: 71,
    conversationsHandled: 1204,
    escalationRate: 24,
    temperature: 0.2,
    versions: [
      { version: "v5", deployedAt: "2026-08-05T10:00:00+05:30", changeSummary: "Lowered handoff confidence threshold to 60%", status: "current" },
      { version: "v4", deployedAt: "2026-06-20T10:00:00+05:30", changeSummary: "Added refund policy grounding", status: "previous" },
      { version: "v3", deployedAt: "2026-04-11T10:00:00+05:30", changeSummary: "Improved auth-issue diagnosis", status: "archived" },
    ],
  },
  {
    id: "agent-qualification",
    name: "Qualification Agent",
    type: "qualification",
    status: "active",
    model: "Claude Haiku 4.5",
    version: "v2",
    purpose: "First-touch lead qualification — extract intent, requirement and route to the right owner.",
    instructions:
      "For every new inbound lead, extract intent, requirement, urgency and company signals. Produce a lead score with explicit reasons. Route high-value or sensitive leads to a human immediately without engaging further.",
    knowledgeDocIds: ["kb-3"],
    tools: [
      { name: "get_customer()", allowed: true, requiresApproval: false },
      { name: "update_lead()", allowed: true, requiresApproval: false },
      { name: "notify_human()", allowed: true, requiresApproval: false },
    ],
    channels: ["website_chat", "whatsapp", "email"],
    successRate: 94,
    conversationsHandled: 623,
    escalationRate: 6,
    temperature: 0.1,
    versions: [
      { version: "v2", deployedAt: "2026-07-18T10:00:00+05:30", changeSummary: "Added budget-signal detection", status: "current" },
      { version: "v1", deployedAt: "2026-05-02T10:00:00+05:30", changeSummary: "Initial deployment", status: "archived" },
    ],
  },
  {
    id: "agent-analyst",
    name: "Business Analyst",
    type: "analyst",
    status: "active",
    model: "Claude Opus 5",
    version: "v1",
    purpose: "Answer natural-language questions about the business by converting them into validated analytics queries.",
    instructions:
      "Never fabricate business numbers. Convert every question into a validated analytics query against the data layer, retrieve results, then explain them in plain language with sources and the exact filters used.",
    knowledgeDocIds: [],
    tools: [
      { name: "run_analytics_query()", allowed: true, requiresApproval: false },
      { name: "get_customer()", allowed: true, requiresApproval: false },
    ],
    channels: ["website_chat"],
    successRate: 96,
    conversationsHandled: 214,
    escalationRate: 2,
    temperature: 0.1,
    versions: [{ version: "v1", deployedAt: "2026-06-01T10:00:00+05:30", changeSummary: "Initial deployment", status: "current" }],
  },
];

export function getAgentById(id?: string): Agent | undefined {
  if (!id) return undefined;
  return agents.find((a) => a.id === id);
}
