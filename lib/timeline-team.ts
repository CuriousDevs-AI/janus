/**
 * Who belongs on a project's timeline. Project people are stored as names today, so each name is matched to
 * one active company account. A name that matches nobody, or more than one person, is flagged for a manager to
 * fix; it is never guessed.
 */

export type DirectoryPerson = { user_id: string; name: string };

export type TeamMatch = {
  matched: { name: string; user_id: string }[];
  unmatched: { name: string; reason: "no account" | "more than one account" }[];
};

const clean = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

/** The people a project involves: its owner, its task assignees, and anyone with an allocation. */
export function projectPeople(
  project: { owner: string },
  tasks: { assignee: string; projectId: string }[],
  allocations: { person: string; projectId: string }[],
  projectId: string,
): string[] {
  const names = [
    project.owner,
    ...tasks.filter((t) => t.projectId === projectId).map((t) => t.assignee),
    ...allocations.filter((a) => a.projectId === projectId).map((a) => a.person),
  ];
  return [...new Set(names.map((n) => n.trim()).filter(Boolean))];
}

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
