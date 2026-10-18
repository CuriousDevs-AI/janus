// Run with Node 22.18+: node scripts/check-lead-sources.mjs
import assert from "node:assert/strict";
import { leadSourceConnections as sources, getLeadSourceHref, webhookPresets } from "../lib/mock-data/lead-sources.ts";
import { leads } from "../lib/mock-data/leads.ts";
import { customers } from "../lib/mock-data/customers.ts";
import { ingestionEvents } from "../lib/mock-data/ingestion-events.ts";

const live = sources.filter((source) => source.status !== "coming_soon");
const soon = sources.filter((source) => source.status === "coming_soon");
assert.deepEqual(live.map((source) => source.source).sort(), ["api", "csv_import", "phone_call", "webhook", "website", "whatsapp"]);
assert.deepEqual(soon.map((source) => source.source).sort(), ["indiamart", "meta_lead_ads"]);
assert.deepEqual(sources.filter((source) => source.status === "connected").map((source) => source.source).sort(), ["phone_call", "website", "whatsapp"]);
assert(soon.every((source) => source.leadsCaptured30d === undefined && source.lastEventAt === undefined));
assert(sources.filter((source) => ["webhook", "api", "csv_import"].includes(source.source)).every((source) => source.status === "available"));
const call = sources.find((source) => source.source === "phone_call");
const webhook = sources.find((source) => source.source === "webhook");
assert.equal(call.connectionKind, "webhook");
assert.equal(call.webhookUrl, webhook.webhookUrl);
assert.equal(call.signingSecret, webhook.signingSecret);
for (const preset of webhookPresets.filter((preset) => preset.group === "Calls" || preset.value === "custom")) {
  const url = new URL(getLeadSourceHref(call, preset.value), "https://janus.example");
  assert.equal(url.pathname, "/lead-sources/ls-webhook");
  assert.equal(url.searchParams.get("presets"), "calls");
  assert.equal(url.searchParams.get("preset"), preset.value);
}
assert.equal(webhookPresets.length, 8);
assert.equal(sources.find((source) => source.source === "indiamart").syncInterval, "5m");
const allowed = new Set([...sources.map((source) => source.source), "manual", "referral"]);
assert([...leads, ...customers].every((record) => allowed.has(record.source)));
assert(ingestionEvents.every((event) => sources.some((source) => source.id === event.sourceId && source.source === event.source && source.status === "connected")));
for (const id of ["cus-4", "cus-6", "cus-11", "cus-16", "cus-17", "cus-23", "cus-25"]) {
  assert.equal(customers.find((customer) => customer.id === id).source, "manual");
  assert(leads.filter((lead) => lead.customerId === id).every((lead) => lead.source === "manual"));
}
for (const id of ["cus-2", "cus-14", "cus-22"]) {
  assert.equal(customers.find((customer) => customer.id === id).source, "meta_lead_ads");
  assert(leads.filter((lead) => lead.customerId === id).every((lead) => lead.source === "meta_lead_ads"));
}
console.log("Lead source checks passed: 6 live cards, 2 coming soon, shared call webhook, migrated records.");
