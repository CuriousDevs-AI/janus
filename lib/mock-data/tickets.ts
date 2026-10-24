import type { ActivityActor, Ticket, TicketAction, TicketPriority, TicketStatus } from "@/lib/types";
import { isFirstCompany } from "@/lib/companies";
import { at } from "@/lib/demo-universe";

const AI: ActivityActor = { type: "ai", agentId: "agent-support", agentName: "Support Agent" };
const CUSTOMER: ActivityActor = { type: "customer" };
const human = (id: string, name: string): ActivityActor => ({ type: "human", userId: id, userName: name });
const KARAN = human("u-5", "Karan Bhatt");
const AMAN = human("u-7", "Aman Verma");

interface Spec {
  number: number; customer: number; subject: string; description: string; priority: TicketPriority; status: TicketStatus; assignee?: string; confidence: number; knowledge: string[];
  conversation: string; daysAgo: number; time: string; sla: number | null; actions: [ActivityActor, string, number][]; resolved?: boolean; handoff?: Ticket["handoff"];
}
const clock = (time: string, minutes: number) => { const [h, m] = time.split(":").map(Number); const total = h * 60 + m + minutes; return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`; };

const specs: Spec[] = [
  { number: 1031, customer: 12, subject: "Short delivery: 114 of 120 detergent cartons", description: "Kumar & Sons received 114 cartons against an invoice for 120. The loading sheet at the Jaipur warehouse shows 120 left the dock.", priority: "urgent", status: "escalated", assignee: "u-5", confidence: 0.88, knowledge: ["Delivery and short-supply policy"], conversation: "conv-5", daysAgo: 0, time: "09:05", sla: 55, actions: [[AI, "Ticket created from WhatsApp and the warehouse flagged", 3], [CUSTOMER, "Customer sent a photo of the delivery challan", 20], [KARAN, "Checking the loading sheet with the driver", 35]], handoff: { requestedAt: at(0, "09:30"), reason: "Stock discrepancy needs a warehouse check, outside what the agent can resolve.", summary: "6 cartons short on a 120-carton invoice. Customer is a repeat buyer and wants the cartons or a credit note.", previousActions: ["Ticket created", "Warehouse flagged", "Challan photo received"], suggestedNextAction: "Confirm with the driver, then send the 6 cartons tomorrow or issue a credit note." } },
  { number: 1029, customer: 9, subject: "September invoice shows 480 units of rice, 456 received", description: "The co-op's GST invoice for September does not match the delivery challans. They need a corrected invoice before releasing payment.", priority: "high", status: "in_progress", assignee: "u-7", confidence: 0.9, knowledge: ["GST invoicing and credit notes"], conversation: "conv-6", daysAgo: 1, time: "12:30", sla: 190, actions: [[AI, "Ticket opened with the delivery challan attached", 3], [AMAN, "Reconciling challans against the invoice", 90]] },
  { number: 1027, customer: 1, subject: "Wrong biscuit variant in two cartons", description: "Northstar's first order included two cartons of the wrong biscuit variant at the Saket store.", priority: "medium", status: "resolved", assignee: "u-5", confidence: 0.84, knowledge: ["Returns and replacements"], conversation: "conv-1", daysAgo: 8, time: "14:10", sla: null, resolved: true, actions: [[AI, "Replacement cartons scheduled with the next truck", 6], [KARAN, "Confirmed the swap on delivery", 1500]] },
  { number: 1024, customer: 7, subject: "Damaged cartons: credit note requested", description: "Four cartons of floor cleaner arrived crushed. Metro Value Mart asked for a credit note of ₹8,500.", priority: "high", status: "waiting_customer", assignee: "u-5", confidence: 0.79, knowledge: ["Returns and replacements", "GST invoicing and credit notes"], conversation: "conv-4", daysAgo: 3, time: "11:40", sla: null, actions: [[AI, "Requested photos of the damage", 4], [CUSTOMER, "Photos sent", 160], [KARAN, "Credit note sent for approval", 200]] },
  { number: 1022, customer: 3, subject: "Payment reminder disputed", description: "Annapurna says the ₹1.2L reminder includes an invoice already paid on 12 October.", priority: "medium", status: "open", assignee: "u-7", confidence: 0.7, knowledge: ["Credit and payment terms"], conversation: "conv-3", daysAgo: 2, time: "17:20", sla: 300, actions: [[AI, "Payment record requested from finance", 5]] },
  { number: 1019, customer: 14, subject: "Flour bags with a short shelf life", description: "Shiv Shakti received flour bags with under four weeks to expiry and wants a replacement batch.", priority: "medium", status: "resolved", assignee: "u-5", confidence: 0.83, knowledge: ["Returns and replacements"], conversation: "conv-8", daysAgo: 12, time: "10:15", sla: null, resolved: true, actions: [[AI, "Batch details checked and replacement approved", 8], [KARAN, "Fresh batch dispatched", 1200]] },
  { number: 1015, customer: 10, subject: "6am dispatch missed twice this week", description: "FreshKart's dark stores received stock after 8am on two days. They need a fixed dispatch slot.", priority: "high", status: "in_progress", assignee: "u-5", confidence: 0.76, knowledge: ["Delivery slots and cut-off times"], conversation: "conv-8", daysAgo: 4, time: "08:30", sla: 120, actions: [[AI, "Dispatch log reviewed: truck loaded late on 20 and 22 Oct", 6], [KARAN, "Agreed a 5:30am loading slot with the warehouse", 240]] },
  { number: 1012, customer: 6, subject: "Copy of GST invoice for August", description: "Hotel Aravali Grand needs a duplicate GST invoice for its accountant.", priority: "low", status: "closed", confidence: 0.96, knowledge: ["GST invoicing and credit notes"], conversation: "conv-7", daysAgo: 14, time: "13:00", sla: null, resolved: true, actions: [[AI, "Invoice copy emailed", 2]] },
  { number: 1009, customer: 2, subject: "Delivery window for the Manesar plant", description: "The canteen contractor asked whether trucks can enter the plant before 7am.", priority: "low", status: "ai_handling", confidence: 0.82, knowledge: ["Delivery slots and cut-off times"], conversation: "conv-7", daysAgo: 1, time: "16:00", sla: 400, actions: [[AI, "Shared the standard slots and asked for the gate pass rules", 4]] },
];

const acme_tickets: Ticket[] = specs.map((spec): Ticket => {
  const createdAt = at(spec.daysAgo, spec.time);
  const actions: TicketAction[] = spec.actions.map(([actor, label, minutes], index) => ({ id: `act-${spec.number}-${index + 1}`, actor, label, createdAt: at(spec.daysAgo, clock(spec.time, minutes % 1440)) }));
  const updatedAt = actions.at(-1)!.createdAt;
  return {
    id: `tck-${spec.number}`, number: `#${spec.number}`, customerId: `cus-${spec.customer}`, subject: spec.subject, description: spec.description, priority: spec.priority, status: spec.status, assigneeId: spec.assignee, aiConfidence: spec.confidence,
    knowledgeUsed: spec.knowledge, actions, slaMinutesRemaining: spec.sla, createdAt, updatedAt, resolvedAt: spec.resolved ? updatedAt : undefined, conversationId: spec.conversation, handoff: spec.handoff,
  };
});

export const tickets: Ticket[] = isFirstCompany ? acme_tickets : [];

export function getTicketById(id?: string): Ticket | undefined {
  if (!id) return undefined;
  return tickets.find((t) => t.id === id);
}

export function getTicketsForCustomer(customerId: string): Ticket[] {
  return tickets.filter((t) => t.customerId === customerId);
}
