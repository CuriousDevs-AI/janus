import type { HrAttendanceRecord, HrLeaveRequest } from "@/lib/types";
import type { HrHoliday } from "@/lib/stores/hr-operations-store";
import { isWorkingDay } from "@/lib/hr-leave";
import { toMinutes } from "@/lib/hr-attendance";

export type DayKind = "na" | "upcoming" | "holiday" | "off" | "leave" | "present" | "late" | "incomplete" | "absent" | "gap";
export interface DayInfo { date: string; kind: DayKind; record?: HrAttendanceRecord; holiday?: HrHoliday; leave?: HrLeaveRequest; hours: number | null; needsFix: boolean; label: string }

export interface DayContext { today: string; workWeek: string[]; holidays: HrHoliday[]; leaves: HrLeaveRequest[]; records: HrAttendanceRecord[]; joiningDate: string }

const labels: Record<DayKind, string> = { na: "Before joining", upcoming: "Upcoming", holiday: "Holiday", off: "Weekly off", leave: "On leave", present: "Present", late: "Late", incomplete: "Missing check-out", absent: "Absent", gap: "No record" };
export const dayLabel = (kind: DayKind) => labels[kind];

/** What happened on one day for one person. A "gap" is a past working day with no punch and no leave. */
export function dayInfo(date: string, context: DayContext): DayInfo {
  const record = context.records.find((item) => item.date === date);
  const holiday = context.holidays.find((item) => item.date === date && item.kind === "company");
  const leave = context.leaves.find((item) => item.status === "approved" && item.from <= date && date <= item.to);
  const hours = record?.checkIn && record.checkOut ? Math.max(0, (toMinutes(record.checkOut) - toMinutes(record.checkIn)) / 60) : null;
  let kind: DayKind;
  if (date < context.joiningDate) kind = "na";
  else if (record && (record.status === "present" || record.status === "late")) kind = record.status === "late" ? "late" : !record.checkOut && date < context.today ? "incomplete" : "present";
  else if (record?.status === "absent") kind = "absent";
  else if (holiday) kind = "holiday";
  else if (!isWorkingDay(date, context.workWeek)) kind = "off";
  else if (leave || record?.status === "on_leave") kind = "leave";
  else if (date >= context.today) kind = "upcoming";
  else kind = "gap";
  if (kind === "late" && !record?.checkOut && date < context.today) kind = "incomplete";
  return { date, kind, record, holiday, leave, hours, needsFix: kind === "absent" || kind === "gap" || kind === "incomplete", label: labels[kind] };
}
