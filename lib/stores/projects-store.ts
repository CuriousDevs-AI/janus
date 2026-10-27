"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { isFirstCompany } from "@/lib/companies";
import { scoped } from "@/lib/company";
import { useFinanceStore } from "@/lib/stores/finance-store";
import { type TrailEntry, trailEntry, withTrail } from "@/lib/stores/audit-trail";

/**
 * Projects & Delivery (phase 1): projects with a budget drawn from a fund allocation, milestones
 * that bill on acceptance, tasks, change requests and computed delivery health.
 * Each company keeps its own records.
 */

export const TODAY = "2026-10-23";
export const PROJECT_TYPES = ["Fixed price", "Time and material", "Internal"] as const;

export interface Project { id: string; name: string; client: string; type: (typeof PROJECT_TYPES)[number]; owner: string; start: string; end: string; budget: number; budgetLineId: string; status: "planned" | "active" | "on hold" | "done"; createdBy: string }
export interface Milestone { id: string; projectId: string; name: string; due: string; amount: number; status: "planned" | "done" | "accepted"; completedBy?: string; acceptedBy?: string; invoiceNumber?: string }
export interface Task { id: string; projectId: string; milestoneId: string | null; title: string; assignee: string; due: string; status: "todo" | "doing" | "done" }
export interface ChangeRequest { id: string; projectId: string; description: string; budgetChange: number; dayChange: number; status: "pending" | "approved" | "rejected"; requestedBy: string; decidedBy?: string }

interface ProjectsState {
  projects: Project[];
  milestones: Milestone[];
  tasks: Task[];
  changes: ChangeRequest[];
  trail: TrailEntry[];
  addProject: (input: Omit<Project, "id" | "status" | "createdBy">, by: string) => string | null;
  addMilestone: (input: Omit<Milestone, "id" | "status">) => string | null;
  completeMilestone: (id: string, by: string) => string | null;
  acceptMilestone: (id: string, by: string) => string | null;
  addTask: (input: Omit<Task, "id" | "status">) => string | null;
  setTaskStatus: (id: string, status: Task["status"]) => void;
  requestChange: (input: { projectId: string; description: string; budgetChange: number; dayChange: number }, by: string) => string | null;
  decideChange: (id: string, approve: boolean, by: string) => string | null;
}

const seed = (): Pick<ProjectsState, "projects" | "milestones" | "tasks" | "changes"> => {
  if (!isFirstCompany) return { projects: [], milestones: [], tasks: [], changes: [] };
  return {
    projects: [
      { id: "prj-1", name: "Rajasthan distributor onboarding", client: "Rajputana Wholesale Co-op", type: "Fixed price", owner: "Arjun Mehta", start: "2026-10-01", end: "2026-12-15", budget: 42000, budgetLineId: "line-sales", status: "active", createdBy: "Arjun Mehta" },
      { id: "prj-2", name: "Jaipur dock layout", client: "Internal", type: "Internal", owner: "Neha Verma", start: "2026-10-10", end: "2026-11-20", budget: 78000, budgetLineId: "line-ops", status: "active", createdBy: "Neha Verma" },
    ],
    milestones: [
      { id: "ms-1", projectId: "prj-1", name: "Distributor agreement signed", due: "2026-10-20", amount: 15000, status: "done", completedBy: "Arjun Mehta" },
      { id: "ms-2", projectId: "prj-1", name: "First festive dispatch", due: "2026-11-05", amount: 27000, status: "planned" },
      { id: "ms-3", projectId: "prj-2", name: "Racking installed", due: "2026-11-15", amount: 0, status: "planned" },
    ],
    tasks: [
      { id: "tk-1", projectId: "prj-1", milestoneId: "ms-2", title: "Confirm festive order split by store", assignee: "Arjun Mehta", due: "2026-10-25", status: "doing" },
      { id: "tk-2", projectId: "prj-1", milestoneId: "ms-2", title: "Prepare delivery schedule", assignee: "Neha Verma", due: "2026-10-22", status: "todo" },
      { id: "tk-3", projectId: "prj-2", milestoneId: "ms-3", title: "Order racking from vendor", assignee: "Neha Verma", due: "2026-10-30", status: "todo" },
    ],
    changes: [],
  };
};

/** Delivery health from dates and open work, never typed in by hand. */
export function projectHealth(project: Project, milestones: Milestone[], tasks: Task[]) {
  const open = tasks.filter((t) => t.projectId === project.id && t.status !== "done");
  const overdue = open.filter((t) => t.due < TODAY).length;
  const soonMilestone = milestones.some((m) => m.projectId === project.id && m.status !== "accepted" && m.due >= TODAY && m.due <= addDays(TODAY, 7));
  if (project.status === "done") return "done" as const;
  if (overdue > 0 || project.end < TODAY) return "late" as const;
  if (soonMilestone || open.some((t) => t.due <= addDays(TODAY, 3))) return "at risk" as const;
  return "on track" as const;
}

export function addDays(date: string, days: number) {
  return new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10);
}

export const useProjectsStore = create<ProjectsState>()(
  persist(
    (set, get) => ({
      ...seed(),
      trail: [],
      addProject: (input, by) => {
        if (input.name.trim().length < 3) return "Enter the project name.";
        if (input.end < input.start) return "The end date cannot be before the start date.";
        if (!(input.budget > 0)) return "Enter a budget above zero.";
        const line = useFinanceStore.getState().budgetLines.find((l) => l.id === input.budgetLineId);
        if (!line) return "Choose the budget line the project draws from.";
        const problem = useFinanceStore.getState().drawBudget(input.budgetLineId, input.budget, `Project: ${input.name.trim()}`, by, TODAY);
        if (problem) return `Budget: ${problem}`;
        set((state) => ({
          projects: [...state.projects, { ...input, id: `prj-${Date.now()}`, name: input.name.trim(), status: "planned", createdBy: by }],
          trail: withTrail(state.trail, trailEntry("projects", TODAY, by, `Created project ${input.name.trim()} · budget ₹${input.budget.toLocaleString("en-IN")} from ${line.name}`)),
        }));
        return null;
      },
      addMilestone: (input) => {
        if (input.name.trim().length < 3) return "Enter the milestone name.";
        if (input.amount < 0) return "The amount cannot be negative.";
        set((state) => ({ milestones: [...state.milestones, { ...input, id: `ms-${Date.now()}`, status: "planned" }] }));
        return null;
      },
      completeMilestone: (id, by) => {
        const milestone = get().milestones.find((m) => m.id === id);
        if (!milestone) return "Milestone not found.";
        if (milestone.status !== "planned") return "This milestone is already complete.";
        set((state) => ({ milestones: state.milestones.map((m) => m.id === id ? { ...m, status: "done", completedBy: by } : m) }));
        return null;
      },
      acceptMilestone: (id, by) => {
        const milestone = get().milestones.find((m) => m.id === id);
        if (!milestone) return "Milestone not found.";
        if (milestone.status !== "done") return "Mark the milestone complete before it can be accepted.";
        if (milestone.completedBy === by) return "The person who completed the milestone cannot accept it.";
        let invoiceNumber: string | undefined;
        if (milestone.amount > 0) {
          const project = get().projects.find((p) => p.id === milestone.projectId);
          const taxable = milestone.amount;
          invoiceNumber = useFinanceStore.getState().addInvoice({ customer: project?.client ?? "Client", customerCompany: project?.client ?? "", date: TODAY, dueDate: addDays(TODAY, 30), sameState: true, lines: [{ item: `Milestone: ${milestone.name}`, hsn: "9983", qty: 1, rate: taxable, gstRate: 18 }] }, by);
        }
        const billed = invoiceNumber ? `, billed on ${invoiceNumber}` : "";
        set((state) => ({
          milestones: state.milestones.map((m) => m.id === id ? { ...m, status: "accepted", acceptedBy: by, invoiceNumber } : m),
          trail: withTrail(state.trail, trailEntry("projects", TODAY, by, `Accepted milestone ${milestone.name}${billed}`)),
        }));
        return null;
      },
      addTask: (input) => {
        if (input.title.trim().length < 3) return "Enter the task title.";
        set((state) => ({ tasks: [...state.tasks, { ...input, id: `tk-${Date.now()}`, status: "todo" }] }));
        return null;
      },
      setTaskStatus: (id, status) => set((state) => ({ tasks: state.tasks.map((t) => t.id === id ? { ...t, status } : t) })),
      requestChange: (input, by) => {
        if (input.description.trim().length < 5) return "Describe the change.";
        set((state) => ({ changes: [{ id: `chg-${Date.now()}`, status: "pending", requestedBy: by, ...input, description: input.description.trim() }, ...state.changes] }));
        return null;
      },
      decideChange: (id, approve, by) => {
        const change = get().changes.find((c) => c.id === id);
        if (!change) return "Change request not found.";
        if (change.requestedBy === by) return "The person who asked for the change cannot approve it.";
        set((state) => ({
          trail: withTrail(state.trail, trailEntry("projects", TODAY, by, `${approve ? "Approved" : "Rejected"} change for ${state.projects.find((p) => p.id === change.projectId)?.name ?? "a project"}: ${change.description}`)),
          changes: state.changes.map((c) => c.id === id ? { ...c, status: approve ? "approved" : "rejected", decidedBy: by } : c),
          projects: approve ? state.projects.map((p) => p.id === change.projectId ? { ...p, budget: Math.max(0, p.budget + change.budgetChange), end: addDays(p.end, change.dayChange) } : p) : state.projects,
        }));
        return null;
      },
    }),
    { name: scoped("janus.projects.v1"), storage: createJSONStorage(() => localStorage) },
  ),
);
