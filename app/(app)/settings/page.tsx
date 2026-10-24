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
import { BillingSection } from "@/components/settings/billing-section";
import { useWorkspace } from "@/components/layout/workspace-context";
import { BusinessPeopleAccess } from "@/components/business/people-access";

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
  | "billing";

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
];

const TAB_VALUES = TABS.map((t) => t.value);

function isSettingsTab(value: string | null): value is SettingsTab {
  return !!value && (TAB_VALUES as string[]).includes(value);
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
  const showPageHeader = !isBusinessPeopleAccess && !(businessMode && activeTab === "workspace" && (view === "overview" || view === "settings" || view === "workspaces"));
  const pageHeader = activeTab !== "workspace"
    ? { title: "Settings", description: "Manage your profile, access, notifications and business configuration." }
    : view === "overview"
      ? { title: "Business Overview", description: "See business health, performance and the work that needs attention." }
      : view === "workspaces"
        ? { title: "Workspaces", description: "Create and manage the workspaces your business uses." }
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

        {/*
          Every section stays mounted and is only hidden via CSS, rather than
          conditionally rendered — each section owns local form state, and
          conditionally rendering (`{activeTab === "x" && <X/>}`) would
          unmount/remount it on every tab switch, silently discarding
          whatever the user had just changed.
        */}
        <div className="min-w-0">
          <div className={activeTab === "workspace" ? "" : "hidden"}>
            <WorkspaceSection key={`${searchParams.get("view") ?? "default"}-${searchParams.get("section") ?? ""}`} />
          </div>
          <div className={activeTab === "team" ? "" : "hidden"}>{businessMode ? <BusinessPeopleAccess /> : <TeamSection />}</div>
          <div className={activeTab === "roles" ? "" : "hidden"}>{businessMode ? <BusinessPeopleAccess initialSection="roles" /> : <RolesSection />}</div>
          <div className={activeTab === "channels" ? "" : "hidden"}><ChannelsSection /></div>
          <div className={activeTab === "ai" ? "" : "hidden"}><AISection /></div>
          <div className={activeTab === "knowledge" ? "" : "hidden"}><KnowledgeSection /></div>
          <div className={activeTab === "automation" ? "" : "hidden"}><AutomationSection /></div>
          <div className={activeTab === "notifications" ? "" : "hidden"}><NotificationsSection /></div>
          <div className={activeTab === "security" ? "" : "hidden"}><SecuritySection /></div>
          <div className={activeTab === "billing" ? "" : "hidden"}><BillingSection /></div>
        </div>
      </div>
    </div>
  );
}
