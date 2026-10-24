import type { HrEmployee, HrLeaveRequest } from "@/lib/types";
import type { Deal, Lead } from "@/lib/api/types";
import { scoped, type CompanyRecord } from "@/lib/company";
import { specForRecord } from "@/lib/companies";
import { buildDealRows, buildLeadRows, DEMO_TODAY } from "@/lib/demo-universe";
import { acme_hrLeaveRequests, acmeEmployees } from "@/lib/mock-data/hr-people";

export interface AttentionItem { severity: "high" | "medium" | "low"; text: string; to: string }
export interface CompanySummary {
  company: CompanyRecord;
  crm: { leads: number; openDeals: number; pipeline: number; wonValue: number; winRate: number; quiet: number } | null;
  hr: { people: number; departments: number; onLeaveToday: number; pendingLeave: number; monthlyPay: number };
  attention: AttentionItem[];
}

/** What a company has saved in this browser, or nothing if it has never been opened. */
function saved<T>(key: string, id: string): Partial<T> | null {
  try {
    const raw = window.localStorage.getItem(scoped(key, id));
    return raw ? (JSON.parse(raw).state as Partial<T>) : null;
  } catch { return null; }
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
  const people = saved<{ employees: HrEmployee[]; leaveRequests: HrLeaveRequest[] }>("janus.hr-people-demo", record.id);
  const employees = (people?.employees ?? (record.id === "acme" ? acmeEmployees : spec.employees ?? [])).filter((item) => item.status !== "archived");
  const leave = people?.leaveRequests ?? (record.id === "acme" ? acme_hrLeaveRequests : []);
  const openDeals = deals.filter((item) => open.has(item.stage));
  const won = deals.filter((item) => item.stage === "won");
  const lost = deals.filter((item) => item.stage === "lost");
  const quiet = leads.filter((item) => !["won", "lost"].includes(item.stage) && (Date.parse(`${DEMO_TODAY}T12:00:00+05:30`) - Date.parse(item.lastActivityAt)) / 86400000 >= 4).length;
  const pendingLeave = leave.filter((item) => item.status === "pending" || item.status === "needs_clarification").length;
  const summary: CompanySummary = {
    company: record,
    crm: crmOn ? { leads: leads.length, openDeals: openDeals.length, pipeline: openDeals.reduce((sum, item) => sum + Number(item.amount), 0), wonValue: won.reduce((sum, item) => sum + Number(item.amount), 0), winRate: Math.round((won.length / Math.max(1, won.length + lost.length)) * 100), quiet } : null,
    hr: { people: employees.length, departments: new Set(employees.map((item) => item.department)).size, onLeaveToday: leave.filter((item) => item.status === "approved" && item.from <= DEMO_TODAY && item.to >= DEMO_TODAY).length, pendingLeave, monthlyPay: employees.reduce((sum, item) => sum + item.salaryMonthly, 0) },
    attention: [],
  };
  const to = (path: string) => path;
  if (!record.setupDone) summary.attention.push({ severity: "high", text: "Setup is not finished", to: to(`/setup?finish=${record.id}`) });
  if (pendingLeave > 0) summary.attention.push({ severity: pendingLeave > 2 ? "high" : "medium", text: `${pendingLeave} leave request${pendingLeave === 1 ? "" : "s"} waiting for a decision`, to: to("/workspace/hr-people?view=approvals&workspace=hr-people") });
  if (summary.crm && summary.crm.quiet > 0) summary.attention.push({ severity: summary.crm.quiet > 4 ? "high" : "medium", text: `${summary.crm.quiet} open lead${summary.crm.quiet === 1 ? "" : "s"} with no activity for 4+ days`, to: to("/leads?workspace=crm-sales") });
  const waiting = deals.filter((item) => ["proposal", "negotiation"].includes(item.stage));
  if (summary.crm && waiting.length) summary.attention.push({ severity: "low", text: `${waiting.length} deal${waiting.length === 1 ? "" : "s"} in proposal or negotiation worth ₹${(waiting.reduce((sum, item) => sum + Number(item.amount), 0) / 100000).toFixed(1).replace(/\.0$/, "")}L`, to: to("/deals?workspace=crm-sales") });
  return summary;
}
