/**
 * Which company the app is showing. The Owner can run several companies from one login; each has its
 * own people, records and settings, kept apart in the browser exactly as the backend keeps tenants apart.
 */
export interface CompanyRecord {
  id: string;
  name: string;
  industry: string;
  city: string;
  /** Which sample dataset fills a new company. "blank" starts empty. */
  template: "acme" | "nimbus" | "greenleaf" | "blank";
  /** Workspaces switched on for this company. */
  workspaces: string[];
  setupDone: boolean;
  size?: string;
  timezone?: string;
  /** People added while setting the company up. They become its first employees. */
  team?: { name: string; email: string; title: string; department: string }[];
  createdAt: string;
}

const REGISTRY_KEY = "janus.companies";
const ACTIVE_KEY = "janus.company-active";
const EVENT = "janus:company";

export const seedCompanies: CompanyRecord[] = [
  { id: "acme", name: "Acme Traders Pvt Ltd", industry: "FMCG & household goods distribution", city: "Gurugram", template: "acme", workspaces: ["crm-sales", "hr-people"], setupDone: true, createdAt: "2025-04-01" },
  { id: "nimbus", name: "Nimbus Digital Studio", industry: "Digital marketing and web agency", city: "Bengaluru", template: "nimbus", workspaces: ["crm-sales", "hr-people"], setupDone: true, createdAt: "2026-02-10" },
  { id: "greenleaf", name: "GreenLeaf Organics", industry: "Organic grocery retail", city: "Pune", template: "greenleaf", workspaces: ["hr-people"], setupDone: false, createdAt: "2026-10-12" },
];

function read(key: string) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
export function readCompanies(): CompanyRecord[] {
  if (typeof window === "undefined") return seedCompanies;
  try {
    // An empty list is a real state (every company removed). Only a missing key means "first visit".
    const stored = JSON.parse(read(REGISTRY_KEY) ?? "null") as CompanyRecord[] | null;
    return stored ?? seedCompanies;
  } catch { return seedCompanies; }
}
export function saveCompanies(list: CompanyRecord[]) {
  try { window.localStorage.setItem(REGISTRY_KEY, JSON.stringify(list)); } catch { /* private mode */ }
  window.dispatchEvent(new Event(EVENT));
}

/** The id read once when the page loads. Switching reloads the page so every store starts from the right company. */
export function activeCompanyId(): string {
  if (typeof window === "undefined") return "acme";
  const stored = read(ACTIVE_KEY);
  const list = readCompanies();
  // With nothing chosen (or the chosen company gone) fall back to the first company, so data-reading code always has one.
  return stored && list.some((item) => item.id === stored) ? stored : list[0]?.id ?? "acme";
}
export const activeCompany = (): CompanyRecord => readCompanies().find((item) => item.id === activeCompanyId()) ?? seedCompanies[0];

export function switchCompany(id: string, to = businessHome) {
  try { window.localStorage.setItem(ACTIVE_KEY, id); } catch { /* private mode */ }
  window.location.assign(to);
}

/** A storage key for the active company. The first company keeps its original keys, so nothing saved earlier is lost. */
export function scoped(key: string, company = activeCompanyId()) {
  return company === "acme" ? key : `${key}.${company}`;
}
export function subscribeCompanies(listener: () => void) {
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", listener);
  return () => { window.removeEventListener(EVENT, listener); window.removeEventListener("storage", listener); };
}

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "company";
/** A short unique id from the name, so two companies never share saved data. */
export function newCompanyId(name: string, existing: CompanyRecord[]) {
  let id = slug(name);
  let n = 2;
  while (existing.some((item) => item.id === id) || ["acme", "nimbus", "greenleaf"].includes(id)) id = `${slug(name)}-${n++}`;
  return id;
}
export function updateCompany(id: string, patch: Partial<CompanyRecord>) {
  saveCompanies(readCompanies().map((item) => item.id === id ? { ...item, ...patch } : item));
}
export function addCompany(record: CompanyRecord) {
  saveCompanies([...readCompanies(), record]);
}

/** Take a company out of the account. Its saved records stay in the browser but are no longer reachable. */
export function removeCompany(id: string) {
  saveCompanies(readCompanies().filter((item) => item.id !== id));
  try { if (read(ACTIVE_KEY) === id) window.localStorage.removeItem(ACTIVE_KEY); } catch { /* private mode */ }
}
/** Where the Owner lands after signing in. */
export const portfolioHome = "/portfolio?view=overview";
/** Business Management for the company on show. */
export const businessHome = "/settings?tab=workspace&view=overview&workspace=business";
