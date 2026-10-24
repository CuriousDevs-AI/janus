"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { useHrOperationsStore } from "@/lib/stores/hr-operations-store";
import { useHrCareerStore, type CareerChange, type ChangeFields, type ChangeKind } from "@/lib/stores/hr-career-store";
import { applyChange, canDecideChange, changeLines, kindLabels, needsOwnerApproval, snapshot, startingStatus, statusAfterApproval, statusLabels, subordinatesOf } from "@/lib/hr-career";
import { canManageHr, salaryVisible } from "@/lib/hr-people-access";
import { HrEmpty, HrField, HrModal, HrPanel, HrStats, HrStatus, HrTable, hrCell, hrDate, hrInputClass, hrMoney, hrToday } from "@/components/hr-people/operations-ui";
import type { HrDemoRole } from "@/lib/types";

const when = (value: string) => new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const statusTone = (status: CareerChange["status"]) => status === "applied" || status === "approved" ? "approved" : status === "rejected" || status === "withdrawn" ? "rejected" : "pending";

export function HrCareerView({ role, actorId }: { role: HrDemoRole; actorId: string }) {
  const { employees } = useHrPeopleStore();
  const { changes, step } = useHrCareerStore();
  const log = useHrOperationsStore((state) => state.log);
  const [proposing, setProposing] = React.useState(false);
  const [detail, setDetail] = React.useState<CareerChange | null>(null);
  const [rejecting, setRejecting] = React.useState<CareerChange | null>(null);
  const hr = canManageHr(role);
  const showPay = salaryVisible(role);
  const nameOf = (id: string) => employees.find((item) => item.id === id)?.name ?? id;
  const mineReports = new Set(employees.filter((item) => item.managerId === actorId).map((item) => item.id));
  const visible = changes.filter((item) => hr || item.proposedBy === actorId || mineReports.has(item.employeeId));
  const waiting = visible.filter((item) => canDecideChange(item, actorId, role));
  const year = hrToday().slice(0, 4);

  function approve(change: CareerChange) {
    const status = statusAfterApproval(change, role);
    step(change.id, { actorId, action: "approved" }, status);
    log({ recordId: change.id, actorId, action: "career_change_approved", reason: `${kindLabels[change.kind]} for ${nameOf(change.employeeId)}` });
    const fresh = useHrCareerStore.getState().changes.find((item) => item.id === change.id);
    if (status === "approved" && fresh && fresh.effectiveDate <= hrToday()) { applyChange(fresh, actorId); toast.success("Approved and in effect. The letter is in the employee's documents."); }
    else toast.success(status === "pending_owner" ? "Approved by HR. Now waiting for the Owner." : `Approved. It starts on ${hrDate(change.effectiveDate)}.`);
  }

  return <div className="space-y-5">
    <HrStats items={[{ label: "Waiting for you", value: waiting.length, hint: "Changes you can decide" }, { label: "Waiting for others", value: visible.filter((item) => item.status === "pending_hr" || item.status === "pending_owner").length - waiting.length, hint: "Pending HR or the Owner" }, { label: "Scheduled", value: visible.filter((item) => item.status === "approved").length, hint: "Approved, not yet started" }, { label: `In effect in ${year}`, value: visible.filter((item) => item.status === "applied" && item.steps.some((entry) => entry.action === "applied" && entry.at.startsWith(year))).length, hint: "Promotions, transfers and pay" }]} />
    <HrPanel title="Promotions & changes" description="Promotions, transfers, salary revisions and reporting-manager changes. Whoever proposes a change can't approve it." actions={<Button size="sm" onClick={() => setProposing(true)}><Plus className="mr-1 size-3.5" />Propose a change</Button>}>
      {visible.length ? <HrTable headings={["Employee", "Change", "Effective", "Proposed by", "Status", ""]}>{visible.map((change) => { const lines = changeLines(change, showPay); return <tr key={change.id}>
        <td className={`${hrCell} font-medium`}>{nameOf(change.employeeId)}</td>
        <td className={hrCell}><p className="font-medium">{kindLabels[change.kind]}</p><ul className="text-xs text-muted-foreground">{lines.map((line) => <li key={line}>{line}</li>)}</ul></td>
        <td className={hrCell}>{hrDate(change.effectiveDate)}</td>
        <td className={hrCell}>{nameOf(change.proposedBy)}</td>
        <td className={hrCell}><HrStatus status={statusTone(change.status)} /><p className="mt-1 text-[11px] text-muted-foreground">{statusLabels[change.status]}</p></td>
        <td className={hrCell}><div className="flex flex-wrap gap-1">
          {canDecideChange(change, actorId, role) && <><Button size="sm" onClick={() => approve(change)}>Approve</Button><Button size="sm" variant="outline" onClick={() => setRejecting(change)}>Reject</Button></>}
          {change.proposedBy === actorId && (change.status === "pending_hr" || change.status === "pending_owner") && <Button size="sm" variant="ghost" onClick={() => { step(change.id, { actorId, action: "withdrawn" }, "withdrawn"); log({ recordId: change.id, actorId, action: "career_change_withdrawn", reason: "" }); toast.success("Withdrawn"); }}>Withdraw</Button>}
          <Button size="sm" variant="ghost" onClick={() => setDetail(change)}>Details</Button></div></td></tr>; })}</HrTable> : <HrEmpty>No changes yet. Use Propose a change to start one.</HrEmpty>}
    </HrPanel>
    {proposing && <ProposeDialog role={role} actorId={actorId} onClose={() => setProposing(false)} />}
    {rejecting && <RejectDialog change={rejecting} name={nameOf(rejecting.employeeId)} onClose={() => setRejecting(null)} onSubmit={(reason) => { step(rejecting.id, { actorId, action: "rejected", reason }, "rejected"); log({ recordId: rejecting.id, actorId, action: "career_change_rejected", reason }); toast.success("Rejected"); setRejecting(null); }} />}
    {detail && <HrModal open onOpenChange={(value) => !value && setDetail(null)} title={`${kindLabels[detail.kind]} · ${nameOf(detail.employeeId)}`} description={`Effective ${hrDate(detail.effectiveDate)} · ${statusLabels[detail.status]}`}>
      <div className="space-y-4 text-sm"><ul className="border border-border bg-surface-2 p-3 text-sm">{changeLines(detail, showPay).map((line) => <li key={line}>{line}</li>)}</ul><p><span className="text-muted-foreground">Reason: </span>{detail.reason}</p>
        {detail.needsOwner && <p className="text-xs text-muted-foreground">Needs the Owner&apos;s approval because it changes pay or role.</p>}
        {detail.letterDocumentId && <p className="text-xs"><Link className="text-accent underline" href="/workspace/hr-people?view=documents&workspace=hr-people">A letter was created in the employee&apos;s documents.</Link></p>}
        <div><h3 className="mb-2 text-sm font-semibold">History</h3><ol className="divide-y divide-border border border-border">{detail.steps.map((item) => <li key={item.id} className="px-3 py-2"><p className="capitalize">{item.action}{item.reason ? ` — ${item.reason}` : ""}</p><p className="text-xs text-muted-foreground">{nameOf(item.actorId)} · {when(item.at)}</p></li>)}</ol></div></div>
    </HrModal>}
  </div>;
}

function RejectDialog({ change, name, onSubmit, onClose }: { change: CareerChange; name: string; onSubmit: (reason: string) => void; onClose: () => void }) {
  const [reason, setReason] = React.useState("");
  return <HrModal open onOpenChange={(value) => !value && onClose()} title={`Reject ${kindLabels[change.kind].toLowerCase()} for ${name}`} description="The proposer sees your reason.">
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (reason.trim().length >= 5) onSubmit(reason.trim()); }}>
      <Textarea aria-label="Reason" required maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} className="rounded-none" />
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={reason.trim().length < 5}>Reject</Button></div>
    </form>
  </HrModal>;
}

function ProposeDialog({ role, actorId, onClose }: { role: HrDemoRole; actorId: string; onClose: () => void }) {
  const { employees } = useHrPeopleStore();
  const settings = useHrOperationsStore((state) => state.settings);
  const propose = useHrCareerStore((state) => state.propose);
  const log = useHrOperationsStore((state) => state.log);
  const hr = canManageHr(role);
  const pay = salaryVisible(role) && hr;
  const eligible = employees.filter((item) => item.status !== "archived" && item.id !== actorId && item.managerId !== null && (hr || item.managerId === actorId));
  const kinds: ChangeKind[] = pay ? ["promotion", "transfer", "salary_revision", "manager_change"] : ["promotion", "transfer", "manager_change"];
  const [employeeId, setEmployeeId] = React.useState(eligible[0]?.id ?? "");
  const [kind, setKind] = React.useState<ChangeKind>("promotion");
  const [effective, setEffective] = React.useState(hrToday());
  const [title, setTitle] = React.useState("");
  const [department, setDepartment] = React.useState("");
  const [branch, setBranch] = React.useState("");
  const [managerId, setManagerId] = React.useState("");
  const [salary, setSalary] = React.useState("");
  const [reason, setReason] = React.useState("");
  const employee = employees.find((item) => item.id === employeeId);
  const blocked = employee ? subordinatesOf(employees, employee.id) : new Set<string>();
  const managers = employees.filter((item) => item.status !== "archived" && item.id !== employeeId && !blocked.has(item.id));
  const departments = [...new Set(employees.map((item) => item.department))];
  const branches = [...new Set(employees.map((item) => item.branch))];
  const show = { title: kind === "promotion", department: kind === "promotion" || kind === "transfer", branch: kind === "transfer", manager: kind !== "salary_revision", salary: pay && (kind === "promotion" || kind === "salary_revision") };

  const to: ChangeFields = {};
  if (show.title && title.trim() && employee && title.trim() !== employee.title) to.title = title.trim();
  if (show.department && department.trim() && employee && department.trim() !== employee.department) to.department = department.trim();
  if (show.branch && branch.trim() && employee && branch.trim() !== employee.branch) to.branch = branch.trim();
  const newManager = managers.find((item) => item.id === managerId);
  if (show.manager && newManager && employee && newManager.id !== employee.managerId) { to.managerId = newManager.id; to.managerName = newManager.name; }
  const pay2 = Number(salary);
  if (show.salary && salary.trim() && employee && pay2 !== employee.salaryMonthly) to.salaryMonthly = pay2;
  const before = employee ? snapshot(employee) : undefined;
  const ownerNeeded = before ? needsOwnerApproval(before, to, settings) : false;
  const raise = employee && to.salaryMonthly && employee.salaryMonthly ? ((to.salaryMonthly - employee.salaryMonthly) / employee.salaryMonthly) * 100 : 0;
  const error = !employee ? "Choose an employee." : !Object.keys(to).length ? "Change at least one thing." : kind === "promotion" && !to.title ? "A promotion needs a new role." : kind === "transfer" && !to.department && !to.branch && to.managerId === undefined ? "A transfer needs a new department, branch or manager." : kind === "manager_change" && to.managerId === undefined ? "Choose the new reporting manager." : kind === "salary_revision" && to.salaryMonthly === undefined ? "Enter the new monthly pay." : show.salary && salary.trim() && (!Number.isFinite(pay2) || pay2 <= 0 || pay2 > 10_000_000) ? "Enter a monthly pay between ₹1 and ₹1 crore." : effective < hrToday() ? "The start date can't be in the past." : reason.trim().length < 10 ? "Explain the reason (at least 10 characters)." : "";
  const showError = Boolean(error) && (reason.length > 0 || !error.startsWith("Explain"));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (error || !employee || !before) return;
    const change: CareerChange = { id: `chg-${crypto.randomUUID()}`, employeeId: employee.id, kind, effectiveDate: effective, reason: reason.trim(), proposedBy: actorId, proposerRole: role, proposedAt: new Date().toISOString(), status: startingStatus(role, ownerNeeded), needsOwner: ownerNeeded, before, to, steps: [{ id: crypto.randomUUID(), actorId, action: "proposed", reason: reason.trim(), at: new Date().toISOString() }] };
    propose(change);
    log({ recordId: change.id, actorId, action: "career_change_proposed", reason: `${kindLabels[kind]} for ${employee.name}` });
    toast.success(`Sent. ${change.status === "pending_owner" ? "The Owner approves it next." : "HR reviews it next."}`);
    onClose();
  }

  return <HrModal open onOpenChange={(value) => !value && onClose()} title="Propose a change" description="It starts only after the right people approve it.">
    <form className="space-y-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2"><HrField label="Employee"><select className={hrInputClass} value={employeeId} onChange={(event) => { setEmployeeId(event.target.value); setManagerId(""); }}>{eligible.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.title}</option>)}</select></HrField><HrField label="What kind of change?"><select className={hrInputClass} value={kind} onChange={(event) => setKind(event.target.value as ChangeKind)}>{kinds.map((item) => <option key={item} value={item}>{kindLabels[item]}</option>)}</select></HrField></div>
      {employee && <p className="border border-border bg-surface-2 px-3 py-2 text-xs text-muted-foreground">Today: {employee.title} · {employee.department} · {employee.branch} · reports to {employee.managerName ?? "no one"}{pay ? ` · ${hrMoney(employee.salaryMonthly)} a month` : ""}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {show.title && <HrField label="New role"><Input value={title} maxLength={60} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Senior Account Executive" className="rounded-none" /></HrField>}
        {show.department && <HrField label={kind === "transfer" ? "New department" : "New department · optional"}><Input list="career-departments" value={department} maxLength={40} onChange={(event) => setDepartment(event.target.value)} className="rounded-none" /></HrField>}
        {show.branch && <HrField label="New branch · optional"><Input list="career-branches" value={branch} maxLength={40} onChange={(event) => setBranch(event.target.value)} className="rounded-none" /></HrField>}
        {show.manager && <HrField label={kind === "manager_change" ? "New reporting manager" : "New reporting manager · optional"}><select className={hrInputClass} value={managerId} onChange={(event) => setManagerId(event.target.value)}><option value="">{kind === "manager_change" ? "Choose…" : "No change"}</option>{managers.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.title}</option>)}</select></HrField>}
        {show.salary && <HrField label={kind === "salary_revision" ? "New monthly pay (₹)" : "New monthly pay (₹) · optional"}><Input type="number" min={0} inputMode="numeric" value={salary} onChange={(event) => setSalary(event.target.value)} className="rounded-none" /></HrField>}
        <HrField label="Starts on"><Input type="date" min={hrToday()} value={effective} onChange={(event) => setEffective(event.target.value)} className="rounded-none" /></HrField>
      </div>
      <datalist id="career-departments">{departments.map((item) => <option key={item} value={item} />)}</datalist><datalist id="career-branches">{branches.map((item) => <option key={item} value={item} />)}</datalist>
      {!pay && <p className="text-xs text-muted-foreground">Pay changes are proposed by HR. Mention a suggested raise in the reason if you want one considered.</p>}
      {raise > 40 && <p className="border border-warning/40 bg-warning-muted px-3 py-2 text-xs text-warning">That is a {Math.round(raise)}% raise. Check the amount before sending.</p>}
      <HrField label="Reason"><Textarea required maxLength={400} value={reason} onChange={(event) => setReason(event.target.value)} className="rounded-none" placeholder="What has this person done, and why now?" /></HrField>
      {before && Object.keys(to).length > 0 && <p className="text-xs text-muted-foreground">Goes to: {startingStatus(role, ownerNeeded) === "pending_owner" ? "the Owner" : "HR for review"}{ownerNeeded && startingStatus(role, ownerNeeded) === "pending_hr" && role !== "owner" ? ", then the Owner (pay or role changes)" : ""}.</p>}
      {showError && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={Boolean(error)}>Send for approval</Button></div>
    </form>
  </HrModal>;
}

