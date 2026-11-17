"use client";

import { useMemo } from "react";
import type { Approval, AppNotification, Ticket } from "@/lib/types";
import type { WhatsAppConversation } from "@/lib/api/types";

/**
 * What the signed-in person may see across the CRM.
 * Without demo personas the real API server handles scoping, so the client shows everything it receives.
 */
export function useCrmAccess() {
  return useMemo(() => {
    return {
      account: undefined,
      scope: "all" as const,
      customerVisible: (_customerId: string) => true,
      tickets: (list: Ticket[]) => list,
      ticketVisible: (_ticket: Ticket) => true,
      approvals: (list: Approval[]) => list,
      approvalVisible: (_approval: Approval) => true,
      notifications: (list: AppNotification[]) => list,
      conversations: (list: WhatsAppConversation[]) => list,
    };
  }, []);
}
