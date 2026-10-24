"use client";

import * as React from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { useHrOperationsStore, type HrPolicySettings } from "@/lib/stores/hr-operations-store";
import { canManageHr } from "@/lib/hr-people-access";
import { isTeamOf } from "@/lib/hr-leave";
import { HrEmpty, HrField, HrModal, HrPanel, HrStats, HrStatus, HrTable, hrCell, hrDate, hrInputClass, hrMoney, hrToday } from "@/components/hr-people/operations-ui";
import type { HrDemoRole, HrEmployee, HrExpenseClaim } from "@/lib/types";

export const expenseLabels: Record<HrExpenseClaim["category"], string> = { travel: "Travel", meals: "Meals", phone: "Phone", supplies: "Supplies", other: "Other" };
export const RECEIPT_ABOVE = 1000;
const MAX_RECEIPT = 1024 * 1024;
const when = (value: string) => new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** Who may decide a claim at its current step. Nobody decides their own claim. */
export function canDecideExpense(claim: HrExpenseClaim, claimant: HrEmployee | undefined, actorId: string, role: HrDemoRole, actorIsManagerOf: boolean): { allowed: boolean; mode?: "manager" | "hr" | "finance" } {
  if (claim.employeeId === actorId) return { allowed: false };
  const hr = canManageHr(role);
  if (claim.status === "manager_review") return actorIsManagerOf && claimant?.managerId === actorId ? { allowed: true, mode: "manager" } : hr ? { allowed: true, mode: "hr" } : { allowed: false };
  if (claim.status === "hr_review") return hr ? { allowed: true, mode: "hr" } : { allowed: false };
  if (claim.status === "approved") return hr || role === "payroll_admin" ? { allowed: true, mode: "finance" } : { allowed: false };
  return { allowed: false };
}
export function nextExpenseStatus(mode: "manager" | "hr" | "finance", settings: HrPolicySettings): HrExpenseClaim["status"] {
  if (mode === "finance") return "paid";
  if (mode === "manager" && settings.approvalChain === "manager_hr") return "hr_review";
  return "approved";
}
const statusText: Record<HrExpenseClaim["status"], string> = { submitted: "submitted", manager_review: "manager review", hr_review: "HR review", approved: "approved", rejected: "rejected", paid: "paid" };

export function HrExpensesView({ role, actorId, personal = false }: { role: HrDemoRole; actorId: string; personal?: boolean }) {
  const { employees, expenseClaims, updateExpense } = useHrPeopleStore();
  const { settings, evidence, audit, log } = useHrOperationsStore();
  const [submitting, setSubmitting] = React.useState(false);
  const [detail, setDetail] = React.useState<HrExpenseClaim | null>(null);
  const [rejecting, setRejecting] = React.useState<HrExpenseClaim | null>(null);
  // Personal mode is the employee's own reimbursements: only their claims, whatever their role.
  const wide = !personal && (canManageHr(role) || role === "payroll_admin");
  const actor = employees.find((item) => item.id === actorId);
  const managesAny = employees.some((item) => item.managerId === actorId);
  const scopeIds = new Set(employees.filter((item) => wide || (!personal && role === "reporting_manager" ? isTeamOf(item, actorId) : item.id === actorId)).map((item) => item.id));
  const claims = expenseClaims.filter((item) => scopeIds.has(item.employeeId)).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const verdict = (claim: HrExpenseClaim) => canDecideExpense(claim, employees.find((item) => item.id === claim.employeeId), actorId, role, managesAny);
  const month = hrToday().slice(0, 7);
  const monthTotal = claims.filter((item) => item.submittedAt.startsWith(month) && item.status !== "rejected").reduce((sum, item) => sum + item.amount, 0);

  function decide(claim: HrExpenseClaim, mode: "manager" | "hr" | "finance") {
    const status = nextExpenseStatus(mode, settings);
    updateExpense(claim.id, status);
    log({ recordId: claim.id, actorId, action: status === "paid" ? "marked_paid" : status === "hr_review" ? "approved_by_manager" : "approved", reason: mode === "hr" && claim.status === "manager_review" ? "Approved by HR on the manager's behalf" : "" });
    toast.success(status === "paid" ? "Marked as paid. Nothing is transferred from here." : status === "hr_review" ? "Approved. Sent to HR." : "Claim approved");
  }

  return <div className="space-y-5">
    <HrStats items={[{ label: "Claims in view", value: claims.length, hint: wide ? "Everyone" : !personal && role === "reporting_manager" ? "You and your team" : "Yours" }, { label: "Waiting for you", value: claims.filter((item) => verdict(item).allowed).length, hint: "Claims you can decide" }, { label: "Claimed this month", value: hrMoney(monthTotal), hint: "Excluding rejected" }, { label: "Receipt rule", value: `Above ${hrMoney(RECEIPT_ABOVE)}`, hint: "A receipt is required" }]} />
    <HrPanel title="Expenses & reimbursements" description={`Claims go to the reporting manager${settings.approvalChain === "manager_hr" ? ", then HR" : ""}. Finance marks them paid once approved. No money moves from this screen.`} actions={actor ? <Button size="sm" onClick={() => setSubmitting(true)}><Plus className="mr-1 size-3.5" />Submit expense</Button> : undefined}>
      {claims.length ? <HrTable headings={["Employee", "Category", "Amount", "Submitted", "Status", "Actions"]}>{claims.map((claim) => { const v = verdict(claim); return <tr key={claim.id}>
        <td className={hrCell}><p className="font-medium">{claim.employeeName}</p><p className="text-xs text-muted-foreground">Approver: {claim.approverName}</p></td>
        <td className={hrCell}>{expenseLabels[claim.category]}</td><td className={hrCell}>{hrMoney(claim.amount)}</td><td className={hrCell}>{hrDate(claim.submittedAt)}</td>
        <td className={hrCell}><HrStatus status={statusText[claim.status].replaceAll(" ", "_")} /></td>
        <td className={hrCell}><div className="flex flex-wrap gap-1">
          {v.allowed && v.mode && <><Button size="sm" onClick={() => decide(claim, v.mode!)}>{v.mode === "finance" ? "Mark paid" : "Approve"}</Button>{v.mode !== "finance" && <Button size="sm" variant="outline" onClick={() => setRejecting(claim)}>Reject</Button>}</>}
          <Button size="sm" variant="ghost" onClick={() => setDetail(claim)}>Details</Button></div></td></tr>; })}</HrTable> : <HrEmpty>{actor ? "No expense claims yet. Use Submit expense to add one." : "No expense claims in your scope."}</HrEmpty>}
    </HrPanel>
    {submitting && actor && <SubmitDialog actor={actor} onClose={() => setSubmitting(false)} />}
    {rejecting && <ReasonDialog claim={rejecting} onClose={() => setRejecting(null)} onSubmit={(reason) => { updateExpense(rejecting.id, "rejected"); log({ recordId: rejecting.id, actorId, action: "rejected", reason }); toast.success("Claim rejected"); setRejecting(null); }} />}
    {detail && <DetailDialog claim={detail} evidence={evidence[detail.id]} entries={audit.filter((item) => item.recordId === detail.id)} nameOf={(id) => employees.find((item) => item.id === id)?.name ?? id} onClose={() => setDetail(null)} />}
  </div>;
}

function SubmitDialog({ actor, onClose }: { actor: HrEmployee; onClose: () => void }) {
  const { employees, addExpense } = useHrPeopleStore();
  const { saveEvidence, log } = useHrOperationsStore();
  const today = hrToday();
  const oldest = new Date(`${today}T12:00:00`); oldest.setDate(oldest.getDate() - 90);
  const min = oldest.toLocaleDateString("en-CA");
  const [category, setCategory] = React.useState<HrExpenseClaim["category"]>("travel");
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(today);
  const [description, setDescription] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [fileError, setFileError] = React.useState("");
  const value = Number(amount);
  const error = !amount || !Number.isFinite(value) || value <= 0 ? "Enter the amount you spent." : value > 500000 ? "Claims above ₹5,00,000 need to go through Finance directly." : !date || date > today ? "The expense date can't be in the future." : date < min ? "Claims go back 90 days at most." : description.trim().length < 5 ? "Add a short business purpose (at least 5 characters)." : value > RECEIPT_ABOVE && !file ? `Attach a receipt for claims above ${hrMoney(RECEIPT_ABOVE)}.` : "";
  const showError = Boolean(error) && (amount !== "" || description !== "");
  const manager = employees.find((item) => item.id === actor.managerId);
  function pick(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null;
    setFileError("");
    if (next && next.size > MAX_RECEIPT) { setFileError("Choose a receipt under 1 MB."); event.target.value = ""; setFile(null); return; }
    setFile(next);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (error || busy) return;
    setBusy(true);
    const dataUrl = file ? await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("The receipt couldn't be read.")); reader.readAsDataURL(file); }).catch(() => "") : "";
    const id = `expense-${crypto.randomUUID()}`;
    addExpense({ id, employeeId: actor.id, employeeName: actor.name, category, amount: Math.round(value * 100) / 100, submittedAt: today, status: manager ? "manager_review" : "hr_review", approverName: manager?.name ?? "HR", receiptAttached: Boolean(file && dataUrl) });
    saveEvidence(id, { description: description.trim(), date, filename: file?.name, mime: file?.type, dataUrl: dataUrl || undefined });
    log({ recordId: id, actorId: actor.id, action: "submitted", reason: description.trim() });
    toast.success(`Claim submitted. ${manager ? `${manager.name} will review it.` : "HR will review it."}`);
    onClose();
  }
  return <HrModal open onOpenChange={(open) => !open && !busy && onClose()} title="Submit an expense" description={`Goes to ${manager?.name ?? "HR"}. Receipts stay in this browser in the demo.`}>
    <form className="space-y-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-3">
        <HrField label="Category"><select className={hrInputClass} value={category} onChange={(event) => setCategory(event.target.value as HrExpenseClaim["category"])}>{(Object.keys(expenseLabels) as HrExpenseClaim["category"][]).map((item) => <option key={item} value={item}>{expenseLabels[item]}</option>)}</select></HrField>
        <HrField label="Amount (₹)"><Input type="number" min={1} step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="rounded-none" /></HrField>
        <HrField label="Date of expense"><Input type="date" min={min} max={today} value={date} onChange={(event) => setDate(event.target.value)} className="rounded-none" /></HrField>
      </div>
      <HrField label="Business purpose"><Textarea required maxLength={300} value={description} onChange={(event) => setDescription(event.target.value)} className="rounded-none" placeholder="e.g. Taxi to the Jaipur warehouse for stock handover" /></HrField>
      <HrField label={`Receipt${value > RECEIPT_ABOVE ? " (required)" : " · optional"}`}><Input type="file" accept="image/*,.pdf,.txt" onChange={pick} className="rounded-none" /></HrField>
      {fileError && <p role="alert" className="text-sm text-danger">{fileError}</p>}
      {showError && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button disabled={Boolean(error) || busy}>{busy ? "Submitting…" : "Submit claim"}</Button></div>
    </form>
  </HrModal>;
}

function ReasonDialog({ claim, onSubmit, onClose }: { claim: HrExpenseClaim; onSubmit: (reason: string) => void; onClose: () => void }) {
  const [reason, setReason] = React.useState("");
  return <HrModal open onOpenChange={(open) => !open && onClose()} title={`Reject ${claim.employeeName}'s claim`} description={`${expenseLabels[claim.category]} · ${hrMoney(claim.amount)}. The employee sees your reason.`}>
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (reason.trim().length >= 5) onSubmit(reason.trim()); }}>
      <Textarea aria-label="Reason" required maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} className="rounded-none" />
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={reason.trim().length < 5}>Reject claim</Button></div>
    </form>
  </HrModal>;
}

function DetailDialog({ claim, evidence, entries, nameOf, onClose }: { claim: HrExpenseClaim; evidence?: { description: string; date: string; filename?: string; dataUrl?: string }; entries: { id: string; actorId: string; action: string; reason: string; at: string }[]; nameOf: (id: string) => string; onClose: () => void }) {
  return <HrModal open onOpenChange={(open) => !open && onClose()} title={`${claim.employeeName} · ${hrMoney(claim.amount)}`} description={`${expenseLabels[claim.category]} · submitted ${hrDate(claim.submittedAt)}`}>
    <div className="space-y-4 text-sm">
      <div className="flex items-center justify-between"><span className="text-muted-foreground">Approver: {claim.approverName}</span><HrStatus status={statusText[claim.status].replaceAll(" ", "_")} /></div>
      {evidence ? <div className="space-y-1 border border-border p-3"><p>{evidence.description}</p><p className="text-xs text-muted-foreground">Expense date {hrDate(evidence.date)}</p></div> : <p className="text-xs text-muted-foreground">No purpose was recorded for this older claim.</p>}
      {evidence?.dataUrl ? <a className="inline-block text-sm text-accent underline" href={evidence.dataUrl} download={evidence.filename ?? "receipt"}>Download receipt{evidence.filename ? ` (${evidence.filename})` : ""}</a> : <p className="text-xs text-muted-foreground">{claim.receiptAttached ? "A receipt was attached but isn't stored in this demo." : "No receipt attached."}</p>}
      <div><h3 className="mb-2 text-sm font-semibold">History</h3>{entries.length ? <ol className="divide-y divide-border border border-border">{entries.map((item) => <li key={item.id} className="px-3 py-2"><p className="capitalize">{item.action.replaceAll("_", " ")}{item.reason ? ` — ${item.reason}` : ""}</p><p className="text-xs text-muted-foreground">{nameOf(item.actorId)} · {when(item.at)}</p></li>)}</ol> : <HrEmpty>No actions recorded yet.</HrEmpty>}</div>
    </div>
  </HrModal>;
}
