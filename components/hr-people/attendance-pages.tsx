"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { useHrOperationsStore, type HrRegularisation } from "@/lib/stores/hr-operations-store";
import { dayInfo, dayLabel, type DayInfo, type DayKind } from "@/lib/hr-attendance-days";
import { toMinutes } from "@/lib/hr-attendance";
import { useHolidays } from "@/lib/hr-holidays";
import { PunchCard } from "@/components/hr-people/punch-card";
import { HrEmpty, HrField, HrModal, HrPanel, HrStats, HrStatus, hrDate, hrToday } from "@/components/hr-people/operations-ui";

const heads = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const pad = (value: number) => String(value).padStart(2, "0");
const iso = (year: number, month: number, day: number) => `${year}-${pad(month + 1)}-${pad(day)}`;
const title = (year: number, month: number) => new Date(year, month, 1, 12).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
const tone: Record<DayKind, string> = { na: "bg-surface-2 text-muted-foreground", upcoming: "bg-surface text-muted-foreground", holiday: "bg-info-muted text-info", off: "bg-surface-2 text-muted-foreground", leave: "bg-accent-muted text-accent", present: "bg-success-muted text-success", late: "bg-warning-muted text-warning", incomplete: "bg-warning-muted text-warning", absent: "bg-danger/10 text-danger", gap: "bg-danger/10 text-danger" };
const short: Record<DayKind, string> = { na: "", upcoming: "", holiday: "Holiday", off: "Off", leave: "Leave", present: "Present", late: "Late", incomplete: "No out", absent: "Absent", gap: "Gap" };
const hoursText = (hours: number | null) => hours === null ? "—" : `${Math.floor(hours)}h ${pad(Math.round((hours % 1) * 60))}m`;

function useMonth(start?: string | null) {
  const today = hrToday();
  const first = start && /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : today;
  const [year, setYear] = React.useState(Number(first.slice(0, 4)));
  const [month, setMonth] = React.useState(Number(first.slice(5, 7)) - 1);
  const move = (delta: number) => { const next = new Date(year, month + delta, 1, 12); setYear(next.getFullYear()); setMonth(next.getMonth()); };
  const reset = () => { setYear(Number(today.slice(0, 4))); setMonth(Number(today.slice(5, 7)) - 1); };
  const length = new Date(year, month + 1, 0).getDate();
  const lead = (new Date(year, month, 1, 12).getDay() + 6) % 7;
  const cells: (number | null)[] = [...Array.from({ length: lead }, () => null), ...Array.from({ length }, (_, index) => index + 1)];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
  return { today, year, month, move, reset, length, weeks };
}

function useDays(actorId: string) {
  const { employees, attendance, leaveRequests } = useHrPeopleStore();
  const settings = useHrOperationsStore((state) => state.settings);
  const holidays = useHolidays();
  const actor = employees.find((item) => item.id === actorId);
  const records = React.useMemo(() => attendance.filter((item) => item.employeeId === actorId), [attendance, actorId]);
  const leaves = React.useMemo(() => leaveRequests.filter((item) => item.employeeId === actorId), [leaveRequests, actorId]);
  const info = React.useCallback((date: string) => dayInfo(date, { today: hrToday(), workWeek: settings.workWeek, holidays, leaves, records, joiningDate: actor?.joiningDate ?? "1900-01-01" }), [settings.workWeek, holidays, leaves, records, actor?.joiningDate]);
  return { actor, info, settings };
}

export function HrAttendanceInfoView({ actorId }: { actorId: string }) {
  const { today, year, month, move, reset, length, weeks } = useMonth();
  const { actor, info } = useDays(actorId);
  const [open, setOpen] = React.useState<DayInfo | null>(null);
  if (!actor) return <HrPanel title="Attendance info"><HrEmpty>This account is not linked to an employee record. Ask HR to link it.</HrEmpty></HrPanel>;
  const days = Array.from({ length }, (_, index) => info(iso(year, month, index + 1)));
  const count = (...kinds: DayKind[]) => days.filter((item) => kinds.includes(item.kind)).length;
  const worked = days.filter((item) => item.hours !== null);
  const avg = worked.length ? worked.reduce((sum, item) => sum + (item.hours ?? 0), 0) / worked.length : null;
  const overtime = days.reduce((sum, item) => sum + (item.record?.overtimeHours ?? 0), 0);
  return <div className="space-y-5">
    <PunchCard actorId={actorId} />
    <HrStats items={[{ label: "Present", value: count("present", "late", "incomplete"), hint: `${count("late")} late` }, { label: "Gap or absent days", value: count("gap", "absent", "incomplete"), hint: "May need regularising" }, { label: "On leave", value: count("leave"), hint: "Approved leave" }, { label: "Average hours", value: hoursText(avg), hint: overtime ? `${overtime}h overtime` : "On days with both punches" }]} />
    <HrPanel title="My attendance" description="Select a day for details. Days marked Gap or Absent can be corrected." actions={<div className="flex items-center gap-2"><Button size="icon" variant="outline" aria-label="Previous month" onClick={() => move(-1)}><ChevronLeft className="size-4" /></Button><span className="min-w-36 text-center text-sm font-medium" aria-live="polite">{title(year, month)}</span><Button size="icon" variant="outline" aria-label="Next month" onClick={() => move(1)}><ChevronRight className="size-4" /></Button><Button size="sm" variant="outline" onClick={reset}>Today</Button></div>}>
      <div className="flex flex-wrap gap-3 border-b border-border px-5 py-2 text-[11px] text-muted-foreground">{(["present", "late", "incomplete", "absent", "gap", "leave", "holiday", "off"] as DayKind[]).map((kind) => <span key={kind} className="flex items-center gap-1.5"><i className={`size-2.5 ${tone[kind].split(" ")[0]} border border-border`} />{dayLabel(kind)}</span>)}</div>
      <div className="overflow-x-auto p-3"><table className="w-full min-w-[620px] table-fixed border-separate border-spacing-1 text-xs"><caption className="sr-only">Attendance for {title(year, month)}</caption>
        <thead><tr>{heads.map((head) => <th key={head} scope="col" className="p-1 text-center font-semibold text-muted-foreground">{head}</th>)}</tr></thead>
        <tbody>{weeks.map((week, row) => <tr key={row}>{week.map((day, column) => {
          if (!day) return <td key={column} className="h-20" />;
          const item = days[day - 1];
          return <td key={column} className={`h-20 border border-border align-top p-1 ${item.date === today ? "ring-2 ring-accent" : ""}`}>
            <button type="button" onClick={() => setOpen(item)} aria-label={`${hrDate(item.date)}: ${item.label}${item.holiday ? `, ${item.holiday.name}` : ""}`} className={`flex h-full w-full flex-col items-start justify-between p-1 text-left ${tone[item.kind]}`}>
              <span className="font-medium">{day}</span>
              <span className="w-full truncate text-[10px] leading-tight">{short[item.kind]}{item.holiday ? ` · ${item.holiday.name}` : ""}{item.record?.checkIn ? <><br />{item.record.checkIn}{item.record.checkOut ? `–${item.record.checkOut}` : ""}</> : null}</span>
            </button></td>;
        })}</tr>)}</tbody></table></div>
    </HrPanel>
    {open && <HrModal open onOpenChange={(value) => !value && setOpen(null)} title={hrDate(open.date)} description={`${new Date(`${open.date}T12:00:00`).toLocaleDateString("en-IN", { weekday: "long" })} · ${open.label}`}>
      <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm"><dt className="text-muted-foreground">Status</dt><dd><HrStatus status={open.kind === "present" ? "present" : open.kind === "absent" || open.kind === "gap" ? "absent" : open.kind === "late" || open.kind === "incomplete" ? "late" : open.kind === "leave" ? "on_leave" : "info"} /></dd>
        <dt className="text-muted-foreground">Shift</dt><dd>{open.record?.shift ?? "—"}</dd><dt className="text-muted-foreground">Check in</dt><dd>{open.record?.checkIn ?? "—"}</dd><dt className="text-muted-foreground">Check out</dt><dd>{open.record?.checkOut ?? "—"}</dd><dt className="text-muted-foreground">Hours worked</dt><dd>{hoursText(open.hours)}</dd>{open.record?.overtimeHours ? <><dt className="text-muted-foreground">Overtime</dt><dd>{open.record.overtimeHours}h</dd></> : null}{open.holiday && <><dt className="text-muted-foreground">Holiday</dt><dd>{open.holiday.name}</dd></>}{open.leave && <><dt className="text-muted-foreground">Leave</dt><dd>{open.leave.type} · {hrDate(open.leave.from)}{open.leave.to !== open.leave.from ? ` – ${hrDate(open.leave.to)}` : ""}</dd></>}{open.record?.anomaly && <><dt className="text-muted-foreground">Note</dt><dd>{open.record.anomaly}</dd></>}</dl>
      {open.needsFix && open.date >= oldest() && <p className="mt-4 text-sm"><a className="text-accent underline" href={`/workspace/hr-people?view=my-regularization&workspace=hr-people&date=${open.date}`}>Correct this day</a></p>}
    </HrModal>}
  </div>;
}
const oldest = () => { const date = new Date(`${hrToday()}T12:00:00`); date.setDate(date.getDate() - 30); return date.toLocaleDateString("en-CA"); };

export function HrRegularizationView({ actorId }: { actorId: string }) {
  const params = useSearchParams();
  const { regularisations, addRegularisation, withdrawRegularisation, log } = useHrOperationsStore();
  const preselect = params.get("date");
  const { today, year, month, move, reset, length, weeks } = useMonth(preselect);
  const { actor, info, settings } = useDays(actorId);
  const [tab, setTab] = React.useState<"apply" | "pending" | "history">("apply");
  const [kind, setKind] = React.useState<"regularisation" | "permission">("regularisation");
  const [selected, setSelected] = React.useState<string[]>(preselect && preselect <= today ? [preselect] : []);
  const [times, setTimes] = React.useState<Record<string, { in: string; out: string }>>({});
  const [from, setFrom] = React.useState("10:00");
  const [to, setTo] = React.useState("11:00");
  const [reason, setReason] = React.useState("");
  const min = oldest();
  const mine = regularisations.filter((item) => item.employeeId === actorId);
  const pending = mine.filter((item) => item.status === "pending");
  const history = mine.filter((item) => item.status !== "pending");
  if (!actor) return <HrPanel title="Regularization & permission"><HrEmpty>This account is not linked to an employee record.</HrEmpty></HrPanel>;

  const days = Array.from({ length }, (_, index) => info(iso(year, month, index + 1)));
  const eligible = (item: DayInfo) => item.date <= today && item.date >= min && item.date >= actor.joiningDate && (kind === "regularisation" ? item.kind !== "holiday" && item.kind !== "off" || Boolean(item.record) : item.kind !== "holiday" && item.kind !== "off" && item.kind !== "leave");
  const problems = days.filter((item) => item.needsFix && item.date <= today && item.date >= min);
  const toggle = (date: string) => setSelected((current) => current.includes(date) ? current.filter((item) => item !== date) : [...current, date].sort());
  const timesFor = (date: string) => times[date] ?? { in: info(date).record?.checkIn ?? settings.shiftStart, out: info(date).record?.checkOut ?? settings.shiftEnd };
  const clash = selected.filter((date) => pending.some((item) => item.date === date && (item.kind ?? "regularisation") === kind));
  const error = !selected.length ? "Select at least one day on the calendar." : clash.length ? `You already have a pending ${kind === "permission" ? "permission" : "correction"} for ${clash.map(hrDate).join(", ")}.` : kind === "regularisation" && selected.some((date) => { const t = timesFor(date); return !t.in || (t.out && toMinutes(t.out) <= toMinutes(t.in)); }) ? "Each day needs a check-in time, and check-out must be after check-in." : kind === "permission" && (!from || !to || toMinutes(to) <= toMinutes(from)) ? "The end time must be after the start time." : kind === "permission" && toMinutes(to) - toMinutes(from) > 240 ? "A permission can be 4 hours at most. Use leave for longer." : reason.trim().length < 10 ? "Explain what happened (at least 10 characters)." : "";
  const showError = Boolean(error) && selected.length > 0 && (reason.length > 0 || !error.startsWith("Explain"));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (error) return;
    selected.forEach((date) => {
      const t = timesFor(date);
      const request: HrRegularisation = { id: `reg-${crypto.randomUUID()}`, employeeId: actorId, date, kind, checkIn: kind === "regularisation" ? t.in : null, checkOut: kind === "regularisation" ? t.out || null : null, fromTime: kind === "permission" ? from : undefined, toTime: kind === "permission" ? to : undefined, reason: reason.trim(), status: "pending", requestedAt: new Date().toISOString() };
      addRegularisation(request);
      log({ recordId: request.id, actorId, action: kind === "permission" ? "permission_requested" : "regularisation_requested", reason: request.reason });
    });
    toast.success(`${selected.length} ${selected.length === 1 ? "request" : "requests"} sent for approval`);
    setSelected([]); setReason(""); setTab("pending");
  }

  return <div className="space-y-5">
    <div role="tablist" aria-label="Regularization and permission" className="flex w-fit gap-1 border border-border bg-surface-2 p-1">{([["apply", "Apply"], ["pending", `Pending${pending.length ? ` (${pending.length})` : ""}`], ["history", "History"]] as const).map(([key, label]) => <button key={key} id={`reg-tab-${key}`} role="tab" aria-selected={tab === key} aria-controls="reg-panel" onClick={() => setTab(key)} className={`px-5 py-2 text-sm ${tab === key ? "bg-accent text-white" : "text-muted-foreground"}`}>{label}</button>)}</div>
    <div id="reg-panel" role="tabpanel" aria-labelledby={`reg-tab-${tab}`}>
      {tab === "apply" && <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        <HrPanel title="Pick days" actions={<div className="flex items-center gap-1"><Button size="icon" variant="ghost" aria-label="Previous month" onClick={() => move(-1)}><ChevronLeft className="size-4" /></Button><span className="text-sm font-medium" aria-live="polite">{title(year, month)}</span><Button size="icon" variant="ghost" aria-label="Next month" onClick={() => move(1)}><ChevronRight className="size-4" /></Button></div>}>
          <div className="p-3"><table className="w-full table-fixed border-separate border-spacing-0.5 text-xs"><caption className="sr-only">Choose days for {title(year, month)}</caption><thead><tr>{heads.map((head) => <th key={head} scope="col" className="p-1 text-center font-medium text-muted-foreground">{head[0]}</th>)}</tr></thead>
            <tbody>{weeks.map((week, row) => <tr key={row}>{week.map((day, column) => {
              if (!day) return <td key={column} />;
              const item = days[day - 1]; const ok = eligible(item); const on = selected.includes(item.date);
              return <td key={column} className="text-center"><button type="button" disabled={!ok} aria-pressed={on} aria-label={`${hrDate(item.date)}, ${item.label}${item.needsFix ? ", needs correction" : ""}`} onClick={() => toggle(item.date)} className={`relative h-9 w-full text-sm ${on ? "bg-accent text-white" : ok ? "hover:bg-surface-2" : "text-muted-foreground/50"} ${item.date === today ? "font-semibold underline decoration-accent decoration-2 underline-offset-4" : ""}`}>{day}{item.needsFix && item.date <= today && !on && <i aria-hidden className="absolute right-1 top-1 size-1.5 rounded-full bg-danger" />}</button></td>;
            })}</tr>)}</tbody></table>
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3"><p className={`text-xs ${problems.length ? "text-danger" : "text-muted-foreground"}`}>{problems.length} gap {problems.length === 1 ? "day" : "days"}</p><div className="flex gap-2"><Button size="sm" variant="ghost" onClick={reset}>Today</Button><Button size="sm" variant="outline" disabled={!problems.length} onClick={() => setSelected([...new Set([...selected, ...problems.map((item) => item.date)])].sort())}>Quick add</Button></div></div></div>
        </HrPanel>
        <HrPanel title="Your request" description="Select days on the calendar, then say what happened. Your manager approves it.">
          <form className="space-y-4 p-5" onSubmit={submit}>
            <fieldset className="flex flex-wrap gap-4 text-sm"><legend className="sr-only">Request type</legend>{([["regularisation", "Regularization (missed or wrong punch)"], ["permission", "Permission (short time away)"]] as const).map(([value, label]) => <label key={value} className="flex items-center gap-2"><input type="radio" name="kind" checked={kind === value} onChange={() => { setKind(value); setSelected([]); }} />{label}</label>)}</fieldset>
            {selected.length === 0 ? <p className="border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Get going! Select date(s) to apply for {kind === "permission" ? "permission" : "regularization"}.</p> : kind === "regularisation" ? <ul className="divide-y divide-border border border-border">{selected.map((date) => { const t = timesFor(date); const day = info(date); return <li key={date} className="grid items-end gap-3 px-3 py-3 sm:grid-cols-[1fr_130px_130px_auto]"><div><p className="text-sm font-medium">{hrDate(date)}</p><p className="text-xs text-muted-foreground">{day.label}{day.record?.checkIn ? ` · ${day.record.checkIn}–${day.record.checkOut ?? "?"}` : ""}</p></div><HrField label="Check in"><Input type="time" value={t.in} onChange={(event) => setTimes({ ...times, [date]: { ...t, in: event.target.value } })} className="rounded-none" /></HrField><HrField label="Check out"><Input type="time" value={t.out} onChange={(event) => setTimes({ ...times, [date]: { ...t, out: event.target.value } })} className="rounded-none" /></HrField><Button type="button" size="sm" variant="ghost" aria-label={`Remove ${hrDate(date)}`} onClick={() => toggle(date)}>Remove</Button></li>; })}</ul> : <div className="space-y-3"><p className="text-sm">{selected.map(hrDate).join(", ")}</p><div className="grid gap-4 sm:grid-cols-2"><HrField label="From"><Input type="time" value={from} onChange={(event) => setFrom(event.target.value)} className="rounded-none" /></HrField><HrField label="To"><Input type="time" value={to} onChange={(event) => setTo(event.target.value)} className="rounded-none" /></HrField></div></div>}
            <HrField label="Reason"><Textarea required maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} className="rounded-none" placeholder={kind === "permission" ? "e.g. Bank visit for account verification" : "e.g. Phone battery died, forgot to punch out"} /></HrField>
            {showError && <p role="alert" className="text-sm text-danger">{error}</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={!selected.length} onClick={() => setSelected([])}>Clear</Button><Button disabled={Boolean(error)}>Send for approval</Button></div>
          </form>
        </HrPanel>
      </div>}
      {tab === "pending" && <HrPanel title="Pending requests" description="Waiting for your manager.">{pending.length ? <ul className="divide-y divide-border text-sm">{pending.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"><div><p className="font-medium">{hrDate(item.date)} · {item.kind === "permission" ? `Permission ${item.fromTime}–${item.toTime}` : `Correction ${item.checkIn ?? "—"}–${item.checkOut ?? "—"}`}</p><p className="text-xs text-muted-foreground">{item.reason}</p></div><Button size="sm" variant="ghost" onClick={() => { withdrawRegularisation(item.id); log({ recordId: item.id, actorId, action: "withdrawn", reason: "Withdrawn by the employee" }); toast.success("Request withdrawn"); }}>Withdraw</Button></li>)}</ul> : <HrEmpty>Nothing is waiting. Requests you send appear here until they&apos;re decided.</HrEmpty>}</HrPanel>}
      {tab === "history" && <HrPanel title="History" description="Decided requests, newest first.">{history.length ? <ul className="divide-y divide-border text-sm">{history.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"><div><p className="font-medium">{hrDate(item.date)} · {item.kind === "permission" ? `Permission ${item.fromTime}–${item.toTime}` : `Correction ${item.checkIn ?? "—"}–${item.checkOut ?? "—"}`}</p><p className="text-xs text-muted-foreground">{item.reason}{item.decisionReason ? ` · Decision: ${item.decisionReason}` : ""}</p></div><HrStatus status={item.status} /></li>)}</ul> : <HrEmpty>No decided requests yet.</HrEmpty>}</HrPanel>}
    </div>
  </div>;
}
