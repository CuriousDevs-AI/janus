"use client";

import { useSession } from "@/components/auth/session-provider";
import { CrmProvider } from "@/lib/hooks/use-crm-context";

export function CrmProviderBridge({ children }: { children: React.ReactNode }) {
  const session = useSession();
  return (
    <CrmProvider crms={session.crms ?? []} permissions={session.permissions}>
      {children}
    </CrmProvider>
  );
}
