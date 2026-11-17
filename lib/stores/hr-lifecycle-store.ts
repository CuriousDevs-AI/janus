"use client";

import { create } from "zustand";
import { scoped } from "@/lib/company";
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
  candidateDetails: {},
  exits: [],
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
  merge: (persisted, current) => ({ ...current, ...(persisted as Partial<HrLifecycleState>) }),
}));
