import type { FunnelStage, TimeSeriesPoint } from "@/lib/types";

const stageRows: [string, string[]][] = [["New", ["new"]], ["Contacted", ["contacted"]], ["Qualified", ["qualified"]], ["Converted", ["converted"]], ["Won", ["won"]]];

const revenueTrend: TimeSeriesPoint[] = [
  { date: "May", value: 410000 },
  { date: "Jun", value: 560000 },
  { date: "Jul", value: 620000 },
  { date: "Aug", value: 740000 },
  { date: "Sep", value: 820000 },
  { date: "Oct", value: 0 },
];

const salesCycleDays: TimeSeriesPoint[] = [
  { date: "May", value: 24 },
  { date: "Jun", value: 22 },
  { date: "Jul", value: 21 },
  { date: "Aug", value: 19 },
  { date: "Sep", value: 17 },
  { date: "Oct", value: 15 },
];

const supportMetrics = {
  firstResponseMinutes: 11,
  resolutionHours: 5.4,
  slaBreaches30d: 1,
  aiResolutionRate: 62,
  humanResolutionRate: 38,
  csat: 4.4,
};

const ticketVolumeTrend: TimeSeriesPoint[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((date, index) => ({ date, value: [2, 1, 0, 2, 1, 1, 2][index] }));

export const aiOpsStats = {
  aiHandled: 842,
  humanHandoffs: 96,
  toolActions: 1284,
  automationSuccessRate: 97.2,
  aiErrors: 14,
  avgFirstResponseSeconds: 8,
};

export const automationStats = {
  totalRuns30d: 132,
  successRate: 95.4,
  failedRuns30d: 6,
  approvalsTriggered30d: 14,
};

const labels = { healthy: "Healthy", expansion: "Expansion", at_risk: "At Risk", high_risk: "High Risk", inactive: "Inactive" } as const;

export interface StatsInput { leads: { stage: string; source: string; ownerId: string | null; ownerName?: string | null }[]; deals: { stage: string; amount: number | string; ownerId: string | null; ownerName?: string | null; expectedCloseAt: string | null }[]; customers: { health: { category: string } }[]; tickets: { status: string; priority: string }[] }

export function buildCrmStats(input: StatsInput, share: number) {
  const funnel: FunnelStage[] = stageRows.map(([stage, keys]) => {
    const count = input.leads.filter((item) => keys.includes(item.stage)).length;
    const value = input.deals.filter((item) => keys.includes(item.stage)).reduce((sum, item) => sum + Number(item.amount), 0);
    return { stage, count, value, conversion: Math.round((count / Math.max(1, input.leads.length)) * 100) };
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
