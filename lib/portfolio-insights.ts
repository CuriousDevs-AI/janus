import type { CompanySummary } from "@/lib/group-summary";
import { lakh } from "@/lib/demo-universe";

export interface Insight { tone: "positive" | "watch" | "action"; title: string; detail: string }
const pct = (part: number, whole: number) => whole ? Math.round((part / whole) * 100) : 0;
const withCrm = (list: CompanySummary[]) => list.filter((item) => item.crm && item.crm.leads > 0);
const name = (item: CompanySummary) => item.company.name;

/** Plain-language findings drawn from the numbers on the page, so each one can be checked against them. */
export function insightsFor(list: CompanySummary[]): Insight[] {
  const out: Insight[] = [];
  const crm = withCrm(list);
  const pipeline = crm.reduce((sum, item) => sum + (item.crm?.pipeline ?? 0), 0);
  if (crm.length > 1 && pipeline > 0) {
    const top = [...crm].sort((a, b) => (b.crm?.pipeline ?? 0) - (a.crm?.pipeline ?? 0))[0];
    out.push({ tone: "watch", title: "Pipeline is concentrated", detail: `${name(top)} holds ${pct(top.crm!.pipeline, pipeline)}% of the open pipeline (${lakh(top.crm!.pipeline)} of ${lakh(pipeline)}).` });
  }
  if (crm.length > 1) {
    const best = [...crm].sort((a, b) => (b.crm?.winRate ?? 0) - (a.crm?.winRate ?? 0))[0];
    out.push({ tone: "positive", title: "Strongest closer", detail: `${name(best)} wins ${best.crm!.winRate}% of the deals it closes, the highest in the portfolio.` });
  }
  const heavy = [...list].filter((item) => item.crm && item.crm.wonValue > 0).sort((a, b) => b.hr.monthlyPay / Math.max(1, b.crm!.wonValue) - a.hr.monthlyPay / Math.max(1, a.crm!.wonValue))[0];
  if (heavy) out.push({ tone: "watch", title: "Payroll against won revenue", detail: `${name(heavy)} spends ${lakh(heavy.hr.monthlyPay)} a month on payroll against ${lakh(heavy.crm!.wonValue)} won so far.` });
  const unfinished = list.filter((item) => !item.company.setupDone);
  if (unfinished.length) out.push({ tone: "action", title: "Finish setting up", detail: `${unfinished.map(name).join(" and ")} ${unfinished.length === 1 ? "is" : "are"} not fully set up, so some workspaces are off.` });
  const waiting = list.reduce((sum, item) => sum + item.hr.pendingLeave, 0);
  if (waiting) out.push({ tone: "action", title: "Leave is waiting", detail: `${waiting} leave request${waiting === 1 ? "" : "s"} across the portfolio need a decision.` });
  const quiet = crm.reduce((sum, item) => sum + (item.crm?.quiet ?? 0), 0);
  if (quiet) out.push({ tone: "action", title: "Leads going quiet", detail: `${quiet} open lead${quiet === 1 ? "" : "s"} have had no activity for 4 days or more.` });
  return out;
}

export interface Answer { text: string; rows?: [string, string][] }
/** Answers a question from the portfolio numbers only. Says so when it cannot. */
export function answerFor(question: string, list: CompanySummary[]): Answer {
  const q = question.toLowerCase();
  const crm = withCrm(list);
  if (!list.length) return { text: "There are no companies yet. Add one and I can start answering from its records." };
  if (/pipeline|deal|revenue|won|sales/.test(q)) {
    const rows = crm.map((item): [string, string] => [name(item), `${lakh(item.crm!.pipeline)} open · ${lakh(item.crm!.wonValue)} won · ${item.crm!.winRate}% win rate`]);
    return { text: crm.length ? `Across ${crm.length} compan${crm.length === 1 ? "y" : "ies"} with CRM, the open pipeline is ${lakh(crm.reduce((s, i) => s + i.crm!.pipeline, 0))} and ${lakh(crm.reduce((s, i) => s + i.crm!.wonValue, 0))} has been won.` : "No company has CRM records yet.", rows };
  }
  if (/payroll|salary|cost|people|headcount|staff|employee/.test(q)) {
    return { text: `The portfolio has ${list.reduce((s, i) => s + i.hr.people, 0)} people and a monthly payroll of ${lakh(list.reduce((s, i) => s + i.hr.monthlyPay, 0))}.`, rows: list.map((item): [string, string] => [name(item), `${item.hr.people} people · ${lakh(item.hr.monthlyPay)} a month · ${item.hr.onLeaveToday} on leave today`]) };
  }
  if (/attention|urgent|need|wait|pending|leave|approval/.test(q)) {
    const items = list.flatMap((item) => item.attention.map((entry): [string, string] => [name(item), entry.text]));
    return { text: items.length ? `${items.length} thing${items.length === 1 ? "" : "s"} need you, most urgent first.` : "Nothing is waiting on you in any company.", rows: items.slice(0, 8) };
  }
  if (/compare|best|worst|strong|weak|win rate|perform/.test(q)) {
    const rows = [...crm].sort((a, b) => b.crm!.winRate - a.crm!.winRate).map((item): [string, string] => [name(item), `${item.crm!.winRate}% win rate · ${item.crm!.leads} leads · ${item.crm!.openDeals} open deals`]);
    return { text: rows.length ? `${rows[0][0]} leads on win rate.` : "I need at least one company with CRM records to compare.", rows };
  }
  if (/setup|unfinished|workspace|connect/.test(q)) {
    return { text: "Here is where each company stands.", rows: list.map((item): [string, string] => [name(item), `${item.company.setupDone ? "Set up" : "Setup unfinished"} · ${item.company.workspaces.map((id) => id === "crm-sales" ? "CRM & Sales" : id === "hr-people" ? "HR & People" : id).join(", ") || "no workspaces"}`]) };
  }
  return { text: `I can answer from what ${list.length} compan${list.length === 1 ? "y" : "ies"} hold today: pipeline and wins, people and payroll, what needs attention, and setup. I do not have finance ledgers connected, so I cannot speak to cash or receivables.` };
}
