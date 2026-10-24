import type { FunnelStage, TimeSeriesPoint } from "@/lib/types";

export const dashboardKpis = [
  { label: "New Leads", value: "3", delta: "+1 this week", trend: "up" as const },
  { label: "Qualified", value: "2", delta: "+1 this week", trend: "up" as const },
  { label: "Pipeline", value: "₹7.55L", delta: "+8.0%", trend: "up" as const },
  { label: "Won (30d)", value: "₹0", delta: "No wins yet", trend: "up" as const },
  { label: "Open Support", value: "4", delta: "2 need attention", trend: "down" as const },
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

export const pipelineFunnel: FunnelStage[] = [
  { stage: "New", count: 3, value: 755000, conversion: 100 },
  { stage: "Qualified", count: 2, value: 755000, conversion: 67 },
  { stage: "Demo", count: 0, value: 0, conversion: 0 },
  { stage: "Proposal", count: 1, value: 275000, conversion: 33 },
  { stage: "Negotiation", count: 0, value: 0, conversion: 0 },
  { stage: "Won", count: 0, value: 0, conversion: 0 },
];

export const leadsBySource = [
  { source: "WhatsApp", leads: 12, conversion: 8.3 },
  { source: "Website", leads: 8, conversion: 12.5 },
  { source: "Phone calls", leads: 4, conversion: 0 },
  { source: "Webhook / API", leads: 0, conversion: 0 },
];

export const revenueTrend: TimeSeriesPoint[] = [
  { date: "May", value: 85000 },
  { date: "Jun", value: 125000 },
  { date: "Jul", value: 210000 },
  { date: "Aug", value: 340000 },
  { date: "Sep", value: 520000 },
  { date: "Oct", value: 755000 },
];

export const conversionTrend: TimeSeriesPoint[] = [
  { date: "May", value: 0 },
  { date: "Jun", value: 0 },
  { date: "Jul", value: 8.3 },
  { date: "Aug", value: 10.2 },
  { date: "Sep", value: 12.5 },
  { date: "Oct", value: 8.3 },
];

export const salesCycleDays: TimeSeriesPoint[] = [
  { date: "May", value: 0 },
  { date: "Jun", value: 0 },
  { date: "Jul", value: 17 },
  { date: "Aug", value: 15 },
  { date: "Sep", value: 13 },
  { date: "Oct", value: 11 },
];

export const salesLeaderboard = [
  { name: "Pankaj Neema", deals: 2, won: 0, value: 755000, conversion: 0 },
  { name: "Unassigned", deals: 1, won: 0, value: 0, conversion: 0 },
];

export const supportMetrics = {
  firstResponseMinutes: 11,
  resolutionHours: 5.4,
  slaBreaches30d: 1,
  aiResolutionRate: 62,
  humanResolutionRate: 38,
  csat: 4.4,
};

export const ticketVolumeTrend: TimeSeriesPoint[] = [
  { date: "Mon", value: 1 },
  { date: "Tue", value: 2 },
  { date: "Wed", value: 0 },
  { date: "Thu", value: 2 },
  { date: "Fri", value: 1 },
  { date: "Sat", value: 1 },
  { date: "Sun", value: 1 },
];

export const customerHealthDistribution = [
  { category: "Healthy", count: 1 },
  { category: "Expansion", count: 1 },
  { category: "At Risk", count: 1 },
  { category: "High Risk", count: 0 },
  { category: "Inactive", count: 0 },
];

export const automationStats = {
  totalRuns30d: 18,
  successRate: 94.4,
  failedRuns30d: 1,
  approvalsTriggered30d: 3,
};

export const costSummary = {
  totalThisMonth: 1860,
  llm: 980,
  embeddings: 120,
  voice: 0,
  whatsapp: 420,
  email: 340,
  costPerLead: 62,
  costPerConversation: 28,
  costPerResolvedTicket: 54,
};
