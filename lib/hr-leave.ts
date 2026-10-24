import type { HrEmployee, HrLeaveRequest } from "@/lib/types";
import type { HrPolicySettings } from "@/lib/stores/hr-operations-store";

export type LeaveType = HrLeaveRequest["type"];
export const leaveTypeLabels: Record<LeaveType, string> = { earned: "Earned", casual: "Casual", sick: "Sick", unpaid: "Unpaid" };
export const paidLeaveTypes: LeaveType[] = ["earned", "casual", "sick"];
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const at = (date: string) => new Date(`${date}T12:00:00`);
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const isWorkingDay = (date: string, workWeek: string[]) => workWeek.includes(weekdays[at(date).getDay()]);

/** Working days between two dates (inclusive), skipping weekly offs and, when given, company holidays. */
export function workingDays(from: string, to: string, workWeek: string[], closed?: ReadonlySet<string>) {
  if (!from || !to || to < from) return 0;
  let count = 0;
  for (let day = at(from); iso(day) <= to; day.setDate(day.getDate() + 1)) if (workWeek.includes(weekdays[day.getDay()]) && !closed?.has(iso(day))) count += 1;
  return count;
}

/** The leave year containing `date`, using the configured start (MM-DD). */
export function leaveYear(date: string, yearStart: string) {
  const year = Number(date.slice(0, 4));
  const startThisYear = `${year}-${yearStart}`;
  const start = date >= startThisYear ? startThisYear : `${year - 1}-${yearStart}`;
  const next = new Date(`${start}T12:00:00`);
  next.setFullYear(next.getFullYear() + 1);
  next.setDate(next.getDate() - 1);
  return { start, end: iso(next) };
}

export function entitlement(type: LeaveType, settings: HrPolicySettings) {
  return type === "earned" ? settings.earnedDays : type === "casual" ? settings.casualDays : type === "sick" ? settings.sickDays : Infinity;
}

export function leaveBalance(requests: HrLeaveRequest[], employeeId: string, type: LeaveType, settings: HrPolicySettings, today: string, ignoreId?: string) {
  const year = leaveYear(today, settings.yearStart);
  const mine = requests.filter((item) => item.employeeId === employeeId && item.type === type && item.id !== ignoreId && item.from >= year.start && item.from <= year.end);
  const used = mine.filter((item) => item.status === "approved").reduce((sum, item) => sum + item.days, 0);
  const pending = mine.filter((item) => item.status === "pending" || item.status === "needs_clarification").reduce((sum, item) => sum + item.days, 0);
  const total = entitlement(type, settings);
  return { total, used, pending, remaining: total - used - pending };
}

export function findOverlap(requests: HrLeaveRequest[], employeeId: string, from: string, to: string) {
  return requests.find((item) => item.employeeId === employeeId && item.status !== "rejected" && item.from <= to && item.to >= from);
}

export type Decider = { allowed: boolean; mode?: "manager" | "delegate" | "hr"; reason?: string };

/** Who may decide a request at its current step. Nobody decides their own request. */
export function canDecide(request: Pick<HrLeaveRequest, "employeeId" | "managerId" | "step" | "status">, actorId: string, role: string, settings: HrPolicySettings, today: string): Decider {
  if (request.employeeId === actorId) return { allowed: false, reason: "You can't decide your own request." };
  if (request.status !== "pending") return { allowed: false };
  const hr = role === "owner" || role === "hr_manager";
  if (request.step === "hr") return hr ? { allowed: true, mode: "hr" } : { allowed: false, reason: "Waiting for HR." };
  if (request.step !== "manager") return { allowed: false };
  if (request.managerId === actorId) return { allowed: true, mode: "manager" };
  const delegation = request.managerId ? settings.delegation[request.managerId] : undefined;
  if (delegation && delegation.employeeId === actorId && delegation.until >= today) return { allowed: true, mode: "delegate" };
  return hr ? { allowed: true, mode: "hr" } : { allowed: false, reason: "Waiting for the reporting manager." };
}

/** Where an approval goes next: with the two-step chain a manager's approval still needs HR. */
export function nextAfterApproval(mode: NonNullable<Decider["mode"]>, settings: HrPolicySettings): { status: HrLeaveRequest["status"]; step: HrLeaveRequest["step"] } {
  if (mode !== "hr" && settings.approvalChain === "manager_hr") return { status: "pending", step: "hr" };
  return { status: "approved", step: "complete" };
}

export const stepLabel = (request: Pick<HrLeaveRequest, "status" | "step">) => request.status === "pending" ? `Pending · ${request.step === "hr" ? "HR" : "manager"}` : request.status === "needs_clarification" ? "Needs clarification" : request.status === "approved" ? "Approved" : "Rejected";

export const isTeamOf = (employee: HrEmployee, actorId: string) => employee.managerId === actorId || employee.id === actorId;
