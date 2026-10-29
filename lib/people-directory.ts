"use client";

import { useApi } from "@/lib/api/use-api";
import { demoMode } from "@/lib/demo-mode";
import { users } from "@/lib/mock-data";

type MemberRow = { user_id: string; name: string };

/** The people a company can pick: its members on the server. The demo's own team is used only in demo mode. */
export function usePeople(): { id: string; name: string }[] {
  const members = useApi<MemberRow[]>(demoMode ? null : "/members");
  if (demoMode) return users.map((user) => ({ id: user.id, name: user.name }));
  return (members.data ?? []).map((member) => ({ id: member.user_id, name: member.name }));
}
