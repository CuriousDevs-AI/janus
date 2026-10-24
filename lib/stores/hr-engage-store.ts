"use client";

import { create } from "zustand";
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

const seeds = (): EngageItem[] => [
  { id: "eng-1", kind: "announcement", authorId: "emp-002", createdAt: "2026-10-23T10:00:00+05:30", group: "all", pinned: true, title: "New leave and attendance policy is live", text: "The updated Leave & attendance policy is now in Company policies. Please read it and acknowledge it by 31 October." },
  { id: "eng-2", kind: "kudos", authorId: "emp-003", createdAt: "2026-10-22T16:20:00+05:30", group: "all", text: "Closed the Rajputana Wholesale Co-op supply deal ahead of plan and kept the customer happy through a tough negotiation.", kudos: { toId: "emp-004", value: "Customer first" } },
  { id: "eng-3", kind: "poll", authorId: "emp-002", createdAt: "2026-10-22T11:00:00+05:30", group: "all", text: "Where should we hold this year's Diwali get-together?", poll: { options: [{ id: "a", text: "Office terrace" }, { id: "b", text: "A nearby restaurant" }, { id: "c", text: "Virtual, with sweets delivered" }], votes: { "emp-003": "a", "emp-005": "b", "emp-007": "a" }, closesAt: "2026-10-30" } },
  { id: "eng-4", kind: "event", authorId: "emp-002", createdAt: "2026-10-21T09:30:00+05:30", group: "all", title: "Diwali celebration", text: "Sweets, music and a short thank-you from the founders. Families are welcome.", event: { startsAt: "2026-11-06T17:00", place: "Head office terrace", rsvp: { "emp-003": "going", "emp-004": "going", "emp-005": "maybe" } } },
  { id: "eng-5", kind: "post", authorId: "emp-005", createdAt: "2026-10-20T14:05:00+05:30", group: "Operations", text: "Reminder for the warehouse team: the new dispatch checklist is pinned in the Jaipur office. Tell me if any step is unclear." },
];

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
  meta: { "eng-2": { reactions: { "👏": ["emp-005", "emp-007"], "🎉": ["emp-001"] }, comments: [] } },
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
}), { name: "janus.hr-engage-demo.v1", storage: createJSONStorage(() => localStorage) }));
