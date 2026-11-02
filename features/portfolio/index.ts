/**
 * Portfolio: every company a person owns, or was shared, side by side.
 *
 * Other code uses only what is exported here. Inside: `components/` holds one file per view,
 * `lib/` the plain functions they share, `types.ts` what the /portfolio API returns, and `demo/`
 * the preview's version, which a real account never loads.
 */
export { PortfolioPage } from "@/features/portfolio/portfolio-page";
export type { PortfolioCompany, PortfolioSummary } from "@/features/portfolio/types";
