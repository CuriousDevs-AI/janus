"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { demoMode } from "@/lib/demo-mode";
import { useSession } from "@/components/auth/session-provider";
import { PORTFOLIO_ROLES } from "@/lib/access";
import { LivePortfolio } from "@/features/portfolio/components/live-portfolio";
import { DemoPortfolio } from "@/features/portfolio/demo/demo-portfolio";

/** A real account reads its companies from the server; the preview shows its demo companies. */
export function PortfolioPage() {
  const session = useSession();
  const router = useRouter();
  // A person whose role in every tenant lacks portfolio:read must not see the Portfolio.
  const allowed = demoMode || session.tenants.some((item) => PORTFOLIO_ROLES.includes(item.role) && item.status === "active");
  useEffect(() => { if (!allowed) router.replace("/"); }, [allowed, router]);
  if (!allowed) return null;
  return demoMode ? <DemoPortfolio /> : <LivePortfolio />;
}
