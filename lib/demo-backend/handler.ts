"use client";

import { APIError } from "@/lib/api/client";
import type { Contact, Deal, DealEvent, Lead } from "@/lib/api/types";
import { canSeeOwner } from "@/lib/crm-scope";
import { demoAccounts } from "@/lib/demo-accounts";
import { conversations } from "@/lib/demo-universe";
import { personaPermissions, readView } from "@/lib/demo-persona";
import { activeCompany, updateCompany } from "@/lib/company";
import { useDemoCrmStore } from "@/lib/demo-backend/crm-store";

/** Returned for paths the preview backend does not implement, so callers fall back to their own handling. */
export const NOT_HANDLED = Symbol("not-handled");

const forbidden = (what: string) => new APIError(`You don't have access to ${what}.`, 403, "forbidden");
const missing = (what: string) => new APIError(`${what} was not found.`, 404, "not_found");
const invalid = (text: string) => new APIError(text, 422, "validation_error");

function body(init: RequestInit): Record<string, unknown> {
  try { return init.body ? JSON.parse(String(init.body)) : {}; } catch { return {}; }
}
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

/** Leads and deals are for people with a CRM scope. Support and everyone outside the CRM get a 403, as the API would. */
function crmAccount() {
  const account = readView();
  if (!account || account.crm === "none" || account.crm === "support") throw forbidden("leads and deals");
  return account;
}

const sorted = <T extends { createdAt: string }>(rows: T[]) => [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
const page = <T>(rows: T[], params: URLSearchParams) => (Number(params.get("after_id") ?? 0) > 0 ? [] : rows.slice(0, Number(params.get("limit") ?? 50)));

export async function demoRequest(path: string, init: RequestInit = {}): Promise<unknown> {
  const method = (init.method ?? "GET").toUpperCase();
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  const store = useDemoCrmStore.getState();
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);

  if (parts[0] === "leads") {
    const account = crmAccount();
    const visible = () => store.leads.filter((item) => canSeeOwner(account, item.ownerId));
    if (parts.length === 1 && method === "GET") return page(sorted(visible()), params);
    if (parts.length === 1 && method === "POST") {
      const granted = personaPermissions(account);
      if (!granted.includes("*") && !granted.includes("leads:write")) throw forbidden("adding leads");
      const data = body(init);
      const name = text(data.name);
      if (name.length < 2) throw invalid("Enter the customer's name.");
      const phone = text(data.phone) || null;
      const email = text(data.email) || null;
      if (!phone && !email) throw invalid("Add a phone number or an email.");
      const now = new Date().toISOString();
      const id = `lead-${Date.now()}`;
      const customerId = `cus-${Date.now()}`;
      const lead: Lead = { dealId: null, id, customerId, contactName: name, phone, email, company: text(data.company), whatsappOptIn: false, doNotContact: false, consentSource: null, consentUpdatedAt: null, source: "manual", stage: "new", ownerId: account.crmUserId, ownerName: account.name, requirement: text(data.requirement), campaign: null, recordingUrl: null, recordingReference: null, createdAt: now, lastActivityAt: now };
      store.addLead(lead, { id: customerId, name, phone, email, company: lead.company, whatsappOptIn: false, doNotContact: false, consentSource: null, consentUpdatedAt: null });
      return lead;
    }
    const lead = store.leads.find((item) => item.id === parts[1]);
    if (!lead || !canSeeOwner(account, lead.ownerId)) throw missing("That lead");
    if (method === "GET") return lead;
    if (method === "DELETE") { store.removeLead(lead.id); return undefined; }
    if (method === "PATCH") {
      const data = body(init);
      const name = text(data.name);
      if (name.length < 2) throw invalid("Enter the customer's name.");
      const patch: Partial<Lead> = { contactName: name, phone: text(data.phone) || null, email: text(data.email) || null, company: text(data.company), requirement: text(data.requirement), stage: text(data.stage) || lead.stage, lastActivityAt: new Date().toISOString() };
      // Handing a lead to someone else needs the assign permission and someone the person manages.
      const newOwner = text(data.ownerId);
      if (newOwner && newOwner !== lead.ownerId) {
        const target = demoAccounts.find((item) => item.crmUserId === newOwner);
        if (!target || !(account.crm === "all" || account.crm === "team") || !canSeeOwner(account, newOwner)) throw forbidden("assign leads to that person");
        patch.ownerId = target.crmUserId;
        patch.ownerName = target.name;
        if (lead.dealId) store.putDeal(lead.dealId, { ownerId: target.crmUserId, ownerName: target.name }, { id: `${lead.dealId}-owner-${Date.now()}`, action: "owner_changed", userId: account.crmUserId, details: { to: target.name }, createdAt: new Date().toISOString() });
      }
      store.patchLead(lead.id, patch);
      // The same person on other leads and deals, and their contact record, should read the same.
      useDemoCrmStore.getState().leads.filter((item) => item.customerId === lead.customerId && item.id !== lead.id).forEach((item) => store.patchLead(item.id, { contactName: name, phone: patch.phone, email: patch.email, company: patch.company }));
      store.patchContact(lead.customerId, { name, phone: patch.phone ?? null, email: patch.email ?? null, company: patch.company });
      return useDemoCrmStore.getState().leads.find((item) => item.id === lead.id);
    }
  }

  if (parts[0] === "deals") {
    const account = crmAccount();
    const visible = () => store.deals.filter((item) => canSeeOwner(account, item.ownerId));
    if (parts.length === 1 && method === "GET") return page(sorted(visible()), params);
    const deal = store.deals.find((item) => item.id === parts[1]);
    if (!deal || !canSeeOwner(account, deal.ownerId)) throw missing("That deal");
    if (parts[2] === "events") return store.events[deal.id] ?? [];
    if (method === "GET") return deal;
    if (method === "PUT") {
      const data = body(init);
      if (Number(data.version) !== deal.version) throw new APIError("Someone else changed this deal. Reload and try again.", 409, "conflict");
      const stage = (text(data.stage) || deal.stage) as Deal["stage"];
      const lostReason = text(data.lostReason);
      if (stage === "lost" && lostReason.length < 3) throw invalid("Say why the deal was lost.");
      const amount = Number(data.amount);
      if (!Number.isFinite(amount) || amount < 0) throw invalid("Enter a valid amount.");
      const now = new Date().toISOString();
      const event: DealEvent = { id: `${deal.id}-${now}`, action: stage !== deal.stage ? "stage_changed" : "updated", userId: account.crmUserId, details: stage !== deal.stage ? { from: deal.stage, to: stage } : { name: text(data.name) || deal.name }, createdAt: now };
      store.putDeal(deal.id, { name: text(data.name) || deal.name, amount: amount.toFixed(2), stage, expectedCloseAt: (data.expectedCloseAt as string | null) ?? deal.expectedCloseAt, lostReason: stage === "lost" ? lostReason : "" }, event);
      if (stage !== deal.stage) store.patchLead(deal.leadId, { stage, lastActivityAt: now });
      return useDemoCrmStore.getState().deals.find((item) => item.id === deal.id);
    }
  }

  if (parts[0] === "contacts") {
    const account = readView();
    const contact = store.contacts.find((item) => item.id === parts[1]);
    const mine = store.leads.some((item) => item.customerId === parts[1] && canSeeOwner(account, item.ownerId));
    if (!account || account.crm === "none" || !contact || !mine) throw missing("That customer");
    if (method === "GET" && parts.length === 2) return contact;
    if (method === "PATCH" && parts.length === 2) {
      const data = body(init);
      const name = text(data.name);
      if (name.length < 2) throw invalid("Enter the customer's name.");
      const patch: Partial<Contact> = { name, phone: text(data.phone) || null, email: text(data.email) || null, company: text(data.company) || contact.company };
      store.patchContact(contact.id, patch);
      store.leads.filter((item) => item.customerId === contact.id).forEach((item) => store.patchLead(item.id, { contactName: name, phone: patch.phone, email: patch.email, company: patch.company }));
      return useDemoCrmStore.getState().contacts.find((item) => item.id === contact.id);
    }
    if (method === "PATCH" && parts[2] === "consent") {
      const data = body(init);
      store.patchContact(contact.id, { whatsappOptIn: Boolean(data.whatsappOptIn), doNotContact: Boolean(data.doNotContact), consentSource: text(data.consentSource) || "customer_record", consentUpdatedAt: new Date().toISOString() });
      return useDemoCrmStore.getState().contacts.find((item) => item.id === contact.id);
    }
  }

  if (parts[0] === "whatsapp" && parts[1] === "conversations" && parts.length === 2 && method === "GET") {
    // Chats for the customer pages: only customers this person is allowed to see.
    const account = readView();
    if (!account || account.crm === "none") throw forbidden("chats");
    return conversations.filter((item) => store.leads.some((lead) => lead.customerId === item.contactId && canSeeOwner(account, lead.ownerId)));
  }

  // Opening a WhatsApp follow-up returns the customer's existing chat, so the inbox can open it.
  if (parts[0] === "whatsapp" && parts[1] === "conversations" && parts.length === 2 && method === "POST") {
    const account = readView();
    if (!account || account.crm === "none") throw forbidden("chats");
    const contactId = text(body(init).contactId);
    const found = conversations.find((item) => item.contactId === contactId);
    if (!found) throw missing("A WhatsApp chat for this customer");
    return found;
  }

  // Creating a connection answers with the new source. The preview does not keep it in the lead source list.
  if (parts[0] === "sources" && parts.length === 1 && method === "POST") {
    const data = body(init);
    const name = text(data.name);
    if (name.length < 2) throw invalid("Enter a connection name.");
    const kind = text(data.connectionKind) || "webhook";
    const source = ({ api_key: "api", csv: "csv_import", embed: "website", webhook: "webhook", pull: "webhook" } as Record<string, string>)[kind] ?? "webhook";
    const id = `demo-source-${Date.now()}`;
    return {
      id, name, description: text(data.description), connectionKind: kind, source, status: "connected", preset: text(data.preset) || "custom",
      fieldMapping: [], ingestUrl: `/v1/ingest/${kind}/${id}`, webhookUrl: null, allowedOrigins: Array.isArray(data.allowedOrigins) ? data.allowedOrigins : [],
      eventIdField: null, lastEventAt: null, capturedLeads: 0, signingSecret: null, callbackUrl: null,
    };
  }
  // Lead source presets are fixed reference data, so the preview answers them itself.
  if (parts[0] === "sources" && parts[1] === "presets" && parts.length === 2 && method === "GET") {
    return [
      ["exotel", "Exotel", "Calls"], ["knowlarity", "Knowlarity", "Calls"], ["myoperator", "MyOperator", "Calls"], ["tata_tele", "Tata Tele", "Calls"],
      ["google_ads_lead_form", "Google Ads Lead Form", "Forms/ads"], ["zapier", "Zapier", "Automation"], ["make", "Make", "Automation"], ["custom", "Custom", "Custom"],
    ].map(([value, label, group]) => ({ value, label, group, fieldMapping: [], eventIdField: null, instructions: "", documentationUrl: null }));
  }
  if (parts[0] === "workspaces" && parts.length === 1) {
    const company = activeCompany();
    const named = (id: string) => ({ id, type: id.replaceAll("-", "_"), name: id === "crm-sales" ? "CRM & Sales" : id === "hr-people" ? "HR & People" : id.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()), description: "", status: "active" });
    if (method === "GET") return company.workspaces.map(named);
    if (method === "POST") {
      const account = readView();
      if (account?.hrRole !== "owner") throw forbidden("switch workspaces on");
      const type = text(body(init).type).replaceAll("_", "-");
      if (!type) throw invalid("Choose a workspace.");
      if (!company.workspaces.includes(type)) updateCompany(company.id, { workspaces: [...company.workspaces, type] });
      return { ...named(type), name: text(body(init).name) || named(type).name };
    }
  }
  if (parts[0] === "business" && parts[1] === "setup" && parts.length === 2) {
    const company = activeCompany();
    return { businessName: company.name, industry: company.industry, companySize: company.size ?? "11–50 employees", timezone: company.timezone ?? "Asia/Kolkata", setupCompleted: company.setupDone, completedSteps: company.workspaces.length ? ["business_details", "workspaces"] : ["business_details"], nextStep: company.setupDone ? null : "workspaces" };
  }
  return NOT_HANDLED;
}
