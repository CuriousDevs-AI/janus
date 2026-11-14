"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { ProfileCard } from "@/components/settings/profile-card";
import { SecuritySection } from "@/components/settings/security-section";
import { NotificationsSection } from "@/components/settings/notifications-section";
import { useWorkspace } from "@/components/layout/workspace-context";

const tabs = [
  { value: "profile", label: "Profile" },
  { value: "security", label: "Security & sessions" },
  { value: "notifications", label: "Notifications" },
] as const;
type Tab = (typeof tabs)[number]["value"];

export default function AccountPage() {
  return <React.Suspense fallback={null}><Account /></React.Suspense>;
}

/**
 * Everything about you as a person, in one place for every workspace: your name and phone, your
 * password and signed-in devices, and what Janus emails you. Company settings stay with the company.
 */
function Account() {
  const params = useSearchParams();
  const { workspaceId } = useWorkspace();
  const tab: Tab = tabs.find((item) => item.value === params.get("tab"))?.value ?? "profile";
  const href = (value: Tab) => `/account?tab=${value}${workspaceId ? `&workspace=${workspaceId}` : ""}`;
  return <div className="mx-auto flex w-full max-w-[960px] flex-col pb-10">
    <PageHeader title="My account" description="You, across every company and workspace: your details, how you sign in, and what Janus sends you." />
    <nav aria-label="My account" className="janus-tab-strip mx-6 flex gap-1 overflow-x-auto rounded-lg bg-surface-2 p-1">
      {tabs.map((item) => <Link key={item.value} href={href(item.value)} replace scroll={false} aria-current={item.value === tab ? "page" : undefined}
        className={`shrink-0 rounded-sm px-3 py-2 text-xs transition-colors ${item.value === tab ? "bg-surface font-medium text-foreground shadow-sm" : "text-muted-foreground hover:bg-surface/70 hover:text-foreground"}`}>{item.label}</Link>)}
    </nav>
    <div className="mt-5 px-6">
      {tab === "profile" && <div className="flex flex-col gap-5"><ProfileCard /></div>}
      {tab === "security" && <SecuritySection />}
      {tab === "notifications" && <NotificationsSection />}
    </div>
  </div>;
}
