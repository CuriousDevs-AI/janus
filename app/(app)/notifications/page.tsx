"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ComponentType } from "react";
import { Handshake, LifeBuoy, Sparkles, Workflow, Bell, BellOff, CheckCheck } from "lucide-react";
import { useAppStore } from "@/lib/stores/app-store";
import type { NotificationCategory } from "@/lib/types";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatRelativeTime, cn } from "@/lib/utils";
import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";
import { demoMode } from "@/lib/demo-mode";

type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

const notificationCategoryMeta: Record<NotificationCategory, { label: string; tone: BadgeTone; icon: ComponentType<{ className?: string }> }> = {
  sales: { label: "Sales", tone: "success", icon: Handshake },
  support: { label: "Support", tone: "info", icon: LifeBuoy },
  ai: { label: "AI", tone: "accent", icon: Sparkles },
  automation: { label: "Automation", tone: "warning", icon: Workflow },
  system: { label: "System", tone: "neutral", icon: Bell },
};

const TABS: { key: "all" | NotificationCategory; label: string }[] = [
  { key: "all", label: "All" },
  { key: "sales", label: "Sales" },
  { key: "support", label: "Support" },
  { key: "ai", label: "AI" },
  { key: "automation", label: "Automation" },
  { key: "system", label: "System" },
];

export default function NotificationsPage() {
  const router = useRouter();
  const notifications = useAppStore((s) => s.notifications);
  const markNotificationRead = useAppStore((s) => s.markNotificationRead);
  const markAllNotificationsRead = useAppStore((s) => s.markAllNotificationsRead);
  const [tab, setTab] = React.useState<"all" | NotificationCategory>("all");

  const unreadCount = notifications.filter((n) => !n.read).length;

  const rows = notifications
    .filter((n) => tab === "all" || n.category === tab)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  function handleOpen(id: string, href?: string) {
    markNotificationRead(id);
    if (href) router.push(href);
  }

  return (
    <div className="mx-auto flex max-w-[900px] flex-col">
      <PageHeader
        title="Notifications"
        description={`${unreadCount} unread of ${notifications.length}`}
        actions={<div className="flex items-center gap-2"><Button size="sm" variant="secondary" onClick={markAllNotificationsRead} disabled={unreadCount === 0}><CheckCheck className="size-3.5" />Mark all read</Button></div>}
      />

      <div className="border-b border-border px-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>
                {t.label}
                {t.key !== "all" && (
                  <span className="ml-1.5 text-[11px] text-muted-foreground">
                    {notifications.filter((n) => n.category === t.key).length}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="flex flex-col gap-2 px-6 py-4">
        {rows.length === 0 ? (
          <EmptyState icon={BellOff} title="Nothing here" description="No notifications in this category yet." />
        ) : (
          rows.map((n) => {
            const meta = notificationCategoryMeta[n.category];
            const Icon = meta.icon;
            return (
              <div
                key={n.id}
                role="button"
                tabIndex={0}
                onClick={() => handleOpen(n.id, n.href)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleOpen(n.id, n.href);
                }}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border border-l-2 px-4 py-3 transition-colors",
                  n.read
                    ? "border-border border-l-transparent bg-surface hover:border-border-strong"
                    : "border-border border-l-accent bg-accent-muted/30 hover:border-border-strong"
                )}
              >
                <span
                  className={cn(
                    "mt-1.5 size-1.5 shrink-0 rounded-full",
                    n.read ? "bg-transparent" : "bg-accent"
                  )}
                  aria-hidden
                />
                <Icon className={cn("mt-0.5 size-3.5 shrink-0", n.read ? "text-muted-foreground" : "text-accent")} />
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                    <Badge variant={meta.tone}>{meta.label}</Badge>
                    {n.priority === "high" && <Badge variant="warning">High priority</Badge>}
                  </div>
                  <p className={cn("text-[13px]", n.read ? "text-muted-foreground" : "font-medium text-foreground")}>{n.title}</p>
                  <p className="text-[12px] text-muted-foreground">{n.description}</p>
                </div>
                <span className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground">{formatRelativeTime(n.createdAt)}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
