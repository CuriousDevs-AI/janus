"use client";

import { useApi } from "@/lib/api/use-api";
import { demoMode } from "@/lib/demo-mode";
import { users } from "@/lib/mock-data";

type PersonRow = { id: number; name: string };

/** The people a company can pick: everyone active in it on the server, names only, which any member
 * may read (the member list itself needs members:manage). The demo's own team is used only in demo mode. */
export function usePeople(): { id: string; name: string }[] {
  const people = useApi<PersonRow[]>(demoMode ? null : "/team/people");
  if (demoMode) return users.map((user) => ({ id: user.id, name: user.name }));
  return (people.data ?? []).map((person) => ({ id: String(person.id), name: person.name }));
}
