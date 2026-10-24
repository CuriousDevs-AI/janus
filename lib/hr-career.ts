import type { HrDemoRole, HrDocument, HrEmployee } from "@/lib/types";
import type { HrPolicySettings } from "@/lib/stores/hr-operations-store";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { useHrDocumentStore } from "@/lib/stores/hr-document-store";
import { useHrOperationsStore } from "@/lib/stores/hr-operations-store";
import { useHrEngageStore } from "@/lib/stores/hr-engage-store";
import { useHrCareerStore, type CareerChange, type ChangeFields, type ChangeKind, type ChangeSnapshot, type ChangeStatus } from "@/lib/stores/hr-career-store";
import { useHrOrgStore } from "@/lib/stores/hr-org-store";
import { hasPermission } from "@/lib/hr-org";
import { sampleMarkup } from "@/lib/hr-document-content";
import { todayIst } from "@/lib/hr-import";

export const kindLabels: Record<ChangeKind, string> = { promotion: "Promotion", transfer: "Transfer", salary_revision: "Salary revision", manager_change: "Change of reporting manager" };
export const statusLabels: Record<ChangeStatus, string> = { pending_hr: "Waiting for HR", pending_owner: "Waiting for the Owner", approved: "Approved, starts on its date", applied: "In effect", rejected: "Rejected", withdrawn: "Withdrawn" };

export const snapshot = (employee: HrEmployee): ChangeSnapshot => ({ title: employee.title, department: employee.department, branch: employee.branch, managerId: employee.managerId, managerName: employee.managerName, salaryMonthly: employee.salaryMonthly });

/** Pay and title changes need the Owner when the company setting says so. Other changes need HR only. */
export function needsOwnerApproval(before: ChangeSnapshot, to: ChangeFields, settings: HrPolicySettings) {
  const pay = to.salaryMonthly !== undefined && to.salaryMonthly !== before.salaryMonthly;
  const title = to.title !== undefined && to.title !== before.title;
  return settings.promotionOwnerApproval && (pay || title);
}

export function startingStatus(proposerRole: HrDemoRole, needsOwner: boolean): ChangeStatus {
  if (proposerRole === "hr_manager" && needsOwner) return "pending_owner";
  return "pending_hr";
}

/** Whoever proposes a change, or is the subject of it, can never approve it. */
export function canDecideChange(change: Pick<CareerChange, "employeeId" | "proposedBy" | "status">, actorId: string, role: HrDemoRole) {
  if (change.employeeId === actorId || change.proposedBy === actorId) return false;
  if (change.status === "pending_hr") return role === "owner" || (role === "hr_manager" && hasPermission(useHrOrgStore.getState(), actorId, "career.approve"));
  if (change.status === "pending_owner") return role === "owner";
  return false;
}

export function statusAfterApproval(change: Pick<CareerChange, "needsOwner" | "proposerRole" | "status">, actorRole: HrDemoRole): ChangeStatus {
  if (change.status === "pending_owner") return "approved";
  // At the HR step: pay and title changes still need the Owner, unless the Owner is the one deciding or proposed it.
  if (change.needsOwner && actorRole !== "owner" && change.proposerRole !== "owner") return "pending_owner";
  return "approved";
}

export function changeLines(change: CareerChange, showPay: boolean) {
  const lines: string[] = [];
  const { before, to } = change;
  if (to.title !== undefined && to.title !== before.title) lines.push(`Role: ${before.title} → ${to.title}`);
  if (to.department !== undefined && to.department !== before.department) lines.push(`Department: ${before.department} → ${to.department}`);
  if (to.branch !== undefined && to.branch !== before.branch) lines.push(`Branch: ${before.branch} → ${to.branch}`);
  if (to.managerId !== undefined && to.managerId !== before.managerId) lines.push(`Reports to: ${before.managerName ?? "No one"} → ${to.managerName ?? "No one"}`);
  if (to.salaryMonthly !== undefined && to.salaryMonthly !== before.salaryMonthly) lines.push(showPay ? `Monthly pay: ₹${before.salaryMonthly.toLocaleString("en-IN")} → ₹${to.salaryMonthly.toLocaleString("en-IN")}` : "Pay changes");
  return lines;
}

const letterFor: Partial<Record<ChangeKind, string>> = { promotion: "Promotion letter", transfer: "Transfer letter", salary_revision: "Salary revision letter" };

/** Puts an approved change into effect: updates the record, re-routes approvals, writes the letter and tells the team. */
export function applyChange(change: CareerChange, actorId: string) {
  const people = useHrPeopleStore.getState();
  const employee = people.employees.find((item) => item.id === change.employeeId);
  if (!employee) return;
  const { to } = change;
  const patch: Partial<HrEmployee> = {};
  if (to.title !== undefined) patch.title = to.title;
  if (to.department !== undefined) patch.department = to.department;
  if (to.branch !== undefined) { patch.branch = to.branch; patch.location = to.branch; }
  if (to.salaryMonthly !== undefined && to.salaryMonthly !== employee.salaryMonthly) {
    patch.salaryMonthly = to.salaryMonthly;
    const history = employee.salaryHistory?.length ? employee.salaryHistory : [{ from: "0000-01-01", salaryMonthly: employee.salaryMonthly }];
    patch.salaryHistory = [...history, { from: change.effectiveDate, salaryMonthly: to.salaryMonthly }];
  }
  if (Object.keys(patch).length) people.updateEmployee(employee.id, patch);
  let moved = 0;
  if (to.managerId !== undefined && to.managerId !== employee.managerId) moved = people.reassignManager(employee.id, to.managerId, to.managerName ?? null);
  const fresh = useHrPeopleStore.getState().employees.find((item) => item.id === employee.id) ?? employee;
  const actor = useHrPeopleStore.getState().employees.find((item) => item.id === actorId)?.name ?? "HR";
  let letterDocumentId: string | undefined;
  const category = letterFor[change.kind];
  if (category) {
    const id = `doc-${crypto.randomUUID()}`;
    const document: HrDocument = { id, employeeId: fresh.id, employeeName: fresh.name, name: `${category} — ${fresh.name}`, category, visibility: "employee", version: 1, status: "current", signatureStatus: "draft", issuedAt: todayIst(), expiresAt: null, ownerName: actor, acknowledgedAt: null };
    people.addDocument(document);
    const docs = useHrDocumentStore.getState();
    docs.patch(id, { body: sampleMarkup(document, fresh, { draft: true, effective: change.effectiveDate }) });
    docs.record(id, { actor, event: "Created from an approved change", version: 1, detail: kindLabels[change.kind] });
    letterDocumentId = id;
  }
  useHrOperationsStore.getState().log({ recordId: change.id, actorId, action: "career_change_applied", reason: `${kindLabels[change.kind]} for ${fresh.name}${moved ? `. ${moved} pending ${moved === 1 ? "request" : "requests"} moved to the new manager` : ""}` });
  if (change.kind === "promotion" || change.kind === "transfer") useHrEngageStore.getState().addItem({ id: `eng-${crypto.randomUUID()}`, kind: "announcement", authorId: actorId, createdAt: new Date().toISOString(), group: "all", title: change.kind === "promotion" ? `Congratulations ${fresh.name.split(" ")[0]}!` : `${fresh.name.split(" ")[0]} is moving teams`, text: change.kind === "promotion" ? `${fresh.name} is now ${fresh.title} in ${fresh.department}. Well done!` : `${fresh.name} joins the ${fresh.department} team${fresh.branch ? ` at ${fresh.branch}` : ""}. Welcome!` });
  useHrCareerStore.getState().step(change.id, { actorId, action: "applied" }, "applied", { letterDocumentId });
}

/** Applies approved changes whose date has arrived. Safe to call often. */
export function applyDueChanges(actorId: string) {
  const today = todayIst();
  useHrCareerStore.getState().changes.filter((item) => item.status === "approved" && item.effectiveDate <= today).forEach((item) => applyChange(item, actorId));
}

/** Everyone who reports to this person, directly or through others. A manager can't be picked from here, or the chart would loop. */
export function subordinatesOf(employees: HrEmployee[], id: string) {
  const found = new Set<string>();
  const walk = (managerId: string) => employees.filter((item) => item.managerId === managerId).forEach((item) => { if (!found.has(item.id)) { found.add(item.id); walk(item.id); } });
  walk(id);
  return found;
}
