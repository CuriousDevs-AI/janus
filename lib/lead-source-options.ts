import { Building2, FileSpreadsheet, Globe, Key, MessageCircle, Phone, Users, Webhook, type LucideIcon } from "lucide-react";

/** The kinds of lead source Janus connects today, each with where it is set up. */
export const sourceOptions: readonly (readonly [name: string, description: string, icon: LucideIcon, href: string])[] = [
  ["Website Form & Chat Widget", "Add a form to your website and capture enquiries automatically.", Globe, "/lead-sources/new?kind=embed"],
  ["WhatsApp Business", "Connect Meta Cloud API for follow-ups and replies.", MessageCircle, "/lead-sources/whatsapp"],
  ["Custom Webhook", "Receive leads from forms, ads, Zapier, Make or your own tools.", Webhook, "/lead-sources/new?kind=webhook&preset=custom"],
  ["Phone Calls & Missed Calls", "Turn new caller numbers into leads with recordings attached.", Phone, "/lead-sources/new?kind=webhook&preset=exotel&calls=1"],
  ["REST API", "Create leads from your own product with a scoped API key.", Key, "/lead-sources/new?kind=api_key"],
  ["CSV Import", "Import a one-off list of leads with contact matching.", FileSpreadsheet, "/lead-sources/new?kind=csv"],
];

/** Sources Janus does not connect yet: shown as such, never as connectable. */
export const comingSoonSources: readonly (readonly [name: string, description: string, icon: LucideIcon])[] = [
  ["Meta Lead Ads", "Facebook and Instagram Instant Forms in one connection.", Users],
  ["IndiaMART", "Pull enquiries using the seller's CRM API key.", Building2],
];
