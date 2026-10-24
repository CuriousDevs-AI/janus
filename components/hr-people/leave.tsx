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
import { canDecide, findOverlap, isTeamOf, leaveBalance, leaveTypeLabels, nextAfterApproval, paidLeaveTypes, stepLabel, workingDays, type LeaveType } from "@/lib/hr-leave";
import { HrEmpty, HrField, HrModal, HrPanel, HrStats, HrStatus, HrTable, hrCell, hrDate, hrInputClass, hrToday } from "@/components/hr-people/operations-ui";
import type { HrDemoRole, HrLeaveRequest } from "@/lib/types";

const when = (value: string) => new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const dayText = (days: number) => `${days} day${days === 1 ? "" : "s"}`;
type Decision = { request: HrLeaveRequest; kind: "approve" | "reject" | "clarify"; mode: NonNullable<ReturnType<typeof canDecide>["mode"]> };

export function HrLeaveView({ role, actorId, personal = false }: { role: HrDemoRole; actorId: string; personal?: boolean }) {
  const { employees, leaveRequests, updateLeave } = useHrPeopleStore();
  const { settings, audit, log } = useHrOperationsStore();
  const [requesting, setRequesting] = React.useState(false);
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
      const next = nextAfterApproval(mode, settings);
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
    <HrPanel title={personal ? "My leave requests" : "Leave requests"} description={personal ? "Requests go to your reporting manager, then HR if the policy needs it." : "Approve, reject or ask for clarification. Every decision is recorded."} actions={actor ? <Button size="sm" onClick={() => setRequesting(true)}><Plus className="mr-1 size-3.5" />Request leave</Button> : undefined}>
      {requests.length ? <HrTable headings={["Employee", "Type", "Dates", "Days", "Reason", "Status", "Actions"]}>
        {requests.map((request) => { const verdict = canDecide(request, actorId, role, settings, today); const mine = request.employeeId === actorId; return <tr key={request.id}>
          <td className={hrCell}><p className="font-medium">{request.employeeName}</p><p className="text-xs text-muted-foreground">Approver: {request.managerName}</p></td>
          <td className={hrCell}>{leaveTypeLabels[request.type]}</td>
          <td className={`${hrCell} whitespace-nowrap`}>{hrDate(request.from)}{request.to !== request.from && ` – ${hrDate(request.to)}`}</td>
          <td className={hrCell}>{request.days}</td>
          <td className={`${hrCell} max-w-56 text-muted-foreground`}>{request.reason}</td>
          <td className={hrCell}><HrStatus status={request.status} /><p className="mt-1 text-[11px] text-muted-foreground">{stepLabel(request)}</p></td>
          <td className={hrCell}><div className="flex flex-wrap gap-1">
            {verdict.allowed && verdict.mode && <><Button size="sm" onClick={() => setDecision({ request, kind: "approve", mode: verdict.mode! })}>Approve</Button><Button size="sm" variant="outline" onClick={() => setDecision({ request, kind: "clarify", mode: verdict.mode! })}>Clarify</Button><Button size="sm" variant="outline" onClick={() => setDecision({ request, kind: "reject", mode: verdict.mode! })}>Reject</Button></>}
            {mine && request.status === "needs_clarification" && <Button size="sm" onClick={() => setResponding(request)}>Respond</Button>}
            {mine && (request.status === "pending" || request.status === "needs_clarification") && <Button size="sm" variant="ghost" onClick={() => { updateLeave(request.id, "rejected", request.step); log({ recordId: request.id, actorId, action: "withdrawn", reason: "Withdrawn by the employee" }); toast.success("Request withdrawn"); }}>Withdraw</Button>}
            <Button size="sm" variant="ghost" onClick={() => setHistory(request)}>History</Button>
          </div></td></tr>; })}
      </HrTable> : <HrEmpty>{personal ? "You haven't requested leave yet." : "No leave requests in your scope."}</HrEmpty>}
    </HrPanel>
    {!personal && (wide || role === "reporting_manager") && <TeamBalances employeeIds={[...scopeIds]} />}
    {requesting && actor && <RequestDialog employeeId={actor.id} onClose={() => setRequesting(false)} />}
    {decision && <DecisionDialog decision={decision} onClose={() => setDecision(null)} onSubmit={(reason) => { decide(decision.request, decision.kind, decision.mode, reason); setDecision(null); }} />}
    {responding && <ResponseDialog request={responding} onClose={() => setResponding(null)} onSubmit={(reply) => { updateLeave(responding.id, "pending", responding.step); log({ recordId: responding.id, actorId, action: "clarification_answered", reason: reply }); toast.success("Reply sent. The request is pending again."); setResponding(null); }} />}
    {history && <HistoryDialog request={history} entries={audit.filter((item) => item.recordId === history.id)} nameOf={(id) => employees.find((item) => item.id === id)?.name ?? id} onClose={() => setHistory(null)} />}
    <p className="text-[11px] text-muted-foreground">Acting as {actorName}. Demo records stay in this browser; no emails or WhatsApp messages are sent.</p>
  </div>;
}

function BalanceCards({ employeeId }: { employeeId: string }) {
  const requests = useHrPeopleStore((state) => state.leaveRequests);
  const settings = useHrOperationsStore((state) => state.settings);
  return <div className="grid gap-3 sm:grid-cols-3">{paidLeaveTypes.map((type) => { const balance = leaveBalance(requests, employeeId, type, settings, hrToday()); return <div key={type} className="border border-border bg-surface p-4"><p className="text-xs text-muted-foreground">{leaveTypeLabels[type]} leave</p><p className="mt-2 text-2xl font-semibold tracking-tight">{balance.remaining} <span className="text-sm font-normal text-muted-foreground">of {balance.total} days left</span></p><p className="mt-1 text-xs text-muted-foreground">{balance.used} used{balance.pending ? ` · ${balance.pending} pending` : ""}</p></div>; })}</div>;
}

function TeamBalances({ employeeIds }: { employeeIds: string[] }) {
  const { employees, leaveRequests } = useHrPeopleStore();
  const settings = useHrOperationsStore((state) => state.settings);
  const people = employees.filter((item) => employeeIds.includes(item.id) && item.status !== "archived");
  return <HrPanel title="Leave balances" description="Days remaining this leave year, after approved and pending requests.">
    <HrTable headings={["Employee", ...paidLeaveTypes.map((type) => leaveTypeLabels[type])]}>{people.map((person) => <tr key={person.id}><td className={hrCell}><p className="font-medium">{person.name}</p><p className="text-xs text-muted-foreground">{person.department}</p></td>{paidLeaveTypes.map((type) => { const balance = leaveBalance(leaveRequests, person.id, type, settings, hrToday()); return <td key={type} className={hrCell}><span className={balance.remaining <= 0 ? "text-danger" : ""}>{balance.remaining}</span> <span className="text-xs text-muted-foreground">/ {balance.total}</span></td>; })}</tr>)}</HrTable>
  </HrPanel>;
}

function RequestDialog({ employeeId, onClose }: { employeeId: string; onClose: () => void }) {
  const { employees, leaveRequests, addLeave } = useHrPeopleStore();
  const { settings, log } = useHrOperationsStore();
  const employee = employees.find((item) => item.id === employeeId)!;
  const manager = employees.find((item) => item.id === employee.managerId);
  const today = hrToday();
  const [type, setType] = React.useState<LeaveType>("casual");
  const [from, setFrom] = React.useState(today);
  const [to, setTo] = React.useState(today);
  const [reason, setReason] = React.useState("");
  const days = workingDays(from, to, settings.workWeek);
  const balance = leaveBalance(leaveRequests, employeeId, type, settings, today);
  const oldest = new Date(`${today}T12:00:00`); oldest.setDate(oldest.getDate() - 30);
  const overlap = from && to && to >= from ? findOverlap(leaveRequests, employeeId, from, to) : undefined;
  const error = !from || !to ? "Choose the dates." : to < from ? "The end date can't be before the start date." : from < oldest.toLocaleDateString("en-CA") ? "Leave can be backdated by 30 days at most." : days === 0 ? "Those dates are all weekly offs, so no leave is needed." : overlap ? `This overlaps your ${leaveTypeLabels[overlap.type].toLowerCase()} leave on ${hrDate(overlap.from)}.` : type !== "unpaid" && days > balance.remaining ? `You have ${balance.remaining} ${leaveTypeLabels[type].toLowerCase()} day${balance.remaining === 1 ? "" : "s"} left. Choose fewer days or request unpaid leave.` : reason.trim().length < 5 ? "Give a short reason (at least 5 characters)." : "";
  const showError = Boolean(error) && (reason.length > 0 || !error.startsWith("Give a short"));
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (error) return;
    const request: HrLeaveRequest = { id: `leave-${crypto.randomUUID()}`, employeeId, employeeName: employee.name, managerId: employee.managerId, managerName: employee.managerName ?? "HR", type, from, to, days, reason: reason.trim(), status: "pending", step: employee.managerId ? "manager" : "hr", createdAt: today };
    addLeave(request);
    log({ recordId: request.id, actorId: employeeId, action: "requested", reason: request.reason });
    toast.success(`Leave requested. ${manager ? `${manager.name} will review it.` : "HR will review it."}`);
    onClose();
  }
  return <HrModal open onOpenChange={(value) => !value && onClose()} title="Request leave" description={manager ? `Goes to ${manager.name}${settings.approvalChain === "manager_hr" ? ", then HR" : ""}.` : "Goes to HR."}>
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <HrField label="Type"><select className={hrInputClass} value={type} onChange={(event) => setType(event.target.value as LeaveType)}>{(Object.keys(leaveTypeLabels) as LeaveType[]).map((item) => <option key={item} value={item}>{leaveTypeLabels[item]}</option>)}</select></HrField>
        <HrField label="From"><Input type="date" value={from} onChange={(event) => { setFrom(event.target.value); if (to < event.target.value) setTo(event.target.value); }} className="rounded-none" /></HrField>
        <HrField label="To"><Input type="date" min={from} value={to} onChange={(event) => setTo(event.target.value)} className="rounded-none" /></HrField>
      </div>
      <p className="text-sm">{days > 0 ? <><strong>{dayText(days)}</strong> of leave</> : "No working days selected"}{type !== "unpaid" && <span className="text-muted-foreground"> · {balance.remaining} {leaveTypeLabels[type].toLowerCase()} {balance.remaining === 1 ? "day" : "days"} available{days > 0 && days <= balance.remaining ? `, ${balance.remaining - days} after this` : ""}</span>}</p>
      <HrField label="Reason"><Textarea required maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} className="rounded-none" /></HrField>
      {showError && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={Boolean(error)}>Submit request</Button></div>
    </form>
  </HrModal>;
}

function DecisionDialog({ decision, onSubmit, onClose }: { decision: Decision; onSubmit: (reason: string) => void; onClose: () => void }) {
  const [reason, setReason] = React.useState("");
  const required = decision.kind !== "approve";
  const verb = decision.kind === "approve" ? "Approve" : decision.kind === "reject" ? "Reject" : "Ask for clarification";
  const { request } = decision;
  return <HrModal open onOpenChange={(value) => !value && onClose()} title={`${verb}: ${request.employeeName}`} description={`${leaveTypeLabels[request.type]} leave · ${hrDate(request.from)}${request.to !== request.from ? ` – ${hrDate(request.to)}` : ""} · ${dayText(request.days)}`}>
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
  const [reply, setReply] = React.useState("");
  const { audit } = useHrOperationsStore();
  const question = audit.find((item) => item.recordId === request.id && item.action === "clarification_requested");
  return <HrModal open onOpenChange={(value) => !value && onClose()} title="Reply to clarification" description={`${leaveTypeLabels[request.type]} leave · ${hrDate(request.from)}`}>
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (reply.trim().length >= 3) onSubmit(reply.trim()); }}>
      {question?.reason && <p className="border border-border bg-surface-2 px-3 py-2 text-sm">{question.reason}</p>}
      <HrField label="Your reply"><Textarea required maxLength={300} value={reply} onChange={(event) => setReply(event.target.value)} className="rounded-none" /></HrField>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={reply.trim().length < 3}>Send reply</Button></div>
    </form>
  </HrModal>;
}

function HistoryDialog({ request, entries, nameOf, onClose }: { request: HrLeaveRequest; entries: { id: string; actorId: string; action: string; reason: string; at: string }[]; nameOf: (id: string) => string; onClose: () => void }) {
  return <HrModal open onOpenChange={(value) => !value && onClose()} title={`${request.employeeName} · ${leaveTypeLabels[request.type]} leave`} description={`${hrDate(request.from)}${request.to !== request.from ? ` – ${hrDate(request.to)}` : ""} · ${dayText(request.days)} · ${stepLabel(request)}`}>
    {entries.length ? <ol className="divide-y divide-border border border-border text-sm">{entries.map((item) => <li key={item.id} className="px-3 py-2"><p className="capitalize">{item.action.replaceAll("_", " ")}{item.reason ? ` — ${item.reason}` : ""}</p><p className="text-xs text-muted-foreground">{nameOf(item.actorId)} · {when(item.at)}</p></li>)}</ol> : <HrEmpty>No actions recorded for this request yet.</HrEmpty>}
  </HrModal>;
}
