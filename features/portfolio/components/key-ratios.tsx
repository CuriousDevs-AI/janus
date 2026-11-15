"use client";

import { StatTile } from "@/components/shared/stat-tile";
import { inr } from "@/features/portfolio/lib/format";
import type { CustomerFigures, PortfolioCompany, SalesRatios } from "@/features/portfolio/types";

const n = (value: string | null | undefined) => Number(value ?? 0);
const pct = (value: number | null | undefined) => (value == null ? "—" : `${value}%`);
const monthName = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });

/** "Dec 2025 – Nov 2026": the twelve finished months the customer figures cover. */
export const twelveMonths = (figures: CustomerFigures) => `${monthName(figures.recentStart)} – ${monthName(figures.recentEnd)}`;

/** Whether a share of customers lost, or of sales from one customer, is worth a look. */
export const churnHigh = (figures: CustomerFigures) => figures.before >= 5 && (figures.churnRate ?? 0) >= 30;
export const concentrated = (figures: CustomerFigures) => figures.customers >= 3 && (figures.topShare ?? 0) >= 40;

function was(now: number | null, before: number | null, unit = "%") {
  if (before == null) return "";
  if (now === before) return " · same as before";
  return ` · was ${before}${unit}`;
}

/** Customers and closed deals as ratios: churn, repeat buyers, revenue per customer, how much rests
 * on the largest customers, win rate, average deal and days to win. Each tile opens where it is
 * worked on. */
export function KeyRatios({ company, financeHref, crmHref }: { company: PortfolioCompany; financeHref: string; crmHref: string }) {
  const kept = company.customerFigures, sales = company.sales;
  // With money but no invoices in a finished month yet, say when the customer figures start.
  const waiting = !kept && company.money != null;
  if (!kept && !sales && !waiting) return null;
  return <div className="flex flex-col gap-4">
    {waiting && <p className="text-xs text-muted-foreground">Churn, repeat buyers and revenue per customer appear here once a full month of invoices is on record. To see them sooner, import a customer-wise sales report from Tally or Zoho Books under <a href="/portfolio?view=analytics#an-kept" className="text-accent hover:underline">Customers kept</a>.</p>}
    {kept && <div>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Customers · {twelveMonths(kept)}</h3>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Customers" value={String(kept.customers)} detail={`${kept.new} new · ${kept.repeatCustomers} bought in two or more months (${pct(kept.repeatRate)})`} href={financeHref} />
        <StatTile label="Churn" value={pct(kept.churnRate)} detail={kept.before ? `${kept.before - kept.kept} of ${kept.before} customers from the year before stopped buying · ${pct(kept.retentionRate)} kept` : "No customers on record for the year before"} tone={churnHigh(kept) ? "warning" : undefined} href="/portfolio?view=analytics#an-kept" />
        <StatTile label="Revenue per customer" value={kept.revenuePerCustomer ? inr(n(kept.revenuePerCustomer)) : "—"} detail={`${inr(n(kept.sales))} sales before GST ÷ ${kept.customers} customers`} href={financeHref} />
        <StatTile label="Largest customer" value={pct(kept.topShare)} detail={kept.topCustomer ? `of sales: ${kept.topCustomer} · five largest ${pct(kept.top5Share)}` : "No sales yet"} tone={concentrated(kept) ? "warning" : undefined} href={financeHref} />
      </div>
    </div>}
    {sales && <SalesTiles now={sales.current} before={sales.previous} href={crmHref} />}
  </div>;
}

function SalesTiles({ now, before, href }: { now: SalesRatios; before: SalesRatios; href: string }) {
  const avgBefore = before.avgDealSize ? n(before.avgDealSize) : null;
  return <div>
    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Deals closed this period</h3>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile label="Win rate" value={pct(now.winRate)} detail={`${now.won} won, ${now.lost} lost${was(now.winRate, before.winRate)}`} tone={now.winRate != null && before.winRate != null && now.winRate <= before.winRate - 15 ? "warning" : undefined} href={href} />
      <StatTile label="Average deal won" value={now.avgDealSize ? inr(n(now.avgDealSize)) : "—"} detail={`${inr(n(now.wonValue))} won${avgBefore != null ? ` · was ${inr(avgBefore)}` : ""}`} href={href} />
      <StatTile label="Days to win" value={now.cycleDays == null ? "—" : String(now.cycleDays)} detail={`From enquiry to won, on average${was(now.cycleDays, before.cycleDays, " days")}`} href={href} />
      <StatTile label="Lost" value={String(now.lost)} detail={`Closed without a sale${before.lost ? ` · ${before.lost} in the same days before` : ""}`} href={href} />
    </div>
  </div>;
}

/** Every company's key ratios side by side, for the Portfolio. */
export function KeyRatiosTable({ list }: { list: PortfolioCompany[] }) {
  const rows = list.filter((item) => item.customerFigures || item.sales);
  if (!rows.length) return null;
  return <section className="rounded-xl border border-border bg-surface p-5">
    <h2 className="text-sm font-semibold">Key ratios</h2>
    <p className="mt-1 text-xs text-muted-foreground">Customers over the last twelve finished months against the twelve before; deals closed in this period. Amber is worth a look: churn of 30% or more, or one customer with 40% or more of sales.</p>
    <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[820px] text-sm">
      <thead><tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
        <th className="py-2 pr-3">Company</th><th className="px-3 py-2 text-right">Customers</th><th className="px-3 py-2 text-right">Churn</th><th className="px-3 py-2 text-right">Repeat buyers</th><th className="px-3 py-2 text-right">Revenue per customer</th><th className="px-3 py-2 text-right">Largest customer</th><th className="px-3 py-2 text-right">Win rate</th><th className="px-3 py-2 text-right">Average deal</th><th className="py-2 pl-3 text-right">Days to win</th>
      </tr></thead>
      <tbody>{rows.map((item) => {
        const kept = item.customerFigures, now = item.sales?.current;
        return <tr key={item.id} className="border-b border-border last:border-0">
          <td className="py-2 pr-3 font-medium">{item.name}</td>
          <td className="px-3 py-2 text-right tabular-nums">{kept ? kept.customers : "—"}</td>
          <td className={`px-3 py-2 text-right tabular-nums ${kept && churnHigh(kept) ? "font-semibold text-amber-700 dark:text-amber-400" : ""}`}>{pct(kept?.churnRate)}</td>
          <td className="px-3 py-2 text-right tabular-nums">{pct(kept?.repeatRate)}</td>
          <td className="px-3 py-2 text-right tabular-nums">{kept?.revenuePerCustomer ? inr(n(kept.revenuePerCustomer)) : "—"}</td>
          <td className={`px-3 py-2 text-right tabular-nums ${kept && concentrated(kept) ? "font-semibold text-amber-700 dark:text-amber-400" : ""}`} title={kept?.topCustomer ?? undefined}>{pct(kept?.topShare)}</td>
          <td className="px-3 py-2 text-right tabular-nums">{pct(now?.winRate)}</td>
          <td className="px-3 py-2 text-right tabular-nums">{now?.avgDealSize ? inr(n(now.avgDealSize)) : "—"}</td>
          <td className="py-2 pl-3 text-right tabular-nums">{now?.cycleDays ?? "—"}</td>
        </tr>;
      })}</tbody>
    </table></div>
  </section>;
}
