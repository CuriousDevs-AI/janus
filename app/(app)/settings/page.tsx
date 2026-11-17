"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Building2,
  Users,
  ShieldCheck,
  Radio,
  Sparkles,
  Database,
  Workflow,
  Bell,
  Lock,
  CreditCard,
  ScrollText,
  CheckCircle2,
  IndianRupee,
  Calendar,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { cn } from "@/lib/utils";
import { WorkspaceSection } from "@/components/settings/workspace-section";
import { TeamSection } from "@/components/settings/team-section";
import { RolesSection } from "@/components/settings/roles-section";
import { ChannelsSection } from "@/components/settings/channels-section";
import { AISection } from "@/components/settings/ai-section";
import { KnowledgeSection } from "@/components/settings/knowledge-section";
import { AutomationSection } from "@/components/settings/automation-section";
import { NotificationsSection } from "@/components/settings/notifications-section";
import { SecuritySection } from "@/components/settings/security-section";
import { useWorkspace } from "@/components/layout/workspace-context";
import { LivePeopleAccess } from "@/components/business/people-access-live";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type SettingsTab =
  | "workspace"
  | "team"
  | "roles"
  | "channels"
  | "ai"
  | "knowledge"
  | "automation"
  | "notifications"
  | "security"
  | "billing"
  | "audit";

const TABS: { value: SettingsTab; label: string; icon: LucideIcon }[] = [
  { value: "workspace", label: "Workspace", icon: Building2 },
  { value: "team", label: "Team", icon: Users },
  { value: "roles", label: "Roles", icon: ShieldCheck },
  { value: "channels", label: "Channels", icon: Radio },
  { value: "ai", label: "AI", icon: Sparkles },
  { value: "knowledge", label: "Knowledge", icon: Database },
  { value: "automation", label: "Automation", icon: Workflow },
  { value: "notifications", label: "Notifications", icon: Bell },
  { value: "security", label: "Security", icon: Lock },
  { value: "billing", label: "Billing", icon: CreditCard },
  { value: "audit", label: "Audit Log", icon: ScrollText },
];

const TAB_VALUES = TABS.map((t) => t.value);

function isSettingsTab(value: string | null): value is SettingsTab {
  return !!value && (TAB_VALUES as string[]).includes(value);
}

function BillingSection() {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-border bg-surface p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Business Plan</h3>
              <Badge variant="success">Active</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Your workspace is on the Business plan with unlimited CRM seats.</p>
          </div>
          <Button size="sm" variant="secondary">Change plan</Button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-4 border-t border-border/50 pt-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Monthly cost</p>
            <p className="mt-0.5 flex items-center gap-1 text-lg font-bold"><IndianRupee className="size-3.5" />4,999</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Billing cycle</p>
            <p className="mt-0.5 flex items-center gap-1 text-sm font-medium"><Calendar className="size-3" />Monthly</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Next invoice</p>
            <p className="mt-0.5 text-sm font-medium">1 Dec 2026</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-6">
        <h3 className="mb-3 text-sm font-semibold">Usage this month</h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: "Team seats", used: "8", total: "Unlimited", pct: 0 },
            { label: "Lead sources", used: "3", total: "10", pct: 30 },
            { label: "AI queries", used: "247", total: "1,000", pct: 24.7 },
            { label: "Storage", used: "1.2 GB", total: "10 GB", pct: 12 },
          ].map((u) => (
            <div key={u.label} className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{u.label}</span>
              <span className="text-sm font-semibold">{u.used} <span className="text-xs font-normal text-muted-foreground">/ {u.total}</span></span>
              {u.pct > 0 && (
                <div className="h-1 w-full rounded-full bg-muted">
                  <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${u.pct}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-6">
        <h3 className="mb-3 text-sm font-semibold">Recent invoices</h3>
        <div className="flex flex-col divide-y divide-border/50">
          {[
            { date: "1 Nov 2026", amount: "₹4,999", status: "Paid" },
            { date: "1 Oct 2026", amount: "₹4,999", status: "Paid" },
            { date: "1 Sep 2026", amount: "₹4,999", status: "Paid" },
          ].map((inv) => (
            <div key={inv.date} className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium">{inv.date}</span>
                <span className="text-xs text-muted-foreground">{inv.amount}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="success" className="text-[10px]">{inv.status}</Badge>
                <Button size="sm" variant="ghost" className="h-6 text-[11px]">Download</Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AuditLogSection() {
  const demoLogs = [
    { id: "1", action: "settings.roles.updated", actor: "Priya Sharma", target: "Sales Manager role", time: "2 hours ago", ip: "192.168.1.xxx" },
    { id: "2", action: "member.invited", actor: "Pankaj Neema", target: "rahul@example.com", time: "5 hours ago", ip: "192.168.1.xxx" },
    { id: "3", action: "automation.published", actor: "Priya Sharma", target: "Lead Follow-up Sequence", time: "1 day ago", ip: "192.168.1.xxx" },
    { id: "4", action: "source.created", actor: "Pankaj Neema", target: "WhatsApp Business", time: "2 days ago", ip: "192.168.1.xxx" },
    { id: "5", action: "settings.billing.updated", actor: "Pankaj Neema", target: "Plan changed to Business", time: "3 days ago", ip: "192.168.1.xxx" },
    { id: "6", action: "member.role_changed", actor: "Pankaj Neema", target: "Amit Kumar → Sales Manager", time: "4 days ago", ip: "192.168.1.xxx" },
    { id: "7", action: "knowledge.document.uploaded", actor: "Priya Sharma", target: "Product Catalog v3.pdf", time: "5 days ago", ip: "192.168.1.xxx" },
    { id: "8", action: "security.password_changed", actor: "Rahul Verma", target: "Own account", time: "1 week ago", ip: "192.168.1.xxx" },
  ];

  const actionLabels: Record<string, { label: string; tone: "accent" | "success" | "warning" | "danger" | "neutral" }> = {
    "settings.roles.updated": { label: "Role updated", tone: "accent" },
    "member.invited": { label: "Member invited", tone: "success" },
    "automation.published": { label: "Automation published", tone: "accent" },
    "source.created": { label: "Source created", tone: "success" },
    "settings.billing.updated": { label: "Billing changed", tone: "warning" },
    "member.role_changed": { label: "Role changed", tone: "accent" },
    "knowledge.document.uploaded": { label: "Document uploaded", tone: "neutral" },
    "security.password_changed": { label: "Password changed", tone: "warning" },
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Recent actions by team members that affect workspace configuration.</p>
        <Button size="sm" variant="secondary">Export CSV</Button>
      </div>
      <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
        {demoLogs.map((log) => {
          const meta = actionLabels[log.action] ?? { label: log.action, tone: "neutral" as const };
          return (
            <div key={log.id} className="flex items-center gap-4 px-4 py-3">
              <Badge variant={meta.tone} className="shrink-0 text-[10px]">{meta.label}</Badge>
              <div className="min-w-0 flex-1">
                <p className="text-xs"><span className="font-medium">{log.actor}</span> <span className="text-muted-foreground">→ {log.target}</span></p>
              </div>
              <span className="shrink-0 text-[11px] text-muted-foreground">{log.time}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <React.Suspense fallback={null}>
      <SettingsPageInner />
    </React.Suspense>
  );
}

function SettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { workspaceId } = useWorkspace();
  const businessMode = workspaceId === "business";
  const tabParam = searchParams.get("tab");
  const activeTab: SettingsTab = isSettingsTab(tabParam) ? tabParam : "workspace";
  const view = searchParams.get("view");
  const isBusinessPeopleAccess = businessMode && (activeTab === "team" || activeTab === "roles");
  const showPageHeader = !isBusinessPeopleAccess && !(businessMode && activeTab === "workspace" && (view === "overview" || view === "workspaces"));
  const section = searchParams.get("section");
  const pageHeader = activeTab === "security"
    ? { title: "Security & Sessions", description: "Your password and every device signed in as you." }
    : activeTab === "notifications"
      ? { title: "Notifications", description: "The emails and alerts Janus sends you." }
      : activeTab === "billing"
        ? { title: "Billing & Plans", description: "Your subscription, usage and invoices." }
        : activeTab === "audit"
          ? { title: "Audit Log", description: "Who changed what and when across your workspace." }
          : activeTab !== "workspace"
            ? { title: "Settings", description: "Manage your profile, access, notifications and business configuration." }
            : view === "administration" && (section ?? "profile") === "profile"
              ? { title: "Profile", description: "Your name, contact details, language and timezone, across every workspace." }
              : view === "settings"
                ? { title: "Business Settings", description: "How the company appears on invoices and reports, its legal details, hours and data." }
                : { title: "Settings", description: "Manage your profile, access, notifications and business configuration." };

  function setTab(tab: SettingsTab) {
    router.replace(`/settings?tab=${tab}`);
  }

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col">
      {showPageHeader && <PageHeader title={pageHeader.title} description={pageHeader.description} />}

      <div className={cn(
        "grid grid-cols-1 gap-6 px-6 pb-10",
        businessMode ? "" : "md:grid-cols-[200px_1fr]",
      )}>
        <nav className={cn(
          "flex gap-1 overflow-x-auto md:flex-col md:overflow-visible",
          businessMode && "hidden",
        )}>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => setTab(tab.value)}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-md border border-transparent px-3 py-2 text-left text-[13px] transition-colors",
                  active
                    ? "border-accent-border bg-accent-muted text-foreground"
                    : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                )}
              >
                <Icon className={cn("size-3.5 shrink-0", active && "text-accent")} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0">
          <div className={activeTab === "workspace" ? "" : "hidden"}>
            <WorkspaceSection key={`${searchParams.get("view") ?? "default"}-${searchParams.get("section") ?? ""}`} />
          </div>
          <div className={activeTab === "team" ? "" : "hidden"}>{businessMode ? <LivePeopleAccess /> : <TeamSection />}</div>
          <div className={activeTab === "roles" ? "" : "hidden"}>{businessMode ? <LivePeopleAccess initialSection="roles" /> : <RolesSection />}</div>
          <div className={activeTab === "channels" ? "" : "hidden"}><ChannelsSection /></div>
          <div className={activeTab === "ai" ? "" : "hidden"}><AISection /></div>
          <div className={activeTab === "knowledge" ? "" : "hidden"}><KnowledgeSection /></div>
          <div className={activeTab === "automation" ? "" : "hidden"}><AutomationSection /></div>
          <div className={activeTab === "notifications" ? "" : "hidden"}><NotificationsSection /></div>
          <div className={activeTab === "security" ? "" : "hidden"}><SecuritySection /></div>
          <div className={activeTab === "billing" ? "" : "hidden"}><BillingSection /></div>
          <div className={activeTab === "audit" ? "" : "hidden"}><AuditLogSection /></div>
        </div>
      </div>
    </div>
  );
}
