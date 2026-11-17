"use client";
import { LiveNotifications } from "@/components/crm/live-pages";
import { demoMode } from "@/lib/demo-mode";

import * as React from "react";
import { useCrmAccess } from "@/lib/use-crm-access";
import { useRouter } from "next/navigation";
import type { ComponentType } from "react";
import { Handshake, LifeBuoy, Sparkles, Workflow, Bell, BellOff, BellRing, CheckCheck, Clock, Filter, Moon, Settings2, Trash2 } from "lucide-react";
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

function groupByDate(items: { createdAt: string }[]): Map<string, typeof items> {
  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const d = new Date(item.createdAt);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
    const label = diff === 0 ? "Today" : diff === 1 ? "Yesterday" : diff < 7 ? d.toLocaleDateString("en-IN", { weekday: "long" }) : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(item);
  }
  return groups;
}

function DemoNotifications() {
  const router = useRouter();
  const allNotifications = useAppStore((s) => s.notifications);
  const access = useCrmAccess();
  const notifications = React.useMemo(() => access.notifications(allNotifications), [access, allNotifications]);
  const markNotificationRead = useAppStore((s) => s.markNotificationRead);
  const markAllNotificationsRead = useAppStore((s) => s.markAllNotificationsRead);
  const [tab, setTab] = React.useState<"all" | NotificationCategory>("all");
  const [showPrefs, setShowPrefs] = React.useState(false);
  const [onlyUnread, setOnlyUnread] = React.useState(false);
  const [onlyHigh, setOnlyHigh] = React.useState(false);
  const [quietHours, setQuietHours] = React.useState(false);
  const [prefs, setPrefs] = React.useState<Record<NotificationCategory, boolean>>({
    sales: true, support: true, ai: true, automation: true, system: true,
  });

  const unreadCount = notifications.filter((n) => !n.read).length;
  const highPriorityCount = notifications.filter((n) => n.priority === "high" && !n.read).length;

  const rows = notifications
    .filter((n) => tab === "all" || n.category === tab)
    .filter((n) => !onlyUnread || !n.read)
    .filter((n) => !onlyHigh || n.priority === "high")
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const grouped = groupByDate(rows);

  function handleOpen(id: string, href?: string) {
    markNotificationRead(id);
    if (href) router.push(href);
  }

  return (
    <div className="mx-auto flex max-w-[900px] flex-col">
      <PageHeader
        title="Notifications"
        description={`${unreadCount} unread of ${notifications.length}`}
        actions={
          <div className="flex items-center gap-2">
            {quietHours && (
              <Badge variant="neutral" className="gap-1"><Moon className="size-3" />Quiet hours on</Badge>
            )}
            {highPriorityCount > 0 && (
              <Badge variant="warning" className="gap-1"><BellRing className="size-3" />{highPriorityCount} urgent</Badge>
            )}
            <Button size="sm" variant="ghost" onClick={() => setShowPrefs((v) => !v)}>
              <Settings2 className="size-3.5" />
            </Button>
            <Button size="sm" variant="secondary" onClick={markAllNotificationsRead} disabled={unreadCount === 0}>
              <CheckCheck className="size-3.5" />Mark all read
            </Button>
          </div>
        }
      />

      {showPrefs && (
        <div className="border-b border-border bg-surface-2/30 px-6 py-4">
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Category preferences</h3>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(prefs) as NotificationCategory[]).map((cat) => {
                  const meta = notificationCategoryMeta[cat];
                  return (
                    <button key={cat} type="button" onClick={() => setPrefs((p) => ({ ...p, [cat]: !p[cat] }))} className={cn("flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors", prefs[cat] ? "border-accent bg-accent-muted text-accent" : "border-border bg-surface text-muted-foreground")}>
                      <meta.icon className="size-3" />
                      {meta.label}
                      {prefs[cat] ? <Bell className="size-2.5" /> : <BellOff className="size-2.5" />}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button type="button" onClick={() => setQuietHours((v) => !v)} className={cn("flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors", quietHours ? "border-accent bg-accent-muted text-accent" : "border-border bg-surface text-muted-foreground")}>
                <Moon className="size-3" />
                Quiet hours (10 PM – 7 AM)
              </button>
              <span className="text-[11px] text-muted-foreground">Mute all except high-priority during these hours</span>
            </div>
          </div>
        </div>
      )}

      <div className="border-b border-border px-6">
        <div className="flex items-center justify-between">
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
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setOnlyUnread((v) => !v)} className={cn("flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors", onlyUnread ? "bg-accent text-white" : "text-muted-foreground hover:text-foreground")}>
              <Filter className="size-3" />Unread
            </button>
            <button type="button" onClick={() => setOnlyHigh((v) => !v)} className={cn("flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors", onlyHigh ? "bg-warning text-white" : "text-muted-foreground hover:text-foreground")}>
              <BellRing className="size-3" />Urgent
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col px-6 py-4">
        {rows.length === 0 ? (
          <EmptyState icon={BellOff} title="Nothing here" description="No notifications in this category yet." />
        ) : (
          Array.from(grouped.entries()).map(([label, items]) => (
            <div key={label}>
              <div className="flex items-center gap-3 pb-2 pt-3 first:pt-0">
                <div className="flex-1 border-b border-border/30" />
                <span className="select-none text-[10px] font-medium text-muted-foreground/50">{label}</span>
                <div className="flex-1 border-b border-border/30" />
              </div>
              <div className="flex flex-col gap-2">
                {(items as typeof rows).map((n) => {
                  const meta = notificationCategoryMeta[n.category];
                  const Icon = meta.icon;
                  return (
                    <div
                      key={n.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleOpen(n.id, n.href)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleOpen(n.id, n.href); }}
                      className={cn(
                        "group flex cursor-pointer items-start gap-3 rounded-lg border border-l-2 px-4 py-3 transition-colors",
                        n.read
                          ? "border-border border-l-transparent bg-surface hover:border-border-strong"
                          : "border-border border-l-accent bg-accent-muted/30 hover:border-border-strong"
                      )}
                    >
                      <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-accent")} aria-hidden />
                      <Icon className={cn("mt-0.5 size-3.5 shrink-0", n.read ? "text-muted-foreground" : "text-accent")} />
                      <div className="min-w-0 flex-1">
                        <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                          <Badge variant={meta.tone}>{meta.label}</Badge>
                          {n.priority === "high" && <Badge variant="warning">High priority</Badge>}
                        </div>
                        <p className={cn("text-[13px]", n.read ? "text-muted-foreground" : "font-medium text-foreground")}>{n.title}</p>
                        <p className="text-[12px] text-muted-foreground">{n.description}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="whitespace-nowrap text-[11px] text-muted-foreground">{formatRelativeTime(n.createdAt)}</span>
                        {!n.read && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); markNotificationRead(n.id); }}
                            className="rounded-md p-1 text-muted-foreground/50 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                            title="Mark as read"
                          >
                            <CheckCheck className="size-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return demoMode ? <DemoNotifications /> : <LiveNotifications />;
}
