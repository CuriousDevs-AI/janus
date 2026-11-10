/** Reads a bank statement exported as CSV, the way Indian banks lay them out: a header row with a
 * date, a narration, withdrawal and deposit (or one signed amount, or an amount with Dr/Cr) and a
 * balance. Rows above the header (the bank's own heading) and below the lines are skipped. */

export type BankRow = { date: string; description: string; amount: string; balance: string | null };
export type ParsedStatement = { rows: BankRow[]; skipped: number; columns: string[] };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Splits one CSV line, keeping commas inside quotes. */
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

/** 05/10/2026, 05-10-26, 2026-10-05, 05 Oct 2026 or 05-Oct-2026 as 2026-10-05; Indian banks write the day first. */
export function isoDate(text: string): string | null {
  const t = text.trim().toLowerCase();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t);
  if (m) { const year = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  m = /^(\d{1,2})[ -]([a-z]{3})[a-z]*[ ,-]+(\d{2,4})$/.exec(t);
  if (m && MONTHS.includes(m[2])) { const year = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${year}-${String(MONTHS.indexOf(m[2]) + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  return null;
}

/** "1,20,000.50", "(500.00)", "500 Dr" as rupees with up to two decimals; null when empty. */
export function rupees(text: string): number | null {
  const t = text.replace(/[₹,\s]|INR|Rs\.?/gi, "");
  if (!t || t === "-") return null;
  const negative = /^\(.*\)$/.test(t) || /dr$/i.test(t);
  const value = Number(t.replace(/[()]/g, "").replace(/(cr|dr)$/i, ""));
  if (!Number.isFinite(value)) return null;
  return negative ? -Math.abs(value) : value;
}

const find = (head: string[], words: RegExp) => head.findIndex((name) => words.test(name));
const money = (value: number) => (Math.round(value * 100) / 100).toFixed(2);

export function parseStatement(text: string): ParsedStatement {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((line) => line.trim());
  const at = lines.findIndex((line) => /date/i.test(line) && /(balance|amount|withdraw|debit|deposit|credit)/i.test(line));
  if (at < 0) throw new Error("No header row with a date and an amount or balance was found.");
  const head = cells(lines[at]).map((name) => name.toLowerCase());
  const date = find(head, /^(txn |transaction |value )?date|^date/);
  const description = find(head, /narration|description|particulars|remarks|details/);
  const debit = find(head, /withdraw|debit|^dr\b/);
  const credit = find(head, /deposit|credit|^cr\b/);
  const amount = find(head, /^amount|txn amount|transaction amount/);
  const side = find(head, /dr ?\/ ?cr|cr ?\/ ?dr|type/);
  const balance = find(head, /balance/);
  if (date < 0 || (amount < 0 && debit < 0 && credit < 0)) throw new Error("The statement needs a date column and amounts.");
  const rows: BankRow[] = []; let skipped = 0;
  for (const line of lines.slice(at + 1)) {
    const row = cells(line);
    const day = isoDate(row[date] ?? "");
    let value: number | null = null;
    if (amount >= 0) {
      value = rupees(row[amount] ?? "");
      if (value !== null && side >= 0 && /^d/i.test(row[side] ?? "")) value = -Math.abs(value);
    } else {
      const out = rupees(row[debit] ?? "") ?? 0; const into = rupees(row[credit] ?? "") ?? 0;
      value = out || into ? into - Math.abs(out) : null;
    }
    if (!day || value === null) { skipped++; continue; }
    const left = balance >= 0 ? rupees(row[balance] ?? "") : null;
    rows.push({ date: day, description: (description >= 0 ? row[description] : "")?.slice(0, 300) ?? "", amount: money(value), balance: left === null ? null : money(left) });
  }
  return { rows, skipped, columns: head };
}
