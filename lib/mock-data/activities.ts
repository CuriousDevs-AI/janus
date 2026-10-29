import type { Activity, ActivityActor, ActivityType } from "@/lib/types";
import { isFirstCompany } from "@/lib/companies";
import { at } from "@/lib/demo-universe";

const AI = {
  sales: { type: "ai", agentId: "agent-sales", agentName: "Sales Agent" } as ActivityActor,
  support: { type: "ai", agentId: "agent-support", agentName: "Support Agent" } as ActivityActor,
  qualification: { type: "ai", agentId: "agent-qualification", agentName: "Qualification Agent" } as ActivityActor,
};
const H = {
  pankaj: { type: "human", userId: "u-1", userName: "Pankaj Neema" } as ActivityActor,
  meera: { type: "human", userId: "u-2", userName: "Meera Singh" } as ActivityActor,
  riya: { type: "human", userId: "u-3", userName: "Riya Kapoor" } as ActivityActor,
  arjun: { type: "human", userId: "u-4", userName: "Arjun Mehta" } as ActivityActor,
  karan: { type: "human", userId: "u-5", userName: "Karan Bhatt" } as ActivityActor,
  aman: { type: "human", userId: "u-7", userName: "Aman Verma" } as ActivityActor,
};
const SYS: ActivityActor = { type: "system" };
const CUST: ActivityActor = { type: "customer" };

let counter = 0;
function a(customer: number, type: ActivityType, actor: ActivityActor, title: string, daysAgo: number, time: string, extra?: Partial<Pick<Activity, "description" | "relatedId" | "relatedKind" | "meta">>): Activity {
  counter += 1;
  return { id: `act-${counter}`, customerId: `cus-${customer}`, type, actor, title, createdAt: at(daysAgo, time), ...extra };
}

const acme_activities: Activity[] = [
  // Northstar Retail: a first order, then a festive range that is still moving
  a(1, "lead_created", SYS, "New website lead: festive range enquiry", 35, "10:15", { relatedKind: "lead" }),
  a(1, "deal_won", H.pankaj, "First order won: ₹3.1L, 6 stores", 22, "16:00", { relatedKind: "deal" }),
  a(1, "customer_created", SYS, "Northstar Retail became a customer", 22, "16:05"),
  a(1, "lead_created", SYS, "Festive range enquiry came in on the website", 2, "10:15", { relatedId: "lead-1", relatedKind: "lead", description: "Festive stock for 6 Delhi stores with weekly drops." }),
  a(1, "ai_qualified", AI.qualification, "Qualified: repeat buyer, high intent", 2, "10:20", { description: "Existing customer, 6 stores, clear delivery schedule." }),
  a(1, "message", CUST, "Asked to confirm weekly drops from 3 November", 0, "15:38", { relatedId: "conv-2", relatedKind: "conversation" }),
  a(1, "deal_created", H.pankaj, "Deal opened: Northstar festive range, 6 stores (₹4.8L)", 2, "10:30", { relatedId: "deal-1", relatedKind: "deal" }),
  // Annapurna Foods
  a(3, "lead_created", SYS, "WhatsApp enquiry: Rajasthan feeder supply", 14, "10:15", { relatedKind: "lead" }),
  a(3, "stage_changed", H.arjun, "Moved to Proposal", 5, "11:00", { relatedId: "deal-3", relatedKind: "deal" }),
  a(3, "proposal_sent", H.arjun, "Proposal sent: Rajasthan feeder supply (₹6.5L)", 5, "14:30", { relatedId: "deal-3", relatedKind: "deal" }),
  a(3, "message", CUST, "Asked for 30-day credit from delivery", 2, "11:10", { relatedId: "conv-3", relatedKind: "conversation" }),
  a(3, "ticket_created", AI.support, "Ticket #1022 opened: payment reminder disputed", 2, "17:20", { relatedId: "tck-1022", relatedKind: "ticket" }),
  // Metro Value Mart
  a(7, "deal_won", H.arjun, "Trial order won: ₹64,000", 25, "12:00", { relatedKind: "deal" }),
  a(7, "deal_created", H.arjun, "Deal opened: personal-care range, 4 outlets (₹3.1L)", 12, "11:30", { relatedId: "deal-7", relatedKind: "deal" }),
  a(7, "approval_requested", AI.sales, "Approval requested: 45-day credit", 1, "16:25", { relatedId: "appr-1", relatedKind: "approval" }),
  a(7, "ticket_created", H.karan, "Ticket #1024 opened: crushed cartons, credit note requested", 3, "11:40", { relatedId: "tck-1024", relatedKind: "ticket" }),
  // Rajputana Wholesale Co-op
  a(9, "lead_created", SYS, "WhatsApp enquiry: monthly dry-goods supply", 20, "10:15", { relatedKind: "lead" }),
  a(9, "approval_decided", H.pankaj, "Approved moving the deal to Won", 6, "12:10", { relatedId: "appr-6", relatedKind: "approval" }),
  a(9, "deal_won", H.arjun, "Deal won: monthly dry goods, 40 shops (₹5.2L)", 6, "12:15", { relatedId: "deal-9", relatedKind: "deal" }),
  a(9, "onboarding_started", SYS, "Onboarding tasks created: price list, credit limit, first dispatch", 6, "12:20"),
  a(9, "ticket_created", AI.support, "Ticket #1029 opened: September invoice mismatch", 1, "12:30", { relatedId: "tck-1029", relatedKind: "ticket" }),
  // Kumar & Sons
  a(12, "deal_won", H.meera, "Reorder won: 120 cartons detergent (₹98,000)", 9, "15:00", { relatedKind: "deal" }),
  a(12, "ticket_created", AI.support, "Ticket #1031 opened: 6 cartons short on delivery", 0, "09:05", { relatedId: "tck-1031", relatedKind: "ticket" }),
  a(12, "ticket_escalated", AI.support, "Escalated to Karan Bhatt: stock discrepancy", 0, "09:30", { relatedId: "tck-1031", relatedKind: "ticket" }),
  // FreshKart
  a(10, "lead_created", SYS, "Website enquiry: daily snack replenishment", 4, "10:15", { relatedKind: "lead" }),
  a(10, "ai_action", AI.sales, "Drafted a rate sheet for Meera to review", 4, "10:08"),
  a(10, "ticket_created", AI.support, "Ticket #1015 opened: 6am dispatch missed", 4, "08:30", { relatedId: "tck-1015", relatedKind: "ticket" }),
  // Shiv Shakti Bakery and others
  a(14, "stage_changed", H.meera, "Moved to Negotiation", 3, "10:00", { relatedId: "deal-14", relatedKind: "deal" }),
  a(14, "approval_requested", H.meera, "Approval requested: 7% rate discount", 0, "11:15", { relatedId: "appr-2", relatedKind: "approval" }),
  a(5, "deal_lost", H.riya, "Lost: chose a nearer distributor on price", 14, "11:00", { relatedKind: "deal" }),
  a(4, "deal_lost", H.meera, "Lost: went with a local wholesaler", 24, "11:00", { relatedKind: "deal" }),
  a(2, "lead_created", SYS, "Missed call from the canteen purchase desk", 3, "12:05", { relatedKind: "lead" }),
  a(13, "proposal_sent", H.riya, "Proposal sent: festive hamper bundle (₹2.7L)", 5, "15:00", { relatedId: "deal-13", relatedKind: "deal" }),
  a(8, "proposal_sent", H.riya, "Proposal sent: pharmacy essentials (₹1.4L)", 6, "16:00", { relatedId: "deal-8", relatedKind: "deal" }),
  a(6, "stage_changed", H.arjun, "Moved to Qualified", 4, "12:00", { relatedId: "deal-6", relatedKind: "deal" }),
];

export const demoActivities: Activity[] = acme_activities;

export const activities: Activity[] = isFirstCompany ? demoActivities : [];

export function getActivitiesForCustomer(customerId: string): Activity[] {
  return activities.filter((a) => a.customerId === customerId).sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1));
}

export function getRecentActivities(limit = 20): Activity[] {
  return [...activities].sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1)).slice(0, limit);
}
