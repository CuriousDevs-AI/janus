import { activeCompany } from "@/lib/company";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";

const states: Record<string, string> = { Gurugram: "Haryana", Delhi: "Delhi", Jaipur: "Rajasthan", Bengaluru: "Karnataka", Pune: "Maharashtra", Mumbai: "Maharashtra", Hyderabad: "Telangana", Chennai: "Tamil Nadu", Kolkata: "West Bengal", Ahmedabad: "Gujarat", Noida: "Uttar Pradesh" };

/** The details of the company on show, in the shape the profile, billing and settings pages need. */
export function companyProfile() {
  const record = activeCompany();
  const city = record.city.split(",")[0].trim();
  const state = states[city] ?? "";
  const isAcme = record.id === "acme";
  const name = record.name;
  const short = isAcme ? "Acme Traders" : name;
  const domain = isAcme ? "acmetraders.in" : `${record.id}.example.com`;
  const industry = record.industry;
  const gstin = isAcme ? "06AABCA1234F1Z5" : "";
  const legalName = isAcme ? "Acme Traders Private Limited" : name;
  return {
    name, short, legalName, industry, city, state, domain, gstin,
    pan: gstin.length >= 12 ? gstin.slice(2, 12) : "", cin: isAcme ? "U51909HR2016PTC123456" : "",
    founded: isAcme ? "2016" : record.createdAt.slice(0, 4), size: record.size ?? (isAcme ? "11–50 people" : "1–10 people"),
    website: `https://${domain}`, email: `hello@${domain}`, billingEmail: `accounts@${domain}`,
    phone: isAcme ? "+91 98100 00000" : "", whatsapp: isAcme ? "+91 98100 00001" : "",
    address1: isAcme ? "Plot 14, Udyog Vihar Phase 4" : "", address2: isAcme ? "Near Sector 18 Metro" : "", pin: isAcme ? "122015" : "",
    description: isAcme ? "Distributor of packaged food, household and personal-care goods to retailers and institutions across Delhi NCR and Rajasthan." : `${name} is a ${industry.toLowerCase()} business based in ${city}.`,
    address: isAcme ? "Plot 14, Udyog Vihar Phase 4, Gurugram, Haryana 122015" : [city, state].filter(Boolean).join(", "),
    locations: isAcme
      ? [{ id: 1, name: "Head office", kind: "Office", address: "Udyog Vihar Phase 4, Gurugram, Haryana", gst: "" }, { id: 2, name: "Jaipur warehouse", kind: "Warehouse", address: "Sitapura Industrial Area, Jaipur, Rajasthan", gst: "Own GSTIN" }]
      : [{ id: 1, name: "Head office", kind: "Office", address: [city, state].filter(Boolean).join(", "), gst: "" }],
  };
}

/** How many people the company has, for the settings pages. Read inside a component. */
export function usePeopleCount() {
  return useHrPeopleStore((state) => state.employees.filter((item) => item.status !== "archived").length);
}
