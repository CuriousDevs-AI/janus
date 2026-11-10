/** Reads a monthly summary exported from Tally, Zoho Books or a spreadsheet: one row a month, with
 * the month, sales and purchases or expenses. Months may be written "Apr-25", "April 2025",
 * "2025-04" or "04/2025". Rows that are not a month (totals, headings) are skipped. */
import { rupees } from "@/features/portfolio/lib/bank-csv";

export type HistoryRow = { month: string; sales: string; costs: string };
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function cells(line: string): string[] {
  const out: string[] = []; let current = ""; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (quoted && line[i + 1] === '"') { current += '"'; i++; } else quoted = !quoted; }
    else if (c === "," && !quoted) { out.push(current.trim()); current = ""; }
    else current += c;
  }
  out.push(current.trim());
  return out;
}

/** A month as YYYY-MM, or null. */
export function monthOf(text: string): string | null {
  const t = text.trim().toLowerCase();
  let m = /^(\d{4})-(\d{1,2})$/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}`;
  m = /^(\d{1,2})[/-](\d{4})$/.exec(t);
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;
  m = /^([a-z]{3})[a-z]*[ ,'-]+(\d{2}|\d{4})$/.exec(t);
  if (m && MONTHS.includes(m[1])) return `${m[2].length === 2 ? `20${m[2]}` : m[2]}-${String(MONTHS.indexOf(m[1]) + 1).padStart(2, "0")}`;
  return null;
}

export function parseHistory(text: string): { rows: HistoryRow[]; skipped: number } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((line) => line.trim());
  const at = lines.findIndex((line) => /(month|period|particulars)/i.test(line) && /(sales|revenue|income)/i.test(line));
  if (at < 0) throw new Error("No header row with a month and sales was found.");
  const head = cells(lines[at]).map((name) => name.toLowerCase());
  const month = head.findIndex((name) => /month|period|particulars/.test(name));
  const sales = head.findIndex((name) => /sales|revenue|income/.test(name));
  const costs = head.findIndex((name) => /purchase|expense|cost/.test(name));
  const rows: HistoryRow[] = []; let skipped = 0;
  for (const line of lines.slice(at + 1)) {
    const row = cells(line);
    const when = monthOf(row[month] ?? "");
    const sold = rupees(row[sales] ?? "");
    if (!when || sold === null) { skipped++; continue; }
    const spent = costs >= 0 ? rupees(row[costs] ?? "") ?? 0 : 0;
    rows.push({ month: when, sales: Math.abs(sold).toFixed(2), costs: Math.abs(spent).toFixed(2) });
  }
  return { rows, skipped };
}

export type CustomerRow = { month: string; customer: string; sales: string };

/** Reads a party-wise sales report: either one row per customer and month (Customer, Month, Sales),
 * or Tally's layout with one row per party and a column per month ("Particulars, Apr-25, May-25…").
 * Totals and blank amounts are skipped. */
export function parseCustomerHistory(text: string): { rows: CustomerRow[]; skipped: number } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((line) => line.trim());
  // The header: a customer column, and either a column per month or a month and a sales column.
  const at = lines.findIndex((line) => {
    const names = cells(line).map((name) => name.toLowerCase().trim());
    if (!names.some((name) => /customer|party|particulars|name/.test(name))) return false;
    return names.filter((name) => monthOf(name)).length >= 2 || (names.some((name) => /month|period|date/.test(name)) && names.some((name) => /sales|amount|value|revenue/.test(name)));
  });
  if (at < 0) throw new Error("No header row with a customer column and months or a month and sales was found.");
  const head = cells(lines[at]).map((name) => name.toLowerCase().trim());
  const who = head.findIndex((name) => /customer|party|particulars|name/.test(name));
  const monthColumns = head.map((name, index) => [index, monthOf(name)] as const).filter(([, month]) => month);
  const rows: CustomerRow[] = []; let skipped = 0;
  const total = (name: string) => /^(grand )?total|^sub ?total/i.test(name);
  if (monthColumns.length >= 2) {
    for (const line of lines.slice(at + 1)) {
      const row = cells(line); const name = (row[who] ?? "").trim();
      if (!name || total(name)) { skipped++; continue; }
      for (const [index, month] of monthColumns) {
        const value = rupees(row[index] ?? "");
        if (value && value > 0) rows.push({ month: month!, customer: name.slice(0, 160), sales: value.toFixed(2) });
      }
    }
    return { rows, skipped };
  }
  const month = head.findIndex((name) => /month|period|date/.test(name));
  const sales = head.findIndex((name) => /sales|amount|value|revenue/.test(name));
  if (month < 0 || sales < 0) throw new Error("The report needs a month and a sales column, or a column per month.");
  for (const line of lines.slice(at + 1)) {
    const row = cells(line); const name = (row[who] ?? "").trim();
    const when = monthOf(row[month] ?? "") ?? (/^\d{4}-\d{2}-\d{2}$/.test((row[month] ?? "").trim()) ? row[month].trim().slice(0, 7) : null);
    const value = rupees(row[sales] ?? "");
    if (!name || total(name) || !when || value === null) { skipped++; continue; }
    rows.push({ month: when, customer: name.slice(0, 160), sales: Math.abs(value).toFixed(2) });
  }
  return { rows, skipped };
}
