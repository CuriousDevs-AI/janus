"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Personal tasks: a simple to-do list with title, due date, and completion status.
 * Stored in localStorage per user -- not synced to the server, as these are personal.
 */

export interface PersonalTask {
  id: string;
  title: string;
  dueDate: string;
  completed: boolean;
  completedAt?: string;
  createdAt: string;
}

interface PersonalTasksState {
  tasks: PersonalTask[];
  addTask: (title: string, dueDate: string) => string | null;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
}

export const usePersonalTasksStore = create<PersonalTasksState>()(
  persist(
    (set) => ({
      tasks: [],
      addTask: (title, dueDate) => {
        const trimmed = title.trim();
        if (!trimmed) return "Enter a task title.";
        if (!dueDate) return "Pick a due date.";
        const task: PersonalTask = {
          id: `pt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title: trimmed,
          dueDate,
          completed: false,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ tasks: [...state.tasks, task] }));
        return null;
      },
      toggleTask: (id) => {
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id
              ? {
                  ...t,
                  completed: !t.completed,
                  completedAt: !t.completed ? new Date().toISOString() : undefined,
                }
              : t,
          ),
        }));
      },
      deleteTask: (id) => {
        set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) }));
      },
    }),
    {
      name: "janus.personal-tasks.v1",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
