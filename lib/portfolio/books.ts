import type { HrEmployee, HrExpenseClaim, HrLeaveRequest } from "@/lib/types";
import type { Deal, Lead } from "@/lib/api/types";
import { scoped, type CompanyRecord } from "@/lib/company";
import { specForRecord } from "@/lib/companies";
import type { CompanySpec } from "@/lib/companies/spec";
import { buildDealRows, buildLeadRows } from "@/lib/demo-universe";
import { acme_hrExpenseClaims, acme_hrLeaveRequests, acmeEmployees } from "@/lib/mock-data/hr-people";
import { firstCompanyFinanceSeed, type BankEntry, type Bill, type BudgetLine, type BudgetPlan, type CreditNote, type Expense, type FundRequest, type Invoice, type PettyCashTopUp } from "@/lib/stores/finance-store";
import type { TrailEntry } from "@/lib/stores/audit-trail";

/**
 * One company's records, read for the Portfolio exactly as that company's own screens would read them:
 * what it has saved in this browser, otherwise its starting records. Nothing here is invented, and no
 * record ever crosses from one company to another. A workspace that is switched off contributes nothing.
 */

export type EntityType = "Private Limited" | "Public Limited" | "LLP" | "Partnership" | "Proprietorship" | "One Person Company";
export const ENTITY_TYPES: EntityType[] = ["Private Limited", "Public Limited", "One Person Company", "LLP", "Partnership", "Proprietorship"];
export type CompanyStatus = "active" | "setup" | "dormant" | "divested";
export const STATUS_LABEL: Record<CompanyStatus, string> = { active: "Operating", setup: "Setting up", dormant: "Dormant", divested: "Divested" };

/** Registration details. Blank means not recorded yet, which Compliance reports as missing. */
export interface LegalProfile {
  legalName: string;
  entityType: EntityType | "";
  cin: string;
  pan: string;
  tan: string;
  gstin: string;
  state: string;
  incorporatedOn: string;
  pfCode: string;
  esiCode: string;
  registeredAddress: string;
}
export interface Leader { name: string; role: string; email: string }

export interface FinanceBook {
  invoices: Invoice[]; creditNotes: CreditNote[]; bills: Bill[]; expenses: Expense[]; bankEntries: BankEntry[]; openingCash: number;
  budgetLines: BudgetLine[]; plans: BudgetPlan[]; fundRequests: FundRequest[]; pettyCashTopUps: PettyCashTopUp[]; trail: TrailEntry[];
}

export interface CompanyBook {
  record: CompanyRecord;
  spec: CompanySpec;
  status: CompanyStatus;
  on: { crm: boolean; hr: boolean; finance: boolean };
  leads: Lead[];
  deals: Deal[];
  employees: HrEmployee[];
  leave: HrLeaveRequest[];
  claims: HrExpenseClaim[];
  /** Null when Finance & Accounting is switched off: the Portfolio then has no ledger for this company. */
  finance: FinanceBook | null;
  legal: LegalProfile;
  leadership: Leader[];
  businessModel: string;
}

function saved<T>(key: string, id: string): Partial<T> | null {
  try {
    const raw = window.localStorage.getItem(scoped(key, id));
    return raw ? (JSON.parse(raw).state as Partial<T>) : null;
  } catch { return null; }
}

/** GSTIN state codes for the states the companies run in. The first two digits of a GSTIN name the state. */
const GST_STATES: Record<string, string> = { "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", "19": "West Bengal", "24": "Gujarat", "27": "Maharashtra", "29": "Karnataka", "33": "Tamil Nadu", "36": "Telangana" };
const CITY_STATES: Record<string, string> = { gurugram: "Haryana", delhi: "Delhi", jaipur: "Rajasthan", bengaluru: "Karnataka", pune: "Maharashtra", mumbai: "Maharashtra", hyderabad: "Telangana", chennai: "Tamil Nadu", kolkata: "West Bengal", ahmedabad: "Gujarat", noida: "Uttar Pradesh" };
export const INDIAN_STATES = [...new Set([...Object.values(GST_STATES), ...Object.values(CITY_STATES)])].sort();

/** What the records already say about registration. Only facts the records hold are filled in. */
export function legalFor(record: CompanyRecord, spec: CompanySpec): LegalProfile {
  const gstin = spec.company.gstin ?? "";
  const cityState = CITY_STATES[record.city.split(",")[0].trim().toLowerCase()] ?? "";
  const derived: LegalProfile = {
    legalName: record.id === "acme" ? "Acme Traders Private Limited" : "",
    entityType: /\b(pvt|private)\b/i.test(record.name) ? "Private Limited" : /\bllp\b/i.test(record.name) ? "LLP" : "",
    cin: record.id === "acme" ? "U51909HR2016PTC123456" : "",
    pan: gstin.length >= 12 ? gstin.slice(2, 12) : "",
    tan: "",
    gstin,
    state: GST_STATES[gstin.slice(0, 2)] ?? cityState,
    incorporatedOn: record.id === "acme" ? "2016-06-14" : "",
    pfCode: "",
    esiCode: "",
    registeredAddress: record.id === "acme" ? "Plot 14, Udyog Vihar Phase 4, Gurugram, Haryana 122015" : "",
  };
  // What the owner typed in wins over what was derived, including a deliberate blank.
  return { ...derived, ...(record.legal ?? {}) };
}

const ws = (record: CompanyRecord, id: string) => record.workspaces.includes(id);

export function readBook(record: CompanyRecord): CompanyBook {
  const spec = specForRecord(record);
  const on = { crm: ws(record, "crm-sales"), hr: ws(record, "hr-people"), finance: ws(record, "finance-accounting") };
  const crm = saved<{ leads: Lead[]; deals: Deal[] }>("janus.demo-crm.v2", record.id);
  const seedLeads = buildLeadRows(spec);
  const leads = on.crm ? crm?.leads ?? seedLeads : [];
  const deals = on.crm ? crm?.deals ?? buildDealRows(spec, seedLeads) : [];
  const hr = saved<{ employees: HrEmployee[]; leaveRequests: HrLeaveRequest[]; expenseClaims: HrExpenseClaim[] }>("janus.hr-people-demo", record.id);
  const first = record.id === "acme";
  const employees = (hr?.employees ?? (first ? acmeEmployees : spec.employees ?? [])).filter((item) => item.status !== "archived");
  const leave = hr?.leaveRequests ?? (first ? acme_hrLeaveRequests : []);
  const claims = hr?.expenseClaims ?? (first ? acme_hrExpenseClaims : []);
  let finance: FinanceBook | null = null;
  if (on.finance) {
    const stored = saved<FinanceBook>("janus.finance.v1", record.id);
    const seed = first ? firstCompanyFinanceSeed() : null;
    const pick = <K extends keyof FinanceBook>(key: K, empty: FinanceBook[K]): FinanceBook[K] => (stored?.[key] ?? (seed as Partial<FinanceBook> | null)?.[key] ?? empty) as FinanceBook[K];
    finance = {
      invoices: pick("invoices", []), creditNotes: pick("creditNotes", []), bills: pick("bills", []), expenses: pick("expenses", []), bankEntries: pick("bankEntries", []),
      openingCash: pick("openingCash", 0), budgetLines: pick("budgetLines", []), plans: pick("plans", []), fundRequests: pick("fundRequests", []), pettyCashTopUps: pick("pettyCashTopUps", []), trail: pick("trail", []),
    };
  }
  return {
    record, spec, on, leads, deals, employees, leave, claims, finance,
    status: record.status ?? (record.setupDone ? "active" : "setup"),
    legal: legalFor(record, spec),
    leadership: record.leadership ?? [{ name: "Pankaj Neema", role: "Owner & Director", email: spec.accounts?.[0]?.email ?? "" }],
    businessModel: record.businessModel ?? "",
  };
}
