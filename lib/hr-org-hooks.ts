import { useHrOrgStore, type OrgPermission } from "@/lib/stores/hr-org-store";
import { canManageHr, demoActorId } from "@/lib/hr-people-access";
import { hasPermission } from "@/lib/hr-org";
import type { HrDemoRole } from "@/lib/types";

/** HR and the owner, unless a role change took this permission away from the person they act as. */
export function useCan(role: HrDemoRole, permission: OrgPermission) {
  const { departments, roles, assignments } = useHrOrgStore();
  return canManageHr(role) && hasPermission({ departments, roles, assignments }, demoActorId(role), permission);
}
