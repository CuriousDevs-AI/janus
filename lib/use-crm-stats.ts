"use client";

import { useMemo } from "react";
import { useDemoCrmStore } from "@/lib/demo-backend/crm-store";
import { useAppStore } from "@/lib/stores/app-store";
import { canSeeOwner } from "@/lib/crm-scope";
import { useCrmAccess } from "@/lib/use-crm-access";
import { buildCrmStats } from "@/lib/mock-data/stats";

/** Analytics for the slice of the CRM the signed-in person may see. Same numbers the lists show, never more. */
export function useCrmStats() {
  const access = useCrmAccess();
  const leads = useDemoCrmStore((state) => state.leads);
  const deals = useDemoCrmStore((state) => state.deals);
  const customers = useAppStore((state) => state.customers);
  const tickets = useAppStore((state) => state.tickets);
  return useMemo(() => {
    const myLeads = leads.filter((item) => canSeeOwner(access.account, item.ownerId));
    const myDeals = deals.filter((item) => canSeeOwner(access.account, item.ownerId));
    const share = leads.length ? myLeads.length / leads.length : 1;
    return buildCrmStats({ leads: myLeads, deals: myDeals, customers: customers.filter((item) => access.customerVisible(item.id)), tickets: access.tickets(tickets) }, share);
  }, [access, leads, deals, customers, tickets]);
}
