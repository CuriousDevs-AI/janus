"use client";

import * as React from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { blankCandidateDetail, lifecycleEvent, useHrLifecycleStore, type HrCandidateDetail } from "@/lib/stores/hr-lifecycle-store";
import { canManageHr, salaryVisible } from "@/lib/hr-people-access";
import { HrField, HrModal, HrPanel, HrStats, HrStatus, hrDate, hrInputClass, hrMoney, hrToday } from "@/components/hr-people/operations-ui";
import type { HrCandidate, HrDemoRole } from "@/lib/types";

const stages = ["screening", "interview", "offer", "accepted"] as const;
const stageLabels: Record<HrCandidate["stage"], string> = { screening: "Screening", interview: "Interview", offer: "Offer", accepted: "Accepted", rejected: "Rejected" };
const dateTime = (value: string) => new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
const departments = ["Management", "People", "Sales", "Operations", "Finance", "Support"];

export function HrRecruitmentView({ role, actorId }: { role: HrDemoRole; actorId: string }) {
  const { candidates, employees, addCandidate } = useHrPeopleStore();
  const details = useHrLifecycleStore((state) => state.candidateDetails);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [showRejected, setShowRejected] = React.useState(false);
  const manager = canManageHr(role);
  const actorName = employees.find((item) => item.id === actorId)?.name ?? "HR";
  const open = candidates.filter((item) => !["accepted", "rejected"].includes(item.stage));
  const selected = candidates.find((item) => item.id === selectedId);
  const rejected = candidates.filter((item) => item.stage === "rejected");
  const offersOut = candidates.filter((item) => item.stage === "offer" && details[item.id]?.offer.status === "sent").length;

  return <div className="space-y-5">
    <HrStats items={[{ label: "Open candidates", value: open.length, hint: "Screening to offer" }, { label: "Interviews", value: candidates.filter((item) => item.stage === "interview").length, hint: "Scheduled or in progress" }, { label: "Offers awaiting reply", value: offersOut, hint: "Sent, not yet answered" }, { label: "Ready to onboard", value: candidates.filter((item) => item.stage === "accepted" && !item.convertedEmployeeId).length, hint: "Accepted, no employee record yet" }]} />
    <HrPanel title="Hiring pipeline" description="Move people through the stages. Accepted candidates become the employee record used by onboarding, documents and payroll." actions={<div className="flex gap-2">{rejected.length > 0 && <Button size="sm" variant="outline" onClick={() => setShowRejected(!showRejected)}>{showRejected ? "Hide" : "Show"} rejected ({rejected.length})</Button>}{manager && <Button size="sm" onClick={() => setAdding(true)}><Plus className="mr-1 size-3.5" />Add candidate</Button>}</div>}>
      <div className={`grid gap-3 p-4 md:grid-cols-2 ${showRejected ? "xl:grid-cols-5" : "xl:grid-cols-4"}`}>
        {[...stages, ...(showRejected ? ["rejected" as const] : [])].map((stage) => { const column = candidates.filter((item) => item.stage === stage); return <section key={stage} aria-label={`${stageLabels[stage]} candidates`} className="border border-border bg-surface-2 p-3"><div className="mb-3 flex items-center justify-between"><h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{stageLabels[stage]}</h3><span className="text-xs text-muted-foreground">{column.length}</span></div><div className="flex flex-col gap-2">
          {column.map((item) => { const detail = details[item.id]; return <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className="border border-border bg-surface p-3 text-left hover:border-accent"><p className="text-sm font-medium">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{item.role} · {item.department}</p><div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground"><span>Score {item.score}</span>{stage === "interview" && detail?.interviewAt && <span>· {dateTime(detail.interviewAt)}</span>}{stage === "offer" && detail && <HrStatus status={detail.offer.status} />}{stage === "accepted" && <span>{item.convertedEmployeeId ? "· Onboarding opened" : "· Ready to onboard"}</span>}</div></button>; })}
          {!column.length && <p className="px-1 py-4 text-center text-xs text-muted-foreground">Nobody here</p>}
        </div></section>; })}
      </div>
    </HrPanel>
    {selected && <CandidateDialog key={selected.id} candidate={selected} role={role} manager={manager} actorName={actorName} onClose={() => setSelectedId(null)} />}
    {adding && <AddCandidateDialog actorName={actorName} existingEmails={candidates.map((item) => item.email.toLowerCase())} onClose={() => setAdding(false)} onAdd={(candidate, detail) => { addCandidate(candidate); useHrLifecycleStore.getState().setCandidateDetail(candidate.id, detail); setAdding(false); setSelectedId(candidate.id); toast.success("Candidate added to screening"); }} />}
  </div>;
}

function CandidateDialog({ candidate, role, manager, actorName, onClose }: { candidate: HrCandidate; role: HrDemoRole; manager: boolean; actorName: string; onClose: () => void }) {
  const { updateCandidate, convertCandidate, updateEmployee } = useHrPeopleStore();
  const stored = useHrLifecycleStore((state) => state.candidateDetails[candidate.id]);
  const { setCandidateDetail, addCandidateEvent, addCandidateNote } = useHrLifecycleStore();
  const detail: HrCandidateDetail = stored ?? blankCandidateDetail();
  const showSalary = salaryVisible(role);
  const [note, setNote] = React.useState("");
  const [offer, setOffer] = React.useState({ salaryMonthly: detail.offer.salaryMonthly ? String(detail.offer.salaryMonthly) : "", joiningDate: detail.offer.joiningDate, location: detail.offer.location });
  const [error, setError] = React.useState("");
  const locked = !manager || candidate.stage === "rejected" || candidate.stage === "accepted" || ["accepted", "rejected"].includes(detail.offer.status);
  const log = (text: string) => addCandidateEvent(candidate.id, lifecycleEvent(actorName, text));

  function move(stage: HrCandidate["stage"]) {
    updateCandidate(candidate.id, { stage });
    log(`Moved to ${stageLabels[stage]}.`);
    toast.success(`Moved to ${stageLabels[stage]}`);
  }
  function addNote() {
    if (!note.trim()) return;
    addCandidateNote(candidate.id, lifecycleEvent(actorName, note.trim()));
    setNote("");
  }
  function validOffer() {
    const salary = Number(offer.salaryMonthly);
    if (!salary || salary <= 0) return "Enter the monthly salary offered.";
    if (!offer.joiningDate) return "Choose the proposed joining date.";
    if (offer.joiningDate < hrToday()) return "The joining date cannot be in the past.";
    if (!offer.location.trim()) return "Enter the work location.";
    return "";
  }
  function saveOffer(status: "draft" | "sent") {
    const problem = validOffer();
    setError(problem);
    if (problem) return;
    const changed = Number(offer.salaryMonthly) !== detail.offer.salaryMonthly || offer.joiningDate !== detail.offer.joiningDate || offer.location !== detail.offer.location;
    const version = detail.offer.status === "sent" && changed ? detail.offer.version + 1 : detail.offer.version;
    setCandidateDetail(candidate.id, { offer: { salaryMonthly: Number(offer.salaryMonthly), joiningDate: offer.joiningDate, location: offer.location.trim(), status, version } });
    log(status === "sent" ? `Offer v${version} sent: ${hrMoney(Number(offer.salaryMonthly))}/month, joining ${hrDate(offer.joiningDate)}.` : `Offer draft saved (v${version}).`);
    toast.success(status === "sent" ? `Offer v${version} marked as sent (demo — nothing is emailed)` : "Offer draft saved");
  }
  function reply(answer: "accepted" | "rejected") {
    setCandidateDetail(candidate.id, { offer: { ...detail.offer, status: answer } });
    updateCandidate(candidate.id, { stage: answer === "accepted" ? "accepted" : "rejected" });
    log(answer === "accepted" ? `Offer v${detail.offer.version} accepted.` : `Offer v${detail.offer.version} declined by the candidate.`);
    toast.success(answer === "accepted" ? "Offer accepted. Start onboarding when ready." : "Offer declined. Candidate moved to Rejected.");
  }
  function reviseOffer() {
    setCandidateDetail(candidate.id, { offer: { ...detail.offer, status: "draft", version: detail.offer.version + 1 } });
    log(`Offer reopened as draft v${detail.offer.version + 1}.`);
  }
  function onboard() {
    const employeeId = convertCandidate(candidate.id);
    if (!employeeId) { toast.error("This candidate already has an employee record or the email matches an existing employee."); return; }
    updateEmployee(employeeId, { salaryMonthly: detail.offer.salaryMonthly, joiningDate: detail.offer.joiningDate || hrToday(), location: detail.offer.location, branch: detail.offer.location });
    log("Employee record created and onboarding opened.");
    toast.success("Employee record created. Onboarding checklist is open.");
  }

  return <HrModal open onOpenChange={(value) => !value && onClose()} title={candidate.name} description={`${candidate.role} · ${candidate.department} · ${stageLabels[candidate.stage]}`}>
    <div className="space-y-5">
      <dl className="grid gap-3 text-sm sm:grid-cols-3">{[["Email", candidate.email], ["Phone", candidate.phone], ["Source", detail.source], ["Owner", candidate.ownerName], ["Score", String(candidate.score)], ["Last updated", hrDate(candidate.updatedAt)]].map(([label, value]) => <div key={label}><dt className="text-[11px] text-muted-foreground">{label}</dt><dd className="mt-0.5 break-words">{value}</dd></div>)}</dl>
      {manager && candidate.stage !== "accepted" && <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4"><span className="text-xs text-muted-foreground">Move to</span>{stages.filter((stage) => stage !== candidate.stage && stage !== "accepted").map((stage) => <Button key={stage} size="sm" variant="outline" onClick={() => move(stage)}>{stageLabels[stage]}</Button>)}{candidate.stage !== "rejected" && <Button size="sm" variant="outline" onClick={() => move("rejected")}>Reject</Button>}</div>}
      <section className="space-y-3 border border-border p-4" aria-label="Interview"><h3 className="text-sm font-semibold">Interview</h3>
        <HrField label="Interview date and time"><Input type="datetime-local" disabled={!manager} value={detail.interviewAt} onChange={(event) => setCandidateDetail(candidate.id, { interviewAt: event.target.value })} className="rounded-none" /></HrField>
        {manager && <div className="flex gap-2"><Textarea aria-label="Interview note" rows={2} placeholder="Add an interview note" value={note} onChange={(event) => setNote(event.target.value)} className="rounded-none text-sm" /><Button type="button" variant="secondary" disabled={!note.trim()} onClick={addNote}>Add note</Button></div>}
        <ul className="divide-y divide-border border border-border text-sm">{detail.notes.map((item) => <li key={item.id} className="px-3 py-2"><p>{item.text}</p><p className="text-xs text-muted-foreground">{item.actor} · {dateTime(item.at)}</p></li>)}{!detail.notes.length && <li className="px-3 py-3 text-xs text-muted-foreground">No interview notes yet.</li>}</ul>
      </section>
      {(candidate.stage === "offer" || candidate.stage === "accepted" || detail.offer.status !== "draft" || detail.offer.salaryMonthly > 0) && <section className="space-y-3 border border-border p-4" aria-label="Offer"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Offer · v{detail.offer.version}</h3><HrStatus status={detail.offer.status} /></div>
        {showSalary ? <div className="grid gap-3 sm:grid-cols-3"><HrField label="Monthly salary (₹)"><Input type="number" min={0} inputMode="numeric" disabled={locked} value={offer.salaryMonthly} onChange={(event) => setOffer({ ...offer, salaryMonthly: event.target.value })} className="rounded-none" /></HrField><HrField label="Joining date"><Input type="date" min={hrToday()} disabled={locked} value={offer.joiningDate} onChange={(event) => setOffer({ ...offer, joiningDate: event.target.value })} className="rounded-none" /></HrField><HrField label="Location"><Input disabled={locked} value={offer.location} onChange={(event) => setOffer({ ...offer, location: event.target.value })} className="rounded-none" /></HrField></div> : <p className="text-xs text-muted-foreground">Salary terms are visible to HR and payroll roles only.</p>}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {manager && candidate.stage === "offer" && <div className="flex flex-wrap justify-end gap-2">
          {detail.offer.status === "draft" && <><Button variant="outline" onClick={() => saveOffer("draft")}>Save draft</Button><Button onClick={() => saveOffer("sent")}>Send offer</Button></>}
          {detail.offer.status === "sent" && <><Button variant="outline" onClick={reviseOffer}>Revise offer</Button><Button variant="outline" onClick={() => reply("rejected")}>Candidate declined</Button><Button onClick={() => reply("accepted")}>Candidate accepted</Button></>}
        </div>}
        {candidate.stage === "accepted" && manager && (candidate.convertedEmployeeId ? <p className="text-sm text-muted-foreground">Employee record created. Continue in Onboarding.</p> : <div className="flex justify-end"><Button onClick={onboard}>Start onboarding</Button></div>)}
      </section>}
      <section aria-label="Activity"><h3 className="mb-2 text-sm font-semibold">Activity</h3><ol className="divide-y divide-border border border-border text-sm">{detail.events.map((item) => <li key={item.id} className="px-3 py-2"><p>{item.text}</p><p className="text-xs text-muted-foreground">{item.actor} · {dateTime(item.at)}</p></li>)}{!detail.events.length && <li className="px-3 py-3 text-xs text-muted-foreground">No activity recorded yet.</li>}</ol></section>
      {!manager && <p className="text-xs text-muted-foreground">Read-only: only HR and the owner can change candidates.</p>}
    </div>
  </HrModal>;
}

function AddCandidateDialog({ onClose, onAdd, existingEmails, actorName }: { onClose: () => void; onAdd: (candidate: HrCandidate, detail: HrCandidateDetail) => void; existingEmails: string[]; actorName: string }) {
  const [form, setForm] = React.useState({ name: "", email: "", phone: "", role: "", department: departments[3], source: "Direct application" });
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [key]: event.target.value });
  const email = form.email.trim().toLowerCase();
  const error = !form.name.trim() ? "Enter the candidate's name." : !/^\S+@\S+\.\S+$/.test(email) ? "Enter a valid email address." : existingEmails.includes(email) ? "A candidate with this email already exists." : !form.role.trim() ? "Enter the role they are applying for." : "";
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (error) return;
    const id = `cand-${crypto.randomUUID()}`;
    onAdd({ id, name: form.name.trim(), email, phone: form.phone.trim(), role: form.role.trim(), department: form.department, stage: "screening", ownerName: actorName, score: 0, updatedAt: hrToday() }, { ...blankCandidateDetail(), source: form.source.trim() || "Direct application", events: [lifecycleEvent(actorName, "Candidate added to screening.")] });
  }
  return <HrModal open onOpenChange={(value) => !value && onClose()} title="Add candidate" description="New candidates start in Screening.">
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <HrField label="Full name"><Input required value={form.name} onChange={set("name")} className="rounded-none" /></HrField>
        <HrField label="Email"><Input required type="email" value={form.email} onChange={set("email")} className="rounded-none" /></HrField>
        <HrField label="Phone · optional"><Input type="tel" value={form.phone} onChange={set("phone")} className="rounded-none" /></HrField>
        <HrField label="Role"><Input required value={form.role} onChange={set("role")} placeholder="e.g. Operations Executive" className="rounded-none" /></HrField>
        <HrField label="Department"><select className={hrInputClass} value={form.department} onChange={set("department")}>{departments.map((item) => <option key={item}>{item}</option>)}</select></HrField>
        <HrField label="Source"><Input value={form.source} onChange={set("source")} className="rounded-none" /></HrField>
      </div>
      {form.name && error && <p role="status" className="text-xs text-muted-foreground">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={Boolean(error)}>Add candidate</Button></div>
    </form>
  </HrModal>;
}

