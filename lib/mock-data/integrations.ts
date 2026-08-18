import type { Integration } from "@/lib/types";

// Third-party business tools — CRM sync, commerce, scheduling, productivity.
// Communication channels (Email, Website Chat, WhatsApp, Facebook & Instagram
// Leads) are NOT listed here — they're entry points into the customer
// lifecycle, not generic app connections, so they're owned by Lead Sources
// (and surfaced again in Settings -> Channels) as the single source of
// truth. Duplicating them here previously caused Integrations and Lead
// Sources to silently disagree about whether WhatsApp/Facebook were even
// connected.
export const integrations: Integration[] = [
  {
    id: "int-calendar",
    name: "Calendar",
    category: "calendar",
    description: "Let AI and sales reps schedule meetings directly on your calendar.",
    status: "connected",
    connectedAccount: "pankaj@curiousdevs.ai",
    lastSyncAt: "2026-08-17T15:45:00+05:30",
    eventsSynced: 96,
  },
  {
    id: "int-zendesk",
    name: "Zendesk",
    category: "helpdesk",
    description: "Sync your existing Zendesk tickets into Janus so support history stays on the same customer timeline as sales and AI activity.",
    status: "available",
    syncDirection: "two_way",
    fieldMapping: [
      { rawField: "subject", mapsTo: "Ticket subject" },
      { rawField: "requester.email", mapsTo: "Customer" },
      { rawField: "priority", mapsTo: "Priority" },
      { rawField: "status", mapsTo: "Status" },
    ],
  },
  {
    id: "int-freshdesk",
    name: "Freshdesk",
    category: "helpdesk",
    description: "Two-way ticket sync — updates in either system reflect in both, so agents can work from whichever they're already in.",
    status: "available",
    syncDirection: "two_way",
    fieldMapping: [
      { rawField: "subject", mapsTo: "Ticket subject" },
      { rawField: "email", mapsTo: "Customer" },
      { rawField: "priority", mapsTo: "Priority" },
      { rawField: "status", mapsTo: "Status" },
    ],
  },
  {
    id: "int-intercom",
    name: "Intercom",
    category: "helpdesk",
    description: "Bring Intercom conversations and existing tickets into the same customer timeline as every other channel.",
    status: "available",
    syncDirection: "two_way",
    fieldMapping: [
      { rawField: "conversation.title", mapsTo: "Ticket subject" },
      { rawField: "contact.email", mapsTo: "Customer" },
      { rawField: "conversation.priority", mapsTo: "Priority" },
    ],
  },
  {
    id: "int-jira-service-desk",
    name: "Jira Service Desk",
    category: "helpdesk",
    description: "One-time or scheduled import of existing service desk issues when migrating your support queue to Janus.",
    status: "available",
    syncDirection: "import",
    fieldMapping: [
      { rawField: "fields.summary", mapsTo: "Ticket subject" },
      { rawField: "fields.reporter.email", mapsTo: "Customer" },
      { rawField: "fields.priority.name", mapsTo: "Priority" },
    ],
  },
  {
    id: "int-rest-api",
    name: "REST API",
    category: "developer",
    description: "Read and write leads, customers, deals and tickets from your own systems using a scoped Janus API key — for custom integrations nothing else here covers.",
    status: "connected",
    connectedAccount: "Platform API",
    apiKeyMasked: "jns_live_••••••••••••7c2e",
    lastSyncAt: "2026-08-17T16:00:00+05:30",
  },
  {
    id: "int-hubspot",
    name: "HubSpot",
    category: "crm",
    description: "Two-way sync of contacts, deals and activity with HubSpot CRM.",
    status: "available",
  },
  {
    id: "int-salesforce",
    name: "Salesforce",
    category: "crm",
    description: "Two-way sync of leads, opportunities and accounts with Salesforce.",
    status: "available",
  },
  {
    id: "int-shopify",
    name: "Shopify",
    category: "commerce",
    description: "Pull order and customer data into support conversations.",
    status: "available",
  },
  {
    id: "int-slack",
    name: "Slack",
    category: "productivity",
    description: "Send notifications and approvals to a Slack channel.",
    status: "error",
    connectedAccount: "curiousdevs.slack.com",
    lastSyncAt: "2026-08-14T09:00:00+05:30",
    errorMessage: "OAuth token expired — reconnect required.",
  },
  {
    id: "int-stripe",
    name: "Stripe",
    category: "commerce",
    description: "Reference billing and payment history inside customer profiles.",
    status: "available",
  },
];

export function getIntegrationById(id?: string): Integration | undefined {
  if (!id) return undefined;
  return integrations.find((i) => i.id === id);
}
