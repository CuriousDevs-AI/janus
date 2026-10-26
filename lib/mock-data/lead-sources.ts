import type { LeadSourceConnection } from "@/lib/types";

// Demo configuration only. Calls are a discoverability shortcut to this same
// webhook endpoint, not another integration or independently provisioned URL.
const webhook = {
  webhookUrl: "https://ingest.janus.example/hooks/tenant_demo",
  signingSecret: "Generated when connected",
  fieldMapping: [
    { rawField: "full_name", mapsTo: "name" },
    { rawField: "email_address", mapsTo: "email" },
    { rawField: "phone_number", mapsTo: "phone" },
    { rawField: "company_name", mapsTo: "company" },
    { rawField: "recording_url", mapsTo: "recording_url" },
  ],
};

export const webhookPresets = [
  { value: "exotel", label: "Exotel", group: "Calls" },
  { value: "knowlarity", label: "Knowlarity", group: "Calls" },
  { value: "myoperator", label: "MyOperator", group: "Calls" },
  { value: "tata_tele", label: "Tata Tele", group: "Calls" },
  { value: "google_ads_lead_form", label: "Google Ads Lead Form", group: "Forms/ads" },
  { value: "zapier", label: "Zapier", group: "Automation" },
  { value: "make", label: "Make", group: "Automation" },
  { value: "custom", label: "Custom", group: "Custom" },
];

export const leadSourceConnections: LeadSourceConnection[] = [
  {
    id: "ls-website", source: "website", name: "Website Form & Chat Widget",
    description: "Capture enquiries from an embedded form or chat widget on your website.",
    connectionKind: "embed", status: "connected", connectedAccount: "Website form",
    embedSnippet: '<script src="https://cdn.janus.example/widget.js" data-tenant="tenant_demo" async></script>',
    leadsCaptured30d: 8, lastEventAt: "2026-10-23T11:20:00+05:30",
  },
  {
    id: "ls-whatsapp", source: "whatsapp", name: "WhatsApp Business",
    description: "Capture first-time enquiries to your WhatsApp Business number through the Meta Cloud API.",
    connectionKind: "oauth", status: "connected", connectedAccount: "WhatsApp Business account",
    webhookUrl: "https://ingest.janus.example/hooks/whatsapp/tenant_demo",
    leadsCaptured30d: 12, lastEventAt: "2026-10-23T09:40:00+05:30",
  },
  {
    id: "ls-webhook", source: "webhook", name: "Custom Webhook",
    description: "One URL and signing secret for call providers, Google Ads Lead Form, Zapier, Make or custom tools.",
    connectionKind: "webhook", status: "available", preset: "custom", ...webhook,
  },
  {
    id: "ls-phone_call", source: "phone_call", name: "Phone Calls & Missed Calls",
    description: "Open Custom Webhook with Calls presets. Each new caller number becomes a lead, with a recording attached when provided.",
    connectionKind: "webhook", status: "connected", preset: "exotel", ...webhook,
    connectedAccount: "Exotel · demo call preset",
    leadsCaptured30d: 4, lastEventAt: "2026-10-23T14:10:00+05:30",
  },
  {
    id: "ls-api", source: "api", name: "REST API",
    description: "Push leads from your own systems with an API key scoped to lead creation.",
    connectionKind: "api_key", status: "available",
  },
  {
    id: "ls-csv_import", source: "csv_import", name: "CSV Import",
    description: "One-off bulk import of your contacts, trade-show enquiries or an export from another CRM.",
    connectionKind: "csv", status: "available",
    fieldMapping: [
      { rawField: "Full Name", mapsTo: "name" },
      { rawField: "Email", mapsTo: "email" },
      { rawField: "Phone", mapsTo: "phone" },
      { rawField: "Company", mapsTo: "company" },
    ],
  },
  {
    id: "ls-meta_lead_ads", source: "meta_lead_ads", name: "Meta Lead Ads",
    description: "Facebook and Instagram Instant Forms in one Meta Lead Ads connection.",
    connectionKind: "oauth", status: "coming_soon",
  },
  {
    id: "ls-indiamart", source: "indiamart", name: "IndiaMART",
    description: "Pull enquiries using your seller CRM API key on a schedule.",
    connectionKind: "pull", status: "coming_soon", syncInterval: "5m",
  },
];

export function getLeadSourceById(id?: string): LeadSourceConnection | undefined {
  return leadSourceConnections.find((source) => source.id === id);
}

export function getLeadSourceHref(source: LeadSourceConnection, preset = source.preset): string {
  if (source.source === "phone_call") {
    return `/lead-sources/ls-webhook?presets=calls&preset=${encodeURIComponent(preset ?? "exotel")}`;
  }
  return `/lead-sources/${source.id}${source.connectionKind === "webhook" && preset ? `?preset=${encodeURIComponent(preset)}` : ""}`;
}
