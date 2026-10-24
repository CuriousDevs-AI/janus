"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { useHrOperationsStore, type HrRegularisation } from "@/lib/stores/hr-operations-store";
import { canManageHr } from "@/lib/hr-people-access";
import { classify, shiftLabel, toMinutes } from "@/lib/hr-attendance";
import { isTeamOf } from "@/lib/hr-leave";
import { PunchCard } from "@/components/hr-people/punch-card";
import { HrEmpty, HrField, HrModal, HrPanel, HrStats, HrStatus, HrTable, hrCell, hrDate, hrInputClass, hrToday } from "@/components/hr-people/operations-ui";
import type { HrAttendanceRecord, HrDemoRole } from "@/lib/types";

const when = (value: string) => new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const dayName = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", { weekday: "short" });
const statusLabel: Record<HrAttendanceRecord["status"], string> = { present: "present", late: "late", absent: "absent", on_leave: "on_leave", holiday: "holiday" };

export function HrAttendanceView({ role, actorId }: { role: HrDemoRole; actorId: string }) {
  const { employees, attendance, addAttendance, updateAttendance } = useHrPeopleStore();
  const { settings, regularisations, addRegularisation, decideRegularisation, log } = useHrOperationsStore();
  const today = hrToday();
  const dates = [...new Set([today, ...attendance.map((item) => item.date)])].sort().reverse();
  const [date, setDate] = React.useState(attendance[0]?.date ?? today);
  const [department, setDepartment] = React.useState("all");
  const [filter, setFilter] = React.useState("all");
  const [fixing, setFixing] = React.useState<{ date: string } | null>(null);
  const [rejecting, setRejecting] = React.useState<HrRegularisation | null>(null);
  const wide = canManageHr(role) || role === "payroll_admin";
  const actor = employees.find((item) => item.id === actorId);
  const actorName = actor?.name ?? "HR";
  const scope = employees.filter((item) => item.status !== "archived" && (wide || isTeamOf(item, actorId)) && (department === "all" || item.department === department));
  const scopeIds = new Set(scope.map((item) => item.id));
  const rows = attendance.filter((item) => item.date === date && scopeIds.has(item.employeeId) && (filter === "all" || (filter === "exceptions" ? item.status === "late" || item.status === "absent" || Boolean(item.anomaly) : item.status === filter)));
  const dayRecords = attendance.filter((item) => item.date === date && scopeIds.has(item.employeeId));
  const canDecideReg = (request: HrRegularisation) => request.status === "pending" && request.employeeId !== actorId && (canManageHr(role) || employees.find((item) => item.id === request.employeeId)?.managerId === actorId || Object.entries(settings.delegation).some(([managerId, value]) => value.employeeId === actorId && value.until >= today && employees.find((item) => item.id === request.employeeId)?.managerId === managerId));
  const queue = regularisations.filter((item) => item.status === "pending" && (scopeIds.has(item.employeeId) || item.employeeId === actorId));
  const myRequests = regularisations.filter((item) => item.employeeId === actorId);

  function applyRegularisation(request: HrRegularisation) {
    const person = employees.find((item) => item.id === request.employeeId);
    if (!person) return;
    if (request.kind === "permission") {
      // A permission is a short, approved absence. It annotates the day and leaves the punches alone.
      const day = attendance.find((item) => item.employeeId === request.employeeId && item.date === request.date);
      if (day) updateAttendance(day.id, { anomaly: `Permission ${request.fromTime}–${request.toTime} (approved)` });
      return;
    }
    const result = classify(request.checkIn, request.checkOut, settings);
    const existing = attendance.find((item) => item.employeeId === request.employeeId && item.date === request.date);
    const patch = { checkIn: request.checkIn, checkOut: request.checkOut, status: result.status, overtimeHours: result.overtimeHours, anomaly: result.status === "absent" ? result.anomaly : result.anomaly ? `${result.anomaly} · regularised` : null };
    if (existing) updateAttendance(existing.id, patch); else addAttendance({ id: `att-${crypto.randomUUID()}`, employeeId: person.id, employeeName: person.name, date: request.date, shift: shiftLabel(settings), ...patch });
  }
  function approve(request: HrRegularisation) {
    applyRegularisation(request);
    decideRegularisation(request.id, { status: "approved", decidedBy: actorId });
    log({ recordId: request.id, actorId, action: "regularisation_approved", reason: `${employees.find((item) => item.id === request.employeeId)?.name} · ${hrDate(request.date)}` });
    toast.success("Correction approved and attendance updated");
  }

  return <div className="space-y-5">
    <HrStats items={[{ label: "Present", value: dayRecords.filter((item) => item.status === "present" || item.status === "late").length, hint: `${hrDate(date)} · ${dayName(date)}` }, { label: "Late or exceptions", value: dayRecords.filter((item) => item.status === "late" || item.anomaly).length, hint: "Needs a look" }, { label: "Absent or no punch", value: dayRecords.filter((item) => item.status === "absent").length, hint: "Regularise or mark leave" }, { label: "Overtime", value: `${dayRecords.reduce((sum, item) => sum + item.overtimeHours, 0)}h`, hint: `Shift ${shiftLabel(settings)} · grace ${settings.graceMinutes} min` }]} />
    {actor && <PunchCard actorId={actorId} onRequestCorrection={() => setFixing({ date: today })} />}
    <HrPanel title="Attendance" description="Shifts, punches and exceptions. Managers see their team; HR sees everyone." actions={<div className="flex flex-wrap gap-2">
      <select aria-label="Date" className={`${hrInputClass} w-auto`} value={date} onChange={(event) => setDate(event.target.value)}>{dates.map((item) => <option key={item} value={item}>{hrDate(item)}{item === today ? " (today)" : ""}</option>)}</select>
      {wide && <select aria-label="Department" className={`${hrInputClass} w-auto`} value={department} onChange={(event) => setDepartment(event.target.value)}><option value="all">All departments</option>{[...new Set(employees.map((item) => item.department))].map((item) => <option key={item}>{item}</option>)}</select>}
      <select aria-label="Status filter" className={`${hrInputClass} w-auto`} value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All statuses</option><option value="exceptions">Exceptions</option><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option><option value="on_leave">On leave</option></select>
    </div>}>
      {rows.length ? <HrTable headings={["Employee", "Shift", "In", "Out", "Status", "Overtime", "Note", ""]}>{rows.map((row) => <tr key={row.id}><td className={hrCell}><p className="font-medium">{row.employeeName}</p><p className="text-xs text-muted-foreground">{employees.find((item) => item.id === row.employeeId)?.department}</p></td><td className={hrCell}>{row.shift}</td><td className={hrCell}>{row.checkIn ?? "—"}</td><td className={hrCell}>{row.checkOut ?? "—"}</td><td className={hrCell}><HrStatus status={statusLabel[row.status]} /></td><td className={hrCell}>{row.overtimeHours ? `${row.overtimeHours}h` : "—"}</td><td className={`${hrCell} text-xs text-muted-foreground`}>{row.anomaly ?? "—"}</td><td className={hrCell}>{row.employeeId === actorId && (row.anomaly || row.status === "absent") && <Button size="sm" variant="outline" onClick={() => setFixing({ date: row.date })}>Regularise</Button>}</td></tr>)}</HrTable> : <HrEmpty>No attendance records match this view.</HrEmpty>}
    </HrPanel>
    {queue.length > 0 && <HrPanel title="Correction requests" description="Approving updates the attendance record. Rejections need a reason.">
      <ul className="divide-y divide-border">{queue.map((request) => { const person = employees.find((item) => item.id === request.employeeId); return <li key={request.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm"><div className="min-w-0 flex-1"><p className="font-medium">{person?.name} · {hrDate(request.date)}{request.kind === "permission" ? " · permission" : ""}</p><p className="mt-1 text-xs text-muted-foreground">{request.kind === "permission" ? `Permission ${request.fromTime}–${request.toTime}` : `In ${request.checkIn ?? "—"} · Out ${request.checkOut ?? "—"}`} · {request.reason}</p><p className="text-[11px] text-muted-foreground">Requested {when(request.requestedAt)}</p></div>{canDecideReg(request) ? <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setRejecting(request)}>Reject</Button><Button size="sm" onClick={() => approve(request)}>Approve</Button></div> : <HrStatus status="pending" />}</li>; })}</ul>
    </HrPanel>}
    {myRequests.length > 0 && <HrPanel title="My correction requests"><ul className="divide-y divide-border">{myRequests.map((request) => <li key={request.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"><div><p>{hrDate(request.date)} · In {request.checkIn ?? "—"} · Out {request.checkOut ?? "—"}</p><p className="text-xs text-muted-foreground">{request.reason}{request.decisionReason ? ` · Decision: ${request.decisionReason}` : ""}</p></div><HrStatus status={request.status} /></li>)}</ul></HrPanel>}
    {fixing && actor && <RegulariseDialog employeeId={actor.id} date={fixing.date} onClose={() => setFixing(null)} onSubmit={(request) => { addRegularisation(request); log({ recordId: request.id, actorId, action: "regularisation_requested", reason: request.reason }); toast.success("Correction sent for approval"); setFixing(null); }} />}
    {rejecting && <RejectDialog onClose={() => setRejecting(null)} onSubmit={(reason) => { decideRegularisation(rejecting.id, { status: "rejected", decidedBy: actorId, decisionReason: reason }); log({ recordId: rejecting.id, actorId, action: "regularisation_rejected", reason }); toast.success("Correction rejected"); setRejecting(null); }} />}
    <p className="text-[11px] text-muted-foreground">Acting as {actorName}. Demo punches use this device&apos;s clock in IST and stay in this browser.</p>
  </div>;
}

function RegulariseDialog({ employeeId, date: initialDate, onClose, onSubmit }: { employeeId: string; date: string; onClose: () => void; onSubmit: (request: HrRegularisation) => void }) {
  const { attendance } = useHrPeopleStore();
  const { settings, regularisations } = useHrOperationsStore();
  const today = hrToday();
  const oldest = new Date(`${today}T12:00:00`); oldest.setDate(oldest.getDate() - 30);
  const min = oldest.toLocaleDateString("en-CA");
  const [date, setDate] = React.useState(initialDate);
  const existing = attendance.find((item) => item.employeeId === employeeId && item.date === date);
  const [checkIn, setCheckIn] = React.useState(existing?.checkIn ?? settings.shiftStart);
  const [checkOut, setCheckOut] = React.useState(existing?.checkOut ?? settings.shiftEnd);
  const [reason, setReason] = React.useState("");
  const duplicate = regularisations.some((item) => item.employeeId === employeeId && item.date === date && item.status === "pending");
  const error = !date ? "Choose the date." : date > today ? "You can't correct a future date." : date < min ? "Corrections go back 30 days at most." : duplicate ? "You already have a pending correction for this date." : !checkIn ? "Enter the check-in time." : checkOut && toMinutes(checkOut) <= toMinutes(checkIn) ? "Check-out must be after check-in." : reason.trim().length < 10 ? "Explain what happened (at least 10 characters)." : "";
  const showError = Boolean(error) && (reason.length > 0 || !error.startsWith("Explain"));
  return <HrModal open onOpenChange={(value) => !value && onClose()} title="Request an attendance correction" description="Your manager approves it. The record changes only after approval.">
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (!error) onSubmit({ id: `reg-${crypto.randomUUID()}`, employeeId, date, checkIn, checkOut: checkOut || null, reason: reason.trim(), status: "pending", requestedAt: new Date().toISOString() }); }}>
      <div className="grid gap-4 sm:grid-cols-3">
        <HrField label="Date"><Input type="date" min={min} max={today} value={date} onChange={(event) => setDate(event.target.value)} className="rounded-none" /></HrField>
        <HrField label="Actual check-in"><Input type="time" value={checkIn} onChange={(event) => setCheckIn(event.target.value)} className="rounded-none" /></HrField>
        <HrField label="Actual check-out"><Input type="time" value={checkOut} onChange={(event) => setCheckOut(event.target.value)} className="rounded-none" /></HrField>
      </div>
      <HrField label="Reason"><Textarea required maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} className="rounded-none" placeholder="e.g. Phone battery died, forgot to punch in at the warehouse" /></HrField>
      {showError && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={Boolean(error)}>Send for approval</Button></div>
    </form>
  </HrModal>;
}

function RejectDialog({ onSubmit, onClose }: { onSubmit: (reason: string) => void; onClose: () => void }) {
  const [reason, setReason] = React.useState("");
  return <HrModal open onOpenChange={(value) => !value && onClose()} title="Reject correction" description="The employee sees your reason.">
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (reason.trim().length >= 5) onSubmit(reason.trim()); }}>
      <Textarea aria-label="Reason" required maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} className="rounded-none" />
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={reason.trim().length < 5}>Reject</Button></div>
    </form>
  </HrModal>;
}
