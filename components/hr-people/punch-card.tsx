"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { useHrOperationsStore } from "@/lib/stores/hr-operations-store";
import { classify, nowIst, shiftLabel } from "@/lib/hr-attendance";
import { isWorkingDay } from "@/lib/hr-leave";
import { useHolidays } from "@/lib/hr-holidays";
import { HrPanel, hrDate, hrToday } from "@/components/hr-people/operations-ui";

const dayName = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", { weekday: "short" });

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
  </HrPanel>;
}
