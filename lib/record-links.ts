"use client";

import { useAppStore } from "@/lib/stores/app-store";

/**
 * Shared record links (plan §4.3). A workspace record points at a CRM record by id, and the CRM
 * records are read from here, so every module offers the same choices. Links are optional: a record
 * without one stays valid.
 */

export interface LinkOption { id: string; label: string }

const closedTicket = (status: string) => status === "resolved" || status === "closed";

export function useCrmLinkOptions() {
  const customers = useAppStore((state) => state.customers);
  const deals = useAppStore((state) => state.deals);
  const tickets = useAppStore((state) => state.tickets);
  return {
    customers: customers.map((c): LinkOption => ({ id: c.id, label: c.name })),
    deals: deals.map((d): LinkOption => ({ id: d.id, label: d.name })),
    tickets: tickets.map((t): LinkOption => ({ id: t.id, label: `${t.number} · ${t.subject}` })),
    openTickets: tickets.filter((t) => !closedTicket(t.status)).map((t): LinkOption => ({ id: t.id, label: `${t.number} · ${t.subject}` })),
  };
}

/** The CRM record's label for an id, or null when the link is empty or the record is gone. */
export function linkedLabel(options: LinkOption[], id: string | undefined): string | null {
  if (!id) return null;
  return options.find((o) => o.id === id)?.label ?? null;
}
