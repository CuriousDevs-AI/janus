import type { ChannelType, Conversation, ConversationCategory, Message } from "@/lib/types";
import { at } from "@/lib/demo-universe";

/** Who says a line: c = the customer, ai = a Janus agent, h = a person at Acme (user id), s = a system note. */
type Line = ["c", string, number] | ["ai", string, number, { confidence?: number; tools?: string[]; knowledge?: string[] }?] | ["h", string, number, string] | ["s", string, number, string];
interface Chat { id: string; customer: number; channel: ChannelType; category: ConversationCategory; subject: string; priority: Conversation["priority"]; assignedTo?: string; aiActive: boolean; status: Conversation["status"]; unread: number; daysAgo: number; start: string; thread: string; lines: Line[] }

const chats: Chat[] = [
  { id: "conv-1", customer: 1, channel: "website_chat", category: "sales", subject: "Festive range for 6 stores", priority: "normal", assignedTo: "u-1", aiActive: true, status: "resolved", unread: 0, daysAgo: 9, start: "10:32", thread: "wc_8f2a91", lines: [
    ["c", "Hi, we run 6 stores in Delhi. Can you share your festive price list and the minimum order?", 0],
    ["ai", "Happy to help. The October festive list covers staples, snacks, beverages and gift packs. Minimum order is 40 cartons per drop, delivery from our Gurugram warehouse. Shall I send the PDF here?", 3, { confidence: 0.94, tools: ["get_customer()"], knowledge: ["Price list, October 2026"] }],
    ["c", "Yes please. We need weekly drops, ideally starting the first week of November.", 4],
    ["s", "Routed to Pankaj Neema: multi-store account with a delivery schedule request.", 5, "Routed to human"],
  ] },
  { id: "conv-2", customer: 1, channel: "whatsapp", category: "sales", subject: "Weekly drops from 3 November", priority: "high", assignedTo: "u-1", aiActive: false, status: "waiting", unread: 1, daysAgo: 0, start: "15:38", thread: "wa_91987", lines: [
    ["c", "Can you confirm weekly drops from 3 November? Also, can the first order be split across two stores?", 0],
    ["h", "Yes, we can split it. I'll send the revised quote with store-wise quantities within the hour.", 2, "u-1"],
  ] },
  { id: "conv-3", customer: 3, channel: "whatsapp", category: "sales", subject: "Rajasthan feeder terms", priority: "high", assignedTo: "u-4", aiActive: false, status: "active", unread: 0, daysAgo: 2, start: "11:10", thread: "wa_77881", lines: [
    ["c", "We are comfortable with the price list. Can the credit period be 30 days from delivery, not from invoice?", 0],
    ["h", "Delivery-date credit is fine for the first three months. I'll note it on the proposal and send it for your sign-off today.", 25, "u-4"],
    ["c", "Good. Please also add monthly dispatch to Jaipur, Sikar and Ajmer.", 40],
  ] },
  { id: "conv-4", customer: 7, channel: "whatsapp", category: "sales", subject: "Margin and credit for 4 outlets", priority: "normal", assignedTo: "u-4", aiActive: true, status: "active", unread: 0, daysAgo: 1, start: "16:20", thread: "wa_30412", lines: [
    ["c", "For the personal-care range we need 12% margin and 45 days credit across our 4 outlets.", 0],
    ["ai", "Thanks Suresh. Margin on this range is 9–11% depending on volume, and standard credit is 30 days. I've asked Arjun to review the 45-day request and he will reply today.", 2, { confidence: 0.81, tools: ["get_customer()", "request_approval()"], knowledge: ["Credit and payment terms"] }],
    ["s", "Approval requested: 45-day credit for Metro Value Mart.", 3, "Approval requested"],
  ] },
  { id: "conv-5", customer: 12, channel: "whatsapp", category: "support", subject: "Short delivery of detergent cartons", priority: "urgent", assignedTo: "u-5", aiActive: false, status: "active", unread: 2, daysAgo: 0, start: "09:05", thread: "wa_17745", lines: [
    ["c", "Today's truck delivered 114 cartons of detergent but the invoice says 120. Please check.", 0],
    ["ai", "I'm sorry about that. I've raised ticket #1031 and flagged it to the warehouse in Jaipur to check the loading sheet. Karan from our support team will update you shortly.", 2, { confidence: 0.88, tools: ["create_ticket()", "notify_human()"], knowledge: ["Delivery and short-supply policy"] }],
    ["s", "Ticket #1031 created.", 3, "Ticket created"],
    ["h", "Hi Rakesh, this is Karan. The loading sheet shows 120 cartons left the warehouse. I'm checking with the driver and will either send the 6 cartons tomorrow or issue a credit note, your choice.", 35, "u-5"],
  ] },
  { id: "conv-6", customer: 9, channel: "whatsapp", category: "support", subject: "September invoice mismatch", priority: "high", assignedTo: "u-5", aiActive: true, status: "waiting", unread: 0, daysAgo: 1, start: "12:30", thread: "wa_90125", lines: [
    ["c", "The GST invoice for September shows 480 units of rice but we received 456. Can you correct it?", 0],
    ["ai", "Thanks for flagging this. I've opened ticket #1029 with the delivery challan attached. Our accounts team will confirm the correct quantity and send a revised invoice.", 3, { confidence: 0.9, tools: ["create_ticket()"], knowledge: ["GST invoicing and credit notes"] }],
  ] },
  { id: "conv-7", customer: 2, channel: "call", category: "sales", subject: "Missed call: canteen rates", priority: "normal", assignedTo: "u-1", aiActive: false, status: "waiting", unread: 1, daysAgo: 3, start: "12:05", thread: "call_882", lines: [
    ["c", "Missed call from the canteen purchase desk. Voicemail: asking for monthly rates on edible oil and pulses.", 0],
    ["s", "Callback task created for Pankaj Neema.", 1, "Callback scheduled"],
  ] },
  { id: "conv-8", customer: 10, channel: "email", category: "sales", subject: "Dark store replenishment schedule", priority: "normal", assignedTo: "u-2", aiActive: true, status: "active", unread: 0, daysAgo: 4, start: "10:00", thread: "em_88204", lines: [
    ["c", "We need daily replenishment of packaged snacks at three dark stores, dispatch by 6am. Can you do this and what would the rate look like?", 0],
    ["ai", "Daily 6am dispatch is possible from Gurugram for the NCR dark stores. I've prepared a draft rate sheet for Meera to review before it goes out.", 8, { confidence: 0.86, tools: ["get_customer()", "create_deal()"], knowledge: ["Delivery slots and cut-off times"] }],
    ["h", "Hi Siddharth, rate sheet attached. Cut-off for next-day dispatch is 6pm. Happy to do a call tomorrow to lock the schedule.", 120, "u-2"],
  ] },
];

const when = (chat: Chat, minutes: number) => {
  const [hh, mm] = chat.start.split(":").map(Number);
  const total = hh * 60 + mm + minutes;
  return at(chat.daysAgo, `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`);
};

export const messages: Message[] = chats.flatMap((chat) => chat.lines.map((line, index): Message => {
  const base = { id: `msg-${chat.id.slice(5)}-${index + 1}`, conversationId: chat.id, channel: chat.channel, createdAt: when(chat, line[2]), externalMessageId: `${chat.thread}_${index + 1}` };
  if (line[0] === "c") return { ...base, sender: { type: "customer", customerId: `cus-${chat.customer}` }, direction: "inbound", content: line[1] };
  if (line[0] === "ai") return { ...base, sender: { type: "ai", agentId: chat.category === "support" ? "agent-support" : "agent-sales" }, direction: "outbound", content: line[1], aiMeta: line[3] ? { confidence: line[3].confidence, toolCalls: line[3].tools, knowledgeUsed: line[3].knowledge } : undefined };
  if (line[0] === "h") return { ...base, sender: { type: "human", userId: line[3] }, direction: "outbound", content: line[1] };
  return { ...base, sender: { type: "system" }, direction: "outbound", content: line[1], systemMeta: { kind: line[3] === "Ticket created" ? "ticket_created" : line[3] === "Approval requested" ? "deal_updated" : "note", label: line[3] } };
}));

export const conversations: Conversation[] = chats.map((chat) => {
  const last = messages.filter((item) => item.conversationId === chat.id).at(-1)!;
  return { id: chat.id, customerId: `cus-${chat.customer}`, channel: chat.channel, category: chat.category, subject: chat.subject, unreadCount: chat.unread, priority: chat.priority, lastMessageAt: last.createdAt, lastMessagePreview: last.content.length > 80 ? `${last.content.slice(0, 77)}…` : last.content, assignedToId: chat.assignedTo, aiActive: chat.aiActive, status: chat.status, externalThreadId: chat.thread };
});

export function getConversationById(id?: string): Conversation | undefined {
  if (!id) return undefined;
  return conversations.find((c) => c.id === id);
}

export function getConversationsForCustomer(customerId: string): Conversation[] {
  return conversations
    .filter((c) => c.customerId === customerId)
    .sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1));
}

export function getMessagesForConversation(conversationId: string): Message[] {
  return messages
    .filter((m) => m.conversationId === conversationId)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}
