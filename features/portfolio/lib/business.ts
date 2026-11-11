import { day, inr } from "@/features/portfolio/lib/format";
import type { BusinessModel, PortfolioCompany } from "@/features/portfolio/types";

type Chosen = Exclude<BusinessModel, "">;

/** Each kind of business: its name, a line on what it is, and what its sales are called. A kind
 * with no sales name (a holding company, one not trading yet) is never judged on sales. */
export const businessModels: Record<Chosen, { name: string; hint: string; sales: string | null }> = {
  trading: { name: "Trading or distribution", hint: "Buys goods and sells them to other businesses.", sales: "Sales" },
  retail: { name: "Retail store", hint: "Sells to customers at a shop counter or online.", sales: "Sales" },
  import_export: { name: "Import and export", hint: "Ships goods abroad, brings them in, or both.", sales: "Sales" },
  manufacturing: { name: "Manufacturing", hint: "Makes goods from raw material and sells them.", sales: "Sales" },
  services: { name: "Services or agency", hint: "Bills clients for work, projects or time.", sales: "Billing" },
  warehousing: { name: "Warehousing or storage", hint: "Earns rent or fees for storing others' goods.", sales: "Storage and rent billed" },
  holding: { name: "Holding or investment", hint: "Holds shares, property or loans; does not sell.", sales: null },
  not_started: { name: "Not trading yet", hint: "Set up, but no sales are expected yet.", sales: null },
};
export const businessOrder = Object.keys(businessModels) as Chosen[];

export const businessName = (item: PortfolioCompany) => item.businessModel ? businessModels[item.businessModel].name : "Kind of business not set";

const n = (value: string | null | undefined) => Number(value ?? 0);

/** Whether a company is judged on sales: every kind that sells, and a holding company that has sales anyway. */
export const sells = (item: PortfolioCompany) =>
  !item.businessModel || businessModels[item.businessModel].sales !== null || n(item.books?.current.netSales) !== 0 || n(item.books?.previous.netSales) !== 0;

/** What a company's sales are called: "Billing" for an agency, "Storage and rent billed" for a warehouse. */
export const salesName = (item: PortfolioCompany) => (item.businessModel && businessModels[item.businessModel].sales) || "Sales";

export type Measure = { label: string; value: string; detail: string };

/** The figures that matter most for this kind of business, from records Janus has, and what
 * Janus does not record for it, said plainly rather than shown as zero. */
export function focus(item: PortfolioCompany): { measures: Measure[]; notRecorded: string[] } {
  const books = item.books, money = item.money, stock = item.stock, cash = item.cash;
  const now = n(books?.current.netSales), before = n(books?.previous.netSales);
  const bills = item.period.current.invoices, billsBefore = item.period.previous.invoices;
  const pastDue = item.compliance.filter((due) => due.status === "overdue").length;
  const shared = "Not shared with your role";
  const m = {
    sales: (label = salesName(item)): Measure => ({ label, value: books ? inr(now) : "—", detail: books ? `${inr(before)} in the same days before, before GST` : shared }),
    margin: (): Measure => ({ label: "Margin before salaries", value: books && now ? `${Math.round((n(books.current.profitBeforePayroll) / now) * 100)}%` : "—", detail: books ? `${inr(n(books.current.profitBeforePayroll))} after supplier bills` : shared }),
    owed: (): Measure => ({ label: "Customers owe", value: money ? inr(n(money.receivable)) : "—", detail: money ? n(money.overdue) ? `${inr(n(money.overdue))} past due` : "Nothing past due" : shared }),
    stock: (): Measure => !stock?.items ? { label: "Stock", value: "—", detail: "No stock items in Operations yet" } : { label: "Stock", value: stock.stockValue != null ? inr(n(stock.stockValue)) : `${stock.items} items`, detail: `${stock.belowReorder} of ${stock.items} items at or under reorder${stock.expiringBatches ? ` · ${stock.expiringBatches} batches expiring in 30 days` : ""}` },
    cash: (): Measure => ({ label: "Cash in the bank", value: cash?.total != null ? inr(n(cash.total)) : "—", detail: cash ? `As of ${day(cash.asOf)}${cash.runwayMonths != null ? cash.runwayMonths > 36 ? " · lasts more than 3 years" : ` · lasts about ${cash.runwayMonths.toFixed(1)} months` : ""}` : "No bank statement imported" }),
    filings: (): Measure => ({ label: "Filings past due", value: String(pastDue), detail: item.complianceSetUp ? pastDue ? "Not recorded as filed" : "Nothing past due" : "Filings are not set up" }),
  };
  switch (item.businessModel) {
    case "retail": return {
      measures: [m.sales(), { label: "Bills raised", value: bills === null ? "—" : String(bills), detail: bills === null ? shared : `${billsBefore ?? 0} in the same days before` }, { label: "Average bill", value: bills ? inr(now / bills) : "—", detail: bills ? "Sales before GST ÷ bills raised" : "No bills raised in this period" }, m.stock()],
      notRecorded: ["Counter sales from a billing machine (POS) are not connected: only invoices raised in Janus count, so bills and the average bill may read low.", "Footfall is not recorded."],
    };
    case "import_export": return {
      measures: [m.sales(), m.owed(), { label: "Unpaid over 9 months", value: money ? inr(n(money.unpaidOver9Months)) : "—", detail: money ? `${money.unpaidOver9MonthsInvoices} invoice${money.unpaidOver9MonthsInvoices === 1 ? "" : "s"} · export money must come in within 9 months (FEMA)` : shared }, m.margin()],
      notRecorded: ["Invoices carry no currency, port or shipping bill, so export and local sales are not told apart, and amounts in foreign currency are not shown.", "Keep the IEC and LUT in Documents with their expiry dates to be reminded before they lapse."],
    };
    case "manufacturing": return {
      measures: [m.sales(), m.margin(), m.stock(), m.owed()],
      notRecorded: ["Production, raw material used and machine time are not recorded."],
    };
    case "services": return {
      measures: [m.sales(), m.margin(), { label: "Projects", value: item.delivery ? String(item.delivery.activeProjects) : "—", detail: item.delivery ? `${item.delivery.lateProjects} late · ${item.delivery.overdueMilestones} milestones past due` : "No projects" }, { label: "Done, not yet accepted", value: item.delivery ? inr(n(item.delivery.awaitingAcceptanceValue)) : "—", detail: item.delivery ? `${item.delivery.awaitingAcceptance} pieces of work waiting for the client` : "No projects" }],
      notRecorded: ["Hours worked but not yet billed are not counted here."],
    };
    case "warehousing": return {
      measures: [m.sales(), { label: "Collected", value: books ? inr(n(books.current.moneyIn)) : "—", detail: books ? `${inr(n(books.previous.moneyIn))} in the same days before` : shared }, m.owed(), m.cash()],
      notRecorded: ["Space used, free space and each client's contract end date are not recorded."],
    };
    case "holding": return {
      measures: [m.cash(), { label: "Sold to your companies", value: item.intercompany ? inr(n(item.intercompany.sales)) : "—", detail: item.intercompany ? `Bought ${inr(n(item.intercompany.purchases))} from them` : shared }, m.filings(), { label: "Registration gaps", value: String(item.complianceGaps.filter((gap) => gap.kind === "missing").length), detail: "Details missing from its registration" }],
      notRecorded: ["Investments, shares held, property and loans given to your other companies are not recorded."],
    };
    case "not_started": return {
      measures: [m.cash(), m.filings(), { label: "Registration gaps", value: String(item.complianceGaps.filter((gap) => gap.kind === "missing").length), detail: "Details missing from its registration" }],
      notRecorded: ["No sales are expected yet, so none are shown or compared."],
    };
    default: return {
      measures: [m.sales(), m.margin(), m.owed(), m.stock()],
      notRecorded: item.businessModel ? [] : ["Choose what kind of business this is (Edit details), and the measures that fit it will lead here."],
    };
  }
}
