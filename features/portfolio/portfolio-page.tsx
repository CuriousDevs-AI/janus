"use client";

import { ShieldAlert } from "lucide-react";
import { demoMode } from "@/lib/demo-mode";
import { useSession } from "@/components/auth/session-provider";
import { PORTFOLIO_ROLES } from "@/lib/access";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { LivePortfolio } from "@/features/portfolio/components/live-portfolio";
import { DemoPortfolio } from "@/features/portfolio/demo/demo-portfolio";

/** A real account reads its companies from the server; the preview shows its demo companies. */
export function PortfolioPage() {
  const session = useSession();
  // A person whose role in every tenant lacks portfolio:read must not see the Portfolio.
  const allowed = demoMode || session.tenants.some((item) => PORTFOLIO_ROLES.includes(item.role) && item.status === "active");
  if (!allowed) return <div className="mx-auto flex max-w-[1000px] flex-col pb-10">
    <PageHeader title="Portfolio" description="Every company you own or were shared, side by side." />
    <div className="px-6">
      <EmptyState icon={ShieldAlert} title="You do not have access to the Portfolio" description="Ask the Owner to share Portfolio access with you. They can do this from the Portfolio's Access page." />
    </div>
  </div>;
  return demoMode ? <DemoPortfolio /> : <LivePortfolio />;
}
