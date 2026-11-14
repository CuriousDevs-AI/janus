"use client";

import * as React from "react";
import { Banknote, CalendarOff, Clock, Coins, FileCheck2, Handshake, Landmark, PackageX, Receipt, Scale, Siren, Timer, TrendingDown, TriangleAlert, Users, Wallet } from "lucide-react";
import { FilterChips } from "@/components/shared/stat-tile";
import { Intelligence, usePortfolioApi, type DepartmentChat, type PortfolioPeriodKey, type PortfolioSummary } from "@/features/portfolio";

/**
 * Each department's chat: Janus, on the company's own records, opening on what that team asks most.
 * Every question here is one Janus rules answer from the records, free and with no model.
 */
export const departmentChats: Record<string, DepartmentChat> = {
  "crm-sales": { name: "CRM & Sales", topic: "sales", placeholder: "Ask about leads, deals, the pipeline or customers…", questions: [
    ["Why did sales change?", TrendingDown], ["Why did leads change?", Users], ["How big is our pipeline?", Handshake],
    ["What is our win rate?", Scale], ["Who is my biggest customer?", Landmark], ["What do customers owe us?", Wallet],
  ] },
  "hr-people": { name: "HR & People", topic: "people", placeholder: "Ask about people, leave, claims or payroll…", questions: [
    ["Who is on leave today?", CalendarOff], ["How many people do we have?", Users], ["Any expense claims waiting?", Receipt],
    ["What does payroll cost each month?", Banknote], ["What approvals are waiting?", Clock], ["Any PF, ESI or TDS filings due?", FileCheck2],
  ] },
  "finance-accounting": { name: "Finance", topic: "finance", placeholder: "Ask about profit, money owed, cash, GST or TDS…", questions: [
    ["How much profit did we make?", Scale], ["What do customers owe us?", Wallet], ["What do we owe suppliers?", Receipt],
    ["How much cash is in the bank?", Coins], ["How much GST do we pay this month?", Landmark], ["Any GST or TDS filings due?", FileCheck2],
  ] },
  "operations-inventory": { name: "Operations & Inventory", topic: "stock", placeholder: "Ask about stock, reorder levels, batches or suppliers…", questions: [
    ["What stock is below reorder level?", PackageX], ["Which batches are expiring?", Timer], ["What do we owe suppliers?", Receipt],
    ["What approvals are waiting?", Clock], ["What needs my attention?", TriangleAlert],
  ] },
  "customer-support": { name: "Customer Support", topic: "support", placeholder: "Ask about tickets, urgent or escalated work, or customers…", questions: [
    ["How many tickets are open?", Siren], ["Any escalated tickets?", TriangleAlert], ["Who is my biggest customer?", Landmark],
    ["What needs my attention?", Clock],
  ] },
  "projects-delivery": { name: "Projects & Delivery", topic: "projects", placeholder: "Ask about projects, milestones or tasks…", questions: [
    ["Which projects are late?", Timer], ["How many projects are active?", Handshake], ["What needs my attention?", TriangleAlert],
    ["What approvals are waiting?", Clock],
  ] },
};

const periods: { value: PortfolioPeriodKey; label: string }[] = [
  { value: "month", label: "This month" },
  { value: "quarter", label: "This quarter" },
  { value: "fy", label: "This financial year" },
];

/** A department's chat on the company open now. A department without its own questions gets the owner's. */
export function DepartmentIntelligence({ workspaceId, workspaceName }: { workspaceId: string; workspaceName: string }) {
  const department: DepartmentChat = departmentChats[workspaceId] ?? { name: workspaceName, placeholder: "Ask about this business's records…", questions: [["What needs my attention?", TriangleAlert], ["What approvals are waiting?", Clock]] };
  const [period, setPeriod] = React.useState<PortfolioPeriodKey>("month");
  const summary = usePortfolioApi<PortfolioSummary>(`/portfolio/summary?period=${period}`, { keepPrevious: true });
  const company = summary.data?.companies.find((item) => item.current);
  return <div className="mx-auto flex max-w-[1240px] flex-col gap-5 px-4 py-6 sm:px-6 sm:py-7">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">{department.name} AI chat</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Ask {department.name}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Answers come from the records of {company?.name ?? "your business"}, with the figure behind each one. Janus does not guess, and says when the records cannot answer.</p>
      </div>
      <FilterChips label="Period" value={period} options={periods} onChange={setPeriod} />
    </div>
    {summary.error && !summary.data ? <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">Janus could not read this company&apos;s records: {summary.error}</p>
      : !company ? <p className="text-sm text-muted-foreground" role="status">{summary.loading ? "Reading your records…" : "Your role does not include this company's figures, so Janus has nothing to answer from. Ask the Owner for access."}</p>
      : <Intelligence key={workspaceId} list={[company]} company={company} period={summary.data?.period} department={department} />}
  </div>;
}
