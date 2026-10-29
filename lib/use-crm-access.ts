"use client";

import { demoMode } from "@/lib/demo-mode";
import { useMemo } from "react";
import type { Approval, AppNotification, Ticket } from "@/lib/types";
import type { WhatsAppConversation } from "@/lib/api/types";
import { useDemoAccount } from "@/lib/demo-persona";
import { useDemoCrmStore } from "@/lib/demo-backend/crm-store";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { visibleOwners } from "@/lib/crm-scope";
import { approvals as seedApprovals } from "@/lib/mock-data/approvals";
import { tickets as seedTickets } from "@/lib/mock-data/tickets";
import { deals as seedDeals } from "@/lib/mock-data/deals";

/** Older records and API-shaped ones both use cus-N. Compare by the number so a stray prefix never hides someone. */
const key = (id: string) => id.replace(/^(cus|demo-customer)-/, "");

/**
 * What the signed-in person may see across the CRM, from the one rule everywhere:
 * the Owner sees all, a manager sees their team's, a rep sees their own, support sees their tickets.
 */
export function useCrmAccess() {
  const account = useDemoAccount();
  const leads = useDemoCrmStore((state) => state.leads);
  const employees = useHrPeopleStore((state) => state.employees);
  return useMemo(() => {
    void employees; // a reporting-line change changes who is on someone's team
    const owners = visibleOwners(account);
    const me = account?.crmUserId ?? "";
    const support = account?.crm === "support";
    // A real account has no demo persona, so the screens show what the server returns (the server scopes leads).
    const everything = !demoMode || owners === null;
    const customerVisible = (customerId: string) => everything || (!support && leads.some((lead) => key(lead.customerId) === key(customerId) && owners!.has(lead.ownerId ?? "")));
    const ticketVisible = (ticket: Ticket) => everything || (support ? !ticket.assigneeId || ticket.assigneeId === me : customerVisible(ticket.customerId));
    const approvalVisible = (approval: Approval) => everything || (!support && account?.crm === "team" && (customerVisible(approval.customerId) || owners!.has(approval.requestedById)));
    const supportCustomers = new Set(seedTickets.filter(ticketVisible).map((ticket) => key(ticket.customerId)));
    const notificationCustomer = (notification: AppNotification) => {
      const href = notification.href ?? "";
      const id = href.split("/").pop() ?? "";
      if (href.startsWith("/customers/")) return id;
      if (href.startsWith("/tickets/")) return seedTickets.find((item) => item.id === id)?.customerId;
      if (href.startsWith("/approvals/")) return seedApprovals.find((item) => item.id === id)?.customerId;
      if (href.startsWith("/deals/")) return seedDeals.find((item) => item.id === id)?.customerId;
      return undefined;
    };
    return {
      account,
      scope: account?.crm ?? "none",
      customerVisible,
      tickets: (list: Ticket[]) => list.filter(ticketVisible),
      ticketVisible,
      approvals: (list: Approval[]) => list.filter(approvalVisible),
      approvalVisible,
      notifications: (list: AppNotification[]) => list.filter((item) => {
        if (everything) return true;
        const customer = notificationCustomer(item);
        if (!customer) return false;
        return support ? supportCustomers.has(key(customer)) : customerVisible(customer);
      }),
      conversations: (list: WhatsAppConversation[]) => list.filter((item) => support ? supportCustomers.has(key(item.contactId)) : customerVisible(item.contactId)),
    };
  }, [account, leads, employees]);
}
