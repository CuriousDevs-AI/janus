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
 * A report is marked live only when the current backend can provide the
 * report's exact metrics without inventing values.
 */
export const reportCatalogue: ReportDefinition[] = [
  { id: "sales-summary", name: "Sales summary", description: "Leads, open deals, won deals and current CRM pipeline.", department: "Sales", requiredWorkspace: "crm-sales", endpoint: "/business/reports/summary", live: true },
  { id: "sales-pipeline", name: "Pipeline", description: "Open pipeline by the current sales record summary.", department: "Sales", requiredWorkspace: "crm-sales", endpoint: "/business/reports/summary", live: true },
  { id: "conversion-funnel", name: "Conversion funnel", description: "Lead-to-deal conversion across a selected period.", department: "Sales", requiredWorkspace: "crm-sales", endpoint: "/business/reports/conversion-funnel", live: false },
  { id: "rep-performance", name: "Rep performance", description: "Sales activity, ownership and outcomes by representative.", department: "Sales", requiredWorkspace: "crm-sales", endpoint: "/business/reports/rep-performance", live: false },
  { id: "lead-sources", name: "Lead sources", description: "Lead volume and conversion by acquisition source.", department: "Sales", requiredWorkspace: "crm-sales", endpoint: "/business/reports/lead-sources", live: false },
  { id: "profit-loss", name: "Profit & Loss", description: "Revenue, expenses and profit from verified finance records.", department: "Finance", requiredWorkspace: "finance-accounting", endpoint: "/business/reports/profit-loss", live: false },
  { id: "cash-flow", name: "Cash flow", description: "Cash in, cash out and closing balance.", department: "Finance", requiredWorkspace: "finance-accounting", endpoint: "/business/reports/cash-flow", live: false },
  { id: "receivables-aging", name: "Receivables aging", description: "Outstanding customer balances by age.", department: "Finance", requiredWorkspace: "finance-accounting", endpoint: "/business/reports/receivables-aging", live: false },
  { id: "expenses", name: "Expenses", description: "Verified business expenses by category and period.", department: "Finance", requiredWorkspace: "finance-accounting", endpoint: "/business/reports/expenses", live: false },
  { id: "gst-summary", name: "GST summary", description: "GST output, input and filing summary.", department: "Finance", requiredWorkspace: "finance-accounting", endpoint: "/business/reports/gst-summary", live: false },
  { id: "headcount", name: "Headcount", description: "Employee count and movement by department.", department: "HR", requiredWorkspace: "hr-people", endpoint: "/business/reports/headcount", live: false },
  { id: "attendance-leave", name: "Attendance & leave", description: "Attendance, leave and absence patterns.", department: "HR", requiredWorkspace: "hr-people", endpoint: "/business/reports/attendance-leave", live: false },
  { id: "payroll-cost", name: "Payroll cost", description: "Payroll cost and changes from verified HR records.", department: "HR", requiredWorkspace: "hr-people", endpoint: "/business/reports/payroll-cost", live: false },
  { id: "tickets-sla", name: "Tickets & SLA", description: "Ticket volume, response time and SLA health.", department: "Support", requiredWorkspace: "customer-support", endpoint: "/business/reports/tickets-sla", live: false },
  { id: "customer-satisfaction", name: "Customer satisfaction", description: "Customer feedback and satisfaction trends.", department: "Support", requiredWorkspace: "customer-support", endpoint: "/business/reports/customer-satisfaction", live: false },
  { id: "stock-levels", name: "Stock levels", description: "Current stock, low stock and inventory movement.", department: "Operations", requiredWorkspace: "operations-inventory", endpoint: "/business/reports/stock-levels", live: false },
  { id: "orders-fulfilment", name: "Orders & fulfilment", description: "Orders, delivery status and fulfilment performance.", department: "Operations", requiredWorkspace: "operations-inventory", endpoint: "/business/reports/orders-fulfilment", live: false },
  { id: "project-status", name: "Project status", description: "Project health, delivery progress and delays.", department: "Projects", requiredWorkspace: "projects-delivery", endpoint: "/business/reports/project-status", live: false },
  { id: "project-profitability", name: "Project profitability", description: "Project margin and delivery cost from verified records.", department: "Projects", requiredWorkspace: "projects-delivery", endpoint: "/business/reports/project-profitability", live: false },
];

export const reportDepartments: ReportDepartment[] = ["Sales", "Finance", "HR", "Support", "Operations", "Projects"];
