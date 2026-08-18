import type { ComponentType } from "react";
import {
  Globe,
  Mail,
  MessageCircle,
  Phone,
  CalendarClock,
  StickyNote,
  Share2,
  Camera,
  Megaphone,
  Search,
  Briefcase,
  Users,
  Webhook,
  Code2,
  FileSpreadsheet,
} from "lucide-react";
import type {
  LeadStage,
  DealStage,
  TicketStatus,
  TicketPriority,
  ApprovalRisk,
  ChannelType,
  LeadSource,
  HealthCategory,
  AutomationTriggerKind,
} from "@/lib/types";
import type { badgeVariants } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";

type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

export const leadStageMeta: Record<LeadStage, { label: string; tone: BadgeTone }> = {
  new: { label: "New", tone: "neutral" },
  contacted: { label: "Contacted", tone: "info" },
  qualified: { label: "Qualified", tone: "accent" },
  demo: { label: "Demo", tone: "accent" },
  proposal: { label: "Proposal", tone: "warning" },
  negotiation: { label: "Negotiation", tone: "warning" },
  approval: { label: "Approval", tone: "warning" },
  won: { label: "Won", tone: "success" },
  lost: { label: "Lost", tone: "danger" },
};

export const dealStageMeta: Record<DealStage, { label: string; tone: BadgeTone }> = {
  new: { label: "New", tone: "neutral" },
  qualified: { label: "Qualified", tone: "accent" },
  demo: { label: "Demo", tone: "accent" },
  proposal: { label: "Proposal", tone: "warning" },
  negotiation: { label: "Negotiation", tone: "warning" },
  approval: { label: "Approval", tone: "warning" },
  won: { label: "Won", tone: "success" },
  lost: { label: "Lost", tone: "danger" },
};

export const dealStageOrder: DealStage[] = ["new", "qualified", "demo", "proposal", "negotiation", "approval", "won", "lost"];

export const ticketStatusMeta: Record<TicketStatus, { label: string; tone: BadgeTone }> = {
  open: { label: "Open", tone: "neutral" },
  ai_handling: { label: "AI Handling", tone: "accent" },
  waiting_customer: { label: "Waiting", tone: "info" },
  escalated: { label: "Escalated", tone: "danger" },
  in_progress: { label: "In Progress", tone: "warning" },
  resolved: { label: "Resolved", tone: "success" },
  closed: { label: "Closed", tone: "neutral" },
};

export const ticketPriorityMeta: Record<TicketPriority, { label: string; tone: BadgeTone }> = {
  low: { label: "Low", tone: "neutral" },
  medium: { label: "Medium", tone: "info" },
  high: { label: "High", tone: "warning" },
  urgent: { label: "Urgent", tone: "danger" },
};

export const approvalRiskMeta: Record<ApprovalRisk, { label: string; tone: BadgeTone }> = {
  low: { label: "Low Risk", tone: "success" },
  medium: { label: "Medium Risk", tone: "warning" },
  high: { label: "High Risk", tone: "danger" },
};

export const healthCategoryMeta: Record<HealthCategory, { label: string; tone: BadgeTone }> = {
  healthy: { label: "Healthy", tone: "success" },
  at_risk: { label: "At Risk", tone: "warning" },
  high_risk: { label: "High Risk", tone: "danger" },
  inactive: { label: "Inactive", tone: "neutral" },
  expansion: { label: "Expansion", tone: "accent" },
};

export const channelMeta: Record<ChannelType, { label: string; icon: ComponentType<{ className?: string }> }> = {
  website_chat: { label: "Website Chat", icon: Globe },
  email: { label: "Email", icon: Mail },
  whatsapp: { label: "WhatsApp", icon: MessageCircle },
  call: { label: "Call", icon: Phone },
  meeting: { label: "Meeting", icon: CalendarClock },
  internal_note: { label: "Internal Note", icon: StickyNote },
};

export const leadSourceMeta: Record<LeadSource, { label: string; icon: ComponentType<{ className?: string }> }> = {
  website: { label: "Website", icon: Globe },
  email: { label: "Email", icon: Mail },
  whatsapp: { label: "WhatsApp", icon: MessageCircle },
  facebook: { label: "Facebook", icon: Share2 },
  instagram: { label: "Instagram", icon: Camera },
  meta_ads: { label: "Meta Ads", icon: Megaphone },
  google_ads: { label: "Google Ads", icon: Search },
  linkedin: { label: "LinkedIn", icon: Briefcase },
  referral: { label: "Referral", icon: Users },
  webhook: { label: "Webhook", icon: Webhook },
  api: { label: "API", icon: Code2 },
  csv_import: { label: "CSV Import", icon: FileSpreadsheet },
};

export const automationTriggerMeta: Record<AutomationTriggerKind, string> = {
  new_lead: "New Lead Created",
  proposal_sent: "Proposal Sent",
  deal_won: "Deal Won",
  ticket_sla_breach: "Ticket Open Beyond SLA",
  customer_at_risk: "Customer Health Drops",
  human_request: "Explicit Human Request",
  ticket_created: "Ticket Created",
};

export function riskFromAmount(amount: number | undefined): ApprovalRisk {
  if (!amount) return "low";
  if (amount >= 100000) return "high";
  if (amount >= 25000) return "medium";
  return "low";
}
