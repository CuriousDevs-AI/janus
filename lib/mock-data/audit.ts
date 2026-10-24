import type { ActivityActor, AuditEvent } from "@/lib/types";
import { at } from "@/lib/demo-universe";

const SALES: ActivityActor = { type: "ai", agentId: "agent-sales", agentName: "Sales Agent" };
const SUPPORT: ActivityActor = { type: "ai", agentId: "agent-support", agentName: "Support Agent" };
const QUALIFY: ActivityActor = { type: "ai", agentId: "agent-qualification", agentName: "Qualification Agent" };
const human = (userId: string, userName: string): ActivityActor => ({ type: "human", userId, userName });
const PANKAJ = human("u-1", "Pankaj Neema");
const SYS: ActivityActor = { type: "system" };

type Row = [number, string, ActivityActor, string, number | undefined, string, AuditEvent["objectKind"], AuditEvent["result"], boolean, string?, string?];
const rows: Row[] = [
  [0, "09:30", SUPPORT, "notify_human()", 12, "Ticket #1031", "ticket", "success", false],
  [0, "09:05", SUPPORT, "create_ticket()", 12, "Ticket #1031", "ticket", "success", false],
  [0, "09:40", SUPPORT, "request_approval(issue_refund)", 12, "Credit note ₹4,200", "approval", "success", true, "Credit notes above ₹2,500 need approval.", "Credit notes above ₹2,500 need approval."],
  [1, "16:25", SALES, "request_approval(extend_credit)", 7, "45-day credit, Metro Value Mart", "approval", "success", true, "Credit beyond 30 days needs owner approval.", "Credit beyond 30 days needs owner approval."],
  [1, "16:20", SALES, "send_whatsapp()", 7, "Conversation: WhatsApp", "conversation", "success", false],
  [1, "12:30", SUPPORT, "create_ticket()", 9, "Ticket #1029", "ticket", "success", false],
  [2, "10:20", QUALIFY, "update_lead(score=72)", 1, "Lead: Northstar Retail", "lead", "success", false],
  [2, "11:40", SALES, "send_email()", 3, "Rate card: Rajasthan routes", "conversation", "success", false],
  [3, "11:40", human("u-5", "Karan Bhatt"), "update_ticket(status=waiting_customer)", 7, "Ticket #1024", "ticket", "success", false],
  [4, "08:30", SUPPORT, "update_ticket(priority=high)", 10, "Ticket #1015", "ticket", "success", false],
  [5, "09:30", SALES, "send_whatsapp(payment_reminder)", 3, "Payment reminder, Annapurna Foods", "conversation", "success", true, "Payment reminders to key accounts need review.", "Payment reminders to key accounts need review."],
  [5, "09:45", PANKAJ, "approve_sensitive_message", 3, "Payment reminder, Annapurna Foods", "approval", "success", false],
  [6, "12:15", human("u-4", "Arjun Mehta"), "mark_deal(stage=won)", 9, "Rajputana monthly dry goods", "deal", "success", true, "Deals above ₹5L need owner confirmation before Won.", "Deals above ₹5L need owner confirmation before Won."],
  [6, "12:10", PANKAJ, "approve_deal_stage", 9, "Rajputana monthly dry goods", "approval", "success", false],
  [6, "12:20", SYS, "create_customer(from_deal_won)", 9, "Rajputana Wholesale Co-op", "deal", "success", false],
  [12, "10:45", PANKAJ, "approve_refund", 14, "Replacement batch, Shiv Shakti Bakery", "approval", "success", false],
  [20, "17:30", PANKAJ, "reject_discount", 5, "12% discount to win back Green Basket", "approval", "success", false, "Discounts above 10% are not allowed on staples.", "Discounts above 10% are not allowed on staples."],
  [3, "10:00", PANKAJ, "publish_knowledge(v3)", undefined, "Price list, October 2026", "knowledge", "success", false],
  [2, "08:10", QUALIFY, "update_lead(score=48)", 2, "Lead: Orbit Canteen Services", "lead", "success", false],
  [1, "09:00", SALES, "apply_discount(15%)", 7, "Metro personal-care range", "approval", "denied", true, "Blocked: 15% is above the staples limit.", "Discount limits"],
];

export const auditEvents: AuditEvent[] = rows.map(([daysAgo, time, actor, action, customer, objectLabel, objectKind, result, approvalRequired, reason, policy], index) => ({
  id: `aud-${index + 1}`, at: at(daysAgo, time), actor, action, customerId: customer ? `cus-${customer}` : undefined, objectLabel, objectKind, result, reason, policy, approvalRequired,
})).sort((x, y) => (x.at < y.at ? 1 : -1));

export function getAuditForCustomer(customerId: string): AuditEvent[] {
  return auditEvents.filter((a) => a.customerId === customerId);
}
