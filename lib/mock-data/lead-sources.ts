import type { LeadSourceConnection } from "@/lib/types";

// Entry points a tenant configures so that leads actually reach Janus.
// Distinct from `integrations.ts` (generic third-party app connections) —
// these are specifically the SOURCE step of:
// SOURCE -> CONNECTOR/WEBHOOK -> RAW EVENT -> NORMALIZE -> IDENTITY/DEDUP -> PROFILE -> TIMELINE

const TENANT_SLUG = "tenant_8f2a91c7";

export const leadSourceConnections: LeadSourceConnection[] = [
  {
    id: "ls-website",
    source: "website",
    name: "Website Forms & Chat",
    description: "The AI chat widget and any form embedded on curiousdevs.ai — form fills and chat-started conversations both create leads.",
    connectionKind: "embed",
    status: "connected",
    connectedAccount: "curiousdevs.ai",
    embedSnippet: `<script src="https://cdn.janus.curiousdevs.ai/widget.js" data-tenant="${TENANT_SLUG}" async></script>`,
    leadsCaptured30d: 342,
    lastEventAt: "2026-08-17T16:12:00+05:30",
  },
  {
    id: "ls-email",
    source: "email",
    name: "Email",
    description: "Any email sent to your connected inbox is parsed — new senders become leads, known senders are matched to their profile.",
    connectionKind: "webhook",
    status: "connected",
    connectedAccount: "hello@curiousdevs.ai",
    webhookUrl: `https://ingest.janus.curiousdevs.ai/hooks/email/${TENANT_SLUG}`,
    leadsCaptured30d: 96,
    lastEventAt: "2026-08-17T15:40:00+05:30",
  },
  {
    id: "ls-whatsapp",
    source: "whatsapp",
    name: "WhatsApp Business",
    description: "Inbound messages to your WhatsApp Business number via the Cloud API. First-time numbers create a lead automatically.",
    connectionKind: "oauth",
    status: "connected",
    connectedAccount: "+91 98200 45500 (verified)",
    webhookUrl: `https://ingest.janus.curiousdevs.ai/hooks/whatsapp/${TENANT_SLUG}`,
    leadsCaptured30d: 85,
    lastEventAt: "2026-08-17T16:12:00+05:30",
  },
  {
    id: "ls-facebook",
    source: "facebook",
    name: "Facebook Lead Ads",
    description: "Instant Form submissions from your Facebook Page sync in real time via the Meta Lead Ads webhook.",
    connectionKind: "oauth",
    status: "connected",
    connectedAccount: "CuriousDevs — Meta Business Manager",
    webhookUrl: `https://ingest.janus.curiousdevs.ai/hooks/meta-leads/${TENANT_SLUG}`,
    leadsCaptured30d: 128,
    lastEventAt: "2026-08-14T11:05:00+05:30",
  },
  {
    id: "ls-instagram",
    source: "instagram",
    name: "Instagram Lead Ads",
    description: "Instant Form submissions and direct message leads from your Instagram business profile, via the same Meta connection.",
    connectionKind: "oauth",
    status: "connected",
    connectedAccount: "CuriousDevs — Meta Business Manager",
    webhookUrl: `https://ingest.janus.curiousdevs.ai/hooks/meta-leads/${TENANT_SLUG}`,
    leadsCaptured30d: 52,
    lastEventAt: "2026-08-17T08:10:00+05:30",
  },
  {
    id: "ls-meta_ads",
    source: "meta_ads",
    name: "Meta Ads Manager",
    description: "Campaign-level click and conversion data from Meta Ads, attributed to leads for source and campaign reporting.",
    connectionKind: "oauth",
    status: "connected",
    connectedAccount: "Meta Ads Manager — Act ID 7291840563",
    leadsCaptured30d: 45,
    lastEventAt: "2026-08-12T15:40:00+05:30",
  },
  {
    id: "ls-google_ads",
    source: "google_ads",
    name: "Google Ads",
    description: "Lead form extensions and landing-page conversions from Google Ads campaigns.",
    connectionKind: "oauth",
    status: "connected",
    connectedAccount: "Google Ads — Customer ID 412-556-7823",
    leadsCaptured30d: 88,
    lastEventAt: "2026-08-16T09:20:00+05:30",
  },
  {
    id: "ls-linkedin",
    source: "linkedin",
    name: "LinkedIn Lead Gen Forms",
    description: "Native Lead Gen Form submissions from sponsored content on your LinkedIn Company Page.",
    connectionKind: "oauth",
    status: "connected",
    connectedAccount: "CuriousDevs Company Page",
    leadsCaptured30d: 61,
    lastEventAt: "2026-07-30T10:00:00+03:00",
  },
  {
    id: "ls-referral",
    source: "referral",
    name: "Referrals",
    description: "Warm introductions from existing customers or partners. No technical connection required — logged manually or via a shareable referral link.",
    connectionKind: "manual",
    status: "connected",
    leadsCaptured30d: 74,
    lastEventAt: "2026-08-04T09:00:00-07:00",
  },
  {
    id: "ls-webhook",
    source: "webhook",
    name: "Custom Webhooks",
    description: "Generic inbound webhook for tools that don't have a native connector — Zapier, Make, or a custom script you point at this URL.",
    connectionKind: "webhook",
    status: "connected",
    webhookUrl: `https://ingest.janus.curiousdevs.ai/hooks/generic/${TENANT_SLUG}`,
    signingSecret: "whsec_••••••••••••9c31",
    fieldMapping: [
      { rawField: "full_name", mapsTo: "name" },
      { rawField: "email_address", mapsTo: "email" },
      { rawField: "phone_number", mapsTo: "phone" },
      { rawField: "company_name", mapsTo: "company" },
    ],
    leadsCaptured30d: 24,
    lastEventAt: "2026-08-13T13:00:00+02:00",
  },
  {
    id: "ls-api",
    source: "api",
    name: "REST API",
    description: "Push leads directly from your own systems using the Janus API with a scoped API key.",
    connectionKind: "api_key",
    status: "connected",
    apiKeyMasked: "jns_live_••••••••••••4f2a",
    fieldMapping: [
      { rawField: "contact.name", mapsTo: "name" },
      { rawField: "contact.email", mapsTo: "email" },
      { rawField: "contact.org", mapsTo: "company" },
    ],
    leadsCaptured30d: 16,
    lastEventAt: "2026-07-28T09:30:00-05:00",
  },
  {
    id: "ls-csv_import",
    source: "csv_import",
    name: "CSV Import",
    description: "One-off bulk imports — trade show lists, purchased lists, or exports from another CRM.",
    connectionKind: "csv",
    status: "connected",
    fieldMapping: [
      { rawField: "Full Name", mapsTo: "name" },
      { rawField: "Email", mapsTo: "email" },
      { rawField: "Phone", mapsTo: "phone" },
      { rawField: "Company", mapsTo: "company" },
    ],
    leadsCaptured30d: 12,
    lastEventAt: "2026-08-11T10:00:00-04:00",
  },
];

// Illustrative additional entry points a tenant hasn't connected yet —
// shown to demonstrate the "connect a new source" flow.
export const availableLeadSources: {
  id: string;
  name: string;
  description: string;
  connectionKind: LeadSourceConnection["connectionKind"];
}[] = [
  {
    id: "ls-landing-pages",
    name: "Landing Page Builders",
    description: "Unbounce, Webflow or Instapage form submissions, synced via webhook.",
    connectionKind: "webhook",
  },
  {
    id: "ls-booking-tools",
    name: "Booking Tools",
    description: "Turn a Calendly or Cal.com booking into a qualified lead automatically.",
    connectionKind: "oauth",
  },
];

export function getLeadSourceById(id?: string): LeadSourceConnection | undefined {
  if (!id) return undefined;
  return leadSourceConnections.find((s) => s.id === id);
}
