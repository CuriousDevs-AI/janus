"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { useHrOperationsStore, type HrHoliday } from "@/lib/stores/hr-operations-store";
import { canManageHr } from "@/lib/hr-people-access";
import { LeaveRequestForm } from "@/components/hr-people/leave";
import { entitlement, leaveBalance, leaveTypeLabels, leaveYear, paidLeaveTypes, stepLabel, type LeaveType } from "@/lib/hr-leave";
import { useHolidays } from "@/lib/hr-holidays";
import { HrEmpty, HrField, HrModal, HrPanel, HrStats, HrStatus, HrTable, hrCell, hrDate, hrInputClass, hrToday } from "@/components/hr-people/operations-ui";
import type { HrDemoRole, HrLeaveRequest } from "@/lib/types";

const applyHref = (date: string) => `/workspace/hr-people?view=leave-apply&workspace=hr-people&from=${date}`;
const covers = (request: HrLeaveRequest, date: string) => request.status !== "rejected" && request.from <= date && date <= request.to;

export function HrLeaveApplyView({ actorId }: { actorId: string }) {
  const params = useSearchParams();
  const { employees, leaveRequests, updateLeave } = useHrPeopleStore();
  const { settings, log } = useHrOperationsStore();
  const [version, setVersion] = React.useState(0);
  const from = params.get("from") ?? undefined;
  const type = (params.get("type") as LeaveType | null) ?? undefined;
  const actor = employees.find((item) => item.id === actorId);
  const today = hrToday();
  const mine = leaveRequests.filter((item) => item.employeeId === actorId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  if (!actor) return <HrPanel title="Apply for leave"><HrEmpty>This account is not linked to an employee record. Ask HR to link it.</HrEmpty></HrPanel>;
  return <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
    <HrPanel title="Apply for leave" description={from ? `Prefilled for ${hrDate(from)}. Change anything you need.` : "Choose the dates and tell your manager why."}>
      <div className="p-5"><LeaveRequestForm key={`${version}:${from ?? ""}:${type ?? ""}`} employeeId={actorId} initial={{ from, type }} onDone={() => setVersion((value) => value + 1)} /></div>
    </HrPanel>
    <div className="space-y-5">
      <HrPanel title="Your balance" description="Days left this leave year, after approved and pending requests.">
        <div className="grid grid-cols-3 gap-3 p-5">{paidLeaveTypes.map((item) => { const balance = leaveBalance(leaveRequests, actorId, item, settings, today); return <div key={item} className="border border-border p-3 text-center"><p className="text-xs text-muted-foreground">{leaveTypeLabels[item]}</p><p className="mt-1 text-xl font-semibold">{balance.remaining}</p><p className="text-[11px] text-muted-foreground">of {balance.total}</p></div>; })}</div>
        <p className="border-t border-border px-5 py-3 text-xs"><Link className="text-accent underline" href="/workspace/hr-people?view=leave-balances&workspace=hr-people">See full balances</Link></p>
      </HrPanel>
      <HrPanel title="My recent requests">{mine.length ? <ul className="divide-y divide-border text-sm">{mine.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3"><div><p className="font-medium">{leaveTypeLabels[item.type]} · {item.days} {item.days === 1 ? "day" : "days"}</p><p className="text-xs text-muted-foreground">{hrDate(item.from)}{item.to !== item.from ? ` – ${hrDate(item.to)}` : ""} · {stepLabel(item)}</p></div><div className="flex items-center gap-2"><HrStatus status={item.status} />{(item.status === "pending" || item.status === "needs_clarification") && <Button size="sm" variant="ghost" onClick={() => { updateLeave(item.id, "rejected", item.step); log({ recordId: item.id, actorId, action: "withdrawn", reason: "Withdrawn by the employee" }); toast.success("Request withdrawn"); }}>Withdraw</Button>}</div></li>)}</ul> : <HrEmpty>You haven&apos;t applied for leave yet.</HrEmpty>}</HrPanel>
    </div>
  </div>;
}

export function HrLeaveBalancesView({ actorId }: { actorId: string }) {
  const { employees, leaveRequests } = useHrPeopleStore();
  const settings = useHrOperationsStore((state) => state.settings);
  const today = hrToday();
  const actor = employees.find((item) => item.id === actorId);
  const year = leaveYear(today, settings.yearStart);
  const mine = leaveRequests.filter((item) => item.employeeId === actorId && item.from >= year.start && item.from <= year.end && item.status !== "rejected").sort((a, b) => b.from.localeCompare(a.from));
  if (!actor) return <HrPanel title="Leave balances"><HrEmpty>This account is not linked to an employee record.</HrEmpty></HrPanel>;
  const unpaid = mine.filter((item) => item.type === "unpaid" && item.status === "approved").reduce((sum, item) => sum + item.days, 0);
  return <div className="space-y-5">
    <HrStats items={[...paidLeaveTypes.map((type) => { const b = leaveBalance(leaveRequests, actorId, type, settings, today); return { label: `${leaveTypeLabels[type]} leave`, value: `${b.remaining} left`, hint: `${b.used} used · ${b.pending} pending · ${b.total} a year` }; }), { label: "Unpaid leave taken", value: `${unpaid} ${unpaid === 1 ? "day" : "days"}`, hint: "No yearly limit" }]} />
    <HrPanel title="Where your leave stands" description={`Leave year ${hrDate(year.start)} to ${hrDate(year.end)}. Weekly offs and company holidays are never counted.`}
      actions={<Button size="sm" asChild><Link href="/workspace/hr-people?view=leave-apply&workspace=hr-people"><Plus className="mr-1 size-3.5" />Apply for leave</Link></Button>}>
      <div className="grid gap-4 p-5 md:grid-cols-3">{paidLeaveTypes.map((type) => { const b = leaveBalance(leaveRequests, actorId, type, settings, today); const total = entitlement(type, settings); const usedPct = total ? Math.min(100, (b.used / total) * 100) : 0; const pendingPct = total ? Math.min(100 - usedPct, (b.pending / total) * 100) : 0; return <div key={type} className="space-y-3 border border-border p-4"><div className="flex items-baseline justify-between"><h3 className="text-sm font-semibold">{leaveTypeLabels[type]}</h3><span className="text-xs text-muted-foreground">{total} days a year</span></div><div className="flex h-2 overflow-hidden bg-surface-2" role="img" aria-label={`${leaveTypeLabels[type]}: ${b.used} used, ${b.pending} pending, ${b.remaining} available`}><div className="bg-accent" style={{ width: `${usedPct}%` }} /><div className="bg-warning/70" style={{ width: `${pendingPct}%` }} /></div><dl className="grid grid-cols-3 gap-2 text-center text-xs"><div><dt className="text-muted-foreground">Used</dt><dd className="text-base font-semibold">{b.used}</dd></div><div><dt className="text-muted-foreground">Pending</dt><dd className="text-base font-semibold">{b.pending}</dd></div><div><dt className="text-muted-foreground">Available</dt><dd className="text-base font-semibold text-success">{b.remaining}</dd></div></dl></div>; })}</div>
    </HrPanel>
    <HrPanel title="Leave this year" description="Approved and pending requests, newest first.">{mine.length ? <HrTable headings={["Type", "Dates", "Days", "Status"]}>{mine.map((item) => <tr key={item.id}><td className={hrCell}>{leaveTypeLabels[item.type]}</td><td className={hrCell}>{hrDate(item.from)}{item.to !== item.from ? ` – ${hrDate(item.to)}` : ""}</td><td className={hrCell}>{item.days}</td><td className={hrCell}><HrStatus status={item.status} /><p className="mt-1 text-[11px] text-muted-foreground">{stepLabel(item)}</p></td></tr>)}</HrTable> : <HrEmpty>No leave taken or requested this year.</HrEmpty>}</HrPanel>
  </div>;
}

export function HrHolidayCalendarView({ role, actorId }: { role: HrDemoRole; actorId: string }) {
  const holidays = useHolidays();
  const { leaveRequests } = useHrPeopleStore();
  const { addHoliday, removeHoliday } = useHrOperationsStore();
  const years = [...new Set([...holidays.map((item) => item.date.slice(0, 4)), hrToday().slice(0, 4)])].sort();
  const [year, setYear] = React.useState(hrToday().slice(0, 4));
  const [adding, setAdding] = React.useState(false);
  const hr = canManageHr(role);
  const today = hrToday();
  const inYear = holidays.filter((item) => item.date.startsWith(year));
  const months = Array.from({ length: 12 }, (_, month) => ({ month, items: inYear.filter((item) => Number(item.date.slice(5, 7)) === month + 1) }));
  const next = holidays.find((item) => item.date >= today);
  const mineFor = (date: string) => leaveRequests.find((item) => item.employeeId === actorId && covers(item, date));
  const weekday = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", { weekday: "short" });
  return <div className="space-y-5">
    <HrStats items={[{ label: "Company holidays", value: inYear.filter((item) => item.kind === "company").length, hint: `In ${year}` }, { label: "Optional holidays", value: inYear.filter((item) => item.kind === "optional").length, hint: "Take them as leave if you wish" }, { label: "Next holiday", value: next ? hrDate(next.date).replace(/ \d{4}$/, "") : "—", hint: next ? `${next.name} · ${weekday(next.date)}` : "None coming up" }]} />
    <HrPanel title="Holiday calendar" description="Sample list for the demo. HR can add or remove holidays." actions={<div className="flex gap-2"><select aria-label="Year" className={`${hrInputClass} w-auto`} value={year} onChange={(event) => setYear(event.target.value)}>{years.map((item) => <option key={item}>{item}</option>)}</select>{hr && <Button size="sm" onClick={() => setAdding(true)}><Plus className="mr-1 size-3.5" />Add holiday</Button>}</div>}>
      <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">{months.map(({ month, items }) => <section key={month} aria-label={new Date(2000, month, 1).toLocaleDateString("en-IN", { month: "long" })} className="border border-border">
        <h3 className="border-b border-border bg-surface-2 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{new Date(2000, month, 1).toLocaleDateString("en-IN", { month: "short" })} {year}</h3>
        {items.length ? <ul className="divide-y divide-border">{items.map((item) => { const leave = mineFor(item.date); const weekend = [0, 6].includes(new Date(`${item.date}T12:00:00`).getDay()); return <li key={item.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
          <div className="w-10 shrink-0 text-center"><p className="text-lg font-semibold leading-none">{item.date.slice(8)}</p><p className="text-[10px] text-muted-foreground">{weekday(item.date)}</p></div>
          <div className="min-w-0 flex-1"><p className="truncate font-medium">{item.name}</p><p className="text-[11px] text-muted-foreground">{item.kind === "company" ? "Company holiday" : "Optional holiday"}{weekend ? " · falls on a weekend" : ""}</p></div>
          {item.kind === "optional" && !weekend && (leave ? <span className="text-[11px] text-muted-foreground">{leave.status === "approved" ? "Approved" : "Applied"}</span> : item.date >= today ? <Button size="sm" variant="outline" asChild><Link href={applyHref(item.date)} aria-label={`Apply for leave on ${item.name}`}>Apply</Link></Button> : null)}
          {hr && <button type="button" aria-label={`Remove ${item.name}`} onClick={() => { removeHoliday(item.id); toast.success(`${item.name} removed`); }} className="text-muted-foreground hover:text-danger"><Trash2 className="size-4" /></button>}
        </li>; })}</ul> : <p className="px-4 py-6 text-center text-xs text-muted-foreground">No holidays</p>}
      </section>)}</div>
    </HrPanel>
    {adding && <AddHolidayDialog onClose={() => setAdding(false)} onAdd={(holiday) => { addHoliday(holiday); setYear(holiday.date.slice(0, 4)); setAdding(false); toast.success("Holiday added"); }} existing={holidays} />}
  </div>;
}

function AddHolidayDialog({ onAdd, onClose, existing }: { onAdd: (holiday: HrHoliday) => void; onClose: () => void; existing: HrHoliday[] }) {
  const [date, setDate] = React.useState("");
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<HrHoliday["kind"]>("company");
  const clash = existing.find((item) => item.date === date);
  const error = !date ? "Choose the date." : clash ? `${hrDate(date)} already has ${clash.name}.` : name.trim().length < 3 ? "Give the holiday a name." : "";
  return <HrModal open onOpenChange={(value) => !value && onClose()} title="Add a holiday" description="Company holidays aren't counted as leave. Optional holidays can be taken as leave.">
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (!error) onAdd({ id: `hol-${date}-${crypto.randomUUID().slice(0, 6)}`, date, name: name.trim(), kind }); }}>
      <div className="grid gap-4 sm:grid-cols-2"><HrField label="Date"><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded-none" /></HrField><HrField label="Type"><select className={hrInputClass} value={kind} onChange={(event) => setKind(event.target.value as HrHoliday["kind"])}><option value="company">Company holiday</option><option value="optional">Optional holiday</option></select></HrField></div>
      <HrField label="Name"><Input required maxLength={60} value={name} onChange={(event) => setName(event.target.value)} className="rounded-none" /></HrField>
      {error && (name !== "" || clash) && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={Boolean(error)}>Add holiday</Button></div>
    </form>
  </HrModal>;
}
