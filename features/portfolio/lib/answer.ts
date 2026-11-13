import { attentionOf, femaAge, outsideSales, payrollFor, RATE_MINIMUM, winRate, winRateText } from "@/features/portfolio/lib/companies";
import { businessName, sells } from "@/features/portfolio/lib/business";
import { day, inr, todayIst } from "@/features/portfolio/lib/format";

/** "Kavita Stores'" and "Neema Textiles'", "Asha's". */
const whose = (name: string) => name.endsWith("s") ? `${name}'` : `${name}'s`;
const healthWord = { red: "Needs you", amber: "Watch", green: "On track" } as const;
import type { PortfolioCompany, PortfolioPeriod } from "@/features/portfolio/types";

export type Answer = { text: string; rows?: [string, string][] };

/** Answers from the figures on the page only, naming the company and the number, and says when it cannot. */
export function answerLive(question: string, list: PortfolioCompany[], period?: PortfolioPeriod): Answer {
  const q = question.toLowerCase();
  // A company by its full name, or by its first word when no other company shares it ("Neema" alone
  // cannot tell Neema Textiles from Neema Retail).
  const first = (item: PortfolioCompany) => item.name.split(" ")[0].toLowerCase();
  const named = list.find((item) => q.includes(item.name.toLowerCase())) ?? list.find((item) => new RegExp(`\\b${first(item).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(q) && list.filter((other) => first(other) === first(item)).length === 1);
  const scope = named ? [named] : list;
  const top = <T,>(pick: (item: PortfolioCompany) => T | null | undefined, value: (item: PortfolioCompany) => number) => [...scope].filter((item) => pick(item) !== null && pick(item) !== undefined).sort((a, b) => value(b) - value(a))[0];
  // Janus does not forecast: say so before anything else can match "sales" or "pipeline".
  if (/forecast|predict|next (month|quarter|year)|will (we|it|sales|revenue)|going to (sell|make|earn)/.test(q)) {
    const open = scope.reduce((sum, item) => sum + Number(item.crm.pipelineValue), 0);
    const deals = scope.reduce((sum, item) => sum + item.crm.openDeals, 0);
    return { text: `I do not forecast sales, and I will not guess. What exists today: ${inr(open)} open in ${deals} deal${deals === 1 ? "" : "s"}${named ? ` at ${named.name}` : ""}, which may or may not close.` };
  }
  // A period the figures do not cover is said out loud, not quietly swapped for another.
  const asked = /last (month|quarter|year)|previous (month|quarter|year)/.exec(q)?.[0];
  const unsupported = asked ? `I only have ${period?.label ?? "the period chosen above"} and the same days before it, not "${asked}". Switch the period above for more. ` : "";
  const customer = list.flatMap((item) => item.customers.map((entry) => ({ company: item, ...entry }))).find((entry) => q.includes(entry.name.toLowerCase()));
  // One of the group's own companies can be another's customer. Its name then means the company
  // ("what is owed to Malhotra Retail", "GST due at Malhotra Retail") unless the question asks what
  // it owes ("what does Malhotra Retail owe"): only then is it the customer.
  const own = customer ? list.find((item) => item.name.toLowerCase() === customer.name.toLowerCase()) : undefined;
  if (customer && own) {
    const name = customer.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b(does|do|did|will)\\s+${name}\\s+(still\\s+)?(owe|pay)|${name}\\s+(still\\s+)?(owes|has to pay|must pay)`).test(q)) {
      const sellers = list.flatMap((item) => item.customers.filter((entry) => entry.name.toLowerCase() === customer.name.toLowerCase()).map((entry) => ({ company: item, ...entry })));
      return { text: `${unsupported}${own.name} is one of your own companies. What it buys from the others is shown here as their sales, not what it still owes one by one: Finance, Between your companies, matches each invoice to its bill.`, rows: sellers.map((entry): [string, string] => [`Bought from ${entry.company.name}`, `${inr(Number(entry.current))} this period before GST (${inr(Number(entry.previous))} in the same days before)`]) };
    }
  }
  if (customer && !own && /owe|overdue|outstanding|invoice|due|pay/.test(q)) {
    return { text: `${unsupported}Janus has ${whose(customer.name)} sales here, not what they owe one by one: open ${whose(customer.company.name)} Finance, Receivables for their invoices. Sales before GST this period: ${inr(Number(customer.current))} (${inr(Number(customer.previous))} in the same days before).` };
  }
  if (/biggest customer|top customer|largest customer|main customer|concentrat|depend/.test(q)) {
    const rows = scope.filter((item) => item.books && item.customers.length).map((item): [string, string] => {
      const sales = Number(item.books!.current.netSales); const top = item.customers[0];
      return [item.name, Number(top.current) > 0 ? `${top.name}: ${inr(Number(top.current))}${sales > 0 ? `, ${Math.round((Number(top.current) / sales) * 100)}% of sales` : ""}` : `${top.name} bought most before; nothing yet this period`];
    });
    if (!rows.length) return { text: scope.some((item) => item.books) ? "No customer has invoices in this period or the same days before." : "Customers come from the books, and money is not shared with your role." };
    return { text: `${unsupported}Each company's biggest customer this period, by sales before GST, and their share of its sales. A share over 40% means a lot rides on one customer.`, rows };
  }
  const why = /why|reason|explain|what changed|drop|fall|fell|rise|rose|grew|declin/.test(q);
  if (why && /sale|revenue|income|turnover/.test(q)) {
    const withBooks = scope.filter((item) => item.books);
    if (!withBooks.length) return { text: "Sales come from the books, and money is not shared with your role." };
    const selling = withBooks.filter((item) => Number(item.books!.current.netSales) || Number(item.books!.previous.netSales));
    if (!selling.length) return { text: "No company has sales in the books for this period or the same days before." };
    const rows = selling.flatMap((item): [string, string][] => {
      const now = Number(item.books!.current.netSales), before = Number(item.books!.previous.netSales);
      const movers = [...item.customers].map((customer) => ({ name: customer.name, diff: Number(customer.current) - Number(customer.previous) })).filter((mover) => mover.diff !== 0).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 3);
      // A sale to one of your own companies is not growth: say what is left once it is taken out.
      const own = Number(item.intercompany?.sales ?? 0), ownBefore = Number(item.intercompany?.salesBefore ?? 0);
      const outside = own || ownBefore ? `; outside the group ${inr(outsideSales(item, "current"))} against ${inr(outsideSales(item, "previous"))}, after ${inr(own)} to your own companies` : "";
      return [[item.name, `${inr(now)} against ${inr(before)} in the same days before (${now >= before ? "+" : "−"}${inr(Math.abs(now - before))})${outside}`], ...movers.map((mover): [string, string] => [`↳ customer ${mover.name}`, `${mover.diff > 0 ? "+" : "−"}${inr(Math.abs(mover.diff))}`])];
    });
    return { text: "Sales against the same days before, with the customers who moved most. Sales are invoices before GST.", rows };
  }
  if (why && /lead|enquir|inquir/.test(q)) {
    const rows = scope.flatMap((item): [string, string][] => {
      const movers = item.leadSources.filter((source) => source.current !== source.previous).sort((a, b) => Math.abs(b.current - b.previous) - Math.abs(a.current - a.previous)).slice(0, 3);
      return [[item.name, `${item.period.current.leads} leads against ${item.period.previous.leads} in the same days before`], ...movers.map((source): [string, string] => [`↳ from ${source.source.replace(/_/g, " ")}`, `${source.current} against ${source.previous}`])];
    });
    return { text: "Leads against the same days before, by the channel they came from.", rows };
  }
  // Performance is profit and sales; "needs you most" (below) is what is wrong today. A question can ask either.
  if (/perform|worst|weakest|best|strongest|doing (well|badly|poorly)/.test(q) && !/need|attention|win rate|pipeline|lead|customer/.test(q)) {
    // A holding company or one not trading yet is not ranked on sales; it is named as left out.
    const withBooks = scope.filter((item) => item.books && sells(item));
    const leftOut = scope.filter((item) => item.books && !sells(item));
    const outText = leftOut.length ? ` Left out, as they do not sell: ${leftOut.map((item) => `${item.name} (${businessName(item).toLowerCase()})`).join(", ")}.` : "";
    if (!withBooks.length) return { text: leftOut.length ? `None of these companies sells, so none is ranked on sales and profit.${outText} Ask which company needs you most instead.` : "Performance is judged on sales and profit from the books, and money is not shared with your role. Ask which company needs you most instead." };
    const best = /best|strongest|well/.test(q);
    const scored = withBooks.map((item) => {
      // The change is judged on sales outside the group, as on the Overview.
      const now = outsideSales(item, "current"), before = outsideSales(item, "previous"), profit = Number(item.books!.current.profitBeforePayroll);
      const pay = period ? payrollFor(item, period) : null;
      // The customer who moved sales most in the direction asked about: the biggest rise for "best", fall for "worst".
      const mover = [...item.customers].map((customer) => ({ name: customer.name, diff: Number(customer.current) - Number(customer.previous) })).sort((a, b) => best ? b.diff - a.diff : a.diff - b.diff)[0];
      return { item, now, before, sales: Number(item.books!.current.netSales), profit, pay, after: pay === null ? profit : profit - pay, mover };
    });
    const ranked = scored.sort((a, b) => best ? b.after - a.after : a.after - b.after);
    const pick = ranked[0];
    const change = (row: typeof pick) => row.before > 0 ? `${row.now >= row.before ? "+" : "−"}${Math.abs(Math.round(((row.now - row.before) / row.before) * 100))}% on the same days before${row.sales !== row.now ? ", on sales outside the group" : ""}` : "nothing in the same days before";
    const margin = (row: typeof pick) => row.sales > 0 ? `${Math.round((row.profit / row.sales) * 100)}% margin before salaries` : "no sales";
    const profitText = (row: typeof pick) => row.pay === null ? `${inr(row.profit)} profit, salaries unknown` : `about ${inr(row.after)} after ${inr(row.pay)} of salaries (estimate)`;
    const reasons = [`sales ${inr(pick.sales)} (${change(pick)})`, margin(pick), profitText(pick), ...(pick.mover && (best ? pick.mover.diff > 0 : pick.mover.diff < 0) ? [`its biggest ${best ? "rise" : "fall"} is ${pick.mover.name}, ${best ? "+" : "−"}${inr(Math.abs(pick.mover.diff))}`] : [])];
    return {
      text: `${unsupported}${withBooks.length === 1 ? `${pick.item.name} in ${period?.label ?? "this period"}` : `${pick.item.name} is performing ${best ? "best" : "worst"} in ${period?.label ?? "this period"}, ranked on profit after salaries`}: ${reasons.join("; ")}. Sales are invoices before GST, as each company recorded them.${outText}`,
      rows: ranked.map((row): [string, string] => [row.item.name, `${profitText(row)} · sales ${inr(row.sales)}, ${change(row)} · ${margin(row)}`]),
    };
  }
  if (/risk|exposure|threat|danger|vulnerab/.test(q)) {
    const today = todayIst();
    // A legal limit comes first, then money at stake (largest first), then share-of-sales risks,
    // whose amount is sales, not money lost, so it is not ranked against the others.
    type Risk = { company: string; text: string; amount: number; tier: number };
    const risks = scope.flatMap((item): Risk[] => {
      const found: Risk[] = [];
      const add = (amount: number, text: string, tier = 1) => { if (amount > 0) found.push({ company: item.name, text, amount, tier }); };
      if (item.businessModel === "import_export" && item.money?.unpaidOver9MonthsInvoices) add(Number(item.money.unpaidOver9Months), `${inr(Number(item.money.unpaidOver9Months))} of export money ${femaAge(item.money.unpaidOver9MonthsInvoices, item.money.unpaidOldestMonths ?? 0)} on ${item.money.unpaidOver9MonthsInvoices} invoice${item.money.unpaidOver9MonthsInvoices === 1 ? "" : "s"}, past FEMA's 9-month limit: the bank reports it to the RBI`, 0);
      if (item.money) {
        add(Number(item.money.ageing.over60), `${inr(Number(item.money.ageing.over60))} owed by customers more than 60 days late (${inr(Number(item.money.overdue))} past due in all)`);
        add(Number(item.money.payableLate), `${inr(Number(item.money.payableLate))} of supplier bills already late`);
      }
      if (item.cash?.runwayMonths !== null && item.cash?.runwayMonths !== undefined && item.cash.runwayMonths < 3 && item.cash.monthlyBurn) {
        add(Number(item.cash.monthlyBurn) * 3 - Number(item.cash.total ?? 0), `cash lasts about ${item.cash.runwayMonths.toFixed(1)} months: ${inr(Number(item.cash.total ?? 0))} in the bank, ${inr(Number(item.cash.monthlyBurn))} a month more going out than coming in`);
      }
      if (item.books && period) {
        const pay = payrollFor(item, period);
        const after = Number(item.books.current.profitBeforePayroll) - (pay ?? 0);
        add(-after, `losing about ${inr(-after)} in ${period.label} ${pay === null ? "before salaries" : "after salaries (estimate)"}`);
      }
      if (item.tds && item.tds.dueOn < today) add(Number(item.tds.toDeposit), `${inr(Number(item.tds.toDeposit))} of TDS for ${item.tds.label} not deposited, due ${day(item.tds.dueOn)}: interest runs at 1.5% a month`);
      if (item.gst) add(Number(item.gst.lastMonth.payable), `${inr(Number(item.gst.lastMonth.payable))} of GST for ${item.gst.lastMonth.label} to pay with GSTR-3B`);
      const top = item.customers[0], sales = Number(item.books?.current.netSales ?? 0);
      if (top && sales > 0 && Number(top.current) / sales > 0.4) add(Number(top.current), `${Math.round((Number(top.current) / sales) * 100)}% of sales come from one customer, ${top.name}`, 2);
      return found;
    }).sort((a, b) => a.tier - b.tier || b.amount - a.amount);
    if (!scope.some((item) => item.money || item.books)) return { text: "Financial risks come from the books, and money is not shared with your role." };
    const asOf = /quarter|year|month/.test(q) ? "These are as of today, not by period: what is owed, late or short right now. " : "";
    return { text: risks.length ? `${asOf}${risks.length} financial risk${risks.length === 1 ? "" : "s"} across ${named ? named.name : "your companies"}: legal limits first, then the largest amount, then reliance on one customer.` : `${asOf}No financial risk shows in the figures: nothing more than 60 days late, no late bills, no loss, cash for at least 3 months, and no tax left to deposit.`, rows: risks.map((risk) => [risk.company, risk.text]) };
  }
  if (/struggl|behind|needs? (me|you|us) most|most attention|which company.*(attention|first|help)/.test(q)) {
    const order = { red: 0, amber: 1, green: 2 };
    const ranked = [...scope].sort((a, b) => order[a.health?.status ?? "green"] - order[b.health?.status ?? "green"] || (b.health?.reasons.length ?? 0) - (a.health?.reasons.length ?? 0));
    const first = ranked[0];
    return { text: first?.health && first.health.status !== "green" ? `${first.name} needs you most: ${first.health.reasons[0]}.` : "Every company is on track right now.", rows: ranked.map((item) => [item.name, item.health ? `${healthWord[item.health.status]}${item.health.reasons.length ? ` · ${item.health.reasons.join("; ")}` : ""}` : "—"]) };
  }
  if (/profit|margin|profitab/.test(q)) {
    const withBooks = scope.filter((item) => item.books && sells(item));
    const notSelling = scope.filter((item) => item.books && !sells(item));
    if (!withBooks.length) return { text: notSelling.length ? `None of these companies sells, so there is no profit from sales to compare: ${notSelling.map((item) => `${item.name} (${businessName(item).toLowerCase()})`).join(", ")}.` : "Profit comes from the books, and money is not shared with your role." };
    return { text: `Profit this period: sales before GST less supplier bills, then less salaries where they are in HR (an estimate, as salaries are not booked yet).${notSelling.length ? ` Left out, as they do not sell: ${notSelling.map((item) => `${item.name} (${businessName(item).toLowerCase()})`).join(", ")}.` : ""}`, rows: withBooks.map((item) => { const sales = Number(item.books!.current.netSales), profit = Number(item.books!.current.profitBeforePayroll); const pay = period ? payrollFor(item, period) : null; return [item.name, `${inr(profit)} before salaries on ${inr(sales)} of sales${sales > 0 ? ` (${Math.round((profit / sales) * 100)}% margin)` : ""}${pay === null ? " · salaries unknown" : ` · about ${inr(profit - pay)} after ${inr(pay)} of salaries`}`]; }) };
  }
  if (/attention|urgent|need|worry|problem|health|red/.test(q)) {
    const items = attentionOf(scope);
    return { text: items.length ? `${items.length} thing${items.length === 1 ? "" : "s"} need you${named ? ` at ${named.name}` : ""}, most urgent first.` : "Nothing needs you right now.", rows: items.slice(0, 8).map((item) => [item.company.name, item.text]) };
  }
  if (/approv|waiting|pending|decide/.test(q)) {
    const rows = scope.flatMap((item) => item.approvals.map((entry): [string, string] => [item.name, `${entry.count} ${(entry.count === 1 ? entry.one : entry.label).toLowerCase()}`]));
    return { text: rows.length ? "These are waiting for a decision." : "No approvals are waiting.", rows };
  }
  if (/payroll|salary|salaries/.test(q)) {
    const best = top((item) => item.people?.monthlyPayroll, (item) => Number(item.people?.monthlyPayroll ?? 0));
    if (!best) return { text: "Payroll is not shared with your role." };
    // Salaries are recorded a month at a time; a longer span is worked out and said to be an estimate.
    const span = /quarter/.test(q) ? 3 : /year|annual/.test(q) ? 12 : 1;
    const spanText = span === 1 ? "" : ` That is about ${inr(scope.reduce((sum, item) => sum + Number(item.people?.monthlyPayroll ?? 0), 0) * span)} for ${span === 3 ? "a quarter" : "a year"} at today's salaries, an estimate: salaries are not booked yet.`;
    return { text: unsupported + (named ? `${named.name} pays ${inr(Number(named.people?.monthlyPayroll ?? 0))} a month.` : `${best.name} has the heaviest payroll, ${inr(Number(best.people!.monthlyPayroll))} a month.`) + spanText, rows: scope.map((item): [string, string] => [item.name, Number(item.people?.monthlyPayroll ?? 0) > 0 ? `${inr(Number(item.people!.monthlyPayroll))} a month · ${item.people!.headcount} people` : "No salaries in HR yet"]) };
  }
  if (/people|headcount|staff|employee/.test(q)) return { text: `${scope.reduce((sum, item) => sum + (item.people?.headcount ?? 0), 0)} people${named ? ` at ${named.name}` : " across the companies"}.`, rows: scope.map((item) => [item.name, `${item.people?.headcount ?? 0} people · ${item.people?.onLeaveToday ?? 0} on leave today`]) };
  if (/owe|receivable|overdue|collect|outstanding/.test(q)) {
    const rows = scope.filter((item) => item.money).map((item): [string, string] => [item.name, `${inr(Number(item.money!.receivable))} owed · ${inr(Number(item.money!.overdue))} overdue`]);
    return rows.length ? { text: `Customers owe ${inr(scope.reduce((sum, item) => sum + Number(item.money?.receivable ?? 0), 0))} in all.`, rows } : { text: "Money is not shared with your role." };
  }
  if (/stock|inventory|reorder|expir/.test(q)) return { text: "Stock that needs a look.", rows: scope.map((item) => [item.name, `${item.stock?.belowReorder ?? 0} at or under reorder · ${item.stock?.expiringBatches ?? 0} batches expiring in 30 days`]) };
  if (/project|delivery|milestone|late/.test(q)) return { text: "Delivery across the companies.", rows: scope.map((item) => [item.name, `${item.delivery?.activeProjects ?? 0} active · ${item.delivery?.lateProjects ?? 0} late · ${item.delivery?.overdueMilestones ?? 0} milestones past due`]) };
  if (/gst|tds|compliance|filing|due/.test(q)) {
    const rows = scope.flatMap((item) => item.compliance.filter((due) => due.status === "overdue" || due.status === "due_soon").map((due): [string, string] => [item.name, `${due.label} for ${due.period}, due ${day(due.dueOn)}${due.status === "overdue" ? " (past due, not recorded as filed)" : ""}`]));
    return { text: rows.length ? "Filings past due or due this week." : "No filing is past due or due this week.", rows };
  }
  if (/win rate|conversion|close rate/.test(q)) {
    // Ranked only from RATE_MINIMUM closed deals, as on Analytics: one won deal is not a 100% win rate.
    const ranked = scope.filter((item) => item.crm.wonDeals + item.crm.lostDeals >= RATE_MINIMUM).sort((a, b) => (winRate(b) ?? 0) - (winRate(a) ?? 0));
    const pick = /worst|lowest|weakest/.test(q) ? ranked[ranked.length - 1] : ranked[0];
    return { text: named ? `${named.name} wins ${winRateText(named)} of the deals it has closed, all time.` : pick ? `${pick.name} has the ${/worst|lowest|weakest/.test(q) ? "lowest" : "best"} win rate, ${winRate(pick)}% of ${pick.crm.wonDeals + pick.crm.lostDeals} closed deals, all time.` : `No company has ${RATE_MINIMUM} closed deals yet, so no win rate is ranked.`, rows: scope.map((item) => [item.name, `${winRateText(item)} · ${item.crm.wonDeals} won, ${item.crm.lostDeals} lost`]) };
  }
  if (/lead|pipeline|deal|won|sales|revenue|best|compare/.test(q)) {
    const best = top((item) => item.crm, (item) => Number(item.crm.pipelineValue));
    return { text: named ? `${named.name} has ${inr(Number(named.crm.pipelineValue))} open in ${named.crm.openDeals} deals and has won ${inr(Number(named.crm.wonValue))}.` : `${best?.name} holds the largest open pipeline, ${inr(Number(best?.crm.pipelineValue ?? 0))}.`, rows: scope.map((item) => [item.name, `${item.period.current.leads} leads this period · ${inr(Number(item.crm.pipelineValue))} open · ${inr(Number(item.crm.wonValue))} won`]) };
  }
  return { text: "I could not match that to your records, and I will not guess. I answer from the figures on the Portfolio: why sales or leads changed, which company performs best or worst, which needs you most, financial risks, profit, what needs you, approvals, money owed, people and payroll, stock, delivery and filings. Name a company to narrow it." };
}
