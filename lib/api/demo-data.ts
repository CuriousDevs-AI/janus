import type { Source, WhatsAppTemplate } from "./types";
import { company, conversations, countBySource, dealRows, lastBySource, leadRows, messagesByConversation } from "@/lib/demo-universe";

/** Demo-only records used to keep the CRM reviewable when the API is offline. They all come from one made-up company in lib/demo-universe.ts. */
export const demoLeadRows = leadRows;

export const demoDealRows = dealRows;

export const demoConnectedSources: Pick<Source, "status">[] = [
  { status: "connected" },
  { status: "connected" },
  { status: "connected" },
];

export const demoSourceRows: Source[] = [
  {
    id: "src-website", name: "Website Form & Chat Widget", description: "Embedded website enquiries", connectionKind: "embed", source: "website", status: "connected", preset: "website", fieldMapping: [], ingestUrl: "https://ingest.janus.example/forms/demo-website", webhookUrl: null, allowedOrigins: [`https://${company.domain}`], eventIdField: null, lastEventAt: lastBySource("website"), capturedLeads: countBySource("website"),
  },
  {
    id: "src-whatsapp", name: "WhatsApp Business", description: "Meta Cloud API conversations", connectionKind: "oauth", source: "whatsapp", status: "connected", preset: "meta_cloud_api", fieldMapping: [], ingestUrl: "", webhookUrl: "https://ingest.janus.example/hooks/whatsapp/demo", allowedOrigins: [], eventIdField: null, lastEventAt: lastBySource("whatsapp"), capturedLeads: countBySource("whatsapp"),
  },
  {
    id: "src-phone", name: "Phone Calls & Missed Calls", description: "Exotel call webhook with recording capture", connectionKind: "webhook", source: "phone_call", status: "connected", preset: "exotel", fieldMapping: [{ rawField: "caller_number", mapsTo: "phone" }], ingestUrl: "https://ingest.janus.example/hooks/demo-phone", webhookUrl: "https://ingest.janus.example/hooks/demo-phone", allowedOrigins: [], eventIdField: "call_id", lastEventAt: lastBySource("phone_call"), capturedLeads: countBySource("phone_call"),
  },
  {
    id: "src-webhook", name: "Custom Webhook", description: "Google Ads, Zapier, Make or custom form events", connectionKind: "webhook", source: "webhook", status: "available", preset: "google_ads_lead_form", fieldMapping: [], ingestUrl: "https://ingest.janus.example/hooks/demo-custom", webhookUrl: "https://ingest.janus.example/hooks/demo-custom", allowedOrigins: [], eventIdField: null, lastEventAt: null, capturedLeads: 0,
  },
  {
    id: "src-api", name: "REST API", description: "Scoped lead creation API key", connectionKind: "api_key", source: "api", status: "available", preset: "lead_create", fieldMapping: [], ingestUrl: "https://api.janus.example/v1/leads", webhookUrl: null, allowedOrigins: [], eventIdField: null, lastEventAt: null, capturedLeads: 0,
  },
  {
    id: "src-csv", name: "CSV Import", description: "One-off bulk import", connectionKind: "csv", source: "csv_import", status: "available", preset: "csv", fieldMapping: [], ingestUrl: "", webhookUrl: null, allowedOrigins: [], eventIdField: null, lastEventAt: null, capturedLeads: 0,
  },
];

export const demoConversations = conversations;

export const demoMessagesByConversation = messagesByConversation;

export const demoWhatsAppTemplates: WhatsAppTemplate[] = [
  {
    name: "lead_follow_up",
    language: "en",
    body: "Hi {{1}}, following up on your enquiry with Acme Traders about {{2}}.",
    header: "",
    footer: "Reply STOP to opt out.",
    parameterCount: 2,
  },
  {
    name: "proposal_shared",
    language: "en",
    body: "Hi {{1}}, our rate proposal for {{2}} is ready. Shall we go through it together?",
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

export const demoConversationTimeline: Record<string, DemoTimelineItem[]> = Object.fromEntries(conversations.map((conversation, index) => {
  const lead = leadRows.find((item) => item.customerId === conversation.contactId && item.source === "whatsapp")!;
  const messages = messagesByConversation[conversation.id];
  const at = new Date(lead.lastActivityAt).getTime();
  const stamp = (offsetMinutes: number) => new Date(at + offsetMinutes * 60000).toISOString().replace("Z", "+00:00");
  return [conversation.id, [
    { id: `timeline-call-${index + 1}`, channel: "call" as const, direction: "outbound" as const, title: "Requirement call logged", body: `${lead.ownerName} spoke to ${lead.contactName} at ${lead.company}. ${lead.requirement}`, status: "Connected · 9 min", createdAt: stamp(-40) },
    { id: `timeline-whatsapp-${index + 1}`, channel: "whatsapp" as const, direction: "inbound" as const, title: "WhatsApp message", body: messages[0].body, status: "Received", createdAt: messages[0].createdAt },
    ...(messages[1] ? [{ id: `timeline-whatsapp-reply-${index + 1}`, channel: "whatsapp" as const, direction: "outbound" as const, title: "WhatsApp template sent", body: messages[1].body, status: "Accepted by Meta · Template", createdAt: messages[1].createdAt }] : [{ id: `timeline-email-${index + 1}`, channel: "email" as const, direction: "outbound" as const, title: "Rate card emailed", body: `Shared the current rate card and delivery schedule for ${lead.company}.`, status: "Draft saved", createdAt: stamp(15) }]),
  ]];
}));
