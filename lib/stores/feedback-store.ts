"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { scoped } from "@/lib/company";

/**
 * Customer feedback after a ticket is resolved (plan §AG/§8.7, Support V2). Staff record the rating the customer
 * gave, with their words. One rating per ticket. Each company keeps its own feedback.
 */

export interface Feedback { id: string; ticketId: string; ticketNumber: string; rating: 1 | 2 | 3 | 4 | 5; comment: string; recordedBy: string; date: string }

interface FeedbackState {
  feedback: Feedback[];
  recordFeedback: (input: Omit<Feedback, "id">) => string | null;
}

export const useFeedbackStore = create<FeedbackState>()(
  persist(
    (set, get) => ({
      feedback: [],
      recordFeedback: (input) => {
        if (get().feedback.some((f) => f.ticketId === input.ticketId)) return "Feedback is already recorded for this ticket.";
        if (![1, 2, 3, 4, 5].includes(input.rating)) return "Choose a rating from 1 to 5.";
        set((state) => ({ feedback: [{ ...input, id: `fb-${Date.now()}`, comment: input.comment.trim() }, ...state.feedback] }));
        return null;
      },
    }),
    { name: scoped("janus.feedback.v1"), storage: createJSONStorage(() => localStorage) },
  ),
);
