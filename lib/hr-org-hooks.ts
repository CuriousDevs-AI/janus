import { useHrOrgStore, type OrgPermission } from "@/lib/stores/hr-org-store";
import { canManageHr, demoActorId } from "@/lib/hr-people-access";
import { hasPermission } from "@/lib/hr-org";
import type { HrDemoRole } from "@/lib/types";
import { demoMode } from "@/lib/demo-mode";

/** HR and the owner, unless a role change took this permission away from the person they act as. */
export function useCan(role: HrDemoRole, permission: OrgPermission) {
  const { departments, roles, assignments } = useHrOrgStore();
  // A real account's owner has no demo actor, so the owner holds every HR permission there.
  if (!demoMode && role === "owner") return true;
  return canManageHr(role) && hasPermission({ departments, roles, assignments }, demoActorId(role), permission);
}
