import type { CompanyBook } from "@/lib/portfolio/books";
import { addDays, fyLabel } from "@/lib/portfolio/period";
import type { ComplianceState } from "@/lib/portfolio/state";
import { todayIso } from "@/lib/today";

/**
 * The statutory calendar for each company, worked out from what the company is (entity type, state, GST and
 * payroll registrations, headcount). These are the standard due dates under Indian law; government extensions
 * are not tracked, and Janus has no link to the GST, TRACES, EPFO, ESIC or MCA portals. So a filing counts as
 * done only when a person records it, and a past date with no record is "not confirmed", never assumed filed.
 */

export type ComplianceCategory = "GST" | "TDS" | "Payroll statutory" | "Income tax" | "Company law";
export type ComplianceStatus = "filed" | "unconfirmed" | "due-soon" | "upcoming";
export const STATUS_TEXT: Record<ComplianceStatus, string> = { filed: "Filed", unconfirmed: "Past due · not confirmed", "due-soon": "Due soon", upcoming: "Upcoming" };

export interface Obligation {
  key: string; companyId: string; ruleId: string; title: string; form: string; authority: string; category: ComplianceCategory;
  period: string; due: string; frequency: "Monthly" | "Quarterly" | "Half-yearly" | "Yearly"; why: string; note?: string;
  status: ComplianceStatus; owner: string; filedOn?: string; reference?: string; blockedBy?: string;
}
export interface MissingItem { companyId: string; field: string; why: string; severity: "high" | "medium" }

const pad = (n: number) => String(n).padStart(2, "0");
const monthName = (year: number, month: number) => new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
/** A date in the month after (year, month). */
const nextMonthOn = (year: number, month: number, day: number | "last") => { const y = month === 12 ? year + 1 : year; const m = month === 12 ? 1 : month + 1; return `${y}-${pad(m)}-${pad(day === "last" ? lastDay(y, m) : day)}`; };

interface Rule { id: string; title: string; form: string; authority: string; category: ComplianceCategory; frequency: Obligation["frequency"]; why: string; note?: string; requires?: { field: keyof CompanyBook["legal"]; label: string }; dates: (from: string, to: string) => { period: string; due: string }[] }

/** Monthly instances whose due date falls in the window. */
function monthly(due: (year: number, month: number) => string) {
  return (from: string, to: string) => {
    const out: { period: string; due: string }[] = [];
    let year = Number(from.slice(0, 4)); let month = Number(from.slice(5, 7)) - 2;
    if (month < 1) { month += 12; year -= 1; }
    for (let i = 0; i < 9; i++) {
      const date = due(year, month);
      if (date >= from && date <= to) out.push({ period: monthName(year, month), due: date });
      month += 1; if (month > 12) { month = 1; year += 1; }
    }
    return out;
  };
}
/** Fixed dates each year ("MM-DD"), labelled by the financial year or quarter they belong to. */
function yearly(entries: { md: string; label: (dueYear: number) => string }[]) {
  return (from: string, to: string) => {
    const out: { period: string; due: string }[] = [];
    for (let year = Number(from.slice(0, 4)) - 1; year <= Number(to.slice(0, 4)) + 1; year++) for (const entry of entries) {
      const due = `${year}-${entry.md}`;
      if (due >= from && due <= to) out.push({ period: entry.label(year), due });
    }
    return out;
  };
}
const prevFy = (year: number) => `FY ${year - 1}-${pad(year % 100)}`;
const fyOf = (year: number, month: number) => fyLabel(`${year}-${pad(month)}-01`);

function rulesFor(book: CompanyBook): { rules: Rule[]; missing: MissingItem[] } {
  const { legal } = book;
  const id = book.record.id;
  const rules: Rule[] = [];
  const missing: MissingItem[] = [];
  const corporate = ["Private Limited", "Public Limited", "One Person Company"].includes(legal.entityType);
  const headcount = book.on.hr ? book.employees.length : 0;
  const payroll = book.on.hr && book.employees.some((item) => item.salaryMonthly > 0);
  const gst = Boolean(legal.gstin);

  if (!legal.entityType) missing.push({ companyId: id, field: "Entity type", why: "Company-law and income-tax filings depend on it, so they cannot be scheduled.", severity: "high" });
  if (!legal.pan) missing.push({ companyId: id, field: "PAN", why: "Needed for income tax, TDS and GST.", severity: "high" });
  if (!legal.state) missing.push({ companyId: id, field: "State of registration", why: "Professional tax and GST depend on the state.", severity: "medium" });
  if (corporate && !legal.cin) missing.push({ companyId: id, field: "CIN", why: "Every MCA filing quotes it.", severity: "medium" });
  if (!legal.registeredAddress) missing.push({ companyId: id, field: "Registered address", why: "Shown on invoices and statutory filings.", severity: "medium" });
  if (book.finance && book.finance.invoices.some((item) => item.lines.some((line) => line.gstRate > 0)) && !gst) missing.push({ companyId: id, field: "GSTIN", why: "Invoices charge GST but no GSTIN is recorded.", severity: "high" });
  if (payroll && !legal.tan) missing.push({ companyId: id, field: "TAN", why: "Salaries are paid, so TDS must be deducted and deposited under a TAN.", severity: "high" });
  if (headcount >= 20 && !legal.pfCode) missing.push({ companyId: id, field: "EPF establishment code", why: `${headcount} employees: EPF applies from 20.`, severity: "high" });
  if (headcount >= 10 && !legal.esiCode) missing.push({ companyId: id, field: "ESIC code", why: `${headcount} employees: ESI applies from 10 in most states.`, severity: "medium" });

  if (gst) {
    rules.push({ id: "gstr1", title: "GST outward supplies return", form: "GSTR-1", authority: "GSTN", category: "GST", frequency: "Monthly", why: `GSTIN ${legal.gstin}`, note: "Monthly filer assumed. Quarterly (QRMP) filers file by the 13th after the quarter.", dates: monthly((y, m) => nextMonthOn(y, m, 11)) });
    rules.push({ id: "gstr3b", title: "GST summary return and tax payment", form: "GSTR-3B", authority: "GSTN", category: "GST", frequency: "Monthly", why: `GSTIN ${legal.gstin}`, note: "Monthly filer assumed. QRMP filers: 22nd or 24th after the quarter, by state.", dates: monthly((y, m) => nextMonthOn(y, m, 20)) });
    rules.push({ id: "gstr9", title: "GST annual return", form: "GSTR-9", authority: "GSTN", category: "GST", frequency: "Yearly", why: `GSTIN ${legal.gstin}`, note: "Optional below ₹2 crore turnover.", dates: yearly([{ md: "12-31", label: (y) => prevFy(y) }]) });
  }
  if (payroll) {
    rules.push({ id: "tds-pay", title: "TDS deposit on salaries", form: "Challan ITNS 281", authority: "Income Tax Dept", category: "TDS", frequency: "Monthly", why: "Salaries are paid", requires: { field: "tan", label: "TAN" }, dates: monthly((y, m) => m === 3 ? `${y}-04-30` : nextMonthOn(y, m, 7)) });
    rules.push({ id: "24q", title: "Quarterly TDS return on salaries", form: "Form 24Q", authority: "Income Tax Dept (TRACES)", category: "TDS", frequency: "Quarterly", why: "Salaries are paid", requires: { field: "tan", label: "TAN" }, dates: yearly([{ md: "07-31", label: (y) => `Q1 ${fyOf(y, 6)}` }, { md: "10-31", label: (y) => `Q2 ${fyOf(y, 9)}` }, { md: "01-31", label: (y) => `Q3 ${fyOf(y - 1, 12)}` }, { md: "05-31", label: (y) => `Q4 ${fyOf(y, 3)}` }]) });
  }
  if (headcount >= 20 || legal.pfCode) rules.push({ id: "epf", title: "EPF contribution and ECR", form: "ECR", authority: "EPFO", category: "Payroll statutory", frequency: "Monthly", why: legal.pfCode ? `Registered (${legal.pfCode})` : `${headcount} employees`, requires: { field: "pfCode", label: "EPF code" }, dates: monthly((y, m) => nextMonthOn(y, m, 15)) });
  if (headcount >= 10 || legal.esiCode) rules.push({ id: "esi", title: "ESI contribution", form: "ESI challan", authority: "ESIC", category: "Payroll statutory", frequency: "Monthly", why: legal.esiCode ? `Registered (${legal.esiCode})` : `${headcount} employees`, requires: { field: "esiCode", label: "ESIC code" }, dates: monthly((y, m) => nextMonthOn(y, m, 15)) });
  if (payroll && legal.state === "Karnataka") rules.push({ id: "pt-ka", title: "Professional tax (Karnataka)", form: "Form 5", authority: "Karnataka Commercial Taxes", category: "Payroll statutory", frequency: "Monthly", why: "Employees in Karnataka", dates: monthly((y, m) => nextMonthOn(y, m, 20)) });
  if (payroll && legal.state === "Maharashtra") rules.push({ id: "pt-mh", title: "Professional tax (Maharashtra)", form: "Form III", authority: "Maharashtra GST Dept", category: "Payroll statutory", frequency: "Monthly", why: "Employees in Maharashtra", note: "Monthly when the yearly liability exceeds ₹50,000; otherwise once a year by 31 March.", dates: monthly((y, m) => `${y}-${pad(m)}-${pad(lastDay(y, m))}`) });

  if (legal.entityType) {
    rules.push({ id: "advance-tax", title: "Advance tax instalment", form: "Challan ITNS 280", authority: "Income Tax Dept", category: "Income tax", frequency: "Quarterly", why: "Expected tax above ₹10,000", dates: yearly([{ md: "06-15", label: (y) => `15% · ${fyOf(y, 6)}` }, { md: "09-15", label: (y) => `45% · ${fyOf(y, 9)}` }, { md: "12-15", label: (y) => `75% · ${fyOf(y, 12)}` }, { md: "03-15", label: (y) => `100% · ${fyOf(y, 3)}` }]) });
    const audited = legal.entityType !== "Proprietorship";
    rules.push({ id: "itr", title: "Income tax return", form: corporate ? "ITR-6" : legal.entityType === "Proprietorship" ? "ITR-3" : "ITR-5", authority: "Income Tax Dept", category: "Income tax", frequency: "Yearly", why: legal.entityType, note: audited ? "Due date for accounts that need audit." : "Non-audit due date. If a tax audit applies, it moves to 31 October.", dates: yearly([{ md: audited ? "10-31" : "07-31", label: (y) => prevFy(y) }]) });
    if (audited) rules.push({ id: "3ca", title: "Tax audit report", form: "Form 3CA/3CD", authority: "Income Tax Dept", category: "Income tax", frequency: "Yearly", why: legal.entityType, note: "Applies when turnover crosses the tax-audit limit.", dates: yearly([{ md: "09-30", label: (y) => prevFy(y) }]) });
  }
  if (corporate) {
    rules.push({ id: "agm", title: "Annual general meeting", form: "AGM", authority: "Companies Act", category: "Company law", frequency: "Yearly", why: legal.entityType, note: legal.entityType === "One Person Company" ? "An OPC does not need to hold an AGM." : undefined, dates: legal.entityType === "One Person Company" ? () => [] : yearly([{ md: "09-30", label: (y) => prevFy(y) }]) });
    rules.push({ id: "aoc4", title: "Financial statements filing", form: "AOC-4", authority: "MCA", category: "Company law", frequency: "Yearly", why: legal.entityType, note: "Within 30 days of the AGM; this date assumes the AGM on 30 September.", requires: { field: "cin", label: "CIN" }, dates: yearly([{ md: legal.entityType === "One Person Company" ? "09-27" : "10-30", label: (y) => prevFy(y) }]) });
    rules.push({ id: "mgt7", title: "Annual return", form: legal.entityType === "Public Limited" ? "MGT-7" : "MGT-7A", authority: "MCA", category: "Company law", frequency: "Yearly", why: legal.entityType, note: "Within 60 days of the AGM; this date assumes the AGM on 30 September.", requires: { field: "cin", label: "CIN" }, dates: yearly([{ md: "11-29", label: (y) => prevFy(y) }]) });
    rules.push({ id: "dir3", title: "Director KYC", form: "DIR-3 KYC", authority: "MCA", category: "Company law", frequency: "Yearly", why: "Every director with a DIN", dates: yearly([{ md: "09-30", label: (y) => `FY ${y}-${pad((y + 1) % 100)}` }]) });
    rules.push({ id: "dpt3", title: "Return of deposits", form: "DPT-3", authority: "MCA", category: "Company law", frequency: "Yearly", why: legal.entityType, note: "Needed when the company has loans or deposits outstanding.", dates: yearly([{ md: "06-30", label: (y) => prevFy(y) }]) });
  }
  if (legal.entityType === "LLP") {
    rules.push({ id: "llp11", title: "LLP annual return", form: "Form 11", authority: "MCA", category: "Company law", frequency: "Yearly", why: "LLP", dates: yearly([{ md: "05-30", label: (y) => prevFy(y) }]) });
    rules.push({ id: "llp8", title: "Statement of account and solvency", form: "Form 8", authority: "MCA", category: "Company law", frequency: "Yearly", why: "LLP", dates: yearly([{ md: "10-30", label: (y) => prevFy(y) }]) });
  }
  return { rules, missing };
}

/** The obligations due from 45 days ago to 120 days ahead, for every company given. */
export function complianceFor(books: CompanyBook[], state: ComplianceState, today = todayIso()) {
  const from = addDays(today, -45);
  const to = addDays(today, 120);
  const obligations: Obligation[] = [];
  const missing: MissingItem[] = [];
  for (const book of books) {
    const set = rulesFor(book);
    missing.push(...set.missing);
    for (const rule of set.rules) for (const { period, due } of rule.dates(from, to)) {
      const key = `${book.record.id}:${rule.id}:${due}`;
      const filing = state.filings.find((item) => item.key === key);
      const remind = state.reminderDays[`${book.record.id}:${rule.id}`] ?? 7;
      const status: ComplianceStatus = filing ? "filed" : due < today ? "unconfirmed" : due <= addDays(today, remind) ? "due-soon" : "upcoming";
      obligations.push({
        key, companyId: book.record.id, ruleId: rule.id, title: rule.title, form: rule.form, authority: rule.authority, category: rule.category, period, due, frequency: rule.frequency, why: rule.why, note: rule.note, status,
        owner: state.owners[`${book.record.id}:${rule.id}`] ?? "",
        filedOn: filing?.filedOn, reference: filing?.reference,
        blockedBy: rule.requires && !book.legal[rule.requires.field] ? `${rule.requires.label} not recorded` : undefined,
      });
    }
  }
  obligations.sort((a, b) => a.due.localeCompare(b.due));
  return { obligations, missing };
}

/** A company's standing: the share of past-due obligations confirmed, plus open gaps. */
export function complianceScore(obligations: Obligation[], missing: MissingItem[], companyId: string) {
  const past = obligations.filter((item) => item.companyId === companyId && item.due < todayIso());
  const confirmed = past.filter((item) => item.status === "filed").length;
  const gaps = missing.filter((item) => item.companyId === companyId).length;
  const unconfirmed = past.length - confirmed;
  const state = unconfirmed > 0 || missing.some((item) => item.companyId === companyId && item.severity === "high") ? "attention" : gaps > 0 ? "watch" : "ok";
  return { past: past.length, confirmed, unconfirmed, gaps, state } as const;
}
