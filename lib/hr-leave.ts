import type { HrEmployee, HrLeaveRequest } from "@/lib/types";
import type { HrLeaveAdjustment, HrPolicySettings } from "@/lib/stores/hr-operations-store";
import { useHrOrgStore } from "@/lib/stores/hr-org-store";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { approvesForDepartment, chainForDepartment, departmentByName, hasPermission, isBackupFor } from "@/lib/hr-org";

export type LeaveType = string;
const fallbackName = (id: string) => id.charAt(0).toUpperCase() + id.slice(1).replace(/[-_]/g, " ");
/** The name HR gave a leave type. Removed types still read sensibly on old requests. */
export const typeName = (settings: HrPolicySettings, id: string) => settings.leaveTypes.find((item) => item.id === id)?.name ?? fallbackName(id);
export const activeTypes = (settings: HrPolicySettings) => settings.leaveTypes.filter((item) => item.active);
/** Types with a yearly limit. These get a balance. */
export const limitedTypes = (settings: HrPolicySettings) => activeTypes(settings).filter((item) => item.days !== null);
/** The approval chain for a leave type. A department can set its own; a leave type's own setting wins over both. */
export const chainFor = (settings: HrPolicySettings, typeId: string, departmentName?: string) => {
  const type = settings.leaveTypes.find((item) => item.id === typeId);
  const org = useHrOrgStore.getState();
  return chainForDepartment(settings, type?.approval ?? "default", departmentName ? departmentByName(org.departments, departmentName) : undefined);
};
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

export function entitlement(typeId: LeaveType, settings: HrPolicySettings, adjustments: HrLeaveAdjustment[] = []) {
  const type = settings.leaveTypes.find((item) => item.id === typeId);
  if (!type || type.days === null) return Infinity;
  return Math.max(0, type.days + adjustments.reduce((sum, item) => sum + item.days, 0));
}

export function leaveBalance(requests: HrLeaveRequest[], employeeId: string, type: LeaveType, settings: HrPolicySettings, today: string, ignoreId?: string, adjustments: HrLeaveAdjustment[] = []) {
  const year = leaveYear(today, settings.yearStart);
  const mine = requests.filter((item) => item.employeeId === employeeId && item.type === type && item.id !== ignoreId && item.from >= year.start && item.from <= year.end);
  const used = mine.filter((item) => item.status === "approved").reduce((sum, item) => sum + item.days, 0);
  const pending = mine.filter((item) => item.status === "pending" || item.status === "needs_clarification").reduce((sum, item) => sum + item.days, 0);
  const mineAdjustments = adjustments.filter((item) => item.employeeId === employeeId && item.typeId === type && item.at.slice(0, 10) >= year.start && item.at.slice(0, 10) <= year.end);
  const total = entitlement(type, settings, mineAdjustments);
  return { total, used, pending, remaining: total - used - pending, adjusted: mineAdjustments.reduce((sum, item) => sum + item.days, 0) };
}

export function findOverlap(requests: HrLeaveRequest[], employeeId: string, from: string, to: string) {
  return requests.find((item) => item.employeeId === employeeId && item.status !== "rejected" && item.from <= to && item.to >= from);
}

export type Decider = { allowed: boolean; mode?: "manager" | "delegate" | "hr"; reason?: string };

/** Who may decide a request at its current step. Nobody decides their own request. */
export function canDecide(request: Pick<HrLeaveRequest, "employeeId" | "managerId" | "step" | "status"> & Partial<Pick<HrLeaveRequest, "route" | "level">>, actorId: string, role: string, settings: HrPolicySettings, today: string): Decider {
  if (request.employeeId === actorId) return { allowed: false, reason: "You can't decide your own request." };
  if (request.status !== "pending") return { allowed: false };
  const org = useHrOrgStore.getState();
  const hr = role === "owner" || role === "hr_manager" || hasPermission(org, actorId, "leave.approve_all");
  if (request.step === "hr") return hr ? { allowed: true, mode: "hr" } : { allowed: false, reason: "Waiting for HR." };
  if (request.step !== "manager") return { allowed: false };
  // After a manager change the request's current approver is updated, so honour that as well as the original route.
  const current = request.route?.[request.level ?? 0];
  const approverId = request.managerId ?? current?.id;
  if (approverId === actorId || current?.id === actorId) return { allowed: true, mode: "manager" };
  const delegation = approverId ? settings.delegation[approverId] : undefined;
  if (delegation && delegation.employeeId === actorId && delegation.until >= today) return { allowed: true, mode: "delegate" };
  // A department head or a backup approver can step in without being the employee's direct manager.
  const requester = useHrPeopleStore.getState().employees.find((item) => item.id === request.employeeId);
  if (requester && (approvesForDepartment(org, actorId, requester) || isBackupFor(org, actorId, requester))) return { allowed: true, mode: "delegate" };
  return hr ? { allowed: true, mode: "hr" } : { allowed: false, reason: `Waiting for ${current?.name ?? "the reporting manager"}.` };
}

/** What happens to a request after someone approves it: the next level, or done. HR stepping in for an approver ends it. */
export function afterApproval(request: HrLeaveRequest, mode: NonNullable<Decider["mode"]>, settings: HrPolicySettings, departmentName?: string): { status: HrLeaveRequest["status"]; step: HrLeaveRequest["step"]; patch?: Partial<HrLeaveRequest> } {
  if (!request.route) return nextAfterApproval(mode, settings, request.type, departmentName);
  const level = (request.level ?? 0) + 1;
  const next = request.route[level];
  if (mode === "hr" || !next) return { status: "approved", step: "complete" };
  return { status: "pending", step: next.kind === "hr" ? "hr" : "manager", patch: { level, managerId: next.id ?? null, managerName: next.name } };
}

/** Where an approval goes next: with the two-step chain a manager's approval still needs HR. */
export function nextAfterApproval(mode: NonNullable<Decider["mode"]>, settings: HrPolicySettings, typeId: LeaveType, departmentName?: string): { status: HrLeaveRequest["status"]; step: HrLeaveRequest["step"] } {
  if (mode !== "hr" && chainFor(settings, typeId, departmentName) === "manager_hr") return { status: "pending", step: "hr" };
  return { status: "approved", step: "complete" };
}

export const stepLabel = (request: Pick<HrLeaveRequest, "status" | "step"> & Partial<Pick<HrLeaveRequest, "route" | "level">>) => request.status === "pending" ? (request.route && request.route.length > 1 ? `Pending · ${request.route[request.level ?? 0]?.label ?? "approver"} (step ${(request.level ?? 0) + 1} of ${request.route.length})` : `Pending · ${request.step === "hr" ? "HR" : "manager"}`) : request.status === "needs_clarification" ? "Needs clarification" : request.status === "approved" ? "Approved" : "Rejected";

export const isTeamOf = (employee: HrEmployee, actorId: string) => employee.managerId === actorId || employee.id === actorId;
