"use client";

import * as React from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { useHrOperationsStore, type HrLeaveTypeConfig, type HrPolicySettings } from "@/lib/stores/hr-operations-store";
import { useCan } from "@/lib/hr-org-hooks";
import { toMinutes } from "@/lib/hr-attendance";
import { HrEmpty, HrField, HrPanel, HrTable, hrCell, hrDate, hrInputClass, hrToday } from "@/components/hr-people/operations-ui";
import type { HrDemoRole } from "@/lib/types";

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const approvalLabels: Record<HrLeaveTypeConfig["approval"], string> = { default: "Company default", manager: "Reporting manager only", manager_hr: "Manager, then HR", hr: "HR only" };

function save(patch: Partial<HrPolicySettings>, actorId: string, what: string, detail: string) {
  const store = useHrOperationsStore.getState();
  store.saveSettings({ ...store.settings, ...patch });
  store.log({ recordId: "hr-policy", actorId, action: what, reason: detail });
}

/** Time, shift and delegation. Leave types and approval authority have their own panels. */
export function HrPolicyPanel({ role, actorId }: { role: HrDemoRole; actorId: string }) {
  const { employees } = useHrPeopleStore();
  const settings = useHrOperationsStore((state) => state.settings);
  const [draft, setDraft] = React.useState({ workWeek: settings.workWeek, shiftStart: settings.shiftStart, shiftEnd: settings.shiftEnd, graceMinutes: settings.graceMinutes, delegation: settings.delegation });
  const [pickManager, setPickManager] = React.useState("");
  const [pickDelegate, setPickDelegate] = React.useState("");
  const [until, setUntil] = React.useState("");
  const editable = useCan(role, "settings.manage");
  const current = { workWeek: settings.workWeek, shiftStart: settings.shiftStart, shiftEnd: settings.shiftEnd, graceMinutes: settings.graceMinutes, delegation: settings.delegation };
  const dirty = !same(draft, current);
  const people = employees.filter((item) => item.status !== "archived");
  const managers = people.filter((item) => people.some((other) => other.managerId === item.id));
  const error = !draft.workWeek.length ? "Choose at least one working day." : toMinutes(draft.shiftEnd) <= toMinutes(draft.shiftStart) ? "The shift must end after it starts." : !Number.isInteger(draft.graceMinutes) || draft.graceMinutes < 0 || draft.graceMinutes > 120 ? "Grace time must be between 0 and 120 minutes." : Object.entries(draft.delegation).some(([managerId, value]) => value.employeeId === managerId) ? "A manager can't delegate to themselves." : "";
  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => setDraft((state) => ({ ...state, [key]: value }));

  function addDelegation() {
    if (!pickManager || !pickDelegate) return;
    if (pickManager === pickDelegate) { toast.error("A manager can't delegate to themselves."); return; }
    if (!until || until < hrToday()) { toast.error("Choose an end date that isn't in the past."); return; }
    set("delegation", { ...draft.delegation, [pickManager]: { employeeId: pickDelegate, until } });
    setPickManager(""); setPickDelegate(""); setUntil("");
  }
  return <HrPanel title="Working time & delegation" description={editable ? "Working week, shift, late grace and who covers for a manager who is away." : "Only HR and the owner can change these rules."} actions={editable ? <div className="flex gap-2"><Button size="sm" variant="outline" disabled={!dirty} onClick={() => setDraft(current)}>Discard</Button><Button size="sm" disabled={!dirty || Boolean(error)} title={error || undefined} onClick={() => { save(draft, actorId, "time_policy_updated", Object.keys(draft).filter((key) => !same(draft[key as keyof typeof draft], current[key as keyof typeof current])).join(", ")); toast.success("Saved. New attendance and requests use it straight away."); }}>Save</Button></div> : undefined}>
    <div className="space-y-6 p-5">
      <fieldset className="space-y-3"><legend className="text-sm font-semibold">Working week and shift</legend>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Working days">{days.map((day) => { const on = draft.workWeek.includes(day); return <label key={day} className={`cursor-pointer border px-3 py-1.5 text-sm ${on ? "border-accent bg-accent-muted text-accent" : "border-border text-muted-foreground"} ${editable ? "" : "opacity-60"}`}><input type="checkbox" className="sr-only" disabled={!editable} checked={on} onChange={(event) => set("workWeek", days.filter((item) => item === day ? event.target.checked : draft.workWeek.includes(item)))} />{day}</label>; })}</div>
        <div className="grid gap-4 sm:grid-cols-3"><HrField label="Shift starts"><Input type="time" disabled={!editable} value={draft.shiftStart} onChange={(event) => set("shiftStart", event.target.value)} className="rounded-none" /></HrField><HrField label="Shift ends"><Input type="time" disabled={!editable} value={draft.shiftEnd} onChange={(event) => set("shiftEnd", event.target.value)} className="rounded-none" /></HrField><HrField label="Late after (grace minutes)"><Input type="number" min={0} inputMode="numeric" disabled={!editable} value={Number.isNaN(draft.graceMinutes) ? "" : draft.graceMinutes} onChange={(event) => set("graceMinutes", event.target.value === "" ? NaN : Number(event.target.value))} className="rounded-none" /></HrField></div>
      </fieldset>
      <fieldset className="space-y-3"><legend className="text-sm font-semibold">Approval delegation</legend>
        <p className="text-xs text-muted-foreground">While a manager is away, a delegate can approve their team&apos;s leave and corrections until the end date.</p>
        {Object.keys(draft.delegation).length ? <ul className="divide-y divide-border border border-border text-sm">{Object.entries(draft.delegation).map(([managerId, value]) => <li key={managerId} className="flex items-center justify-between gap-3 px-3 py-2"><span>{people.find((item) => item.id === managerId)?.name ?? managerId} → {people.find((item) => item.id === value.employeeId)?.name ?? value.employeeId} <span className="text-muted-foreground">until {hrDate(value.until)}</span></span>{editable && <Button size="sm" variant="ghost" onClick={() => { const next = { ...draft.delegation }; delete next[managerId]; set("delegation", next); }}>Remove</Button>}</li>)}</ul> : <HrEmpty>No delegations set.</HrEmpty>}
        {editable && <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_160px_auto]"><HrField label="Manager"><select className={hrInputClass} value={pickManager} onChange={(event) => setPickManager(event.target.value)}><option value="">Choose…</option>{managers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></HrField><HrField label="Delegate"><select className={hrInputClass} value={pickDelegate} onChange={(event) => setPickDelegate(event.target.value)}><option value="">Choose…</option>{people.filter((item) => item.id !== pickManager).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></HrField><HrField label="Until"><Input type="date" min={hrToday()} value={until} onChange={(event) => setUntil(event.target.value)} className="rounded-none" /></HrField><Button type="button" variant="outline" onClick={addDelegation}>Add</Button></div>}
      </fieldset>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  </HrPanel>;
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "leave";

/** HR adds, renames, re-limits and removes leave types. Removing a type people have used would rewrite history, so that one is deactivated instead. */
export function LeaveTypesPanel({ role, actorId }: { role: HrDemoRole; actorId: string }) {
  const settings = useHrOperationsStore((state) => state.settings);
  const leaveRequests = useHrPeopleStore((state) => state.leaveRequests);
  const [types, setTypes] = React.useState<HrLeaveTypeConfig[]>(settings.leaveTypes);
  const [yearStart, setYearStart] = React.useState(settings.yearStart);
  const [name, setName] = React.useState("");
  const [limit, setLimit] = React.useState("5");
  const editable = useCan(role, "settings.manage");
  const usedIds = new Set(leaveRequests.map((item) => item.type));
  const dirty = !same(types, settings.leaveTypes) || yearStart !== settings.yearStart;
  const month = Number(yearStart.split("-")[0]);
  const names = types.map((item) => item.name.trim().toLowerCase());
  const error = types.some((item) => item.name.trim().length < 2) ? "Every leave type needs a name (at least 2 characters)." : new Set(names).size !== names.length ? "Two leave types have the same name." : types.some((item) => item.days !== null && (!Number.isInteger(item.days) || item.days < 0 || item.days > 365)) ? "Days a year must be a whole number from 0 to 365." : types.some((item) => item.documentAfterDays !== null && (!Number.isInteger(item.documentAfterDays) || item.documentAfterDays < 1 || item.documentAfterDays > 30)) ? "Document rule must be 1 to 30 days." : !types.some((item) => item.active) ? "Keep at least one leave type active." : "";
  const patch = (id: string, change: Partial<HrLeaveTypeConfig>) => setTypes((current) => current.map((item) => item.id === id ? { ...item, ...change } : item));

  function add() {
    const value = limit.trim() === "" ? null : Number(limit);
    const clean = name.trim();
    if (clean.length < 2) { toast.error("Give the leave type a name."); return; }
    if (names.includes(clean.toLowerCase())) { toast.error(`${clean} already exists.`); return; }
    if (value !== null && (!Number.isInteger(value) || value < 0 || value > 365)) { toast.error("Days a year must be a whole number from 0 to 365."); return; }
    setTypes((current) => [...current, { id: `${slug(clean)}-${crypto.randomUUID().slice(0, 4)}`, name: clean, days: value, paid: true, active: true, approval: "default", documentAfterDays: null }]);
    setName("");
  }
  function commit() {
    if (error) return;
    const before = settings.leaveTypes;
    const added = types.filter((item) => !before.some((old) => old.id === item.id)).map((item) => item.name);
    const removed = before.filter((old) => !types.some((item) => item.id === old.id)).map((item) => item.name);
    const changed = types.filter((item) => { const old = before.find((entry) => entry.id === item.id); return old && !same(old, item); }).map((item) => item.name);
    save({ leaveTypes: types.map((item) => ({ ...item, name: item.name.trim() })), yearStart }, actorId, "leave_types_updated", [added.length && `Added: ${added.join(", ")}`, removed.length && `Removed: ${removed.join(", ")}`, changed.length && `Changed: ${changed.join(", ")}`, yearStart !== settings.yearStart && `Leave year starts ${yearStart}`].filter(Boolean).join(" · "));
    toast.success("Leave types saved. Balances update straight away.");
  }

  return <HrPanel title="Leave types" description={editable ? "Add, rename, set the yearly days, choose paid or unpaid, and who approves each type." : "Only HR and the owner can change leave types."} actions={editable ? <div className="flex gap-2"><Button size="sm" variant="outline" disabled={!dirty} onClick={() => { setTypes(settings.leaveTypes); setYearStart(settings.yearStart); }}>Discard</Button><Button size="sm" disabled={!dirty || Boolean(error)} title={error || undefined} onClick={commit}>Save leave types</Button></div> : undefined}>
    <div className="space-y-5 p-5">
      <div className="grid gap-4 sm:grid-cols-[200px_1fr]"><HrField label="Leave year starts in"><select disabled={!editable} className={hrInputClass} value={month} onChange={(event) => setYearStart(`${String(event.target.value).padStart(2, "0")}-01`)}>{months.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</select></HrField><p className="self-end text-xs text-muted-foreground">Balances reset on the first of this month.</p></div>
      <HrTable headings={["Leave type", "Days a year", "Paid", "Approved by", "Document after (days)", "Active", ""]}>{types.map((type) => { const used = usedIds.has(type.id); return <tr key={type.id}>
        <td className={hrCell}><Input aria-label={`Name of ${type.name}`} disabled={!editable} value={type.name} maxLength={40} onChange={(event) => patch(type.id, { name: event.target.value })} className="h-8 w-44 rounded-none" /></td>
        <td className={hrCell}><div className="flex items-center gap-2"><Input aria-label={`Days a year for ${type.name}`} type="number" min={0} inputMode="numeric" disabled={!editable || type.days === null} value={type.days === null ? "" : Number.isNaN(type.days) ? "" : type.days} onChange={(event) => patch(type.id, { days: event.target.value === "" ? NaN : Number(event.target.value) })} className="h-8 w-20 rounded-none" /><label className="flex items-center gap-1 text-xs text-muted-foreground"><input type="checkbox" disabled={!editable} checked={type.days === null} onChange={(event) => patch(type.id, { days: event.target.checked ? null : 5 })} />No limit</label></div></td>
        <td className={hrCell}><input type="checkbox" aria-label={`${type.name} is paid`} disabled={!editable} checked={type.paid} onChange={(event) => patch(type.id, { paid: event.target.checked })} /></td>
        <td className={hrCell}><select aria-label={`Approver for ${type.name}`} disabled={!editable} className={`${hrInputClass} h-8 w-44`} value={type.approval} onChange={(event) => patch(type.id, { approval: event.target.value as HrLeaveTypeConfig["approval"] })}>{(Object.keys(approvalLabels) as HrLeaveTypeConfig["approval"][]).map((key) => <option key={key} value={key}>{key === "default" ? `Default (${approvalLabels[settings.approvalChain]})` : approvalLabels[key]}</option>)}</select></td>
        <td className={hrCell}><Input aria-label={`Document rule for ${type.name}`} type="number" min={1} disabled={!editable} placeholder="None" value={type.documentAfterDays ?? ""} onChange={(event) => patch(type.id, { documentAfterDays: event.target.value === "" ? null : Number(event.target.value) })} className="h-8 w-20 rounded-none" /></td>
        <td className={hrCell}><input type="checkbox" aria-label={`${type.name} is active`} disabled={!editable} checked={type.active} onChange={(event) => patch(type.id, { active: event.target.checked })} /></td>
        <td className={hrCell}>{editable && <Button size="icon" variant="ghost" aria-label={used ? `${type.name} has been used, deactivate it instead` : `Remove ${type.name}`} disabled={used} title={used ? "People have used this type. Deactivate it instead." : undefined} onClick={() => setTypes((current) => current.filter((item) => item.id !== type.id))}><Trash2 className="size-4" /></Button>}</td>
      </tr>; })}</HrTable>
      {editable && <div className="grid items-end gap-3 border-t border-border pt-4 sm:grid-cols-[1fr_140px_auto]"><HrField label="New leave type"><Input value={name} maxLength={40} onChange={(event) => setName(event.target.value)} placeholder="e.g. Compensatory off, Maternity leave" className="rounded-none" /></HrField><HrField label="Days a year (blank = no limit)"><Input type="number" min={0} inputMode="numeric" value={limit} onChange={(event) => setLimit(event.target.value)} className="rounded-none" /></HrField><Button type="button" variant="outline" onClick={add}><Plus className="mr-1 size-3.5" />Add</Button></div>}
      <p className="text-xs text-muted-foreground">Changing days applies to everyone from now. A type people have already used can be turned off, not deleted, so old requests keep their name.</p>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  </HrPanel>;
}

/** Who approves what, in one place. HR sets the company defaults here. */
export function ApprovalAuthorityPanel({ role, actorId }: { role: HrDemoRole; actorId: string }) {
  const settings = useHrOperationsStore((state) => state.settings);
  const employees = useHrPeopleStore((state) => state.employees);
  const [chain, setChain] = React.useState(settings.approvalChain);
  const [escalate, setEscalate] = React.useState(settings.escalateAfterDays);
  const [ownerPay, setOwnerPay] = React.useState(settings.promotionOwnerApproval);
  const editable = useCan(role, "settings.manage");
  const dirty = chain !== settings.approvalChain || escalate !== settings.escalateAfterDays || ownerPay !== settings.promotionOwnerApproval;
  const error = !Number.isInteger(escalate) || escalate < 0 || escalate > 30 ? "Escalation must be 0 to 30 days." : "";
  const leaveChain = chain === "manager_hr" ? "Reporting manager → HR" : "Reporting manager";
  const overrides = settings.leaveTypes.filter((item) => item.active && item.approval !== "default");
  const delegations = Object.keys(settings.delegation).length;
  const rows: [string, string, string][] = [
    ["Leave", `${leaveChain}${overrides.length ? ` (${overrides.map((item) => `${item.name}: ${approvalLabels[item.approval]}`).join("; ")})` : ""}`, `A manager's delegate can approve while they're away${delegations ? ` (${delegations} set)` : ""}. HR can step in. ${settings.escalateAfterDays ? `Flagged for HR after ${settings.escalateAfterDays} days.` : "No automatic escalation."}`],
    ["Attendance corrections and permissions", "Reporting manager", "HR can step in. Nobody approves their own."],
    ["Expenses", `${leaveChain} → Finance marks paid`, "Receipt needed above ₹1,000."],
    ["Promotions, transfers and salary changes", `Proposed by HR or the reporting manager → HR reviews${settings.promotionOwnerApproval ? " → Owner approves pay and title changes" : ""}`, "The person who proposes a change can't approve it. Nobody approves their own."],
    ["Letters and document requests", "HR", "Created from templates and added to the employee's documents."],
    ["Payroll", "Payroll admin prepares → HR or Owner approves (a different person) → locked", "Only the Owner can reopen a locked run."],
  ];
  return <HrPanel title="Approval authority" description={editable ? "Company defaults for who approves what. Leave types can override the leave route above." : "Who approves what. Only HR and the owner can change it."} actions={editable ? <div className="flex gap-2"><Button size="sm" variant="outline" disabled={!dirty} onClick={() => { setChain(settings.approvalChain); setEscalate(settings.escalateAfterDays); setOwnerPay(settings.promotionOwnerApproval); }}>Discard</Button><Button size="sm" disabled={!dirty || Boolean(error)} title={error || undefined} onClick={() => { save({ approvalChain: chain, escalateAfterDays: escalate, promotionOwnerApproval: ownerPay }, actorId, "approval_authority_updated", `Leave: ${chain}; escalate after ${escalate} days; owner approves pay changes: ${ownerPay}`); toast.success("Approval rules saved."); }}>Save</Button></div> : undefined}>
    <div className="space-y-5 p-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <HrField label="Leave approval route"><select disabled={!editable} className={hrInputClass} value={chain} onChange={(event) => setChain(event.target.value as typeof chain)}><option value="manager">Reporting manager only</option><option value="manager_hr">Reporting manager, then HR</option></select></HrField>
        <HrField label="Flag for HR after (days, 0 = off)"><Input type="number" min={0} max={30} disabled={!editable} value={Number.isNaN(escalate) ? "" : escalate} onChange={(event) => setEscalate(event.target.value === "" ? NaN : Number(event.target.value))} className="rounded-none" /></HrField>
        <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" disabled={!editable} checked={ownerPay} onChange={(event) => setOwnerPay(event.target.checked)} />Owner approves pay and title changes</label>
      </div>
      <HrTable headings={["What", "Who approves", "Notes"]}>{rows.map(([what, who, notes]) => <tr key={what}><td className={`${hrCell} font-medium`}>{what}</td><td className={hrCell}>{who}</td><td className={`${hrCell} text-xs text-muted-foreground`}>{notes}</td></tr>)}</HrTable>
      <div><p className="mb-2 text-sm font-semibold">Reporting managers</p><ul className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">{employees.filter((item) => item.status !== "archived" && item.managerId).map((item) => <li key={item.id} className="flex justify-between gap-2"><span>{item.name}</span><span>reports to {item.managerName}</span></li>)}</ul><p className="mt-2 text-xs text-muted-foreground">Change a reporting manager from Employees. Pending approvals move to the new manager automatically.</p></div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  </HrPanel>;
}
