"use client";

import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { useSession } from "@/components/auth/session-provider";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/permissions";

/** Tickets are worked by people who can open Customer Support; the API checks the same permission. */
export function useCanWorkTickets() {
  const session = useSession();
  return can(session, "leads:read_team");
}

export function TicketsNotAvailable() {
  return (
    <div className="mx-auto max-w-xl p-8">
      <EmptyState
        icon={LifeBuoy}
        title="Tickets are handled by your support team"
        description="Your role does not include support tickets. Ask your manager if a customer needs help with one."
        action={<Button asChild variant="secondary"><Link href="/leads">Back to leads</Link></Button>}
      />
    </div>
  );
}
