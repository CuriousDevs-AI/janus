"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type NoteKind = "note" | "task" | "reminder";

export interface PersonalTask {
  id: string;
  kind: NoteKind;
  title: string;
  body: string;
  dueDate: string;
  completed: boolean;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
  color: NoteColor;
  tags: string[];
}

export type NoteColor = "default" | "blue" | "green" | "amber" | "rose" | "purple";

export const NOTE_COLORS: Record<NoteColor, { bg: string; border: string; label: string }> = {
  default: { bg: "bg-surface", border: "border-border", label: "Default" },
  blue: { bg: "bg-blue-50 dark:bg-blue-950/30", border: "border-blue-200 dark:border-blue-800", label: "Blue" },
  green: { bg: "bg-emerald-50 dark:bg-emerald-950/30", border: "border-emerald-200 dark:border-emerald-800", label: "Green" },
  amber: { bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-200 dark:border-amber-800", label: "Amber" },
  rose: { bg: "bg-rose-50 dark:bg-rose-950/30", border: "border-rose-200 dark:border-rose-800", label: "Rose" },
  purple: { bg: "bg-purple-50 dark:bg-purple-950/30", border: "border-purple-200 dark:border-purple-800", label: "Purple" },
};

interface PersonalTasksState {
  tasks: PersonalTask[];
  addNote: (text: string) => void;
  addReminder: (text: string, dueDate?: string) => void;
  addTask: (title: string, dueDate: string) => string | null;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
  updateTask: (id: string, patch: Partial<Pick<PersonalTask, "title" | "body" | "dueDate" | "pinned" | "color" | "tags">>) => void;
}

export const usePersonalTasksStore = create<PersonalTasksState>()(
  persist(
    (set) => ({
      tasks: [],
      addNote: (text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const now = new Date().toISOString();
        const note: PersonalTask = {
          id: `pn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          kind: "note",
          title: trimmed,
          body: "",
          dueDate: "",
          completed: false,
          createdAt: now,
          updatedAt: now,
          pinned: false,
          color: "default",
          tags: [],
        };
        set((state) => ({ tasks: [...state.tasks, note] }));
      },
      addReminder: (text, dueDate) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const now = new Date().toISOString();
        const reminder: PersonalTask = {
          id: `pr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          kind: "reminder",
          title: trimmed,
          body: "",
          dueDate: dueDate ?? "",
          completed: false,
          createdAt: now,
          updatedAt: now,
          pinned: false,
          color: "default",
          tags: [],
        };
        set((state) => ({ tasks: [...state.tasks, reminder] }));
      },
      addTask: (title, dueDate) => {
        const trimmed = title.trim();
        if (!trimmed) return "Enter a task title.";
        if (!dueDate) return "Pick a due date.";
        const now = new Date().toISOString();
        const task: PersonalTask = {
          id: `pt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          kind: "task",
          title: trimmed,
          body: "",
          dueDate,
          completed: false,
          createdAt: now,
          updatedAt: now,
          pinned: false,
          color: "default",
          tags: [],
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
                  updatedAt: new Date().toISOString(),
                }
              : t,
          ),
        }));
      },
      deleteTask: (id) => {
        set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) }));
      },
      updateTask: (id, patch) => {
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t,
          ),
        }));
      },
    }),
    {
      name: "janus.personal-tasks.v1",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
