import {
  Globe, MessageCircle, Phone, Zap, Code2, FileSpreadsheet,
  Megaphone, Pencil, Users, Building2, type LucideIcon,
} from "lucide-react";

export type LeadSource =
  | "website"
  | "whatsapp"
  | "phone_call"
  | "webhook"
  | "api"
  | "csv_import"
  | "meta_lead_ads"
  | "indiamart"
  | "manual"
  | "referral";

export const LEAD_SOURCES: LeadSource[] = [
  "manual",
  "website",
  "whatsapp",
  "phone_call",
  "webhook",
  "api",
  "csv_import",
  "meta_lead_ads",
  "indiamart",
  "referral",
];

interface SourceMeta {
  label: string;
  icon: LucideIcon;
  color: string;
  bg: string;
}

const META: Record<LeadSource, SourceMeta> = {
  website: { label: "Website", icon: Globe, color: "text-accent", bg: "bg-accent/10" },
  whatsapp: { label: "WhatsApp", icon: MessageCircle, color: "text-success", bg: "bg-success/10" },
  phone_call: { label: "Phone Call", icon: Phone, color: "text-warning", bg: "bg-warning/10" },
  webhook: { label: "Webhook", icon: Zap, color: "text-info", bg: "bg-info/10" },
  api: { label: "API", icon: Code2, color: "text-info", bg: "bg-info/10" },
  csv_import: { label: "CSV Import", icon: FileSpreadsheet, color: "text-muted-foreground", bg: "bg-surface-2" },
  meta_lead_ads: { label: "Meta Ads", icon: Megaphone, color: "text-accent", bg: "bg-accent/10" },
  indiamart: { label: "IndiaMart", icon: Building2, color: "text-warning", bg: "bg-warning/10" },
  manual: { label: "Manual", icon: Pencil, color: "text-muted-foreground", bg: "bg-surface-2" },
  referral: { label: "Referral", icon: Users, color: "text-success", bg: "bg-success/10" },
};

export function sourceMeta(source: string): SourceMeta {
  return META[source as LeadSource] ?? { label: source.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), icon: Globe, color: "text-muted-foreground", bg: "bg-surface-2" };
}

export function sourceLabel(source: string): string {
  return sourceMeta(source).label;
}

const CHART_COLORS: Record<LeadSource, string> = {
  website: "#3b82f6",
  whatsapp: "#22c55e",
  phone_call: "#f59e0b",
  webhook: "#06b6d4",
  api: "#8b5cf6",
  csv_import: "#6b7280",
  meta_lead_ads: "#ec4899",
  indiamart: "#f97316",
  manual: "#94a3b8",
  referral: "#10b981",
};

export function sourceChartColor(source: string): string {
  return CHART_COLORS[source as LeadSource] ?? "#6b7280";
}
