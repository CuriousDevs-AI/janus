"use client";

import { useMemo, useState } from "react";
import {
  CalendarCheck, Phone, Video, Mail, ClipboardList,
  CheckCircle2, RefreshCw, Plus, ChevronLeft, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { useSession } from "@/components/auth/session-provider";
import type { Activity, ActivityKind } from "@/lib/api/types";
import { ActivityForm } from "@/components/crm/activity-form";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDateTime, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const KIND_META: Record<ActivityKind, { label: string; icon: typeof Phone; color: string }> = {
  call: { label: "Call", icon: Phone, color: "text-info" },
  meeting: { label: "Meeting", icon: Video, color: "text-accent" },
  email: { label: "Email", icon: Mail, color: "text-warning" },
  task: { label: "Task", icon: ClipboardList, color: "text-success" },
};

type ViewTab = "today" | "upcoming" | "overdue" | "calendar";

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

export default function ActivitiesPage() {
  useSession();
  const [tab, setTab] = useState<ViewTab>("today");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [logOpen, setLogOpen] = useState(false);
  const [completing, setCompleting] = useState<string | null>(null);

  const today = todayIST();
  const weekEnd = addDays(today, 7);
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const activities = useApi<Activity[]>(
    `/activities?limit=200${kindFilter !== "all" ? `&kind=${kindFilter}` : ""}`,
  );
  const rows = useMemo(() => activities.data ?? [], [activities.data]);

  const filtered = useMemo(() => {
    if (tab === "today") return rows.filter((a) => !a.completedAt && a.dueAt && a.dueAt.slice(0, 10) === today);
    if (tab === "upcoming") return rows.filter((a) => !a.completedAt && a.dueAt && a.dueAt.slice(0, 10) > today && a.dueAt.slice(0, 10) <= weekEnd);
    if (tab === "overdue") return rows.filter((a) => !a.completedAt && a.dueAt && a.dueAt.slice(0, 10) < today);
    return rows;
  }, [rows, tab, today, weekEnd]);

  const calDays = useMemo(() => getCalendarDays(calMonth.year, calMonth.month), [calMonth]);
  const actByDate = useMemo(() => {
    const map: Record<string, Activity[]> = {};
    for (const a of rows) {
      const d = (a.dueAt ?? a.createdAt).slice(0, 10);
      (map[d] ??= []).push(a);
    }
    return map;
  }, [rows]);

  async function complete(id: string) {
    setCompleting(id);
    try {
      await api(`/activities/${id}/complete`, { method: "POST", body: JSON.stringify({ outcome: "completed" }) });
      toast.success("Activity completed");
      activities.reload();
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
            <Button size="sm" variant="secondary" onClick={() => activities.reload()}>
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
        <Select value={kindFilter} onValueChange={setKindFilter}>
          <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="call">Calls</SelectItem>
            <SelectItem value="meeting">Meetings</SelectItem>
            <SelectItem value="email">Emails</SelectItem>
            <SelectItem value="task">Tasks</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {activities.error && (
        <p role="alert" className="mx-6 mt-3 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          {activities.error}
        </p>
      )}

      {tab !== "calendar" ? (
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
        onSaved={() => activities.reload()}
      />
    </div>
  );
}
