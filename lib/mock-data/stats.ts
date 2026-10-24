import type { FunnelStage, TimeSeriesPoint } from "@/lib/types";
import { dealRows, lakh, leadRows, owners, stats as crm } from "@/lib/demo-universe";
import { customers } from "./customers";
import { tickets } from "./tickets";

/** Everything here is calculated from the shared demo company, so it always agrees with the lists. */
const wonSince = (iso: string) => dealRows.filter((item) => item.stage === "won" && (item.expectedCloseAt ?? "") >= iso).reduce((sum, item) => sum + Number(item.amount), 0);
const newThisWeek = leadRows.filter((item) => item.createdAt >= "2026-10-17").length;
const qualified = leadRows.filter((item) => item.stage === "qualified").length;
const openTickets = tickets.filter((item) => !["resolved", "closed"].includes(item.status));

export const dashboardKpis = [
  { label: "New Leads", value: String(leadRows.filter((item) => item.stage === "new").length), delta: `+${newThisWeek} this week`, trend: "up" as const },
  { label: "Qualified", value: String(qualified), delta: "ready for a proposal", trend: "up" as const },
  { label: "Pipeline", value: lakh(crm.pipeline), delta: `${crm.openDeals} open deals`, trend: "up" as const },
  { label: "Won (30d)", value: lakh(wonSince("2026-09-24")), delta: `${crm.wonDeals} orders`, trend: "up" as const },
  { label: "Open Support", value: String(openTickets.length), delta: `${openTickets.filter((item) => item.priority === "urgent" || item.priority === "high").length} need attention`, trend: "down" as const },
  { label: "AI Resolution", value: "62%", delta: "+6.0%", trend: "up" as const },
];

export const aiOpsStats = {
  aiHandled: 842,
  humanHandoffs: 96,
  toolActions: 1284,
  automationSuccessRate: 97.2,
  aiErrors: 14,
  avgFirstResponseSeconds: 8,
};

const stageRows: [string, string[]][] = [["New", ["new"]], ["Qualified", ["qualified"]], ["Demo", []], ["Proposal", ["proposal"]], ["Negotiation", ["negotiation"]], ["Won", ["won"]]];
export const pipelineFunnel: FunnelStage[] = stageRows.map(([stage, keys], index) => {
  const count = leadRows.filter((item) => keys.includes(item.stage)).length;
  const value = dealRows.filter((item) => keys.includes(item.stage)).reduce((sum, item) => sum + Number(item.amount), 0);
  return { stage, count, value, conversion: Math.round((count / Math.max(1, leadRows.length)) * 100) + (index === 0 ? 0 : 0) };
});

export const leadsBySource = crm.bySource.map((item) => {
  const mine = leadRows.filter((lead) => lead.source === item.source);
  const won = mine.filter((lead) => lead.stage === "won").length;
  return { source: item.source === "phone_call" ? "Phone calls" : item.source === "whatsapp" ? "WhatsApp" : "Website", leads: item.count, conversion: Math.round((won / Math.max(1, mine.length)) * 1000) / 10 };
}).concat([{ source: "Webhook / API", leads: 0, conversion: 0 }]);

export const revenueTrend: TimeSeriesPoint[] = [
  { date: "May", value: 410000 },
  { date: "Jun", value: 560000 },
  { date: "Jul", value: 620000 },
  { date: "Aug", value: 740000 },
  { date: "Sep", value: 820000 },
  { date: "Oct", value: wonSince("2026-10-01") },
];

export const conversionTrend: TimeSeriesPoint[] = [
  { date: "May", value: 11.2 },
  { date: "Jun", value: 13.0 },
  { date: "Jul", value: 14.1 },
  { date: "Aug", value: 13.4 },
  { date: "Sep", value: 15.2 },
  { date: "Oct", value: Math.round((crm.wonDeals / crm.leads) * 1000) / 10 },
];

export const salesCycleDays: TimeSeriesPoint[] = [
  { date: "May", value: 24 },
  { date: "Jun", value: 22 },
  { date: "Jul", value: 21 },
  { date: "Aug", value: 19 },
  { date: "Sep", value: 17 },
  { date: "Oct", value: 15 },
];

export const salesLeaderboard = (Object.values(owners) as { id: string; name: string }[]).map((owner) => {
  const mine = dealRows.filter((item) => item.ownerId === owner.id);
  const won = mine.filter((item) => item.stage === "won");
  const closed = mine.filter((item) => item.stage === "won" || item.stage === "lost").length;
  return { name: owner.name, deals: mine.length, won: won.length, value: won.reduce((sum, item) => sum + Number(item.amount), 0), conversion: Math.round((won.length / Math.max(1, closed)) * 100) };
}).sort((a, b) => b.value - a.value);

export const supportMetrics = {
  firstResponseMinutes: 11,
  resolutionHours: 5.4,
  slaBreaches30d: 1,
  aiResolutionRate: 62,
  humanResolutionRate: 38,
  csat: 4.4,
};

export const ticketVolumeTrend: TimeSeriesPoint[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((date, index) => ({ date, value: [2, 1, 0, 2, 1, 1, 2][index] }));

const labels = { healthy: "Healthy", expansion: "Expansion", at_risk: "At Risk", high_risk: "High Risk", inactive: "Inactive" } as const;
export const customerHealthDistribution = (Object.keys(labels) as (keyof typeof labels)[]).map((key) => ({ category: labels[key], count: customers.filter((item) => item.health.category === key).length }));

export const automationStats = {
  totalRuns30d: 132,
  successRate: 95.4,
  failedRuns30d: 6,
  approvalsTriggered30d: 14,
};

export const costSummary = {
  totalThisMonth: 1860,
  llm: 980,
  embeddings: 120,
  voice: 0,
  whatsapp: 420,
  email: 340,
  costPerLead: Math.round(1860 / crm.leads),
  costPerConversation: 28,
  costPerResolvedTicket: 54,
};

/** The same figures for any slice of the CRM. Used to scope analytics to what someone is allowed to see. */
export interface StatsInput { leads: { stage: string; source: string; ownerId: string | null; ownerName?: string | null }[]; deals: { stage: string; amount: string; ownerId: string | null; ownerName?: string | null; expectedCloseAt: string | null }[]; customers: { health: { category: string } }[]; tickets: { status: string; priority: string }[] }
export function buildCrmStats(input: StatsInput, share: number) {
  const funnel: FunnelStage[] = stageRows.map(([stage, keys], index) => {
    const count = input.leads.filter((item) => keys.includes(item.stage)).length;
    const value = input.deals.filter((item) => keys.includes(item.stage)).reduce((sum, item) => sum + Number(item.amount), 0);
    return { stage, count, value, conversion: Math.round((count / Math.max(1, input.leads.length)) * 100) + index * 0 };
  });
  const sources = (["whatsapp", "website", "phone_call"] as const).map((source) => {
    const mine = input.leads.filter((lead) => lead.source === source);
    return { source: source === "phone_call" ? "Phone calls" : source === "whatsapp" ? "WhatsApp" : "Website", leads: mine.length, conversion: Math.round((mine.filter((lead) => lead.stage === "won").length / Math.max(1, mine.length)) * 1000) / 10 };
  }).concat([{ source: "Webhook / API", leads: 0, conversion: 0 }]);
  const board = new Map<string, { name: string; deals: number; won: number; wonValue: number; closed: number }>();
  input.deals.forEach((deal) => {
    const key = deal.ownerId ?? "none";
    const row = board.get(key) ?? { name: deal.ownerName ?? "Unassigned", deals: 0, won: 0, wonValue: 0, closed: 0 };
    row.deals += 1;
    if (deal.stage === "won") { row.won += 1; row.wonValue += Number(deal.amount); }
    if (deal.stage === "won" || deal.stage === "lost") row.closed += 1;
    board.set(key, row);
  });
  const wonThisMonth = input.deals.filter((item) => item.stage === "won" && (item.expectedCloseAt ?? "") >= "2026-10-01").reduce((sum, item) => sum + Number(item.amount), 0);
  return {
    pipelineFunnel: funnel,
    leadsBySource: sources,
    // Earlier months are company history, so they shrink with the share of the business this person can see.
    revenueTrend: revenueTrend.map((point, index, all) => ({ ...point, value: index === all.length - 1 ? wonThisMonth : Math.round(point.value * share) })),
    salesCycleDays,
    salesLeaderboard: [...board.values()].map((row) => ({ name: row.name, deals: row.deals, won: row.won, value: row.wonValue, conversion: Math.round((row.won / Math.max(1, row.closed)) * 100) })).sort((a, b) => b.value - a.value),
    customerHealthDistribution: (Object.keys(labels) as (keyof typeof labels)[]).map((key) => ({ category: labels[key], count: input.customers.filter((item) => item.health.category === key).length })),
    supportMetrics,
    ticketVolumeTrend: ticketVolumeTrend.map((point) => ({ ...point, value: Math.round(point.value * Math.max(0.3, share)) })),
    aiOpsStats,
    automationStats,
  };
}
