"use client";

import { Eye, ShieldAlert } from "lucide-react";
import { demoMode } from "@/lib/demo-mode";
import { useSession } from "@/components/auth/session-provider";
import { PORTFOLIO_ROLES, roleLabel } from "@/lib/access";
import { PageHeader } from "@/components/shared/page-header";
import { LivePortfolio } from "@/features/portfolio/components/live-portfolio";
import { DemoPortfolio } from "@/features/portfolio/demo/portfolio-panel";

const ROLE_DESCRIPTIONS: [string, string, string][] = [
  ["group_analyst", "Read-only", "Leads, deals, people, support, compliance. No money from the books."],
  ["group_finance", "Group finance", "Everything in Read-only, plus sales, costs, profit and what is owed."],
  ["operations_manager", "Operations manager", "Portfolio without money; runs stock, projects and approvals in each company."],
  ["finance_manager", "Finance manager", "Portfolio with money; records bills and decides approvals in each company."],
  ["company_admin", "Company administrator", "Runs the company and sees it on the Portfolio with money."],
];

/** A real account reads its companies from the server; the preview shows its demo companies. */
export function PortfolioPage() {
  const session = useSession();
  const allowed = demoMode || session.tenants.some((item) => PORTFOLIO_ROLES.includes(item.role) && item.status === "active");
  if (!allowed) {
    const companies = session.tenants.filter((item) => item.status === "active");
    return <div className="mx-auto flex max-w-[1000px] flex-col pb-10">
      <PageHeader title="Portfolio" description="Every company you own or were shared, side by side." />
      <div className="flex flex-col gap-6 px-6">
        <div className="rounded-lg border border-border bg-surface p-6">
          <div className="flex items-start gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-warning/10"><ShieldAlert className="size-5 text-warning" /></div>
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold">Portfolio access has not been shared with you</h2>
              <p className="text-sm text-muted-foreground">The Portfolio shows every company side by side: their leads, deals, people, money and compliance. An Owner shares it from the Portfolio&apos;s Access page.</p>
            </div>
          </div>
        </div>

        {companies.length > 0 && <div className="rounded-lg border border-border bg-surface p-6">
          <h3 className="mb-1 text-sm font-semibold">Your companies</h3>
          <p className="mb-3 text-xs text-muted-foreground">You belong to {companies.length === 1 ? "one company" : `${companies.length} companies`}, but none has shared Portfolio access with you yet.</p>
          <ul className="flex flex-col gap-1">{companies.map((item) => <li key={item.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
            <span className="font-medium">{item.name}</span>
            <span className="text-xs text-muted-foreground">{roleLabel(item.role)}</span>
          </li>)}</ul>
        </div>}

        <div className="rounded-lg border border-border bg-surface p-6">
          <h3 className="mb-1 text-sm font-semibold">What each Portfolio role sees</h3>
          <p className="mb-3 text-xs text-muted-foreground">Ask the Owner to share you with the role that fits your work.</p>
          <dl className="grid gap-2 sm:grid-cols-2">{ROLE_DESCRIPTIONS.map(([key, label, detail]) => <div key={key} className="flex flex-col gap-1 rounded-md border border-border bg-surface-2 p-3">
            <dt className="flex items-center gap-2 text-sm font-medium"><Eye className="size-3.5 text-muted-foreground" />{label}</dt>
            <dd className="text-xs text-muted-foreground">{detail}</dd>
          </div>)}</dl>
        </div>
      </div>
    </div>;
  }
  return demoMode ? <DemoPortfolio /> : <LivePortfolio />;
}
