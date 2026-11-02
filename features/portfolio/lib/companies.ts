/** Reading the companies in a summary: who may do what in each, and adding up across them. */

import { toast } from "sonner";
import { useSession } from "@/components/auth/session-provider";
import { message } from "@/lib/api/client";
import { businessHome } from "@/lib/company";
import { switchTenant } from "@/lib/live-company";
import type { PortfolioCompany, PortfolioPeriodFigures } from "@/features/portfolio/types";

/** The person's role in a company decides what they may do there from the Portfolio. A group role
 * reads the Portfolio and has no workspace inside; only an Owner opens the company. */
export function useRoles() {
  const session = useSession();
  const role = (item: PortfolioCompany) => session.tenants.find((tenant) => tenant.id === item.id)?.role;
  return { owns: (item: PortfolioCompany) => role(item) === "owner", handlesMoney: (item: PortfolioCompany) => role(item) === "owner" || role(item) === "group_finance" };
}

/** Opens a screen inside a company, moving the session there first when it is another one. */
export const openIn = (item: PortfolioCompany, to: string = businessHome) => item.current ? window.location.assign(to) : switchTenant(item.id, to).catch((error) => toast.error(message(error)));

export const winRate = (item: PortfolioCompany) => { const closed = item.crm.wonDeals + item.crm.lostDeals; return closed ? Math.round((item.crm.wonDeals / closed) * 100) : null; };

/** One period figure added up across the companies. */
export const total = (list: PortfolioCompany[], side: "current" | "previous", pick: (figures: PortfolioPeriodFigures) => number | string | null) => list.reduce((sum, item) => sum + Number(pick(item.period[side]) ?? 0), 0);

/** Every company's attention lines together, most urgent first. */
export function attentionOf(list: PortfolioCompany[]) {
  const order = { high: 0, medium: 1, low: 2 };
  return list.flatMap((company) => company.attention.map((entry, index) => ({ ...entry, company, key: `${company.id}:${index}:${entry.text}` }))).sort((a, b) => order[a.severity] - order[b.severity]);
}

export type WithMoney = PortfolioCompany & { money: NonNullable<PortfolioCompany["money"]> };
