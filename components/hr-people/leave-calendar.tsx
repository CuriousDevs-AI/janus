"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { useHrOperationsStore } from "@/lib/stores/hr-operations-store";
import { canManageHr } from "@/lib/hr-people-access";
import { useHolidays } from "@/lib/hr-holidays";
import { isTeamOf, isWorkingDay, leaveBalance, leaveTypeLabels, paidLeaveTypes, stepLabel, workingDays } from "@/lib/hr-leave";
import { HrEmpty, HrModal, HrPanel, HrStats, HrStatus, hrDate, hrInputClass, hrToday } from "@/components/hr-people/operations-ui";
import type { HrDemoRole, HrLeaveRequest } from "@/lib/types";

const heads = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const pad = (value: number) => String(value).padStart(2, "0");
const iso = (year: number, month: number, day: number) => `${year}-${pad(month + 1)}-${pad(day)}`;
const monthTitle = (year: number, month: number) => new Date(year, month, 1, 12).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
const active = (request: HrLeaveRequest) => request.status !== "rejected";
const covers = (request: HrLeaveRequest, date: string) => request.from <= date && date <= request.to;

export function HrLeaveCalendarView({ role, actorId }: { role: HrDemoRole; actorId: string }) {
  const { employees, leaveRequests } = useHrPeopleStore();
  const settings = useHrOperationsStore((state) => state.settings);
  const holidays = useHolidays();
  const closed = React.useMemo(() => new Set(holidays.filter((item) => item.kind === "company").map((item) => item.date)), [holidays]);
  const today = hrToday();
  const [year, setYear] = React.useState(Number(today.slice(0, 4)));
  const [month, setMonth] = React.useState(Number(today.slice(5, 7)) - 1);
  const [department, setDepartment] = React.useState("all");
  const [openDay, setOpenDay] = React.useState<string | null>(null);
  const wide = canManageHr(role) || role === "payroll_admin";
  const actor = employees.find((item) => item.id === actorId);
  const scope = employees.filter((item) => item.status !== "archived" && (wide ? true : role === "reporting_manager" ? isTeamOf(item, actorId) : item.id === actorId) && (department === "all" || item.department === department));
  const ids = new Set(scope.map((item) => item.id));
  const visible = leaveRequests.filter((item) => ids.has(item.employeeId) && active(item));
  const first = new Date(year, month, 1, 12);
  const lead = (first.getDay() + 6) % 7; // Monday first
  const length = new Date(year, month + 1, 0).getDate();
  const monthStart = iso(year, month, 1);
  const monthEnd = iso(year, month, length);
  const cells: (number | null)[] = [...Array.from({ length: lead }, () => null), ...Array.from({ length: length }, (_, index) => index + 1)];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
  const inMonth = visible.filter((item) => item.from <= monthEnd && item.to >= monthStart);
  const people = new Set(inMonth.map((item) => item.employeeId)).size;
  const leaveDays = inMonth.filter((item) => item.status === "approved").reduce((sum, item) => sum + workingDays(item.from < monthStart ? monthStart : item.from, item.to > monthEnd ? monthEnd : item.to, settings.workWeek, closed), 0);
  const busiest = Array.from({ length }, (_, index) => { const date = iso(year, month, index + 1); return { date, count: new Set(visible.filter((item) => covers(item, date) && isWorkingDay(date, settings.workWeek) && !closed.has(date)).map((item) => item.employeeId)).size }; }).sort((a, b) => b.count - a.count || a.date.localeCompare(b.date))[0];
  const upcoming = visible.filter((item) => item.to >= today).sort((a, b) => a.from.localeCompare(b.from)).slice(0, 6);
  const dayRequests = openDay ? visible.filter((item) => covers(item, openDay)) : [];

  function move(delta: number) {
    const next = new Date(year, month + delta, 1, 12);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  }

  return <div className="space-y-5">
    <HrStats items={[{ label: "People on leave", value: people, hint: monthTitle(year, month) }, { label: "Approved leave days", value: leaveDays, hint: "Working days only" }, { label: "Pending requests", value: inMonth.filter((item) => item.status !== "approved").length, hint: "Pending or in clarification" }, { label: "Busiest day", value: busiest && busiest.count ? `${busiest.count} ${busiest.count === 1 ? "person" : "people"}` : "—", hint: busiest && busiest.count ? hrDate(busiest.date) : "Nobody is off this month" }]} />
    <HrPanel title={wide ? "Leave calendar · everyone" : role === "reporting_manager" ? "Leave calendar · my team" : "My leave calendar"} description="Approved and pending leave. Weekly offs follow HR Settings. Select a day with leave for details." actions={<div className="flex flex-wrap items-center gap-2">
      {wide && <select aria-label="Department" className={`${hrInputClass} w-auto`} value={department} onChange={(event) => setDepartment(event.target.value)}><option value="all">All departments</option>{[...new Set(employees.map((item) => item.department))].map((item) => <option key={item}>{item}</option>)}</select>}
      <Button size="icon" variant="outline" aria-label="Previous month" onClick={() => move(-1)}><ChevronLeft className="size-4" /></Button>
      <span className="min-w-36 text-center text-sm font-medium" aria-live="polite">{monthTitle(year, month)}</span>
      <Button size="icon" variant="outline" aria-label="Next month" onClick={() => move(1)}><ChevronRight className="size-4" /></Button>
      <Button size="sm" variant="outline" onClick={() => { setYear(Number(today.slice(0, 4))); setMonth(Number(today.slice(5, 7)) - 1); }}>Today</Button>
    </div>}>
      <div className="flex flex-wrap gap-4 border-b border-border px-5 py-2 text-[11px] text-muted-foreground"><span className="flex items-center gap-1.5"><i className="size-2.5 bg-success" />Approved</span><span className="flex items-center gap-1.5"><i className="size-2.5 bg-warning" />Pending</span><span className="flex items-center gap-1.5"><i className="size-2.5 border border-border bg-surface-2" />Weekly off or company holiday</span><span className="flex items-center gap-1.5"><i className="size-2.5 bg-info-muted" />Holiday name</span><span className="flex items-center gap-1.5"><i className="size-2.5 ring-2 ring-accent" />Today</span></div>
      <div className="overflow-x-auto p-3"><table className="w-full min-w-[620px] table-fixed border-separate border-spacing-1 text-xs"><caption className="sr-only">Leave calendar for {monthTitle(year, month)}</caption>
        <thead><tr>{heads.map((head) => <th key={head} scope="col" className="p-1 text-center font-semibold text-muted-foreground">{head}</th>)}</tr></thead>
        <tbody>{weeks.map((week, row) => <tr key={row}>{week.map((day, column) => {
          if (!day) return <td key={column} className="h-20" />;
          const date = iso(year, month, day);
          const here = visible.filter((item) => covers(item, date));
          const holiday = holidays.find((item) => item.date === date);
          const off = !isWorkingDay(date, settings.workWeek) || closed.has(date);
          const isToday = date === today;
          return <td key={column} className={`h-20 align-top border p-1 ${off ? "border-border bg-surface-2" : "border-border bg-surface"} ${isToday ? "ring-2 ring-accent" : ""}`}>
            <div className="flex items-start justify-between"><span className={`font-medium ${off ? "text-muted-foreground" : ""}`}>{day}</span>{here.length > 0 && <button type="button" onClick={() => setOpenDay(date)} className="text-[10px] text-accent hover:underline" aria-label={`${here.length} on leave on ${hrDate(date)}. Open details`}>{here.length > 3 ? `+${here.length - 3}` : "View"}</button>}</div>
            {holiday && <span className="mt-1 block truncate bg-info-muted px-1 text-[10px] text-info" title={`${holiday.name} · ${holiday.kind === "company" ? "Company holiday" : "Optional holiday"}`}>{holiday.name}</span>}<div className="mt-1 space-y-0.5">{here.slice(0, holiday ? 2 : 3).map((item) => <button type="button" key={item.id} onClick={() => setOpenDay(date)} title={`${item.employeeName} · ${leaveTypeLabels[item.type]} · ${stepLabel(item)}`} className={`block w-full truncate px-1 text-left text-[10px] ${item.status === "approved" ? "bg-success-muted text-success" : "bg-warning-muted text-warning"}`}>{item.employeeName.split(" ")[0]}</button>)}</div>
          </td>;
        })}</tr>)}</tbody></table></div>
    </HrPanel>
    <div className="grid gap-5 lg:grid-cols-2">
      <HrPanel title="Upcoming leave" description="Next requests in this view, soonest first.">{upcoming.length ? <ul className="divide-y divide-border text-sm">{upcoming.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3"><div><p className="font-medium">{item.employeeName} · {leaveTypeLabels[item.type]}</p><p className="text-xs text-muted-foreground">{hrDate(item.from)}{item.to !== item.from ? ` – ${hrDate(item.to)}` : ""} · {item.days} {item.days === 1 ? "day" : "days"}</p></div><HrStatus status={item.status} /></li>)}</ul> : <HrEmpty>No upcoming leave.</HrEmpty>}</HrPanel>
      {actor && <HrPanel title="My leave balance" description="Days left this leave year after approved and pending requests.">
        <div className="grid gap-3 p-5 sm:grid-cols-3">{paidLeaveTypes.map((type) => { const balance = leaveBalance(leaveRequests, actor.id, type, settings, today); return <div key={type} className="border border-border p-3"><p className="text-xs text-muted-foreground">{leaveTypeLabels[type]}</p><p className="mt-1 text-xl font-semibold">{balance.remaining}<span className="text-xs font-normal text-muted-foreground"> / {balance.total}</span></p></div>; })}</div>
      </HrPanel>}
    </div>
    {openDay && <HrModal open onOpenChange={(value) => !value && setOpenDay(null)} title={hrDate(openDay)} description={`${dayRequests.length} on leave${isWorkingDay(openDay, settings.workWeek) ? "" : " · weekly off"}`}>
      {dayRequests.length ? <ul className="divide-y divide-border border border-border text-sm">{dayRequests.map((item) => <li key={item.id} className="space-y-1 px-4 py-3"><div className="flex items-center justify-between gap-2"><p className="font-medium">{item.employeeName}</p><HrStatus status={item.status} /></div><p className="text-xs text-muted-foreground">{leaveTypeLabels[item.type]} · {hrDate(item.from)}{item.to !== item.from ? ` – ${hrDate(item.to)}` : ""} · {item.days} {item.days === 1 ? "day" : "days"} · {stepLabel(item)}</p><p className="text-xs">{item.reason}</p></li>)}</ul> : <HrEmpty>Nobody is on leave this day.</HrEmpty>}
    </HrModal>}
  </div>;
}
