"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { useHrOperationsStore, type HrPolicySettings } from "@/lib/stores/hr-operations-store";
import { canManageHr } from "@/lib/hr-people-access";
import { toMinutes } from "@/lib/hr-attendance";
import { HrEmpty, HrField, HrPanel, hrDate, hrInputClass, hrToday } from "@/components/hr-people/operations-ui";
import type { HrDemoRole } from "@/lib/types";

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const same = (a: HrPolicySettings, b: HrPolicySettings) => JSON.stringify(a) === JSON.stringify(b);

function validate(draft: HrPolicySettings) {
  const whole = (value: number, max: number) => Number.isInteger(value) && value >= 0 && value <= max;
  if (![draft.earnedDays, draft.casualDays, draft.sickDays].every((value) => whole(value, 60))) return "Leave entitlements must be whole days between 0 and 60.";
  if (!draft.workWeek.length) return "Choose at least one working day.";
  if (toMinutes(draft.shiftEnd) <= toMinutes(draft.shiftStart)) return "The shift must end after it starts.";
  if (!whole(draft.graceMinutes, 120)) return "Grace time must be between 0 and 120 minutes.";
  for (const [managerId, value] of Object.entries(draft.delegation)) if (value.employeeId === managerId) return "A manager can't delegate to themselves.";
  return "";
}

export function HrPolicyPanel({ role, actorId }: { role: HrDemoRole; actorId: string }) {
  const { employees } = useHrPeopleStore();
  const { settings, saveSettings, log } = useHrOperationsStore();
  const [draft, setDraft] = React.useState(settings);
  const [pickManager, setPickManager] = React.useState("");
  const [pickDelegate, setPickDelegate] = React.useState("");
  const [until, setUntil] = React.useState("");
  const editable = canManageHr(role);
  const error = validate(draft);
  const dirty = !same(draft, settings);
  const people = employees.filter((item) => item.status !== "archived");
  const managers = people.filter((item) => people.some((other) => other.managerId === item.id));
  const set = <K extends keyof HrPolicySettings>(key: K, value: HrPolicySettings[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const number = (key: "earnedDays" | "casualDays" | "sickDays" | "graceMinutes") => <Input type="number" min={0} inputMode="numeric" disabled={!editable} value={Number.isNaN(draft[key]) ? "" : draft[key]} onChange={(event) => set(key, event.target.value === "" ? NaN : Number(event.target.value))} className="rounded-none" />;

  function save() {
    if (error) return;
    const changed = (Object.keys(draft) as (keyof HrPolicySettings)[]).filter((key) => JSON.stringify(draft[key]) !== JSON.stringify(settings[key]));
    saveSettings(draft);
    log({ recordId: "hr-policy", actorId, action: "policy_updated", reason: `Changed: ${changed.join(", ")}` });
    toast.success("Time and leave policy saved. New requests use it straight away.");
  }
  function addDelegation() {
    if (!pickManager || !pickDelegate) return;
    if (pickManager === pickDelegate) { toast.error("A manager can't delegate to themselves."); return; }
    if (!until || until < hrToday()) { toast.error("Choose an end date that isn't in the past."); return; }
    set("delegation", { ...draft.delegation, [pickManager]: { employeeId: pickDelegate, until } });
    setPickManager(""); setPickDelegate(""); setUntil("");
  }

  return <HrPanel title="Time & leave policy" description={editable ? "These rules apply to attendance, leave balances and approvals for everyone." : "Only HR and the owner can change these rules."} actions={editable ? <div className="flex gap-2"><Button size="sm" variant="outline" disabled={!dirty} onClick={() => setDraft(settings)}>Discard</Button><Button size="sm" disabled={!dirty || Boolean(error)} title={error || undefined} onClick={save}>Save policy</Button></div> : undefined}>
    <div className="space-y-6 p-5">
      <fieldset className="space-y-3"><legend className="text-sm font-semibold">Leave entitlement (days per leave year)</legend>
        <div className="grid gap-4 sm:grid-cols-4"><HrField label="Earned">{number("earnedDays")}</HrField><HrField label="Casual">{number("casualDays")}</HrField><HrField label="Sick">{number("sickDays")}</HrField><HrField label="Year starts"><Input disabled value={`${hrDate(`2026-${settings.yearStart}`).replace(/ \d{4}$/, "")}`} className="rounded-none" /></HrField></div>
      </fieldset>
      <fieldset className="space-y-3"><legend className="text-sm font-semibold">Approval chain</legend>
        <select aria-label="Approval chain" disabled={!editable} className={`${hrInputClass} max-w-xs`} value={draft.approvalChain} onChange={(event) => set("approvalChain", event.target.value as HrPolicySettings["approvalChain"])}><option value="manager">Reporting manager only</option><option value="manager_hr">Reporting manager, then HR</option></select>
      </fieldset>
      <fieldset className="space-y-3"><legend className="text-sm font-semibold">Working week and shift</legend>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Working days">{days.map((day) => { const on = draft.workWeek.includes(day); return <label key={day} className={`cursor-pointer border px-3 py-1.5 text-sm ${on ? "border-accent bg-accent-muted text-accent" : "border-border text-muted-foreground"} ${editable ? "" : "opacity-60"}`}><input type="checkbox" className="sr-only" disabled={!editable} checked={on} onChange={(event) => set("workWeek", days.filter((item) => item === day ? event.target.checked : draft.workWeek.includes(item)))} />{day}</label>; })}</div>
        <div className="grid gap-4 sm:grid-cols-3"><HrField label="Shift starts"><Input type="time" disabled={!editable} value={draft.shiftStart} onChange={(event) => set("shiftStart", event.target.value)} className="rounded-none" /></HrField><HrField label="Shift ends"><Input type="time" disabled={!editable} value={draft.shiftEnd} onChange={(event) => set("shiftEnd", event.target.value)} className="rounded-none" /></HrField><HrField label="Late after (grace minutes)">{number("graceMinutes")}</HrField></div>
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
