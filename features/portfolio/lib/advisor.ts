import { inr } from "@/features/portfolio/lib/format";

/**
 * What GET /business/advisor returns: Janus as a business advisor for the company open now. The
 * rules live in the API (business/advisor.py), so the Advisor page, Ask Janus and the morning
 * brief always say the same thing.
 */
export type Area = "sales" | "money" | "compliance" | "team" | "operations";
export type Severity = "high" | "medium" | "low";
export type Finding = {
  id: string;
  area: Area;
  severity: Severity;
  title: string;
  sees: string;
  matters: string;
  action: string;
  href: string;
  plan: string;
  measure: { label: string; now: number; target: number; better: "lower" | "higher"; money: boolean };
};
export type AdvisorOut = { company: string; areas: { area: Area; status: "red" | "amber" | "green"; reason: string }[]; findings: Finding[] };

export const areaNames: Record<Area, string> = { sales: "Sales", money: "Money", compliance: "Compliance", team: "Team", operations: "Operations" };

/** A plan step the owner committed to, as kept in what Janus knows: "Plan · <finding> · <due day>". */
export const PLAN_PREFIX = "Plan · ";
export const planTitle = (finding: Finding, due: string) => `${PLAN_PREFIX}${finding.id} · ${due}`;
export function readPlan(title: string): { id: string; due: string } | null {
  if (!title.startsWith(PLAN_PREFIX)) return null;
  const [id, due] = title.slice(PLAN_PREFIX.length).split(" · ");
  return id && due ? { id, due } : null;
}

/** A measure's figure in words: "₹1.3L" for money, the number otherwise. */
export const measured = (finding: Finding, value: number) => finding.measure.money ? inr(value) : String(value);

/** "How can I improve?", "what should we fix?": answered from the Advisor. */
export const isAdviceQuestion = (question: string) => /\b(improve|improvement|grow|advice|advise|suggest|recommend|plan|fix)\b/i.test(question) && !/\bforecast\b/i.test(question);
