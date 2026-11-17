"use client";

import { create } from "zustand";
import { scoped } from "@/lib/company";
import { createJSONStorage, persist } from "zustand/middleware";

export type EngageKind = "post" | "kudos" | "poll" | "event" | "announcement";
export interface EngageComment { id: string; authorId: string; text: string; at: string }
export interface EngageItem {
  id: string; kind: EngageKind; authorId: string; createdAt: string; text: string; title?: string; group: string; pinned?: boolean;
  kudos?: { toId: string; value: string };
  poll?: { options: { id: string; text: string }[]; votes: Record<string, string>; closesAt: string };
  event?: { startsAt: string; place: string; rsvp: Record<string, "going" | "maybe" | "no"> };
}
export interface EngageMeta { reactions: Record<string, string[]>; comments: EngageComment[] }

const seeds = (): EngageItem[] => [];

interface EngageState {
  items: EngageItem[];
  meta: Record<string, EngageMeta>;
  addItem: (item: EngageItem) => void;
  removeItem: (id: string) => void;
  vote: (id: string, employeeId: string, optionId: string) => void;
  rsvp: (id: string, employeeId: string, status: "going" | "maybe" | "no") => void;
  react: (key: string, emoji: string, employeeId: string) => void;
  comment: (key: string, comment: EngageComment) => void;
}
const blank = (): EngageMeta => ({ reactions: {}, comments: [] });

export const useHrEngageStore = create<EngageState>()(persist((set) => ({
  items: seeds(),
  meta: {} as Record<string, EngageMeta>,
  addItem: (item) => set((state) => ({ items: [item, ...state.items] })),
  removeItem: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
  vote: (id, employeeId, optionId) => set((state) => ({ items: state.items.map((item) => item.id === id && item.poll ? { ...item, poll: { ...item.poll, votes: { ...item.poll.votes, [employeeId]: optionId } } } : item) })),
  rsvp: (id, employeeId, status) => set((state) => ({ items: state.items.map((item) => item.id === id && item.event ? { ...item, event: { ...item.event, rsvp: { ...item.event.rsvp, [employeeId]: status } } } : item) })),
  react: (key, emoji, employeeId) => set((state) => {
    const current = state.meta[key] ?? blank();
    const who = current.reactions[emoji] ?? [];
    const next = who.includes(employeeId) ? who.filter((id) => id !== employeeId) : [...who, employeeId];
    return { meta: { ...state.meta, [key]: { ...current, reactions: { ...current.reactions, [emoji]: next } } } };
  }),
  comment: (key, comment) => set((state) => { const current = state.meta[key] ?? blank(); return { meta: { ...state.meta, [key]: { ...current, comments: [...current.comments, comment] } } }; }),
}), {
  name: scoped("janus.hr-engage-demo.v1"), storage: createJSONStorage(() => localStorage),
  merge: (persisted, current) => ({ ...current, ...(persisted as Partial<EngageState>) }),
}));
