"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, CircleCheck, FileCheck2, Gavel } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FilterChips, StatTile, workspaceHref } from "@/components/shared/stat-tile";
import { change, day, healthName, healthTone, inr, type PortfolioCompany, type PortfolioPeriod, type PortfolioPeriodKey } from "@/features/portfolio";

const n = (value: string | null | undefined) => Number(value ?? 0);
const card = "rounded-xl border border-[#e4e4df] bg-white p-5";
const dot = { high: "bg-danger", medium: "bg-warning", low: "bg-muted-foreground/50" } as const;
const filingTone = { overdue: "danger", due_soon: "warning", upcoming: "neutral", filed: "success" } as const;
const filingWord = { overdue: "Past due", due_soon: "Due this week", upcoming: "Coming up", filed: "Filed" } as const;

/**
 * The Owner's view of one company, from the same figures the Portfolio shows for it: what needs
 * them, money in and out, sales and people this period against the same days before, decisions
 * waiting and filings due. Every figure opens the screen where it is dealt with.
 */
export function LiveBusinessOverview({ company, period, onPeriod, stale }: { company: PortfolioCompany; period: PortfolioPeriod; onPeriod: (key: PortfolioPeriodKey) => void; stale: boolean }) {
  const now = company.period.current, before = company.period.previous;
  const money = company.money, books = company.books?.current;
  const finance = (view: string, extra: Record<string, string> = {}) => workspaceHref("finance-accounting", view, extra);
  const crm = (path: string) => `${path}?workspace=crm-sales`;
  const hr = (view: string) => workspaceHref("hr-people", view);
  const filings = company.compliance.filter((item) => item.status !== "filed").sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const late = filings.filter((item) => item.status === "overdue").length;
  const waiting = company.approvals.reduce((sum, item) => sum + item.count, 0);
  const compliance = `/portfolio?view=compliance&company=${company.id}`;

  return <div className={`flex flex-col gap-6 transition-opacity ${stale ? "opacity-60" : ""}`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {company.health && <Badge variant={healthTone[company.health.status]}>{healthName[company.health.status]}</Badge>}
        <span className="text-muted-foreground">{period.label}, against the same days before</span>
      </div>
      <FilterChips<PortfolioPeriodKey> label="Period" value={period.key} onChange={onPeriod} options={[{ value: "month", label: "This month" }, { value: "quarter", label: "This quarter" }, { value: "fy", label: "This financial year" }]} />
    </div>

    <section className={card} aria-label="Needs you">
      <div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Needs you</h3>{company.attention.length > 0 && <span className="text-xs text-muted-foreground">{company.attention.length} {company.attention.length === 1 ? "thing" : "things"}, most urgent first</span>}</div>
      {company.attention.length === 0 ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><CircleCheck className="size-4 text-success" aria-hidden />Nothing needs you right now.</p>
        : <ul className="flex flex-col">{company.attention.map((item, index) => <li key={index}>
          <Link href={item.to.startsWith("/portfolio?view=compliance") ? compliance : item.to} className="-mx-2 flex items-start justify-between gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-surface-2">
            <span className="flex items-start gap-2.5"><span className={`mt-1.5 size-2 shrink-0 rounded-full ${dot[item.severity]}`} aria-label={`${item.severity} urgency`} />{item.text}</span>
            <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        </li>)}</ul>}
    </section>

    {money && books && <div>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Money</h3>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Sales" value={inr(n(books.netSales))} detail={`${change(n(books.netSales), n(company.books?.previous.netSales))} · before GST`} href={finance("invoices")} />
        <StatTile label="Collected" value={inr(n(now.collected))} detail={change(n(now.collected), n(before.collected))} href={finance("invoices", { status: "paid" })} />
        <StatTile label="Customers owe" value={inr(n(money.receivable))} detail={n(money.overdue) > 0 ? `${inr(n(money.overdue))} overdue on ${money.overdueInvoices} invoices` : "Nothing overdue"} tone={n(money.overdue) > 0 ? "warning" : undefined} href={n(money.overdue) > 0 ? finance("invoices", { status: "overdue" }) : finance("receivables")} />
        <StatTile label="Profit before salaries" value={inr(n(books.profitBeforePayroll))} detail={`Sales ${inr(n(books.netSales))} less bills ${inr(n(books.costs))}`} tone={n(books.profitBeforePayroll) < 0 ? "warning" : undefined} href={finance("profit-loss")} />
      </div>
    </div>}

    <div>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sales and people</h3>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Leads in" value={String(now.leads)} detail={change(now.leads, before.leads)} href={crm("/leads")} />
        <StatTile label="Deals won" value={String(now.wonDeals)} detail={`Worth ${inr(n(now.wonValue))}`} href={crm("/deals")} />
        <StatTile label="Open pipeline" value={inr(n(company.crm.pipelineValue))} detail={`${company.crm.openDeals} open deals`} href={crm("/deals")} />
        {company.people ? <StatTile label="People" value={String(company.people.headcount)} detail={company.people.onLeaveToday ? `${company.people.onLeaveToday} on leave today` : "Nobody on leave today"} href={hr("employees")} />
          : <StatTile label="Members" value={String(company.members)} detail="People who can sign in" href="/settings?tab=team" />}
      </div>
    </div>

    <div className="grid gap-4 xl:grid-cols-2">
      <section className={card} aria-label="Waiting for a decision">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Gavel className="size-4 text-muted-foreground" aria-hidden />Waiting for a decision{waiting > 0 && <Badge variant="warning">{waiting}</Badge>}</h3>
        {company.approvals.length === 0 ? <p className="text-sm text-muted-foreground">No approvals are waiting.</p>
          : <ul className="flex flex-col">{company.approvals.map((item) => <li key={item.kind}><Link href={item.to} className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-surface-2"><span>{item.count} {item.count === 1 ? item.one : item.label}</span><ArrowRight className="size-4 text-muted-foreground" aria-hidden /></Link></li>)}</ul>}
      </section>
      <section className={card} aria-label="Filings">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><FileCheck2 className="size-4 text-muted-foreground" aria-hidden />Filings{late > 0 && <Badge variant="danger">{late} past due</Badge>}</h3>
        {!company.complianceSetUp ? <p className="text-sm text-muted-foreground">No filings are set up for {company.name} yet. <Link href={compliance} className="text-accent hover:underline">Choose what it files</Link></p>
          : filings.length === 0 ? <p className="text-sm text-muted-foreground">Every filing due is recorded as filed.</p>
          : <><ul className="flex flex-col">{filings.slice(0, 5).map((item) => <li key={item.key}><Link href={compliance} className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-surface-2"><span>{item.label} <span className="text-muted-foreground">· {item.period}</span></span><span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">{day(item.dueOn)}<Badge variant={filingTone[item.status]}>{filingWord[item.status]}</Badge></span></Link></li>)}</ul>
            {filings.length > 5 && <Link href={compliance} className="mt-2 inline-block text-xs text-accent hover:underline">All {filings.length} filings due</Link>}</>}
      </section>
    </div>

    <div>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Workspaces</h3>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Space name="CRM & Sales" href={crm("/dashboard")} lines={[`${company.crm.leads} leads · ${company.crm.openDeals} open deals`, `${company.crm.wonDeals} won, ${company.crm.lostDeals} lost, all time`]} />
        {money && <Space name="Finance & Accounting" href={finance("overview")} lines={[`${inr(n(money.receivable))} owed to you · ${inr(n(money.payable))} you owe`, n(money.payableLate) > 0 ? `${inr(n(money.payableLate))} of bills past due` : n(money.payableDueThisWeek) > 0 ? `${inr(n(money.payableDueThisWeek))} of bills due this week` : "No bill past due"]} warn={n(money.payableLate) > 0} />}
        {company.people && <Space name="HR & People" href={hr("employees")} lines={[`${company.people.headcount} people${company.people.monthlyPayroll ? ` · ${inr(n(company.people.monthlyPayroll))} payroll a month` : ""}`, company.people.pendingLeave + company.people.pendingClaims > 0 ? `${company.people.pendingLeave} leave and ${company.people.pendingClaims} claims waiting` : "No leave or claims waiting"]} warn={company.people.pendingLeave + company.people.pendingClaims > 0} />}
        {company.stock && <Space name="Operations & Inventory" href={workspaceHref("operations-inventory", "overview")} lines={company.stock.items ? [`${company.stock.items} items · ${company.stock.belowReorder} low`, `${company.stock.dispatchesInTransit} dispatches on the way · ${company.stock.expiringBatches} batches expiring`] : ["No items yet"]} warn={company.stock.belowReorder > 0} />}
        {company.delivery && <Space name="Projects & Delivery" href={workspaceHref("projects-delivery", "overview")} lines={company.delivery.activeProjects ? [`${company.delivery.activeProjects} active · ${company.delivery.lateProjects} late`, `${company.delivery.overdueTasks} tasks and ${company.delivery.overdueMilestones} milestones overdue`] : ["No active projects"]} warn={company.delivery.lateProjects > 0} />}
        {company.support && <Space name="Customer Support" href={workspaceHref("customer-support", "overview")} lines={company.support.open ? [`${company.support.open} open · ${company.support.urgent} urgent`, `${company.support.escalated} escalated · ${company.support.olderThanWeek} older than a week`] : ["No open tickets"]} warn={company.support.urgent + company.support.escalated > 0} />}
      </div>
    </div>
  </div>;
}

function Space({ name, href, lines, warn = false }: { name: string; href: string; lines: string[]; warn?: boolean }) {
  return <Link href={href} className="group rounded-xl border border-[#e4e4df] bg-white p-4 transition-[border-color,box-shadow] hover:border-accent-border hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
    <p className="flex items-center justify-between gap-2 text-sm font-medium">{name}<span className="flex items-center gap-2">{warn && <span className="size-2 rounded-full bg-warning" aria-label="Something here needs a look" />}<ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden /></span></p>
    {lines.map((line, index) => <p key={index} className="mt-1 text-xs text-muted-foreground">{line}</p>)}
  </Link>;
}
