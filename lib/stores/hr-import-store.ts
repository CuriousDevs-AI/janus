"use client";

import { create } from "zustand";
import { scoped } from "@/lib/company";
import { createJSONStorage, persist } from "zustand/middleware";
import type { HrEmployee } from "@/lib/types";

export interface HrImportBatch {
  id: string;
  fileName: string;
  at: string;
  actorId: string;
  createdIds: string[];
  updated: { id: string; before: Partial<HrEmployee> }[];
  skipped: number;
  rejected: number;
  rolledBackAt?: string;
  rolledBackBy?: string;
}

interface HrImportState {
  batches: HrImportBatch[];
  addBatch: (batch: HrImportBatch) => void;
  markRolledBack: (id: string, actorId: string) => void;
}

export const useHrImportStore = create<HrImportState>()(persist((set) => ({
  batches: [],
  addBatch: (batch) => set((state) => ({ batches: [batch, ...state.batches] })),
  markRolledBack: (id, actorId) => set((state) => ({ batches: state.batches.map((batch) => batch.id === id ? { ...batch, rolledBackAt: new Date().toISOString(), rolledBackBy: actorId } : batch) })),
}), { name: scoped("janus.hr-import-demo.v1"), storage: createJSONStorage(() => localStorage) }));
