"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Building2,
  Users,
  ShieldCheck,
  Radio,
  Database,
  Workflow,
  Bell,
  Lock,
  CreditCard,
  Loader2,
  ScrollText,
  type LucideIcon,
} from "lucide-react";
import { CuriousdevsLogo } from "@/components/shared/curiousdevs-logo";
import { PageHeader } from "@/components/shared/page-header";
import { cn } from "@/lib/utils";
const WorkspaceSection = React.lazy(() => import("@/components/settings/workspace-section").then((m) => ({ default: m.WorkspaceSection })));
const TeamSection = React.lazy(() => import("@/components/settings/team-section").then((m) => ({ default: m.TeamSection })));
const RolesSection = React.lazy(() => import("@/components/settings/roles-section").then((m) => ({ default: m.RolesSection })));
const ChannelsSection = React.lazy(() => import("@/components/settings/channels-section").then((m) => ({ default: m.ChannelsSection })));
const AISection = React.lazy(() => import("@/components/settings/ai-section").then((m) => ({ default: m.AISection })));
const KnowledgeSection = React.lazy(() => import("@/components/settings/knowledge-section").then((m) => ({ default: m.KnowledgeSection })));
const AutomationSection = React.lazy(() => import("@/components/settings/automation-section").then((m) => ({ default: m.AutomationSection })));
const NotificationsSection = React.lazy(() => import("@/components/settings/notifications-section").then((m) => ({ default: m.NotificationsSection })));
const SecuritySection = React.lazy(() => import("@/components/settings/security-section").then((m) => ({ default: m.SecuritySection })));
import { useWorkspace } from "@/components/layout/workspace-context";
import { useApi } from "@/lib/api/use-api";
import { LivePeopleAccess } from "@/components/business/people-access-live";
const BillingSection = React.lazy(() => import("@/components/settings/billing-section").then((m) => ({ default: m.BillingSection })));
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

const TABS: { value: SettingsTab; label: string; icon: LucideIcon | React.ComponentType<{ className?: string }> }[] = [
  { value: "workspace", label: "Workspace", icon: Building2 },
  { value: "team", label: "Team", icon: Users },
  { value: "roles", label: "Roles", icon: ShieldCheck },
  { value: "channels", label: "Channels", icon: Radio },
  { value: "ai", label: "AI", icon: CuriousdevsLogo },
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

type ApiAuditEvent = { id: string; at: string; area: string; what: string; action: string; who: string | null; ip: string | null };

function AuditLogSectionLive() {
  const live = useApi<ApiAuditEvent[]>("/audit/events?limit=20");
  const events = live.data ?? [];
  const toneFor = (area: string): "accent" | "success" | "warning" | "danger" | "neutral" => {
    if (area === "sign-in") return "warning";
    if (area === "people") return "success";
    if (area === "sales") return "accent";
    if (area === "money") return "warning";
    if (area === "workflows") return "accent";
    return "neutral";
  };
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">Recent actions by team members that affect workspace configuration.</p>
      {live.loading ? (
        <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">Loading audit events…</div>
      ) : live.error ? (
        <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">Could not load audit events. Your role may not have access.</div>
      ) : events.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">No audit events recorded yet. Actions like signing in, changing roles or inviting members appear here.</div>
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
          {events.map((log) => (
            <div key={log.id} className="flex items-center gap-4 px-4 py-3">
              <Badge variant={toneFor(log.area)} className="shrink-0 text-[10px]">{log.what}</Badge>
              <div className="min-w-0 flex-1">
                <p className="text-xs"><span className="font-medium">{log.who ?? "System"}</span> <span className="text-muted-foreground">· {log.area}</span></p>
              </div>
              <span className="shrink-0 text-[11px] text-muted-foreground">{new Date(log.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, {new Date(log.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <React.Suspense fallback={<div className="flex h-64 items-center justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>}>
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
          <React.Suspense fallback={<div className="animate-pulse rounded-lg bg-surface-2 h-40" />}>
            {activeTab === "workspace" && <WorkspaceSection key={`${searchParams.get("view") ?? "default"}-${searchParams.get("section") ?? ""}`} />}
            {activeTab === "team" && (businessMode ? <LivePeopleAccess /> : <TeamSection />)}
            {activeTab === "roles" && (businessMode ? <LivePeopleAccess initialSection="roles" /> : <RolesSection />)}
            {activeTab === "channels" && <ChannelsSection />}
            {activeTab === "ai" && <AISection />}
            {activeTab === "knowledge" && <KnowledgeSection />}
            {activeTab === "automation" && <AutomationSection />}
            {activeTab === "notifications" && <NotificationsSection />}
            {activeTab === "security" && <SecuritySection />}
            {activeTab === "billing" && <BillingSection />}
            {activeTab === "audit" && <AuditLogSectionLive />}
          </React.Suspense>
        </div>
      </div>
    </div>
  );
}
