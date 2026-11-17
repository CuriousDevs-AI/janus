"use client";

import * as React from "react";
import { useApi } from "@/lib/api/use-api";
import { customersFromLeads } from "@/lib/customers-from-leads";
import { useAppStore } from "@/lib/stores/app-store";
import { syncSupportTickets } from "@/lib/ticket-records";
import type { Lead } from "@/lib/api/types";

/**
 * Shared record links (plan §4.3). A workspace record points at a CRM record by id, and the CRM
 * records are read from here, so every module offers the same choices. Links are optional: a record
 * without one stays valid.
 */

export interface LinkOption { id: string; label: string }

const closedTicket = (status: string) => status === "resolved" || status === "closed";

export function useCrmLinkOptions() {
  const tickets = useAppStore((state) => state.tickets);
  const leads = useApi<Lead[]>("/leads?limit=100&after_id=0");
  const deals = useApi<{ id: string; name: string; customerName: string }[]>("/deals?limit=100&after_id=0");
  React.useEffect(() => {
    syncSupportTickets().catch(() => { /* the choices stay as they are */ });
  }, []);
  const customers = customersFromLeads(leads.data ?? []).map((c): LinkOption => ({ id: c.id, label: c.name }));
  return {
    customers,
    deals: (deals.data ?? []).map((d): LinkOption => ({ id: d.id, label: `${d.name} · ${d.customerName}` })),
    tickets: tickets.map((t): LinkOption => ({ id: t.id, label: `${t.number} · ${t.subject}` })),
    openTickets: tickets.filter((t) => !closedTicket(t.status)).map((t): LinkOption => ({ id: t.id, label: `${t.number} · ${t.subject}` })),
  };
}

/** The CRM record's label for an id, or null when the link is empty or the record is gone. */
export function linkedLabel(options: LinkOption[], id: string | undefined): string | null {
  if (!id) return null;
  return options.find((o) => o.id === id)?.label ?? null;
}
