import type { Deal, Lead, Source, WhatsAppConversation, WhatsAppMessage, WhatsAppTemplate } from "./types";

/** Demo-only records used to keep the CRM reviewable when the API is offline. */
export const demoLeadRows: Lead[] = [
  {
    dealId: "demo-deal-1", id: "demo-lead-1042", customerId: "demo-customer-1",
    contactName: "Riya Kapoor", phone: "+91 98765 43210", email: "riya@northstar.in",
    company: "Northstar Retail", whatsappOptIn: true, doNotContact: false,
    consentSource: "website_form", consentUpdatedAt: "2026-10-22T10:20:00+05:30",
    source: "website", stage: "qualified", ownerId: "demo-owner", ownerName: "Pankaj Neema",
    requirement: "WhatsApp follow-up for a multi-store support rollout.", campaign: "Diwali retail readiness",
    recordingUrl: null, recordingReference: null, createdAt: "2026-10-22T10:15:00+05:30", lastActivityAt: "2026-10-22T15:40:00+05:30",
  },
  {
    dealId: null, id: "demo-lead-1041", customerId: "demo-customer-2",
    contactName: "Amit Shah", phone: "+91 98100 11223", email: "amit@orbitlogistics.in",
    company: "Orbit Logistics", whatsappOptIn: false, doNotContact: false,
    consentSource: null, consentUpdatedAt: null, source: "phone_call", stage: "new",
    ownerId: "demo-owner", ownerName: "Pankaj Neema", requirement: "Missed call from a fleet operations team.", campaign: null,
    recordingUrl: null, recordingReference: "call-demo-882", createdAt: "2026-10-21T12:05:00+05:30", lastActivityAt: "2026-10-21T12:05:00+05:30",
  },
  {
    dealId: "demo-deal-2", id: "demo-lead-1039", customerId: "demo-customer-3",
    contactName: "Neha Verma", phone: "+91 99200 77881", email: "neha@acmefoods.in",
    company: "Acme Foods", whatsappOptIn: true, doNotContact: false,
    consentSource: "whatsapp_inbound", consentUpdatedAt: "2026-10-19T09:00:00+05:30", source: "whatsapp", stage: "proposal",
    ownerId: "demo-owner", ownerName: "Pankaj Neema", requirement: "Centralise distributor enquiries and payment reminders.", campaign: "Distributor operations",
    recordingUrl: null, recordingReference: null, createdAt: "2026-10-19T08:45:00+05:30", lastActivityAt: "2026-10-22T11:10:00+05:30",
  },
];

export const demoDealRows: Deal[] = [
  {
    id: "demo-deal-1", leadId: "demo-lead-1042", customerId: "demo-customer-1", customerName: "Riya Kapoor", company: "Northstar Retail", phone: "+91 98765 43210",
    ownerId: "demo-owner", ownerName: "Pankaj Neema", name: "Northstar support rollout", amount: "480000.00", stage: "qualified", expectedCloseAt: "2026-11-08T00:00:00+05:30", lostReason: "", version: 1, createdAt: "2026-10-22T10:30:00+05:30", updatedAt: "2026-10-22T15:40:00+05:30",
  },
  {
    id: "demo-deal-2", leadId: "demo-lead-1039", customerId: "demo-customer-3", customerName: "Neha Verma", company: "Acme Foods", phone: "+91 99200 77881",
    ownerId: "demo-owner", ownerName: "Pankaj Neema", name: "Acme distributor operations", amount: "275000.00", stage: "proposal", expectedCloseAt: "2026-11-15T00:00:00+05:30", lostReason: "", version: 1, createdAt: "2026-10-19T09:00:00+05:30", updatedAt: "2026-10-22T11:10:00+05:30",
  },
];

export const demoConnectedSources: Pick<Source, "status">[] = [
  { status: "connected" },
  { status: "connected" },
  { status: "connected" },
];

export const demoSourceRows: Source[] = [
  {
    id: "demo-source-website", name: "Website Form & Chat Widget", description: "Embedded website enquiries", connectionKind: "embed", source: "website", status: "connected", preset: "website", fieldMapping: [], ingestUrl: "https://ingest.janus.example/forms/demo-website", webhookUrl: null, allowedOrigins: ["https://northstar.in"], eventIdField: null, lastEventAt: "2026-10-22T15:40:00+05:30", capturedLeads: 8,
  },
  {
    id: "demo-source-whatsapp", name: "WhatsApp Business", description: "Meta Cloud API conversations", connectionKind: "oauth", source: "whatsapp", status: "connected", preset: "meta_cloud_api", fieldMapping: [], ingestUrl: "", webhookUrl: "https://ingest.janus.example/hooks/whatsapp/demo", allowedOrigins: [], eventIdField: null, lastEventAt: "2026-10-22T15:38:00+05:30", capturedLeads: 12,
  },
  {
    id: "demo-source-phone", name: "Phone Calls & Missed Calls", description: "Exotel call webhook with recording capture", connectionKind: "webhook", source: "phone_call", status: "connected", preset: "exotel", fieldMapping: [{ rawField: "caller_number", mapsTo: "phone" }], ingestUrl: "https://ingest.janus.example/hooks/demo-phone", webhookUrl: "https://ingest.janus.example/hooks/demo-phone", allowedOrigins: [], eventIdField: "call_id", lastEventAt: "2026-10-22T15:20:00+05:30", capturedLeads: 4,
  },
  {
    id: "demo-source-webhook", name: "Custom Webhook", description: "Google Ads, Zapier, Make or custom form events", connectionKind: "webhook", source: "webhook", status: "available", preset: "google_ads_lead_form", fieldMapping: [], ingestUrl: "https://ingest.janus.example/hooks/demo-custom", webhookUrl: "https://ingest.janus.example/hooks/demo-custom", allowedOrigins: [], eventIdField: null, lastEventAt: null, capturedLeads: 0,
  },
  {
    id: "demo-source-api", name: "REST API", description: "Scoped lead creation API key", connectionKind: "api_key", source: "api", status: "available", preset: "lead_create", fieldMapping: [], ingestUrl: "https://api.janus.example/v1/leads", webhookUrl: null, allowedOrigins: [], eventIdField: null, lastEventAt: null, capturedLeads: 0,
  },
  {
    id: "demo-source-csv", name: "CSV Import", description: "One-off bulk import", connectionKind: "csv", source: "csv_import", status: "available", preset: "csv", fieldMapping: [], ingestUrl: "", webhookUrl: null, allowedOrigins: [], eventIdField: null, lastEventAt: null, capturedLeads: 0,
  },
];

export const demoConversations: WhatsAppConversation[] = [
  {
    id: "demo-conversation-1", contactId: "demo-customer-1", name: "Riya Kapoor", phone: "+91 98765 43210", company: "Northstar Retail",
    whatsappOptIn: true, doNotContact: false, consentSource: "website_form", consentUpdatedAt: "2026-10-22T10:20:00+05:30",
    lastMessageAt: "2026-10-22T15:40:00+05:30", lastInboundAt: "2026-10-22T15:38:00+05:30", replyWindowEndsAt: "2026-10-23T15:38:00+05:30",
  },
  {
    id: "demo-conversation-2", contactId: "demo-customer-3", name: "Neha Verma", phone: "+91 99200 77881", company: "Acme Foods",
    whatsappOptIn: true, doNotContact: false, consentSource: "whatsapp_inbound", consentUpdatedAt: "2026-10-19T09:00:00+05:30",
    lastMessageAt: "2026-10-22T11:10:00+05:30", lastInboundAt: "2026-10-22T11:10:00+05:30", replyWindowEndsAt: "2026-10-23T11:10:00+05:30",
  },
];

export const demoMessagesByConversation: Record<string, WhatsAppMessage[]> = {
  "demo-conversation-1": [
    {
      id: "demo-message-1",
      direction: "inbound",
      kind: "text",
      body: "Hi, can you share pricing for a multi-store support rollout?",
      status: "received",
      errorCode: null,
      createdAt: "2026-10-22T15:38:00+05:30",
    },
    {
      id: "demo-message-2",
      direction: "outbound",
      kind: "template",
      body: "Hi Riya, thanks for reaching out. I’ve shared the rollout options and can walk you through them today.",
      status: "accepted",
      errorCode: null,
      createdAt: "2026-10-22T15:40:00+05:30",
    },
  ],
  "demo-conversation-2": [
    {
      id: "demo-message-3",
      direction: "inbound",
      kind: "text",
      body: "We need to centralise distributor enquiries and payment reminders.",
      status: "received",
      errorCode: null,
      createdAt: "2026-10-22T11:10:00+05:30",
    },
  ],
};

export const demoWhatsAppTemplates: WhatsAppTemplate[] = [
  {
    name: "lead_follow_up",
    language: "en",
    body: "Hi {{1}}, following up on your Janus enquiry for {{2}}.",
    header: "",
    footer: "Reply STOP to opt out.",
    parameterCount: 2,
  },
  {
    name: "proposal_shared",
    language: "en",
    body: "Hi {{1}}, your proposal for {{2}} is ready. Would you like to review it together?",
    header: "",
    footer: "",
    parameterCount: 2,
  },
];

export type DemoTimelineItem = {
  id: string;
  channel: "whatsapp" | "email" | "call";
  direction: "inbound" | "outbound" | "internal";
  title: string;
  body: string;
  status?: string;
  createdAt: string;
};

export const demoConversationTimeline: Record<string, DemoTimelineItem[]> = {
  "demo-conversation-1": [
    {
      id: "timeline-call-1",
      channel: "call",
      direction: "outbound",
      title: "Discovery call logged",
      body: "Riya is evaluating a multi-store support rollout. Follow up with the proposal and implementation timeline.",
      status: "Connected · 12 min",
      createdAt: "2026-10-22T15:20:00+05:30",
    },
    {
      id: "timeline-whatsapp-1",
      channel: "whatsapp",
      direction: "inbound",
      title: "WhatsApp message",
      body: "Hi, can you share pricing for a multi-store support rollout?",
      status: "Received",
      createdAt: "2026-10-22T15:38:00+05:30",
    },
    {
      id: "timeline-email-1",
      channel: "email",
      direction: "outbound",
      title: "Proposal follow-up email",
      body: "Shared the rollout options and asked for a 20-minute review call.",
      status: "Draft saved",
      createdAt: "2026-10-22T15:39:00+05:30",
    },
    {
      id: "timeline-whatsapp-2",
      channel: "whatsapp",
      direction: "outbound",
      title: "WhatsApp template sent",
      body: "Hi Riya, thanks for reaching out. I’ve shared the rollout options and can walk you through them today.",
      status: "Accepted by Meta · Template",
      createdAt: "2026-10-22T15:40:00+05:30",
    },
  ],
  "demo-conversation-2": [
    {
      id: "timeline-call-2",
      channel: "call",
      direction: "outbound",
      title: "Callback requested",
      body: "Neha asked for a follow-up on distributor payment reminders tomorrow morning.",
      status: "Callback requested",
      createdAt: "2026-10-22T10:45:00+05:30",
    },
    {
      id: "timeline-email-2",
      channel: "email",
      direction: "inbound",
      title: "Requirement received by email",
      body: "Please include distributor onboarding and payment reminders in the proposal.",
      status: "Received",
      createdAt: "2026-10-22T11:00:00+05:30",
    },
    {
      id: "timeline-whatsapp-3",
      channel: "whatsapp",
      direction: "inbound",
      title: "WhatsApp message",
      body: "We need to centralise distributor enquiries and payment reminders.",
      status: "Received",
      createdAt: "2026-10-22T11:10:00+05:30",
    },
  ],
};
