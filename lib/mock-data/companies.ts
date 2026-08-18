import type { Company } from "@/lib/types";

export const companies: Company[] = [
  { id: "co-1", name: "ABC Technologies", domain: "abctechnologies.com", industry: "SaaS", size: "200-500", location: "Bengaluru, IN", logoLetter: "A" },
  { id: "co-2", name: "Nova Systems", domain: "novasystems.io", industry: "Cloud Infrastructure", size: "50-200", location: "Pune, IN", logoLetter: "N" },
  { id: "co-3", name: "Acme Labs", domain: "acmelabs.co", industry: "Biotech", size: "11-50", location: "Hyderabad, IN", logoLetter: "AL" },
  { id: "co-4", name: "Vertex AI", domain: "vertex-ai.com", industry: "Artificial Intelligence", size: "50-200", location: "San Francisco, US", logoLetter: "V" },
  { id: "co-5", name: "Orbit Systems", domain: "orbitsystems.com", industry: "Aerospace", size: "500-1000", location: "Toulouse, FR", logoLetter: "O" },
  { id: "co-6", name: "Zenith Cloud", domain: "zenithcloud.com", industry: "Cloud Infrastructure", size: "200-500", location: "Singapore", logoLetter: "Z" },
  { id: "co-7", name: "Lumen Robotics", domain: "lumenrobotics.ai", industry: "Robotics", size: "50-200", location: "Munich, DE", logoLetter: "L" },
  { id: "co-8", name: "Bluewave Retail", domain: "bluewaveretail.com", industry: "E-commerce", size: "500-1000", location: "Mumbai, IN", logoLetter: "B" },
  { id: "co-9", name: "Northstar Logistics", domain: "northstarlogistics.com", industry: "Logistics", size: "1000+", location: "Chicago, US", logoLetter: "NS" },
  { id: "co-10", name: "Solace Health", domain: "solacehealth.io", industry: "Healthtech", size: "200-500", location: "Boston, US", logoLetter: "SH" },
  { id: "co-11", name: "Quanta Finance", domain: "quantafinance.com", industry: "Fintech", size: "200-500", location: "Gurugram, IN", logoLetter: "QF" },
  { id: "co-12", name: "Meridian Analytics", domain: "meridiananalytics.com", industry: "Data & Analytics", size: "50-200", location: "London, UK", logoLetter: "M" },
  { id: "co-13", name: "Crestline Manufacturing", domain: "crestlinemfg.com", industry: "Manufacturing", size: "1000+", location: "Detroit, US", logoLetter: "C" },
  { id: "co-14", name: "Aster Biotech", domain: "asterbiotech.com", industry: "Biotech", size: "50-200", location: "Basel, CH", logoLetter: "AB" },
  { id: "co-15", name: "Fenwick Digital", domain: "fenwickdigital.com", industry: "Marketing Tech", size: "11-50", location: "Delhi, IN", logoLetter: "F" },
  { id: "co-16", name: "Anchorpoint Systems", domain: "anchorpointsystems.com", industry: "Cybersecurity", size: "200-500", location: "Tel Aviv, IL", logoLetter: "AP" },
  { id: "co-17", name: "Brightline Media", domain: "brightlinemedia.com", industry: "Media & Entertainment", size: "50-200", location: "Los Angeles, US", logoLetter: "BM" },
  { id: "co-18", name: "Cobalt Freight", domain: "cobaltfreight.com", industry: "Logistics", size: "500-1000", location: "Rotterdam, NL", logoLetter: "CF" },
  { id: "co-19", name: "Everline Insurance", domain: "everlineinsurance.com", industry: "Insurance", size: "1000+", location: "Mumbai, IN", logoLetter: "E" },
  { id: "co-20", name: "Granite Payments", domain: "granitepayments.com", industry: "Fintech", size: "200-500", location: "Bengaluru, IN", logoLetter: "GP" },
  { id: "co-21", name: "Kestrel Aerospace", domain: "kestrelaerospace.com", industry: "Aerospace", size: "500-1000", location: "Seattle, US", logoLetter: "K" },
  { id: "co-22", name: "Driftwood Hospitality", domain: "driftwoodhospitality.com", industry: "Hospitality", size: "200-500", location: "Goa, IN", logoLetter: "DH" },
  { id: "co-23", name: "Junction Mobility", domain: "junctionmobility.com", industry: "Mobility", size: "50-200", location: "Amsterdam, NL", logoLetter: "JM" },
  { id: "co-24", name: "Fathom Analytics Labs", domain: "fathomlabs.io", industry: "Data & Analytics", size: "11-50", location: "Toronto, CA", logoLetter: "FA" },
  { id: "co-25", name: "Meadowline Foods", domain: "meadowlinefoods.com", industry: "Food & Beverage", size: "200-500", location: "Ahmedabad, IN", logoLetter: "MF" },
];

export function getCompanyById(id?: string): Company | undefined {
  if (!id) return undefined;
  return companies.find((c) => c.id === id);
}
