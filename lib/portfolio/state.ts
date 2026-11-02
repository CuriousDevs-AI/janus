"use client";

import * as React from "react";
import { todayIso } from "@/lib/today";

/**
 * What the Portfolio itself keeps: targets, compliance filings, who has Portfolio access, read marks and its own
 * change log. Company records stay in each company; this holds only decisions made at the Portfolio level.
 * In the preview it lives in this browser. Every write goes through `writePortfolio`, so screens update together.
 */

const EVENT = "janus:portfolio-state";
export const KEYS = {
  targets: "janus.portfolio.targets",
  compliance: "janus.portfolio.compliance",
  access: "janus.portfolio-access",
  log: "janus.portfolio.log",
  read: "janus.portfolio-read",
  snoozed: "janus.portfolio.snoozed",
} as const;

function readRaw(key: string) { try { return window.localStorage.getItem(key); } catch { return null; } }
export function readPortfolio<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const raw = readRaw(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}
export function writePortfolio<T>(key: string, value: T) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: kept for this visit only */ }
  window.dispatchEvent(new Event(EVENT));
}
function subscribe(listener: () => void) {
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", listener);
  return () => { window.removeEventListener(EVENT, listener); window.removeEventListener("storage", listener); };
}
/** A value the Portfolio keeps, re-read whenever any Portfolio value changes. */
export function usePortfolioValue<T>(key: string, fallback: T): T {
  const raw = React.useSyncExternalStore(subscribe, () => readRaw(key), () => null);
  return React.useMemo(() => { try { return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; } }, [raw]); // eslint-disable-line react-hooks/exhaustive-deps
}
/** Changes whenever anything in the Portfolio or a company record changes, so derived figures recompute. */
export function usePortfolioVersion() {
  const [version, setVersion] = React.useState(0);
  React.useEffect(() => {
    const bump = () => setVersion((value) => value + 1);
    window.addEventListener(EVENT, bump);
    window.addEventListener("storage", bump);
    window.addEventListener("janus:company", bump);
    return () => { window.removeEventListener(EVENT, bump); window.removeEventListener("storage", bump); window.removeEventListener("janus:company", bump); };
  }, []);
  return version;
}

/** A change made at the Portfolio level. Shown in Activity beside each company's own records. */
export interface LogEntry { id: string; date: string; at: string; by: string; companyId: string | null; type: "company" | "compliance" | "access" | "target"; text: string }
export function logPortfolio(entry: Omit<LogEntry, "id" | "date" | "at">) {
  const list = readPortfolio<LogEntry[]>(KEYS.log, []);
  const now = new Date();
  writePortfolio(KEYS.log, [{ ...entry, id: `log-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`, date: todayIso(), at: now.toISOString() }, ...list].slice(0, 500));
}

/** Quarterly targets, per company and measure, for one FY quarter (for example "Q3 FY 2026-27"). */
export type TargetMeasure = "netSales" | "wonValue" | "leads" | "collections";
export const TARGET_LABEL: Record<TargetMeasure, string> = { netSales: "Net sales (booked)", wonValue: "Deals won", leads: "New leads", collections: "Cash collected" };
export interface Target { companyId: string; quarter: string; measure: TargetMeasure; value: number; setBy: string; setOn: string }

/** A filing a person has confirmed. Janus has no link to the government portals, so filing is recorded by hand. */
export interface FilingRecord { key: string; companyId: string; filedOn: string; reference: string; by: string }
export interface ComplianceState { filings: FilingRecord[]; owners: Record<string, string>; reminderDays: Record<string, number> }
export const emptyCompliance: ComplianceState = { filings: [], owners: {}, reminderDays: {} };
