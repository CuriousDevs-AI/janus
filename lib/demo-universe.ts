/**
 * One made-up company that every demo screen draws from, so the numbers agree everywhere.
 * Acme Traders Pvt Ltd distributes packaged food, household and personal-care goods to retailers
 * and institutions in Delhi NCR and Rajasthan. Its people are the HR demo employees.
 * Change a record here and CRM, Business Management and the dashboards follow.
 */
import type { DealStage } from "@/lib/types";
import type { Deal, Lead, WhatsAppConversation, WhatsAppMessage } from "@/lib/api/types";

/** The demo "today". HR demo records use the same date. */
export const DEMO_TODAY = "2026-10-24";
export const at = (daysAgo: number, time = "11:00") => {
  const day = new Date(`${DEMO_TODAY}T12:00:00+05:30`);
  day.setDate(day.getDate() - daysAgo);
  return `${day.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })}T${time}:00+05:30`;
};

export const company = { name: "Acme Traders Pvt Ltd", short: "Acme Traders", domain: "acmetraders.in", industry: "FMCG & household goods distribution", city: "Gurugram, Haryana", gstin: "06AABCA1234F1Z5" };

/** Sales people. Ids are the CRM user ids, the same ones the signed-in session carries. */
export const owners = {
  owner: { id: "u-1", name: "Pankaj Neema" },
  arjun: { id: "u-4", name: "Arjun Mehta" },
  riya: { id: "u-3", name: "Riya Kapoor" },
  meera: { id: "u-2", name: "Meera Singh" },
} as const;
type OwnerKey = keyof typeof owners;

/** Trade customers. None share a name with an Acme employee. */
export const buyers = [
  { id: "cus-1", company: "Northstar Retail", contact: "Kavita Rao", phone: "+91 98765 43210", email: "kavita@northstarretail.in", city: "Delhi", kind: "Retail chain, 6 stores" },
  { id: "cus-2", company: "Orbit Canteen Services", contact: "Amit Shah", phone: "+91 98100 11223", email: "amit@orbitcanteen.in", city: "Gurugram", kind: "Institutional canteens" },
  { id: "cus-3", company: "Annapurna Foods", contact: "Neelam Bansal", phone: "+91 99200 77881", email: "neelam@annapurnafoods.in", city: "Jaipur", kind: "Regional distributor" },
  { id: "cus-4", company: "Shree Balaji Kirana Stores", contact: "Mahesh Agarwal", phone: "+91 98290 44120", email: "mahesh@shreebalaji.in", city: "Alwar", kind: "Kirana" },
  { id: "cus-5", company: "Green Basket Supermarket", contact: "Farah Siddiqui", phone: "+91 98110 55231", email: "farah@greenbasket.in", city: "Noida", kind: "Supermarket" },
  { id: "cus-6", company: "Hotel Aravali Grand", contact: "Pradeep Chauhan", phone: "+91 94140 22871", email: "purchase@aravaligrand.in", city: "Udaipur", kind: "Hotel" },
  { id: "cus-7", company: "Metro Value Mart", contact: "Suresh Nair", phone: "+91 98999 30412", email: "suresh@metrovaluemart.in", city: "Faridabad", kind: "Retail, 4 outlets" },
  { id: "cus-8", company: "Sunrise Pharmacy Chain", contact: "Anjali Mehra", phone: "+91 98104 66782", email: "anjali@sunrisepharmacy.in", city: "Delhi", kind: "Pharmacy chain" },
  { id: "cus-9", company: "Rajputana Wholesale Co-op", contact: "Bhanwar Singh", phone: "+91 94133 90125", email: "bhanwar@rajputanacoop.in", city: "Jodhpur", kind: "Co-operative, 40 shops" },
  { id: "cus-10", company: "FreshKart Quick Commerce", contact: "Siddharth Jain", phone: "+91 98731 88204", email: "sid@freshkart.in", city: "Gurugram", kind: "Dark stores" },
  { id: "cus-11", company: "Delhi Valley Schools Trust", contact: "Ritu Malhotra", phone: "+91 98111 20938", email: "ritu@dvschools.in", city: "Delhi", kind: "School canteens" },
  { id: "cus-12", company: "Kumar & Sons General Merchants", contact: "Rakesh Kumar", phone: "+91 98963 17745", email: "rakesh@kumarandsons.in", city: "Rewari", kind: "General merchant" },
  { id: "cus-13", company: "Lotus Cash & Carry", contact: "Vandana Pillai", phone: "+91 98100 73345", email: "vandana@lotuscarry.in", city: "Gurugram", kind: "Cash & carry" },
  { id: "cus-14", company: "Shiv Shakti Bakery", contact: "Dinesh Prajapat", phone: "+91 94140 56012", email: "dinesh@shivshaktibakery.in", city: "Kota", kind: "Bakery" },
] as const;

type Source = "website" | "whatsapp" | "phone_call";
/** buyer number, source, stage, days since captured, days since last activity, owner, campaign, requirement, deal (name, amount, close in days) */
type Row = [number, Source, string, number, number, OwnerKey, string | null, string, [string, number, number]?];
const rows: Row[] = [
  [1, "website", "qualified", 2, 0, "owner", "Diwali retail readiness", "Festive stock for 6 Delhi stores: staples, snacks and gift packs, weekly drops from the Gurugram warehouse.", ["Northstar festive range, 6 stores", 480000, 15]],
  [2, "phone_call", "new", 3, 3, "owner", null, "Missed call from the canteen purchase desk asking for monthly rates on edible oil and pulses."],
  [3, "whatsapp", "proposal", 5, 2, "arjun", "Distributor outreach", "Wants Acme as the Rajasthan feeder for biscuits and namkeen, payment on 30-day credit.", ["Annapurna Rajasthan feeder supply", 650000, 22]],
  [4, "whatsapp", "qualified", 6, 1, "meera", null, "Kirana owner wants a fortnightly top-up of atta, rice and cooking oil with doorstep delivery.", ["Balaji fortnightly staples", 85000, 12]],
  [5, "website", "new", 1, 1, "riya", "Diwali retail readiness", "Supermarket manager asking for the festive price list and minimum order quantity."],
  [6, "phone_call", "qualified", 9, 4, "arjun", null, "Hotel needs bulk kitchen and housekeeping consumables on a monthly rate contract.", ["Aravali monthly consumables contract", 220000, 18]],
  [7, "whatsapp", "negotiation", 12, 1, "arjun", "Distributor outreach", "Negotiating margin on the personal-care range for 4 Faridabad outlets, wants 45-day credit.", ["Metro personal-care range, 4 outlets", 310000, 8]],
  [8, "website", "proposal", 10, 3, "riya", null, "Pharmacy chain looking for a regular supplier of sanitisers, soaps and baby-care.", ["Sunrise pharmacy essentials", 140000, 14]],
  [9, "whatsapp", "won", 20, 6, "arjun", "Distributor outreach", "Co-op signed for monthly dry-goods supply across 40 member shops.", ["Rajputana monthly dry goods", 520000, -6]],
  [10, "website", "qualified", 4, 1, "meera", "Quick commerce supply", "Dark store needs daily replenishment of packaged snacks with a 6am dispatch.", ["FreshKart daily snacks replenishment", 360000, 20]],
  [11, "phone_call", "new", 2, 2, "owner", null, "School canteen trust enquiring about hygienic packaged snacks for 3 campuses."],
  [12, "whatsapp", "won", 28, 9, "meera", null, "Reorder of 120 cartons of detergent, repeat customer.", ["Kumar detergent reorder", 98000, -9]],
  [13, "website", "proposal", 7, 2, "riya", "Diwali retail readiness", "Cash and carry wants a bundled festive offer on dry fruits and gift hampers.", ["Lotus festive hamper bundle", 270000, 11]],
  [14, "whatsapp", "negotiation", 8, 0, "meera", null, "Bakery wants flour, sugar and edible oil on a weekly schedule, negotiating on rate.", ["Shiv Shakti weekly bakery inputs", 175000, 9]],
  [1, "whatsapp", "won", 35, 22, "owner", null, "First order for 6 stores: staples and beverages, delivered in September.", ["Northstar first order", 310000, -22]],
  [5, "phone_call", "lost", 22, 14, "riya", null, "Chose a nearer distributor on price.", ["Green Basket staples", 120000, -14]],
  [7, "website", "won", 40, 25, "arjun", null, "Trial order for household cleaners, converted after delivery.", ["Metro cleaners trial order", 64000, -25]],
  [3, "website", "qualified", 14, 8, "arjun", "Distributor outreach", "Asked for the Rajasthan price list and delivery schedule."],
  [2, "whatsapp", "new", 3, 3, "owner", null, "Asking whether Acme can deliver to the Manesar plant canteen."],
  [10, "phone_call", "new", 5, 5, "meera", null, "Dark store team called for a rate on bulk packaging material."],
  [9, "phone_call", "qualified", 16, 10, "arjun", null, "Co-op asking to add stationery to the monthly supply."],
  [12, "website", "new", 6, 6, "meera", null, "Enquiring about a credit limit increase."],
  [4, "whatsapp", "lost", 30, 24, "meera", null, "Went with a local wholesaler.", ["Balaji bulk order", 40000, -24]],
  [6, "whatsapp", "new", 1, 1, "arjun", null, "Wedding-season banquet orders for rice and pulses, asking for a quote."],
];

const buyer = (n: number) => buyers[n - 1];
export const leadRows: Lead[] = rows.map((row, index) => {
  const [n, source, stage, age, last, ownerKey, campaign, requirement, deal] = row;
  const who = buyer(n);
  const owner = owners[ownerKey];
  const id = `lead-${index + 1}`;
  const whatsapp = source === "whatsapp";
  return {
    dealId: deal ? `deal-${index + 1}` : null, id, customerId: who.id, contactName: who.contact, phone: who.phone, email: who.email, company: who.company,
    whatsappOptIn: whatsapp || source === "website", doNotContact: false,
    consentSource: whatsapp ? "whatsapp_inbound" : source === "website" ? "website_form" : null, consentUpdatedAt: whatsapp || source === "website" ? at(age, "10:20") : null,
    source, stage, ownerId: owner.id, ownerName: owner.name, requirement, campaign,
    recordingUrl: null, recordingReference: source === "phone_call" ? `call-demo-${880 + index}` : null, createdAt: at(age, "10:15"), lastActivityAt: at(last, "15:40"),
  };
});

export const dealRows: Deal[] = rows.flatMap((row, index) => {
  const [n, , stage, age, last, ownerKey, , , deal] = row;
  if (!deal) return [];
  const who = buyer(n);
  const owner = owners[ownerKey];
  return [{
    id: `deal-${index + 1}`, leadId: leadRows[index].id, customerId: who.id, customerName: who.contact, company: who.company, phone: who.phone,
    ownerId: owner.id, ownerName: owner.name, name: deal[0], amount: `${deal[1]}.00`, stage: stage as DealStage,
    expectedCloseAt: at(-deal[2], "00:00").replace(/T\d\d:\d\d/, "T00:00"), lostReason: stage === "lost" ? "Price and delivery distance" : "", version: 1, createdAt: at(age - 0, "10:30"), updatedAt: at(last, "15:40"),
  } satisfies Deal];
});

/** Numbers the dashboards show. All of them come from the records above. */
const openStages = new Set(["new", "qualified", "demo", "proposal", "negotiation", "approval"]);
const openDeals = dealRows.filter((item) => openStages.has(item.stage));
const wonDeals = dealRows.filter((item) => item.stage === "won");
const lostDeals = dealRows.filter((item) => item.stage === "lost");
const sum = (list: Deal[]) => list.reduce((total, item) => total + Number(item.amount), 0);
export const stats = {
  leads: leadRows.length,
  deals: dealRows.length,
  openDeals: openDeals.length,
  wonDeals: wonDeals.length,
  lostDeals: lostDeals.length,
  pipeline: sum(openDeals),
  wonValue: sum(wonDeals),
  leadToDeal: Math.round((dealRows.length / leadRows.length) * 1000) / 10,
  winRate: Math.round((wonDeals.length / Math.max(1, wonDeals.length + lostDeals.length)) * 1000) / 10,
  byStage: ["new", "qualified", "proposal", "negotiation", "won", "lost"].map((stage) => ({ stage, count: leadRows.filter((item) => item.stage === stage).length })),
  bySource: (["website", "whatsapp", "phone_call"] as const).map((source) => ({ source, count: leadRows.filter((item) => item.source === source).length, last: leadRows.filter((item) => item.source === source).map((item) => item.lastActivityAt).sort().at(-1) ?? null })),
  buyers: new Set(leadRows.map((item) => item.customerId)).size,
};
export const countBySource = (source: string) => stats.bySource.find((item) => item.source === source)?.count ?? 0;
export const lastBySource = (source: string) => stats.bySource.find((item) => item.source === source)?.last ?? null;
/** ₹ in lakh, one decimal: 2690000 -> "26.9L". */
export const lakh = (value: number) => `₹${(value / 100000).toFixed(1).replace(/\.0$/, "")}L`;

/** Leads captured per month for the growth chart. Earlier months are history; the last is this month's real count. */
export const monthlyLeads = [{ label: "May", leads: 11, deals: 6 }, { label: "Jun", leads: 14, deals: 8 }, { label: "Jul", leads: 15, deals: 9 }, { label: "Aug", leads: 13, deals: 8 }, { label: "Sep", leads: 17, deals: 11 }, { label: "Oct", leads: leadRows.filter((item) => item.createdAt >= "2026-10-01").length, deals: dealRows.filter((item) => item.createdAt >= "2026-10-01").length }];

/** WhatsApp chats for the leads that came in on WhatsApp. */
const chatLeads = leadRows.filter((item) => item.source === "whatsapp" && item.stage !== "lost").slice(0, 6);
const opening = (lead: Lead) => lead.requirement.replace(/^Wants/, "We want").replace(/^Asking/, "We are asking").replace(/^Negotiating/, "We are negotiating");
export const conversations: WhatsAppConversation[] = chatLeads.map((lead, index) => ({
  id: `wa-${index + 1}`, contactId: lead.customerId, name: lead.contactName, phone: lead.phone ?? "", company: lead.company,
  whatsappOptIn: true, doNotContact: false, consentSource: "whatsapp_inbound", consentUpdatedAt: lead.consentUpdatedAt,
  lastMessageAt: lead.lastActivityAt, lastInboundAt: lead.lastActivityAt, replyWindowEndsAt: new Date(new Date(lead.lastActivityAt).getTime() + 86400000).toISOString().replace("Z", "+00:00"),
}));
export const messagesByConversation: Record<string, WhatsAppMessage[]> = Object.fromEntries(chatLeads.map((lead, index) => {
  const first = lead.lastActivityAt;
  return [`wa-${index + 1}`, [
    { id: `wamsg-${index * 2 + 1}`, direction: "inbound", kind: "text", body: opening(lead), status: "received", errorCode: null, createdAt: first },
    ...(index % 2 === 0 ? [{ id: `wamsg-${index * 2 + 2}`, direction: "outbound" as const, kind: "template", body: `Hi ${lead.contactName.split(" ")[0]}, thanks for reaching out to Acme Traders. ${lead.ownerName} will share rates and delivery slots today.`, status: "accepted", errorCode: null, createdAt: new Date(new Date(first).getTime() + 120000).toISOString().replace("Z", "+00:00") }] : []),
  ]];
}));
