import type { LucideIcon } from "lucide-react";
import {
  KeyRound,
  Calculator,
  CreditCard,
  BarChart3,
  Bell,
  BookOpen,
  CalendarCheck,
  Bot,
  BrainCircuit,
  Building2,
  CalendarClock,
  ClipboardList,
  Database,
  Truck,
  FileText,
  FileCheck2,
  FlaskConical,
  Gauge,
  GitMerge,
  Hash,
  Handshake,
  ListChecks,
  Mail,
  Monitor,
  LayoutDashboard,
  LifeBuoy,
  MessageCircle,
  Package,
  Plug,
  Radio,
  Receipt,
  ScrollText,
  Settings2,
  ShieldCheck,
  Sparkles,
  MessageSquare,
  UserRoundPlus,
  TrendingUp,
  Users,
  WalletCards,
  Workflow,
} from "lucide-react";
import type { WorkspaceId } from "@/lib/workspace-config";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  requiredPermission?: string;
  /** Only in the preview; on real accounts this lives elsewhere (Engage is in Team Chat). */
  demoOnly?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/** CRM navigation stays on the existing routes and is never duplicated. */
export const crmNavSections: NavSection[] = [
  {
    title: "CRM & Sales",
    items: [
      { label: "CRM Overview", href: "/dashboard", icon: LayoutDashboard, requiredPermission: "leads:write" },
      { label: "Chats", href: "/inbox", icon: MessageCircle },
      { label: "Lead Sources", href: "/lead-sources", icon: Radio, requiredPermission: "sources:manage" },
      { label: "Leads", href: "/leads", icon: UserRoundPlus, requiredPermission: "leads:write" },
      { label: "Contacts", href: "/contacts", icon: Users },
      { label: "Deals", href: "/deals", icon: Handshake, requiredPermission: "leads:write" },
      { label: "Customers", href: "/customers", icon: Building2 },
      { label: "Activities", href: "/activities", icon: CalendarCheck },
      { label: "Forecast", href: "/forecast", icon: TrendingUp, requiredPermission: "reports:read" },
      { label: "Products", href: "/products", icon: Package, requiredPermission: "settings:manage" },
      { label: "Templates", href: "/templates", icon: FileText, requiredPermission: "settings:manage" },
      { label: "Web Forms", href: "/web-forms", icon: ClipboardList, requiredPermission: "sources:manage" },
      { label: "Sequences", href: "/sequences", icon: Mail, requiredPermission: "settings:manage" },
      { label: "Quotes", href: "/quotes", icon: FileCheck2, requiredPermission: "leads:write" },
      { label: "Automations", href: "/automations", icon: Workflow, requiredPermission: "automations:manage" },
      { label: "Knowledge", href: "/knowledge", icon: Database, requiredPermission: "agents:manage" },
      { label: "Analytics", href: "/analytics", icon: BarChart3, requiredPermission: "reports:read" },
    ],
  },
  {
    title: "AI",
    items: [
      { label: "AI Assistant", href: "/ai?workspace=crm-sales", icon: Sparkles, requiredPermission: "ai:manage" },
      { label: "Agents", href: "/agents?workspace=crm-sales", icon: Bot, requiredPermission: "ai:manage" },
      { label: "Memory", href: "/memory?workspace=crm-sales", icon: BrainCircuit, requiredPermission: "ai:manage", demoOnly: true },
      { label: "AI Dashboard", href: "/evaluations?workspace=crm-sales", icon: FlaskConical, requiredPermission: "ai:manage" },
    ],
  },
  {
    title: "CRM Management",
    items: [
      { label: "Custom Fields", href: "/custom-fields", icon: ListChecks, requiredPermission: "settings:manage" },
      { label: "Duplicates", href: "/duplicates", icon: GitMerge, requiredPermission: "leads:write" },
      { label: "Integrations", href: "/integrations", icon: Plug, requiredPermission: "settings:manage", demoOnly: true },
      { label: "Approvals", href: "/approvals", icon: ShieldCheck, requiredPermission: "approvals:manage" },
      { label: "Notifications", href: "/notifications", icon: Bell },
      { label: "Audit Logs", href: "/audit", icon: ScrollText, requiredPermission: "settings:manage" },
      { label: "Usage", href: "/usage", icon: Gauge, requiredPermission: "billing:manage" },
    ],
  },
];

export const businessNavSections: NavSection[] = [
  {
    title: "Business",
    items: [
      { label: "Business Overview", href: "/settings?tab=workspace&view=overview", icon: LayoutDashboard, requiredPermission: "settings:manage" },
      { label: "Janus Intelligence", href: "/ai", icon: Sparkles, requiredPermission: "ai:manage" },
    ],
  },
  {
    title: "Management",
    items: [
      { label: "People & Access", href: "/settings?tab=team", icon: Users, requiredPermission: "members:manage" },
      { label: "Workspaces", href: "/settings?tab=workspace&view=workspaces", icon: Building2, requiredPermission: "settings:manage" },
      // Who changed what across the company: the same audit trail CRM & Sales shows.
      { label: "Audit Logs", href: "/audit?workspace=business", icon: ScrollText, requiredPermission: "settings:manage" },
    ],
  },
  {
    title: "Intelligence",
    items: [
      { label: "Business Reports", href: "/analytics", icon: BarChart3, requiredPermission: "settings:manage" },
      { label: "AI Agents", href: "/agents", icon: Bot, requiredPermission: "agents:manage" },
      { label: "AI Dashboard", href: "/evaluations?workspace=business", icon: FlaskConical, requiredPermission: "ai:manage" },
      { label: "AI Usage & Cost", href: "/usage?workspace=business", icon: Gauge, requiredPermission: "ai:manage" },
    ],
  },
  {
    title: "Automation",
    items: [
      { label: "Workflows", href: "/automations?workspace=business", icon: Workflow, requiredPermission: "agents:manage" },
    ],
  },
  // Your own profile, password and notifications are in My account (the menu on your name), the
  // same in every workspace; this menu keeps the company's settings.
  {
    title: "Settings",
    items: [
      { label: "Business Settings", href: "/settings?tab=workspace&view=settings", icon: Settings2, requiredPermission: "settings:manage" },
    ],
  },
];

/** The Owner's view across every company. Each item is one page of /portfolio. */
export const portfolioNavSections: NavSection[] = [
  { title: "Portfolio", items: [
    { label: "Overview", href: "/portfolio?view=overview", icon: LayoutDashboard },
    { label: "Analytics", href: "/portfolio?view=analytics", icon: BarChart3 },
    { label: "Finance", href: "/portfolio?view=finance", icon: WalletCards },
    { label: "Work inbox", href: "/portfolio?view=work", icon: ShieldCheck },
    { label: "Activity", href: "/portfolio?view=activity", icon: ScrollText },
  ] },
  { title: "Manage", items: [
    { label: "Companies", href: "/portfolio?view=companies", icon: Building2 },
    { label: "Janus Intelligence", href: "/portfolio?view=intelligence", icon: Sparkles },
    { label: "AI models & keys", href: "/portfolio?view=ai-keys", icon: KeyRound },
    { label: "Notifications", href: "/portfolio?view=notifications", icon: Bell },
    { label: "Compliance", href: "/portfolio?view=compliance", icon: CalendarCheck },
  ] },
  { title: "AI", items: [
    { label: "AI Assistant", href: "/ai?workspace=portfolio", icon: Sparkles, requiredPermission: "ai:manage" },
    { label: "AI Agents", href: "/agents?workspace=portfolio", icon: Bot, requiredPermission: "ai:manage" },
    { label: "Workflows", href: "/automations?workspace=portfolio", icon: Workflow, requiredPermission: "ai:manage" },
    { label: "AI Dashboard", href: "/evaluations?workspace=portfolio", icon: FlaskConical, requiredPermission: "ai:manage" },
  ] },
  { title: "Access", items: [
    { label: "Portfolio access", href: "/portfolio?view=people", icon: Users },
    { label: "Plan and billing", href: "/portfolio?view=billing", icon: CreditCard },
  ] },
];

const moduleNavSections: Record<Exclude<WorkspaceId, "portfolio" | "business" | "crm-sales">, NavSection[]> = {
  "team-chat": [
    { title: "Team Chat", items: [
      { label: "Chat", href: "/team?workspace=team-chat", icon: Hash },
    ] },
    { title: "AI", items: [
      { label: "AI Assistant", href: "/ai?workspace=team-chat", icon: Sparkles, requiredPermission: "ai:manage" },
      { label: "AI Agents", href: "/agents?workspace=team-chat", icon: Bot, requiredPermission: "ai:manage" },
      { label: "Workflows", href: "/automations?workspace=team-chat", icon: Workflow, requiredPermission: "ai:manage" },
      { label: "AI Dashboard", href: "/evaluations?workspace=team-chat", icon: FlaskConical, requiredPermission: "ai:manage" },
    ] },
  ],
  "hr-people": [
    { title: "My HR", items: [
      { label: "Home", href: "/workspace/hr-people?view=my-home", icon: LayoutDashboard },
      { label: "Engage", href: "/workspace/hr-people?view=engage", icon: Sparkles, demoOnly: true },
      { label: "My profile", href: "/workspace/hr-people?view=my-profile", icon: UserRoundPlus },
      { label: "My onboarding", href: "/workspace/hr-people?view=my-onboarding", icon: UserRoundPlus },
      { label: "Document Center", href: "/workspace/hr-people?view=document-center", icon: FileText },
      { label: "My documents", href: "/workspace/hr-people?view=my-documents", icon: FileText },
      { label: "Ask about policy", href: "/workspace/hr-people?view=policy-qa", icon: Sparkles },
    ] },
    { title: "Salary", items: [
      { label: "Payslips", href: "/workspace/hr-people?view=my-payslips", icon: Receipt },
      { label: "Reimbursements", href: "/workspace/hr-people?view=my-payslips&tab=reimbursements", icon: WalletCards },
      { label: "Tax Declaration", href: "/workspace/hr-people?view=my-payslips&tab=tax", icon: FileText },
      { label: "Loans & Advances", href: "/workspace/hr-people?view=loans", icon: CreditCard },
    ] },
    { title: "Leave", items: [
      { label: "Leave Apply", href: "/workspace/hr-people?view=leave-apply", icon: ClipboardList },
      { label: "Leave Balances", href: "/workspace/hr-people?view=leave-balances", icon: CalendarClock },
      { label: "Leave Calendar", href: "/workspace/hr-people?view=leave-calendar", icon: CalendarClock },
      { label: "Holiday Calendar", href: "/workspace/hr-people?view=holiday-calendar", icon: CalendarClock },
      { label: "My requests", href: "/workspace/hr-people?view=my-requests", icon: ClipboardList },
    ] },
    { title: "Attendance", items: [
      { label: "Attendance Info", href: "/workspace/hr-people?view=attendance-info", icon: CalendarClock },
      { label: "Regularization & Permission", href: "/workspace/hr-people?view=my-regularization", icon: ClipboardList },
    ] },
    { title: "Team", items: [
      { label: "My Team", href: "/workspace/hr-people?view=team", icon: Users, requiredPermission: "hr:team" },
      { label: "Pending Approvals", href: "/workspace/hr-people?view=approvals", icon: ShieldCheck, requiredPermission: "hr:approve" },
      { label: "Leave Management", href: "/workspace/hr-people?view=leave", icon: CalendarClock, requiredPermission: "hr:read" },
      { label: "Attendance", href: "/workspace/hr-people?view=attendance", icon: CalendarClock, requiredPermission: "hr:read" },
      { label: "Promotions & changes", href: "/workspace/hr-people?view=promotions", icon: Users, requiredPermission: "hr:team" },
      { label: "Performance & Reviews", href: "/workspace/hr-people?view=performance", icon: BarChart3, requiredPermission: "hr:read" },
      { label: "Expenses & Reimbursements", href: "/workspace/hr-people?view=expenses", icon: WalletCards, requiredPermission: "hr:read" },
    ] },
    { title: "Company", items: [
      { label: "HR Overview", href: "/workspace/hr-people", icon: LayoutDashboard, requiredPermission: "hr:read" },
      { label: "Employees", href: "/workspace/hr-people?view=employees", icon: Users, requiredPermission: "hr:read" },
      { label: "Recruitment", href: "/workspace/hr-people?view=recruitment", icon: UserRoundPlus, requiredPermission: "hr:manage" },
      { label: "Onboarding", href: "/workspace/hr-people?view=onboarding", icon: UserRoundPlus, requiredPermission: "hr:manage" },
      { label: "Offboarding", href: "/workspace/hr-people?view=offboarding", icon: ClipboardList, requiredPermission: "hr:manage" },
      { label: "Documents", href: "/workspace/hr-people?view=documents", icon: FileText, requiredPermission: "hr:read" },
      { label: "Signature & Audit", href: "/workspace/hr-people?view=signatures", icon: FileCheck2, requiredPermission: "hr:manage" },
      { label: "Payroll", href: "/workspace/hr-people?view=payroll", icon: Receipt, requiredPermission: "hr:payroll:read" },
      { label: "CTC & Salary Structure", href: "/workspace/hr-people?view=ctc", icon: Calculator, requiredPermission: "hr:payroll:read" },
      { label: "Shifts & Roster", href: "/workspace/hr-people?view=shifts", icon: CalendarClock, requiredPermission: "hr:read" },
      { label: "Training", href: "/workspace/hr-people?view=training", icon: BookOpen, requiredPermission: "hr:read" },
      { label: "My Assets & Requests", href: "/workspace/hr-people?view=assets", icon: Monitor, requiredPermission: "hr:read" },
      { label: "Loans & Advances", href: "/workspace/hr-people?view=loans", icon: CreditCard, requiredPermission: "hr:read" },
      { label: "HR Reports", href: "/workspace/hr-people?view=reports", icon: FileText, requiredPermission: "hr:read" },
      { label: "HR Compliance", href: "/workspace/hr-people?view=compliance", icon: ShieldCheck, requiredPermission: "hr:read" },
      { label: "PF, ESI & Challans", href: "/workspace/hr-people?view=statutory", icon: FileCheck2, requiredPermission: "hr:payroll:read" },
    ] },
    { title: "AI", items: [
      { label: "AI Assistant", href: "/ai?workspace=hr-people", icon: Sparkles, requiredPermission: "ai:manage" },
      { label: "AI Agents", href: "/agents?workspace=hr-people", icon: Bot, requiredPermission: "ai:manage" },
      { label: "Workflows", href: "/automations?workspace=hr-people", icon: Workflow, requiredPermission: "ai:manage" },
      { label: "AI Dashboard", href: "/evaluations?workspace=hr-people", icon: FlaskConical, requiredPermission: "ai:manage" },
    ] },
    { title: "Admin", items: [
      { label: "Departments & roles", href: "/workspace/hr-people?view=organization", icon: Users, requiredPermission: "hr:manage" },
      { label: "HR Settings", href: "/workspace/hr-people?view=settings", icon: Settings2, requiredPermission: "hr:manage" },
    ] },
  ],
  "finance-accounting": [
    { title: "Overview", items: [
      { label: "Finance Overview", href: "/workspace/finance-accounting", icon: LayoutDashboard },
      { label: "Financial Ratios", href: "/workspace/finance-accounting?view=ratios", icon: TrendingUp },
      { label: "Day Book", href: "/workspace/finance-accounting?view=day-book", icon: BookOpen },
    ] },
    { title: "Masters", items: [
      { label: "Chart of Accounts", href: "/workspace/finance-accounting?view=chart-of-accounts", icon: BookOpen },
      { label: "Cost Centers", href: "/workspace/finance-accounting?view=cost-centers", icon: Building2 },
      { label: "Vendor Master", href: "/workspace/finance-accounting?view=vendor-master", icon: Users },
      { label: "Customer Master", href: "/workspace/finance-accounting?view=customer-master", icon: Users },
      { label: "Multi-Currency", href: "/workspace/finance-accounting?view=multi-currency", icon: CreditCard },
    ] },
    { title: "Sales & Receivables", items: [
      { label: "Income & Revenue", href: "/workspace/finance-accounting?view=income", icon: BarChart3 },
      { label: "Quotations", href: "/workspace/finance-accounting?view=quotations", icon: FileText },
      { label: "Invoices", href: "/workspace/finance-accounting?view=invoices", icon: Receipt },
      { label: "Recurring Invoices", href: "/workspace/finance-accounting?view=recurring-invoices", icon: CalendarClock },
      { label: "Credit Notes", href: "/workspace/finance-accounting?view=credit-notes", icon: Receipt },
      { label: "Debit Notes", href: "/workspace/finance-accounting?view=debit-notes", icon: FileText },
      { label: "Payments & Receivables", href: "/workspace/finance-accounting?view=receivables", icon: Handshake },
      { label: "Payment Reminders", href: "/workspace/finance-accounting?view=payment-reminders", icon: Bell },
      { label: "Receipt Vouchers", href: "/workspace/finance-accounting?view=receipt-vouchers", icon: Receipt },
    ] },
    { title: "Purchases & Payables", items: [
      { label: "Purchase Orders", href: "/workspace/finance-accounting?view=purchase-orders", icon: ClipboardList },
      { label: "Bills & Payables", href: "/workspace/finance-accounting?view=payables", icon: FileText },
      { label: "Expenses & Petty Cash", href: "/workspace/finance-accounting?view=expenses", icon: WalletCards },
      { label: "Payment Vouchers", href: "/workspace/finance-accounting?view=payment-vouchers", icon: FileText },
      { label: "Advance Payments", href: "/workspace/finance-accounting?view=advance-payments", icon: CreditCard },
    ] },
    { title: "Banking & Cash", items: [
      { label: "Cash & Bank Book", href: "/workspace/finance-accounting?view=cash-bank-book", icon: BookOpen },
      { label: "Cash Flow", href: "/workspace/finance-accounting?view=cash-flow", icon: BarChart3 },
      { label: "Bank Reconciliation", href: "/workspace/finance-accounting?view=reconciliation", icon: Handshake },
      { label: "Contra Entries", href: "/workspace/finance-accounting?view=contra-entries", icon: Handshake },
      { label: "Fund Requests", href: "/workspace/finance-accounting?view=funds", icon: Gauge },
    ] },
    { title: "Accounting", items: [
      { label: "Journal Entries", href: "/workspace/finance-accounting?view=journal-entries", icon: BookOpen },
      { label: "Party Ledger", href: "/workspace/finance-accounting?view=party-ledger", icon: ScrollText },
      { label: "Trial Balance", href: "/workspace/finance-accounting?view=trial-balance", icon: Calculator },
      { label: "Profit & Loss", href: "/workspace/finance-accounting?view=profit-loss", icon: FileText },
      { label: "Balance Sheet", href: "/workspace/finance-accounting?view=balance-sheet", icon: FileText },
      { label: "Fixed Assets", href: "/workspace/finance-accounting?view=fixed-assets", icon: Database },
    ] },
    { title: "Tax & Compliance", items: [
      { label: "GST Returns", href: "/workspace/finance-accounting?view=gst", icon: FileText },
      { label: "TDS Compliance", href: "/workspace/finance-accounting?view=tds", icon: ShieldCheck },
      { label: "E-Invoicing", href: "/workspace/finance-accounting?view=e-invoicing", icon: FileCheck2 },
    ] },
    { title: "Budgets & Planning", items: [
      { label: "Budgets", href: "/workspace/finance-accounting?view=budgets", icon: Gauge },
      { label: "Payroll & HR Costs", href: "/workspace/finance-accounting?view=hr-costs", icon: Users },
    ] },
    { title: "Controls", items: [
      { label: "Approvals Queue", href: "/workspace/finance-accounting?view=approvals", icon: ShieldCheck },
      { label: "Month-End Close", href: "/workspace/finance-accounting?view=month-end", icon: ShieldCheck },
      { label: "Period Locks", href: "/workspace/finance-accounting?view=periods", icon: ShieldCheck },
      { label: "FY Closing", href: "/workspace/finance-accounting?view=fy-closing", icon: ShieldCheck },
      { label: "Audit Trail Export", href: "/workspace/finance-accounting?view=audit-export", icon: FileCheck2 },
    ] },
    { title: "AI", items: [
      { label: "AI Assistant", href: "/ai?workspace=finance-accounting", icon: Sparkles, requiredPermission: "ai:manage" },
      { label: "AI Agents", href: "/agents?workspace=finance-accounting", icon: Bot, requiredPermission: "ai:manage" },
      { label: "Workflows", href: "/automations?workspace=finance-accounting", icon: Workflow, requiredPermission: "ai:manage" },
      { label: "AI Dashboard", href: "/evaluations?workspace=finance-accounting", icon: FlaskConical, requiredPermission: "ai:manage" },
    ] },
  ],
  "projects-delivery": [
    { title: "Projects & Delivery", items: [
      { label: "Projects Overview", href: "/workspace/projects-delivery", icon: LayoutDashboard },
      { label: "All Projects", href: "/workspace/projects-delivery?view=projects", icon: ClipboardList },
      { label: "Tasks & Work Items", href: "/workspace/projects-delivery?view=tasks", icon: FileText },
      { label: "Milestones & Deliverables", href: "/workspace/projects-delivery?view=milestones", icon: CalendarClock },
      { label: "Change Requests", href: "/workspace/projects-delivery?view=changes", icon: Workflow },
      { label: "Resource Allocation", href: "/workspace/projects-delivery?view=resources", icon: Users },
      { label: "Timesheets", href: "/workspace/projects-delivery?view=timesheets", icon: CalendarClock },
      { label: "Project Calendar", href: "/workspace/projects-delivery?view=calendar", icon: CalendarClock },
      { label: "Client Delivery", href: "/workspace/projects-delivery?view=client-delivery", icon: Handshake },
      { label: "Project Timeline", href: "/workspace/projects-delivery?view=timeline", icon: MessageSquare },
      { label: "Project Reports", href: "/workspace/projects-delivery?view=reports", icon: BarChart3 },
      { label: "Project Settings", href: "/settings?tab=workspace", icon: Settings2, requiredPermission: "settings:manage" },
    ] },
    { title: "AI", items: [
      { label: "AI Assistant", href: "/ai?workspace=projects-delivery", icon: Sparkles, requiredPermission: "ai:manage" },
      { label: "AI Agents", href: "/agents?workspace=projects-delivery", icon: Bot, requiredPermission: "ai:manage" },
      { label: "Workflows", href: "/automations?workspace=projects-delivery", icon: Workflow, requiredPermission: "ai:manage" },
      { label: "AI Dashboard", href: "/evaluations?workspace=projects-delivery", icon: FlaskConical, requiredPermission: "ai:manage" },
    ] },
  ],
  "customer-support": [
    { title: "Customer Support & Success", items: [
      { label: "Support Overview", href: "/workspace/customer-support", icon: LayoutDashboard },
      { label: "Tickets", href: "/workspace/customer-support?view=tickets", icon: LifeBuoy },
      { label: "Customer Directory", href: "/customers?workspace=customer-support", icon: Building2 },
      { label: "Queues & Assignments", href: "/workspace/customer-support?view=queues", icon: Users },
      { label: "SLA Management", href: "/workspace/customer-support?view=sla", icon: Gauge },
      { label: "Knowledge Base", href: "/knowledge?workspace=customer-support", icon: Database },
      { label: "Customer Feedback", href: "/workspace/customer-support?view=feedback", icon: MessageCircle },
      { label: "Renewals & Success", href: "/workspace/customer-support?view=renewals", icon: Handshake },
      { label: "Support Reports", href: "/workspace/customer-support?view=reports", icon: BarChart3 },
      { label: "Support Settings", href: "/settings?tab=notifications", icon: Settings2, requiredPermission: "settings:manage" },
    ] },
    { title: "AI", items: [
      { label: "AI Assistant", href: "/ai?workspace=customer-support", icon: Sparkles, requiredPermission: "ai:manage" },
      { label: "AI Agents", href: "/agents?workspace=customer-support", icon: Bot, requiredPermission: "ai:manage" },
      { label: "Workflows", href: "/automations?workspace=customer-support", icon: Workflow, requiredPermission: "ai:manage" },
      { label: "AI Dashboard", href: "/evaluations?workspace=customer-support", icon: FlaskConical, requiredPermission: "ai:manage" },
    ] },
  ],
  "operations-inventory": [
    { title: "Operations & Inventory", items: [
      { label: "Operations Overview", href: "/workspace/operations-inventory", icon: LayoutDashboard },
      { label: "Inventory", href: "/workspace/operations-inventory?view=inventory", icon: Package },
      { label: "Products & Stock", href: "/workspace/operations-inventory?view=products", icon: Package },
      { label: "Warehouses & Locations", href: "/workspace/operations-inventory?view=warehouses", icon: Building2 },
      { label: "Physical Count", href: "/workspace/operations-inventory?view=counts", icon: Database },
      { label: "Transit Transfers", href: "/workspace/operations-inventory?view=transfers", icon: Truck },
      { label: "Workflows", href: "/workspace/operations-inventory?view=workflows", icon: ShieldCheck },
      { label: "Procurement", href: "/workspace/operations-inventory?view=procurement", icon: FileText },
      { label: "Purchase Orders", href: "/workspace/operations-inventory?view=purchase-orders", icon: Receipt },
      { label: "Vendors", href: "/workspace/operations-inventory?view=vendors", icon: Users },
      { label: "Orders & Fulfillment", href: "/workspace/operations-inventory?view=orders", icon: Handshake },
      { label: "Operations Reports", href: "/workspace/operations-inventory?view=reports", icon: BarChart3 },
      { label: "Operations Settings", href: "/settings?tab=automation", icon: Settings2, requiredPermission: "settings:manage" },
    ] },
    { title: "AI", items: [
      { label: "AI Assistant", href: "/ai?workspace=operations-inventory", icon: Sparkles, requiredPermission: "ai:manage" },
      { label: "AI Agents", href: "/agents?workspace=operations-inventory", icon: Bot, requiredPermission: "ai:manage" },
      { label: "Workflows", href: "/automations?workspace=operations-inventory", icon: Workflow, requiredPermission: "ai:manage" },
      { label: "AI Dashboard", href: "/evaluations?workspace=operations-inventory", icon: FlaskConical, requiredPermission: "ai:manage" },
    ] },
  ],
  "it-infrastructure": [
    { title: "IT & Infrastructure", items: [
      { label: "IT Overview", href: "/workspace/it-infrastructure", icon: LayoutDashboard },
      { label: "IT Assets", href: "/workspace/it-infrastructure?view=assets", icon: Database },
      { label: "IT Helpdesk", href: "/workspace/it-infrastructure?view=helpdesk", icon: LifeBuoy },
      { label: "Access Management", href: "/workspace/it-infrastructure?view=access", icon: ShieldCheck },
      { label: "Software & Licenses", href: "/workspace/it-infrastructure?view=licenses", icon: Plug },
      { label: "Infrastructure Monitoring", href: "/workspace/it-infrastructure?view=monitoring", icon: Gauge },
      { label: "Incidents", href: "/workspace/it-infrastructure?view=incidents", icon: LifeBuoy },
      { label: "Change Management", href: "/workspace/it-infrastructure?view=changes", icon: Workflow },
      { label: "Security & Compliance", href: "/settings?tab=security", icon: ShieldCheck, requiredPermission: "settings:manage" },
      { label: "IT Reports", href: "/workspace/it-infrastructure?view=reports", icon: BarChart3 },
      { label: "IT Settings", href: "/settings?tab=security", icon: Settings2, requiredPermission: "settings:manage" },
    ] },
    { title: "AI", items: [
      { label: "AI Assistant", href: "/ai?workspace=it-infrastructure", icon: Sparkles, requiredPermission: "ai:manage" },
      { label: "AI Agents", href: "/agents?workspace=it-infrastructure", icon: Bot, requiredPermission: "ai:manage" },
      { label: "Workflows", href: "/automations?workspace=it-infrastructure", icon: Workflow, requiredPermission: "ai:manage" },
      { label: "AI Dashboard", href: "/evaluations?workspace=it-infrastructure", icon: FlaskConical, requiredPermission: "ai:manage" },
    ] },
  ],
};

export function getNavSectionsForWorkspace(workspaceId: WorkspaceId): NavSection[] {
  if (workspaceId === "crm-sales") return crmNavSections;
  if (workspaceId === "business") return businessNavSections;
  if (workspaceId === "portfolio") return portfolioNavSections;
  return moduleNavSections[workspaceId];
}

export function appendWorkspace(href: string, workspaceId: WorkspaceId) {
  if (/[?&]workspace=/.test(href)) return href;
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}workspace=${workspaceId}`;
}

export const CRM_ROUTE_PREFIXES = crmNavSections[0].items.map((item) => item.href);

export function isCrmRoute(pathname: string) {
  return CRM_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Kept for existing consumers; new consumers should select by workspace. */
export const navSections = crmNavSections;
