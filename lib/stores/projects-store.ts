"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { workspaceStorage } from "@/lib/stores/workspace-storage";
import { isFirstCompany } from "@/lib/companies";
import { scoped } from "@/lib/company";
import { useFinanceStore } from "@/lib/stores/finance-store";
import { moveBudget } from "@/lib/finance-records";
import { createInvoice } from "@/lib/invoice-records";
import { periodLockProblem } from "@/lib/stores/period-lock-store";
import { type TrailEntry, trailEntry, withTrail } from "@/lib/stores/audit-trail";
import { mergeServerOwned, withoutDemoRecords } from "@/lib/stores/server-owned";
import { todayIso } from "@/lib/today";

/**
 * Projects & Delivery (phase 1): projects with a budget drawn from a fund allocation, milestones
 * that bill on acceptance, tasks, change requests and computed delivery health.
 * Each company keeps its own records.
 */

export const TODAY = todayIso();
export const PROJECT_TYPES = ["Fixed price", "Time and material", "Internal"] as const;

export interface Project { id: string; name: string; client: string; ownerUserId?: string; customerId?: string; type: (typeof PROJECT_TYPES)[number]; owner: string; start: string; end: string; budget: number; budgetLineId: string; status: "planned" | "active" | "on hold" | "done"; createdBy: string }
/** A dispute stops acceptance, and so billing, until someone resolves it (plan §8.3Z step 4). */
export interface MilestoneDispute { reason: string; raisedBy: string; date: string }
export interface Milestone { id: string; projectId: string; name: string; due: string; amount: number; status: "planned" | "done" | "accepted"; completedBy?: string; acceptedBy?: string; invoiceNumber?: string; dispute?: MilestoneDispute }

/** What a closed project amounted to, captured at closing from the records, so it stays true later. */
export interface ProjectClosure {
  projectId: string;
  closedOn: string;
  closedBy: string;
  lines: { label: string; value: string }[];
}

/** One version of a project's plan. Version 1 is the plan as first set; each approved change adds the next one (plan §8.3Y step 4). */
export interface PlanVersion { id: string; projectId: string; number: number; budget: number; end: string; note: string; by: string; date: string }
export interface Task { id: string; projectId: string; milestoneId: string | null; title: string; assignee: string; assigneeUserId?: string; due: string; status: "todo" | "doing" | "done" }
/** Hours a person worked on a project on a day. Hours are entered; nothing is estimated from them. */
export interface Timesheet { id: string; projectId: string; person: string; date: string; hours: number; note: string }
/** The share of a person's week a project is planned to take (0 to 100). */
export interface Allocation { id: string; projectId: string; person: string; percent: number; userId?: string }
/** What one hour of a person costs the company. Used for project cost; a person without a rate uses the default. */
export interface CostRate { person: string; hourlyCost: number }
export const DEFAULT_HOURLY_COST = 500;
export interface ChangeRequest { id: string; projectId: string; description: string; budgetChange: number; dayChange: number; status: "pending" | "approved" | "rejected"; requestedBy: string; decidedBy?: string }

interface ProjectsState {
  projects: Project[];
  milestones: Milestone[];
  tasks: Task[];
  changes: ChangeRequest[];
  versions: PlanVersion[];
  closures: ProjectClosure[];
  timesheets: Timesheet[];
  allocations: Allocation[];
  rates: CostRate[];
  trail: TrailEntry[];
  addProject: (input: Omit<Project, "id" | "status" | "createdBy">, by: string) => Promise<string | null>;
  setAllocation: (projectId: string, person: string, percent: number, by: string) => string | null;
  /** Records which company account each project person is, by name, so later checks use the account rather than the name. */
  linkPeople: (projectId: string, links: Record<string, string>) => void;
  setCostRate: (person: string, hourlyCost: number, by: string) => string | null;
  logHours: (input: Omit<Timesheet, "id">, by: string) => string | null;
  addMilestone: (input: Omit<Milestone, "id" | "status">) => string | null;
  completeMilestone: (id: string, by: string) => string | null;
  acceptMilestone: (id: string, by: string) => Promise<string | null>;
  raiseDispute: (id: string, reason: string, by: string) => string | null;
  resolveDispute: (id: string, by: string) => string | null;
  addTask: (input: Omit<Task, "id" | "status">) => string | null;
  setTaskStatus: (id: string, status: Task["status"]) => void;
  requestChange: (input: { projectId: string; description: string; budgetChange: number; dayChange: number }, by: string) => string | null;
  decideChange: (id: string, approve: boolean, by: string) => string | null;
  /** Closes a project and hands back the part of its budget the logged hours did not use (plan §8.3AE). */
  closeProject: (id: string, by: string) => Promise<string | null>;
}

const demoSeed = (): Pick<ProjectsState, "projects" | "milestones" | "tasks" | "changes" | "timesheets" | "allocations"> => {
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
    timesheets: [],
    allocations: [
      { id: "al-1", projectId: "prj-1", person: "Arjun Mehta", percent: 60 },
      { id: "al-2", projectId: "prj-2", person: "Arjun Mehta", percent: 50 },
      { id: "al-3", projectId: "prj-2", person: "Neha Verma", percent: 40 },
    ],
  };
};

const seed = (): Pick<ProjectsState, "projects" | "milestones" | "tasks" | "changes" | "timesheets" | "allocations"> => (isFirstCompany ? demoSeed() : { projects: [], milestones: [], tasks: [], changes: [], timesheets: [], allocations: [] });

/** Delivery health from dates and open work, never typed in by hand. */
/** Profit on a project to date: milestones accepted and billed, against the cost of the hours logged on it. */
export function projectProfitability(project: Project, milestones: Milestone[], timesheets: Timesheet[], rates: CostRate[]) {
  const billed = milestones.filter((m) => m.projectId === project.id && m.status === "accepted").reduce((sum, m) => sum + m.amount, 0);
  const logged = timesheets.filter((t) => t.projectId === project.id);
  const hours = logged.reduce((sum, t) => sum + t.hours, 0);
  const cost = logged.reduce((sum, t) => sum + t.hours * (rates.find((r) => r.person === t.person)?.hourlyCost ?? DEFAULT_HOURLY_COST), 0);
  const round = (value: number) => Math.round(value * 100) / 100;
  return { billed: round(billed), hours: round(hours), cost: round(cost), margin: billed > 0 ? round(((billed - cost) / billed) * 100) : null };
}

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
      rates: [],
      versions: [],
      closures: [],
      setCostRate: (person, hourlyCost, by) => {
        if (!person) return "Choose the person.";
        if (!(hourlyCost >= 0 && hourlyCost <= 100000)) return "Enter a cost per hour between 0 and 1,00,000.";
        set((state) => ({
          rates: [...state.rates.filter((r) => r.person !== person), { person, hourlyCost }],
          trail: withTrail(state.trail, trailEntry("projects", TODAY, by, `Set ${person}'s cost at ₹${hourlyCost.toLocaleString("en-IN")} an hour`)),
        }));
        return null;
      },
      linkPeople: (projectId, links) => {
        const idFor = (name: string) => links[name.trim()];
        set((state) => ({
          projects: state.projects.map((p) => (p.id === projectId && idFor(p.owner) ? { ...p, ownerUserId: idFor(p.owner) } : p)),
          tasks: state.tasks.map((t) => (t.projectId === projectId && idFor(t.assignee) ? { ...t, assigneeUserId: idFor(t.assignee) } : t)),
          allocations: state.allocations.map((a) => (a.projectId === projectId && idFor(a.person) ? { ...a, userId: idFor(a.person) } : a)),
        }));
      },
      setAllocation: (projectId, person, percent, by) => {
        const project = get().projects.find((p) => p.id === projectId);
        if (!project) return "Project not found.";
        if (!person) return "Choose the person.";
        if (!(percent > 0 && percent <= 100)) return "Enter a share between 1 and 100.";
        const existing = get().allocations.find((a) => a.projectId === projectId && a.person === person);
        set((state) => ({
          allocations: existing
            ? state.allocations.map((a) => a.id === existing.id ? { ...a, percent } : a)
            : [...state.allocations, { id: `al-${Date.now()}`, projectId, person, percent }],
          trail: withTrail(state.trail, trailEntry("projects", TODAY, by, `Planned ${person} at ${percent}% on ${project.name}`)),
        }));
        return null;
      },
      logHours: (input, by) => {
        if (!get().projects.some((p) => p.id === input.projectId)) return "Choose the project.";
        if (!input.person) return "Choose the person.";
        if (!(input.hours > 0 && input.hours <= 12)) return "Enter between 0.5 and 12 hours for one day.";
        if (input.date > TODAY) return "Hours can only be logged for today or earlier.";
        const dayTotal = get().timesheets.filter((t) => t.person === input.person && t.date === input.date).reduce((sum, t) => sum + t.hours, 0);
        if (dayTotal + input.hours > 12) return `${input.person} already has ${dayTotal} hours on ${input.date}. A day cannot go over 12.`;
        const project = get().projects.find((p) => p.id === input.projectId);
        set((state) => ({
          timesheets: [{ ...input, id: `ts-${Date.now()}`, note: input.note.trim() }, ...state.timesheets],
          trail: withTrail(state.trail, trailEntry("projects", input.date, by, `Logged ${input.hours} hours for ${input.person} on ${project?.name ?? "a project"}`)),
        }));
        return null;
      },
      addProject: async (input, by) => {
        if (input.name.trim().length < 3) return "Enter the project name.";
        if (input.end < input.start) return "The end date cannot be before the start date.";
        if (!(input.budget > 0)) return "Enter a budget above zero.";
        const line = useFinanceStore.getState().budgetLines.find((l) => l.id === input.budgetLineId);
        if (!line) return "Choose the budget line the project draws from.";
        const problem = await moveBudget("draw", input.budgetLineId, input.budget, `Project: ${input.name.trim()}`, by, TODAY);
        if (problem) return `Budget: ${problem}`;
        const id = `prj-${Date.now()}`;
        set((state) => ({
          projects: [...state.projects, { ...input, id, name: input.name.trim(), status: "planned", createdBy: by }],
          // Version 1 is the plan as first set, so every later change can be compared with it.
          versions: [...state.versions, { id: `pv-${Date.now()}`, projectId: id, number: 1, budget: input.budget, end: input.end, note: "Plan as first set", by, date: TODAY }],
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
      acceptMilestone: async (id, by) => {
        const milestone = get().milestones.find((m) => m.id === id);
        if (!milestone) return "Milestone not found.";
        if (milestone.status !== "done") return "Mark the milestone complete before it can be accepted.";
        if (milestone.dispute) return "This milestone is in dispute. Resolve the dispute before it is accepted or billed.";
        if (milestone.completedBy === by) return "The person who completed the milestone cannot accept it.";
        if (milestone.amount > 0) {
          const locked = periodLockProblem(TODAY);
          if (locked) return locked;
        }
        let invoiceNumber: string | undefined;
        if (milestone.amount > 0) {
          const project = get().projects.find((p) => p.id === milestone.projectId);
          const taxable = milestone.amount;
          const created = await createInvoice({ customer: project?.client ?? "Client", customerCompany: project?.client ?? "", date: TODAY, dueDate: addDays(TODAY, 30), sameState: true, lines: [{ item: `Milestone: ${milestone.name}`, hsn: "9983", qty: 1, rate: taxable, gstRate: 18 }] }, by);
          if (created.error) return created.error;
          invoiceNumber = created.number ?? undefined;
        }
        const billed = invoiceNumber ? `, billed on ${invoiceNumber}` : "";
        set((state) => ({
          milestones: state.milestones.map((m) => m.id === id ? { ...m, status: "accepted", acceptedBy: by, invoiceNumber } : m),
          trail: withTrail(state.trail, trailEntry("projects", TODAY, by, `Accepted milestone ${milestone.name}${billed}`)),
        }));
        return null;
      },
      raiseDispute: (id, reason, by) => {
        const milestone = get().milestones.find((m) => m.id === id);
        if (!milestone) return "Milestone not found.";
        if (milestone.status === "accepted") return "An accepted milestone is already billed; raise a credit note in Finance instead.";
        if (milestone.dispute) return "This milestone is already in dispute.";
        if (reason.trim().length < 5) return "Say what is in dispute.";
        set((state) => ({
          milestones: state.milestones.map((m) => m.id === id ? { ...m, dispute: { reason: reason.trim(), raisedBy: by, date: TODAY } } : m),
          trail: withTrail(state.trail, trailEntry("projects", TODAY, by, `Disputed milestone ${milestone.name}: ${reason.trim()}`)),
        }));
        return null;
      },
      resolveDispute: (id, by) => {
        const milestone = get().milestones.find((m) => m.id === id);
        if (!milestone) return "Milestone not found.";
        if (!milestone.dispute) return "This milestone is not in dispute.";
        set((state) => ({
          milestones: state.milestones.map((m) => m.id === id ? { ...m, dispute: undefined } : m),
          trail: withTrail(state.trail, trailEntry("projects", TODAY, by, `Resolved the dispute on milestone ${milestone.name}`)),
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
      closeProject: async (id, by) => {
        const project = get().projects.find((p) => p.id === id);
        if (!project) return "Project not found.";
        if (project.status === "done") return "This project is already closed.";
        const { timesheets, rates } = get();
        const { cost } = projectProfitability(project, get().milestones, timesheets, rates);
        const unused = Math.max(0, Math.round((project.budget - cost) * 100) / 100);
        const released = unused > 0 ? await moveBudget("release", project.budgetLineId, unused, `Project: ${project.name}`, by, TODAY) : null;
        if (released) return `Budget: ${released}`;
        const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;
        const milestones = get().milestones.filter((m) => m.projectId === id);
        const accepted = milestones.filter((m) => m.status === "accepted");
        const versions = get().versions.filter((v) => v.projectId === id).sort((a, b) => a.number - b.number);
        const approvedChanges = get().changes.filter((c) => c.projectId === id && c.status === "approved").length;
        const profit = projectProfitability(project, milestones, timesheets, rates);
        const closure: ProjectClosure = {
          projectId: id,
          closedOn: TODAY,
          closedBy: by,
          lines: [
            { label: "Milestones accepted", value: `${accepted.length} of ${milestones.length}, billed ${money(accepted.reduce((sum, m) => sum + m.amount, 0))}` },
            { label: "Budget", value: `${money(project.budget)}; cost of logged hours ${money(profit.cost)}; released to the fund line ${money(unused)}` },
            { label: "Hours logged", value: `${profit.hours} hours` },
            { label: "Plan versions", value: `${versions.length} (${approvedChanges} approved change${approvedChanges === 1 ? "" : "s"})` },
            { label: "Margin on billing", value: profit.margin === null ? "no billing recorded" : `${profit.margin}%` },
          ],
        };
        set((state) => ({
          projects: state.projects.map((p) => p.id === id ? { ...p, status: "done" } : p),
          closures: [...state.closures.filter((c) => c.projectId !== id), closure],
          trail: withTrail(state.trail, trailEntry("projects", TODAY, by, `Closed ${project.name}; ${money(unused)} of budget released`)),
        }));
        return null;
      },
      decideChange: (id, approve, by) => {
        const change = get().changes.find((c) => c.id === id);
        if (!change) return "Change request not found.";
        if (change.requestedBy === by) return "The person who asked for the change cannot approve it.";
        const project = get().projects.find((p) => p.id === change.projectId);
        const earlier = get().versions.filter((v) => v.projectId === change.projectId);
        // The first approved change keeps the plan as it was before it, so the original is never lost.
        const original: PlanVersion[] = approve && project && earlier.length === 0
          ? [{ id: `pv-${Date.now()}-0`, projectId: change.projectId, number: 1, budget: project.budget, end: project.end, note: "Plan before its first recorded change", by: project.createdBy, date: TODAY }]
          : [];
        const base = [...earlier, ...original];
        const next = approve && project
          ? [{ id: `pv-${Date.now()}`, projectId: change.projectId, number: base.length + 1, budget: Math.max(0, project.budget + change.budgetChange), end: addDays(project.end, change.dayChange), note: change.description, by, date: TODAY }]
          : [];
        set((state) => ({
          versions: [...state.versions, ...original, ...next],
          trail: withTrail(state.trail, trailEntry("projects", TODAY, by, `${approve ? "Approved" : "Rejected"} change for ${state.projects.find((p) => p.id === change.projectId)?.name ?? "a project"}: ${change.description}`)),
          changes: state.changes.map((c) => c.id === id ? { ...c, status: approve ? "approved" : "rejected", decidedBy: by } : c),
          projects: approve ? state.projects.map((p) => p.id === change.projectId ? { ...p, budget: Math.max(0, p.budget + change.budgetChange), end: addDays(p.end, change.dayChange) } : p) : state.projects,
        }));
        return null;
      },
    }),
    { name: scoped("janus.projects.v1"), storage: createJSONStorage(() => workspaceStorage), merge: (persisted, current) => withoutDemoRecords(mergeServerOwned<ProjectsState>(["trail"])(persisted, current), demoSeed()) },
  ),
);
