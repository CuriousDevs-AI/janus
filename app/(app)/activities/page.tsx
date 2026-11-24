"use client";

import { useMemo, useState } from "react";
import {
  CalendarCheck, Phone, Video, Mail, ClipboardList, StickyNote,
  CheckCircle2, RefreshCw, Plus, ChevronLeft, ChevronRight,
  BarChart3, TrendingUp, Clock, Users, Settings2, Filter, X,
} from "lucide-react";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { useSession } from "@/components/auth/session-provider";
import type { Activity, ActivityKind } from "@/lib/api/types";
import { ActivityForm } from "@/components/crm/activity-form";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { MetricCard } from "@/components/shared/metric-card";
import { formatDateTime, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchInput } from "@/components/shared/search-input";
import {
  Bar, BarChart, CartesianGrid, Cell,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
const KIND_META: Record<ActivityKind, { label: string; icon: typeof Phone; color: string; chartColor: string }> = {
  call: { label: "Call", icon: Phone, color: "text-info", chartColor: "var(--info)" },
  meeting: { label: "Meeting", icon: Video, color: "text-accent", chartColor: "var(--accent)" },
  email: { label: "Email", icon: Mail, color: "text-warning", chartColor: "var(--warning)" },
  task: { label: "Task", icon: ClipboardList, color: "text-success", chartColor: "var(--success)" },
  note: { label: "Note", icon: StickyNote, color: "text-muted-foreground", chartColor: "var(--muted-foreground)" },
};

type ViewTab = "today" | "upcoming" | "overdue" | "calendar" | "analysis";
type StatusFilter = "all" | "pending" | "completed" | "overdue";
const ALL_KINDS: ActivityKind[] = ["call", "meeting", "email", "task", "note"];

function todayIST() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA");
}

function getCalendarDays(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const days: { date: string; inMonth: boolean }[] = [];
  const startDay = first.getDay();
  for (let i = startDay - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: d.toLocaleDateString("en-CA"), inMonth: false });
  }
  for (let d = 1; d <= last.getDate(); d++) {
    days.push({ date: new Date(year, month, d).toLocaleDateString("en-CA"), inMonth: true });
  }
  while (days.length % 7 !== 0) {
    const d = new Date(year, month + 1, days.length - last.getDate() - startDay + 1);
    days.push({ date: d.toLocaleDateString("en-CA"), inMonth: false });
  }
  return days;
}

function weekKey(dateStr: string) {
  const d = new Date(dateStr);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  return `W${week}`;
}

export default function ActivitiesPage() {
  useSession();
  const [tab, setTab] = useState<ViewTab>("today");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [visibleKinds, setVisibleKinds] = useState<Set<ActivityKind>>(new Set(ALL_KINDS));
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [logOpen, setLogOpen] = useState(false);
  const [completing, setCompleting] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const today = todayIST();
  const weekEnd = addDays(today, 7);
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const activities = useApi<Activity[]>(
    `/activities?limit=100${kindFilter !== "all" && tab !== "analysis" ? `&kind=${kindFilter}` : ""}`,
  );
  const allActivities = useApi<Activity[]>(tab === "analysis" ? "/activities?limit=100" : null);
  const rows = useMemo(() => activities.data ?? [], [activities.data]);
  const allRows = useMemo(() => (tab === "analysis" ? allActivities.data : activities.data) ?? [], [tab, allActivities.data, activities.data]);

  const owners = useMemo(() => {
    const set = new Set<string>();
    for (const a of rows) if (a.ownerName) set.add(a.ownerName);
    return [...set].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (tab === "today") list = list.filter((a) => !a.completedAt && a.dueAt && a.dueAt.slice(0, 10) === today);
    else if (tab === "upcoming") list = list.filter((a) => !a.completedAt && a.dueAt && a.dueAt.slice(0, 10) > today && a.dueAt.slice(0, 10) <= weekEnd);
    else if (tab === "overdue") list = list.filter((a) => !a.completedAt && a.dueAt && a.dueAt.slice(0, 10) < today);
    if (visibleKinds.size < ALL_KINDS.length) list = list.filter((a) => visibleKinds.has(a.kind));
    if (statusFilter === "pending") list = list.filter((a) => !a.completedAt);
    else if (statusFilter === "completed") list = list.filter((a) => a.completedAt);
    else if (statusFilter === "overdue") list = list.filter((a) => !a.completedAt && a.dueAt && a.dueAt.slice(0, 10) < today);
    if (ownerFilter !== "all") list = list.filter((a) => (a.ownerName ?? "Unassigned") === ownerFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((a) => a.subject.toLowerCase().includes(q) || a.ownerName?.toLowerCase().includes(q));
    }
    return list;
  }, [rows, tab, today, weekEnd, visibleKinds, statusFilter, ownerFilter, searchQuery]);

  const calDays = useMemo(() => getCalendarDays(calMonth.year, calMonth.month), [calMonth]);
  const actByDate = useMemo(() => {
    const map: Record<string, Activity[]> = {};
    for (const a of rows) {
      const d = (a.dueAt ?? a.createdAt).slice(0, 10);
      (map[d] ??= []).push(a);
    }
    return map;
  }, [rows]);

  const analytics = useMemo(() => {
    const data = allRows;
    if (!data.length) return null;

    const total = data.length;
    const completed = data.filter((a) => a.completedAt).length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    const overdue = data.filter((a) => !a.completedAt && a.dueAt && a.dueAt.slice(0, 10) < today);
    const overdueRate = total > 0 ? Math.round((overdue.length / total) * 100) : 0;
    const avgDaysOverdue = overdue.length > 0
      ? Math.round(overdue.reduce((sum, a) => {
          const due = new Date(a.dueAt!);
          const now = new Date(today);
          return sum + Math.max(0, (now.getTime() - due.getTime()) / 86400000);
        }, 0) / overdue.length)
      : 0;

    const byKind = (Object.keys(KIND_META) as ActivityKind[]).map((kind) => {
      const kindItems = data.filter((a) => a.kind === kind);
      const kindDone = kindItems.filter((a) => a.completedAt).length;
      return {
        kind,
        label: KIND_META[kind].label,
        total: kindItems.length,
        completed: kindDone,
        rate: kindItems.length > 0 ? Math.round((kindDone / kindItems.length) * 100) : 0,
        color: KIND_META[kind].chartColor,
      };
    });

    const weekMap: Record<string, number> = {};
    for (const a of data) {
      const w = weekKey((a.dueAt ?? a.createdAt).slice(0, 10));
      weekMap[w] = (weekMap[w] ?? 0) + 1;
    }
    const weeklyVolume = Object.entries(weekMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8)
      .map(([week, count]) => ({ week, count }));

    const ownerMap: Record<string, { name: string; total: number; completed: number }> = {};
    for (const a of data) {
      const name = a.ownerName || "Unassigned";
      if (!ownerMap[name]) ownerMap[name] = { name, total: 0, completed: 0 };
      ownerMap[name].total++;
      if (a.completedAt) ownerMap[name].completed++;
    }
    const topPerformers = Object.values(ownerMap)
      .sort((a, b) => b.completed - a.completed)
      .slice(0, 5);

    const completedWithTimes = data.filter((a) => a.completedAt && a.createdAt);
    const avgResponseHrs = completedWithTimes.length > 0
      ? Math.round(completedWithTimes.reduce((sum, a) => {
          return sum + (new Date(a.completedAt!).getTime() - new Date(a.createdAt).getTime()) / 3600000;
        }, 0) / completedWithTimes.length)
      : 0;

    return { total, completed, completionRate, overdueRate, avgDaysOverdue, byKind, weeklyVolume, topPerformers, avgResponseHrs };
  }, [allRows, today]);

  async function complete(id: string) {
    setCompleting(id);
    try {
      await api(`/activities/${id}/complete`, { method: "POST", body: JSON.stringify({ outcome: "completed" }) });
      toast.success("Activity completed");
      activities.reload();
      allActivities.reload();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setCompleting(null);
    }
  }

  const TABS: { key: ViewTab; label: string; count: number }[] = [
    { key: "today", label: "Today", count: rows.filter((a) => !a.completedAt && a.dueAt && a.dueAt.slice(0, 10) === today).length },
    { key: "upcoming", label: "Upcoming", count: rows.filter((a) => !a.completedAt && a.dueAt && a.dueAt.slice(0, 10) > today && a.dueAt.slice(0, 10) <= weekEnd).length },
    { key: "overdue", label: "Overdue", count: rows.filter((a) => !a.completedAt && a.dueAt && a.dueAt.slice(0, 10) < today).length },
    { key: "calendar", label: "Calendar", count: 0 },
    { key: "analysis", label: "Analysis", count: 0 },
  ];

  function prevMonth() {
    setCalMonth((p) => p.month === 0 ? { year: p.year - 1, month: 11 } : { year: p.year, month: p.month - 1 });
  }
  function nextMonth() {
    setCalMonth((p) => p.month === 11 ? { year: p.year + 1, month: 0 } : { year: p.year, month: p.month + 1 });
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Activities & Tasks"
        description="Calls, meetings, emails and tasks across all leads"
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => { activities.reload(); allActivities.reload(); }}>
              <RefreshCw className="size-3.5" />
            </Button>
            <Button size="sm" onClick={() => setLogOpen(true)}>
              <Plus className="size-3.5" /> Log Activity
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 pb-4">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                tab === t.key ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground hover:bg-surface-3",
              )}
            >
              {t.label}
              {t.count > 0 && <Badge variant="neutral" className="ml-1.5 text-[10px]">{t.count}</Badge>}
            </button>
          ))}
        </div>
        {tab !== "analysis" && <>
          <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search activities…" className="w-56" />
          <Select value={kindFilter} onValueChange={setKindFilter}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="call">Calls</SelectItem>
              <SelectItem value="meeting">Meetings</SelectItem>
              <SelectItem value="email">Emails</SelectItem>
              <SelectItem value="task">Tasks</SelectItem>
              <SelectItem value="note">Notes</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
          {owners.length > 1 && (
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All owners</SelectItem>
                {owners.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
                <Settings2 className="size-3.5" />
                Visible
                {visibleKinds.size < ALL_KINDS.length && <Badge variant="accent" className="text-[9px] px-1">{visibleKinds.size}</Badge>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-3" align="end">
              <p className="mb-2 text-xs font-semibold">Show these activity types</p>
              <div className="space-y-2">
                {ALL_KINDS.map((kind) => {
                  const meta = KIND_META[kind];
                  const Icon = meta.icon;
                  const checked = visibleKinds.has(kind);
                  return (
                    <label key={kind} className="flex items-center gap-2 text-xs cursor-pointer">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          const next = new Set(visibleKinds);
                          if (v) next.add(kind); else next.delete(kind);
                          if (next.size > 0) setVisibleKinds(next);
                        }}
                      />
                      <Icon className={cn("size-3.5", meta.color)} />
                      {meta.label}
                    </label>
                  );
                })}
              </div>
              <div className="mt-3 flex gap-2 border-t border-border pt-2">
                <Button size="sm" variant="ghost" className="text-[10px] h-6" onClick={() => setVisibleKinds(new Set(ALL_KINDS))}>Show all</Button>
              </div>
            </PopoverContent>
          </Popover>
          {(statusFilter !== "all" || ownerFilter !== "all" || searchQuery || visibleKinds.size < ALL_KINDS.length) && (
            <Button size="sm" variant="ghost" className="h-8 text-xs gap-1" onClick={() => { setStatusFilter("all"); setOwnerFilter("all"); setSearchQuery(""); setVisibleKinds(new Set(ALL_KINDS)); }}>
              <X className="size-3" /> Clear
            </Button>
          )}
        </>}
      </div>

      {tab !== "analysis" && tab !== "calendar" && rows.length > 0 && (
        <div className="flex items-center gap-2 px-6 py-2 text-xs text-muted-foreground">
          <Filter className="size-3" />
          Showing {filtered.length} of {rows.length} activities
        </div>
      )}

      {activities.error && (
        <p role="alert" className="mx-6 mt-3 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          {activities.error}
        </p>
      )}

      {tab === "analysis" ? (
        <div className="flex-1 overflow-auto px-6 py-4">
          {!analytics ? (
            <EmptyState icon={BarChart3} title="No activity data yet" description="Log activities to see follow-up effectiveness analysis" />
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <MetricCard label="Total activities" value={String(analytics.total)} />
                <MetricCard label="Completion rate" value={`${analytics.completionRate}%`} />
                <MetricCard label="Avg response time" value={analytics.avgResponseHrs < 24 ? `${analytics.avgResponseHrs}h` : `${Math.round(analytics.avgResponseHrs / 24)}d`} />
                <MetricCard label="Overdue rate" value={`${analytics.overdueRate}%`} />
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <section className="rounded-lg border border-border bg-surface p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <BarChart3 className="size-4 text-accent" />
                    <h3 className="text-[13px] font-semibold">Completion rate by type</h3>
                  </div>
                  <div className="space-y-3">
                    {analytics.byKind.map((k) => {
                      const Icon = KIND_META[k.kind as ActivityKind].icon;
                      return (
                        <div key={k.kind} className="flex items-center gap-3">
                          <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2", KIND_META[k.kind as ActivityKind].color)}>
                            <Icon className="size-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-medium">{k.label}</span>
                              <span className="text-muted-foreground">{k.completed}/{k.total} ({k.rate}%)</span>
                            </div>
                            <div className="mt-1 h-2 rounded-full bg-surface-3">
                              <div className="h-full rounded-full transition-all" style={{ width: `${k.rate}%`, backgroundColor: k.color }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="rounded-lg border border-border bg-surface p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="size-4 text-accent" />
                    <h3 className="text-[13px] font-semibold">Weekly activity volume</h3>
                  </div>
                  {analytics.weeklyVolume.length > 0 ? (
                    <div className="h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analytics.weeklyVolume} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                          <XAxis dataKey="week" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                          <Tooltip contentStyle={{ borderRadius: 8, borderColor: "var(--border)", background: "var(--surface)", fontSize: 12 }} />
                          <Bar dataKey="count" name="Activities" fill="var(--accent)" radius={[4, 4, 0, 0]} barSize={24} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="flex h-52 items-center justify-center text-xs text-muted-foreground">Not enough data</div>
                  )}
                </section>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <section className="rounded-lg border border-border bg-surface p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Users className="size-4 text-accent" />
                    <h3 className="text-[13px] font-semibold">Top performers</h3>
                  </div>
                  {analytics.topPerformers.length > 0 ? (
                    <div className="space-y-2">
                      {analytics.topPerformers.map((p, i) => (
                        <div key={p.name} className="flex items-center gap-3 rounded-lg bg-surface-2/50 p-2.5">
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[10px] font-bold text-accent">
                            {i + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium">{p.name}</p>
                            <p className="text-[10px] text-muted-foreground">{p.completed} completed of {p.total}</p>
                          </div>
                          <Badge variant={p.total > 0 && p.completed / p.total >= 0.8 ? "success" : "neutral"} className="text-[10px]">
                            {p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0}%
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">No performer data</div>
                  )}
                </section>

                <section className="rounded-lg border border-border bg-surface p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Clock className="size-4 text-warning" />
                    <h3 className="text-[13px] font-semibold">Follow-up health</h3>
                  </div>
                  <div className="space-y-4">
                    <div className="rounded-lg bg-surface-2/50 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">Avg time to complete</span>
                        <span className="text-sm font-semibold">
                          {analytics.avgResponseHrs < 24 ? `${analytics.avgResponseHrs} hours` : `${Math.round(analytics.avgResponseHrs / 24)} days`}
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">From creation to completion</p>
                    </div>
                    <div className="rounded-lg bg-surface-2/50 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">Overdue items</span>
                        <span className={cn("text-sm font-semibold", analytics.overdueRate > 20 ? "text-danger" : "text-foreground")}>
                          {analytics.overdueRate}%
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {analytics.avgDaysOverdue > 0 ? `Avg ${analytics.avgDaysOverdue} days overdue` : "No overdue items"}
                      </p>
                    </div>
                    <div className="rounded-lg bg-surface-2/50 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">Completion rate</span>
                        <span className={cn("text-sm font-semibold", analytics.completionRate >= 70 ? "text-success" : analytics.completionRate >= 40 ? "text-warning" : "text-danger")}>
                          {analytics.completionRate}%
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">{analytics.completed} of {analytics.total} activities completed</p>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          )}
        </div>
      ) : tab !== "calendar" ? (
        <div className="flex-1 overflow-auto px-6 py-4">
          {filtered.length === 0 ? (
            <EmptyState
              icon={CalendarCheck}
              title={tab === "today" ? "Nothing due today" : tab === "overdue" ? "No overdue tasks" : "Nothing upcoming"}
              description="Log activities against leads and contacts to see them here"
            />
          ) : (
            <div className="space-y-2">
              {filtered.map((a) => {
                const meta = KIND_META[a.kind];
                const Icon = meta.icon;
                return (
                  <div
                    key={a.id}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border border-border bg-surface p-3",
                      a.completedAt && "opacity-50",
                    )}
                  >
                    <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2", meta.color)}>
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{a.subject}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="neutral" className="text-[10px]">{meta.label}</Badge>
                        {a.ownerName && <span>{a.ownerName}</span>}
                        {a.dueAt && <span>Due {formatDateTime(a.dueAt)}</span>}
                      </div>
                    </div>
                    {!a.completedAt && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0"
                        disabled={completing === a.id}
                        onClick={() => complete(a.id)}
                      >
                        <CheckCircle2 className="size-4 text-success" />
                      </Button>
                    )}
                    {a.completedAt && (
                      <Badge variant="success" className="shrink-0 text-[10px]">Done</Badge>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-auto px-6 py-4">
          <div className="flex items-center justify-between pb-3">
            <Button size="sm" variant="ghost" onClick={prevMonth}><ChevronLeft className="size-4" /></Button>
            <h3 className="text-sm font-semibold">
              {new Date(calMonth.year, calMonth.month).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </h3>
            <Button size="sm" variant="ghost" onClick={nextMonth}><ChevronRight className="size-4" /></Button>
          </div>
          <div className="grid grid-cols-7 gap-px rounded-lg border border-border bg-border overflow-hidden">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="bg-surface-2 px-2 py-1.5 text-center text-[10px] font-semibold text-muted-foreground">{d}</div>
            ))}
            {calDays.map((d) => {
              const dayActs = actByDate[d.date] ?? [];
              return (
                <div
                  key={d.date}
                  className={cn(
                    "min-h-[80px] bg-surface p-1",
                    !d.inMonth && "bg-surface-2/50",
                    d.date === today && "ring-1 ring-inset ring-accent",
                  )}
                >
                  <span className={cn("text-[10px]", d.date === today ? "font-bold text-accent" : "text-muted-foreground")}>
                    {parseInt(d.date.slice(8))}
                  </span>
                  <div className="mt-0.5 space-y-0.5">
                    {dayActs.slice(0, 3).map((a) => {
                      const meta = KIND_META[a.kind];
                      return (
                        <div key={a.id} className={cn("truncate rounded px-1 py-0.5 text-[9px]", a.completedAt ? "bg-success/10 text-success" : "bg-accent/10 text-accent")}>
                          {meta.label}: {a.subject}
                        </div>
                      );
                    })}
                    {dayActs.length > 3 && (
                      <div className="text-[9px] text-muted-foreground">+{dayActs.length - 3} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ActivityForm
        open={logOpen}
        onOpenChange={setLogOpen}
        contactId=""
        onSaved={() => { activities.reload(); allActivities.reload(); }}
      />
    </div>
  );
}
