/**
 * Customer health (plan §8.4AH, kept simple): one score per customer, from records only.
 * Start at 100 and take points off for each thing that puts the relationship at risk. The rules are
 * listed with the score so anyone can see why a customer is where it is.
 */

export type HealthBand = "healthy" | "watch" | "at risk";

export interface HealthInput {
  openTickets: number;
  escalatedTickets: number;
  breachedTickets: number;
  overdueInvoices: number;
  renewalDays: number | null;
}

export interface Health {
  score: number;
  band: HealthBand;
  reasons: string[];
}

export function customerHealth(input: HealthInput): Health {
  let score = 100;
  const reasons: string[] = [];
  if (input.openTickets > 0) {
    score -= input.openTickets * 10;
    reasons.push(`${input.openTickets} open ticket${input.openTickets === 1 ? "" : "s"} (−${input.openTickets * 10})`);
  }
  if (input.escalatedTickets > 0) {
    score -= input.escalatedTickets * 20;
    reasons.push(`${input.escalatedTickets} escalated (−${input.escalatedTickets * 20})`);
  }
  if (input.breachedTickets > 0) {
    score -= input.breachedTickets * 10;
    reasons.push(`${input.breachedTickets} past SLA (−${input.breachedTickets * 10})`);
  }
  if (input.overdueInvoices > 0) {
    score -= input.overdueInvoices * 20;
    reasons.push(`${input.overdueInvoices} overdue invoice${input.overdueInvoices === 1 ? "" : "s"} (−${input.overdueInvoices * 20})`);
  }
  if (input.renewalDays !== null && input.renewalDays >= 0 && input.renewalDays <= 60) {
    score -= 10;
    reasons.push(`contract ends in ${input.renewalDays} days (−10)`);
  }
  score = Math.max(0, score);
  const band: HealthBand = score >= 75 ? "healthy" : score >= 50 ? "watch" : "at risk";
  return { score, band, reasons };
}
