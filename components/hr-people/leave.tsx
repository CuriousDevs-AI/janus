"use client";

import * as React from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { useHrOperationsStore } from "@/lib/stores/hr-operations-store";
import { canManageHr } from "@/lib/hr-people-access";
import { useCompanyHolidayDates } from "@/lib/hr-holidays";
import { useHrOrgStore } from "@/lib/stores/hr-org-store";
import { approverFor } from "@/lib/hr-org";
import { canDecide, chainFor, findOverlap, isTeamOf, nextAfterApproval, stepLabel, workingDays, type LeaveType } from "@/lib/hr-leave";
import { useLeaveTypes } from "@/lib/hr-leave-hooks";
import { HrEmpty, HrField, HrModal, HrPanel, HrStats, HrStatus, HrTable, hrCell, hrDate, hrInputClass, hrToday } from "@/components/hr-people/operations-ui";
import type { HrDemoRole, HrLeaveRequest } from "@/lib/types";

const when = (value: string) => new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const dayText = (days: number) => `${days} day${days === 1 ? "" : "s"}`;
type Decision = { request: HrLeaveRequest; kind: "approve" | "reject" | "clarify"; mode: NonNullable<ReturnType<typeof canDecide>["mode"]> };

export function HrLeaveView({ role, actorId, personal = false }: { role: HrDemoRole; actorId: string; personal?: boolean }) {
  const { employees, leaveRequests, updateLeave } = useHrPeopleStore();
  const { settings, audit, log } = useHrOperationsStore();
  const types = useLeaveTypes();
  const [requesting, setRequesting] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const [cancelling, setCancelling] = React.useState<HrLeaveRequest | null>(null);
  const [adjusting, setAdjusting] = React.useState<string | null>(null);
  const hrAdmin = canManageHr(role) && !personal;
  const [decision, setDecision] = React.useState<Decision | null>(null);
  const [responding, setResponding] = React.useState<HrLeaveRequest | null>(null);
  const [history, setHistory] = React.useState<HrLeaveRequest | null>(null);
  const today = hrToday();
  const actor = employees.find((item) => item.id === actorId);
  const actorName = actor?.name ?? "HR";
  const wide = !personal && (canManageHr(role) || role === "payroll_admin");
  const scopeIds = new Set(employees.filter((item) => personal ? item.id === actorId : wide || isTeamOf(item, actorId)).map((item) => item.id));
  const requests = leaveRequests.filter((item) => scopeIds.has(item.employeeId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const waiting = requests.filter((item) => canDecide(item, actorId, role, settings, today).allowed);
  const onLeaveToday = requests.filter((item) => item.status === "approved" && item.from <= today && item.to >= today).length;

  function decide(request: HrLeaveRequest, kind: Decision["kind"], mode: Decision["mode"], reason: string) {
    if (kind === "approve") {
      const next = nextAfterApproval(mode, settings, request.type, employees.find((item) => item.id === request.employeeId)?.department);
      updateLeave(request.id, next.status, next.step);
      log({ recordId: request.id, actorId, action: next.step === "hr" ? "approved_by_manager" : "approved", reason: reason || (mode === "delegate" ? "Approved as delegate" : mode === "hr" && request.step === "manager" ? "Approved by HR on the manager's behalf" : "") });
      toast.success(next.step === "hr" ? "Approved. Sent to HR for final approval." : "Leave approved");
    } else if (kind === "reject") {
      updateLeave(request.id, "rejected", request.step);
      log({ recordId: request.id, actorId, action: "rejected", reason });
      toast.success("Leave rejected");
    } else {
      updateLeave(request.id, "needs_clarification", request.step);
      log({ recordId: request.id, actorId, action: "clarification_requested", reason });
      toast.success("Clarification requested");
    }
  }

  return <div className="space-y-5">
    {personal && actor ? <BalanceCards employeeId={actor.id} /> : <HrStats items={[{ label: "Waiting for you", value: waiting.length, hint: "Requests you can decide" }, { label: "Open requests", value: requests.filter((item) => item.status === "pending" || item.status === "needs_clarification").length, hint: "Pending or in clarification" }, { label: "On leave today", value: onLeaveToday, hint: "Approved leave covering today" }, { label: "Approval chain", value: settings.approvalChain === "manager_hr" ? "Manager → HR" : "Manager", hint: "Set in HR Settings" }]} />}
    <HrPanel title={personal ? "My leave requests" : "Leave requests"} description={personal ? "Requests go to your reporting manager, then HR if the policy needs it." : "Approve, reject or ask for clarification. Every decision is recorded."} actions={<div className="flex gap-2">{hrAdmin && <Button size="sm" variant="outline" onClick={() => setRecording(true)}>Record leave for someone</Button>}{actor && <Button size="sm" onClick={() => setRequesting(true)}><Plus className="mr-1 size-3.5" />Request leave</Button>}</div>}>
      {requests.length ? <HrTable headings={["Employee", "Type", "Dates", "Days", "Reason", "Status", "Actions"]}>
        {requests.map((request) => { const verdict = canDecide(request, actorId, role, settings, today); const mine = request.employeeId === actorId; return <tr key={request.id}>
          <td className={hrCell}><p className="font-medium">{request.employeeName}</p><p className="text-xs text-muted-foreground">Approver: {request.managerName}</p></td>
          <td className={hrCell}>{types.name(request.type)}</td>
          <td className={`${hrCell} whitespace-nowrap`}>{hrDate(request.from)}{request.to !== request.from && ` – ${hrDate(request.to)}`}</td>
          <td className={hrCell}>{request.days}</td>
          <td className={`${hrCell} max-w-56 text-muted-foreground`}>{request.reason}</td>
          <td className={hrCell}><HrStatus status={request.status} /><p className="mt-1 text-[11px] text-muted-foreground">{stepLabel(request)}</p>{settings.escalateAfterDays > 0 && request.status === "pending" && request.step === "manager" && ageDays(request.createdAt, today) >= settings.escalateAfterDays && <p className="mt-1 text-[11px] font-medium text-warning">Waiting {ageDays(request.createdAt, today)} days · HR can step in</p>}</td>
          <td className={hrCell}><div className="flex flex-wrap gap-1">
            {verdict.allowed && verdict.mode && <><Button size="sm" onClick={() => setDecision({ request, kind: "approve", mode: verdict.mode! })}>Approve</Button><Button size="sm" variant="outline" onClick={() => setDecision({ request, kind: "clarify", mode: verdict.mode! })}>Clarify</Button><Button size="sm" variant="outline" onClick={() => setDecision({ request, kind: "reject", mode: verdict.mode! })}>Reject</Button></>}
            {mine && request.status === "needs_clarification" && <Button size="sm" onClick={() => setResponding(request)}>Respond</Button>}
            {mine && (request.status === "pending" || request.status === "needs_clarification") && <Button size="sm" variant="ghost" onClick={() => { updateLeave(request.id, "rejected", request.step); log({ recordId: request.id, actorId, action: "withdrawn", reason: "Withdrawn by the employee" }); toast.success("Request withdrawn"); }}>Withdraw</Button>}
            {hrAdmin && !mine && ["pending", "needs_clarification", "approved"].includes(request.status) && <Button size="sm" variant="ghost" onClick={() => setCancelling(request)}>Cancel leave</Button>}<Button size="sm" variant="ghost" onClick={() => setHistory(request)}>History</Button>
          </div></td></tr>; })}
      </HrTable> : <HrEmpty>{personal ? "You haven't requested leave yet." : "No leave requests in your scope."}</HrEmpty>}
    </HrPanel>
    {!personal && (wide || role === "reporting_manager") && <TeamBalances employeeIds={[...scopeIds]} onAdjust={hrAdmin ? setAdjusting : undefined} />}
    {requesting && actor && <RequestDialog employeeId={actor.id} onClose={() => setRequesting(false)} />}
    {recording && <RecordLeaveDialog actorId={actorId} onClose={() => setRecording(false)} />}
    {cancelling && <CancelLeaveDialog request={cancelling} actorId={actorId} onClose={() => setCancelling(null)} />}
    {adjusting && <AdjustBalanceDialog employeeId={adjusting} actorId={actorId} onClose={() => setAdjusting(null)} />}
    {decision && <DecisionDialog decision={decision} onClose={() => setDecision(null)} onSubmit={(reason) => { decide(decision.request, decision.kind, decision.mode, reason); setDecision(null); }} />}
    {responding && <ResponseDialog request={responding} onClose={() => setResponding(null)} onSubmit={(reply) => { updateLeave(responding.id, "pending", responding.step); log({ recordId: responding.id, actorId, action: "clarification_answered", reason: reply }); toast.success("Reply sent. The request is pending again."); setResponding(null); }} />}
    {history && <HistoryDialog request={history} entries={audit.filter((item) => item.recordId === history.id)} nameOf={(id) => employees.find((item) => item.id === id)?.name ?? id} onClose={() => setHistory(null)} />}
    <p className="text-[11px] text-muted-foreground">Acting as {actorName}. Demo records stay in this browser; no emails or WhatsApp messages are sent.</p>
  </div>;
}

function BalanceCards({ employeeId }: { employeeId: string }) {
  const types = useLeaveTypes();
  return <div className="grid gap-3 sm:grid-cols-3">{types.limited.map((type) => { const balance = types.balance(employeeId, type.id); return <div key={type.id} className="border border-border bg-surface p-4"><p className="text-xs text-muted-foreground">{type.name}</p><p className="mt-2 text-2xl font-semibold tracking-tight">{balance.remaining} <span className="text-sm font-normal text-muted-foreground">of {balance.total} days left</span></p><p className="mt-1 text-xs text-muted-foreground">{balance.used} used{balance.pending ? ` · ${balance.pending} pending` : ""}{balance.adjusted ? ` · ${balance.adjusted > 0 ? "+" : ""}${balance.adjusted} adjusted by HR` : ""}</p></div>; })}</div>;
}

function TeamBalances({ employeeIds, onAdjust }: { employeeIds: string[]; onAdjust?: (employeeId: string) => void }) {
  const employees = useHrPeopleStore((state) => state.employees);
  const types = useLeaveTypes();
  const people = employees.filter((item) => employeeIds.includes(item.id) && item.status !== "archived");
  return <HrPanel title="Leave balances" description="Days remaining this leave year, after approved and pending requests and any HR adjustments.">
    <HrTable headings={["Employee", ...types.limited.map((type) => type.name), ...(onAdjust ? [""] : [])]}>{people.map((person) => <tr key={person.id}><td className={hrCell}><p className="font-medium">{person.name}</p><p className="text-xs text-muted-foreground">{person.department}</p></td>{types.limited.map((type) => { const balance = types.balance(person.id, type.id); return <td key={type.id} className={hrCell}><span className={balance.remaining <= 0 ? "text-danger" : ""}>{balance.remaining}</span> <span className="text-xs text-muted-foreground">/ {balance.total}{balance.adjusted ? ` (${balance.adjusted > 0 ? "+" : ""}${balance.adjusted})` : ""}</span></td>; })}{onAdjust && <td className={hrCell}><Button size="sm" variant="ghost" onClick={() => onAdjust(person.id)} aria-label={`Adjust leave balance for ${person.name}`}>Adjust</Button></td>}</tr>)}</HrTable>
  </HrPanel>;
}

export function LeaveRequestForm({ employeeId, initial, onDone, onCreated }: { employeeId: string; initial?: { type?: LeaveType; from?: string }; onDone: () => void; onCreated?: (request: HrLeaveRequest) => void }) {
  const { employees, leaveRequests, addLeave } = useHrPeopleStore();
  const { settings, log } = useHrOperationsStore();
  const types = useLeaveTypes();
  const closed = useCompanyHolidayDates();
  const employee = employees.find((item) => item.id === employeeId)!;
  const org = useHrOrgStore();
  const today = hrToday();
  const [type, setType] = React.useState<LeaveType>(types.active.find((item) => item.id === initial?.type)?.id ?? types.active.find((item) => item.id === "casual")?.id ?? types.active[0]?.id ?? "");
  const [from, setFrom] = React.useState(initial?.from ?? today);
  const [to, setTo] = React.useState(initial?.from ?? today);
  const [reason, setReason] = React.useState("");
  const route = approverFor(employee, org, employees, { leaves: leaveRequests, from });
  const manager = employees.find((item) => item.id === route.id);
  const config = settings.leaveTypes.find((item) => item.id === type);
  const limited = config ? config.days !== null : false;
  const days = workingDays(from, to, settings.workWeek, closed);
  const balance = types.balance(employeeId, type);
  const chain = chainFor(settings, type, employee.department);
  const oldest = new Date(`${today}T12:00:00`); oldest.setDate(oldest.getDate() - 30);
  const overlap = from && to && to >= from ? findOverlap(leaveRequests, employeeId, from, to) : undefined;
  const error = !config ? "No leave types are available. Ask HR." : !from || !to ? "Choose the dates." : to < from ? "The end date can't be before the start date." : from < oldest.toLocaleDateString("en-CA") ? "Leave can be backdated by 30 days at most." : days === 0 ? "Those dates are weekly offs or company holidays, so no leave is needed." : overlap ? `This overlaps your ${types.name(overlap.type).toLowerCase()} on ${hrDate(overlap.from)}.` : limited && days > balance.remaining ? `You have ${balance.remaining} ${config.name.toLowerCase()} day${balance.remaining === 1 ? "" : "s"} left. Choose fewer days or another leave type.` : reason.trim().length < 5 ? "Give a short reason (at least 5 characters)." : "";
  const showError = Boolean(error) && (reason.length > 0 || !error.startsWith("Give a short"));
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (error) return;
    const request: HrLeaveRequest = { id: `leave-${crypto.randomUUID()}`, employeeId, employeeName: employee.name, managerId: route.id, managerName: route.name ?? "HR", type, from, to, days, reason: reason.trim(), status: "pending", step: route.id && chain !== "hr" ? "manager" : "hr", createdAt: today };
    addLeave(request);
    log({ recordId: request.id, actorId: employeeId, action: "requested", reason: request.reason });
    if (onCreated) onCreated(request);
    else toast.success(`Leave requested. ${request.step === "manager" && manager ? `${manager.name} will review it${route.viaBackup ? " (covering for the usual approver, who is away)" : ""}.` : "HR will review it."}`);
    onDone();
  }
  return <form onSubmit={submit} className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-3">
      <HrField label="Type"><select className={hrInputClass} value={type} onChange={(event) => setType(event.target.value)}>{types.active.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></HrField>
      <HrField label="From"><Input type="date" value={from} onChange={(event) => { setFrom(event.target.value); if (to < event.target.value) setTo(event.target.value); }} className="rounded-none" /></HrField>
      <HrField label="To"><Input type="date" min={from} value={to} onChange={(event) => setTo(event.target.value)} className="rounded-none" /></HrField>
    </div>
    <p className="text-sm">{days > 0 ? <><strong>{dayText(days)}</strong> of leave</> : "No working days selected"}{limited && <span className="text-muted-foreground"> · {balance.remaining} {config?.name.toLowerCase()} {balance.remaining === 1 ? "day" : "days"} available{days > 0 && days <= balance.remaining ? `, ${balance.remaining - days} after this` : ""}</span>}{config && !config.paid && <span className="text-muted-foreground"> · unpaid</span>}</p>
    {config?.documentAfterDays && days > config.documentAfterDays && <p className="border border-warning/40 bg-warning-muted px-3 py-2 text-xs text-warning">{config.name} longer than {config.documentAfterDays} days needs a supporting document. Share it with HR after you apply.</p>}
    <HrField label="Reason"><Textarea required maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} className="rounded-none" /></HrField>
    <p className="text-xs text-muted-foreground">{chain === "hr" ? "Goes straight to HR." : manager ? `Goes to ${manager.name}${chain === "manager_hr" ? ", then HR" : ""}.` : "Goes to HR."} Weekly offs and company holidays aren&apos;t counted.</p>
    {showError && <p role="alert" className="text-sm text-danger">{error}</p>}
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onDone}>Cancel</Button><Button disabled={Boolean(error)}>Submit request</Button></div>
  </form>;
}

const ageDays = (from: string, today: string) => Math.max(0, Math.round((new Date(`${today}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86400000));

/** HR records leave for someone who couldn't apply themselves (a phone call, an emergency). It can be approved at the same time. */
function RecordLeaveDialog({ actorId, onClose }: { actorId: string; onClose: () => void }) {
  const { employees, updateLeave } = useHrPeopleStore();
  const log = useHrOperationsStore((state) => state.log);
  const people = employees.filter((item) => item.status !== "archived" && item.id !== actorId);
  const [employeeId, setEmployeeId] = React.useState(people[0]?.id ?? "");
  const [approve, setApprove] = React.useState(true);
  const actor = employees.find((item) => item.id === actorId)?.name ?? "HR";
  return <HrModal open onOpenChange={(value) => !value && onClose()} title="Record leave for someone" description="Use this when an employee couldn't apply themselves. It is recorded as entered by HR.">
    <div className="space-y-4">
      <HrField label="Employee"><select className={hrInputClass} value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>{people.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.department}</option>)}</select></HrField>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={approve} onChange={(event) => setApprove(event.target.checked)} />Approve it straight away</label>
      {employeeId && <LeaveRequestForm key={`${employeeId}:${approve}`} employeeId={employeeId} onDone={onClose} onCreated={(request) => { log({ recordId: request.id, actorId, action: "recorded_by_hr", reason: `${actor} recorded this leave` }); if (approve) { updateLeave(request.id, "approved", "complete"); log({ recordId: request.id, actorId, action: "approved", reason: "Approved by HR when recorded" }); } toast.success(approve ? "Leave recorded and approved." : "Leave recorded. It follows the normal approval route."); }} />}
    </div>
  </HrModal>;
}

function CancelLeaveDialog({ request, actorId, onClose }: { request: HrLeaveRequest; actorId: string; onClose: () => void }) {
  const updateLeave = useHrPeopleStore((state) => state.updateLeave);
  const log = useHrOperationsStore((state) => state.log);
  const types = useLeaveTypes();
  const [reason, setReason] = React.useState("");
  return <HrModal open onOpenChange={(value) => !value && onClose()} title={`Cancel ${request.employeeName}'s leave?`} description={`${types.name(request.type)} · ${hrDate(request.from)}${request.to !== request.from ? ` – ${hrDate(request.to)}` : ""} · ${dayText(request.days)}. The days go back to their balance.`}>
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (reason.trim().length < 5) return; updateLeave(request.id, "rejected", request.step); log({ recordId: request.id, actorId, action: "cancelled_by_hr", reason: reason.trim() }); toast.success("Leave cancelled and the days returned."); onClose(); }}>
      <HrField label="Reason (the employee sees it)"><Textarea required maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} className="rounded-none" placeholder="e.g. Recalled for the stock audit" /></HrField>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Keep leave</Button><Button disabled={reason.trim().length < 5}>Cancel leave</Button></div>
    </form>
  </HrModal>;
}

/** HR adds or removes days from one person's balance, with a reason. Everyone's yearly days are changed in Leave types instead. */
function AdjustBalanceDialog({ employeeId, actorId, onClose }: { employeeId: string; actorId: string; onClose: () => void }) {
  const employees = useHrPeopleStore((state) => state.employees);
  const addAdjustment = useHrOperationsStore((state) => state.addLeaveAdjustment);
  const log = useHrOperationsStore((state) => state.log);
  const types = useLeaveTypes();
  const person = employees.find((item) => item.id === employeeId);
  const [typeId, setTypeId] = React.useState(types.limited[0]?.id ?? "");
  const [days, setDays] = React.useState("");
  const [reason, setReason] = React.useState("");
  const amount = Number(days);
  const balance = typeId ? types.balance(employeeId, typeId) : null;
  const error = !typeId ? "No leave type with a yearly limit." : days.trim() === "" || !Number.isFinite(amount) || amount === 0 ? "Enter the days to add (positive) or take away (negative)." : Math.abs(amount) > 60 || (amount * 2) % 1 !== 0 ? "Use whole or half days, up to 60." : balance && balance.remaining + amount < 0 ? `That would leave ${balance.remaining + amount} days. Leave already taken or pending can't go negative.` : reason.trim().length < 5 ? "Give a reason (at least 5 characters)." : "";
  if (!person) return null;
  return <HrModal open onOpenChange={(value) => !value && onClose()} title={`Adjust ${person.name}'s leave balance`} description="For example a compensatory off, a carry-forward or a correction. The reason is kept.">
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (error) return; addAdjustment({ id: `adj-${crypto.randomUUID()}`, employeeId, typeId, days: amount, reason: reason.trim(), by: actorId, at: new Date().toISOString() }); log({ recordId: employeeId, actorId, action: "leave_balance_adjusted", reason: `${amount > 0 ? "+" : ""}${amount} ${types.name(typeId)}: ${reason.trim()}` }); toast.success(`${person.name}'s ${types.name(typeId).toLowerCase()} balance is now ${(balance?.remaining ?? 0) + amount}.`); onClose(); }}>
      <div className="grid gap-4 sm:grid-cols-2"><HrField label="Leave type"><select className={hrInputClass} value={typeId} onChange={(event) => setTypeId(event.target.value)}>{types.limited.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></HrField><HrField label="Days (+ add, − take away)"><Input type="number" step="0.5" value={days} onChange={(event) => setDays(event.target.value)} className="rounded-none" placeholder="e.g. 2 or -1" /></HrField></div>
      {balance && <p className="text-sm text-muted-foreground">Now {balance.remaining} available{days.trim() !== "" && Number.isFinite(amount) ? <> · after this <strong className="text-foreground">{balance.remaining + amount}</strong></> : null}</p>}
      <HrField label="Reason"><Textarea required maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} className="rounded-none" /></HrField>
      {error && days !== "" && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={Boolean(error)}>Save adjustment</Button></div>
    </form>
  </HrModal>;
}

function RequestDialog({ employeeId, onClose }: { employeeId: string; onClose: () => void }) {
  return <HrModal open onOpenChange={(value) => !value && onClose()} title="Request leave" description="Your reporting manager reviews it first."><LeaveRequestForm employeeId={employeeId} onDone={onClose} /></HrModal>;
}

function DecisionDialog({ decision, onSubmit, onClose }: { decision: Decision; onSubmit: (reason: string) => void; onClose: () => void }) {
  const types = useLeaveTypes();
  const [reason, setReason] = React.useState("");
  const required = decision.kind !== "approve";
  const verb = decision.kind === "approve" ? "Approve" : decision.kind === "reject" ? "Reject" : "Ask for clarification";
  const { request } = decision;
  return <HrModal open onOpenChange={(value) => !value && onClose()} title={`${verb}: ${request.employeeName}`} description={`${types.name(request.type)} leave · ${hrDate(request.from)}${request.to !== request.from ? ` – ${hrDate(request.to)}` : ""} · ${dayText(request.days)}`}>
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (!required || reason.trim().length >= 5) onSubmit(reason.trim()); }}>
      <p className="text-sm text-muted-foreground">Reason given: {request.reason}</p>
      {decision.mode === "hr" && request.step === "manager" && <p className="border border-info/30 bg-info-muted px-3 py-2 text-xs text-info">You are deciding on the manager&apos;s behalf. This is recorded.</p>}
      {decision.mode === "delegate" && <p className="border border-info/30 bg-info-muted px-3 py-2 text-xs text-info">You are approving as the manager&apos;s delegate. This is recorded.</p>}
      <HrField label={required ? "Reason (required)" : "Note · optional"}><Textarea maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} className="rounded-none" placeholder={decision.kind === "clarify" ? "What do you need to know?" : ""} /></HrField>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={required && reason.trim().length < 5}>{verb}</Button></div>
    </form>
  </HrModal>;
}

function ResponseDialog({ request, onSubmit, onClose }: { request: HrLeaveRequest; onSubmit: (reply: string) => void; onClose: () => void }) {
  const types = useLeaveTypes();
  const [reply, setReply] = React.useState("");
  const { audit } = useHrOperationsStore();
  const question = audit.find((item) => item.recordId === request.id && item.action === "clarification_requested");
  return <HrModal open onOpenChange={(value) => !value && onClose()} title="Reply to clarification" description={`${types.name(request.type)} leave · ${hrDate(request.from)}`}>
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (reply.trim().length >= 3) onSubmit(reply.trim()); }}>
      {question?.reason && <p className="border border-border bg-surface-2 px-3 py-2 text-sm">{question.reason}</p>}
      <HrField label="Your reply"><Textarea required maxLength={300} value={reply} onChange={(event) => setReply(event.target.value)} className="rounded-none" /></HrField>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={reply.trim().length < 3}>Send reply</Button></div>
    </form>
  </HrModal>;
}

function HistoryDialog({ request, entries, nameOf, onClose }: { request: HrLeaveRequest; entries: { id: string; actorId: string; action: string; reason: string; at: string }[]; nameOf: (id: string) => string; onClose: () => void }) {
  const types = useLeaveTypes();
  return <HrModal open onOpenChange={(value) => !value && onClose()} title={`${request.employeeName} · ${types.name(request.type)} leave`} description={`${hrDate(request.from)}${request.to !== request.from ? ` – ${hrDate(request.to)}` : ""} · ${dayText(request.days)} · ${stepLabel(request)}`}>
    {entries.length ? <ol className="divide-y divide-border border border-border text-sm">{entries.map((item) => <li key={item.id} className="px-3 py-2"><p className="capitalize">{item.action.replaceAll("_", " ")}{item.reason ? ` — ${item.reason}` : ""}</p><p className="text-xs text-muted-foreground">{nameOf(item.actorId)} · {when(item.at)}</p></li>)}</ol> : <HrEmpty>No actions recorded for this request yet.</HrEmpty>}
  </HrModal>;
}
