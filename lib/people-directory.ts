"use client";

import { useApi } from "@/lib/api/use-api";

type PersonRow = { id: number; name: string };

/** The people a company can pick: everyone active in it on the server, names only. */
export function usePeople(): { id: string; name: string }[] {
  const people = useApi<PersonRow[]>("/team/people");
  return (people.data ?? []).map((person) => ({ id: String(person.id), name: person.name }));
}
