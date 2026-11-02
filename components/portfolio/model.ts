"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { readCompanies, seedCompanies, subscribeCompanies, type CompanyRecord } from "@/lib/company";
import { readBook, type CompanyBook } from "@/lib/portfolio/books";
import { consolidate, figuresFor, figuresForPeriod } from "@/lib/portfolio/metrics";
import { elapsedShare, periodFor, quarterEnd, quarterLabel, type PeriodKey } from "@/lib/portfolio/period";
import { complianceFor } from "@/lib/portfolio/compliance";
import { signalsFor, healthOf, type IntelInput, type TargetProgress } from "@/lib/portfolio/intelligence";
import { workFor } from "@/lib/portfolio/work";
import { activityFor } from "@/lib/portfolio/activity";
import { emptyCompliance, KEYS, usePortfolioValue, usePortfolioVersion, type ComplianceState, type LogEntry, type Target } from "@/lib/portfolio/state";
import { memberScope, ownerScope, type Member, type Scope } from "@/lib/portfolio/access";
import { useLoginAccount } from "@/lib/demo-persona";
import { todayIso } from "@/lib/today";

/** Reads a search parameter and writes it back to the URL, so filters survive reloads and can be shared. */
export function useParam(name: string, fallback = ""): [string, (value: string) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const value = params.get(name) ?? fallback;
  const set = React.useCallback((next: string) => {
    const copy = new URLSearchParams(window.location.search);
    if (!next || next === fallback) copy.delete(name); else copy.set(name, next);
    router.replace(`${window.location.pathname}?${copy.toString()}`, { scroll: false });
  }, [name, fallback, router]);
  return [value, set];
}

/** Who is looking: the owner, an owner previewing a member, or a member signed in. Null means no access. */
export function useScope(): { scope: Scope | null; previewing: Member | null } {
  const login = useLoginAccount();
  const members = usePortfolioValue<Member[]>(KEYS.access, []);
  const [as] = useParam("as");
  return React.useMemo(() => {
    if (!login) return { scope: ownerScope(), previewing: null };
    if (login.hrRole === "owner") {
      const preview = as ? members.find((item) => item.id === as) ?? null : null;
      return { scope: preview ? memberScope(preview) : ownerScope(login.name), previewing: preview };
    }
    const member = members.find((item) => item.email.toLowerCase() === login.email.toLowerCase());
    return { scope: member ? memberScope(member) : null, previewing: null };
  }, [login, members, as]);
}

export function useCompanies() {
  const registry = React.useSyncExternalStore(subscribeCompanies, () => JSON.stringify(readCompanies()), () => JSON.stringify(seedCompanies));
  const hydrated = React.useSyncExternalStore(() => () => {}, () => true, () => false);
  return { records: React.useMemo(() => hydrated ? JSON.parse(registry) as CompanyRecord[] : [], [registry, hydrated]), hydrated };
}

export type Model = ReturnType<typeof buildModel>;

function buildModel(books: CompanyBook[], periodKey: PeriodKey, compliance: ComplianceState, targets: Target[], log: LogEntry[]) {
  const today = todayIso();
  const period = periodFor(periodKey, today);
  const selected = figuresForPeriod(books, period, today);
  const month = periodFor("month", today);
  const lastMonth = periodFor("last-month", today);
  const quarter = periodFor("quarter", today);
  const m = figuresForPeriod(books, month, today);
  const lm = figuresForPeriod(books, lastMonth, today);
  const qf = figuresForPeriod(books, quarter, today);
  const consolidated = consolidate(books, selected.now, period);
  const quarterConsolidated = consolidate(books, qf.now, quarter);
  const { obligations, missing } = complianceFor(books, compliance, today);
  const qLabel = quarterLabel(today);
  const expected = elapsedShare(quarter, quarterEnd(today), today);
  const targetProgress: TargetProgress[] = targets.filter((item) => item.quarter === qLabel && books.some((book) => book.record.id === item.companyId)).map((item) => {
    const f = qf.now.find((entry) => entry.id === item.companyId)!;
    const actual = item.measure === "netSales" ? f.finance?.netSales ?? 0 : item.measure === "collections" ? f.finance?.collections ?? 0 : item.measure === "wonValue" ? f.sales?.wonValue ?? 0 : f.sales?.leads ?? 0;
    return { companyId: item.companyId, measure: item.measure, target: item.value, actual, achieved: item.value > 0 ? actual / item.value : 0, expected };
  });
  const input: IntelInput = { books, month: { ...m, period: month }, lastMonth: { ...lm, period: lastMonth }, quarter: { ...qf, period: quarter, consolidated: quarterConsolidated }, obligations, missing, targets: targetProgress };
  const signals = signalsFor(input);
  const health = new Map(books.map((book) => [book.record.id, healthOf(book, signals)]));
  return {
    today, books, period, figures: selected.now, before: selected.before, consolidated, input, signals, health, obligations, missing,
    targets: targetProgress, qLabel, work: workFor(books, obligations, signals, today), activity: activityFor(books, log),
    allTime: books.map((book) => figuresFor(book, periodFor("all", today), today)),
  };
}

/** Everything a Portfolio screen needs, for the companies this person may see. */
export function usePortfolioModel(scope: Scope | null, periodKey: PeriodKey) {
  const { records, hydrated } = useCompanies();
  const version = usePortfolioVersion();
  const compliance = usePortfolioValue<ComplianceState>(KEYS.compliance, emptyCompliance);
  const targets = usePortfolioValue<Target[]>(KEYS.targets, []);
  const log = usePortfolioValue<LogEntry[]>(KEYS.log, []);
  const model = React.useMemo(() => {
    if (!hydrated || !scope) return null;
    const visible = records.filter((record) => scope.sees(record.id));
    return buildModel(visible.map(readBook), periodKey, { ...emptyCompliance, ...compliance }, targets, log);
  }, [records, hydrated, scope, periodKey, compliance, targets, log, version]); // eslint-disable-line react-hooks/exhaustive-deps
  return { model, hydrated, total: records.length };
}
