"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/settings/section-ui";
import { useSession } from "@/components/auth/session-provider";
import { usePortfolioApi } from "@/features/portfolio/lib/use-portfolio-api";
import { Access } from "@/features/portfolio/components/access";
import { Activity } from "@/features/portfolio/components/activity";
import { WorkInbox } from "@/features/portfolio/components/work-inbox";
import { Analytics } from "@/features/portfolio/components/analytics";
import { Notifications, ThresholdsCard } from "@/features/portfolio/components/attention";
import { AddCompany, Companies } from "@/features/portfolio/components/companies";
import { ComplianceView } from "@/features/portfolio/components/compliance";
import { ExportButtons } from "@/features/portfolio/components/export-buttons";
import { Finance } from "@/features/portfolio/components/finance";
import { Intelligence } from "@/features/portfolio/components/intelligence";
import { Overview } from "@/features/portfolio/components/overview";
import { PeriodBar } from "@/features/portfolio/components/period-bar";
import { PreviewRole, previewRoles, useOpenInRouter, withoutMoney, type WithMoney } from "@/features/portfolio/lib/companies";
import { roleLabel } from "@/lib/access";
import type { PortfolioPeriodKey, PortfolioSummary } from "@/features/portfolio/types";

const previewKey = "janus.portfolio-preview";
const previewEvent = "janus-portfolio-preview";
function readPreview() { try { return window.sessionStorage.getItem(previewKey); } catch { return null; } }
function writePreview(role: string | null) {
  try { if (role) window.sessionStorage.setItem(previewKey, role); else window.sessionStorage.removeItem(previewKey); } catch { /* private mode: the address still carries it */ }
  window.dispatchEvent(new Event(previewEvent));
}
function subscribePreview(onChange: () => void) {
  window.addEventListener(previewEvent, onChange);
  return () => window.removeEventListener(previewEvent, onChange);
}

const titles: Record<string, [string, string]> = {
  overview: ["Overview", "Every company you own, at a glance."],
  analytics: ["Analytics", "The same measures for every company, side by side."],
  finance: ["Finance", "Money in and out, by company."],
  companies: ["Companies", "Every company: its details, people and standing. Add, edit or open one."],
  intelligence: ["Janus Intelligence", "Ask a question across all your companies."],
  notifications: ["Notifications", "What needs you, from every company."],
  compliance: ["Compliance", "What each company must file, what is missing, and recording filings."],
  work: ["Work inbox", "Everything that needs someone to act, across your companies."],
  activity: ["Activity", "What happened lately, in every company."],
  people: ["Portfolio access", "Who else sees these companies together, and how much."],
};
// The views that report on a period, and so show the period bar and the board pack.
const periodViews = ["overview", "analytics", "finance"];

/** The Portfolio for a real account: every company the person owns or was shared, as the server reports it. */
export function LivePortfolio() {
  const params = useSearchParams();
  const router = useRouter();
  const view = params.get("view") ?? "overview";
  const [adding, setAdding] = React.useState(params.get("add") === "1");
  const period: PortfolioPeriodKey = (["month", "quarter", "fy"] as const).find((key) => key === params.get("period")) ?? "month";
  // A new period keeps the figures on screen, dimmed, until its own arrive.
  const summary = usePortfolioApi<PortfolioSummary>(`/portfolio/summary?period=${period}`, { keepPrevious: true });
  const session = useSession();
  useOpenInRouter();
  // Only an Owner adds companies and shares the Portfolio; a group role only reads it.
  const realOwner = session.tenants.some((item) => item.role === "owner" && item.status === "active");
  // An Owner can look at the Portfolio as a group role would see it.
  // A preview lasts until "Exit preview", across every Portfolio page in this tab, not only the
  // page whose address carried it.
  const fromAddress = previewRoles.find((role) => role === params.get("preview")) ?? null;
  const remembered = React.useSyncExternalStore(subscribePreview, readPreview, () => null);
  React.useEffect(() => { if (fromAddress) writePreview(fromAddress); }, [fromAddress]);
  const preview = realOwner ? fromAddress ?? previewRoles.find((role) => role === remembered) ?? null : null;
  const owner = realOwner && !preview;
  // An Owner or a Portfolio administrator shares the Portfolio.
  const shares = !preview && session.tenants.some((item) => (item.role === "owner" || item.role === "group_admin") && item.status === "active");
  const [title, base] = titles[view] ?? titles.overview;
  const description = !owner && view === "overview" ? "Every company shared with you, at a glance." : base;
  const list = (summary.data?.companies ?? []).map((item) => preview === "group_analyst" ? withoutMoney(item) : item);
  const withMoney = list.filter((item): item is WithMoney => item.money !== null);

  function body() {
    if (summary.loading) return <PortfolioSkeleton />;
    if (summary.error) return <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-danger">{summary.error}<Button size="sm" variant="secondary" onClick={summary.reload}>Try again</Button></div>;
    if (!summary.data || list.length === 0) return <p className="text-sm text-muted-foreground" role="status">The Portfolio shows the companies you own, and those an Owner shared with you. There are none yet.</p>;
    switch (view) {
      case "analytics": return <Analytics list={list} period={summary.data.period} />;
      case "finance": return withMoney.length === 0
        ? <SectionCard title="Money is not shared with you" description="Your role covers sales and people, not money."><p className="text-sm text-muted-foreground">Ask the Owner for a role with money, such as Finance manager, if you need what customers owe and what is due to suppliers.</p></SectionCard>
        : <Finance list={withMoney} hidden={list.length - withMoney.length} period={summary.data.period} />;
      case "companies": return <Companies list={list} period={summary.data.period} onAdd={owner ? () => setAdding(true) : undefined} onSaved={summary.reload} />;
      case "people": return shares
        ? <Access list={list} owner={owner} />
        : <SectionCard title="Portfolio access" description="Only an Owner or a Portfolio administrator shares the Portfolio."><p className="text-sm text-muted-foreground">They decide who else sees these companies.</p></SectionCard>;
      case "notifications": return <><Notifications list={list} /><ThresholdsCard /></>;
      case "intelligence": return <Intelligence list={list} period={summary.data.period} />;
      case "compliance": return <ComplianceView list={list} onChanged={summary.reload} />;
      case "work": return <WorkInbox list={list} />;
      case "activity": return <Activity list={list} />;
      default: return <Overview list={list} owner={owner} period={summary.data.period} />;
    }
  }

  return <PreviewRole.Provider value={preview}><div className="mx-auto flex max-w-[1240px] flex-col">
    {preview && <div role="status" className="mx-6 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-accent-border bg-accent-muted px-3 py-2 text-sm print:hidden"><span>You are seeing the Portfolio as a <strong>{roleLabel(preview)}</strong> would, on every page until you exit. {preview === "group_analyst" ? "Money from the books is hidden: sales, costs, profit, what customers owe, bills and salaries. Deal values from CRM stay visible, as they are for this role." : "Money is shown."} They cannot open the companies or change anything.</span><Button size="sm" variant="secondary" onClick={() => { writePreview(null); router.replace("/portfolio?view=people"); }}>Exit preview</Button></div>}
    <PageHeader title={title} description={description} actions={list.length > 0 && <div className="flex flex-wrap gap-2">{summary.data && periodViews.includes(view) && <ExportButtons list={list} period={summary.data.period} />}</div>} />
    <div className="flex flex-col gap-6 px-6 pb-10">
      {!summary.loading && !summary.error && summary.data && list.length > 0 && periodViews.includes(view) && <PeriodBar period={summary.data.period} chosen={period} updating={summary.stale} />}
      <div aria-busy={summary.stale} className={`flex flex-col gap-6 transition-opacity duration-200 ${summary.stale ? "pointer-events-none opacity-50" : ""}`}>{body()}</div>
    </div>
    {adding && <AddCompany onClose={() => setAdding(false)} />}
  </div></PreviewRole.Provider>;
}

/** The shape of a Portfolio page while its first figures load, so nothing jumps when they arrive. */
function PortfolioSkeleton() {
  const block = "animate-pulse rounded-xl border border-border bg-surface-2";
  return <div role="status" aria-label="Loading your companies" className="flex flex-col gap-6">
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[0, 1, 2, 3].map((index) => <div key={index} className={`${block} h-[104px]`} />)}</div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((index) => <div key={index} className={`${block} h-[76px]`} />)}</div>
    <div className={`${block} h-[280px]`} />
  </div>;
}
