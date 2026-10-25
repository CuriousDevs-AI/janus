// Deterministic "Ask Your Business" canned-answer engine.
//
// This is NOT a real LLM call and NOT random — every answer below is built
// directly from the numbers in lib/mock-data/stats.ts (and customers.ts /
// tickets.ts where noted), so the numbers can never drift from the source
// data. `findAnswer` does simple keyword matching against a fixed set of
// canonical Q&A entries and returns null when nothing matches reasonably —
// the UI is responsible for showing a helpful fallback in that case rather
// than inventing a numeric answer.

import {
  leadsBySource,
  salesLeaderboard,
  conversionTrend,
  salesCycleDays,
  pipelineFunnel,
  supportMetrics,
  ticketVolumeTrend,
  aiOpsStats,
  automationStats,
  revenueTrend,
  customers,
  getCompanyById,
  tickets,
} from "@/lib/mock-data";
import { formatCurrencyINR, formatNumber } from "@/lib/utils";

export type BusinessAnswer = {
  question: string;
  answer: string;
  dataUsed: string[];
  calculation: {
    metric: string;
    period: string;
    filters: string;
    sources: string;
  };
  followups: string[];
  chartType?: "bar" | "none";
  chartData?: { label: string; value: number }[];
};

type CannedEntry = {
  keywords: string[];
  data: BusinessAnswer;
};

// ---------------------------------------------------------------------------
// Derived values — computed once from the real mock data so every answer
// below stays in sync with lib/mock-data/stats.ts and customers.ts.
// ---------------------------------------------------------------------------

function sourceByName(name: string) {
  return leadsBySource.find((s) => s.source === name) ?? leadsBySource[0];
}

const bySourceLeadsDesc = [...leadsBySource].sort((a, b) => b.leads - a.leads);
const bySourceConversionDesc = [...leadsBySource].sort((a, b) => b.conversion - a.conversion);

const website = sourceByName("Website");
const metaLeadAds = sourceByName("Meta Lead Ads") ?? sourceByName("Phone calls");
const referral = sourceByName("Referral") ?? sourceByName("WhatsApp");
const secondBySourceVolume = bySourceLeadsDesc.find((s) => s.source !== website.source)!;
const websiteVsSecondRatio = +(website.leads / secondBySourceVolume.leads).toFixed(1);

const repsByConversionDesc = [...salesLeaderboard].sort((a, b) => b.conversion - a.conversion);
const topRep = repsByConversionDesc[0];
const secondRep = repsByConversionDesc[1] ?? topRep;
const thirdRep = repsByConversionDesc[2] ?? secondRep;

const firstConv = conversionTrend[0];
const lastConv = conversionTrend[conversionTrend.length - 1];
const convDelta = +(lastConv.value - firstConv.value).toFixed(1);
let convDip: (typeof conversionTrend)[number] | undefined;
let convDipPrev: (typeof conversionTrend)[number] | undefined;
for (let i = 1; i < conversionTrend.length; i++) {
  if (conversionTrend[i].value < conversionTrend[i - 1].value) {
    convDip = conversionTrend[i];
    convDipPrev = conversionTrend[i - 1];
    break;
  }
}
const firstCycle = salesCycleDays[0];
const lastCycle = salesCycleDays[salesCycleDays.length - 1];

const atRiskCustomers = customers
  .filter((c) => c.health.category === "at_risk" || c.health.category === "high_risk")
  .sort((a, b) => a.health.score - b.health.score);
const atRiskLines = atRiskCustomers.map((c) => {
  const company = getCompanyById(c.companyId)?.name ?? "Unknown company";
  const label = c.health.category === "high_risk" ? "high risk" : "at risk";
  return `${c.name} (${company}) — health score ${c.health.score}, ${label}, ${c.health.churnRisk}% churn risk`;
});
const atRiskMinSupportLoad = Math.min(...atRiskCustomers.map((c) => c.health.supportLoad));
const atRiskMaxSupportLoad = Math.max(...atRiskCustomers.map((c) => c.health.supportLoad));

const urgentTickets = tickets.filter((t) => t.priority === "urgent");
const urgentSummary = urgentTickets.length === 0
  ? "No urgent tickets are open right now."
  : `${urgentTickets.length === 1 ? "One urgent ticket needs" : `${urgentTickets.length} urgent tickets need`} attention right now: ${urgentTickets.slice(0, 2).map((t) => `"${t.subject}" (${t.number}, ${t.slaMinutesRemaining} min to SLA breach)`).join(" and ")}.`;
const peakTicketDay = ticketVolumeTrend.reduce((max, p) => (p.value > max.value ? p : max), ticketVolumeTrend[0]);
const lowTicketDay = ticketVolumeTrend.reduce((min, p) => (p.value < min.value ? p : min), ticketVolumeTrend[0]);

const openStages = pipelineFunnel.filter((s) => s.stage !== "Won");
const openValue = openStages.reduce((sum, s) => sum + (s.value ?? 0), 0);
const openCount = openStages.reduce((sum, s) => sum + s.count, 0);
const wonStage = pipelineFunnel.find((s) => s.stage === "Won")!;
let biggestDropFrom = openStages[0];
let biggestDropTo = openStages[0];
let biggestDropAmount = 0;
for (let i = 1; i < openStages.length; i++) {
  const amount = openStages[i - 1].count - openStages[i].count;
  if (amount > biggestDropAmount) {
    biggestDropAmount = amount;
    biggestDropFrom = openStages[i - 1];
    biggestDropTo = openStages[i];
  }
}

const aiHandoffRate = +((aiOpsStats.aiHandled / (aiOpsStats.aiHandled + aiOpsStats.humanHandoffs)) * 100).toFixed(1);

const firstRevenue = revenueTrend[0];
const lastRevenue = revenueTrend[revenueTrend.length - 1];
const revenueGrowthPct = Math.round(((lastRevenue.value - firstRevenue.value) / firstRevenue.value) * 100);

// ---------------------------------------------------------------------------
// Canonical Q&A entries
// ---------------------------------------------------------------------------

const CANNED_ENTRIES: CannedEntry[] = [
  {
    keywords: ["website", "how many leads", "leads came from", "meta lead ads", "source"],
    data: {
      question: "How many leads came from the website this month?",
      answer: `Website is our largest lead source this month with ${website.leads} leads at a ${website.conversion}% conversion rate. That's ${websiteVsSecondRatio}x the volume of ${secondBySourceVolume.source}, the next-largest source (${secondBySourceVolume.leads} leads, ${secondBySourceVolume.conversion}% conversion) — and Website converts more than double as well.`,
      dataUsed: ["Leads", "Lead Sources"],
      calculation: {
        metric: "Lead count & conversion rate by source",
        period: "Current month",
        filters: "source = Website",
        sources: "leadsBySource — lib/mock-data/stats.ts",
      },
      followups: [
        "Which lead source converted best this month?",
        "Which salesperson has the highest conversion?",
        "What's our pipeline value?",
      ],
      chartType: "bar",
      chartData: bySourceLeadsDesc.slice(0, 6).map((s) => ({ label: s.source, value: s.leads })),
    },
  },
  {
    keywords: [
      "which source",
      "source convert",
      "converts best",
      "converted best",
      "best source",
      "lead source",
      "conversion by source",
    ],
    data: {
      question: "Which lead source converted best this month?",
      answer: `${bySourceConversionDesc[0].source} converts best this month at ${bySourceConversionDesc[0].conversion}% (${bySourceConversionDesc[0].leads} leads), followed by ${bySourceConversionDesc[1].source} at ${bySourceConversionDesc[1].conversion}% and ${bySourceConversionDesc[2].source} at ${bySourceConversionDesc[2].conversion}%. ${bySourceConversionDesc[bySourceConversionDesc.length - 1].source} converts worst at just ${bySourceConversionDesc[bySourceConversionDesc.length - 1].conversion}%.`,
      dataUsed: ["Leads", "Lead Sources"],
      calculation: {
        metric: "Conversion rate by lead source",
        period: "Current month",
        filters: "grouped by source",
        sources: "leadsBySource — lib/mock-data/stats.ts",
      },
      followups: [
        "How many leads came from the website this month?",
        "Which salesperson has the highest conversion?",
        "Why did conversion improve in August?",
      ],
      chartType: "bar",
      chartData: bySourceConversionDesc.map((s) => ({ label: s.source, value: s.conversion })),
    },
  },
  {
    keywords: ["salesperson", "sales rep", "highest conversion", "best rep", "leaderboard", "sales leaderboard", "conversion"],
    data: {
      question: "Which salesperson has the highest conversion?",
      answer: `${topRep.name} has the highest conversion rate at ${topRep.conversion}% (${topRep.won} won of ${topRep.deals} deals, ${formatCurrencyINR(topRep.value)} in value) — narrowly ahead of ${secondRep.name} at ${secondRep.conversion}%. ${thirdRep.name} trails at ${thirdRep.conversion}% conversion but closed the single largest deal value on the team at ${formatCurrencyINR(thirdRep.value)}.`,
      dataUsed: ["Sales Leaderboard", "Deals"],
      calculation: {
        metric: "Win rate by sales owner (won ÷ deals)",
        period: "Trailing period on record",
        filters: "all active reps",
        sources: "salesLeaderboard — lib/mock-data/stats.ts",
      },
      followups: [
        "Which lead source converted best this month?",
        "What's our pipeline value?",
        "Which customers are at risk?",
      ],
      chartType: "bar",
      chartData: repsByConversionDesc.map((r) => ({ label: r.name.split(" ")[0], value: r.conversion })),
    },
  },
  {
    keywords: [
      "why did conversion",
      "conversion fall",
      "conversion drop",
      "conversion decline",
      "conversion improve",
      "conversion trend",
      "conversion this week",
      "conversion this month",
      "why is conversion",
      "conversion change",
    ],
    data: {
      question: "Why did conversion improve in August?",
      answer: `Conversion didn't fall — it rose. Overall conversion climbed from ${firstConv.value}% in ${firstConv.date} to ${lastConv.value}% in ${lastConv.date}, a +${convDelta}pt improvement over the period. There was one dip along the way: ${convDip?.date} slipped to ${convDip?.value}% from ${convDipPrev?.value}% in ${convDipPrev?.date}, before rebounding the following month. Two likely contributors: the sales cycle has been shortening (${firstCycle.value} days in ${firstCycle.date} down to ${lastCycle.value} days in ${lastCycle.date}), and the lead mix has been tilting toward higher-converting sources like ${referral.source} (${referral.conversion}%) and ${website.source} (${website.conversion}%) relative to lower-converting paid channels like ${metaLeadAds.source} (${metaLeadAds.conversion}%).`,
      dataUsed: ["Conversion Trend", "Sales Cycle", "Lead Sources"],
      calculation: {
        metric: "Month-over-month conversion rate",
        period: `${firstConv.date}–${lastConv.date}`,
        filters: "all sources, all reps",
        sources: "conversionTrend, salesCycleDays, leadsBySource — lib/mock-data/stats.ts",
      },
      followups: [
        "Which lead source converted best this month?",
        "Which salesperson has the highest conversion?",
        "What's our pipeline value?",
      ],
      chartType: "bar",
      chartData: conversionTrend.map((p) => ({ label: p.date, value: p.value })),
    },
  },
  {
    keywords: ["at risk", "at-risk", "churn", "risk", "customers are at risk", "risk of churn", "which customers"],
    data: {
      question: "Which customers are at risk?",
      answer: `${atRiskCustomers.length} customers are currently flagged at risk or high risk: ${atRiskLines.join("; ")}. Both accounts show a declining health trend and negative sentiment, with support load between ${atRiskMinSupportLoad}% and ${atRiskMaxSupportLoad}% — well above healthy accounts — making them the two churn signals to watch this week.`,
      dataUsed: ["Customers", "Customer Health"],
      calculation: {
        metric: "Customer health score & churn risk",
        period: "Current snapshot",
        filters: "health.category = at_risk | high_risk",
        sources: "customers — lib/mock-data/customers.ts",
      },
      followups: [
        "What are our biggest support problems?",
        "Which salesperson has the highest conversion?",
        "What's our AI resolution rate?",
      ],
      chartType: "bar",
      chartData: atRiskCustomers.map((c) => ({ label: c.name.split(" ")[0], value: c.health.churnRisk })),
    },
  },
  {
    keywords: [
      "support problem",
      "biggest support",
      "support issue",
      "what's wrong with support",
      "support ticket",
      "recurring issue",
      "support",
      "problem",
    ],
    data: {
      question: "What are our biggest support problems?",
      answer: `${urgentSummary} More broadly, there have been ${supportMetrics.slaBreaches30d} SLA breaches in the last 30 days, and ${peakTicketDay.date} is the peak ticket-volume day (${peakTicketDay.value} tickets vs ${lowTicketDay.value} on ${lowTicketDay.date}). AI resolves ${supportMetrics.aiResolutionRate}% of tickets on its own; the rest need a human and average ${supportMetrics.resolutionHours}h to resolve.`,
      dataUsed: ["Tickets", "Support Metrics"],
      calculation: {
        metric: "Escalated ticket detail, SLA breaches & ticket volume trend",
        period: "Last 7 days (volume) / 30 days (SLA breaches)",
        filters: "priority = urgent, status = escalated",
        sources: "tickets, supportMetrics, ticketVolumeTrend — lib/mock-data/tickets.ts, stats.ts",
      },
      followups: [
        "What's our AI resolution rate?",
        "Which customers are at risk?",
        "What's our pipeline value?",
      ],
      chartType: "bar",
      chartData: ticketVolumeTrend.map((p) => ({ label: p.date, value: p.value })),
    },
  },
  {
    keywords: ["pipeline value", "pipeline worth", "revenue by source", "show revenue", "total pipeline", "how much pipeline", "pipeline"],
    data: {
      question: "What's our pipeline value?",
      answer: `Open pipeline across ${openStages.map((s) => s.stage).join(" → ")} totals ${formatCurrencyINR(openValue)} across ${openCount} active deals, plus ${formatCurrencyINR(wonStage.value ?? 0)} already Won (${wonStage.count} deals) this period. The biggest drop-off is ${biggestDropFrom.stage} → ${biggestDropTo.stage}, losing ${biggestDropAmount} deals (${biggestDropFrom.count} → ${biggestDropTo.count}) — the single leakiest step in the funnel.`,
      dataUsed: ["Deals", "Pipeline"],
      calculation: {
        metric: "Pipeline value & deal count by stage",
        period: "Current open pipeline snapshot",
        filters: "all stages",
        sources: "pipelineFunnel — lib/mock-data/stats.ts",
      },
      followups: [
        "Which salesperson has the highest conversion?",
        "Why did conversion improve in August?",
        "What's our AI resolution rate?",
      ],
      chartType: "bar",
      chartData: pipelineFunnel.map((s) => ({ label: s.stage, value: Math.round((s.value ?? 0) / 100000) })),
    },
  },
  {
    keywords: ["resolution rate", "ai resolution", "ai resolve", "resolution", "how much does ai handle", "ai handled"],
    data: {
      question: "What's our AI resolution rate?",
      answer: `AI resolves ${supportMetrics.aiResolutionRate}% of support tickets end-to-end without a human (the remaining ${supportMetrics.humanResolutionRate}% need a person). Across all AI ops, the agent has handled ${formatNumber(aiOpsStats.aiHandled)} conversations with only ${aiOpsStats.humanHandoffs} human handoffs — a ${aiHandoffRate}% self-serve rate — executing ${formatNumber(aiOpsStats.toolActions)} tool actions at a ${aiOpsStats.automationSuccessRate}% automation success rate, with just ${aiOpsStats.aiErrors} errors and an average first response of ${aiOpsStats.avgFirstResponseSeconds}s.`,
      dataUsed: ["Support Metrics", "AI Ops"],
      calculation: {
        metric: "AI vs human resolution split + AI ops handled/handoff ratio",
        period: "Trailing 30 days",
        filters: "all support conversations & tickets",
        sources: "supportMetrics, aiOpsStats — lib/mock-data/stats.ts",
      },
      followups: [
        "What are our biggest support problems?",
        "Which customers are at risk?",
        "What's our pipeline value?",
      ],
      chartType: "bar",
      chartData: [
        { label: "AI resolved", value: supportMetrics.aiResolutionRate },
        { label: "Human resolved", value: supportMetrics.humanResolutionRate },
      ],
    },
  },
  {
    keywords: ["revenue trend", "revenue trending", "how's revenue", "monthly revenue", "revenue growth", "revenue"],
    data: {
      question: "How is revenue trending?",
      answer: `Revenue has climbed from ${formatCurrencyINR(firstRevenue.value)} in ${firstRevenue.date} to ${formatCurrencyINR(lastRevenue.value)} in ${lastRevenue.date} — up ${revenueGrowthPct}% over ${revenueTrend.length} months, growing every single month with no down periods.`,
      dataUsed: ["Revenue"],
      calculation: {
        metric: "Monthly revenue trend",
        period: `${firstRevenue.date}–${lastRevenue.date}`,
        filters: "all deals, all sources",
        sources: "revenueTrend — lib/mock-data/stats.ts",
      },
      followups: [
        "What's our pipeline value?",
        "Which salesperson has the highest conversion?",
        "Why did conversion improve in August?",
      ],
      chartType: "bar",
      chartData: revenueTrend.map((p) => ({ label: p.date, value: Math.round(p.value / 100000) })),
    },
  },
  {
    keywords: ["automation success", "automation rate", "automation runs", "workflow success", "how many automations", "automation"],
    data: {
      question: "What's our automation success rate?",
      answer: `Automations ran ${formatNumber(automationStats.totalRuns30d)} times in the last 30 days at a ${automationStats.successRate}% success rate — only ${automationStats.failedRuns30d} failed. ${automationStats.approvalsTriggered30d} of those runs needed a human approval before continuing, keeping high-risk actions in the loop.`,
      dataUsed: ["Automations"],
      calculation: {
        metric: "Automation run outcomes",
        period: "Last 30 days",
        filters: "all automations",
        sources: "automationStats — lib/mock-data/stats.ts",
      },
      followups: [
        "What's our AI resolution rate?",
        "What are our biggest support problems?",
        "What's our pipeline value?",
      ],
      chartType: "bar",
      chartData: [
        { label: "Succeeded", value: automationStats.totalRuns30d - automationStats.failedRuns30d },
        { label: "Failed", value: automationStats.failedRuns30d },
      ],
    },
  },
];

// A handful of the canonical questions, exposed for the UI's example chips.
export const EXAMPLE_QUESTIONS: string[] = [
  "How many leads came from the website this month?",
  "Which salesperson has the highest conversion?",
  "Which customers are at risk?",
  "What are our biggest support problems?",
  "What's our pipeline value?",
];

function normalize(q: string): string {
  return q.trim().toLowerCase();
}

/**
 * Resolves a free-text business question into a grounded BusinessAnswer, or
 * null if nothing matches reasonably. Matching is a two-step deterministic
 * process: (1) an exact match against a canonical question, so follow-up
 * chips always resolve precisely; (2) keyword-overlap scoring against each
 * entry's keyword list, picking the highest-scoring entry. Never invents an
 * answer for a query that doesn't match anything.
 */
export function findAnswer(query: string): BusinessAnswer | null {
  const q = normalize(query);
  if (!q) return null;

  const exact = CANNED_ENTRIES.find((e) => normalize(e.data.question) === q);
  if (exact) return exact.data;

  let best: CannedEntry | null = null;
  let bestScore = 0;
  for (const entry of CANNED_ENTRIES) {
    let score = 0;
    for (const kw of entry.keywords) {
      if (q.includes(kw)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  return best ? best.data : null;
}
