import type { Activity, ActivityActor, ActivityType } from "@/lib/types";

const AI = {
  sales: { type: "ai", agentId: "agent-sales", agentName: "Sales Agent" } as ActivityActor,
  support: { type: "ai", agentId: "agent-support", agentName: "Support Agent" } as ActivityActor,
  qualification: { type: "ai", agentId: "agent-qualification", agentName: "Qualification Agent" } as ActivityActor,
};
const H = {
  pankaj: { type: "human", userId: "u-1", userName: "Pankaj" } as ActivityActor,
  aman: { type: "human", userId: "u-2", userName: "Aman Verma" } as ActivityActor,
  riya: { type: "human", userId: "u-3", userName: "Riya Kapoor" } as ActivityActor,
  karan: { type: "human", userId: "u-4", userName: "Karan Bhatt" } as ActivityActor,
  sana: { type: "human", userId: "u-5", userName: "Sana Iyer" } as ActivityActor,
  neha: { type: "human", userId: "u-6", userName: "Neha Joshi" } as ActivityActor,
  vikram: { type: "human", userId: "u-7", userName: "Vikram Rao" } as ActivityActor,
};
const SYS: ActivityActor = { type: "system" };
const CUST: ActivityActor = { type: "customer" };

let counter = 0;
function a(
  customerId: string,
  type: ActivityType,
  actor: ActivityActor,
  title: string,
  createdAt: string,
  extra?: Partial<Pick<Activity, "description" | "relatedId" | "relatedKind" | "meta">>
): Activity {
  counter += 1;
  return { id: `act-${counter}`, customerId, type, actor, title, createdAt, ...extra };
}

export const activities: Activity[] = [
  // ---------------------------------------------------------------------
  // cus-1 — Rahul Sharma / ABC Technologies — flagship cross-channel journey
  // ---------------------------------------------------------------------
  a("cus-1", "lead_created", SYS, "Original website lead created", "2025-11-02T09:12:00+05:30", { relatedId: "lead-1", relatedKind: "lead" }),
  a("cus-1", "customer_created", SYS, "Rahul Sharma became a customer — onboarded on Growth plan", "2025-12-01T10:00:00+05:30"),
  a("cus-1", "lead_created", SYS, "New inbound lead — website chat pricing inquiry", "2026-08-09T10:32:00+05:30", { relatedId: "lead-1b", relatedKind: "lead", description: "\"I want pricing for the enterprise tier.\"" }),
  a("cus-1", "ai_qualified", AI.sales, "AI qualified expansion lead — score 87", "2026-08-09T10:35:00+05:30", { description: "High intent, security-focused, budget owner unconfirmed.", relatedId: "lead-1b", relatedKind: "lead" }),
  a("cus-1", "human_action", SYS, "Routed to Aman Verma — security-sensitive request", "2026-08-09T10:37:00+05:30"),
  a("cus-1", "note_added", AI.sales, "AI insight: customer prefers technical explanations over marketing language", "2026-08-09T10:40:00+05:30"),
  a("cus-1", "deal_created", H.aman, "Deal created — Enterprise AI Support (₹8,00,000)", "2026-08-13T10:32:00+05:30", { relatedId: "deal-5", relatedKind: "deal" }),
  a("cus-1", "proposal_sent", H.aman, "Proposal sent — Enterprise AI Support", "2026-08-13T12:40:00+05:30", { relatedId: "deal-5", relatedKind: "deal" }),
  a("cus-1", "note_added", AI.sales, "AI insight: security and compliance is a major purchase criterion", "2026-08-13T12:50:00+05:30"),
  a("cus-1", "message", AI.sales, "AI sent proposal follow-up — no reply yet", "2026-08-15T12:40:00+05:30", { relatedId: "conv-3", relatedKind: "conversation" }),
  a("cus-1", "note_added", AI.sales, "AI insight: CTO is likely the final decision maker on security sign-off", "2026-08-15T12:41:00+05:30"),
  a("cus-1", "ticket_created", CUST, "Ticket #1023 opened — API integration issue", "2026-08-17T09:05:00+05:30", { relatedId: "tck-1023", relatedKind: "ticket" }),
  a("cus-1", "ai_action", AI.support, "AI sent authentication guide", "2026-08-17T09:08:00+05:30", { relatedId: "tck-1023", relatedKind: "ticket" }),
  a("cus-1", "ai_action", AI.support, "AI reset API token", "2026-08-17T09:35:00+05:30", { relatedId: "tck-1023", relatedKind: "ticket" }),
  a("cus-1", "message", CUST, "WhatsApp message received — asking about enterprise plan", "2026-08-17T11:10:00+05:30", { relatedId: "conv-2", relatedKind: "conversation" }),
  a("cus-1", "ai_action", AI.sales, "AI responded with Enterprise pricing", "2026-08-17T11:15:00+05:30", { relatedId: "conv-2", relatedKind: "conversation" }),
  a("cus-1", "human_action", H.aman, "Aman offered to schedule a technical demo", "2026-08-17T11:16:00+05:30"),
  a("cus-1", "meeting_scheduled", AI.sales, "Technical Demo scheduled — tomorrow 3:00 PM IST", "2026-08-17T11:19:00+05:30"),
  a("cus-1", "approval_requested", AI.sales, "AI requested approval — 20% discount on Enterprise AI Support", "2026-08-17T13:18:00+05:30", { relatedId: "appr-1", relatedKind: "approval" }),
  a("cus-1", "approval_decided", H.karan, "Discount approved by Karan Bhatt", "2026-08-17T13:25:00+05:30", { relatedId: "appr-1", relatedKind: "approval" }),
  a("cus-1", "stage_changed", SYS, "Deal probability increased to 75%", "2026-08-17T13:26:00+05:30", { relatedId: "deal-5", relatedKind: "deal" }),
  a("cus-1", "ticket_escalated", CUST, "Customer requested human support — handed off to Sana Iyer", "2026-08-17T15:40:00+05:30", { relatedId: "tck-1023", relatedKind: "ticket" }),
  a("cus-1", "message", CUST, "Asked about flexibility on price for annual commitment", "2026-08-17T16:10:00+05:30", { relatedId: "conv-2", relatedKind: "conversation" }),

  // ---------------------------------------------------------------------
  // cus-2 — Priya Mehta / Nova Systems
  // ---------------------------------------------------------------------
  a("cus-2", "lead_created", SYS, "Lead created from Facebook lead ad", "2026-08-14T11:05:00+05:30", { relatedId: "lead-2", relatedKind: "lead" }),
  a("cus-2", "ai_qualified", AI.qualification, "AI qualified lead — score 78", "2026-08-14T11:08:00+05:30"),
  a("cus-2", "deal_created", H.riya, "Deal created — Nova Unified Inbox (₹5,40,000)", "2026-08-14T14:00:00+05:30", { relatedId: "deal-4", relatedKind: "deal" }),
  a("cus-2", "proposal_sent", H.riya, "Proposal sent — Nova Unified Inbox", "2026-08-15T12:00:00+05:30", { relatedId: "deal-4", relatedKind: "deal" }),
  a("cus-2", "message", AI.sales, "AI sent proposal follow-up", "2026-08-17T09:10:00+05:30", { relatedId: "conv-5", relatedKind: "conversation" }),
  a("cus-2", "approval_requested", AI.sales, "AI requested approval — move deal to Won without signed order form", "2026-08-17T09:12:00+05:30", { relatedId: "appr-7", relatedKind: "approval" }),

  // ---------------------------------------------------------------------
  // cus-3 — Karthik Iyer / Orbit Systems
  // ---------------------------------------------------------------------
  a("cus-3", "lead_created", SYS, "Lead created via referral", "2025-05-19T14:20:00+02:00", { relatedId: "lead-3", relatedKind: "lead" }),
  a("cus-3", "deal_won", H.aman, "Deal won — onboarded as customer", "2025-06-10T09:00:00+02:00"),
  a("cus-3", "customer_created", SYS, "Karthik Iyer became a customer", "2025-06-10T09:05:00+02:00"),
  a("cus-3", "human_action", H.aman, "Requested Net-60 payment terms", "2026-08-10T09:00:00+02:00", { relatedId: "appr-6", relatedKind: "approval" }),
  a("cus-3", "approval_decided", H.vikram, "Payment term extension rejected by Finance", "2026-08-10T14:00:00+02:00", { relatedId: "appr-6", relatedKind: "approval" }),
  a("cus-3", "ticket_created", CUST, "Ticket #1015 opened — webhook retries failing", "2026-08-16T17:40:00+02:00", { relatedId: "tck-1015", relatedKind: "ticket" }),
  a("cus-3", "ticket_resolved", AI.support, "Ticket #1015 resolved — 46 failed events resent", "2026-08-16T18:05:00+02:00", { relatedId: "tck-1015", relatedKind: "ticket" }),

  // ---------------------------------------------------------------------
  // cus-4 — Meera Nair / Vertex AI
  // ---------------------------------------------------------------------
  a("cus-4", "lead_created", SYS, "Lead created via LinkedIn outreach reply", "2026-08-10T08:40:00-07:00", { relatedId: "lead-4", relatedKind: "lead" }),
  a("cus-4", "ai_qualified", AI.qualification, "AI qualified lead — score 72", "2026-08-10T08:45:00-07:00"),
  a("cus-4", "message", CUST, "Asked about multi-region deployments via website chat", "2026-08-16T09:05:00-07:00", { relatedId: "conv-8", relatedKind: "conversation" }),
  a("cus-4", "ai_action", AI.sales, "AI answered multi-region deployment question", "2026-08-16T09:06:00-07:00", { relatedId: "conv-8", relatedKind: "conversation" }),

  // ---------------------------------------------------------------------
  // cus-5 — Arjun Desai / Acme Labs
  // ---------------------------------------------------------------------
  a("cus-5", "lead_created", SYS, "Lead created from website demo request", "2026-08-15T16:22:00+05:30", { relatedId: "lead-5", relatedKind: "lead" }),
  a("cus-5", "ai_qualified", AI.qualification, "AI qualified lead — score 68", "2026-08-15T16:25:00+05:30"),
  a("cus-5", "stage_changed", H.aman, "Lead moved to Demo", "2026-08-17T09:30:00+05:30", { relatedId: "lead-5", relatedKind: "lead" }),

  // ---------------------------------------------------------------------
  // cus-6 — Sneha Rao / Zenith Cloud
  // ---------------------------------------------------------------------
  a("cus-6", "lead_created", SYS, "Lead created via email campaign", "2025-02-11T10:00:00+08:00", { relatedId: "lead-6", relatedKind: "lead" }),
  a("cus-6", "deal_won", H.karan, "Deal won — onboarded as customer", "2025-03-01T09:00:00+08:00"),
  a("cus-6", "customer_created", SYS, "Sneha Rao became a customer", "2025-03-01T09:05:00+08:00"),
  a("cus-6", "human_action", H.karan, "Requested deletion of legacy Zapier credentials", "2026-08-12T09:00:00+08:00", { relatedId: "appr-10", relatedKind: "approval" }),
  a("cus-6", "approval_decided", H.pankaj, "Credential deletion approved", "2026-08-12T09:30:00+08:00", { relatedId: "appr-10", relatedKind: "approval" }),
  a("cus-6", "ticket_created", CUST, "Ticket #980 opened — custom SLA tiers feature request", "2026-08-14T10:00:00+08:00", { relatedId: "tck-0980", relatedKind: "ticket" }),
  a("cus-6", "health_changed", SYS, "Customer health improved to 91 — expansion signal detected", "2026-08-15T09:00:00+08:00"),

  // ---------------------------------------------------------------------
  // cus-7 — Vivaan Kapoor / Lumen Robotics
  // ---------------------------------------------------------------------
  a("cus-7", "lead_created", SYS, "Lead created from Google Ads — Robotics Search Q3", "2026-08-16T12:05:00+02:00", { relatedId: "lead-7", relatedKind: "lead" }),
  a("cus-7", "ai_qualified", AI.qualification, "AI qualified lead — score 54, limited signal so far", "2026-08-16T12:07:00+02:00"),

  // ---------------------------------------------------------------------
  // cus-8 — Ananya Singh / Bluewave Retail
  // ---------------------------------------------------------------------
  a("cus-8", "lead_created", SYS, "Lead created via inbound webhook", "2025-01-08T09:00:00+05:30", { relatedId: "lead-8", relatedKind: "lead" }),
  a("cus-8", "deal_won", H.aman, "Deal won — onboarded as customer", "2025-01-25T09:00:00+05:30"),
  a("cus-8", "customer_created", SYS, "Ananya Singh became a customer", "2025-01-25T09:05:00+05:30"),
  a("cus-8", "ticket_created", CUST, "Ticket #1018 opened — order sync failing (3rd occurrence)", "2026-08-17T08:40:00+05:30", { relatedId: "tck-1018", relatedKind: "ticket" }),
  a("cus-8", "ai_action", AI.support, "AI escalated to support lead — low confidence on repeat issue", "2026-08-17T08:42:00+05:30", { relatedId: "tck-1018", relatedKind: "ticket" }),
  a("cus-8", "approval_requested", AI.support, "AI requested approval — ₹45,000 refund", "2026-08-17T08:57:00+05:30", { relatedId: "appr-3", relatedKind: "approval" }),
  a("cus-8", "health_changed", SYS, "Customer health dropped to 45 — marked at risk", "2026-08-17T08:58:00+05:30"),
  a("cus-8", "automation_run", SYS, "At-Risk Customer Retention workflow started", "2026-08-17T08:56:00+05:30", { relatedId: "auto-5", relatedKind: "conversation" }),

  // ---------------------------------------------------------------------
  // cus-9 — Rohan Malhotra / Northstar Logistics
  // ---------------------------------------------------------------------
  a("cus-9", "lead_created", SYS, "Lead created via partner API integration", "2026-07-28T09:30:00-05:00", { relatedId: "lead-9", relatedKind: "lead" }),
  a("cus-9", "ai_qualified", AI.qualification, "AI qualified lead — score 81, enterprise procurement engaged", "2026-07-28T09:35:00-05:00"),
  a("cus-9", "deal_created", H.karan, "Deal created — Northstar Fleet-Wide Rollout (₹14,50,000)", "2026-07-29T10:00:00-05:00", { relatedId: "deal-6", relatedKind: "deal" }),
  a("cus-9", "stage_changed", H.karan, "Deal moved to Approval", "2026-08-15T10:00:00-05:00", { relatedId: "deal-6", relatedKind: "deal" }),
  a("cus-9", "approval_requested", AI.sales, "AI requested approval — 20% volume discount", "2026-08-17T11:02:00-05:00", { relatedId: "appr-2", relatedKind: "approval" }),

  // ---------------------------------------------------------------------
  // cus-10 — Ishita Bose / Solace Health
  // ---------------------------------------------------------------------
  a("cus-10", "lead_created", SYS, "Lead created via board-member referral", "2024-11-22T09:00:00-05:00", { relatedId: "lead-10", relatedKind: "lead" }),
  a("cus-10", "deal_won", H.sana, "Deal won — onboarded as customer", "2024-12-15T09:00:00-05:00"),
  a("cus-10", "customer_created", SYS, "Ishita Bose became a customer", "2024-12-15T09:05:00-05:00"),
  a("cus-10", "ticket_created", CUST, "Ticket #995 opened — data export request for audit", "2026-08-10T09:00:00-05:00", { relatedId: "tck-0995", relatedKind: "ticket" }),
  a("cus-10", "ticket_resolved", AI.support, "Ticket #995 closed — export delivered", "2026-08-10T10:05:00-05:00", { relatedId: "tck-0995", relatedKind: "ticket" }),

  // ---------------------------------------------------------------------
  // cus-11 — Dev Patel / Quanta Finance
  // ---------------------------------------------------------------------
  a("cus-11", "lead_created", SYS, "Lead created from Meta Ads retargeting", "2026-08-12T15:40:00+05:30", { relatedId: "lead-11", relatedKind: "lead" }),
  a("cus-11", "message", CUST, "First WhatsApp contact — asked about AI support for payments product", "2026-08-13T10:00:00+05:30", { relatedId: "conv-10", relatedKind: "conversation" }),
  a("cus-11", "ai_qualified", AI.qualification, "AI qualified lead — score 61", "2026-08-13T10:01:30+05:30"),
  a("cus-11", "deal_created", H.riya, "Deal created — Growth Plan Rollout (₹2,40,000)", "2026-08-13T11:00:00+05:30", { relatedId: "deal-1", relatedKind: "deal" }),
  a("cus-11", "approval_requested", AI.sales, "AI requested approval — startup pricing exception", "2026-08-17T10:40:00+05:30", { relatedId: "appr-9", relatedKind: "approval" }),

  // ---------------------------------------------------------------------
  // cus-12 — Tanvi Shah / Meridian Analytics
  // ---------------------------------------------------------------------
  a("cus-12", "lead_created", SYS, "Lead created from website", "2025-06-14T11:00:00+01:00", { relatedId: "lead-12", relatedKind: "lead" }),
  a("cus-12", "deal_won", H.karan, "Deal won — onboarded as customer", "2025-07-02T09:00:00+01:00"),
  a("cus-12", "customer_created", SYS, "Tanvi Shah became a customer", "2025-07-02T09:05:00+01:00"),
  a("cus-12", "ticket_created", CUST, "Ticket #988 opened — dashboard slow with 50k+ records", "2026-08-16T08:40:00+01:00", { relatedId: "tck-0988", relatedKind: "ticket" }),
  a("cus-12", "ai_action", AI.support, "AI gathered account size and browser details", "2026-08-16T09:00:00+01:00", { relatedId: "tck-0988", relatedKind: "ticket" }),

  // ---------------------------------------------------------------------
  // cus-13 — Kabir Khanna / Crestline Manufacturing
  // ---------------------------------------------------------------------
  a("cus-13", "lead_created", SYS, "Lead created via trade-show CSV import", "2026-08-11T10:00:00-04:00", { relatedId: "lead-13", relatedKind: "lead" }),
  a("cus-13", "note_added", SYS, "Bulk import — not yet contacted", "2026-08-11T10:01:00-04:00"),

  // ---------------------------------------------------------------------
  // cus-14 — Aditi Verma / Aster Biotech
  // ---------------------------------------------------------------------
  a("cus-14", "lead_created", SYS, "Lead created from Instagram campaign", "2026-08-05T09:15:00+02:00", { relatedId: "lead-14", relatedKind: "lead" }),
  a("cus-14", "ai_qualified", AI.qualification, "AI qualified lead — score 65", "2026-08-05T09:20:00+02:00"),
  a("cus-14", "deal_created", H.riya, "Deal created — Aster R&D Support Desk (₹3,80,000)", "2026-08-06T09:00:00+02:00", { relatedId: "deal-2", relatedKind: "deal" }),
  a("cus-14", "message", H.riya, "Shared regulatory compliance one-pager", "2026-08-15T09:00:00+02:00"),

  // ---------------------------------------------------------------------
  // cus-15 — Yash Trivedi / Fenwick Digital (lost)
  // ---------------------------------------------------------------------
  a("cus-15", "lead_created", SYS, "Lead created from website", "2026-07-02T09:00:00+05:30", { relatedId: "lead-15", relatedKind: "lead" }),
  a("cus-15", "deal_created", H.aman, "Deal created — Fenwick Support Desk (₹1,80,000)", "2026-07-05T09:00:00+05:30", { relatedId: "deal-8", relatedKind: "deal" }),
  a("cus-15", "deal_lost", H.aman, "Deal marked Lost — budget frozen for the fiscal year", "2026-07-25T09:00:00+05:30", { relatedId: "deal-8", relatedKind: "deal" }),

  // ---------------------------------------------------------------------
  // cus-16 — Naina Chopra / Anchorpoint Systems
  // ---------------------------------------------------------------------
  a("cus-16", "lead_created", SYS, "Lead created via LinkedIn outreach", "2026-07-30T10:00:00+03:00", { relatedId: "lead-16", relatedKind: "lead" }),
  a("cus-16", "deal_created", H.karan, "Deal created — Anchorpoint Security Rollout (₹9,20,000)", "2026-07-31T10:00:00+03:00", { relatedId: "deal-3", relatedKind: "deal" }),
  a("cus-16", "message", H.karan, "Delivered security architecture demo", "2026-08-14T10:00:00+03:00"),
  a("cus-16", "human_action", H.karan, "Shared SOC2 report — required approval", "2026-08-16T10:10:00+03:00", { relatedId: "appr-5", relatedKind: "approval" }),
  a("cus-16", "approval_decided", H.pankaj, "SOC2 report share approved", "2026-08-16T10:12:00+03:00", { relatedId: "appr-5", relatedKind: "approval" }),
  a("cus-16", "message", CUST, "Confirmed SOC2 report meets security team's requirements", "2026-08-16T10:20:00+03:00", { relatedId: "conv-7", relatedKind: "conversation" }),

  // ---------------------------------------------------------------------
  // cus-17 — Farhan Ali / Brightline Media
  // ---------------------------------------------------------------------
  a("cus-17", "lead_created", SYS, "Lead created via email outreach", "2025-03-09T09:00:00-08:00", { relatedId: "lead-17", relatedKind: "lead" }),
  a("cus-17", "deal_won", H.sana, "Deal won — onboarded as customer", "2025-03-28T09:00:00-08:00"),
  a("cus-17", "customer_created", SYS, "Farhan Ali became a customer", "2025-03-28T09:05:00-08:00"),
  a("cus-17", "ticket_created", CUST, "Ticket #1002 opened — SSO login intermittently failing", "2026-08-15T15:40:00-08:00", { relatedId: "tck-1002", relatedKind: "ticket" }),
  a("cus-17", "approval_requested", AI.support, "AI requested approval — partial refund for SSO downtime", "2026-08-15T16:05:00-08:00", { relatedId: "appr-8", relatedKind: "approval" }),
  a("cus-17", "approval_decided", H.vikram, "Refund approved", "2026-08-15T17:00:00-08:00", { relatedId: "appr-8", relatedKind: "approval" }),

  // ---------------------------------------------------------------------
  // cus-18 — Simran Gill / Cobalt Freight
  // ---------------------------------------------------------------------
  a("cus-18", "lead_created", SYS, "Lead created via inbound webhook", "2026-08-13T13:00:00+02:00", { relatedId: "lead-18", relatedKind: "lead" }),
  a("cus-18", "stage_changed", H.riya, "Lead moved to Contacted", "2026-08-16T13:00:00+02:00", { relatedId: "lead-18", relatedKind: "lead" }),

  // ---------------------------------------------------------------------
  // cus-19 — Aarav Menon / Everline Insurance
  // ---------------------------------------------------------------------
  a("cus-19", "lead_created", SYS, "Lead created via compliance API integration", "2024-09-01T09:00:00+05:30", { relatedId: "lead-19", relatedKind: "lead" }),
  a("cus-19", "deal_won", H.karan, "Deal won — onboarded as customer", "2024-09-20T09:00:00+05:30"),
  a("cus-19", "customer_created", SYS, "Aarav Menon became a customer", "2024-09-20T09:05:00+05:30"),
  a("cus-19", "ticket_created", CUST, "Ticket #1009 opened — billing discrepancy", "2026-08-16T10:50:00+05:30", { relatedId: "tck-1009", relatedKind: "ticket" }),
  a("cus-19", "human_action", H.neha, "Confirmed discrepancy, filing credit request", "2026-08-16T14:30:00+05:30", { relatedId: "tck-1009", relatedKind: "ticket" }),
  a("cus-19", "approval_decided", H.vikram, "Billing credit approved", "2026-08-16T15:10:00+05:30", { relatedId: "appr-4", relatedKind: "approval" }),
  a("cus-19", "health_changed", SYS, "Customer health dropped to 35 — marked high risk", "2026-08-16T15:30:00+05:30"),

  // ---------------------------------------------------------------------
  // cus-20 — Kiara D'Souza / Granite Payments
  // ---------------------------------------------------------------------
  a("cus-20", "lead_created", SYS, "Lead created from Google Ads — Fintech Search", "2026-08-16T09:20:00+05:30", { relatedId: "lead-20", relatedKind: "lead" }),
  a("cus-20", "ai_qualified", AI.qualification, "AI qualified lead — score 69", "2026-08-16T09:25:00+05:30"),

  // ---------------------------------------------------------------------
  // cus-21 — Ethan Brooks / Kestrel Aerospace
  // ---------------------------------------------------------------------
  a("cus-21", "lead_created", SYS, "Lead created via referral from Orbit Systems", "2026-08-04T09:00:00-07:00", { relatedId: "lead-21", relatedKind: "lead" }),
  a("cus-21", "stage_changed", H.riya, "Lead moved to Proposal", "2026-08-15T09:00:00-07:00", { relatedId: "lead-21", relatedKind: "lead" }),

  // ---------------------------------------------------------------------
  // cus-22 — Sofia Martins / Driftwood Hospitality
  // ---------------------------------------------------------------------
  a("cus-22", "lead_created", SYS, "Lead created from Instagram campaign", "2026-08-17T08:10:00+05:30", { relatedId: "lead-22", relatedKind: "lead" }),
  a("cus-22", "ai_qualified", AI.qualification, "AI qualified lead — score 47, just submitted contact form", "2026-08-17T08:12:00+05:30"),

  // ---------------------------------------------------------------------
  // cus-23 — Liam Chen / Junction Mobility (lost)
  // ---------------------------------------------------------------------
  a("cus-23", "lead_created", SYS, "Lead created from Meta Ads", "2026-06-20T10:00:00+02:00", { relatedId: "lead-23", relatedKind: "lead" }),
  a("cus-23", "deal_lost", H.aman, "Lead marked Lost — chose a mobility-specific competitor", "2026-07-10T10:00:00+02:00", { relatedId: "lead-23", relatedKind: "lead" }),

  // ---------------------------------------------------------------------
  // cus-24 — Olivia Turner / Fathom Analytics Labs
  // ---------------------------------------------------------------------
  a("cus-24", "lead_created", SYS, "Lead created from website", "2025-04-17T09:00:00-04:00", { relatedId: "lead-24", relatedKind: "lead" }),
  a("cus-24", "deal_won", H.riya, "Deal won — onboarded as customer", "2025-05-05T09:00:00-04:00"),
  a("cus-24", "customer_created", SYS, "Olivia Turner became a customer", "2025-05-05T09:05:00-04:00"),
  a("cus-24", "note_added", AI.sales, "AI insight: evaluating a second workspace for a new business unit", "2026-08-05T09:10:00-04:00"),
  a("cus-24", "deal_created", H.riya, "Deal created — Fathom Analytics Expansion (₹6,10,000)", "2026-07-01T09:00:00-04:00", { relatedId: "deal-7", relatedKind: "deal" }),
  a("cus-24", "deal_won", H.riya, "Expansion deal won", "2026-08-05T09:00:00-04:00", { relatedId: "deal-7", relatedKind: "deal" }),
  a("cus-24", "health_changed", SYS, "Customer health improved to 95 — strong expansion signal", "2026-08-05T09:30:00-04:00"),

  // ---------------------------------------------------------------------
  // cus-25 — Diego Fernandes / Meadowline Foods
  // ---------------------------------------------------------------------
  a("cus-25", "lead_created", SYS, "Lead created via email nurture sequence", "2025-08-30T09:00:00+05:30", { relatedId: "lead-25", relatedKind: "lead" }),
  a("cus-25", "deal_won", H.sana, "Deal won — onboarded as customer", "2025-09-18T09:00:00+05:30"),
  a("cus-25", "customer_created", SYS, "Diego Fernandes became a customer", "2025-09-18T09:05:00+05:30"),
];

export function getActivitiesForCustomer(customerId: string): Activity[] {
  return activities
    .filter((e) => e.customerId === customerId)
    .sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1));
}

export function getRecentActivities(limit = 20): Activity[] {
  return [...activities].sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1)).slice(0, limit);
}
