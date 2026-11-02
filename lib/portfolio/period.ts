import { todayIso } from "@/lib/today";

/**
 * Reporting periods for the Portfolio. India's financial year runs April to March, so quarters are FY quarters
 * (Q1 Apr–Jun … Q4 Jan–Mar). A period that is still running is compared with the same number of days in the
 * period before it, so a half-finished month is never measured against a whole one.
 */

export type PeriodKey = "month" | "last-month" | "quarter" | "last-quarter" | "fy" | "all";
export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "quarter", label: "This quarter" },
  { key: "last-quarter", label: "Last quarter" },
  { key: "fy", label: "Financial year to date" },
  { key: "all", label: "All records" },
];

export interface Range { from: string; to: string; label: string }
export interface Period extends Range { key: PeriodKey; previous: Range | null; running: boolean }

const iso = (date: Date) => date.toISOString().slice(0, 10);
const utc = (value: string) => new Date(`${value}T00:00:00Z`);
export const addDays = (value: string, days: number) => { const date = utc(value); date.setUTCDate(date.getUTCDate() + days); return iso(date); };
export const daysBetween = (from: string, to: string) => Math.round((utc(to).getTime() - utc(from).getTime()) / 86400000);
const monthStart = (value: string, offset = 0) => { const date = utc(`${value.slice(0, 7)}-01`); date.setUTCMonth(date.getUTCMonth() + offset); return iso(date); };
const monthEnd = (value: string) => addDays(monthStart(value, 1), -1);
const monthName = (value: string) => utc(value).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });

export function fyStart(value: string) { const year = Number(value.slice(0, 4)); const month = Number(value.slice(5, 7)); return `${month >= 4 ? year : year - 1}-04-01`; }
export function quarterStart(value: string) { const month = Number(value.slice(5, 7)); const offset = (month - 4 + 12) % 3; return monthStart(value, -offset); }
export function fyLabel(value: string) { const start = Number(fyStart(value).slice(0, 4)); return `FY ${start}-${String((start + 1) % 100).padStart(2, "0")}`; }
export function quarterLabel(value: string) { const month = Number(value.slice(5, 7)); const q = month >= 4 && month <= 6 ? 1 : month <= 9 && month >= 7 ? 2 : month >= 10 ? 3 : 4; return `Q${q} ${fyLabel(value)}`; }

/** The same span, shifted back to start at `start`, cut at the same elapsed day. */
const sameSpan = (from: string, to: string, start: string, label: string): Range => ({ from: start, to: addDays(start, daysBetween(from, to)), label });

export function periodFor(key: PeriodKey, today = todayIso()): Period {
  if (key === "month") {
    const from = monthStart(today);
    return { key, from, to: today, label: `${monthName(today)} to date`, running: true, previous: sameSpan(from, today, monthStart(today, -1), `Same days of ${monthName(monthStart(today, -1))}`) };
  }
  if (key === "last-month") {
    const from = monthStart(today, -1);
    return { key, from, to: monthEnd(from), label: monthName(from), running: false, previous: { from: monthStart(today, -2), to: monthEnd(monthStart(today, -2)), label: monthName(monthStart(today, -2)) } };
  }
  if (key === "quarter") {
    const from = quarterStart(today);
    return { key, from, to: today, label: `${quarterLabel(today)} to date`, running: true, previous: sameSpan(from, today, monthStart(from, -3), `Same days of ${quarterLabel(monthStart(from, -3))}`) };
  }
  if (key === "last-quarter") {
    const from = monthStart(quarterStart(today), -3);
    const to = addDays(quarterStart(today), -1);
    const before = monthStart(from, -3);
    return { key, from, to, label: quarterLabel(from), running: false, previous: { from: before, to: addDays(from, -1), label: quarterLabel(before) } };
  }
  if (key === "fy") {
    const from = fyStart(today);
    const before = `${Number(from.slice(0, 4)) - 1}-04-01`;
    return { key, from, to: today, label: `${fyLabel(today)} to date`, running: true, previous: sameSpan(from, today, before, `Same days of ${fyLabel(before)}`) };
  }
  return { key: "all", from: "0000-01-01", to: today, label: "All records", running: false, previous: null };
}

export const inRange = (date: string | undefined | null, range: Range) => Boolean(date) && date!.slice(0, 10) >= range.from && date!.slice(0, 10) <= range.to;

/** The last `count` calendar months ending with the current one, oldest first. */
export function lastMonths(count: number, today = todayIso()) {
  return Array.from({ length: count }, (_, index) => {
    const from = monthStart(today, index - count + 1);
    return { key: from.slice(0, 7), label: utc(from).toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" }), from, to: index === count - 1 ? today : monthEnd(from) };
  });
}

/** Share of a running period that has passed, used to judge whether a target is on pace. */
export function elapsedShare(range: Range, end: string, today = todayIso()) {
  const total = daysBetween(range.from, end) + 1;
  return Math.min(1, Math.max(0, (daysBetween(range.from, today) + 1) / total));
}
export const quarterEnd = (today = todayIso()) => addDays(monthStart(quarterStart(today), 3), -1);
