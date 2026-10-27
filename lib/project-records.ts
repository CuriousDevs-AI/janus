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
