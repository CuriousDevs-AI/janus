import { useMemo } from "react";
import { useHrOperationsStore } from "@/lib/stores/hr-operations-store";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { activeTypes, leaveBalance, limitedTypes, typeName } from "@/lib/hr-leave";
import { todayIst } from "@/lib/hr-import";

/** Leave types, names and balances for the current settings, requests and HR adjustments. */
export function useLeaveTypes() {
  const settings = useHrOperationsStore((state) => state.settings);
  const adjustments = useHrOperationsStore((state) => state.leaveAdjustments);
  const requests = useHrPeopleStore((state) => state.leaveRequests);
  return useMemo(() => ({
    settings,
    adjustments,
    name: (id: string) => typeName(settings, id),
    active: activeTypes(settings),
    limited: limitedTypes(settings),
    balance: (employeeId: string, type: string, ignoreId?: string) => leaveBalance(requests, employeeId, type, settings, todayIst(), ignoreId, adjustments),
  }), [settings, adjustments, requests]);
}
