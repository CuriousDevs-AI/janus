import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Inbox,
  Radio,
  UserRoundPlus,
  Handshake,
  Building2,
  LifeBuoy,
  Workflow,
  Database,
  BarChart3,
  Sparkles,
  Bot,
  BrainCircuit,
  FlaskConical,
  Plug,
  ShieldCheck,
  Bell,
  ScrollText,
  Gauge,
  Settings,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const navSections: NavSection[] = [
  {
    title: "Main",
    items: [
      { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
      { label: "Inbox", href: "/inbox", icon: Inbox },
      { label: "Lead Sources", href: "/lead-sources", icon: Radio },
      { label: "Leads", href: "/leads", icon: UserRoundPlus },
      { label: "Deals", href: "/deals", icon: Handshake },
      { label: "Customers", href: "/customers", icon: Building2 },
      { label: "Tickets", href: "/tickets", icon: LifeBuoy },
      { label: "Automations", href: "/automations", icon: Workflow },
      { label: "Knowledge", href: "/knowledge", icon: Database },
      { label: "Analytics", href: "/analytics", icon: BarChart3 },
    ],
  },
  {
    title: "AI",
    items: [
      { label: "AI Assistant", href: "/ai", icon: Sparkles },
      { label: "Agents", href: "/agents", icon: Bot },
      { label: "Memory", href: "/memory", icon: BrainCircuit },
      { label: "Evaluations", href: "/evaluations", icon: FlaskConical },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Integrations", href: "/integrations", icon: Plug },
      { label: "Approvals", href: "/approvals", icon: ShieldCheck },
      { label: "Notifications", href: "/notifications", icon: Bell },
      { label: "Audit Logs", href: "/audit", icon: ScrollText },
      { label: "Usage", href: "/usage", icon: Gauge },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];
