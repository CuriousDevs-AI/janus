"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { scoped } from "@/lib/company";

/**
 * Period locks (plan §8.6): once a period is closed, money and stock entries dated on or before the
 * locked-through date are refused. Only the owner can move the lock. Each company keeps its own lock.
 */

interface PeriodLockState {
  lockedThrough: string | null;
  setLockedThrough: (date: string | null, isOwner: boolean) => string | null;
}

export const usePeriodLockStore = create<PeriodLockState>()(
  persist(
    (set) => ({
      lockedThrough: null,
      setLockedThrough: (date, isOwner) => {
        if (!isOwner) return "Only the owner can change the period lock.";
        if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "Enter a valid date.";
        set({ lockedThrough: date });
        return null;
      },
    }),
    { name: scoped("janus.period-lock.v1"), storage: createJSONStorage(() => localStorage) },
  ),
);

/** The reason an entry dated `date` cannot be saved, or null when its period is open. */
export function periodLockProblem(date: string): string | null {
  const through = usePeriodLockStore.getState().lockedThrough;
  if (through && date <= through) return `The period through ${through} is locked. Ask the owner to reopen it.`;
  return null;
}
