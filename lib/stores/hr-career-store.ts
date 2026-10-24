"use client";

import { create } from "zustand";
import { scoped } from "@/lib/company";
import { createJSONStorage, persist } from "zustand/middleware";
import type { HrDemoRole } from "@/lib/types";

export type ChangeKind = "promotion" | "transfer" | "salary_revision" | "manager_change";
export type ChangeStatus = "pending_hr" | "pending_owner" | "approved" | "applied" | "rejected" | "withdrawn";
export interface ChangeFields { title?: string; department?: string; branch?: string; managerId?: string | null; managerName?: string | null; salaryMonthly?: number }
export interface ChangeSnapshot { title: string; department: string; branch: string; managerId: string | null; managerName: string | null; salaryMonthly: number }
export interface ChangeStep { id: string; actorId: string; action: "proposed" | "approved" | "rejected" | "withdrawn" | "applied"; reason?: string; at: string }
export interface CareerChange {
  id: string; employeeId: string; kind: ChangeKind; effectiveDate: string; reason: string;
  proposedBy: string; proposerRole: HrDemoRole; proposedAt: string; status: ChangeStatus; needsOwner: boolean;
  before: ChangeSnapshot; to: ChangeFields; steps: ChangeStep[]; letterDocumentId?: string;
}

interface CareerState {
  changes: CareerChange[];
  propose: (change: CareerChange) => void;
  step: (id: string, step: Omit<ChangeStep, "id" | "at">, status: ChangeStatus, extra?: Partial<CareerChange>) => void;
}

export const useHrCareerStore = create<CareerState>()(persist((set) => ({
  changes: [],
  propose: (change) => set((state) => ({ changes: [change, ...state.changes] })),
  step: (id, step, status, extra) => set((state) => ({ changes: state.changes.map((item) => item.id === id ? { ...item, ...extra, status, steps: [...item.steps, { ...step, id: crypto.randomUUID(), at: new Date().toISOString() }] } : item) })),
}), { name: scoped("janus.hr-career-demo.v1"), storage: createJSONStorage(() => localStorage) }));
