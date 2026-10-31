"use client";

import { api, APIError } from "@/lib/api/client";
import { demoMode } from "@/lib/demo-mode";

/** The project has no record on the server yet (it was created before the server mirror), so the change stays on this screen. */
export class ProjectNotOnServer extends Error {
  constructor() {
    super("This project is not on the server yet, so this change is saved on this screen only.");
  }
}

/**
 * Keeps the server's typed project record in step with the project the screens show. The screens still save
 * locally (the budget draw happens in the finance store), so this is a mirror: create it when the project is
 * created, mark it done when the project closes. A failure is reported by the caller and never undoes the local change.
 */
export async function createProjectRecord(project: {
  id: string;
  name: string;
  client: string;
  status: string;
  budget: number;
  start: string;
  end: string;
}): Promise<void> {
  if (demoMode) return;
  await api("/project-records", {
    method: "POST",
    body: JSON.stringify({
      external_key: project.id,
      name: project.name,
      client: project.client || "Internal",
      status: project.status === "done" ? "done" : project.status === "active" ? "active" : "planned",
      budget: project.budget.toFixed(2),
      start_on: project.start,
      end_on: project.end,
    }),
  });
}

export async function setProjectRecordStatus(projectId: string, status: "planned" | "active" | "on hold" | "done"): Promise<void> {
  if (demoMode) return;
  try {
    await api(`/project-records/${encodeURIComponent(projectId)}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  } catch (error) {
    // A project created before this mirror existed has no record yet; that is not an error to report.
    if (error instanceof APIError && error.status === 404) throw new ProjectNotOnServer();
    throw error;
  }
}

/**
 * Mirrors a new project and records its owner's company account, matched by name. Returns the links so the
 * screen data can store the same account ID. A name with no single account is left unlinked, not guessed.
 */
export async function mirrorNewProject(
  project: { id: string; name: string; client: string; status: string; budget: number; start: string; end: string },
  ownerName: string,
  chosenOwnerId?: string,
): Promise<Record<string, string>> {
  if (demoMode) return {};
  // A person picked from the directory is used as they are. Otherwise the name is matched, and never guessed.
  let ownerUserId = chosenOwnerId;
  if (!ownerUserId) {
    const directory = await api<{ user_id: string; name: string }[]>("/project-timelines/directory");
    const key = ownerName.trim().replace(/\s+/g, " ").toLowerCase();
    const matches = directory.filter((person) => person.name.trim().replace(/\s+/g, " ").toLowerCase() === key);
    ownerUserId = matches.length === 1 ? matches[0].user_id : undefined;
  }
  await api("/project-records", {
    method: "POST",
    body: JSON.stringify({
      external_key: project.id,
      name: project.name,
      client: project.client || "Internal",
      status: project.status === "active" ? "active" : "planned",
      budget: project.budget.toFixed(2),
      start_on: project.start,
      end_on: project.end,
      owner_user_id: ownerUserId ?? null,
    }),
  });
  return ownerUserId ? { [ownerName.trim()]: ownerUserId } : {};
}

/**
 * Brings the core fields of projects that exist on the server into the screen data: name, client, status,
 * budget and dates. Projects only on the screens are left as they are. Milestones, tasks and the budget line
 * stay where they are until those move to the server too.
 */
export async function refreshProjectRecords(): Promise<void> {
  if (demoMode) return;
  const records = await api<
    { external_key: string; name: string; client: string; status: string; budget: string; start_on: string; end_on: string }[]
  >("/project-records");
  const { useProjectsStore } = await import("@/lib/stores/projects-store");
  const byKey = new Map(records.map((r) => [r.external_key, r]));
  useProjectsStore.setState((state) => ({
    projects: state.projects.map((p) => {
      const r = byKey.get(p.id);
      if (!r) return p;
      return {
        ...p,
        name: r.name,
        client: r.client,
        status: r.status as typeof p.status,
        budget: Number(r.budget),
        start: r.start_on,
        end: r.end_on,
      };
    }),
  }));
}

/** Mirrors a new milestone of a project that has a server record. A project without one is skipped quietly. */
export async function mirrorMilestone(
  projectId: string,
  milestone: { id: string; name: string; due: string; amount: number },
): Promise<void> {
  if (demoMode) return;
  try {
    await api(`/project-records/${encodeURIComponent(projectId)}/milestones`, {
      method: "POST",
      body: JSON.stringify({ external_key: milestone.id, name: milestone.name, due_on: milestone.due, amount: milestone.amount.toFixed(2) }),
    });
  } catch (error) {
    if (error instanceof APIError && error.code === "already_exists") return;
    if (error instanceof APIError && error.status === 404) throw new ProjectNotOnServer();
    throw error;
  }
}

/** Moves a mirrored milestone to done or accepted on the server. The server enforces the same rules as the screen. */
export async function mirrorMilestoneStatus(projectId: string, milestoneId: string, status: "done" | "accepted"): Promise<void> {
  if (demoMode) return;
  try {
    await api(`/project-records/${encodeURIComponent(projectId)}/milestones/${encodeURIComponent(milestoneId)}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    });
  } catch (error) {
    if (error instanceof APIError && error.status === 404) throw new ProjectNotOnServer();
    throw error;
  }
}

/** Brings the status of mirrored milestones of one project into the screen data. */
export async function refreshMilestones(projectId: string): Promise<void> {
  if (demoMode) return;
  let rows: { external_key: string; status: string; name: string; amount: string }[];
  try {
    rows = await api(`/project-records/${encodeURIComponent(projectId)}/milestones`);
  } catch (error) {
    if (error instanceof APIError && error.status === 404) throw new ProjectNotOnServer();
    throw error;
  }
  const { useProjectsStore } = await import("@/lib/stores/projects-store");
  const byKey = new Map(rows.map((r) => [r.external_key, r]));
  useProjectsStore.setState((state) => ({
    milestones: state.milestones.map((m) => {
      const r = byKey.get(m.id);
      if (!r) return m;
      return { ...m, status: r.status as typeof m.status, name: r.name, amount: Number(r.amount) };
    }),
  }));
}

async function accountFor(name: string): Promise<string | undefined> {
  const directory = await api<{ user_id: string; name: string }[]>("/project-timelines/directory");
  const key = name.trim().replace(/\s+/g, " ").toLowerCase();
  const matches = directory.filter((p) => p.name.trim().replace(/\s+/g, " ").toLowerCase() === key);
  return matches.length === 1 ? matches[0].user_id : undefined;
}

/** Mirrors a new task. The assignee is matched to one company account by name; an unmatched name is left unlinked. */
export async function mirrorTask(
  projectId: string,
  task: { id: string; title: string; milestoneId: string | null; assignee: string; due: string },
): Promise<void> {
  if (demoMode) return;
  try {
    await api(`/project-records/${encodeURIComponent(projectId)}/tasks`, {
      method: "POST",
      body: JSON.stringify({
        external_key: task.id,
        title: task.title,
        milestone_key: task.milestoneId,
        assignee_user_id: (await accountFor(task.assignee)) ?? null,
        due_on: task.due,
      }),
    });
  } catch (error) {
    if (error instanceof APIError && error.code === "already_exists") return;
    if (error instanceof APIError && error.status === 404) throw new ProjectNotOnServer();
    throw error;
  }
}

export async function mirrorTaskStatus(projectId: string, taskId: string, status: "todo" | "doing" | "done"): Promise<void> {
  if (demoMode) return;
  try {
    await api(`/project-records/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    });
  } catch (error) {
    if (error instanceof APIError && error.status === 404) throw new ProjectNotOnServer();
    throw error;
  }
}

/** Brings the status of mirrored tasks of one project into the screen data. */
export async function refreshTasks(projectId: string): Promise<void> {
  if (demoMode) return;
  let rows: { external_key: string; status: string }[];
  try {
    rows = await api(`/project-records/${encodeURIComponent(projectId)}/tasks`);
  } catch (error) {
    if (error instanceof APIError && error.status === 404) throw new ProjectNotOnServer();
    throw error;
  }
  const { useProjectsStore } = await import("@/lib/stores/projects-store");
  const byKey = new Map(rows.map((r) => [r.external_key, r.status]));
  useProjectsStore.setState((state) => ({
    tasks: state.tasks.map((t) => (byKey.has(t.id) ? { ...t, status: byKey.get(t.id) as typeof t.status } : t)),
  }));
}

let repairing: Promise<number> | null = null;

/**
 * Copies to the server any project that exists only on the screens: its record and its timeline. A
 * project is saved on the screens first, and if the server was out of reach then, its milestones and
 * timeline had nowhere to live. Runs once at a time; returns how many projects were copied.
 */
export function repairMissingProjects(): Promise<number> {
  if (demoMode) return Promise.resolve(0);
  repairing ??= (async () => {
    const records = await api<{ external_key: string }[]>("/project-records");
    const known = new Set(records.map((record) => record.external_key));
    const { useProjectsStore } = await import("@/lib/stores/projects-store");
    const { syncProjectTimeline } = await import("@/lib/timeline-sync");
    const { projectPersonRefs } = await import("@/lib/timeline-team");
    let copied = 0;
    for (const project of useProjectsStore.getState().projects.filter((item) => !known.has(item.id))) {
      const links = await mirrorNewProject(project, project.owner);
      if (Object.keys(links).length > 0) useProjectsStore.getState().linkPeople(project.id, links);
      await syncProjectTimeline(project, projectPersonRefs(project, [], [], project.id));
      copied += 1;
    }
    return copied;
  })().finally(() => {
    repairing = null;
  });
  return repairing;
}
