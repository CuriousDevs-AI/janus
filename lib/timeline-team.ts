/**
 * Who belongs on a project's timeline. Project people are stored as names today, so each name is matched to
 * one active company account. A name that matches nobody, or more than one person, is flagged for a manager to
 * fix; it is never guessed.
 */

export type DirectoryPerson = { user_id: string; name: string };

/** A project person, with the company account if one is already recorded. */
export type PersonRef = { name: string; userId?: string };

/** The people a project involves, each with its recorded account when there is one. */
export function projectPersonRefs(
  project: { owner: string; ownerUserId?: string },
  tasks: { assignee: string; assigneeUserId?: string; projectId: string }[],
  allocations: { person: string; userId?: string; projectId: string }[],
  projectId: string,
): PersonRef[] {
  const refs: PersonRef[] = [
    { name: project.owner, userId: project.ownerUserId },
    ...tasks.filter((t) => t.projectId === projectId).map((t) => ({ name: t.assignee, userId: t.assigneeUserId })),
    ...allocations.filter((a) => a.projectId === projectId).map((a) => ({ name: a.person, userId: a.userId })),
  ];
  const byName = new Map<string, PersonRef>();
  for (const ref of refs) {
    const name = ref.name.trim();
    if (!name) continue;
    const existing = byName.get(name);
    if (!existing || (!existing.userId && ref.userId)) byName.set(name, { name, userId: ref.userId });
  }
  return [...byName.values()];
}

export type TeamMatch = {
  matched: { name: string; user_id: string }[];
  unmatched: { name: string; reason: "no account" | "more than one account" }[];
};

const clean = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

/** Matches each name to one company account, by name, ignoring case and extra spaces. */
export function matchPeople(names: string[], directory: DirectoryPerson[]): TeamMatch {
  const matched: TeamMatch["matched"] = [];
  const unmatched: TeamMatch["unmatched"] = [];
  for (const name of names) {
    const key = clean(name);
    const found = directory.filter((person) => clean(person.name) === key);
    if (found.length === 1) matched.push({ name, user_id: found[0].user_id });
    else if (found.length === 0) unmatched.push({ name, reason: "no account" });
    else unmatched.push({ name, reason: "more than one account" });
  }
  return { matched, unmatched };
}
