"use client";

import { demoMode } from "@/lib/demo-mode";
import { LivePortfolio } from "@/features/portfolio/components/live-portfolio";
import { DemoPortfolio } from "@/features/portfolio/demo/demo-portfolio";

/** A real account reads its companies from the server; the preview shows its demo companies. */
export function PortfolioPage() {
  return demoMode ? <DemoPortfolio /> : <LivePortfolio />;
}
