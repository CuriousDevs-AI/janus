/** Reading the companies in a summary: who may do what in each, and adding up across them. */

import * as React from "react";
import { toast } from "sonner";
import { useSession } from "@/components/auth/session-provider";
import { message } from "@/lib/api/client";
import { businessHome } from "@/lib/company";
import { switchTenant } from "@/lib/live-company";
import type { PortfolioCompany, PortfolioPeriodFigures } from "@/features/portfolio/types";

/** While an Owner previews the Portfolio as a group role, the role being previewed. */
export const PreviewRole = React.createContext<string | null>(null);
export const previewRoles = ["group_finance", "group_analyst"] as const;

/** What a role without money would receive from the server: every money figure left out. */
export function withoutMoney(item: PortfolioCompany): PortfolioCompany {
  return {
    ...item,
    money: null,
    books: null,
    gst: null,
    payroll: null,
    customers: [],
    intercompany: null,
    period: { current: { ...item.period.current, invoiced: null, collected: null }, previous: { ...item.period.previous, invoiced: null, collected: null } },
    people: item.people && { ...item.people, monthlyPayroll: null, claimsValue: null },
    stock: item.stock && { ...item.stock, stockValue: null },
    targets: item.targets && { ...item.targets, collected: null },
    // The server builds these without money for such a role: drop the money lines (receivables,
    // payables, a loss after salaries), then health
    // follows the same rule (red with anything high, amber with anything medium).
    ...(() => {
      const attention = item.attention.filter((entry) => !/view=(receivables|payables|overview)&workspace=finance/.test(entry.to));
      const high = attention.filter((entry) => entry.severity === "high").map((entry) => entry.text);
      const medium = attention.filter((entry) => entry.severity === "medium").map((entry) => entry.text);
      return { attention, health: item.health && (high.length ? { status: "red" as const, reasons: high } : medium.length ? { status: "amber" as const, reasons: medium } : { status: "green" as const, reasons: [] }) };
    })(),
  };
}

/** The person's role in a company decides what they may do there from the Portfolio. A group role
 * reads the Portfolio and has no workspace inside; only an Owner opens the company. */
export function useRoles() {
  const session = useSession();
  const preview = React.useContext(PreviewRole);
  const role = (item: PortfolioCompany) => preview ?? session.tenants.find((tenant) => tenant.id === item.id)?.role;
  return { owns: (item: PortfolioCompany) => role(item) === "owner", handlesMoney: (item: PortfolioCompany) => role(item) === "owner" || role(item) === "group_finance" };
}

/** Opens a screen inside a company, moving the session there first when it is another one. */
export const openIn = (item: PortfolioCompany, to: string = businessHome) => item.current ? window.location.assign(to) : switchTenant(item.id, to).catch((error) => toast.error(message(error)));

/** Won ÷ (won + lost), all time. Null with no closed deal. */
export const winRate = (item: PortfolioCompany) => { const closed = item.crm.wonDeals + item.crm.lostDeals; return closed ? Math.round((item.crm.wonDeals / closed) * 100) : null; };
/** Fewer closed deals than this, and a win rate says little: it is shown with its count and never ranked. */
export const RATE_MINIMUM = 5;
/** The win rate as text, with how many deals it rests on when they are few: "100% (1 deal)". */
export function winRateText(item: PortfolioCompany) {
  const rate = winRate(item);
  const closed = item.crm.wonDeals + item.crm.lostDeals;
  if (rate === null) return "—";
  return closed < RATE_MINIMUM ? `${rate}% (${closed} deal${closed === 1 ? "" : "s"})` : `${rate}%`;
}

/** One period figure added up across the companies. */
export const total = (list: PortfolioCompany[], side: "current" | "previous", pick: (figures: PortfolioPeriodFigures) => number | string | null) => list.reduce((sum, item) => sum + Number(pick(item.period[side]) ?? 0), 0);

/** Every company's attention lines together, most urgent first. */
export function attentionOf(list: PortfolioCompany[]) {
  const order = { high: 0, medium: 1, low: 2 };
  return list.flatMap((company) => company.attention.map((entry, index) => ({ ...entry, company, key: `${company.id}:${index}:${entry.text}` }))).sort((a, b) => order[a.severity] - order[b.severity]);
}

export type WithMoney = PortfolioCompany & { money: NonNullable<PortfolioCompany["money"]> };

/** How many months the period's days come to, for scaling a monthly figure such as payroll. */
export function monthsIn(period: { start: string; end: string }) {
  const days = (Date.parse(`${period.end}T00:00:00Z`) - Date.parse(`${period.start}T00:00:00Z`)) / 864e5 + 1;
  return days / 30.44;
}

/** Payroll for the period: the salaries posted to the books where every month of it is posted,
 * otherwise an estimate from the monthly salaries in HR. Null when the company has no employee
 * records or no salaries on them: unknown, not zero. */
export const payrollFor = (item: PortfolioCompany, period: { start: string; end: string }) =>
  item.books?.current.salariesComplete ? Number(item.books.current.salariesPosted)
    : (item.people?.headcount ?? 0) > 0 && Number(item.people?.monthlyPayroll ?? 0) > 0 ? Number(item.people!.monthlyPayroll) * monthsIn(period) : null;

/** Whether every known salary figure in the list is posted to the books, not estimated. */
export const salariesRecorded = (list: PortfolioCompany[]) =>
  list.some((item) => item.books?.current.salariesComplete) && list.every((item) => item.books?.current.salariesComplete || (item.people?.headcount ?? 0) === 0 || Number(item.people?.monthlyPayroll ?? 0) === 0);

/** The group's profit once known salaries are counted, and how many companies' salaries are unknown. */
export function groupProfitAfterSalaries(list: PortfolioCompany[], period: { start: string; end: string }) {
  const known = list.filter((item) => item.books && payrollFor(item, period) !== null);
  const salaries = known.reduce((total, item) => total + (payrollFor(item, period) ?? 0), 0);
  const unknown = list.filter((item) => item.books && payrollFor(item, period) === null).length;
  return { salaries, unknown, profit: groupBooks(list, "current").profit - salaries };
}


/**
 * The group's books for a side of the period, with sales between the companies shown taken out of
 * both sales and costs. Every screen uses this, so a group figure and its change are the same
 * everywhere.
 */
export function groupBooks(list: PortfolioCompany[], side: "current" | "previous") {
  const sum = (pick: (item: PortfolioCompany) => string | null | undefined) => list.reduce((total, item) => total + Number(pick(item) ?? 0), 0);
  const internalSales = sum((item) => side === "current" ? item.intercompany?.sales : item.intercompany?.salesBefore);
  const internalBills = sum((item) => side === "current" ? item.intercompany?.purchases : item.intercompany?.purchasesBefore);
  const sales = sum((item) => item.books?.[side].netSales) - internalSales;
  const costs = sum((item) => item.books?.[side].costs) - internalBills;
  return { sales, costs, profit: sales - costs, internalSales, internalBills };
}
