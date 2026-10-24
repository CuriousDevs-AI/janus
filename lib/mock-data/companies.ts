import type { Company } from "@/lib/types";
import { buyers } from "@/lib/demo-universe";

const sizes = ["11-50", "11-50", "50-200", "1-10", "50-200", "50-200", "50-200", "50-200", "200-500", "50-200", "50-200", "1-10", "50-200", "11-50"];
const states: Record<string, string> = { Delhi: "Delhi", Gurugram: "Haryana", Jaipur: "Rajasthan", Alwar: "Rajasthan", Noida: "Uttar Pradesh", Udaipur: "Rajasthan", Faridabad: "Haryana", Jodhpur: "Rajasthan", Rewari: "Haryana", Kota: "Rajasthan" };

/** Acme Traders' trade customers, from the shared demo company. */
export const companies: Company[] = buyers.map((buyer, index) => ({
  id: `co-${index + 1}`, name: buyer.company, domain: buyer.email.split("@")[1], industry: buyer.kind, size: sizes[index], location: `${buyer.city}, ${states[buyer.city] ?? "India"}`,
  logoLetter: buyer.company.split(" ").slice(0, 2).map((word) => word[0]).join("").toUpperCase(),
}));

export function getCompanyById(id?: string): Company | undefined {
  if (!id) return undefined;
  return companies.find((c) => c.id === id);
}
