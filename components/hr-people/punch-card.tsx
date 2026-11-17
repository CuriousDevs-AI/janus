"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { useHrOperationsStore } from "@/lib/stores/hr-operations-store";
import { classify, nowIst, shiftLabel } from "@/lib/hr-attendance";
import { isWorkingDay } from "@/lib/hr-leave";
import { useHolidays } from "@/lib/hr-holidays";
import { HrPanel, hrDate, hrToday } from "@/components/hr-people/operations-ui";

const dayName = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", { weekday: "short" });
const shortDay = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", { weekday: "narrow" });
const pad = (n: number) => String(n).padStart(2, "0");
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hoursText = (hours: number) => `${Math.floor(hours)}h ${pad(Math.round((hours % 1) * 60))}m`;

function weekDates(today: string): string[] {
  const d = new Date(`${today}T12:00:00`);
  const dow = (d.getDay() + 6) % 7;
  const mon = new Date(d); mon.setDate(mon.getDate() - dow);
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(mon); x.setDate(x.getDate() + i); return isoDate(x); });
}

/** Today's check-in and check-out for one person, using the shift policy. */
export function PunchCard({ actorId, onRequestCorrection }: { actorId: string; onRequestCorrection?: () => void }) {
  const { employees, attendance, leaveRequests, addAttendance, updateAttendance } = useHrPeopleStore();
  const settings = useHrOperationsStore((state) => state.settings);
  const holidays = useHolidays();
  const today = hrToday();
  const actor = employees.find((item) => item.id === actorId);
  const mine = attendance.find((item) => item.employeeId === actorId && item.date === today);
  const onLeaveToday = leaveRequests.some((item) => item.employeeId === actorId && item.status === "approved" && item.from <= today && item.to >= today);
  const holiday = holidays.find((item) => item.date === today && item.kind === "company");
  const weeklyOff = !isWorkingDay(today, settings.workWeek);

  const week = React.useMemo(() => weekDates(today), [today]);
  const closedDates = React.useMemo(() => new Set(holidays.filter((h) => h.kind === "company").map((h) => h.date)), [holidays]);
  const weekRecords = React.useMemo(() => attendance.filter((r) => r.employeeId === actorId && week.includes(r.date)), [attendance, actorId, week]);
  const weekLeaves = React.useMemo(() => leaveRequests.filter((r) => r.employeeId === actorId && r.status === "approved" && r.to >= week[0] && r.from <= week[6]), [leaveRequests, actorId, week]);
  const weekPresent = weekRecords.filter((r) => r.status === "present" || r.status === "late").length;
  const weekHours = weekRecords.reduce((sum, r) => { if (!r.checkIn || !r.checkOut) return sum; const diff = (new Date(`2000-01-01T${r.checkOut}`).getTime() - new Date(`2000-01-01T${r.checkIn}`).getTime()) / 3600000; return sum + Math.max(0, diff); }, 0);

  if (!actor) return null;

  function punch(kind: "in" | "out") {
    const time = nowIst();
    if (kind === "in") {
      if (onLeaveToday) { toast.error("You have approved leave today. Cancel the leave first if you worked."); return; }
      if (mine?.checkIn) { toast.error("You have already checked in today."); return; }
      const result = classify(time, null, settings);
      addAttendance({ id: `att-${crypto.randomUUID()}`, employeeId: actor!.id, employeeName: actor!.name, date: today, status: result.status, checkIn: time, checkOut: null, shift: shiftLabel(settings), overtimeHours: 0, anomaly: holiday ? `Worked on ${holiday.name}` : weeklyOff ? "Worked on a weekly off" : result.anomaly });
      toast.success(`Checked in at ${time}`);
    } else if (mine && mine.checkIn && !mine.checkOut) {
      const result = classify(mine.checkIn, time, settings);
      const keep = mine.anomaly?.startsWith("Worked on");
      updateAttendance(mine.id, { checkOut: time, overtimeHours: result.overtimeHours, anomaly: keep ? mine.anomaly : result.anomaly });
      toast.success(`Checked out at ${time}`);
    }
  }

  const note = holiday ? ` · ${holiday.name}` : weeklyOff ? " · weekly off" : "";
  return <HrPanel title="My day" description={`${hrDate(today)} · ${dayName(today)}${note} · shift ${shiftLabel(settings)}`}>
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm">
      <p aria-live="polite">{onLeaveToday ? "You are on approved leave today." : mine?.checkOut ? `Checked in ${mine.checkIn}, out ${mine.checkOut}${mine.overtimeHours ? ` · ${mine.overtimeHours}h overtime` : ""}.` : mine?.checkIn ? `Checked in at ${mine.checkIn}${mine.anomaly ? ` · ${mine.anomaly}` : ""}.` : "You haven't checked in yet."}</p>
      <div className="flex flex-wrap gap-2"><Button disabled={Boolean(mine?.checkIn) || onLeaveToday} onClick={() => punch("in")}>Check in</Button><Button variant="outline" disabled={!mine?.checkIn || Boolean(mine.checkOut)} onClick={() => punch("out")}>Check out</Button>{onRequestCorrection && <Button variant="ghost" onClick={onRequestCorrection}>Request correction</Button>}</div>
    </div>
    <div className="border-t border-border px-5 py-3">
      <div className="flex items-center justify-between gap-3 mb-2"><p className="text-xs font-medium text-muted-foreground">This week</p><p className="text-xs text-muted-foreground">{weekPresent} days · {hoursText(weekHours)}</p></div>
      <div className="grid grid-cols-7 gap-1" role="img" aria-label={`Weekly attendance: ${weekPresent} days present, ${hoursText(weekHours)} total`}>
        {week.map((date) => {
          const rec = weekRecords.find((r) => r.date === date);
          const off = !isWorkingDay(date, settings.workWeek) || closedDates.has(date);
          const onLeave = weekLeaves.some((r) => r.from <= date && date <= r.to);
          const future = date > today;
          const isToday = date === today;
          const bg = future ? "bg-surface-2" : off ? "bg-surface-2" : onLeave ? "bg-accent-muted" : rec?.status === "present" ? "bg-success-muted" : rec?.status === "late" ? "bg-warning-muted" : rec ? "bg-danger/10" : date < (actor.joiningDate ?? "1900") ? "bg-surface-2" : "bg-danger/10";
          return <div key={date} className={`flex flex-col items-center gap-0.5 py-1.5 ${bg} ${isToday ? "ring-1 ring-accent" : ""}`} title={`${hrDate(date)} · ${future ? "upcoming" : off ? "off" : onLeave ? "leave" : rec ? rec.status : "no record"}`}>
            <span className="text-[10px] text-muted-foreground">{shortDay(date)}</span>
            <span className="text-xs font-medium">{date.slice(8)}</span>
            {rec?.checkIn && <span className="text-[9px] text-muted-foreground">{rec.checkIn.slice(0, 5)}</span>}
          </div>;
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground"><span className="flex items-center gap-1"><i className="size-2 bg-success-muted border border-border" />Present</span><span className="flex items-center gap-1"><i className="size-2 bg-warning-muted border border-border" />Late</span><span className="flex items-center gap-1"><i className="size-2 bg-danger/10 border border-border" />Absent/gap</span><span className="flex items-center gap-1"><i className="size-2 bg-accent-muted border border-border" />Leave</span><span className="flex items-center gap-1"><i className="size-2 bg-surface-2 border border-border" />Off</span></div>
    </div>
  </HrPanel>;
}
