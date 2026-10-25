import { activeSpec, isFirstCompany } from "@/lib/companies";
import { activeCompany } from "@/lib/company";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";

const states: Record<string, string> = { Gurugram: "Haryana", Delhi: "Delhi", Jaipur: "Rajasthan", Bengaluru: "Karnataka", Pune: "Maharashtra", Mumbai: "Maharashtra", Hyderabad: "Telangana", Chennai: "Tamil Nadu", Kolkata: "West Bengal", Ahmedabad: "Gujarat", Noida: "Uttar Pradesh" };

/** The details of the company on show, in the shape the profile, billing and settings pages need. */
export function companyProfile() {
  const spec = activeSpec.company;
  const record = activeCompany();
  const city = (spec.city || record.city).split(",")[0].trim();
  const state = states[city] ?? "";
  const first = isFirstCompany;
  const legalName = first ? "Acme Traders Private Limited" : spec.name;
  const gstin = spec.gstin || "";
  return {
    name: spec.name, short: spec.short, legalName, industry: spec.industry, city, state, domain: spec.domain, gstin,
    pan: gstin.length >= 12 ? gstin.slice(2, 12) : "", cin: first ? "U51909HR2016PTC123456" : "",
    founded: first ? "2016" : record.createdAt.slice(0, 4), size: record.size ?? (first ? "11–50 people" : "1–10 people"),
    website: `https://${spec.domain}`, email: `hello@${spec.domain}`, billingEmail: `accounts@${spec.domain}`,
    phone: first ? "+91 98100 00000" : "", whatsapp: first ? "+91 98100 00001" : "",
    address1: first ? "Plot 14, Udyog Vihar Phase 4" : "", address2: first ? "Near Sector 18 Metro" : "", pin: first ? "122015" : "",
    description: first ? "Distributor of packaged food, household and personal-care goods to retailers and institutions across Delhi NCR and Rajasthan." : `${spec.name} is a ${spec.industry.toLowerCase()} business based in ${city}.`,
    address: first ? "Plot 14, Udyog Vihar Phase 4, Gurugram, Haryana 122015" : [city, state].filter(Boolean).join(", "),
    locations: first
      ? [{ id: 1, name: "Head office", kind: "Office", address: "Udyog Vihar Phase 4, Gurugram, Haryana", gst: "" }, { id: 2, name: "Jaipur warehouse", kind: "Warehouse", address: "Sitapura Industrial Area, Jaipur, Rajasthan", gst: "Own GSTIN" }]
      : [{ id: 1, name: "Head office", kind: "Office", address: [city, state].filter(Boolean).join(", "), gst: "" }],
  };
}

/** How many people the company has, for the settings pages. Read inside a component. */
export function usePeopleCount() {
  return useHrPeopleStore((state) => state.employees.filter((item) => item.status !== "archived").length);
}
