"use client";

import * as React from "react";
import { ArrowRight, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { openIn, useRoles } from "@/features/portfolio/lib/companies";
import { day, inr, severityName, severityTone } from "@/features/portfolio/lib/format";
import type { PortfolioCompany } from "@/features/portfolio/types";

export type NoticeItem = { key: string; severity: "high" | "medium" | "low"; text: string; to: string; company: PortfolioCompany; detail?: string; due?: string | null };

/** A compliance item opens that company's filings, not every company's. */
const forCompany = (to: string, company: PortfolioCompany) => to.startsWith("/portfolio?view=compliance") && !to.includes("company=") ? `${to}&company=${company.id}` : to;

/** A Work inbox or Needs you first item, as the detail popup shows it. */
export const fromWork = (item: { key: string; priority: "high" | "medium" | "low"; title: string; detail: string; due: string | null; to: string; company: PortfolioCompany }): NoticeItem => ({ key: item.key, severity: item.priority, text: item.title, detail: item.detail, due: item.due, to: item.to, company: item.company });

const n = (value: string | null | undefined) => Number(value ?? 0);

/** What a notification is about, from its words and where it opens. */
export function categoryOf(text: string, to: string) {
  if (/approval/.test(text)) return "Approvals";
  if (/document|licen[cs]e|renew/i.test(text)) return "Documents";
  if (to.includes("compliance")) return "Compliance";
  if (to.includes("finance") || /cash|loss|losing/i.test(text)) return "Money";
  if (to.includes("projects")) return "Delivery";
  if (to.includes("tickets")) return "Support";
  if (to.includes("operations")) return "Stock";
  return "Other";
}

/** The screen a notification opens, in words. */
function destination(to: string) {
  const view = new URLSearchParams(to.split("?")[1] ?? "").get("view");
  if (to.startsWith("/portfolio")) return `Portfolio › ${view === "compliance" ? "Compliance" : view ? view[0].toUpperCase() + view.slice(1) : "Overview"}`;
  if (to.includes("finance-accounting")) return `Finance › ${({ receivables: "Payments & Receivables", payables: "Bills & Payables", funds: "Fund requests", "credit-notes": "Credit notes", approvals: "Approvals" } as Record<string, string>)[view ?? ""] ?? "Overview"}`;
  if (to.includes("hr-people")) return `HR & People › ${view === "approvals" ? "Leave approvals" : view === "expenses" ? "Expense claims" : "Overview"}`;
  if (to.includes("projects-delivery")) return "Projects & Delivery";
  if (to.includes("operations-inventory")) return "Operations & Inventory";
  if (to.startsWith("/tickets")) return "Customer Support › Tickets";
  if (to.startsWith("/approvals")) return "Approvals";
  return "The company";
}

/** What the notification means, and the usual next step. */
const guidance: Record<string, [string, string]> = {
  Money: ["Money owed to or by the company is late, or cash is running short.", "Open the list, chase the oldest amounts first, and pay or reschedule late supplier bills."],
  Compliance: ["A statutory filing or payment is due or past due and not recorded as filed in Janus.", "File it (or confirm your CA did), then record it as filed so the reminder stops. Late filings can carry fees and interest."],
  Documents: ["A registration, licence or other document has expired or expires soon.", "Renew it, then record the new expiry date and attach the scan."],
  Approvals: ["Requests are waiting for someone to decide.", "Open the queue and approve or reject each one; people are waiting on them."],
  Delivery: ["Projects or milestones are past their dates.", "Open the project, agree new dates with the client or move people onto it."],
  Support: ["Customer tickets are urgent, escalated or old.", "Open the tickets and assign or answer the oldest and most urgent first."],
  Stock: ["Items are at or under their reorder level, or batches are about to expire.", "Raise a purchase requisition, or move or sell the expiring stock."],
  Other: ["Something in the company needs a look.", "Open it to see the details."],
};

/** The company's own figures behind a notification of this kind. */
function facts(category: string, company: PortfolioCompany): [string, string][] {
  const money = company.money;
  switch (category) {
    case "Money": return [
      ...(money ? [["Customers owe", inr(n(money.receivable))], ["Past due", `${inr(n(money.overdue))} on ${money.overdueInvoices} invoice${money.overdueInvoices === 1 ? "" : "s"}`], ["Late over 60 days", inr(n(money.ageing.over60))], ["Supplier bills already late", inr(n(money.payableLate))], ["Bills due in 7 days", inr(n(money.payableDueThisWeek))]] as [string, string][] : []),
      ...(company.cash?.total != null ? [["Cash in the bank", `${inr(n(company.cash.total))} as of ${day(company.cash.asOf)}`]] as [string, string][] : []),
    ];
    case "Compliance": return company.compliance.filter((due) => due.status === "overdue" || due.status === "due_soon").slice(0, 6).map((due) => [`${due.label} · ${due.period}`, `${due.status === "overdue" ? "Past due" : "Due"} ${day(due.dueOn)}`]);
    case "Approvals": return company.approvals.map((item) => [item.label, String(item.count)]);
    case "Delivery": return company.delivery ? [["Active projects", String(company.delivery.activeProjects)], ["Late projects", String(company.delivery.lateProjects)], ["Milestones past due", String(company.delivery.overdueMilestones)], ["Tasks past due", String(company.delivery.overdueTasks)]] : [];
    case "Support": return company.support ? [["Open tickets", String(company.support.open)], ["Urgent or high", String(company.support.urgent)], ["Escalated", String(company.support.escalated)], ["Open over a week", String(company.support.olderThanWeek)]] : [];
    case "Stock": return company.stock ? [["Items", String(company.stock.items)], ["At or under reorder", String(company.stock.belowReorder)], ["Batches expiring in 30 days", String(company.stock.expiringBatches)]] : [];
    default: return [];
  }
}

/**
 * One notification in full: what is wrong, the figures behind it, what it means and what to do,
 * and a button to the screen where it is dealt with, inside its company.
 */
export function NotificationDetail({ item, read, onMarkRead, onClose }: { item: NoticeItem; read: boolean; onMarkRead?: () => void; onClose: () => void }) {
  const { owns } = useRoles();
  const category = categoryOf(item.text, item.to);
  // A few notifications need their own words: no filings set up is not a filing past due.
  const fema = /FEMA/.test(item.text);
  const [meaning, next] = fema
    ? ["Under FEMA, an exporter must bring export money into India within 9 months of shipping. After that the bank (AD bank) reports the shipment to the RBI as outstanding, and penalties can follow.", "Chase the customer for payment now. If they cannot pay in time, ask your AD bank before the 9 months run out for an extension or a write-off, with the reason and proof of follow-up. Tell your CA."]
    : /not set up/i.test(item.text)
    ? ["Janus does not know yet which filings apply to this company, so it cannot remind you of any.", "Open Compliance and say what applies: its GSTIN and GST returns, TDS, PF and ESI, and company filings. Janus then tracks every due date."]
    : /registration details|missing/i.test(item.text)
      ? ["Some of the company's registration details are not recorded.", "Open Compliance and fill in what is missing, such as PAN, TAN or the EPF and ESI codes."]
      : guidance[category] ?? guidance.Other;
  const money = item.company.money;
  const rows: [string, string][] = fema && money ? [["Unpaid over 9 months", `${inr(n(money.unpaidOver9Months))} on ${money.unpaidOver9MonthsInvoices} invoice${money.unpaidOver9MonthsInvoices === 1 ? "" : "s"}`], ...(money.unpaidOldestMonths ? [["Oldest unpaid for", `${money.unpaidOldestMonths} months (the limit is 9)`]] as [string, string][] : []), ["Past due in all", `${inr(n(money.overdue))} on ${money.overdueInvoices} invoice${money.overdueInvoices === 1 ? "" : "s"}`], ["Customers owe", inr(n(money.receivable))]] : facts(category, item.company);
  const to = forCompany(item.to, item.company);
  const inPortfolio = to.startsWith("/portfolio");
  const canGo = inPortfolio || owns(item.company);
  const [going, setGoing] = React.useState(false);
  const go = () => { setGoing(true); onMarkRead?.(); if (inPortfolio) window.location.assign(to); else openIn(item.company, to); };
  return <Dialog open onOpenChange={(open) => !open && !going && onClose()}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2"><Badge variant={severityTone[item.severity]}>{severityName[item.severity]}</Badge><Badge variant="neutral">{category}</Badge><span className="flex items-center gap-1 text-xs text-muted-foreground"><Building2 className="size-3" aria-hidden />{item.company.name}</span></div>
        <DialogTitle className="pt-1 text-base leading-snug">{item.text}</DialogTitle>
        <DialogDescription>{meaning}</DialogDescription>
      </DialogHeader>
      {(item.detail || item.due) && <p className="text-sm">{item.detail}{item.due ? <span className="text-muted-foreground">{item.detail ? " " : ""}Due {day(item.due)}.</span> : null}</p>}
      {rows.length > 0 && <dl className="overflow-hidden rounded-lg border border-border">{rows.map(([label, value], index) => <div key={label} className={`flex justify-between gap-4 px-3 py-2 text-sm ${index ? "border-t border-border" : ""}`}><dt className="text-muted-foreground">{label}</dt><dd className="text-right font-medium tabular-nums">{value}</dd></div>)}</dl>}
      <div className="rounded-lg bg-surface-2 px-3 py-2.5 text-sm"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What to do</p><p className="mt-1">{next}</p></div>
      <p className="text-xs text-muted-foreground">{canGo ? <>Opens <span className="font-medium text-foreground">{destination(to)}{to.includes("company=") && inPortfolio ? `, ${item.company.name} only` : ""}</span>{inPortfolio ? "." : item.company.current ? ` in ${item.company.name}.` : `. Janus moves you into ${item.company.name} first.`}</> : `Only ${item.company.name}'s Owner opens it there. Your role sees it here.`}</p>
      <DialogFooter className="gap-2 sm:justify-between">
        {onMarkRead && !read ? <Button variant="ghost" disabled={going} onClick={() => { onMarkRead(); onClose(); }}>Mark read</Button> : <span />}
        <div className="flex gap-2"><Button variant="outline" disabled={going} onClick={onClose}>Close</Button>{canGo && <Button disabled={going} onClick={go}>{going ? "Opening…" : <>Go to {destination(to).split(" › ").pop()}<ArrowRight className="size-3.5" /></>}</Button>}</div>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
