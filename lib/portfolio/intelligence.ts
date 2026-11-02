import type { CompanyBook } from "@/lib/portfolio/books";
import { change, inr, type Basis, type CompanyFigures, type Consolidated } from "@/lib/portfolio/metrics";
import { inRange, type Period } from "@/lib/portfolio/period";
import { invoiceTotals } from "@/lib/stores/finance-store";
import type { MissingItem, Obligation } from "@/lib/portfolio/compliance";
import { TARGET_LABEL, type TargetMeasure } from "@/lib/portfolio/state";

/**
 * Janus Intelligence for the Portfolio. Every finding is a rule run over the companies' own records, and it
 * carries the figures it rests on (evidence), where they came from, and whether they are recorded facts
 * ("verified") or a calculation that assumes something ("estimate"). When the records cannot answer, it says so.
 * There is no language model in this path: nothing is generated that the records do not contain.
 */

export type SignalKind = "risk" | "anomaly" | "opportunity" | "benchmark" | "gap";
export type Category = "finance" | "sales" | "people" | "compliance" | "setup" | "data";
export type Severity = "high" | "medium" | "low";
export interface Evidence { label: string; value: string; source: string }
export interface Signal {
  id: string; companyId: string | null; kind: SignalKind; category: Category; severity: Severity; positive?: boolean;
  title: string; detail: string; evidence: Evidence[]; basis: Basis; amount?: number; money: boolean;
  action?: { label: string; href: string; companyId: string | null };
}

export interface TargetProgress { companyId: string; measure: TargetMeasure; target: number; actual: number; achieved: number; expected: number }

export interface IntelInput {
  books: CompanyBook[];
  /** This month to date, with the same days of last month. */
  month: { now: CompanyFigures[]; before: CompanyFigures[] | null; period: Period };
  /** Last full month, with the month before. */
  lastMonth: { now: CompanyFigures[]; before: CompanyFigures[] | null; period: Period };
  quarter: { now: CompanyFigures[]; before: CompanyFigures[] | null; period: Period; consolidated: Consolidated };
  obligations: Obligation[];
  missing: MissingItem[];
  targets: TargetProgress[];
}

const FIN = "/workspace/finance-accounting?workspace=finance-accounting&view=";
const pct = (value: number) => `${Math.round(value)}%`;
const name = (books: CompanyBook[], id: string | null) => id ? books.find((item) => item.record.id === id)?.record.name ?? id : "Portfolio";
const weight: Record<Severity, number> = { high: 3, medium: 2, low: 1 };
export const rank = (signal: Signal) => (signal.positive ? 0 : weight[signal.severity] * 1e12) + (signal.amount ?? 0);
const by = <T,>(list: T[], id: string, pick: (item: T) => string) => list.find((item) => pick(item) === id);

export function signalsFor(input: IntelInput): Signal[] {
  const out: Signal[] = [];
  const { books } = input;
  for (const book of books) {
    const id = book.record.id;
    const company = book.record.name;
    const q = by(input.quarter.now, id, (item) => item.id)!;
    const qBefore = input.quarter.before ? by(input.quarter.before, id, (item) => item.id) : undefined;
    const m = by(input.month.now, id, (item) => item.id)!;
    const mBefore = input.month.before ? by(input.month.before, id, (item) => item.id) : undefined;
    const lm = by(input.lastMonth.now, id, (item) => item.id)!;
    const lmBefore = input.lastMonth.before ? by(input.lastMonth.before, id, (item) => item.id) : undefined;

    if (book.status === "setup" || !book.record.setupDone) out.push({ id: `${id}:setup`, companyId: id, kind: "risk", category: "setup", severity: "high", title: `${company} is not fully set up`, detail: "Some workspaces are off, so its records are incomplete in every Portfolio total.", evidence: [{ label: "Workspaces on", value: String(book.record.workspaces.length), source: "Company settings" }], basis: "verified", money: false, action: { label: "Finish setup", href: `/setup?finish=${id}`, companyId: null } });

    const f = q.finance;
    if (f) {
      if (f.overdueReceivables > 0 && f.receivables > 0) {
        const share = (f.overdueReceivables / f.receivables) * 100;
        if (share >= 30) out.push({ id: `${id}:overdue`, companyId: id, kind: "risk", category: "finance", severity: share >= 50 ? "high" : "medium", title: `${pct(share)} of ${company}'s receivables are overdue`, detail: `${inr(f.overdueReceivables)} across ${f.overdueInvoices} invoice${f.overdueInvoices === 1 ? "" : "s"} is past its due date. Collecting it is the fastest way to add cash.`, evidence: [{ label: "Overdue", value: inr(f.overdueReceivables), source: "Invoices past due date" }, { label: "All receivables", value: inr(f.receivables), source: "Invoices not fully paid" }, ...f.aging.filter((row) => row.amount > 0 && row.bucket !== "Current").map((row) => ({ label: `Overdue ${row.bucket}`, value: inr(row.amount), source: "Receivables ageing" }))], basis: "verified", amount: f.overdueReceivables, money: true, action: { label: "Open invoices", href: `${FIN}invoices`, companyId: id } });
      }
      if (f.runwayMonths !== null && f.runwayMonths < 6) out.push({ id: `${id}:runway`, companyId: id, kind: "risk", category: "finance", severity: f.runwayMonths < 3 ? "high" : "medium", title: `${company} has about ${f.runwayMonths} months of cash at the current burn`, detail: "Cash has gone down over the last three recorded months. This assumes the same net outflow continues.", evidence: [{ label: "Cash position", value: inr(f.cash), source: "Cash flow" }, { label: "Runway", value: `${f.runwayMonths} months`, source: "Cash ÷ average monthly net outflow (3 months)" }], basis: "estimate", amount: f.cash, money: true, action: { label: "Open cash flow", href: `${FIN}cash-flow`, companyId: id } });
      if (f.payablesDue30 > 0 && f.payablesDue30 > f.cash) out.push({ id: `${id}:payables-cash`, companyId: id, kind: "risk", category: "finance", severity: "high", title: `${company}'s bills due in 30 days exceed its cash`, detail: "Payments due soon are larger than the cash on record.", evidence: [{ label: "Bills due in 30 days", value: inr(f.payablesDue30), source: "Bills" }, { label: "Cash position", value: inr(f.cash), source: "Cash flow" }], basis: "verified", amount: f.payablesDue30 - f.cash, money: true, action: { label: "Open payables", href: `${FIN}payables`, companyId: id } });
      if (f.overduePayables > 0) out.push({ id: `${id}:overdue-bills`, companyId: id, kind: "risk", category: "finance", severity: "medium", title: `${company} has ${inr(f.overduePayables)} of vendor bills overdue`, detail: "Late payment can cost supplier terms and, for MSME vendors, attracts interest under the MSMED Act.", evidence: [{ label: "Overdue bills", value: inr(f.overduePayables), source: "Bills past due date" }], basis: "verified", amount: f.overduePayables, money: true, action: { label: "Open payables", href: `${FIN}payables`, companyId: id } });
      if (f.topCustomerShare && f.topCustomerShare.share >= 40) out.push({ id: `${id}:concentration`, companyId: id, kind: "risk", category: "finance", severity: "medium", title: `${f.topCustomerShare.share}% of ${company}'s sales this quarter came from one customer`, detail: `${f.topCustomerShare.name} is the largest buyer. Losing them would remove that share of sales.`, evidence: [{ label: "Top customer", value: f.topCustomerShare.name, source: "Invoices this quarter" }, { label: "Share of sales", value: `${f.topCustomerShare.share}%`, source: "Taxable invoice value" }], basis: "verified", amount: (q.finance?.netSales ?? 0) * f.topCustomerShare.share / 100, money: true });
      if (f.netSales > 0 && f.profit < 0) out.push({ id: `${id}:loss`, companyId: id, kind: "risk", category: "finance", severity: "high", title: `${company} is loss-making this quarter before payroll`, detail: "Booked costs are higher than net sales.", evidence: [{ label: "Net sales", value: inr(f.netSales), source: "Invoices" }, { label: "Booked costs", value: inr(f.costs), source: "Bills and expenses" }], basis: "verified", amount: -f.profit, money: true, action: { label: "Open profit & loss", href: `${FIN}profit-loss`, companyId: id } });
      for (const line of book.finance!.budgetLines.filter((item) => item.allocated > 0 && item.drawn / item.allocated >= 0.9)) out.push({ id: `${id}:budget:${line.id}`, companyId: id, kind: "risk", category: "finance", severity: "medium", title: `${company}: "${line.name}" budget is ${pct((line.drawn / line.allocated) * 100)} used`, detail: `Owned by ${line.owner}. Further fund requests on this line will run out.`, evidence: [{ label: "Allocated", value: inr(line.allocated), source: "Budget lines" }, { label: "Drawn", value: inr(line.drawn), source: "Budget lines" }], basis: "verified", amount: line.drawn, money: true, action: { label: "Open budgets", href: `${FIN}funds`, companyId: id } });
      // Revenue movement: this month to date against the same days of last month.
      const nowSales = m.finance?.netSales ?? 0;
      const beforeSales = mBefore?.finance?.netSales ?? 0;
      const move = change(nowSales, beforeSales);
      if (move !== null && Math.abs(move) >= 25) {
        const drivers = revenueDrivers(book, input.month.period).slice(0, 3);
        out.push({ id: `${id}:sales-move`, companyId: id, kind: "anomaly", category: "finance", severity: move < 0 ? "medium" : "low", positive: move > 0, title: `${company}'s net sales are ${move > 0 ? "up" : "down"} ${Math.abs(move)}% on the same days last month`, detail: drivers.length ? `Largest movers: ${drivers.map((item) => `${item.customer} (${item.delta > 0 ? "+" : "−"}${inr(Math.abs(item.delta))})`).join(", ")}.` : "No single customer explains the change.", evidence: [{ label: input.month.period.label, value: inr(nowSales), source: "Invoices" }, { label: input.month.period.previous!.label, value: inr(beforeSales), source: "Invoices" }, ...drivers.map((item) => ({ label: item.customer, value: `${inr(item.before)} → ${inr(item.now)}`, source: "Invoices by customer" }))], basis: "verified", amount: Math.abs(nowSales - beforeSales), money: true, action: { label: "Open invoices", href: `${FIN}invoices`, companyId: id } });
      }
      // Payroll weight against what the books show coming in.
      if (q.people && f.netSales > 0 && q.people.payrollPeriod / f.netSales > 0.6) out.push({ id: `${id}:payroll-weight`, companyId: id, kind: "risk", category: "people", severity: "medium", title: `${company}'s payroll is ${pct((q.people.payrollPeriod / f.netSales) * 100)} of net sales this quarter`, detail: "Payroll is taken from salary records, not booked payments, so treat this as an estimate.", evidence: [{ label: "Payroll run-rate (quarter to date)", value: inr(q.people.payrollPeriod), source: "HR salaries" }, { label: "Net sales (quarter to date)", value: inr(f.netSales), source: "Invoices" }], basis: "estimate", amount: q.people.payrollPeriod, money: true });
    }

    const s = q.sales;
    if (s) {
      if (s.slippedDeals > 0) out.push({ id: `${id}:slipped`, companyId: id, kind: "risk", category: "sales", severity: s.slippedValue >= 500000 || s.slippedDeals >= 3 ? "high" : "medium", title: `${s.slippedDeals} of ${company}'s open deals are past their expected close`, detail: "The forecast counts on deals whose close date has passed. Update the date or the stage.", evidence: [{ label: "Deals past close date", value: String(s.slippedDeals), source: "Deals, open stage" }, { label: "Their value", value: inr(s.slippedValue), source: "Deals" }], basis: "verified", amount: s.slippedValue, money: false, action: { label: "Open deals", href: "/deals?workspace=crm-sales", companyId: id } });
      if (s.quietLeads >= 5) out.push({ id: `${id}:quiet`, companyId: id, kind: "risk", category: "sales", severity: s.quietLeads >= 10 ? "high" : "medium", title: `${s.quietLeads} open leads at ${company} have gone quiet`, detail: "No activity for 4 days or more. Leads cool quickly.", evidence: [{ label: "Quiet open leads", value: String(s.quietLeads), source: "Leads, last activity" }], basis: "verified", money: false, action: { label: "Open leads", href: "/leads?workspace=crm-sales", companyId: id } });
      const lmLeads = lm.sales?.leads ?? 0;
      const lmPrev = lmBefore?.sales?.leads ?? 0;
      const leadMove = change(lmLeads, lmPrev);
      if (leadMove !== null && Math.abs(leadMove) >= 30 && Math.max(lmLeads, lmPrev) >= 4) out.push({ id: `${id}:lead-move`, companyId: id, kind: "anomaly", category: "sales", severity: leadMove < 0 ? "medium" : "low", positive: leadMove > 0, title: `${company} captured ${Math.abs(leadMove)}% ${leadMove > 0 ? "more" : "fewer"} leads in ${input.lastMonth.period.label}`, detail: leadDrivers(book, input.lastMonth.period), evidence: [{ label: input.lastMonth.period.label, value: String(lmLeads), source: "Leads created" }, { label: input.lastMonth.period.previous!.label, value: String(lmPrev), source: "Leads created" }], basis: "verified", money: false, action: { label: "Open lead sources", href: "/lead-sources?workspace=crm-sales", companyId: id } });
      const best = channelOpportunity(book);
      if (best) out.push({ id: `${id}:channel`, companyId: id, kind: "opportunity", category: "sales", severity: "low", positive: true, title: `${best.channel} converts best at ${company}`, detail: `${best.channel} wins ${best.rate}% of its leads but brings only ${best.share}% of them. More effort there should lift wins.`, evidence: [{ label: `${best.channel} leads`, value: String(best.count), source: "Leads by channel" }, { label: `${best.channel} won`, value: String(best.won), source: "Leads, stage won" }, { label: "Other channels' win rate", value: `${best.otherRate}%`, source: "Leads by channel" }], basis: "verified", money: false, action: { label: "Open lead sources", href: "/lead-sources?workspace=crm-sales", companyId: id } });
      void qBefore;
    }
  }

  // Win-rate benchmark across companies with enough closed deals.
  const rates = input.quarter.now.filter((item) => item.sales?.winRate != null).map((item) => ({ id: item.id, rate: item.sales!.winRate! }));
  if (rates.length >= 2) {
    const sorted = [...rates].sort((a, b) => a.rate - b.rate);
    const median = sorted[Math.floor(sorted.length / 2)].rate;
    for (const item of rates.filter((entry) => entry.rate <= median - 15)) out.push({ id: `${item.id}:winrate`, companyId: item.id, kind: "benchmark", category: "sales", severity: "medium", title: `${name(books, item.id)} wins ${item.rate}% of closed deals against a portfolio median of ${median}%`, detail: "Compare lost reasons and pricing with the stronger companies.", evidence: rates.map((entry) => ({ label: name(books, entry.id), value: `${entry.rate}%`, source: "Won ÷ (won + lost)" })), basis: "verified", money: false, action: { label: "Open deals", href: "/deals?workspace=crm-sales", companyId: item.id } });
  }
  // Pipeline concentration.
  const pipe = input.quarter.now.filter((item) => item.sales && item.sales.pipeline > 0);
  const total = pipe.reduce((sumValue, item) => sumValue + item.sales!.pipeline, 0);
  const top = [...pipe].sort((a, b) => b.sales!.pipeline - a.sales!.pipeline)[0];
  if (pipe.length >= 2 && top && top.sales!.pipeline / total >= 0.6) out.push({ id: "portfolio:pipeline-concentration", companyId: null, kind: "risk", category: "sales", severity: "low", title: `${pct((top.sales!.pipeline / total) * 100)} of the portfolio's open pipeline is in ${name(books, top.id)}`, detail: "Growth depends heavily on one company's sales team.", evidence: pipe.map((item) => ({ label: name(books, item.id), value: inr(item.sales!.pipeline), source: "Open deals" })), basis: "verified", amount: total, money: false });

  // Compliance.
  for (const book of books) {
    const id = book.record.id;
    const past = input.obligations.filter((item) => item.companyId === id && item.status === "unconfirmed");
    if (past.length) out.push({ id: `${id}:compliance-unconfirmed`, companyId: id, kind: "risk", category: "compliance", severity: "high", title: `${past.length} past-due filing${past.length === 1 ? "" : "s"} not confirmed at ${book.record.name}`, detail: "Record the filing (date and acknowledgement number) once it is done, or file it. Late GST and TDS filings attract fees and interest.", evidence: past.slice(0, 5).map((item) => ({ label: `${item.form} · ${item.period}`, value: `due ${item.due}`, source: item.authority })), basis: "verified", money: false, action: { label: "Open compliance", href: `/portfolio?view=compliance&company=${id}`, companyId: null } });
    const gaps = input.missing.filter((item) => item.companyId === id && item.severity === "high");
    if (gaps.length) out.push({ id: `${id}:compliance-gaps`, companyId: id, kind: "gap", category: "compliance", severity: "medium", title: `${book.record.name} is missing ${gaps.map((item) => item.field).join(", ")}`, detail: gaps[0].why, evidence: gaps.map((item) => ({ label: item.field, value: "Not recorded", source: "Company registration details" })), basis: "verified", money: false, action: { label: "Add details", href: `/portfolio?view=companies&company=${id}`, companyId: null } });
  }
  // Targets.
  for (const item of input.targets) {
    if (item.target <= 0) continue;
    const behind = item.achieved < item.expected * 0.8;
    const ahead = item.achieved >= item.expected * 1.1;
    if (!behind && !ahead) continue;
    const money = item.measure !== "leads";
    const fmt = (value: number) => money ? inr(value) : String(value);
    out.push({ id: `${item.companyId}:target:${item.measure}`, companyId: item.companyId, kind: behind ? "risk" : "benchmark", category: item.measure === "leads" || item.measure === "wonValue" ? "sales" : "finance", severity: behind ? (item.achieved < item.expected * 0.5 ? "high" : "medium") : "low", positive: ahead, title: `${name(books, item.companyId)} is ${behind ? "behind" : "ahead of"} its ${TARGET_LABEL[item.measure].toLowerCase()} target`, detail: `${Math.round(item.achieved * 100)}% achieved with ${Math.round(item.expected * 100)}% of the quarter gone.`, evidence: [{ label: "Target", value: fmt(item.target), source: "Portfolio targets" }, { label: "Actual", value: fmt(item.actual), source: TARGET_LABEL[item.measure] }], basis: "verified", amount: Math.abs(item.target * item.expected - item.actual), money, action: { label: "Open targets", href: `/portfolio?view=analytics#targets`, companyId: null } });
  }
  // Blind spots: what Janus cannot see.
  const noBooks = books.filter((book) => !book.on.finance);
  if (noBooks.length) out.push({ id: "portfolio:no-books", companyId: null, kind: "gap", category: "data", severity: "low", title: `${noBooks.length} of ${books.length} companies have no books in Janus`, detail: `${noBooks.map((book) => book.record.name).join(", ")} ${noBooks.length === 1 ? "has" : "have"} Finance & Accounting switched off, so revenue, profit and cash leave ${noBooks.length === 1 ? "it" : "them"} out.`, evidence: noBooks.map((book) => ({ label: book.record.name, value: "No ledger", source: "Workspaces" })), basis: "verified", money: false, action: { label: "Manage workspaces", href: "/portfolio?view=companies", companyId: null } });
  return out.sort((a, b) => rank(b) - rank(a));
}

/** Which customers explain a change in net sales between the period and the one before. */
export function revenueDrivers(book: CompanyBook, period: Period) {
  if (!book.finance || !period.previous) return [];
  const total = (range: { from: string; to: string; label: string }) => {
    const map = new Map<string, number>();
    for (const invoice of book.finance!.invoices.filter((item) => !item.cancelled && inRange(item.date, range))) map.set(invoice.customerCompany || invoice.customer, (map.get(invoice.customerCompany || invoice.customer) ?? 0) + invoiceTotals(invoice).taxable);
    return map;
  };
  const now = total(period);
  const before = total(period.previous);
  return [...new Set([...now.keys(), ...before.keys()])].map((customer) => ({ customer, now: now.get(customer) ?? 0, before: before.get(customer) ?? 0, delta: (now.get(customer) ?? 0) - (before.get(customer) ?? 0) })).filter((item) => item.delta !== 0).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}
const CHANNEL: Record<string, string> = { whatsapp: "WhatsApp", website: "Website", phone_call: "Phone calls" };
function leadDrivers(book: CompanyBook, period: Period) {
  if (!period.previous) return "";
  const count = (range: { from: string; to: string }, source: string) => book.leads.filter((item) => item.source === source && item.createdAt.slice(0, 10) >= range.from && item.createdAt.slice(0, 10) <= range.to).length;
  const moves = Object.keys(CHANNEL).map((source) => ({ source, delta: count(period, source) - count(period.previous!, source) })).filter((item) => item.delta !== 0).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return moves.length ? `By channel: ${moves.map((item) => `${CHANNEL[item.source]} ${item.delta > 0 ? "+" : ""}${item.delta}`).join(", ")}.` : "Every channel moved by the same amount.";
}
function channelOpportunity(book: CompanyBook) {
  const total = book.leads.length;
  if (total < 8) return null;
  const rows = Object.keys(CHANNEL).map((source) => { const list = book.leads.filter((item) => item.source === source); const won = list.filter((item) => item.stage === "won").length; return { source, count: list.length, won, rate: list.length ? Math.round((won / list.length) * 100) : 0 }; }).filter((row) => row.count >= 3);
  const best = [...rows].sort((a, b) => b.rate - a.rate)[0];
  if (!best || best.won < 2) return null;
  const others = rows.filter((row) => row.source !== best.source);
  const otherLeads = others.reduce((s, row) => s + row.count, 0);
  const otherRate = otherLeads ? Math.round((others.reduce((s, row) => s + row.won, 0) / otherLeads) * 100) : 0;
  const share = Math.round((best.count / total) * 100);
  return best.rate >= otherRate + 10 && share < 50 ? { channel: CHANNEL[best.source], rate: best.rate, share, count: best.count, won: best.won, otherRate } : null;
}

/** Overall standing for each company, from its signals. */
export type Health = "attention" | "watch" | "on-track" | "limited";
export function healthOf(book: CompanyBook, signals: Signal[]): { health: Health; reasons: Signal[] } {
  const mine = signals.filter((item) => item.companyId === book.record.id && !item.positive && item.kind !== "opportunity");
  if (mine.some((item) => item.severity === "high")) return { health: "attention", reasons: mine.filter((item) => item.severity === "high") };
  if (mine.some((item) => item.severity === "medium")) return { health: "watch", reasons: mine.filter((item) => item.severity === "medium") };
  if (!book.on.finance && !book.on.crm) return { health: "limited", reasons: [] };
  return { health: "on-track", reasons: [] };
}
export const HEALTH_TEXT: Record<Health, string> = { attention: "Needs attention", watch: "Watch", "on-track": "On track", limited: "Limited data" };
export const HEALTH_TONE = { attention: "danger", watch: "warning", "on-track": "success", limited: "neutral" } as const;

/* ---------- Questions ---------- */

export interface Answer {
  text: string;
  table?: { columns: string[]; rows: string[][] };
  evidence: Evidence[];
  basis: Basis | "mixed";
  gaps: string[];
  followUps: string[];
  signals?: Signal[];
}

const coverageGaps = (books: CompanyBook[], need: "finance" | "crm" | "hr", what: string) => books.filter((book) => !book.on[need]).map((book) => `${book.record.name} has no ${what} in Janus, so it is left out.`);

/** Answers a question from the records and signals only. Unknown questions get an honest "cannot answer". */
export function answer(question: string, input: IntelInput, signals: Signal[], money: boolean): Answer {
  const q = question.toLowerCase();
  const { books } = input;
  const nameOf = (id: string) => name(books, id);
  const fq = input.quarter;
  const follow = ["Which company needs immediate attention?", "Compare profitability across all companies", "What are the biggest financial risks this quarter?", "Which company is performing worst this month, and why?"];
  if (!books.length) return { text: "There are no companies in your view yet.", evidence: [], basis: "verified", gaps: [], followUps: [] };
  const named = books.find((book) => q.includes(book.record.name.toLowerCase().split(" ")[0]));
  const moneyBlocked = (): Answer => ({ text: "Your Portfolio role does not include financial figures, so I cannot answer this one.", evidence: [], basis: "verified", gaps: [], followUps: follow.filter((item) => !/profit|financial/.test(item)) });

  if (/worst|weakest|underperform|best|strongest|perform/.test(q)) {
    const scored = books.map((book) => {
      const mine = signals.filter((item) => item.companyId === book.record.id && (money || !item.money));
      const bad = mine.filter((item) => !item.positive && item.kind !== "opportunity" && item.kind !== "gap");
      const score = bad.reduce((s, item) => s + weight[item.severity], 0) - mine.filter((item) => item.positive).length;
      return { book, score, bad };
    }).sort((a, b) => b.score - a.score);
    const worst = /best|strongest/.test(q) ? [...scored].reverse()[0] : scored[0];
    const reasons = worst.bad.slice(0, 4);
    const limited = books.filter((book) => !book.on.finance || !book.on.crm);
    return {
      text: /best|strongest/.test(q)
        ? `${worst.book.record.name} has the fewest open problems and ${signals.filter((item) => item.companyId === worst.book.record.id && item.positive).length} positive signal(s).`
        : worst.score <= 0 ? "No company shows a clear problem in its records right now." : `${worst.book.record.name} needs the most attention: ${reasons.map((item) => item.title.replace(`${worst.book.record.name}'s `, "").replace(` at ${worst.book.record.name}`, "")).join("; ")}.`,
      table: { columns: ["Company", "Open issues", "High", "Basis"], rows: scored.map((item) => [item.book.record.name, String(item.bad.length), String(item.bad.filter((s) => s.severity === "high").length), item.bad.some((s) => s.basis === "estimate") ? "Includes estimates" : "Recorded figures"]) },
      evidence: reasons.flatMap((item) => item.evidence.slice(0, 2)), basis: reasons.some((item) => item.basis === "estimate") ? "mixed" : "verified",
      gaps: limited.length ? [`Compared on the records each company has. ${limited.map((book) => `${book.record.name} has ${[!book.on.finance && "no books", !book.on.crm && "no CRM"].filter(Boolean).join(" and ")}`).join("; ")}, so a like-for-like ranking is not possible.`] : [],
      followUps: follow, signals: reasons,
    };
  }
  if (/revenue|sales|turnover|income/.test(q) && /declin|drop|down|fall|why|lower|less/.test(q)) {
    if (!money) return moneyBlocked();
    const period = input.month.period;
    const rows = books.map((book) => {
      const now = by(input.month.now, book.record.id, (item) => item.id)!;
      const before = input.month.before ? by(input.month.before, book.record.id, (item) => item.id) : undefined;
      if (now.finance) { const delta = change(now.finance.netSales, before?.finance?.netSales ?? null); return { book, kind: "Net sales (booked)", now: inr(now.finance.netSales), before: inr(before?.finance?.netSales ?? 0), delta, drivers: revenueDrivers(book, period).slice(0, 2) }; }
      if (now.sales) { const delta = change(now.sales.wonValue, before?.sales?.wonValue ?? null); return { book, kind: "Deals won (not revenue)", now: inr(now.sales.wonValue), before: inr(before?.sales?.wonValue ?? 0), delta, drivers: [] }; }
      return { book, kind: "No sales records", now: "—", before: "—", delta: null, drivers: [] };
    });
    const falling = rows.filter((row) => row.delta !== null && row.delta < 0);
    return {
      text: falling.length === 0 ? `No company's sales are down on the same days of last month (${period.label}).` : `${falling.map((row) => `${row.book.record.name} (${row.kind.toLowerCase()} ${row.delta}%${row.drivers.length ? `, mostly ${row.drivers.map((d) => `${d.customer} ${d.delta > 0 ? "+" : "−"}${inr(Math.abs(d.delta))}`).join(" and ")}` : ""})`).join("; ")}.`,
      table: { columns: ["Company", "Measure", period.label, period.previous!.label, "Change"], rows: rows.map((row) => [row.book.record.name, row.kind, row.now, row.before, row.delta === null ? "—" : `${row.delta > 0 ? "+" : ""}${row.delta}%`]) },
      evidence: falling.flatMap((row) => row.drivers.map((d) => ({ label: `${row.book.record.name} · ${d.customer}`, value: `${inr(d.before)} → ${inr(d.now)}`, source: "Invoices by customer" }))),
      basis: "verified", gaps: [...coverageGaps(books, "finance", "books"), "Deals won are a sales measure. They become revenue only when invoiced."], followUps: follow,
    };
  }
  if (/attention|urgent|immediate|priority|focus/.test(q)) {
    const visible = signals.filter((item) => (money || !item.money) && !item.positive && item.kind !== "opportunity");
    const top = visible.filter((item) => item.severity === "high").slice(0, 6);
    const counts = books.map((book) => ({ book, n: visible.filter((item) => item.companyId === book.record.id && item.severity === "high").length })).sort((a, b) => b.n - a.n);
    return { text: top.length ? `${counts[0].book.record.name} first: ${counts[0].n} high-priority issue${counts[0].n === 1 ? "" : "s"}. ${top.length} high-priority items across the portfolio.` : "Nothing high-priority is open in any company.", table: { columns: ["Company", "Issue", "Basis"], rows: top.map((item) => [nameOf(item.companyId ?? ""), item.title, item.basis === "estimate" ? "Estimate" : "Recorded"]) }, evidence: top.flatMap((item) => item.evidence.slice(0, 1)), basis: top.some((item) => item.basis === "estimate") ? "mixed" : "verified", gaps: [], followUps: follow, signals: top };
  }
  if (/profit|margin|profitab/.test(q)) {
    if (!money) return moneyBlocked();
    const rows = books.map((book) => { const f = by(fq.now, book.record.id, (item) => item.id)!; return [book.record.name, f.finance ? inr(f.finance.netSales) : "No books", f.finance ? inr(f.finance.costs) : "—", f.finance ? inr(f.finance.profit) : "—", f.finance?.margin != null ? `${f.finance.margin}%` : "—", f.people ? inr(f.people.payrollPeriod) : "—", f.finance && f.people ? inr(f.finance.profit - f.people.payrollPeriod) : "—"]; });
    const c = fq.consolidated;
    return { text: c.coverage.finance ? `Consolidated profit before payroll for ${fq.period.label} is ${inr(c.consolidated.profit)} on net sales of ${inr(c.consolidated.netSales)}${c.consolidated.margin != null ? ` (${c.consolidated.margin}% margin)` : ""}. After the payroll run-rate it is about ${inr(c.consolidated.profitAfterPayroll)}.` : "No company keeps books in Janus, so profit cannot be worked out.", table: { columns: ["Company", "Net sales", "Booked costs", "Profit before payroll", "Margin", "Payroll run-rate (est.)", "After payroll (est.)"], rows }, evidence: [{ label: "Inter-company sales eliminated", value: inr(c.eliminations.sales), source: "Invoices to other Portfolio companies" }], basis: "mixed", gaps: [...coverageGaps(books, "finance", "books"), "Payroll is not posted to the books yet; the run-rate comes from salary records and is an estimate."], followUps: follow };
  }
  if (/risk|threat|danger|exposure/.test(q)) {
    const list = signals.filter((item) => item.kind === "risk" && (money || !item.money) && (/financ|money|cash/.test(q) ? item.category === "finance" : true)).slice(0, 8);
    return { text: list.length ? `${list.length} risk${list.length === 1 ? "" : "s"} for ${fq.period.label}, largest first. The biggest: ${list[0].title}.` : "No risks show in the records this quarter.", table: { columns: ["Company", "Risk", "At stake", "Basis"], rows: list.map((item) => [nameOf(item.companyId ?? ""), item.title, item.amount ? inr(item.amount) : "—", item.basis === "estimate" ? "Estimate" : "Recorded"]) }, evidence: list.flatMap((item) => item.evidence.slice(0, 1)), basis: list.some((item) => item.basis === "estimate") ? "mixed" : "verified", gaps: coverageGaps(books, "finance", "books"), followUps: follow, signals: list };
  }
  if (/cash|runway|receivable|payable|owe|collect|overdue/.test(q)) {
    if (!money) return moneyBlocked();
    const rows = books.map((book) => { const f = by(fq.now, book.record.id, (item) => item.id)!.finance; return [book.record.name, f ? inr(f.cash) : "No books", f ? inr(f.receivables) : "—", f ? inr(f.overdueReceivables) : "—", f ? inr(f.payables) : "—", f?.runwayMonths != null ? `${f.runwayMonths} mo (est.)` : f ? "Cash not falling" : "—"]; });
    return { text: `Combined cash on record is ${inr(fq.consolidated.combined.cash)}; customers owe ${inr(fq.consolidated.consolidated.receivables)} (${inr(fq.consolidated.combined.overdueReceivables)} overdue) and vendors are owed ${inr(fq.consolidated.consolidated.payables)}.`, table: { columns: ["Company", "Cash", "Receivables", "Overdue", "Payables", "Runway"], rows }, evidence: [], basis: "verified", gaps: coverageGaps(books, "finance", "books"), followUps: follow };
  }
  if (/target|goal|plan/.test(q)) {
    return { text: input.targets.length ? `${input.targets.length} target${input.targets.length === 1 ? "" : "s"} set for this quarter.` : "No targets are set for this quarter. Set them in Analytics, under Targets.", table: input.targets.length ? { columns: ["Company", "Measure", "Target", "Actual", "Achieved", "Expected by now"], rows: input.targets.filter((item) => money || item.measure === "leads").map((item) => [nameOf(item.companyId), TARGET_LABEL[item.measure], item.measure === "leads" ? String(item.target) : inr(item.target), item.measure === "leads" ? String(item.actual) : inr(item.actual), `${Math.round(item.achieved * 100)}%`, `${Math.round(item.expected * 100)}%`]) } : undefined, evidence: [], basis: "verified", gaps: [], followUps: follow };
  }
  if (/complian|filing|gst|tds|deadline|statutory|roc|mca/.test(q)) {
    const soon = input.obligations.filter((item) => item.status !== "filed").slice(0, 10);
    return { text: `${input.obligations.filter((item) => item.status === "unconfirmed").length} past-due filings are not confirmed and ${input.obligations.filter((item) => item.status === "due-soon").length} are due soon.`, table: { columns: ["Company", "Filing", "Period", "Due", "Status"], rows: soon.map((item) => [nameOf(item.companyId), item.form, item.period, item.due, item.status === "unconfirmed" ? "Not confirmed" : item.status === "due-soon" ? "Due soon" : "Upcoming"]) }, evidence: [], basis: "verified", gaps: ["Due dates follow the standard statutory calendar. Extensions announced by the government are not tracked; confirm with your CA."], followUps: follow };
  }
  if (/opportunit|grow|upside/.test(q)) {
    const list = signals.filter((item) => item.kind === "opportunity" || item.positive);
    return { text: list.length ? `${list.length} opportunit${list.length === 1 ? "y" : "ies"} in the records.` : "No clear opportunity stands out in the records.", table: { columns: ["Company", "Opportunity"], rows: list.map((item) => [nameOf(item.companyId ?? ""), item.title]) }, evidence: list.flatMap((item) => item.evidence.slice(0, 1)), basis: "verified", gaps: [], followUps: follow, signals: list };
  }
  if (/pipeline|deal|lead|win|conversion|sales/.test(q)) {
    const rows = books.map((book) => { const s = by(fq.now, book.record.id, (item) => item.id)!.sales; return [book.record.name, s ? inr(s.pipeline) : "No CRM", s ? String(s.openDeals) : "—", s ? String(s.leads) : "—", s?.winRate != null ? `${s.winRate}%` : "—", s ? inr(s.wonValue) : "—"]; });
    return { text: `Open pipeline across companies with CRM is ${inr(fq.consolidated.combined.pipeline)}, with ${inr(fq.consolidated.combined.wonValue)} won in ${fq.period.label}.`, table: { columns: ["Company", "Open pipeline", "Open deals", "New leads", "Win rate", "Won"], rows }, evidence: [], basis: "verified", gaps: coverageGaps(books, "crm", "CRM"), followUps: follow };
  }
  if (/payroll|salary|people|headcount|staff|employee|team/.test(q)) {
    const rows = books.map((book) => { const p = by(fq.now, book.record.id, (item) => item.id)!.people; return [book.record.name, p ? String(p.headcount) : "No HR", p ? String(p.departments) : "—", p && money ? inr(p.payrollMonthly) : "—", p ? String(p.pendingLeave) : "—"]; });
    return { text: `${fq.consolidated.combined.headcount} people across the portfolio${money ? `, with a monthly payroll of ${inr(fq.consolidated.combined.payroll)} from salary records` : ""}.`, table: { columns: ["Company", "People", "Departments", "Monthly payroll", "Leave waiting"], rows }, evidence: [], basis: "verified", gaps: coverageGaps(books, "hr", "HR records"), followUps: follow };
  }
  if (/compare|benchmark|side by side|vs|versus/.test(q) || named) {
    const list = named ? [named] : books;
    const rows = list.map((book) => { const f = by(fq.now, book.record.id, (item) => item.id)!; return [book.record.name, money && f.finance ? inr(f.finance.netSales) : f.finance ? "Hidden" : "No books", money && f.finance ? `${f.finance.margin ?? "—"}%` : "—", f.sales ? inr(f.sales.pipeline) : "No CRM", f.sales?.winRate != null ? `${f.sales.winRate}%` : "—", f.people ? String(f.people.headcount) : "—"]; });
    const mine = named ? signals.filter((item) => item.companyId === named.record.id && (money || !item.money)).slice(0, 5) : [];
    return { text: named ? `${named.record.name}, ${fq.period.label}: ${mine.length ? mine.map((item) => item.title).join("; ") : "no open issues in its records"}.` : `The same measures for every company, ${fq.period.label}.`, table: { columns: ["Company", "Net sales", "Margin", "Open pipeline", "Win rate", "People"], rows }, evidence: mine.flatMap((item) => item.evidence.slice(0, 1)), basis: "verified", gaps: [], followUps: follow, signals: mine };
  }
  return { text: "I can answer from the records your companies keep: sales and pipeline, booked revenue, profit, cash, receivables and payables (where books are kept), people and payroll, targets, compliance deadlines, risks and opportunities. I could not match this question to those records, and I will not guess.", evidence: [], basis: "verified", gaps: [], followUps: follow };
}
