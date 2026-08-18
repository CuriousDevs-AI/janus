export * from "./users";
export * from "./companies";
export * from "./customers";
export * from "./leads";
export * from "./deals";
export * from "./conversations";
export * from "./tickets";
export * from "./knowledge";
export * from "./memory";
export * from "./agents";
export * from "./automations";
export * from "./approvals";
export * from "./notifications";
export * from "./audit";
export * from "./evaluations";
export * from "./usage";
export * from "./integrations";
export * from "./lead-sources";
export * from "./ingestion-events";
export * from "./activities";
export * from "./stats";

import { getCompanyById } from "./companies";
import { getCustomerById } from "./customers";
import { getUserById } from "./users";
import { getLeadsForCustomer } from "./leads";
import { getDealsForCustomer } from "./deals";
import { getConversationsForCustomer } from "./conversations";
import { getTicketsForCustomer } from "./tickets";
import { getMemoryForCustomer } from "./memory";
import { getActivitiesForCustomer } from "./activities";

/**
 * The single call that assembles everything the app needs to render
 * "the complete story" for a customer — identity, lead(s), deal(s),
 * conversations, tickets, memory and timeline — in one shape.
 */
export function getCustomerContext(customerId: string) {
  const customer = getCustomerById(customerId);
  if (!customer) return undefined;
  return {
    customer,
    company: getCompanyById(customer.companyId),
    owner: getUserById(customer.ownerId),
    leads: getLeadsForCustomer(customerId),
    deals: getDealsForCustomer(customerId),
    conversations: getConversationsForCustomer(customerId),
    tickets: getTicketsForCustomer(customerId),
    memory: getMemoryForCustomer(customerId),
    activities: getActivitiesForCustomer(customerId),
  };
}
