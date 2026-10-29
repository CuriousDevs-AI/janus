"use client";

import { create } from "zustand";
import { scoped } from "@/lib/company";
import { isFirstCompany } from "@/lib/companies";
import { demoMode } from "@/lib/demo-mode";
import { withoutDemoRecords } from "@/lib/stores/server-owned";
import { createJSONStorage, persist } from "zustand/middleware";

export interface HrLifecycleEvent {
  id: string;
  at: string;
  actor: string;
  text: string;
}

export interface HrCandidateDetail {
  source: string;
  interviewAt: string;
  notes: HrLifecycleEvent[];
  offer: {
    salaryMonthly: number;
    joiningDate: string;
    location: string;
    status: "draft" | "sent" | "accepted" | "rejected";
    version: number;
  };
  events: HrLifecycleEvent[];
}

export type HrClearanceOwner = "manager" | "hr" | "finance" | "it" | "operations" | "employee";
export interface HrExitTask {
  id: string;
  title: string;
  owner: HrClearanceOwner;
  done: boolean;
  note: string;
  completedAt?: string;
}

export interface HrExitRecord {
  id: string;
  employeeId: string;
  requestedAt: string;
  lastWorkingDay: string;
  reason: string;
  status: "requested" | "in_progress" | "completed" | "cancelled";
  tasks: HrExitTask[];
  events: HrLifecycleEvent[];
}

export const lifecycleId = () => crypto.randomUUID();
export const lifecycleEvent = (actor: string, text: string): HrLifecycleEvent => ({ id: lifecycleId(), actor, text, at: new Date().toISOString() });

export function exitChecklist(): HrExitTask[] {
  return [
    { id: "manager-review", title: "Review resignation and handover plan", owner: "manager", done: false, note: "" },
    { id: "notice", title: "Confirm notice period and last working day", owner: "hr", done: false, note: "" },
    { id: "handover", title: "Complete client and team handover", owner: "manager", done: false, note: "" },
    { id: "attendance", title: "Review and freeze attendance / leave for settlement", owner: "hr", done: false, note: "" },
    { id: "assets", title: "Collect company assets and record clearance", owner: "operations", done: false, note: "" },
    { id: "access", title: "Confirm access removal on the last working day", owner: "it", done: false, note: "" },
    { id: "settlement", title: "Review and approve full-and-final settlement", owner: "finance", done: false, note: "" },
    { id: "acknowledgement", title: "Employee acknowledges final documents", owner: "employee", done: false, note: "" },
    { id: "letters", title: "Issue experience and relieving letters", owner: "hr", done: false, note: "" },
  ];
}

const candidateDefaults = (): Record<string, HrCandidateDetail> => ({
  "cand-001": { source: "Employee referral", interviewAt: "2026-10-26T11:00", notes: [{ id: "interview-meera", at: "2026-10-21T10:00:00+05:30", actor: "Shaista Khan", text: "Strong attendance and onboarding experience. Next interview will cover employee grievance handling and shift rosters." }], offer: { salaryMonthly: 45000, joiningDate: "2026-11-09", location: "Gurugram", status: "draft", version: 1 }, events: [] },
  "cand-002": { source: "Local hiring drive", interviewAt: "2026-10-19T14:00", notes: [{ id: "interview-rohit", at: "2026-10-19T15:00:00+05:30", actor: "Neha Verma", text: "Passed stock-count exercise. Comfortable with rotating shifts. Waiting for offer response." }], offer: { salaryMonthly: 27000, joiningDate: "2026-11-02", location: "Jaipur", status: "sent", version: 1 }, events: [] },
  "cand-004": { source: "Careers page", interviewAt: "2026-10-14T11:00", notes: [{ id: "interview-kabir", at: "2026-10-14T12:00:00+05:30", actor: "Aman Verma", text: "Completed reconciliation exercise with 92/100. Accepted the offer and confirmed availability for November." }], offer: { salaryMonthly: 48000, joiningDate: "2026-11-02", location: "Gurugram", status: "accepted", version: 1 }, events: [{ id: "offer-kabir", at: "2026-10-16T15:00:00+05:30", actor: "Kabir Singh (demo)", text: "Offer accepted in the sample signing flow." }] },
});

function seedExits(): HrExitRecord[] {
  return [{
    id: "exit-karan", employeeId: "emp-008", requestedAt: "2026-10-01", lastWorkingDay: "2026-10-31", reason: "Career progression; moving to a new opportunity.", status: "in_progress",
    tasks: exitChecklist().map((task) => ["manager-review", "notice"].includes(task.id) ? { ...task, done: true, note: "Reviewed with Pankaj and HR. Handover assigned to the support team.", completedAt: "2026-10-02T11:00:00+05:30" } : task),
    events: [{ id: "exit-karan-confirmed", at: "2026-10-02T11:00:00+05:30", actor: "Shaista Khan", text: "Notice period confirmed. Last working day: 31 October 2026." }],
  }];
}

interface HrLifecycleState {
  candidateDetails: Record<string, HrCandidateDetail>;
  exits: HrExitRecord[];
  onboardingNotes: Record<string, HrLifecycleEvent[]>;
  setCandidateDetail: (id: string, patch: Partial<HrCandidateDetail>) => void;
  addCandidateEvent: (id: string, event: HrLifecycleEvent) => void;
  addCandidateNote: (id: string, event: HrLifecycleEvent) => void;
  addExit: (record: HrExitRecord) => void;
  updateExit: (id: string, patch: Partial<HrExitRecord>) => void;
  updateExitTask: (id: string, taskId: string, done: boolean, note: string, actor: string) => void;
  addOnboardingNote: (id: string, event: HrLifecycleEvent) => void;
}

export const blankCandidateDetail = (): HrCandidateDetail => ({ source: "Direct application", interviewAt: "", notes: [], offer: { salaryMonthly: 0, joiningDate: "", location: "Gurugram", status: "draft", version: 1 }, events: [] });

export const useHrLifecycleStore = create<HrLifecycleState>()(persist((set) => ({
  candidateDetails: isFirstCompany ? candidateDefaults() : {},
  exits: isFirstCompany ? seedExits() : [],
  onboardingNotes: {},
  setCandidateDetail: (id, patch) => set((state) => ({ candidateDetails: { ...state.candidateDetails, [id]: { ...(state.candidateDetails[id] ?? blankCandidateDetail()), ...patch } } })),
  addCandidateEvent: (id, event) => set((state) => {
    const detail = state.candidateDetails[id] ?? blankCandidateDetail();
    return { candidateDetails: { ...state.candidateDetails, [id]: { ...detail, events: [event, ...detail.events] } } };
  }),
  addCandidateNote: (id, event) => set((state) => {
    const detail = state.candidateDetails[id] ?? blankCandidateDetail();
    return { candidateDetails: { ...state.candidateDetails, [id]: { ...detail, notes: [event, ...detail.notes] } } };
  }),
  addExit: (record) => set((state) => state.exits.some((exit) => exit.employeeId === record.employeeId && !["completed", "cancelled"].includes(exit.status)) ? state : { exits: [record, ...state.exits] }),
  updateExit: (id, patch) => set((state) => ({ exits: state.exits.map((exit) => exit.id === id ? { ...exit, ...patch } : exit) })),
  updateExitTask: (id, taskId, done, note, actor) => set((state) => ({ exits: state.exits.map((exit) => {
    if (exit.id !== id || ["completed", "cancelled"].includes(exit.status)) return exit;
    const task = exit.tasks.find((item) => item.id === taskId);
    return { ...exit, tasks: exit.tasks.map((item) => item.id === taskId ? { ...item, done, note, completedAt: done ? new Date().toISOString() : undefined } : item), events: [lifecycleEvent(actor, `${done ? "Completed" : "Reopened"}: ${task?.title ?? taskId}. ${note}`), ...exit.events] };
  }) })),
  addOnboardingNote: (id, event) => set((state) => ({ onboardingNotes: { ...state.onboardingNotes, [id]: [event, ...(state.onboardingNotes[id] ?? [])] } })),
}), {
  name: scoped("janus.hr-lifecycle-demo.v1"), storage: createJSONStorage(() => localStorage),
  // A saved copy drops the demo exit and candidate notes outside demo mode; records the company made stay.
  merge: (persisted, current) => {
    const saved = { ...current, ...(persisted as Partial<HrLifecycleState>) } as HrLifecycleState;
    if (demoMode) return saved;
    const demoCandidates = candidateDefaults();
    const candidateDetails = Object.fromEntries(Object.entries(saved.candidateDetails).filter(([id]) => !(id in demoCandidates)));
    return withoutDemoRecords({ ...saved, candidateDetails }, { exits: seedExits() });
  },
}));
