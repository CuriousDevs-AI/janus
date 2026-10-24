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

import { activeSpec } from "@/lib/companies";
import type { CompanySpec, Row } from "@/lib/companies/spec";

export const company = activeSpec.company;
export const owners = activeSpec.owners;
export const buyers = activeSpec.buyers;

/** Leads for any company, so the group view can total every company without opening each one. */
export function buildLeadRows(spec: CompanySpec): Lead[] { return spec.rows.map((row, index) => {
  const [n, source, stage, age, last, ownerKey, campaign, requirement, deal] = row;
  const who = spec.buyers[n - 1];
  const owner = spec.owners[ownerKey];
  const id = `lead-${index + 1}`;
  const whatsapp = source === "whatsapp";
  return {
    dealId: deal ? `deal-${index + 1}` : null, id, customerId: who.id, contactName: who.contact, phone: who.phone, email: who.email, company: who.company,
    whatsappOptIn: whatsapp || source === "website", doNotContact: false,
    consentSource: whatsapp ? "whatsapp_inbound" : source === "website" ? "website_form" : null, consentUpdatedAt: whatsapp || source === "website" ? at(age, "10:20") : null,
    source, stage, ownerId: owner.id, ownerName: owner.name, requirement, campaign,
    recordingUrl: null, recordingReference: source === "phone_call" ? `call-demo-${880 + index}` : null, createdAt: at(age, "10:15"), lastActivityAt: at(last, "15:40"),
  };
}); }
export const leadRows: Lead[] = buildLeadRows(activeSpec);

export function buildDealRows(spec: CompanySpec, leads: Lead[]): Deal[] { return spec.rows.flatMap((row, index) => {
  const [n, , stage, age, last, ownerKey, , , deal] = row;
  if (!deal) return [];
  const who = spec.buyers[n - 1];
  const owner = spec.owners[ownerKey];
  return [{
    id: `deal-${index + 1}`, leadId: leads[index].id, customerId: who.id, customerName: who.contact, company: who.company, phone: who.phone,
    ownerId: owner.id, ownerName: owner.name, name: deal[0], amount: `${deal[1]}.00`, stage: stage as DealStage,
    expectedCloseAt: at(-deal[2], "00:00").replace(/T\d\d:\d\d/, "T00:00"), lostReason: stage === "lost" ? "Price and delivery distance" : "", version: 1, createdAt: at(age - 0, "10:30"), updatedAt: at(last, "15:40"),
  } satisfies Deal];
}); }
export const dealRows: Deal[] = buildDealRows(activeSpec, leadRows);

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
  leadToDeal: Math.round((dealRows.length / Math.max(1, leadRows.length)) * 1000) / 10,
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
const history = Math.min(1, leadRows.length / 24);
export const monthlyLeads = [{ label: "May", leads: Math.round(11 * history), deals: Math.round(6 * history) }, { label: "Jun", leads: Math.round(14 * history), deals: Math.round(8 * history) }, { label: "Jul", leads: Math.round(15 * history), deals: Math.round(9 * history) }, { label: "Aug", leads: Math.round(13 * history), deals: Math.round(8 * history) }, { label: "Sep", leads: Math.round(17 * history), deals: Math.round(11 * history) }, { label: "Oct", leads: leadRows.filter((item) => item.createdAt >= "2026-10-01").length, deals: dealRows.filter((item) => item.createdAt >= "2026-10-01").length }];

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
