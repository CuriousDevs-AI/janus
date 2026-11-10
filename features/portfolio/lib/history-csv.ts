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
