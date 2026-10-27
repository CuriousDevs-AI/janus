"use client";

import { api, APIError } from "@/lib/api/client";
import { demoMode } from "@/lib/demo-mode";
import { type DirectoryPerson, matchPeople, type TeamMatch } from "@/lib/timeline-team";

/**
 * Creates a project's timeline if it is missing, then adds the matched team members to it. Only additions
 * happen here: removing someone stays a deliberate act on the timeline, so a name change cannot silently
 * take a person off a project. Unmatched names come back so a manager can fix them.
 */
export async function syncProjectTimeline(
  project: { id: string; name: string },
  names: string[],
): Promise<{ added: number; unmatched: TeamMatch["unmatched"] } | null> {
  if (demoMode) return null;
  const key = encodeURIComponent(project.id);
  await api("/project-timelines", {
    method: "POST",
    body: JSON.stringify({ project_key: project.id, name: project.name }),
  });
  const [directory, members] = await Promise.all([
    api<DirectoryPerson[]>("/project-timelines/directory"),
    api<{ user_id: string }[]>(`/project-timelines/${key}/members`),
  ]);
  const onTimeline = new Set(members.map((m) => m.user_id));
  const { matched, unmatched } = matchPeople(names, directory);
  let added = 0;
  for (const person of matched) {
    if (onTimeline.has(person.user_id)) continue;
    try {
      await api(`/project-timelines/${key}/members`, {
        method: "POST",
        body: JSON.stringify({ user_id: person.user_id }),
      });
      added += 1;
    } catch (error) {
      // A person added by someone else in the meantime is already on the timeline; anything else is reported.
      if (!(error instanceof APIError && error.code === "already_member")) throw error;
    }
  }
  return { added, unmatched };
}

export function describeUnmatched(unmatched: TeamMatch["unmatched"]): string {
  return unmatched.map((u) => `${u.name} (${u.reason})`).join(", ");
}

