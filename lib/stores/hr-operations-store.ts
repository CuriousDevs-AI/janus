"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface HrOperationAudit { id: string; recordId: string; actorId: string; action: string; reason: string; at: string }
export interface HrPolicySettings {
  yearStart: string; earnedDays: number; casualDays: number; sickDays: number;
  approvalChain: "manager" | "manager_hr"; workWeek: string[]; shiftStart: string;
  shiftEnd: string; graceMinutes: number; payrollDay: number; reminderDays: number;
  notifications: boolean; delegation: Record<string, { employeeId: string; until: string }>;
}
export interface HrReview { id: string; employeeId: string; cycle: string; goal: string; dueAt: string; progress: number; rating: number | null; feedback: string; status: "draft" | "in_review" | "completed" }
export interface HrRegularisation { id: string; employeeId: string; date: string; checkIn: string | null; checkOut: string | null; /** "permission" is a short, approved absence during a worked day (for example a bank visit). */ kind?: "regularisation" | "permission"; fromTime?: string; toTime?: string; reason: string; status: "pending" | "approved" | "rejected"; requestedAt: string; decidedBy?: string; decidedAt?: string; decisionReason?: string }
export interface HrPolicyQuestion { id: string; employeeId: string; question: string; note: string; answerGiven: string | null; sources: string[]; gap: boolean; status: "open" | "answered"; createdAt: string; reply?: string; repliedBy?: string; repliedAt?: string }
export interface HrLetterRequest { id: string; employeeId: string; type: string; purpose: string; addressedTo: string; note: string; status: "pending" | "completed" | "declined"; createdAt: string; decidedBy?: string; decidedAt?: string; reply?: string; documentId?: string }
export interface HrHoliday { id: string; date: string; name: string; kind: "company" | "optional" }
export interface ExpenseEvidence { description: string; date: string; filename?: string; mime?: string; dataUrl?: string }
interface HrOperationsState {
  settings: HrPolicySettings; audit: HrOperationAudit[]; evidence: Record<string, ExpenseEvidence>; filingReferences: Record<string, string>; reviews: HrReview[]; regularisations: HrRegularisation[]; policyQuestions: HrPolicyQuestion[]; customHolidays: HrHoliday[]; removedHolidays: string[]; letterRequests: HrLetterRequest[];
  saveSettings: (settings: HrPolicySettings) => void;
  log: (entry: Omit<HrOperationAudit, "id" | "at">) => void;
  saveEvidence: (id: string, evidence: ExpenseEvidence) => void;
  saveFiling: (id: string, reference: string) => void;
  saveReview: (review: HrReview) => void;
  addRegularisation: (request: HrRegularisation) => void;
  addPolicyQuestion: (question: HrPolicyQuestion) => void;
  addHoliday: (holiday: HrHoliday) => void;
  addLetterRequest: (request: HrLetterRequest) => void;
  decideLetterRequest: (id: string, patch: Pick<HrLetterRequest, "status" | "decidedBy" | "reply" | "documentId">) => void;
  withdrawRegularisation: (id: string) => void;
  removeHoliday: (id: string) => void;
  replyPolicyQuestion: (id: string, reply: string, repliedBy: string) => void;
  decideRegularisation: (id: string, patch: Pick<HrRegularisation, "status" | "decidedBy" | "decisionReason">) => void;
}
export const useHrOperationsStore = create<HrOperationsState>()(persist((set) => ({
  settings: { yearStart: "04-01", earnedDays: 18, casualDays: 6, sickDays: 6, approvalChain: "manager_hr", workWeek: ["Mon", "Tue", "Wed", "Thu", "Fri"], shiftStart: "09:00", shiftEnd: "18:00", graceMinutes: 15, payrollDay: 28, reminderDays: 3, notifications: true, delegation: {} },
  audit: [],
  evidence: {
    "expense-001": { description: "Travel to the Jaipur warehouse for stock handover", date: "2026-10-21", filename: "Travel receipt — sample.txt", mime: "text/plain", dataUrl: "data:text/plain;charset=utf-8,DEMO%20RECEIPT%0AWarehouse%20visit%20travel%0AAmount%3A%20INR%201840%0ANot%20a%20real%20tax%20invoice." },
    "expense-002": { description: "Customer meeting lunch — Kapoor Retail", date: "2026-10-20", filename: "Meeting receipt — sample.txt", mime: "text/plain", dataUrl: "data:text/plain;charset=utf-8,DEMO%20RECEIPT%0ACustomer%20meeting%20lunch%0AAmount%3A%20INR%201260%0ANot%20a%20real%20tax%20invoice." },
    "expense-003": { description: "Monthly business phone reimbursement", date: "2026-10-15", filename: "Phone receipt — sample.txt", mime: "text/plain", dataUrl: "data:text/plain;charset=utf-8,DEMO%20RECEIPT%0ABusiness%20phone%0AAmount%3A%20INR%20899%0ANot%20a%20real%20tax%20invoice." },
  },
  filingReferences: {},
  reviews: [
    { id: "review-riya-q4", employeeId: "emp-004", cycle: "Q4 2026", goal: "Qualify 30 opportunities and close 6 customer accounts", dueAt: "2026-12-20", progress: 65, rating: null, feedback: "Strong follow-up discipline. Focus on moving proposals to decision.", status: "in_review" },
    { id: "review-neha-q4", employeeId: "emp-005", cycle: "Q4 2026", goal: "Reduce dispatch exceptions and complete warehouse SOP rollout", dueAt: "2026-12-20", progress: 80, rating: null, feedback: "Jaipur handover completed; stock reconciliation remains.", status: "in_review" },
    { id: "review-vikas-30", employeeId: "emp-006", cycle: "30-day check-in", goal: "Complete safety training and independently process dispatch checklist", dueAt: "2026-11-14", progress: 30, rating: null, feedback: "Buddy training started. Complete the inventory induction.", status: "draft" },
  ],
  regularisations: [],
  policyQuestions: [],
  customHolidays: [],
  letterRequests: [],
  addLetterRequest: (request) => set((state) => ({ letterRequests: [request, ...state.letterRequests] })),
  decideLetterRequest: (id, patch) => set((state) => ({ letterRequests: state.letterRequests.map((item) => item.id === id ? { ...item, ...patch, decidedAt: new Date().toISOString() } : item) })),
  withdrawRegularisation: (id) => set((state) => ({ regularisations: state.regularisations.filter((item) => item.id !== id) })),
  removedHolidays: [],
  addHoliday: (holiday) => set((state) => ({ customHolidays: [...state.customHolidays.filter((item) => item.id !== holiday.id), holiday] })),
  removeHoliday: (id) => set((state) => state.customHolidays.some((item) => item.id === id) ? { customHolidays: state.customHolidays.filter((item) => item.id !== id) } : { removedHolidays: [...state.removedHolidays, id] }),
  addPolicyQuestion: (question) => set((state) => ({ policyQuestions: [question, ...state.policyQuestions] })),
  replyPolicyQuestion: (id, reply, repliedBy) => set((state) => ({ policyQuestions: state.policyQuestions.map((item) => item.id === id ? { ...item, status: "answered", reply, repliedBy, repliedAt: new Date().toISOString() } : item) })),
  saveSettings: (settings) => set({ settings }),
  addRegularisation: (request) => set((state) => ({ regularisations: [request, ...state.regularisations] })),
  decideRegularisation: (id, patch) => set((state) => ({ regularisations: state.regularisations.map((item) => item.id === id ? { ...item, ...patch, decidedAt: new Date().toISOString() } : item) })),
  log: (entry) => set((state) => ({ audit: [{ ...entry, id: crypto.randomUUID(), at: new Date().toISOString() }, ...state.audit] })),
  saveEvidence: (id, evidence) => set((state) => ({ evidence: { ...state.evidence, [id]: evidence } })),
  saveFiling: (id, reference) => set((state) => ({ filingReferences: { ...state.filingReferences, [id]: reference } })),
  saveReview: (review) => set((state) => ({ reviews: state.reviews.some((item) => item.id === review.id) ? state.reviews.map((item) => item.id === review.id ? review : item) : [...state.reviews, review] })),
}), { name: "janus.hr-operations-demo.v1", storage: createJSONStorage(() => localStorage) }));
