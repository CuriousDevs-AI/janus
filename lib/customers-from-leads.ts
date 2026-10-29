import type { Lead } from "@/lib/api/types";

export type LeadCustomer = { id: string; name: string; companyId: string; avatarColor: string };

/** One customer per person the company has leads from, named as the lead has them. */
export function customersFromLeads(leads: Lead[]): LeadCustomer[] {
  const people = new Map<string, LeadCustomer>();
  for (const lead of leads) {
    if (!people.has(lead.customerId)) {
      people.set(lead.customerId, {
        id: lead.customerId,
        name: lead.contactName || lead.phone || lead.email || "Unnamed customer",
        companyId: "",
        avatarColor: "#64748b",
      });
    }
  }
  return [...people.values()];
}
