"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { useHrOperationsStore, type HrReview } from "@/lib/stores/hr-operations-store";
import { canManageHr } from "@/lib/hr-people-access";
import { HrEmpty, HrField, HrModal, HrPanel, HrStats, HrStatus, HrTable, hrCell, hrDate, hrInputClass, hrToday } from "@/components/hr-people/operations-ui";
import type { HrDemoRole, HrEmployee } from "@/lib/types";

const ratings = ["", "Needs improvement", "Below expectations", "Meets expectations", "Exceeds expectations", "Outstanding"];
const statusLabel: Record<HrReview["status"], string> = { draft: "pending", in_review: "review", completed: "completed" };

export function HrPerformanceView({ role, actorId }: { role: HrDemoRole; actorId: string }) {
  const { employees } = useHrPeopleStore();
  const { reviews, saveReview, log } = useHrOperationsStore();
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [starting, setStarting] = React.useState(false);
  const hr = canManageHr(role);
  const actorName = employees.find((item) => item.id === actorId)?.name ?? "HR";
  const personOf = (id: string) => employees.find((item) => item.id === id);
  const scoped = reviews.filter((item) => { const person = personOf(item.employeeId); return hr || item.employeeId === actorId || (role === "reporting_manager" && person?.managerId === actorId); });
  const open = scoped.find((item) => item.id === openId);
  const done = scoped.filter((item) => item.status === "completed").length;

  return <div className="space-y-5">
    <HrStats items={[{ label: "Reviews in view", value: scoped.length, hint: hr ? "Everyone" : role === "reporting_manager" ? "You and your team" : "Yours" }, { label: "Completed", value: done, hint: `${scoped.length - done} still open` }, { label: "Waiting for review", value: scoped.filter((item) => item.status === "in_review").length, hint: "Submitted, not yet completed" }, { label: "Average progress", value: scoped.length ? `${Math.round(scoped.reduce((sum, item) => sum + item.progress, 0) / scoped.length)}%` : "—", hint: "Across goals" }]} />
    <HrPanel title="Performance & reviews" description="Goals, progress and review outcomes. Ratings stay private until the review is completed." actions={hr ? <Button size="sm" onClick={() => setStarting(true)}>Start review cycle</Button> : undefined}>
      {scoped.length ? <HrTable headings={["Employee", "Cycle", "Goal", "Progress", "Status", "Rating", ""]}>{scoped.map((item) => { const person = personOf(item.employeeId); const showRating = item.status === "completed" || hr || (role === "reporting_manager" && item.employeeId !== actorId); return <tr key={item.id}>
        <td className={hrCell}><p className="font-medium">{person?.name ?? item.employeeId}</p><p className="text-xs text-muted-foreground">{person?.title}</p></td>
        <td className={hrCell}>{item.cycle}<p className="text-xs text-muted-foreground">Due {hrDate(item.dueAt)}</p></td>
        <td className={`${hrCell} max-w-64 text-muted-foreground`}>{item.goal}</td>
        <td className={hrCell}><div className="h-1.5 w-24 bg-surface-2" role="progressbar" aria-label={`${person?.name} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.progress}><div className="h-1.5 bg-accent" style={{ width: `${item.progress}%` }} /></div><span className="text-xs text-muted-foreground">{item.progress}%</span></td>
        <td className={hrCell}><HrStatus status={statusLabel[item.status]} /></td>
        <td className={hrCell}>{item.rating && showRating ? ratings[item.rating] : "—"}</td>
        <td className={hrCell}><Button size="sm" variant="outline" onClick={() => setOpenId(item.id)}>Open</Button></td></tr>; })}</HrTable> : <HrEmpty>{hr ? "No reviews yet. Start a review cycle to create one for each person." : "You have no review yet. Your manager or HR starts review cycles."}</HrEmpty>}
    </HrPanel>
    {open && <ReviewDialog review={open} person={personOf(open.employeeId)} role={role} actorId={actorId} onClose={() => setOpenId(null)} onSave={(next, action) => { saveReview(next); log({ recordId: next.id, actorId, action, reason: next.status === "completed" ? `Rating ${next.rating}` : `Progress ${next.progress}%` }); toast.success(action === "review_completed" ? "Review completed" : action === "submitted_for_review" ? "Submitted for review" : "Saved"); if (action !== "progress_updated") setOpenId(null); }} />}
    {starting && <StartCycleDialog employees={employees} existing={reviews} actorName={actorName} onClose={() => setStarting(false)} onStart={(created, cycle) => { created.forEach(saveReview); log({ recordId: `cycle-${cycle}`, actorId, action: "review_cycle_started", reason: `${cycle}: ${created.length} reviews created` }); toast.success(`${created.length} reviews created for ${cycle}`); setStarting(false); }} />}
  </div>;
}

function ReviewDialog({ review, person, role, actorId, onSave, onClose }: { review: HrReview; person?: HrEmployee; role: HrDemoRole; actorId: string; onSave: (review: HrReview, action: string) => void; onClose: () => void }) {
  const own = review.employeeId === actorId;
  const hr = canManageHr(role);
  const manager = role === "reporting_manager" && person?.managerId === actorId;
  const canReview = (hr || manager) && !own;
  const closed = review.status === "completed";
  const [progress, setProgress] = React.useState(review.progress);
  const [rating, setRating] = React.useState(review.rating ?? 0);
  const [feedback, setFeedback] = React.useState(review.feedback);
  const canEditProgress = !closed && (own || canReview);
  const problem = rating === 0 ? "Choose a rating." : feedback.trim().length < 10 ? "Write feedback of at least 10 characters." : "";
  return <HrModal open onOpenChange={(value) => !value && onClose()} title={`${person?.name ?? review.employeeId} · ${review.cycle}`} description={`${review.status === "completed" ? "Completed" : "Due"} ${hrDate(review.dueAt)}`}>
    <div className="space-y-4 text-sm">
      <p className="border border-border bg-surface-2 px-3 py-2">{review.goal}</p>
      <HrField label={`Progress · ${progress}%`}><input type="range" min={0} max={100} step={5} disabled={!canEditProgress} value={progress} onChange={(event) => setProgress(Number(event.target.value))} className="w-full" aria-valuetext={`${progress} percent`} /></HrField>
      {(canReview || closed) && <>
        <HrField label="Rating"><select className={hrInputClass} disabled={!canReview || closed} value={rating} onChange={(event) => setRating(Number(event.target.value))}><option value={0}>Choose…</option>{ratings.slice(1).map((label, index) => <option key={label} value={index + 1}>{index + 1} · {label}</option>)}</select></HrField>
        <HrField label="Feedback"><Textarea maxLength={600} disabled={!canReview || closed} value={feedback} onChange={(event) => setFeedback(event.target.value)} className="rounded-none" /></HrField>
      </>}
      {!canReview && !closed && <p className="text-xs text-muted-foreground">{own ? "Update your progress, then submit it for your manager's review. You see the rating once it is completed." : "Only the reporting manager or HR can review this."}</p>}
      {own && !closed && canReview === false && review.status === "draft" && <p className="text-xs text-muted-foreground">You cannot rate your own review.</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Close</Button>
        {canEditProgress && progress !== review.progress && <Button variant="outline" onClick={() => onSave({ ...review, progress }, "progress_updated")}>Save progress</Button>}
        {!closed && review.status === "draft" && (own || canReview) && <Button onClick={() => onSave({ ...review, progress, status: "in_review" }, "submitted_for_review")}>Submit for review</Button>}
        {canReview && !closed && review.status === "in_review" && <Button disabled={Boolean(problem)} title={problem || undefined} onClick={() => onSave({ ...review, progress, rating, feedback: feedback.trim(), status: "completed" }, "review_completed")}>Complete review</Button>}
      </div>
    </div>
  </HrModal>;
}

function StartCycleDialog({ employees, existing, actorName, onStart, onClose }: { employees: HrEmployee[]; existing: HrReview[]; actorName: string; onStart: (created: HrReview[], cycle: string) => void; onClose: () => void }) {
  const [cycle, setCycle] = React.useState("");
  const [goal, setGoal] = React.useState("");
  const [dueAt, setDueAt] = React.useState("");
  const eligible = employees.filter((item) => item.status === "active");
  const fresh = eligible.filter((item) => !existing.some((review) => review.employeeId === item.id && review.cycle === cycle.trim()));
  const error = cycle.trim().length < 3 ? "Name the cycle, e.g. Q1 2027." : goal.trim().length < 5 ? "Describe the shared goal." : !dueAt || dueAt < hrToday() ? "Choose a due date that isn't in the past." : !fresh.length ? "Everyone already has a review in this cycle." : "";
  return <HrModal open onOpenChange={(value) => !value && onClose()} title="Start a review cycle" description={`Creates a draft review for ${fresh.length} active ${fresh.length === 1 ? "person" : "people"}. Started by ${actorName}.`}>
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (!error) onStart(fresh.map((item) => ({ id: `review-${crypto.randomUUID()}`, employeeId: item.id, cycle: cycle.trim(), goal: goal.trim(), dueAt, progress: 0, rating: null, feedback: "", status: "draft" })), cycle.trim()); }}>
      <HrField label="Cycle name"><Input value={cycle} maxLength={40} onChange={(event) => setCycle(event.target.value)} className="rounded-none" placeholder="e.g. Q1 2027" /></HrField>
      <HrField label="Shared goal"><Textarea maxLength={300} value={goal} onChange={(event) => setGoal(event.target.value)} className="rounded-none" placeholder="Everyone starts with this goal. Managers can refine it per person later." /></HrField>
      <HrField label="Due date"><Input type="date" min={hrToday()} value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="rounded-none" /></HrField>
      {error && cycle !== "" && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={Boolean(error)}>Create reviews</Button></div>
    </form>
  </HrModal>;
}
