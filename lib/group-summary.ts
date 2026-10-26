import type { HrEmployee, HrExpenseClaim, HrLeaveRequest } from "@/lib/types";
import type { Deal, Lead } from "@/lib/api/types";
import { scoped, type CompanyRecord } from "@/lib/company";
import { specForRecord } from "@/lib/companies";
import { buildDealRows, buildLeadRows, DEMO_TODAY } from "@/lib/demo-universe";
import { acme_hrExpenseClaims, acme_hrLeaveRequests, acmeEmployees } from "@/lib/mock-data/hr-people";

export interface AttentionItem { severity: "high" | "medium" | "low"; text: string; to: string }
export interface CompanySummary {
  company: CompanyRecord;
  crm: { leads: number; openDeals: number; pipeline: number; wonValue: number; winRate: number; quiet: number; byStage: { stage: string; count: number; value: number }[]; bySource: { source: string; count: number; won: number }[]; monthly: { label: string; leads: number }[] } | null;
  hr: { people: number; departments: number; onLeaveToday: number; pendingLeave: number; monthlyPay: number; claimsPending: number; claimsValue: number };
  attention: AttentionItem[];
}

/** What a company has saved in this browser, or nothing if it has never been opened. */
function saved<T>(key: string, id: string): Partial<T> | null {
  try {
    const raw = window.localStorage.getItem(scoped(key, id));
    return raw ? (JSON.parse(raw).state as Partial<T>) : null;
  } catch { return null; }
}
/** Leads captured per month. Earlier months are history scaled to the company's size; the last is this month's real count. */
function monthly(leads: Lead[]) {
  const scale = Math.min(1, leads.length / 24);
  const base = [["May", 11], ["Jun", 14], ["Jul", 15], ["Aug", 13], ["Sep", 17]] as const;
  return [...base.map(([label, value]) => ({ label, leads: Math.round(value * scale) })), { label: "Oct", leads: leads.filter((item) => item.createdAt >= "2026-10-01").length }];
}
const open = new Set(["new", "qualified", "demo", "proposal", "negotiation", "approval"]);

/**
 * One company's headline numbers, read the way its own screens would show them: its saved records if it
 * has been opened, otherwise the starting records. Never mixes data between companies.
 */
export function summarise(record: CompanyRecord): CompanySummary {
  const spec = specForRecord(record);
  const crmOn = record.workspaces.includes("crm-sales");
  const store = saved<{ leads: Lead[]; deals: Deal[] }>("janus.demo-crm.v2", record.id);
  const leads = store?.leads ?? buildLeadRows(spec);
  const deals = store?.deals ?? buildDealRows(spec, buildLeadRows(spec));
  const people = saved<{ employees: HrEmployee[]; leaveRequests: HrLeaveRequest[]; expenseClaims: HrExpenseClaim[] }>("janus.hr-people-demo", record.id);
  const claims = (people?.expenseClaims ?? (record.id === "acme" ? acme_hrExpenseClaims : [])).filter((item) => ["submitted", "manager_review", "hr_review"].includes(item.status));
  const employees = (people?.employees ?? (record.id === "acme" ? acmeEmployees : spec.employees ?? [])).filter((item) => item.status !== "archived");
  const leave = people?.leaveRequests ?? (record.id === "acme" ? acme_hrLeaveRequests : []);
  const openDeals = deals.filter((item) => open.has(item.stage));
  const won = deals.filter((item) => item.stage === "won");
  const lost = deals.filter((item) => item.stage === "lost");
  const quiet = leads.filter((item) => !["won", "lost"].includes(item.stage) && (Date.parse(`${DEMO_TODAY}T12:00:00+05:30`) - Date.parse(item.lastActivityAt)) / 86400000 >= 4).length;
  const pendingLeave = leave.filter((item) => item.status === "pending" || item.status === "needs_clarification").length;
  const summary: CompanySummary = {
    company: record,
    crm: crmOn ? { leads: leads.length, openDeals: openDeals.length, pipeline: openDeals.reduce((sum, item) => sum + Number(item.amount), 0), wonValue: won.reduce((sum, item) => sum + Number(item.amount), 0), winRate: Math.round((won.length / Math.max(1, won.length + lost.length)) * 100), quiet, byStage: ["new", "qualified", "proposal", "negotiation", "won", "lost"].map((stage) => ({ stage, count: leads.filter((item) => item.stage === stage).length, value: deals.filter((item) => item.stage === stage).reduce((sum, item) => sum + Number(item.amount), 0) })), bySource: (["whatsapp", "website", "phone_call"] as const).map((source) => ({ source, count: leads.filter((item) => item.source === source).length, won: leads.filter((item) => item.source === source && item.stage === "won").length })), monthly: monthly(leads) } : null,
    hr: { people: employees.length, departments: new Set(employees.map((item) => item.department)).size, onLeaveToday: leave.filter((item) => item.status === "approved" && item.from <= DEMO_TODAY && item.to >= DEMO_TODAY).length, pendingLeave, monthlyPay: employees.reduce((sum, item) => sum + item.salaryMonthly, 0), claimsPending: claims.length, claimsValue: claims.reduce((sum, item) => sum + item.amount, 0) },
    attention: [],
  };
  const to = (path: string) => path;
  if (!record.setupDone) summary.attention.push({ severity: "high", text: "Setup is not finished", to: to(`/setup?finish=${record.id}`) });
  if (pendingLeave > 0) summary.attention.push({ severity: pendingLeave > 2 ? "high" : "medium", text: `${pendingLeave} leave request${pendingLeave === 1 ? "" : "s"} open, pending or needing clarification`, to: to("/workspace/hr-people?view=approvals&workspace=hr-people") });
  if (summary.crm && summary.crm.quiet > 0) summary.attention.push({ severity: summary.crm.quiet > 4 ? "high" : "medium", text: `${summary.crm.quiet} open lead${summary.crm.quiet === 1 ? "" : "s"} with no activity for 4+ days`, to: to("/leads?workspace=crm-sales") });
  const waiting = deals.filter((item) => ["proposal", "negotiation"].includes(item.stage));
  if (summary.crm && waiting.length) summary.attention.push({ severity: "low", text: `${waiting.length} deal${waiting.length === 1 ? "" : "s"} in proposal or negotiation worth ₹${(waiting.reduce((sum, item) => sum + Number(item.amount), 0) / 100000).toFixed(1).replace(/\.0$/, "")}L`, to: to("/deals?workspace=crm-sales") });
  return summary;
}
