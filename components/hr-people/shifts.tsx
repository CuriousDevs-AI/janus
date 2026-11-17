"use client";
import * as React from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { canManageHr } from "@/lib/hr-people-access";
import { HrEmpty, HrField, HrModal, HrPanel, HrStats, HrStatus, HrTable, hrCell, hrInputClass, hrToday } from "@/components/hr-people/operations-ui";
import type { HrDemoRole } from "@/lib/types";

interface ShiftDef { id: string; name: string; start: string; end: string; grace: number; overtimeAfter: number; color: string }
interface RosterEntry { employeeId: string; day: number; shiftId: string | null }
interface SwapRequest { id: string; fromId: string; fromName: string; toId: string; toName: string; date: string; shiftFrom: string; shiftTo: string; status: "pending" | "approved" | "rejected"; requestedAt: string }

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const colors: Record<string, string> = { morning: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300", day: "bg-accent-muted text-accent", evening: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300", night: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200", off: "bg-surface-2 text-muted-foreground" };

function seedShifts(): ShiftDef[] {
  return [
    { id: "morning", name: "Morning", start: "06:00", end: "14:00", grace: 15, overtimeAfter: 8, color: "morning" },
    { id: "day", name: "Day / General", start: "09:00", end: "18:00", grace: 10, overtimeAfter: 9, color: "day" },
    { id: "evening", name: "Evening", start: "14:00", end: "22:00", grace: 15, overtimeAfter: 8, color: "evening" },
    { id: "night", name: "Night", start: "22:00", end: "06:00", grace: 15, overtimeAfter: 8, color: "night" },
  ];
}

function seedRoster(empIds: string[]): RosterEntry[] {
  const entries: RosterEntry[] = [];
  const shifts = ["day", "day", "morning", "evening", "night"];
  empIds.forEach((id, i) => {
    const base = shifts[i % shifts.length];
    DAYS.forEach((_, d) => {
      const off = (d + i) % 7 === 6;
      entries.push({ employeeId: id, day: d, shiftId: off ? null : base });
    });
  });
  return entries;
}

function seedSwaps(empNames: Map<string, string>): SwapRequest[] {
  const ids = [...empNames.keys()];
  if (ids.length < 4) return [];
  return [
    { id: "swap-1", fromId: ids[2], fromName: empNames.get(ids[2])!, toId: ids[3], toName: empNames.get(ids[3])!, date: "2026-11-19", shiftFrom: "Morning", shiftTo: "Day / General", status: "pending", requestedAt: "2026-11-17T09:30:00" },
    { id: "swap-2", fromId: ids[0], fromName: empNames.get(ids[0])!, toId: ids[1], toName: empNames.get(ids[1])!, date: "2026-11-20", shiftFrom: "Day / General", shiftTo: "Evening", status: "approved", requestedAt: "2026-11-15T14:00:00" },
    { id: "swap-3", fromId: ids[3], fromName: empNames.get(ids[3])!, toId: ids[2], toName: empNames.get(ids[2])!, date: "2026-11-21", shiftFrom: "Night", shiftTo: "Morning", status: "pending", requestedAt: "2026-11-16T11:15:00" },
  ];
}

export function HrShiftsView({ role, actorId }: { role: HrDemoRole; actorId: string }) {
  const employees = useHrPeopleStore((s) => s.employees).filter((e) => e.status !== "archived");
  const empNames = React.useMemo(() => new Map(employees.map((e) => [e.id, e.name])), [employees]);
  const empIds = React.useMemo(() => employees.map((e) => e.id), [employees]);
  const [shifts, setShifts] = React.useState(seedShifts);
  const [roster, setRoster] = React.useState(() => seedRoster(empIds));
  const [swaps, setSwaps] = React.useState(() => seedSwaps(empNames));
  const [editing, setEditing] = React.useState<ShiftDef | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [tab, setTab] = React.useState<"roster" | "shifts" | "swaps">("roster");
  const hr = canManageHr(role);

  const nightCount = roster.filter((r) => r.shiftId === "night").length;
  const assigned = new Set(roster.filter((r) => r.shiftId).map((r) => r.employeeId)).size;
  const pending = swaps.filter((s) => s.status === "pending").length;

  function assignShift(empId: string, day: number) {
    if (!hr) return;
    setRoster((prev) => {
      const existing = prev.find((r) => r.employeeId === empId && r.day === day);
      const shiftIds = [...shifts.map((s) => s.id), null];
      const current = existing?.shiftId ?? null;
      const idx = shiftIds.indexOf(current);
      const next = shiftIds[(idx + 1) % shiftIds.length];
      if (existing) return prev.map((r) => r === existing ? { ...r, shiftId: next } : r);
      return [...prev, { employeeId: empId, day, shiftId: next }];
    });
  }

  function decideSwap(id: string, approve: boolean) {
    setSwaps((prev) => prev.map((s) => s.id === id ? { ...s, status: approve ? "approved" : "rejected" } : s));
    toast.success(approve ? "Swap approved" : "Swap rejected");
  }

  function saveShift(def: ShiftDef) {
    setShifts((prev) => prev.some((s) => s.id === def.id) ? prev.map((s) => s.id === def.id ? def : s) : [...prev, def]);
    setEditing(null); setAdding(false);
    toast.success("Shift saved");
  }

  return <div className="space-y-5">
    <HrStats items={[{ label: "Shifts defined", value: shifts.length, hint: "Active shift patterns" }, { label: "On roster", value: assigned, hint: `of ${employees.length} employees` }, { label: "Swap requests", value: pending, hint: pending ? "Pending approval" : "No pending" }, { label: "Night shift", value: nightCount, hint: "Assignments this week" }]} />

    <div className="flex gap-1 border-b border-border">{(["roster", "shifts", "swaps"] as const).map((t) => <button key={t} type="button" onClick={() => setTab(t)} className={`px-4 py-2 text-sm capitalize ${tab === t ? "border-b-2 border-accent font-medium" : "text-muted-foreground"}`}>{t === "swaps" ? `Swaps${pending ? ` (${pending})` : ""}` : t}</button>)}</div>

    {tab === "roster" && <HrPanel title="Weekly roster" description={hr ? "Click a cell to cycle through shifts. Empty = weekly off." : "Your team's shift schedule for this week."}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-sm"><thead className="border-b border-border bg-surface-2"><tr><th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Employee</th>{DAYS.map((d) => <th key={d} className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">{d}</th>)}</tr></thead>
        <tbody className="divide-y divide-border">{employees.map((emp) => <tr key={emp.id}>
          <td className="px-4 py-2"><p className="font-medium text-sm">{emp.name}</p><p className="text-xs text-muted-foreground">{emp.department}</p></td>
          {DAYS.map((_, d) => {
            const entry = roster.find((r) => r.employeeId === emp.id && r.day === d);
            const shift = entry?.shiftId ? shifts.find((s) => s.id === entry.shiftId) : null;
            const c = shift ? colors[shift.color] ?? colors.day : colors.off;
            return <td key={d} className="px-1 py-1 text-center">
              <button type="button" disabled={!hr} onClick={() => assignShift(emp.id, d)} className={`w-full px-2 py-1.5 text-xs font-medium ${c} ${hr ? "cursor-pointer hover:opacity-80" : ""}`} title={hr ? "Click to change shift" : shift?.name ?? "Off"}>{shift ? shift.name.split(/[\s/]/)[0] : "Off"}</button>
            </td>;
          })}
        </tr>)}</tbody></table>
      </div>
      <div className="flex flex-wrap gap-3 border-t border-border px-5 py-3 text-[10px] text-muted-foreground">{shifts.map((s) => <span key={s.id} className="flex items-center gap-1.5"><i className={`inline-block size-2.5 ${colors[s.color]?.split(" ")[0] ?? "bg-accent-muted"}`} />{s.name} ({s.start}–{s.end})</span>)}<span className="flex items-center gap-1.5"><i className="size-2.5 bg-surface-2 border border-border" />Weekly off</span></div>
    </HrPanel>}

    {tab === "shifts" && <HrPanel title="Shift definitions" description="Define working shifts with start/end times, grace period and overtime rules." actions={hr ? <Button size="sm" onClick={() => { setAdding(true); setEditing({ id: `shift-${crypto.randomUUID().slice(0, 6)}`, name: "", start: "09:00", end: "18:00", grace: 10, overtimeAfter: 9, color: "day" }); }}><Plus className="mr-1 size-3.5" />Add shift</Button> : undefined}>
      {shifts.length ? <HrTable headings={["Shift", "Hours", "Grace", "OT after", "Assigned", ""]}>
        {shifts.map((s) => { const count = new Set(roster.filter((r) => r.shiftId === s.id).map((r) => r.employeeId)).size; return <tr key={s.id}>
          <td className={hrCell}><div className="flex items-center gap-2"><i className={`size-3 ${colors[s.color]?.split(" ")[0] ?? "bg-accent-muted"}`} /><span className="font-medium">{s.name}</span></div></td>
          <td className={hrCell}>{s.start} – {s.end}</td>
          <td className={hrCell}>{s.grace} min</td>
          <td className={hrCell}>{s.overtimeAfter}h</td>
          <td className={hrCell}><Badge variant="neutral">{count} employees</Badge></td>
          <td className={hrCell}>{hr && <Button size="sm" variant="outline" onClick={() => setEditing(s)}>Edit</Button>}</td>
        </tr>; })}
      </HrTable> : <HrEmpty>No shifts defined yet.</HrEmpty>}
    </HrPanel>}

    {tab === "swaps" && <HrPanel title="Shift swap requests" description="Employees request to swap shifts with a colleague. Manager or HR approves.">
      {swaps.length ? <HrTable headings={["From", "To", "Date", "Swap", "Status", ""]}>
        {swaps.map((s) => <tr key={s.id}>
          <td className={hrCell}><p className="font-medium">{s.fromName}</p><p className="text-xs text-muted-foreground">{s.shiftFrom}</p></td>
          <td className={hrCell}><p className="font-medium">{s.toName}</p><p className="text-xs text-muted-foreground">{s.shiftTo}</p></td>
          <td className={hrCell}>{s.date}</td>
          <td className={hrCell}><span className="text-xs">{s.shiftFrom} ↔ {s.shiftTo}</span></td>
          <td className={hrCell}><HrStatus status={s.status} /></td>
          <td className={hrCell}>{hr && s.status === "pending" && <div className="flex gap-1"><Button size="sm" onClick={() => decideSwap(s.id, true)}>Approve</Button><Button size="sm" variant="outline" onClick={() => decideSwap(s.id, false)}>Reject</Button></div>}</td>
        </tr>)}
      </HrTable> : <HrEmpty>No swap requests.</HrEmpty>}
    </HrPanel>}

    {(editing || adding) && editing && <ShiftDialog def={editing} onSave={saveShift} onClose={() => { setEditing(null); setAdding(false); }} />}
  </div>;
}

function ShiftDialog({ def, onSave, onClose }: { def: ShiftDef; onSave: (s: ShiftDef) => void; onClose: () => void }) {
  const [name, setName] = React.useState(def.name);
  const [start, setStart] = React.useState(def.start);
  const [end, setEnd] = React.useState(def.end);
  const [grace, setGrace] = React.useState(String(def.grace));
  const [ot, setOt] = React.useState(String(def.overtimeAfter));
  const [color, setColor] = React.useState(def.color);
  const error = !name.trim() ? "Name is required" : "";

  return <HrModal open onOpenChange={(open) => !open && onClose()} title={def.name ? `Edit ${def.name}` : "New shift"} description="Define working hours, grace period and overtime threshold.">
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!error) onSave({ ...def, name: name.trim(), start, end, grace: Number(grace) || 10, overtimeAfter: Number(ot) || 8, color }); }}>
      <HrField label="Shift name"><Input required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} className="rounded-none" placeholder="e.g. Night" /></HrField>
      <div className="grid gap-4 sm:grid-cols-2">
        <HrField label="Start time"><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-none" /></HrField>
        <HrField label="End time"><Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded-none" /></HrField>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <HrField label="Grace (minutes)"><Input type="number" min={0} max={60} value={grace} onChange={(e) => setGrace(e.target.value)} className="rounded-none" /></HrField>
        <HrField label="OT after (hours)"><Input type="number" min={1} max={24} step={0.5} value={ot} onChange={(e) => setOt(e.target.value)} className="rounded-none" /></HrField>
        <HrField label="Color"><select className={hrInputClass} value={color} onChange={(e) => setColor(e.target.value)}>{Object.keys(colors).filter((c) => c !== "off").map((c) => <option key={c} value={c}>{c}</option>)}</select></HrField>
      </div>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={Boolean(error)}>{def.name ? "Save" : "Add shift"}</Button></div>
    </form>
  </HrModal>;
}
