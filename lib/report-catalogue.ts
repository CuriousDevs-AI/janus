export type ReportDepartment = "Sales" | "Finance" | "HR" | "Support" | "Operations" | "Projects";

export interface ReportDefinition {
  id: string;
  name: string;
  description: string;
  department: ReportDepartment;
  requiredWorkspace: string;
  endpoint: string;
  live: boolean;
}

/**
 * One source of truth for the ready-made Business Reports library.
 * `live` here is the default; Business Reports marks a report live once the company's own
 * records can fill it (GET /business/reports/figures), and never shows invented values.
 */
export const reportCatalogue: ReportDefinition[] = [
  { id: "sales-summary", name: "Sales summary", description: "Leads in, deals won and sales, against the same days before.", department: "Sales", requiredWorkspace: "crm-sales", endpoint: "/business/reports/summary", live: true },
  { id: "sales-pipeline", name: "Pipeline", description: "Open deals and pipeline value, with deals won and lost to date.", department: "Sales", requiredWorkspace: "crm-sales", endpoint: "/business/reports/summary", live: true },
  { id: "conversion-funnel", name: "Conversion funnel", description: "Lead-to-deal conversion across a selected period.", department: "Sales", requiredWorkspace: "crm-sales", endpoint: "/business/reports/conversion-funnel", live: false },
  { id: "rep-performance", name: "Rep performance", description: "Sales activity, ownership and outcomes by representative.", department: "Sales", requiredWorkspace: "crm-sales", endpoint: "/business/reports/rep-performance", live: false },
  { id: "lead-sources", name: "Lead sources", description: "Leads by channel, against the same days before.", department: "Sales", requiredWorkspace: "crm-sales", endpoint: "/business/reports/lead-sources", live: false },
  { id: "profit-loss", name: "Profit & Loss", description: "Sales, supplier bills and profit, against the same days before.", department: "Finance", requiredWorkspace: "finance-accounting", endpoint: "/business/reports/profit-loss", live: false },
  { id: "cash-flow", name: "Cash flow", description: "Money in and out this period, and cash in the bank.", department: "Finance", requiredWorkspace: "finance-accounting", endpoint: "/business/reports/cash-flow", live: false },
  { id: "receivables-aging", name: "Receivables aging", description: "What customers owe, and how late the overdue part is.", department: "Finance", requiredWorkspace: "finance-accounting", endpoint: "/business/reports/receivables-aging", live: false },
  { id: "expenses", name: "Expenses", description: "Supplier bills this period, and what you owe suppliers.", department: "Finance", requiredWorkspace: "finance-accounting", endpoint: "/business/reports/expenses", live: false },
  { id: "gst-summary", name: "GST summary", description: "GST on sales, input credit and GST to pay this month.", department: "Finance", requiredWorkspace: "finance-accounting", endpoint: "/business/reports/gst-summary", live: false },
  { id: "headcount", name: "Headcount", description: "People on the team, and who is on leave today.", department: "HR", requiredWorkspace: "hr-people", endpoint: "/business/reports/headcount", live: false },
  { id: "attendance-leave", name: "Attendance & leave", description: "Who is on leave today, and leave and claims waiting.", department: "HR", requiredWorkspace: "hr-people", endpoint: "/business/reports/attendance-leave", live: false },
  { id: "payroll-cost", name: "Payroll cost", description: "Monthly pay, and whether last month's salaries are in the books.", department: "HR", requiredWorkspace: "hr-people", endpoint: "/business/reports/payroll-cost", live: false },
  { id: "tickets-sla", name: "Tickets & SLA", description: "Open, urgent, escalated and week-old tickets.", department: "Support", requiredWorkspace: "customer-support", endpoint: "/business/reports/tickets-sla", live: false },
  { id: "customer-satisfaction", name: "Customer satisfaction", description: "Customer feedback and satisfaction trends.", department: "Support", requiredWorkspace: "customer-support", endpoint: "/business/reports/customer-satisfaction", live: false },
  { id: "stock-levels", name: "Stock levels", description: "Items, low stock, expiring batches and dispatches on the way.", department: "Operations", requiredWorkspace: "operations-inventory", endpoint: "/business/reports/stock-levels", live: false },
  { id: "orders-fulfilment", name: "Orders & fulfilment", description: "Orders, delivery status and fulfilment performance.", department: "Operations", requiredWorkspace: "operations-inventory", endpoint: "/business/reports/orders-fulfilment", live: false },
  { id: "project-status", name: "Project status", description: "Active and late projects, and overdue milestones and tasks.", department: "Projects", requiredWorkspace: "projects-delivery", endpoint: "/business/reports/project-status", live: false },
  { id: "project-profitability", name: "Project profitability", description: "Project margin and delivery cost from verified records.", department: "Projects", requiredWorkspace: "projects-delivery", endpoint: "/business/reports/project-profitability", live: false },
];

export const reportDepartments: ReportDepartment[] = ["Sales", "Finance", "HR", "Support", "Operations", "Projects"];
