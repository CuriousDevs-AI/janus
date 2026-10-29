import type { HrEmployee } from "@/lib/types";
import { acmeEmployees } from "@/lib/mock-data/hr-people";

export type ImportFieldKey = "name" | "email" | "phone" | "title" | "department" | "branch" | "manager" | "employmentType" | "joiningDate" | "location" | "salaryMonthly";
export interface ImportField { key: ImportFieldKey; label: string; required: boolean; aliases: string[]; hint: string }

export const importFields: ImportField[] = [
  { key: "name", label: "Full name", required: true, aliases: ["name", "full name", "employee name", "employee"], hint: "At least 2 characters" },
  { key: "email", label: "Work email", required: true, aliases: ["email", "email address", "work email", "mail", "email id"], hint: "Used to spot duplicates" },
  { key: "title", label: "Job title", required: true, aliases: ["title", "designation", "job title", "role", "position"], hint: "e.g. Account Executive" },
  { key: "department", label: "Department", required: true, aliases: ["department", "dept", "team"], hint: "e.g. Sales" },
  { key: "joiningDate", label: "Joining date", required: true, aliases: ["joining date", "date of joining", "doj", "start date", "joined", "joined on"], hint: "YYYY-MM-DD or DD/MM/YYYY" },
  { key: "phone", label: "Mobile", required: false, aliases: ["phone", "mobile", "mobile number", "contact", "phone number", "contact number"], hint: "10-digit Indian mobile" },
  { key: "manager", label: "Reporting manager", required: false, aliases: ["manager", "reporting manager", "reports to", "manager email", "line manager"], hint: "Email, name or employee ID" },
  { key: "branch", label: "Branch", required: false, aliases: ["branch", "office"], hint: "Defaults to Head office" },
  { key: "location", label: "Work location", required: false, aliases: ["location", "city", "work location"], hint: "Defaults to the branch" },
  { key: "employmentType", label: "Employment type", required: false, aliases: ["employment type", "type", "contract type", "employee type"], hint: "Full time, part time or contract" },
  { key: "salaryMonthly", label: "Monthly salary (₹)", required: false, aliases: ["salary", "monthly salary", "monthly pay", "gross salary", "salary monthly", "monthly gross"], hint: "Numbers only; ₹ and commas are fine" },
];

export const sampleCsv = ["Full name,Work email,Job title,Department,Joining date,Mobile,Reporting manager,Branch,Employment type,Monthly salary", "Anita Sharma,anita@example.com,Sales Executive,Sales,2026-11-02,98765 43210,arjun@acmetraders.in,Delhi,Full time,32000", "Rakesh Yadav,rakesh@example.com,Warehouse Associate,Operations,02/11/2026,+91 99100 22110,neha@acmetraders.in,Jaipur,Contract,18500"].join("\n");

export const MAX_ROWS = 500;
export const MAX_BYTES = 1024 * 1024;

/** Parses CSV, TSV or semicolon-separated text, including quoted cells and line breaks inside quotes. */
export function parseDelimited(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const counts = [",", "\t", ";"].map((delimiter) => ({ delimiter, count: firstLine.split(delimiter).length - 1 }));
  const best = counts.sort((a, b) => b.count - a.count)[0];
  const delimiter = best.count > 0 ? best.delimiter : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const endCell = () => { row.push(cell.trim()); cell = ""; };
  const endRow = () => { endCell(); if (row.some((item) => item !== "")) rows.push(row); row = []; };
  for (let i = 0; i < src.length; i += 1) {
    const char = src[i];
    if (quoted) {
      if (char === '"' && src[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell === "") quoted = true;
    else if (char === delimiter) endCell();
    else if (char === "\n") endRow();
    else if (char !== "\r") cell += char;
  }
  if (cell !== "" || row.length) endRow();
  return rows;
}

const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Suggests a column for each field from the header text. Each column is used at most once. */
export function autoMap(headers: string[]): Record<ImportFieldKey, number | null> {
  const used = new Set<number>();
  const map = {} as Record<ImportFieldKey, number | null>;
  for (const field of importFields) {
    const index = headers.findIndex((header, position) => !used.has(position) && field.aliases.includes(normalise(header)));
    map[field.key] = index >= 0 ? index : null;
    if (index >= 0) used.add(index);
  }
  return map;
}

const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
function toIso(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : null;
}
export function parseDate(value: string) {
  const text = value.trim();
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (match) return toIso(Number(match[1]), Number(match[2]), Number(match[3]));
  match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text); // Indian convention: day first
  if (match) return toIso(Number(match[3]), Number(match[2]), Number(match[1]));
  match = /^(\d{1,2})[ -]([A-Za-z]{3,9}),?[ -](\d{4})$/.exec(text);
  if (match) { const month = months.indexOf(match[2].slice(0, 3).toLowerCase()); return month >= 0 ? toIso(Number(match[3]), month + 1, Number(match[1])) : null; }
  return null;
}

export function normalisePhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : null;
}

const typeAliases: Record<string, HrEmployee["employmentType"]> = { "full time": "full_time", fulltime: "full_time", permanent: "full_time", ft: "full_time", "part time": "part_time", parttime: "part_time", pt: "part_time", contract: "contract", contractor: "contract", consultant: "contract", "full time employee": "full_time" };

export interface ImportedEmployee { name: string; email: string; phone: string; title: string; department: string; branch: string; location: string; employmentType: HrEmployee["employmentType"]; joiningDate: string; salaryMonthly: number | null; managerRef: string | null; given: { branch: boolean; location: boolean; employmentType: boolean } }
export type RowState = "ready" | "warning" | "error" | "duplicate";
export interface ImportRow { line: number; cells: string[]; employee?: ImportedEmployee; errors: string[]; warnings: string[]; duplicateOf?: HrEmployee; changes: string[]; state: RowState }
export type Mapping = Record<ImportFieldKey, number | null>;

export const todayIst = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export function validateRows(rows: string[][], mapping: Mapping, existing: HrEmployee[]): ImportRow[] {
  const get = (cells: string[], key: ImportFieldKey) => { const index = mapping[key]; return index === null ? "" : (cells[index] ?? "").trim(); };
  const people = existing;
  const emailsInFile = new Map<string, number>();
  rows.forEach((cells, index) => { const email = get(cells, "email").toLowerCase(); if (email && !emailsInFile.has(email)) emailsInFile.set(email, index + 2); });
  const seen = new Map<string, number>();
  const today = todayIst();
  return rows.map((cells, index) => {
    const line = index + 2; // header is line 1
    const errors: string[] = [];
    const warnings: string[] = [];
    const name = get(cells, "name").replace(/\s+/g, " ");
    const email = get(cells, "email").toLowerCase();
    const title = get(cells, "title");
    const department = get(cells, "department");
    const rawDate = get(cells, "joiningDate");
    if (name.length < 2) errors.push("Name is missing or too short.");
    if (!email) errors.push("Email is missing."); else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.push(`"${email}" is not a valid email.`);
    if (!title) errors.push("Job title is missing.");
    if (!department) errors.push("Department is missing.");
    const joiningDate = rawDate ? parseDate(rawDate) : null;
    if (!rawDate) errors.push("Joining date is missing."); else if (!joiningDate) errors.push(`Joining date "${rawDate}" isn't a valid date. Use YYYY-MM-DD or DD/MM/YYYY.`);
    else if (joiningDate > `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`) errors.push("Joining date is more than a year away.");
    else if (joiningDate < "1980-01-01") errors.push("Joining date is before 1980.");
    const rawPhone = get(cells, "phone");
    let phone = "";
    if (rawPhone) { const formatted = normalisePhone(rawPhone); if (formatted) phone = formatted; else { phone = rawPhone; warnings.push(`Mobile "${rawPhone}" isn't a valid 10-digit Indian number. It was kept as typed.`); } }
    const rawType = get(cells, "employmentType");
    let employmentType: HrEmployee["employmentType"] = "full_time";
    if (rawType) { const mapped = typeAliases[normalise(rawType)]; if (mapped) employmentType = mapped; else warnings.push(`Employment type "${rawType}" wasn't recognised, so Full time was used.`); }
    const rawSalary = get(cells, "salaryMonthly");
    let salaryMonthly: number | null = null;
    if (rawSalary) {
      const value = Number(rawSalary.replace(/[₹,\s]|rs\.?|inr/gi, ""));
      if (!Number.isFinite(value) || value < 0) errors.push(`Salary "${rawSalary}" isn't a valid amount.`);
      else { salaryMonthly = Math.round(value); if (value > 10_000_000) warnings.push("Salary is above ₹1 crore a month. Check for an extra zero."); }
    } else if (mapping.salaryMonthly !== null) warnings.push("No salary given. Payroll skips this person until it is set.");
    const managerRef = get(cells, "manager") || null;
    if (managerRef) {
      const key = managerRef.toLowerCase();
      const found = people.find((item) => item.email.toLowerCase() === key || item.id.toLowerCase() === key || item.name.toLowerCase() === key) ?? (emailsInFile.has(key) ? true : undefined);
      if (!found) warnings.push(`Manager "${managerRef}" wasn't found, so no manager was set.`);
      else if (key === email) warnings.push("A person can't be their own manager. No manager was set.");
    }
    let duplicateOf: HrEmployee | undefined;
    let changes: string[] = [];
    if (email && !errors.some((item) => item.includes("valid email"))) {
      const first = seen.get(email);
      if (first !== undefined) errors.push(`Same email as line ${first} in this file.`);
      else seen.set(email, line);
      duplicateOf = people.find((item) => item.email.toLowerCase() === email);
      if (!duplicateOf && phone) { const sameMobile = people.find((item) => item.phone.replace(/\D/g, "").slice(-10) === phone.replace(/\D/g, "").slice(-10)); if (sameMobile) warnings.push(`Mobile matches ${sameMobile.name}. Check this isn't the same person.`); }
    }
    const employee: ImportedEmployee | undefined = errors.length ? undefined : { name, email, phone, title, department, branch: get(cells, "branch") || "Head office", location: get(cells, "location") || get(cells, "branch") || "Head office", employmentType, joiningDate: joiningDate!, salaryMonthly, managerRef, given: { branch: Boolean(get(cells, "branch")), location: Boolean(get(cells, "location") || get(cells, "branch")), employmentType: Boolean(rawType) } };
    if (employee && duplicateOf) {
      const diff: [string, string, string][] = [["Title", duplicateOf.title, employee.title], ["Department", duplicateOf.department, employee.department], ["Mobile", duplicateOf.phone, employee.phone]];
      if (employee.given.branch) diff.push(["Branch", duplicateOf.branch, employee.branch]);
      if (employee.given.employmentType) diff.push(["Employment type", duplicateOf.employmentType, employee.employmentType]);
      if (employee.salaryMonthly !== null) diff.push(["Salary", String(duplicateOf.salaryMonthly), String(employee.salaryMonthly)]);
      changes = diff.filter(([, before, after]) => after && before !== after).map(([label, before, after]) => `${label}: ${before || "—"} → ${after}`);
    }
    const state: RowState = errors.length ? "error" : duplicateOf ? "duplicate" : warnings.length ? "warning" : "ready";
    return { line, cells, employee, errors, warnings, duplicateOf, changes, state };
  });
}

export function nextEmployeeIds(existing: HrEmployee[], count: number, demo: HrEmployee[] = []) {
  // The demo's ids are counted too, so a new record never reuses one, even after the demo records are dropped.
  const max = [...existing, ...demo].reduce((highest, item) => { const match = /^emp-(\d+)$/.exec(item.id); return match ? Math.max(highest, Number(match[1])) : highest; }, 0);
  return Array.from({ length: count }, (_, index) => `emp-${String(max + index + 1).padStart(3, "0")}`);
}

const palette = ["#2563eb", "#7c3aed", "#0891b2", "#059669", "#d97706", "#dc2626", "#db2777", "#4f46e5"];

/** Turns validated rows into new employee records and edits to existing ones. */
export function buildImport(rows: ImportRow[], existing: HrEmployee[], duplicates: "skip" | "update") {
  const usable = rows.filter((row) => row.employee && (row.state !== "duplicate" || duplicates === "update"));
  const creating = usable.filter((row) => !row.duplicateOf);
  const ids = nextEmployeeIds(existing, creating.length, acmeEmployees);
  const idByEmail = new Map<string, string>();
  existing.forEach((item) => idByEmail.set(item.email.toLowerCase(), item.id));
  creating.forEach((row, index) => idByEmail.set(row.employee!.email, ids[index]));
  const resolveManager = (ref: string | null, ownEmail: string) => {
    if (!ref) return null;
    const key = ref.toLowerCase();
    const byId = existing.find((item) => item.id.toLowerCase() === key);
    const byName = existing.find((item) => item.name.toLowerCase() === key);
    const id = idByEmail.get(key) ?? byId?.id ?? byName?.id ?? null;
    return id && idByEmail.get(ownEmail) !== id ? id : null;
  };
  const all = [...existing];
  const nameOf = (id: string | null) => id ? (all.find((item) => item.id === id)?.name ?? creating.find((row, index) => ids[index] === id)?.employee!.name ?? null) : null;
  const today = todayIst();
  const created: HrEmployee[] = creating.map((row, index) => {
    const e = row.employee!;
    const managerId = resolveManager(e.managerRef, e.email);
    const onboarding = e.joiningDate > today;
    return { id: ids[index], name: e.name, email: e.email, phone: e.phone, title: e.title, department: e.department, branch: e.branch, managerId, managerName: nameOf(managerId), status: onboarding ? "onboarding" : "active", employmentType: e.employmentType, joiningDate: e.joiningDate, location: e.location, avatarColor: palette[index % palette.length], salaryMonthly: e.salaryMonthly ?? 0, onboardingPercent: onboarding ? 0 : 100, documentsDue: onboarding ? 3 : 0 };
  });
  const updates = usable.filter((row) => row.duplicateOf && row.changes.length).map((row) => {
    const e = row.employee!;
    const current = row.duplicateOf!;
    const managerId = e.managerRef ? resolveManager(e.managerRef, e.email) : current.managerId;
    const patch: Partial<HrEmployee> = { title: e.title, department: e.department, phone: e.phone || current.phone, managerId, managerName: nameOf(managerId) };
    if (e.given.branch) patch.branch = e.branch;
    if (e.given.location) patch.location = e.location;
    if (e.given.employmentType) patch.employmentType = e.employmentType;
    if (e.salaryMonthly !== null) patch.salaryMonthly = e.salaryMonthly;
    const before: Partial<HrEmployee> = {};
    (Object.keys(patch) as (keyof HrEmployee)[]).forEach((key) => { (before as Record<string, unknown>)[key] = current[key]; });
    return { id: current.id, patch, before };
  });
  return { created, updates, skipped: rows.length - usable.length };
}

export function reportCsv(rows: ImportRow[]) {
  const label: Record<RowState, string> = { ready: "Ready", warning: "Ready with warnings", error: "Rejected", duplicate: "Duplicate" };
  return [["Line", "Result", "Name", "Email", "Issues"], ...rows.map((row) => [String(row.line), label[row.state], row.employee?.name ?? "", row.employee?.email ?? "", [...row.errors, ...row.warnings, ...(row.duplicateOf ? [`Already exists as ${row.duplicateOf.name} (${row.duplicateOf.id.toUpperCase()})`] : [])].join(" · ")])];
}
