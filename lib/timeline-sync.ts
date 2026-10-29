"use client";

import { api, APIError } from "@/lib/api/client";
import { demoMode } from "@/lib/demo-mode";
import { type DirectoryPerson, matchPeople, type PersonRef, type TeamMatch } from "@/lib/timeline-team";

/**
 * Creates a project's timeline if it is missing, then adds the matched team members to it. Only additions
 * happen here: removing someone stays a deliberate act on the timeline, so a name change cannot silently
 * take a person off a project. Unmatched names come back so a manager can fix them.
 */
export async function syncProjectTimeline(
  project: { id: string; name: string },
  people: PersonRef[],
): Promise<{ added: number; unmatched: TeamMatch["unmatched"]; links: Record<string, string> } | null> {
  if (demoMode) return null;
  const key = encodeURIComponent(project.id);
  await api("/project-timelines", {
    method: "POST",
    body: JSON.stringify({ project_key: project.id, name: project.name }),
  });
  // People with a recorded account need no matching. Only the rest are matched by name.
  const recorded = people.filter((p) => p.userId);
  const byName = people.filter((p) => !p.userId).map((p) => p.name);
  const directory = byName.length > 0 ? await api<DirectoryPerson[]>("/project-timelines/directory") : [];
  const matchedByName = matchPeople(byName, directory);
  const members = await api<{ user_id: string }[]>(`/project-timelines/${key}/members`);
  const onTimeline = new Set(members.map((m) => m.user_id));
  const links: Record<string, string> = {};
  for (const m of matchedByName.matched) links[m.name] = m.user_id;
  for (const p of recorded) links[p.name] = p.userId as string;
  let added = 0;
  for (const userId of new Set(Object.values(links))) {
    if (onTimeline.has(userId)) continue;
    try {
      await api(`/project-timelines/${key}/members`, {
        method: "POST",
        body: JSON.stringify({ user_id: userId }),
      });
      added += 1;
    } catch (error) {
      // A person added by someone else in the meantime is already on the timeline; anything else is reported.
      if (!(error instanceof APIError && error.code === "already_member")) throw error;
    }
  }
  return { added, unmatched: matchedByName.unmatched, links };
}

export function describeUnmatched(unmatched: TeamMatch["unmatched"]): string {
  return unmatched.map((u) => `${u.name} (${u.reason})`).join(", ");
}


/** Closes a project's timeline on the server. A project that never had a timeline is not an error. */
export async function archiveProjectTimeline(projectId: string): Promise<void> {
  if (demoMode) return;
  try {
    await api(`/project-timelines/${encodeURIComponent(projectId)}/archive`, { method: "POST" });
  } catch (error) {
    if (error instanceof APIError && (error.status === 404 || error.code === "already_archived")) return;
    throw error;
  }
}
