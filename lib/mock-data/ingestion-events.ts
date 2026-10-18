import type { IngestionEvent } from "@/lib/types";

// Sample events for the three connected demo sources. Historical/manual leads
// do not imply a currently connected integration.
export const ingestionEvents: IngestionEvent[] = [
  { id: "ing-1", sourceId: "ls-website", source: "website", receivedAt: "2025-11-02T09:12:00+05:30", rawPreview: '{"event":"form_submit","page":"/enterprise","email":"rahul.sharma@abctechnologies.com"}', result: "new_profile", customerId: "cus-1", leadId: "lead-1", reason: "No existing profile matched this email — created Rahul Sharma / ABC Technologies." },
  { id: "ing-2", sourceId: "ls-website", source: "website", receivedAt: "2026-08-09T10:32:00+05:30", rawPreview: '{"event":"chat_started","page":"/pricing","message":"I want pricing for the enterprise tier."}', result: "merged", customerId: "cus-1", leadId: "lead-1b", reason: "Matched existing profile by email (rahul.sharma@abctechnologies.com) — appended to Rahul Sharma's timeline instead of creating a duplicate." },
  { id: "ing-6", sourceId: "ls-website", source: "website", receivedAt: "2026-08-15T16:22:00+05:30", rawPreview: '{"event":"form_submit","page":"/demo","email":"arjun.desai@acmelabs.co"}', result: "new_profile", customerId: "cus-5", leadId: "lead-5", reason: "No existing profile matched this email — created Arjun Desai / Acme Labs." },
  { id: "ing-13", sourceId: "ls-website", source: "website", receivedAt: "2025-06-14T11:00:00+01:00", rawPreview: '{"event":"form_submit","page":"/contact","email":"tanvi.shah@meridiananalytics.com"}', result: "new_profile", customerId: "cus-12", leadId: "lead-12", reason: "No existing profile matched — created Tanvi Shah / Meridian Analytics." },
  { id: "ing-16", sourceId: "ls-website", source: "website", receivedAt: "2026-07-02T09:00:00+05:30", rawPreview: '{"event":"form_submit","page":"/pricing","email":"yash.trivedi@fenwickdigital.com"}', result: "new_profile", customerId: "cus-15", leadId: "lead-15", reason: "No existing profile matched — created Yash Trivedi / Fenwick Digital." },
  { id: "ing-25", sourceId: "ls-website", source: "website", receivedAt: "2025-04-17T09:00:00-04:00", rawPreview: '{"event":"form_submit","page":"/enterprise","email":"olivia.turner@fathomlabs.io"}', result: "new_profile", customerId: "cus-24", leadId: "lead-24", reason: "No existing profile matched — created Olivia Turner / Fathom Analytics Labs." },
  { id: "ing-28", sourceId: "ls-website", source: "website", receivedAt: "2026-08-17T11:20:00+05:30", rawPreview: '{"event":"form_submit","page":"/pricing","email":"rahul.sharma@abctechnologies.com"}', result: "duplicate_ignored", customerId: "cus-1", reason: "Duplicate form submission within 5 minutes of the previous event — ignored, no new activity created." },
  { id: "ing-30", sourceId: "ls-whatsapp", source: "whatsapp", receivedAt: "2026-08-17T09:40:00+05:30", rawPreview: '{"from":"+91 98111 22034","type":"text","text":"Hi, do you support multi-location retail chains?"}', result: "new_profile", reason: "No existing profile matched this number — new lead created, pending qualification." },
  { id: "ing-31", sourceId: "ls-whatsapp", source: "whatsapp", receivedAt: "2026-08-16T19:05:00+05:30", rawPreview: '{"from":"+91 90210 88213","type":"text","text":"Saw your Instagram post, can you share pricing?"}', result: "new_profile", reason: "No existing profile matched this number — new lead created, pending qualification." },
  { id: "ing-32", sourceId: "ls-whatsapp", source: "whatsapp", receivedAt: "2026-08-15T12:10:00+05:30", rawPreview: '{"from":"+91 98200 45501","type":"text","text":"Hey"}', result: "duplicate_ignored", reason: "Number already has an open conversation from earlier today — appended to the existing thread instead of creating a second lead." },
  { id: "ing-call-1", sourceId: "ls-phone_call", source: "phone_call", receivedAt: "2026-08-17T14:10:00+05:30", rawPreview: '{"event":"missed_call","from":"+91 98111 22035","provider":"exotel"}', result: "new_profile", reason: "New caller number — sample lead captured through Custom Webhook. No recording provided." },
  { id: "ing-call-2", sourceId: "ls-phone_call", source: "phone_call", receivedAt: "2026-08-17T13:05:00+05:30", rawPreview: '{"event":"call_completed","from":"+91 98111 22036","recording_url":"https://recordings.example/call-2.mp3"}', result: "new_profile", reason: "New caller number — sample lead with the provider recording attached." },
];

export function getEventsForSource(sourceId: string): IngestionEvent[] {
  return ingestionEvents
    .filter((event) => event.sourceId === sourceId)
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}
