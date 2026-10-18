import type { FunnelStage, TimeSeriesPoint } from "@/lib/types";

export const dashboardKpis = [
  { label: "New Leads", value: "128", delta: "+18.4%", trend: "up" as const },
  { label: "Qualified", value: "47", delta: "+9.2%", trend: "up" as const },
  { label: "Pipeline", value: "₹42.8L", delta: "+12.6%", trend: "up" as const },
  { label: "Won (30d)", value: "₹12.4L", delta: "+4.1%", trend: "up" as const },
  { label: "Open Support", value: "18", delta: "-6.0%", trend: "down" as const },
  { label: "AI Resolution", value: "71%", delta: "+3.5%", trend: "up" as const },
];

export const aiOpsStats = {
  aiHandled: 842,
  humanHandoffs: 96,
  toolActions: 1284,
  automationSuccessRate: 97.2,
  aiErrors: 14,
  avgFirstResponseSeconds: 8,
};

export const pipelineFunnel: FunnelStage[] = [
  { stage: "New", count: 34, value: 8160000, conversion: 100 },
  { stage: "Qualified", count: 21, value: 6300000, conversion: 62 },
  { stage: "Demo", count: 14, value: 5460000, conversion: 41 },
  { stage: "Proposal", count: 9, value: 4230000, conversion: 26 },
  { stage: "Negotiation", count: 6, value: 3480000, conversion: 18 },
  { stage: "Won", count: 12, value: 5940000, conversion: 35 },
];

export const leadsBySource = [
  { source: "Website", leads: 342, conversion: 24.1 },
  { source: "Meta Lead Ads", leads: 180, conversion: 9.7 },
  { source: "Manual", leads: 157, conversion: 18.9 },
  { source: "Referral", leads: 74, conversion: 31.4 },
  { source: "Webhook / API", leads: 128, conversion: 15.7 },
];

export const revenueTrend: TimeSeriesPoint[] = [
  { date: "Mar", value: 2100000 },
  { date: "Apr", value: 2480000 },
  { date: "May", value: 2890000 },
  { date: "Jun", value: 3120000 },
  { date: "Jul", value: 3640000 },
  { date: "Aug", value: 4280000 },
];

export const conversionTrend: TimeSeriesPoint[] = [
  { date: "Mar", value: 18.2 },
  { date: "Apr", value: 19.4 },
  { date: "May", value: 21.0 },
  { date: "Jun", value: 20.1 },
  { date: "Jul", value: 22.8 },
  { date: "Aug", value: 24.1 },
];

export const salesCycleDays: TimeSeriesPoint[] = [
  { date: "Mar", value: 38 },
  { date: "Apr", value: 36 },
  { date: "May", value: 33 },
  { date: "Jun", value: 34 },
  { date: "Jul", value: 31 },
  { date: "Aug", value: 29 },
];

export const salesLeaderboard = [
  { name: "Aman Verma", deals: 14, won: 9, value: 4820000, conversion: 64 },
  { name: "Riya Kapoor", deals: 12, won: 8, value: 3960000, conversion: 67 },
  { name: "Karan Bhatt", deals: 9, won: 5, value: 5210000, conversion: 56 },
];

export const supportMetrics = {
  firstResponseMinutes: 6,
  resolutionHours: 4.2,
  slaBreaches30d: 3,
  aiResolutionRate: 71,
  humanResolutionRate: 29,
  csat: 4.6,
};

export const ticketVolumeTrend: TimeSeriesPoint[] = [
  { date: "Mon", value: 22 },
  { date: "Tue", value: 28 },
  { date: "Wed", value: 19 },
  { date: "Thu", value: 31 },
  { date: "Fri", value: 26 },
  { date: "Sat", value: 12 },
  { date: "Sun", value: 9 },
];

export const customerHealthDistribution = [
  { category: "Healthy", count: 5 },
  { category: "Expansion", count: 2 },
  { category: "At Risk", count: 1 },
  { category: "High Risk", count: 1 },
  { category: "Inactive", count: 1 },
];

export const automationStats = {
  totalRuns30d: 342,
  successRate: 96.4,
  failedRuns30d: 12,
  approvalsTriggered30d: 23,
};

export const costSummary = {
  totalThisMonth: 18420,
  llm: 11380,
  embeddings: 1240,
  voice: 0,
  whatsapp: 3760,
  email: 2040,
  costPerLead: 41,
  costPerConversation: 18,
  costPerResolvedTicket: 64,
};
