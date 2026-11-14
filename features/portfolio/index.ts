/**
 * Portfolio: every company a person owns, or was shared, side by side.
 *
 * Other code uses only what is exported here. Inside: `components/` holds one file per view,
 * `lib/` the plain functions they share, `types.ts` what the /portfolio API returns, and `demo/`
 * the preview's version, which a real account never loads.
 */
export { PortfolioPage } from "@/features/portfolio/portfolio-page";
export { ChoosePlan } from "@/features/portfolio/components/choose-plan";
export type { PortfolioCompany, PortfolioPeriod, PortfolioPeriodKey, PortfolioRetention, PortfolioSummary, PortfolioTrends } from "@/features/portfolio/types";
// Business Management shows one company with the Portfolio's figures and words for them.
export { change, day, healthName, healthTone, inr, todayIst } from "@/features/portfolio/lib/format";
export { usePortfolioApi } from "@/features/portfolio/lib/use-portfolio-api";
// Janus Intelligence in Business Management is the Portfolio's, for the one company.
export { Intelligence, type DepartmentChat } from "@/features/portfolio/components/intelligence";
export { KnowledgeCard } from "@/features/portfolio/components/intelligence-setup";
export { WorkInbox } from "@/features/portfolio/components/work-inbox";
// Business Settings shows and edits the same company record the Portfolio does.
export { CompanyEditor, PeopleList, entityNames } from "@/features/portfolio/components/company-editor";
export { businessModels } from "@/features/portfolio/lib/business";
export type { PortfolioRegistration } from "@/features/portfolio/types";
export { RATE_MINIMUM } from "@/features/portfolio/lib/companies";
