import type { Customer, Deal, Ticket, MemoryItem, Activity } from "@/lib/types";
import { formatCurrencyINR } from "@/lib/utils";

export interface CustomerAIAnswer {
  text: string;
  sources: string[];
}

interface Context {
  customer: Customer;
  companyName: string;
  deals: Deal[];
  tickets: Ticket[];
  memory: MemoryItem[];
  activities: Activity[];
  conversationCount: number;
}

export function answerAboutCustomer(question: string, ctx: Context): CustomerAIAnswer {
  const q = question.toLowerCase();
  const firstName = ctx.customer.name.split(" ")[0];
  const openDeal = ctx.deals.find((d) => !["won", "lost"].includes(d.stage));
  const insights = ctx.memory.filter((m) => m.kind === "derived_insight");
  const facts = ctx.memory.filter((m) => m.kind === "stable_fact");
  const openTickets = ctx.tickets.filter((t) => t.status !== "closed" && t.status !== "resolved");
  const proposalActivities = ctx.activities.filter((a) => a.type === "proposal_sent");

  if (q.includes("block") || q.includes("stuck") || q.includes("stall")) {
    const blocker = insights[0]?.value ?? "no specific blocker has been identified yet";
    return {
      text: openDeal
        ? `Based on the last ${Math.min(ctx.activities.length, 6)} interactions, ${blocker.toLowerCase().startsWith(firstName.toLowerCase()) ? blocker : blocker}${proposalActivities.length ? " The proposal is still awaiting a reply." : ""}`
        : `There's no active deal for ${firstName} right now, so nothing is currently blocked.`,
      sources: [`${ctx.conversationCount} conversations`, `${proposalActivities.length} proposal${proposalActivities.length === 1 ? "" : "s"}`, `${ctx.activities.length} activities`],
    };
  }

  if (q.includes("want") || q.includes("need") || q.includes("looking for")) {
    return {
      text: `${firstName} at ${ctx.companyName} is primarily interested in ${openDeal ? openDeal.name : "our platform"}${insights[0] ? `. ${insights[0].value}` : "."}`,
      sources: [`${ctx.conversationCount} conversations`, "customer profile"],
    };
  }

  if (q.includes("summar")) {
    const lastFew = ctx.activities.slice(0, 5).map((a) => `${a.title}`).join("; ");
    return {
      text: lastFew ? `Recent activity: ${lastFew}.` : "No recorded communication yet.",
      sources: [`${ctx.activities.length} timeline events`],
    };
  }

  if (q.includes("promise")) {
    const proposal = proposalActivities[0];
    return {
      text: proposal
        ? `A proposal was sent (${proposal.title}). No specific discount or commitment beyond the standard proposal terms has been recorded as promised.`
        : `No formal proposal or commitment has been sent to ${firstName} yet.`,
      sources: proposal ? ["1 proposal", `${ctx.conversationCount} conversations`] : [`${ctx.conversationCount} conversations`],
    };
  }

  if (q.includes("next") || q.includes("should i do")) {
    return {
      text: openTickets.length > 0
        ? `Resolve the open ticket (${openTickets[0].number} — ${openTickets[0].subject}) first, then ${openDeal ? "follow up on the open deal." : "check in on satisfaction."}`
        : openDeal
          ? openDeal.nextAction ?? "Follow up on the open deal."
          : `Check in with ${firstName} — no open deals or tickets right now.`,
      sources: [`${ctx.deals.length} deals`, `${ctx.tickets.length} tickets`],
    };
  }

  if (q.includes("health") || q.includes("risk") || q.includes("churn")) {
    return {
      text: `${firstName}'s health score is ${ctx.customer.health.score}/100 (${ctx.customer.health.category.replace("_", " ")}), trending ${ctx.customer.health.trend}. Churn risk is estimated at ${ctx.customer.health.churnRisk}%.`,
      sources: ["customer health model"],
    };
  }

  // fallback — still grounded, not fabricated
  return {
    text: `Here's what's on file for ${firstName}: ${facts.length} stable facts, ${insights.length} derived insights, ${ctx.deals.length} deal${ctx.deals.length === 1 ? "" : "s"}, ${openTickets.length} open ticket${openTickets.length === 1 ? "" : "s"}. Try asking what's blocking the deal, what they want, or what to do next.`,
    sources: [`${ctx.conversationCount} conversations`, `${ctx.activities.length} activities`],
  };
}

export const SUGGESTED_QUESTIONS = [
  "What does the customer want?",
  "What is blocking the deal?",
  "Summarize all communication.",
  "What did we promise?",
  "What should I do next?",
];
