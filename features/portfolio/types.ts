/** What the /portfolio API returns. Money is a decimal string in rupees. */

export type BusinessModel = "" | "trading" | "retail" | "import_export" | "manufacturing" | "services" | "warehousing" | "holding" | "not_started";

/** One company in GET /portfolio/summary. Money is a decimal string in rupees. */
export interface PortfolioCompany {
  id: string;
  name: string;
  industry: string;
  companySize: string;
  /** What kind of business it runs; "" until its Owner chooses. Decides which measures lead. */
  businessModel: BusinessModel;
  createdAt: string;
  /** The company this session is in. */
  current: boolean;
  members: number;
  openTickets: number;
  /** quietLeads: open leads with no activity for 3+ days; quietList: the longest-waiting few. Older servers leave them out. */
  crm: { leads: number; openDeals: number; wonDeals: number; lostDeals: number; pipelineValue: string; wonValue: string; quietLeads?: number; quietList?: { id: string; name: string; company: string | null; stage: string; days: number }[] };
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
    /** Invoices unpaid more than nine months after their date: export money must come in by then (FEMA). */
    unpaidOver9Months: string;
    unpaidOver9MonthsInvoices: number;
    /** Whole months since the oldest of them was raised. */
    unpaidOldestMonths?: number;
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
  /** The period's leads by how far each has got, beside the same days before. Older servers leave it out. */
  funnel?: null | { current: FunnelStep; previous: FunnelStep };
  /** Each lead owner in the period; "assigned: false" is the leads nobody owns. Older servers leave it out. */
  reps?: { name: string; assigned: boolean; leads: number; won: number; wonValue: string; openLeads: number }[];
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
  /** Last month's TDS: deducted on bills and salaries against what its TDS payment deposited. Money roles, where TDS applies. */
  tds: { month: string; label: string; onBills: string; onSalaries: string; bySection: Record<string, string>; deducted: string; deposited: string | null; toDeposit: string; dueOn: string; salariesPosted: boolean } | null;
  /** Cash in the bank from imported statements, and how many months it lasts. Money roles only. */
  cash: { total: string | null; asOf: string; accounts: { account: string; balance: string | null; asOf: string }[]; monthlyBurn: string | null; runwayMonths: number | null } | null;
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
  /** What was paid with it, where recorded (a TDS challan), in rupees. */
  amount?: string | null;
}
/** GST for one month from the books, rupees as decimal strings; payable below zero is credit left over. */
export type PortfolioGstMonth = { month: string; label: string; output: string; creditNotes: string; input: string; blocked: string; carriedIn: string; payable: string; billsWithoutGst: number };
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
  /** Invoices raised in the span, not counting opening balances. Null where the role does not include money. */
  invoices: number | null;
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
export type PortfolioRole = "owner" | "group_admin" | "company_admin" | "finance_manager" | "operations_manager" | "group_finance" | "group_analyst";
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
  companies: { id: string; name: string; points: { month: string; leads: number; wonDeals: number; wonValue: string; netSales: string | null; costs: string | null; collected: string | null; imported?: boolean }[] }[];
}

/** A way to answer Portfolio questions: Janus rules, or a model one of the companies set up. */
export type PortfolioModel = { id: string; label: string; provider: string | null; company: string | null; free: boolean; note: string };
export type PortfolioAiKey = { provider: AiProvider; model: string; keyLastFour: string; baseUrl: string | null; enabled: boolean };
export type AiProvider = "openai" | "anthropic" | "gemini" | "openai_compatible" | "openrouter" | "groq" | "cerebras" | "mistral" | "sambanova" | "github" | "nvidia" | "huggingface";
/** A provider that gives a free API key, with some of its free models and where to get a key. */
export type PortfolioFreeProvider = { id: string; name: string; provider: string; baseUrl: string | null; models: string[]; limits: string; keyUrl: string; modelsUrl: string };
export type PortfolioAiCompany = { id: string; name: string; keys: PortfolioAiKey[]; spentUsd: string; capUsd: string };
/** A key the Portfolio keeps for the account, and the companies it was copied into. */
export type PortfolioKey = { provider: AiProvider; model: string; keyLastFour: string; copiedTo: { id: string; name: string }[] };
export type PortfolioModels = { options: PortfolioModel[]; companies: PortfolioAiCompany[]; free: PortfolioFreeProvider[]; portfolioKeys: PortfolioKey[]; canAddKeys: boolean };
/** A figure (F), an approved fact (K) or a document passage (D) an answer cited. */
export type PortfolioSource = { id: string; kind: "figure" | "knowledge" | "document"; company: string; text: string; title: string | null };
export type PortfolioAsked = { id: string; question: string; answer: string; model: string; sources: PortfolioSource[]; grounded: boolean; costUsd: string | null; suggested: string[]; createdAt: string };
export type PortfolioKnowledgeItem = { id: string; companyId: string; company: string; kind: "fact" | "document"; status: "approved" | "suggested"; title: string; body: string; document: string | null; passage: number; createdAt: string };

export type PortfolioDocumentKind = "registration" | "licence" | "insurance" | "trademark" | "contract" | "other";
export type PortfolioDocument = { id: string; kind: PortfolioDocumentKind; name: string; number: string | null; issuedOn: string | null; expiresOn: string | null; notes: string | null; daysLeft: number | null; status: "valid" | "expiring" | "expired" | "no_expiry"; file: { name: string; size: number; contentType: string } | null };
/** An invoice one of your companies raised to another, and the bill recorded for it there. */
export type PortfolioIntercompanyLink = { sellerId: string; seller: string; buyerId: string; buyer: string; invoice: string; invoiceDate: string; amount: string; gst: string; bill: string | null; billProbable: boolean; canRecord: boolean };
/** GET /portfolio/customers: customers kept, new and lost per company, last twelve finished months against the twelve before. */
export type PortfolioRetention = { beforeStart: string; beforeEnd: string; recentStart: string; recentEnd: string; companies: { companyId: string; company: string; before: number; kept: number; new: number; rate: number | null; lostCount: number; lost: { name: string; salesBefore: string; lastBought: string }[]; imported: boolean; similar: { name: string; into: string }[]; merges: { id: string; name: string; into: string }[] }[] };
/** GET /billing: the account's plan, what it uses, the plans offered and its invoices. Money is rupees as decimal strings. */
export type BillingPlanId = "free" | "startup" | "growth" | "enterprise";
export interface BillingPlan { id: BillingPlanId; name: string; tagline: string; price: string | null; companies: number | null; logins: number | null; features: string[] }
export interface BillingInvoice { number: string; plan: string; issuedOn: string; periodStart: string; periodEnd: string; amount: string; gst: string; total: string; status: "paid" | "due"; paidOn: string | null; sample: boolean; cgst?: string | null; sgst?: string | null; igst?: string | null; billTo?: BillingDetails | null; seller?: BillingSeller | null; issuedDetails?: boolean }
/** payments: "razorpay" buys a paid plan through Razorpay; "test" changes it at once with nothing charged (never in production); "off" cannot buy one yet. */
export interface Billing { owner: boolean; plan: BillingPlanId; startedOn: string | null; renewsOn: string | null; usage: { companies: number; logins: number; byCompany: { id: string; name: string; people: number; invited: number }[] }; gstRate: number; plans: BillingPlan[]; invoices: BillingInvoice[]; canChange: boolean; payments: "razorpay" | "test" | "off"; chosen: boolean; refunds: BillingRefund[]; archived: { id: string; name: string }[]; billTo?: BillingDetails | null; seller?: BillingSeller | null }
export interface BillingSeller { legalName: string; gstin: string | null; stateCode: string | null; address: string | null; sac: string }
/** Who Janus bills, as its GST tax invoices name them. */
export interface BillingDetails { legalName: string; gstin: string | null; stateCode: string; address: string | null }
export interface BillingRefund { invoice: string; plan: string; daysUnused: number; daysTotal: number; amount: string; status: "refunded" | "test" | "failed"; createdOn: string }
/** GET /billing/preview: what moving to a plan does, before it is done. */
export interface BillingPreview {
  plan: BillingPlanId; companyLimit: number | null; peopleLimit: number | null;
  companies: { id: string; name: string; current: boolean; keep: boolean }[];
  archiveCompanies: { id: string; name: string }[]; archivePeople: { name: string; company: string }[]; loseAccess?: { name: string; company: string }[]; withdrawInvitations: { name: string; company: string }[];
  restoreCompanies: { id: string; name: string }[]; restorePeople: { name: string; company: string }[];
  refund: { invoice: string; plan: string; daysUsed: number; daysTotal: number; daysUnused: number; amount: string; method: "razorpay" | "test" } | null;
  charge: string | null;
}
/** POST /billing/checkout: what Razorpay Checkout needs. Amount in paise, GST included. */
export interface BillingCheckout { keyId: string; orderId: string; amount: number; currency: "INR"; plan: string; description: string; name: string; email: string }

export type FunnelStep = { leads: number; qualified: number; proposal: number; won: number; lost: number };
