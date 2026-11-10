/** What the /portfolio API returns. Money is a decimal string in rupees. */

/** One company in GET /portfolio/summary. Money is a decimal string in rupees. */
export interface PortfolioCompany {
  id: string;
  name: string;
  industry: string;
  companySize: string;
  createdAt: string;
  /** The company this session is in. */
  current: boolean;
  members: number;
  openTickets: number;
  crm: { leads: number; openDeals: number; wonDeals: number; lostDeals: number; pipelineValue: string; wonValue: string };
  /** From the company's invoices, payments, approved credit notes and bills. Null where the person's role there does not include money (Group analyst). */
  money: null | {
    receivable: string;
    overdue: string;
    overdueInvoices: number;
    /** Overdue amounts by days past the due date. */
    ageing: { days0to30: string; days31to60: string; over60: string };
    payable: string;
    /** Bills past their due date. payableDueThisWeek includes them. */
    payableLate: string;
    /** Bills due within seven days, including those already late. */
    payableDueThisWeek: string;
  };
  /** What happened in the chosen period to date, and in the same days of the period before. */
  period: { current: PortfolioPeriodFigures; previous: PortfolioPeriodFigures };
  /** The operating view, from each company's own records. Money fields are null where the role does not include money. */
  people: { headcount: number; onLeaveToday: number; pendingLeave: number; pendingClaims: number; monthlyPayroll: string | null; claimsValue: string | null } | null;
  stock: { items: number; belowReorder: number; expiringBatches: number; dispatchesInTransit: number; stockValue: string | null } | null;
  delivery: { activeProjects: number; lateProjects: number; overdueMilestones: number; overdueTasks: number; awaitingAcceptance: number; awaitingAcceptanceValue: string } | null;
  support: { open: number; urgent: number; escalated: number; olderThanWeek: number } | null;
  /** Decisions waiting in the company, by kind, with the screen where each is made. */
  approvals: { kind: string; label: string; one: string; count: number; to: string }[];
  compliance: PortfolioComplianceDue[];
  compliancePlan: PortfolioCompliancePlan | null;
  /** Monthly targets, as decimal strings; null where none is set (collected is null without money). */
  targets: { leads: string | null; wonValue: string | null; collected: string | null } | null;
  /** What needs attention, most urgent first; each line opens the screen where it is dealt with. */
  attention: { severity: "high" | "medium" | "low"; text: string; to: string }[];
  health: { status: "red" | "amber" | "green"; reasons: string[] } | null;
  /** From the books, this period and the same days before. Null where the role does not include money. */
  books: { current: PortfolioBooks; previous: PortfolioBooks } | null;
  /** The customers whose sales moved most, before GST, in rupees. Empty without money. */
  customers: { name: string; current: string; previous: string }[];
  /** Sales to, and bills from, the other companies shown, matched by name. Null without money. */
  intercompany: { sales: string; purchases: string; salesBefore: string; purchasesBefore: string; partners: string[] } | null;
  /** Leads by channel, this period and the same days before. */
  leadSources: { source: string; current: number; previous: number }[];
  /** Registration details, or null where none are recorded. */
  registration: PortfolioRegistration | null;
  /** Missing registration details, and filings the company's own records suggest. */
  complianceGaps: { kind: "missing" | "suggestion"; text: string; switch?: "tds" | "pfEsi" | "company" | null }[];
  /** False until at least one kind of filing is switched on for the company. */
  complianceSetUp: boolean;
  /** Every filing past due and not recorded since unfiledSince (1 April of last financial year). */
  unfiledCount: number;
  unfiledSince: string | null;
  /** GST from the books, for a role with money where GST is set up. */
  gst: { gstin: string | null; lastMonth: PortfolioGstMonth; thisMonth: PortfolioGstMonth } | null;
  /** Last month's salaries: posted to the books or not, and what HR's salaries would post. Money roles only. */
  payroll: { month: string; label: string; posted: string | null; fromHr: string } | null;
  /** Registrations, licences, insurance and trademarks, soonest expiry first. */
  documents: PortfolioDocument[];
}
export type EntityType = "pvt_ltd" | "public_ltd" | "opc" | "llp" | "partnership" | "proprietorship" | "other";
export interface PortfolioRegistration {
  entityType: EntityType | null;
  legalName: string | null;
  cin: string | null;
  pan: string | null;
  tan: string | null;
  epfCode: string | null;
  esiCode: string | null;
  ptState: string | null;
  udyam: string | null;
  incorporatedOn: string | null;
  registeredAddress: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  /** The company's people, each a director, founder or co-founder, or more than one. */
  directors: PortfolioPersonRecord[];
}
export type LeaderRole = "director" | "founder" | "cofounder";
export interface PortfolioPersonRecord { name: string; din: string | null; roles: LeaderRole[]; title: string | null }
/** Rupees: sales before GST less credit notes, supplier bills before their recorded GST plus write-offs, money in and out. */
/** The money fields of the books, as decimal strings. */
export type PortfolioBooksAmount = "netSales" | "costs" | "profitBeforePayroll" | "moneyIn" | "moneyOut" | "salariesPosted";
export interface PortfolioBooks {
  netSales: string;
  costs: string;
  profitBeforePayroll: string;
  moneyIn: string;
  moneyOut: string;
  /** Salaries posted to the books for months in the span; complete when every month is posted. */
  salariesPosted: string;
  salariesMonths: string[];
  salariesComplete: boolean;
}
export interface PortfolioComplianceDue {
  /** The filing's code and period, e.g. gstr3b_2026-10, used to mark it filed. */
  key: string;
  label: string;
  period: string;
  area: string;
  dueOn: string;
  status: "filed" | "overdue" | "due_soon" | "upcoming";
  filedOn: string | null;
  to: string;
  /** The portal's acknowledgement number, when it was recorded. */
  acknowledgement: string | null;
  /** Past due: the late fee to date in rupees where it is a daily or flat fee (an estimate), and what the cost is made of. */
  lateFee: string | null;
  lateNote: string | null;
}
/** GST for one month from the books, rupees as decimal strings; payable below zero is credit left over. */
export type PortfolioGstMonth = { month: string; label: string; output: string; input: string; payable: string; billsWithoutGst: number };
/** One line of the filing register (GET /portfolio/compliance/register). */
export type PortfolioRegisterRow = PortfolioComplianceDue & { companyId: string; company: string };
export interface PortfolioCompliancePlan {
  gstin: string | null;
  gstFiling: "none" | "monthly" | "quarterly";
  tds: boolean;
  pfEsi: boolean;
  company: boolean;
}
/** Leads in, deals won and money in a span of days. Money is null where the role does not include it. */
export interface PortfolioPeriodFigures {
  leads: number;
  wonDeals: number;
  wonValue: string;
  invoiced: string | null;
  collected: string | null;
}
export type PortfolioPeriodKey = "month" | "quarter" | "fy";
/** Days are inclusive, in India time. Quarters and years follow the financial year from 1 April. */
export interface PortfolioPeriod {
  key: PortfolioPeriodKey;
  label: string;
  start: string;
  end: string;
  previousStart: string;
  previousEnd: string;
}
export interface PortfolioSummary {
  period: PortfolioPeriod;
  companies: PortfolioCompany[];
}
/** The weekly Portfolio email for the signed-in person (GET/PUT /portfolio/digest). */
export interface PortfolioDigest {
  enabled: boolean;
  /** Whether the person sees any Portfolio, so a digest would have something to say. */
  eligible: boolean;
  nextDueAt: string | null;
  lastSentAt: string | null;
}
/** Roles an Owner shares the Portfolio with: a co-owner, or one of the two group roles. */
export type PortfolioRole = "owner" | "group_finance" | "group_analyst";
/** One person in GET /portfolio/access, with each company they hold or are invited to. */
export interface PortfolioPerson {
  email: string;
  name: string | null;
  companies: { id: string; name: string; role: PortfolioRole; status: "active" | "invited" }[];
}
/** What POST /portfolio/access and /portfolio/access/remove did, company by company. */
export interface PortfolioAccessResult {
  done: string[];
  skipped: { company: string; reason: string }[];
}
/** GET /portfolio/activity: what happened across the companies, newest first. Money events carry
 * their document and amount for a role with money; several close together come as one line. */
export interface PortfolioActivity {
  days: number;
  items: { companyId: string; company: string; at: string; area: string; who: string; text: string; detail: string | null; amount: string | null; count: number; flag: "change" | "reversal" | null }[];
}
/** GET /portfolio/trends: day, week or month per company, oldest first. Money is null without money. */
export interface PortfolioTrends {
  unit: "day" | "week" | "month";
  /** The start of each day or week (YYYY-MM-DD), or month (YYYY-MM), oldest first. */
  months: string[];
  labels: string[];
  companies: { id: string; name: string; points: { month: string; leads: number; wonDeals: number; wonValue: string; netSales: string | null; costs: string | null; collected: string | null }[] }[];
}

/** A way to answer Portfolio questions: Janus rules, or a model one of the companies set up. */
export type PortfolioModel = { id: string; label: string; provider: string | null; company: string | null; free: boolean; note: string };
export type PortfolioAiKey = { provider: AiProvider; model: string; keyLastFour: string; baseUrl: string | null; enabled: boolean };
export type AiProvider = "openai" | "anthropic" | "gemini" | "openai_compatible";
export type PortfolioAiCompany = { id: string; name: string; keys: PortfolioAiKey[]; spentUsd: string; capUsd: string };
export type PortfolioModels = { options: PortfolioModel[]; companies: PortfolioAiCompany[] };
/** A figure (F), an approved fact (K) or a document passage (D) an answer cited. */
export type PortfolioSource = { id: string; kind: "figure" | "knowledge" | "document"; company: string; text: string; title: string | null };
export type PortfolioAsked = { id: string; question: string; answer: string; model: string; sources: PortfolioSource[]; grounded: boolean; costUsd: string | null; suggested: string[]; createdAt: string };
export type PortfolioKnowledgeItem = { id: string; companyId: string; company: string; kind: "fact" | "document"; status: "approved" | "suggested"; title: string; body: string; document: string | null; passage: number; createdAt: string };

export type PortfolioDocumentKind = "registration" | "licence" | "insurance" | "trademark" | "contract" | "other";
export type PortfolioDocument = { id: string; kind: PortfolioDocumentKind; name: string; number: string | null; issuedOn: string | null; expiresOn: string | null; notes: string | null; daysLeft: number | null; status: "valid" | "expiring" | "expired" | "no_expiry" };
/** An invoice one of your companies raised to another, and the bill recorded for it there. */
export type PortfolioIntercompanyLink = { sellerId: string; seller: string; buyerId: string; buyer: string; invoice: string; invoiceDate: string; amount: string; gst: string; bill: string | null; canRecord: boolean };
