"use client";

import { create } from "zustand";
import { scoped } from "@/lib/company";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Contact, Deal, DealEvent, Lead } from "@/lib/api/types";
import { buyers, dealRows, leadRows } from "@/lib/demo-universe";

interface CrmState {
  leads: Lead[];
  deals: Deal[];
  contacts: Contact[];
  events: Record<string, DealEvent[]>;
  patchLead: (id: string, patch: Partial<Lead>) => void;
  removeLead: (id: string) => void;
  putDeal: (id: string, patch: Partial<Deal>, event: DealEvent) => void;
  patchContact: (id: string, patch: Partial<Contact>) => void;
  reset: () => void;
}

const seed = () => ({
  leads: leadRows,
  deals: dealRows,
  contacts: buyers.map((buyer): Contact => {
    const own = leadRows.filter((item) => item.customerId === buyer.id);
    const consented = own.find((item) => item.whatsappOptIn);
    return { id: buyer.id, name: buyer.contact, phone: buyer.phone, email: buyer.email, company: buyer.company, whatsappOptIn: Boolean(consented), doNotContact: false, consentSource: consented?.consentSource ?? null, consentUpdatedAt: consented?.consentUpdatedAt ?? null };
  }),
  events: Object.fromEntries(dealRows.map((deal): [string, DealEvent[]] => {
    const list: DealEvent[] = [{ id: `${deal.id}-created`, action: "created", userId: deal.ownerId, details: { name: deal.name }, createdAt: deal.createdAt }];
    if (deal.stage !== "new") list.unshift({ id: `${deal.id}-stage`, action: "stage_changed", userId: deal.ownerId, details: { from: "new", to: deal.stage }, createdAt: deal.updatedAt });
    return [deal.id, list];
  })),
});

/** The preview's stand-in for the CRM database. Reads and writes go through lib/demo-backend/handler.ts, which applies the same visibility rules the real API does. */
export const useDemoCrmStore = create<CrmState>()(persist((set) => ({
  ...seed(),
  patchLead: (id, patch) => set((state) => ({ leads: state.leads.map((item) => item.id === id ? { ...item, ...patch } : item) })),
  removeLead: (id) => set((state) => ({ leads: state.leads.filter((item) => item.id !== id) })),
  putDeal: (id, patch, event) => set((state) => ({ deals: state.deals.map((item) => item.id === id ? { ...item, ...patch, version: item.version + 1, updatedAt: event.createdAt } : item), events: { ...state.events, [id]: [event, ...(state.events[id] ?? [])] } })),
  patchContact: (id, patch) => set((state) => ({ contacts: state.contacts.map((item) => item.id === id ? { ...item, ...patch } : item) })),
  reset: () => set(seed()),
}), { name: scoped("janus.demo-crm.v2"), version: 1, storage: createJSONStorage(() => localStorage) }));
