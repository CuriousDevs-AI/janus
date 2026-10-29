import type { UsageRecord } from "@/lib/types";
import { isFirstCompany } from "@/lib/companies";

const days = [
  "2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20",
  "2026-10-21", "2026-10-22", "2026-10-23",
];

const perDayLLM = [820, 910, 780, 1040, 990, 1150, 1080];
const perDayEmbed = [120, 140, 110, 160, 150, 175, 165];
const perDayVoice = [0, 0, 0, 0, 0, 0, 0];
const perDayWhatsapp = [340, 380, 300, 420, 410, 470, 455];
const perDayEmail = [210, 230, 195, 260, 240, 275, 268];

const demoUsageRecords: UsageRecord[] = days.flatMap((date, i) => [
  { id: `use-${i}-llm`, date, tenantId: "tenant-1", agentId: "agent-sales", model: "Claude Sonnet 5", category: "llm" as const, cost: perDayLLM[i] * 0.62, units: perDayLLM[i] },
  { id: `use-${i}-llm2`, date, tenantId: "tenant-1", agentId: "agent-support", model: "Claude Sonnet 5", category: "llm" as const, cost: perDayLLM[i] * 0.38, units: Math.round(perDayLLM[i] * 0.6) },
  { id: `use-${i}-embed`, date, tenantId: "tenant-1", model: "text-embedding-3", category: "embedding" as const, cost: perDayEmbed[i] * 0.4, units: perDayEmbed[i] },
  { id: `use-${i}-voice`, date, tenantId: "tenant-1", model: "n/a", category: "voice" as const, cost: perDayVoice[i], units: perDayVoice[i] },
  { id: `use-${i}-wa`, date, tenantId: "tenant-1", model: "n/a", category: "whatsapp" as const, cost: perDayWhatsapp[i] * 0.9, units: perDayWhatsapp[i] },
  { id: `use-${i}-email`, date, tenantId: "tenant-1", model: "n/a", category: "email" as const, cost: perDayEmail[i] * 0.15, units: perDayEmail[i] },
]);

export const usageRecords: UsageRecord[] = isFirstCompany ? demoUsageRecords : [];

export function totalCost(): number {
  return usageRecords.reduce((sum, r) => sum + r.cost, 0);
}

export function costByCategory(): { category: string; cost: number }[] {
  const map = new Map<string, number>();
  for (const r of usageRecords) {
    map.set(r.category, (map.get(r.category) ?? 0) + r.cost);
  }
  return Array.from(map.entries()).map(([category, cost]) => ({ category, cost }));
}

export function costByDay(): { date: string; cost: number }[] {
  const map = new Map<string, number>();
  for (const r of usageRecords) {
    map.set(r.date, (map.get(r.date) ?? 0) + r.cost);
  }
  return Array.from(map.entries()).map(([date, cost]) => ({ date, cost }));
}
