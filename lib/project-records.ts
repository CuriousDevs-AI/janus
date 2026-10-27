"use client";

import { api, APIError } from "@/lib/api/client";
import { demoMode } from "@/lib/demo-mode";

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
    if (error instanceof APIError && error.status === 404) return;
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
): Promise<Record<string, string>> {
  if (demoMode) return {};
  const directory = await api<{ user_id: string; name: string }[]>("/project-timelines/directory");
  const key = ownerName.trim().replace(/\s+/g, " ").toLowerCase();
  const matches = directory.filter((person) => person.name.trim().replace(/\s+/g, " ").toLowerCase() === key);
  const ownerUserId = matches.length === 1 ? matches[0].user_id : undefined;
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
